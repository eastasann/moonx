import { schema } from "@moonx/db";
import {
  MAX_SHORT_TEXT,
  type PutSelfAnalysisAnswerBody,
  type TemplateRef,
  type TemplateSection,
  type Versioned,
} from "@moonx/schemas";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { ApiError, validationFailed } from "../errors";
import { selfAnalysisAnswerSnapshot } from "../history/snapshots";
import { type HistoryActor, withHistory } from "../history/with-history";
import type { Executor, Tx } from "./db";
import { iso, isoOrNull, UNSAVED } from "./dto";
import {
  latestPublishedVersion,
  loadTemplateRef,
  loadTemplateSections,
  type TemplateQuestionRow,
} from "./template";
import { loadUserRefs } from "./users";
import { hasText } from "./validation-data";
import { checkLockLazily, lostInsertRace } from "./validation-write";

type AnalysisRow = typeof schema.selfAnalyses.$inferSelect;
type AnswerRow = typeof schema.selfAnalysisAnswers.$inferSelect;

export type SelfAnalysisStatus = AnalysisRow["status"];

/** SDD 5.8 SelfAnalysisHome. */
export interface SelfAnalysisHome {
  id: string;
  status: SelfAnalysisStatus;
  completedAt: string | null;
  currency: string;
  template: TemplateRef;
  answered: number;
  total: number;
  sections: { key: string; title: string; answered: number; total: number }[];
  firstUnanswered: { sectionKey: string; questionKey: string } | null;
  shares: { workspace: { id: string; name: string }; sharedAt: string }[];
  shareableWorkspaces: { id: string; name: string }[];
}

/** SDD 5.8 SelfAnalysisAnswer. */
export interface SelfAnalysisAnswer extends Versioned {
  questionKey: string;
  text: string | null;
  amount: number | null;
  commentCounts: { workspaceId: string; workspaceName: string; count: number }[];
}

/** An answer counts when it has text, or an amount for an amount-and-reason question. */
export const isAnswered = (row: Pick<AnswerRow, "text" | "amount"> | undefined) =>
  row != null && (hasText(row.text) || row.amount != null);

/**
 * The caller's self analysis; the first call creates it on the newest published version (SDD 5.8
 * S1). The unique `user_id` makes two first calls from two devices end with one row.
 */
export async function ensureSelfAnalysis(db: Executor, userId: string): Promise<AnalysisRow> {
  const find = async () =>
    (await db.select().from(schema.selfAnalyses).where(eq(schema.selfAnalyses.userId, userId)))[0];
  const existing = await find();
  if (existing) return existing;
  const version = await latestPublishedVersion(db, "self_analysis");
  await db
    .insert(schema.selfAnalyses)
    .values({ userId, templateVersionId: version.id })
    .onConflictDoNothing();
  return (await find()) as AnalysisRow;
}

async function loadAnswerRows(db: Executor, analysisId: string): Promise<AnswerRow[]> {
  return db
    .select()
    .from(schema.selfAnalysisAnswers)
    .where(eq(schema.selfAnalysisAnswers.selfAnalysisId, analysisId));
}

/** S1 GET / PATCH payload. */
export async function loadSelfAnalysisHome(
  db: Executor,
  userId: string,
  analysis: AnalysisRow,
): Promise<SelfAnalysisHome> {
  const [sections, answers, template, shares, memberships] = await Promise.all([
    loadTemplateSections(db, analysis.templateVersionId),
    loadAnswerRows(db, analysis.id),
    loadTemplateRef(db, analysis.templateVersionId),
    db
      .select({
        id: schema.workspaces.id,
        name: schema.workspaces.name,
        sharedAt: schema.selfAnalysisShares.sharedAt,
      })
      .from(schema.selfAnalysisShares)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.selfAnalysisShares.workspaceId))
      .where(eq(schema.selfAnalysisShares.selfAnalysisId, analysis.id))
      .orderBy(asc(schema.selfAnalysisShares.sharedAt)),
    db
      .select({ id: schema.workspaces.id, name: schema.workspaces.name })
      .from(schema.memberships)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.memberships.workspaceId))
      .where(
        and(
          eq(schema.memberships.userId, userId),
          inArray(schema.memberships.role, ["owner", "member"]),
          eq(schema.workspaces.isPersonal, false),
        ),
      )
      .orderBy(asc(schema.workspaces.name)),
  ]);
  const rowOf = new Map(answers.map((a) => [a.questionKey, a]));
  let answered = 0;
  let total = 0;
  let firstUnanswered: SelfAnalysisHome["firstUnanswered"] = null;
  const summary = sections.map(({ section }) => {
    let sectionAnswered = 0;
    for (const question of section.questions) {
      total += 1;
      if (isAnswered(rowOf.get(question.key))) {
        sectionAnswered += 1;
        answered += 1;
      } else if (!firstUnanswered) {
        firstUnanswered = { sectionKey: section.key, questionKey: question.key };
      }
    }
    return {
      key: section.key,
      title: section.title,
      answered: sectionAnswered,
      total: section.questions.length,
    };
  });
  return {
    id: analysis.id,
    status: analysis.status,
    completedAt: isoOrNull(analysis.completedAt),
    currency: analysis.currency,
    template,
    answered,
    total,
    sections: summary,
    firstUnanswered,
    shares: shares.map((s) => ({
      workspace: { id: s.id, name: s.name },
      sharedAt: iso(s.sharedAt),
    })),
    shareableWorkspaces: memberships,
  };
}

/** Comments on this analysis's answers per workspace it is shared with (design-spec 6.0.4). */
async function loadOwnerCommentCounts(db: Executor, analysisId: string) {
  const rows = await db
    .select({
      key: schema.comments.targetKey,
      workspaceId: schema.comments.workspaceId,
      workspaceName: schema.workspaces.name,
      n: count(),
    })
    .from(schema.comments)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.comments.workspaceId))
    .innerJoin(
      schema.selfAnalysisShares,
      and(
        eq(schema.selfAnalysisShares.workspaceId, schema.comments.workspaceId),
        eq(schema.selfAnalysisShares.selfAnalysisId, analysisId),
      ),
    )
    .where(
      and(
        eq(schema.comments.targetType, "self_analysis_answer"),
        eq(schema.comments.targetId, analysisId),
        isNull(schema.comments.deletedAt),
      ),
    )
    .groupBy(schema.comments.targetKey, schema.comments.workspaceId, schema.workspaces.name);
  const byKey = new Map<string, SelfAnalysisAnswer["commentCounts"]>();
  for (const row of rows) {
    if (!row.key) continue;
    const list = byKey.get(row.key) ?? [];
    list.push({ workspaceId: row.workspaceId, workspaceName: row.workspaceName, count: row.n });
    byKey.set(row.key, list);
  }
  return byKey;
}

/** SDD 5.8 SelfAnalysisAnswer for each question, in order; unanswered ones have `lockVersion: 0`. */
export async function buildSelfAnalysisAnswers(
  db: Executor,
  analysis: AnalysisRow,
  questionKeys: string[],
): Promise<SelfAnalysisAnswer[]> {
  const [rows, counts, owner] = await Promise.all([
    loadAnswerRows(db, analysis.id),
    loadOwnerCommentCounts(db, analysis.id),
    loadUserRefs(db, [analysis.userId], null),
  ]);
  const rowOf = new Map(rows.map((a) => [a.questionKey, a]));
  return questionKeys.map((key) => {
    const row = rowOf.get(key);
    return {
      ...(row
        ? {
            lockVersion: row.lockVersion,
            updatedAt: iso(row.updatedAt),
            updatedBy: row.updatedById ? (owner.get(row.updatedById) ?? null) : null,
          }
        : UNSAVED),
      questionKey: key,
      text: row?.text ?? null,
      amount: row?.amount ?? null,
      commentCounts: counts.get(key) ?? [],
    };
  });
}

/** S2: one section of the analysis's pinned version with its answers. */
export async function loadSelfAnalysisSection(
  db: Executor,
  analysis: AnalysisRow,
  sectionKey: string,
): Promise<{ section: TemplateSection; answers: SelfAnalysisAnswer[] }> {
  const [found] = await loadTemplateSections(db, analysis.templateVersionId, [sectionKey]);
  if (!found) throw new ApiError("NOT_FOUND", "No such section");
  return {
    section: found.section,
    answers: await buildSelfAnalysisAnswers(
      db,
      analysis,
      found.section.questions.map((q) => q.key),
    ),
  };
}

async function findQuestion(
  tx: Tx,
  templateVersionId: string,
  questionKey: string,
): Promise<TemplateQuestionRow | null> {
  const sections = await loadTemplateSections(tx, templateVersionId);
  for (const { rows } of sections) {
    const found = rows.find((r) => r.key === questionKey);
    if (found) return found;
  }
  return null;
}

/** Where and by whom a self-analysis answer is saved. */
export interface SaveSelfAnswerContext {
  analysis: AnalysisRow;
  actor: HistoryActor;
  now: Date;
}

/**
 * S3. Upserts one answer with the item's optimistic lock and one history row (visible to the
 * owner only: `workspace_id` is null). The first answer moves `not_started` to `in_progress`.
 */
export async function saveSelfAnalysisAnswer(
  tx: Tx,
  ctx: SaveSelfAnswerContext,
  questionKey: string,
  body: PutSelfAnalysisAnswerBody,
): Promise<SelfAnalysisAnswer> {
  const { analysis } = ctx;
  const question = await findQuestion(tx, analysis.templateVersionId, questionKey);
  if (!question) throw new ApiError("QUESTION_NOT_FOUND", "No such question in this template");
  if (body.amount !== undefined && question.answerType !== "amount_with_reason") {
    throw validationFailed([
      { path: "amount", code: "invalid", message: "Only amount questions take an amount" },
    ]);
  }
  if (
    question.answerType === "short_text" &&
    typeof body.text === "string" &&
    body.text.length > MAX_SHORT_TEXT
  ) {
    throw validationFailed([
      { path: "text", code: "too_big", message: `Must be ${MAX_SHORT_TEXT} characters or fewer` },
    ]);
  }

  const [row] = await tx
    .select()
    .from(schema.selfAnalysisAnswers)
    .where(
      and(
        eq(schema.selfAnalysisAnswers.selfAnalysisId, analysis.id),
        eq(schema.selfAnalysisAnswers.questionKey, questionKey),
      ),
    )
    .for("update");
  const view = async () =>
    (await buildSelfAnalysisAnswers(tx, analysis, [questionKey]))[0] as SelfAnalysisAnswer;

  const lockVersion = await checkLockLazily(tx, {
    workspaceId: null,
    row: row ?? null,
    sent: { lockVersion: body.lockVersion, force: body.force },
    currentValue: view,
  });

  const text =
    body.text === undefined ? (row?.text ?? null) : hasText(body.text) ? body.text : null;
  const amount = body.amount === undefined ? (row?.amount ?? null) : body.amount;
  if ((row?.text ?? null) === text && (row?.amount ?? null) === amount) return view();

  await withHistory(
    tx,
    {
      container: { type: "self_analysis", id: analysis.id },
      workspaceId: null,
      ownerUserId: analysis.userId,
      sectionKey: question.sectionKey,
      target: { type: "self_analysis_answer", id: analysis.id, key: questionKey },
      actor: ctx.actor,
    },
    async () => {
      const stamp = { updatedById: ctx.actor.userId, updatedAt: ctx.now };
      let saved: AnswerRow | undefined;
      if (row) {
        [saved] = await tx
          .update(schema.selfAnalysisAnswers)
          .set({ text, amount, ...stamp, lockVersion })
          .where(eq(schema.selfAnalysisAnswers.id, row.id))
          .returning();
      } else {
        [saved] = await tx
          .insert(schema.selfAnalysisAnswers)
          .values({
            selfAnalysisId: analysis.id,
            questionKey,
            text,
            amount,
            ...stamp,
            lockVersion: 1,
          })
          .onConflictDoNothing()
          .returning();
        if (!saved) {
          const [current] = await tx
            .select()
            .from(schema.selfAnalysisAnswers)
            .where(
              and(
                eq(schema.selfAnalysisAnswers.selfAnalysisId, analysis.id),
                eq(schema.selfAnalysisAnswers.questionKey, questionKey),
              ),
            );
          await lostInsertRace(tx, {
            workspaceId: null,
            row: current ?? null,
            currentValue: view,
          });
        }
      }
      return {
        result: undefined,
        before: row ? selfAnalysisAnswerSnapshot(row) : null,
        after: selfAnalysisAnswerSnapshot(saved as AnswerRow),
      };
    },
  );
  if (analysis.status === "not_started") {
    await tx
      .update(schema.selfAnalyses)
      .set({ status: "in_progress" })
      .where(
        and(eq(schema.selfAnalyses.id, analysis.id), eq(schema.selfAnalyses.status, "not_started")),
      );
  }
  return view();
}

/** S1 PATCH: the currency of the amount questions. Amounts are not converted. */
export async function setSelfAnalysisCurrency(
  db: Executor,
  analysis: AnalysisRow,
  currency: string,
): Promise<AnalysisRow> {
  const [updated] = await db
    .update(schema.selfAnalyses)
    .set({ currency })
    .where(eq(schema.selfAnalyses.id, analysis.id))
    .returning();
  return updated as AnalysisRow;
}

/**
 * S4 complete. Questions left empty need the caller's confirmation (409 HAS_EMPTY_QUESTIONS with
 * the count). Completing a done analysis changes nothing.
 */
export async function completeSelfAnalysis(
  tx: Tx,
  analysis: AnalysisRow,
  confirmEmpty: boolean,
  now: Date,
): Promise<AnalysisRow> {
  const [locked] = await tx
    .select()
    .from(schema.selfAnalyses)
    .where(eq(schema.selfAnalyses.id, analysis.id))
    .for("update");
  const current = locked as AnalysisRow;
  if (current.status === "done") return current;
  const [sections, answers] = await Promise.all([
    loadTemplateSections(tx, current.templateVersionId),
    loadAnswerRows(tx, current.id),
  ]);
  const rowOf = new Map(answers.map((a) => [a.questionKey, a]));
  const keys = sections.flatMap(({ section }) => section.questions.map((q) => q.key));
  const emptyCount = keys.filter((key) => !isAnswered(rowOf.get(key))).length;
  if (emptyCount > 0 && !confirmEmpty) {
    throw new ApiError("HAS_EMPTY_QUESTIONS", "Some questions are empty", { emptyCount });
  }
  const [updated] = await tx
    .update(schema.selfAnalyses)
    .set({ status: "done", completedAt: now })
    .where(eq(schema.selfAnalyses.id, current.id))
    .returning();
  return updated as AnalysisRow;
}

/** S4 reopen: back to in progress. Shares stay (design-spec 6.11). */
export async function reopenSelfAnalysis(
  db: Executor,
  analysis: AnalysisRow,
): Promise<AnalysisRow> {
  if (analysis.status !== "done") return analysis;
  const [updated] = await db
    .update(schema.selfAnalyses)
    .set({ status: "in_progress", completedAt: null })
    .where(eq(schema.selfAnalyses.id, analysis.id))
    .returning();
  return updated as AnalysisRow;
}

/**
 * S5. Replaces the set of workspaces the analysis is shared with. New shares need a done analysis
 * and a workspace where the caller is Owner or Member (not the personal one); dropping a share is
 * always allowed and keeps the ones that stay as they are.
 */
export async function setSelfAnalysisShares(
  tx: Tx,
  analysis: AnalysisRow,
  workspaceIds: string[],
): Promise<void> {
  const wanted = [...new Set(workspaceIds)];
  const [locked] = await tx
    .select()
    .from(schema.selfAnalyses)
    .where(eq(schema.selfAnalyses.id, analysis.id))
    .for("update");
  const current = await tx
    .select({ workspaceId: schema.selfAnalysisShares.workspaceId })
    .from(schema.selfAnalysisShares)
    .where(eq(schema.selfAnalysisShares.selfAnalysisId, analysis.id));
  const kept = new Set(current.map((c) => c.workspaceId));
  const added = wanted.filter((id) => !kept.has(id));
  if (added.length > 0) {
    if ((locked as AnalysisRow).status !== "done") {
      throw new ApiError(
        "MUST_BE_DONE_TO_SHARE",
        "Mark the self analysis as done before sharing it",
      );
    }
    const allowed = await tx
      .select({ id: schema.workspaces.id })
      .from(schema.memberships)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.memberships.workspaceId))
      .where(
        and(
          eq(schema.memberships.userId, analysis.userId),
          inArray(schema.memberships.role, ["owner", "member"]),
          eq(schema.workspaces.isPersonal, false),
          inArray(schema.workspaces.id, added),
        ),
      );
    if (allowed.length !== added.length) {
      throw new ApiError(
        "NOT_SHAREABLE",
        "Only workspaces where you are an Owner or Member can be shared with",
      );
    }
    await tx
      .insert(schema.selfAnalysisShares)
      .values(added.map((workspaceId) => ({ selfAnalysisId: analysis.id, workspaceId })));
  }
  const dropped = current.map((c) => c.workspaceId).filter((id) => !wanted.includes(id));
  if (dropped.length > 0) {
    await tx
      .delete(schema.selfAnalysisShares)
      .where(
        and(
          eq(schema.selfAnalysisShares.selfAnalysisId, analysis.id),
          inArray(schema.selfAnalysisShares.workspaceId, dropped),
        ),
      );
  }
}

/** S7 payload: a shared analysis as a read-only article, with the comment counts of this workspace. */
export async function loadSharedSelfAnalysis(
  db: Executor,
  workspaceId: string,
  ownerUserId: string,
) {
  const [analysis] = await db
    .select()
    .from(schema.selfAnalyses)
    .innerJoin(
      schema.selfAnalysisShares,
      and(
        eq(schema.selfAnalysisShares.selfAnalysisId, schema.selfAnalyses.id),
        eq(schema.selfAnalysisShares.workspaceId, workspaceId),
      ),
    )
    .where(eq(schema.selfAnalyses.userId, ownerUserId));
  if (!analysis) throw new ApiError("NOT_SHARED", "This self analysis is not shared here");
  const row = analysis.self_analyses;
  const [sections, answers, refs, comments] = await Promise.all([
    loadTemplateSections(db, row.templateVersionId),
    loadAnswerRows(db, row.id),
    loadUserRefs(db, [ownerUserId], workspaceId),
    db
      .select({ key: schema.comments.targetKey, n: count() })
      .from(schema.comments)
      .where(
        and(
          eq(schema.comments.workspaceId, workspaceId),
          eq(schema.comments.targetType, "self_analysis_answer"),
          eq(schema.comments.targetId, row.id),
          isNull(schema.comments.deletedAt),
        ),
      )
      .groupBy(schema.comments.targetKey),
  ]);
  const rowOf = new Map(answers.map((a) => [a.questionKey, a]));
  const countOf = new Map(comments.flatMap((c) => (c.key ? [[c.key, c.n] as const] : [])));
  return {
    id: row.id,
    user: refs.get(ownerUserId) as NonNullable<ReturnType<typeof refs.get>>,
    status: row.status,
    currency: row.currency,
    sections: sections.map(({ section }) => ({
      ...section,
      answers: section.questions.map((q) => ({
        questionKey: q.key,
        text: rowOf.get(q.key)?.text ?? null,
        amount: rowOf.get(q.key)?.amount ?? null,
        commentCount: countOf.get(q.key) ?? 0,
      })),
    })),
  };
}
