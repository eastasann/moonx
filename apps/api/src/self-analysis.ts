import {
  comments,
  type Database,
  type DatabaseTransaction,
  loadTemplateSections,
  memberships,
  selfAnalyses,
  selfAnalysisAnswerContent,
  selfAnalysisAnswers,
  selfAnalysisShares,
  workspaces,
} from "@moonx/db";
import { selfAnalysisProgress } from "@moonx/domain";
import {
  countChars,
  errorBodySchema,
  memberSelfAnalysesSchema,
  memberSelfAnalysisParamsSchema,
  type SelfAnalysisAnswer,
  type SelfAnalysisAnswerSave,
  type SelfAnalysisHome,
  selfAnalysisAnswerParamsSchema,
  selfAnalysisAnswerSaveSchema,
  selfAnalysisAnswerSchema,
  selfAnalysisCompleteSchema,
  selfAnalysisHomeSchema,
  selfAnalysisSectionParamsSchema,
  selfAnalysisSectionSchema,
  selfAnalysisSharesUpdateSchema,
  selfAnalysisUpdateSchema,
  sharedSelfAnalysisSchema,
  TEXT_LIMITS,
  type TemplateQuestion,
  type TemplateSection,
  type UserRef,
  uuidSchema,
} from "@moonx/schemas";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import type { AccessPlugin } from "./access";
import { requestContext } from "./entry";
import { ApiError } from "./errors";
import { withHistory } from "./history";
import { latestTemplateVersion, templateRef } from "./idea-views";
import {
  checkKeyedLockVersion,
  createKeyedItem,
  type LockedItem,
  lockActiveCaller,
} from "./lock";
import { lockMembers } from "./membership";
import { loadUserRefs } from "./user-refs";
import { invalid, sameContent } from "./validation-writes";

type Executor = Database | DatabaseTransaction;
type SelfAnalysisRow = typeof selfAnalyses.$inferSelect;
type AnswerRow = typeof selfAnalysisAnswers.$inferSelect;

/** The question types 11 answers in a self-analysis (design-spec 6.2). */
const ANSWERABLE = new Set<TemplateQuestion["answerType"]>([
  "long_text",
  "short_text",
  "choice",
  "amount_with_reason",
]);

/** The 404 of a self-analysis S1 GET has not made yet (SDD 5.8). */
export const notOpenedYet = () =>
  new ApiError(
    "NOT_FOUND",
    "No self-analysis yet: S1 GET makes it the first time 10 opens",
  );

/** The caller's self-analysis, or undefined before the first S1 GET made it. */
export async function findSelfAnalysis(
  db: Executor,
  userId: string,
): Promise<SelfAnalysisRow | undefined> {
  const [analysis] = await db
    .select()
    .from(selfAnalyses)
    .where(eq(selfAnalyses.userId, userId));
  return analysis;
}

/**
 * Locks the caller's self-analysis for the rest of `tx`, so its writes (S1 PATCH, S3,
 * S4, S5) run one at a time: a share cannot be added while Reopen runs, and the first
 * answer moves the status once. Take it after {@link lockActiveCaller}.
 *
 * @throws {ApiError} NOT_FOUND before the first S1 GET made it
 */
export async function lockSelfAnalysis(
  tx: DatabaseTransaction,
  userId: string,
): Promise<SelfAnalysisRow> {
  const [analysis] = await tx
    .select()
    .from(selfAnalyses)
    .where(eq(selfAnalyses.userId, userId))
    .for("no key update");
  if (analysis === undefined) throw notOpenedYet();
  return analysis;
}

async function sectionsOf(
  db: Executor,
  templateVersionId: string,
): Promise<TemplateSection[]> {
  return (
    (await loadTemplateSections(db, [templateVersionId])).get(
      templateVersionId,
    ) ?? []
  );
}

const findQuestion = (sections: readonly TemplateSection[], key: string) =>
  sections.flatMap((section) => section.questions).find((q) => q.key === key);

async function answerRows(
  db: Executor,
  selfAnalysisId: string,
): Promise<Map<string, AnswerRow>> {
  const rows = await db
    .select()
    .from(selfAnalysisAnswers)
    .where(eq(selfAnalysisAnswers.selfAnalysisId, selfAnalysisId));
  return new Map(rows.map((row) => [row.questionKey, row]));
}

/** The workspaces a self-analysis is shared with, in the order they were shared. */
async function sharesOf(db: Executor, selfAnalysisId: string) {
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      sharedAt: selfAnalysisShares.sharedAt,
    })
    .from(selfAnalysisShares)
    .innerJoin(workspaces, eq(workspaces.id, selfAnalysisShares.workspaceId))
    .where(eq(selfAnalysisShares.selfAnalysisId, selfAnalysisId))
    .orderBy(asc(selfAnalysisShares.sharedAt), asc(workspaces.id));
  return rows.map((row) => ({
    workspace: { id: row.id, name: row.name },
    sharedAt: row.sharedAt.toISOString(),
  }));
}

/**
 * The workspaces `userId` may share a self-analysis with (design-spec 6.11): those they
 * are an Owner or Member of, personal ones left out, theirs and others'. In the order
 * they joined, as U1 lists them.
 */
async function shareableWorkspaces(db: Executor, userId: string) {
  return db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(
      and(
        eq(memberships.userId, userId),
        inArray(memberships.role, ["owner", "member"]),
        eq(workspaces.isPersonal, false),
      ),
    )
    .orderBy(asc(memberships.createdAt), asc(workspaces.id));
}

/**
 * How many comments each answer of `selfAnalysisId` has in each of `workspaceIds`,
 * replies included and deleted ones left out, keyed `questionKey` then workspace.
 */
async function commentCounts(
  db: Executor,
  selfAnalysisId: string,
  workspaceIds: readonly string[],
): Promise<Map<string, Map<string, number>>> {
  const rows =
    workspaceIds.length === 0
      ? []
      : await db
          .select({
            questionKey: comments.targetKey,
            workspaceId: comments.workspaceId,
            count: sql<number>`count(*)::int`,
          })
          .from(comments)
          .where(
            and(
              eq(comments.targetType, "self_analysis_answer"),
              eq(comments.targetId, selfAnalysisId),
              inArray(comments.workspaceId, [...workspaceIds]),
              isNull(comments.deletedAt),
            ),
          )
          .groupBy(comments.targetKey, comments.workspaceId);
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.questionKey === null) continue;
    const byWorkspace = counts.get(row.questionKey) ?? new Map();
    byWorkspace.set(row.workspaceId, row.count);
    counts.set(row.questionKey, byWorkspace);
  }
  return counts;
}

/** S1: the home of a self-analysis (SDD 5.8 SelfAnalysisHome). */
async function selfAnalysisHome(
  db: Executor,
  analysis: SelfAnalysisRow,
): Promise<SelfAnalysisHome> {
  const sections = await sectionsOf(db, analysis.templateVersionId);
  const progress = selfAnalysisProgress(
    sections,
    await answerRows(db, analysis.id),
  );
  return {
    id: analysis.id,
    status: analysis.status,
    completedAt: analysis.completedAt?.toISOString() ?? null,
    currency: analysis.currency,
    template: await templateRef(db, analysis.templateVersionId),
    ...progress,
    shares: await sharesOf(db, analysis.id),
    shareableWorkspaces: await shareableWorkspaces(db, analysis.userId),
  };
}

/**
 * The answers to the questions `keys` of `analysis` as its owner reads them (SDD 5.8
 * SelfAnalysisAnswer), one per key: an unanswered one is empty at version 0.
 */
async function answerViews(
  db: Executor,
  analysis: SelfAnalysisRow,
  keys: readonly string[],
): Promise<SelfAnalysisAnswer[]> {
  const rows = await answerRows(db, analysis.id);
  const shares = await sharesOf(db, analysis.id);
  const counts = await commentCounts(
    db,
    analysis.id,
    shares.map((share) => share.workspace.id),
  );
  // A self-analysis belongs to no workspace, so nobody shows as a former member.
  const authors = await loadUserRefs(
    db,
    [...rows.values()].flatMap((row) =>
      row.updatedById === null ? [] : [row.updatedById],
    ),
    null,
  );
  return keys.map((key) => {
    const row = rows.get(key);
    return {
      questionKey: key,
      text: row?.text ?? null,
      amount: row?.amount ?? null,
      commentCounts: shares.map(({ workspace }) => ({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        count: counts.get(key)?.get(workspace.id) ?? 0,
      })),
      lockVersion: row?.lockVersion ?? 0,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy:
        row?.updatedById == null
          ? null
          : (authors.get(row.updatedById) ?? null),
    };
  });
}

/**
 * Checks what an S3 save of the question `key` settles without the stored answer: the
 * pinned version has the question, its type takes an answer on 11 (design-spec 6.2), the
 * text fits the type and is one of a choice's choices, and only an amount-with-reason
 * question gets an amount (6.0.8).
 *
 * @throws {ApiError} QUESTION_NOT_FOUND, NOT_EDITABLE, INVALID_CHOICE or
 * VALIDATION_FAILED
 */
function checkAnswerSave(
  sections: readonly TemplateSection[],
  key: string,
  body: SelfAnalysisAnswerSave,
): void {
  const question = findQuestion(sections, key);
  if (question === undefined) {
    throw new ApiError(
      "QUESTION_NOT_FOUND",
      "The pinned template version has no such question",
    );
  }
  if (!ANSWERABLE.has(question.answerType)) {
    throw new ApiError("NOT_EDITABLE", "This question takes no answer");
  }
  if (
    body.amount !== undefined &&
    body.amount !== null &&
    question.answerType !== "amount_with_reason"
  ) {
    throw invalid(
      "amount",
      "invalid_value",
      "Only an amount-with-reason question takes an amount",
    );
  }
  const { text } = body;
  if (typeof text !== "string") return;
  if (
    question.answerType === "short_text" &&
    countChars(text) > TEXT_LIMITS.short
  ) {
    throw invalid(
      "text",
      "too_big",
      `Must be at most ${TEXT_LIMITS.short} characters`,
    );
  }
  if (
    question.options?.kind === "choice" &&
    !question.options.choices.includes(text)
  ) {
    throw new ApiError("INVALID_CHOICE", "Not one of the choices");
  }
}

/**
 * Refuses a share with a workspace the caller is not an Owner or Member of, or with a
 * personal one (design-spec 6.11).
 *
 * @throws {ApiError} NOT_SHAREABLE
 */
async function refuseUnshareable(
  tx: DatabaseTransaction,
  userId: string,
  workspaceIds: ReadonlySet<string>,
): Promise<void> {
  const shareable = new Set(
    (await shareableWorkspaces(tx, userId)).map((workspace) => workspace.id),
  );
  if ([...workspaceIds].some((id) => !shareable.has(id))) {
    throw new ApiError(
      "NOT_SHAREABLE",
      "Only team workspaces the caller is an Owner or Member of",
    );
  }
}

/**
 * Moves a self-analysis that is not started to in progress once one of its questions
 * counts as answered (design-spec 6.11), so an answer to a question its display
 * condition hides starts nothing, as it counts nowhere. Call it after writing an answer
 * or changing the pinned version, under {@link lockSelfAnalysis} (SDD 5.8). It never
 * moves back to not started.
 */
export async function startIfAnswered(
  tx: DatabaseTransaction,
  analysis: SelfAnalysisRow,
  sections: readonly TemplateSection[],
  at: Date,
): Promise<void> {
  if (analysis.status !== "not_started") return;
  const { answered } = selfAnalysisProgress(
    sections,
    await answerRows(tx, analysis.id),
  );
  if (answered === 0) return;
  await tx
    .update(selfAnalyses)
    .set({ status: "in_progress", updatedAt: at })
    .where(eq(selfAnalyses.id, analysis.id));
}

const lockedAnswer = (row: AnswerRow): LockedItem => ({
  value: selfAnalysisAnswerContent(row),
  lockVersion: row.lockVersion,
  updatedAt: row.updatedAt,
  updatedById: row.updatedById,
});

/** By display name, then id, so the list reads alphabetically and never reorders. */
const byName = (a: UserRef, b: UserRef) =>
  a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" }) ||
  a.id.localeCompare(b.id);

/**
 * Owners and Members of `workspaceId` by name, with how far their self-analysis is when
 * they share it there (D2, S6). Nobody else sees how far an unshared one is.
 */
export async function memberSelfAnalyses(db: Database, workspaceId: string) {
  const members = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        inArray(memberships.role, ["owner", "member"]),
      ),
    );
  const ids = members.map((member) => member.userId);
  const analyses =
    ids.length === 0
      ? []
      : await db
          .select({
            userId: selfAnalyses.userId,
            status: selfAnalyses.status,
            shared: sql<boolean>`exists (${db
              .select({ one: sql`1` })
              .from(selfAnalysisShares)
              .where(
                and(
                  eq(selfAnalysisShares.selfAnalysisId, selfAnalyses.id),
                  eq(selfAnalysisShares.workspaceId, workspaceId),
                ),
              )})`,
          })
          .from(selfAnalyses)
          .where(inArray(selfAnalyses.userId, ids));
  const analysisOf = new Map(analyses.map((a) => [a.userId, a]));
  const refs = await loadUserRefs(db, ids, workspaceId);
  return {
    items: [...refs.values()].sort(byName).map((user) => {
      const analysis = analysisOf.get(user.id);
      const shared = analysis?.shared ?? false;
      return {
        user,
        shared,
        status: shared ? (analysis?.status ?? null) : null,
      };
    }),
  };
}

/** What the self-analysis routes need from the app. */
export interface SelfAnalysisRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

/** S1–S7 (SDD 5.8): the caller's own self-analysis, and those members share. */
export function selfAnalysisRoutes({
  access,
  db,
  now,
}: SelfAnalysisRoutesOptions) {
  /** Runs a write of the caller's self-analysis (SDD 7.1「停止・削除したユーザー」). */
  const writeOwn = <T>(
    userId: string,
    work: (tx: DatabaseTransaction, analysis: SelfAnalysisRow) => Promise<T>,
    before?: (tx: DatabaseTransaction) => Promise<void>,
  ) =>
    db.transaction(async (tx) => {
      await lockActiveCaller(tx, userId);
      await before?.(tx);
      return work(tx, await lockSelfAnalysis(tx, userId));
    });

  const homeOf = async (userId: string) => {
    const analysis = await findSelfAnalysis(db, userId);
    if (analysis === undefined) throw notOpenedYet();
    return selfAnalysisHome(db, analysis);
  };

  return new Elysia()
    .use(access)
    .get(
      "/api/v1/me/self-analysis",
      async ({ caller }) => {
        const existing = await findSelfAnalysis(db, caller.id);
        if (existing !== undefined) return selfAnalysisHome(db, existing);
        const at = new Date(now());
        const created = await db.transaction(async (tx) => {
          await lockActiveCaller(tx, caller.id);
          const version = await latestTemplateVersion(tx, "self_analysis");
          if (version === undefined) {
            throw new ApiError(
              "TEMPLATE_NOT_PUBLISHED",
              "No self-analysis template is published yet",
            );
          }
          // Two first opens at once both find none; the second insert does nothing.
          await tx
            .insert(selfAnalyses)
            .values({
              userId: caller.id,
              templateVersionId: version.id,
              createdAt: at,
              updatedAt: at,
            })
            .onConflictDoNothing();
          return findSelfAnalysis(tx, caller.id);
        });
        if (created === undefined) throw new Error("No self-analysis row");
        return selfAnalysisHome(db, created);
      },
      {
        signedIn: true,
        response: {
          200: selfAnalysisHomeSchema,
          401: errorBodySchema,
          409: errorBodySchema,
        },
        detail: {
          summary: "S1 The caller's self-analysis (10)",
          description:
            "The first call makes it on the latest published version, not started. Operators too.",
        },
      },
    )
    .patch(
      "/api/v1/me/self-analysis",
      async ({ caller, body }) => {
        const at = new Date(now());
        await writeOwn(caller.id, async (tx, analysis) => {
          if (analysis.currency === body.currency) return;
          await tx
            .update(selfAnalyses)
            .set({ currency: body.currency, updatedAt: at })
            .where(eq(selfAnalyses.id, analysis.id));
        });
        return homeOf(caller.id);
      },
      {
        signedIn: true,
        body: selfAnalysisUpdateSchema,
        parse: "json",
        response: {
          200: selfAnalysisHomeSchema,
          401: errorBodySchema,
          404: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "S1 PATCH Change the currency of the caller's self-analysis",
          description: "Amounts keep their numbers: nothing is converted.",
        },
      },
    )
    .get(
      "/api/v1/me/self-analysis/sections/:sectionKey",
      async ({ caller, params }) => {
        const analysis = await findSelfAnalysis(db, caller.id);
        if (analysis === undefined) throw notOpenedYet();
        const sections = await sectionsOf(db, analysis.templateVersionId);
        const section = sections.find((s) => s.key === params.sectionKey);
        if (section === undefined) {
          throw new ApiError("NOT_FOUND", "No such section");
        }
        return {
          section,
          answers: await answerViews(
            db,
            analysis,
            section.questions.map((question) => question.key),
          ),
        };
      },
      {
        signedIn: true,
        params: selfAnalysisSectionParamsSchema,
        response: {
          200: selfAnalysisSectionSchema,
          401: errorBodySchema,
          404: errorBodySchema,
        },
        detail: {
          summary: "S2 A section of the caller's self-analysis (11)",
          description:
            "One answer per question, unanswered ones included, with its comment count in each workspace it is shared with.",
        },
      },
    )
    .put(
      "/api/v1/me/self-analysis/answers/:questionKey",
      async ({ caller, params, body, request }) => {
        const { questionKey } = params;
        const at = new Date(now());
        await writeOwn(caller.id, async (tx, analysis) => {
          // Read under the self-analysis's lock, which a template migration (T2) must
          // take too (SDD 5.12), so the pinned version cannot change under this save.
          const sections = await sectionsOf(tx, analysis.templateVersionId);
          checkAnswerSave(sections, questionKey, body);
          const [current] = await tx
            .select()
            .from(selfAnalysisAnswers)
            .where(
              and(
                eq(selfAnalysisAnswers.selfAnalysisId, analysis.id),
                eq(selfAnalysisAnswers.questionKey, questionKey),
              ),
            )
            .for("update");
          const before =
            current === undefined ? null : selfAnalysisAnswerContent(current);
          const values = {
            text: body.text === undefined ? (current?.text ?? null) : body.text,
            amount:
              body.amount === undefined
                ? (current?.amount ?? null)
                : body.amount,
          };
          const after = selfAnalysisAnswerContent(values);
          const unchanged =
            current === undefined
              ? after.text === null && after.amount === null
              : sameContent(before, after);
          if (unchanged) return;
          if (current !== undefined) {
            await checkKeyedLockVersion(tx, lockedAnswer(current), body, null);
            await tx
              .update(selfAnalysisAnswers)
              .set({
                ...values,
                lockVersion: current.lockVersion + 1,
                updatedAt: at,
                updatedById: caller.id,
              })
              .where(eq(selfAnalysisAnswers.id, current.id));
          } else {
            await createKeyedItem(
              tx,
              async () =>
                (
                  await tx
                    .insert(selfAnalysisAnswers)
                    .values({
                      selfAnalysisId: analysis.id,
                      questionKey,
                      ...values,
                      lockVersion: 1,
                      updatedById: caller.id,
                      createdAt: at,
                      updatedAt: at,
                    })
                    .onConflictDoNothing()
                    .returning({ id: selfAnalysisAnswers.id })
                )[0],
              async () => {
                const [stored] = await tx
                  .select()
                  .from(selfAnalysisAnswers)
                  .where(
                    and(
                      eq(selfAnalysisAnswers.selfAnalysisId, analysis.id),
                      eq(selfAnalysisAnswers.questionKey, questionKey),
                    ),
                  );
                if (stored === undefined) throw new Error("No answer row");
                return lockedAnswer(stored);
              },
              null,
            );
          }
          await withHistory(
            tx,
            {
              container: {
                type: "self_analysis",
                id: analysis.id,
                ownerUserId: caller.id,
              },
              changedById: caller.id,
              source: "manual",
              batchId: null,
              client: requestContext(request).client,
              at,
            },
            async () => ({
              target: {
                type: "self_analysis_answer",
                id: analysis.id,
                key: questionKey,
              },
              action: current === undefined ? "create" : "update",
              before,
              after,
            }),
          );
          await startIfAnswered(tx, analysis, sections, at);
        });
        const analysis = await findSelfAnalysis(db, caller.id);
        if (analysis === undefined) throw notOpenedYet();
        const [answer] = await answerViews(db, analysis, [questionKey]);
        if (answer === undefined) throw new Error("No answer view");
        return answer;
      },
      {
        signedIn: true,
        params: selfAnalysisAnswerParamsSchema,
        body: selfAnalysisAnswerSaveSchema,
        parse: "json",
        response: {
          200: selfAnalysisAnswerSchema,
          401: errorBodySchema,
          404: errorBodySchema,
          409: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "S3 Save an answer of the caller's self-analysis",
          description:
            "Creates the answer at version 1 on its first save, and the first answer that counts as answered (a question its display condition hides counts nowhere) makes the self-analysis in progress. Only amount-with-reason questions take an amount.",
        },
      },
    )
    .post(
      "/api/v1/me/self-analysis/complete",
      async ({ caller, body }) => {
        const at = new Date(now());
        await writeOwn(caller.id, async (tx, analysis) => {
          if (analysis.status === "done") return;
          const { answered, total } = selfAnalysisProgress(
            await sectionsOf(tx, analysis.templateVersionId),
            await answerRows(tx, analysis.id),
          );
          const emptyCount = total - answered;
          if (emptyCount > 0 && body?.confirmEmpty !== true) {
            throw new ApiError(
              "HAS_EMPTY_QUESTIONS",
              "Some questions are empty: send confirmEmpty to mark it done anyway",
              { emptyCount },
            );
          }
          await tx
            .update(selfAnalyses)
            .set({ status: "done", completedAt: at, updatedAt: at })
            .where(eq(selfAnalyses.id, analysis.id));
        });
        return homeOf(caller.id);
      },
      {
        signedIn: true,
        body: selfAnalysisCompleteSchema,
        parse: "json",
        response: {
          200: selfAnalysisHomeSchema,
          401: errorBodySchema,
          404: errorBodySchema,
          409: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "S4 Mark the caller's self-analysis as done",
          description:
            "With empty questions, 409 HAS_EMPTY_QUESTIONS (emptyCount) unless confirmEmpty is true. A done one stays as it is.",
        },
      },
    )
    .post(
      "/api/v1/me/self-analysis/reopen",
      async ({ caller }) => {
        const at = new Date(now());
        await writeOwn(caller.id, async (tx, analysis) => {
          if (analysis.status !== "done") return;
          await tx
            .update(selfAnalyses)
            .set({ status: "in_progress", completedAt: null, updatedAt: at })
            .where(eq(selfAnalyses.id, analysis.id));
        });
        return homeOf(caller.id);
      },
      {
        signedIn: true,
        response: {
          200: selfAnalysisHomeSchema,
          401: errorBodySchema,
          404: errorBodySchema,
        },
        detail: {
          summary: "S4 Reopen the caller's self-analysis",
          description:
            "Back to in progress; its shares stay. One that is not done stays as it is.",
        },
      },
    )
    .put(
      "/api/v1/me/self-analysis/shares",
      async ({ caller, body }) => {
        const at = new Date(now());
        const requested = new Set(body.workspaceIds);
        await writeOwn(
          caller.id,
          async (tx, analysis) => {
            const current = new Set(
              (
                await tx
                  .select({ workspaceId: selfAnalysisShares.workspaceId })
                  .from(selfAnalysisShares)
                  .where(eq(selfAnalysisShares.selfAnalysisId, analysis.id))
              ).map((share) => share.workspaceId),
            );
            // Again under the members' locks: a role change or removal (W3) may have
            // ended before them.
            await refuseUnshareable(tx, caller.id, requested);
            const added = [...requested].filter((id) => !current.has(id));
            const removed = [...current].filter((id) => !requested.has(id));
            if (added.length > 0 && analysis.status !== "done") {
              throw new ApiError(
                "MUST_BE_DONE_TO_SHARE",
                "Mark the self-analysis as done before sharing it",
              );
            }
            if (removed.length > 0) {
              await tx
                .delete(selfAnalysisShares)
                .where(
                  and(
                    eq(selfAnalysisShares.selfAnalysisId, analysis.id),
                    inArray(selfAnalysisShares.workspaceId, removed),
                  ),
                );
            }
            if (added.length > 0) {
              await tx.insert(selfAnalysisShares).values(
                added.map((workspaceId) => ({
                  selfAnalysisId: analysis.id,
                  workspaceId,
                  sharedAt: at,
                  createdAt: at,
                  updatedAt: at,
                })),
              );
            }
            // A share is a row of its workspace, unlike the self-analysis itself. Rows
            // one at a time in id order, as U7 updates them, so the two cannot
            // deadlock.
            for (const id of [...added, ...removed].sort()) {
              await tx
                .update(workspaces)
                .set({ lastActiveAt: at })
                .where(eq(workspaces.id, id));
            }
          },
          async (tx) => {
            // Refused before any lock, so the number of locks is bounded by the
            // caller's workspaces, not by the body.
            if ((await findSelfAnalysis(tx, caller.id)) === undefined) {
              throw notOpenedYet();
            }
            await refuseUnshareable(tx, caller.id, requested);
            // Under the locks of the workspaces' members, a role change or removal
            // (W3) cannot slip between the check and the share it lets in.
            for (const id of [...requested].sort()) await lockMembers(tx, id);
          },
        );
        return homeOf(caller.id);
      },
      {
        signedIn: true,
        body: selfAnalysisSharesUpdateSchema,
        parse: "json",
        response: {
          200: selfAnalysisHomeSchema,
          401: errorBodySchema,
          404: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary:
            "S5 Set the workspaces the caller's self-analysis is shared with (M6)",
          description:
            "The whole set. Adding needs it done (MUST_BE_DONE_TO_SHARE); removing works any time. Only team workspaces the caller is an Owner or Member of (NOT_SHAREABLE).",
        },
      },
    )
    .get(
      "/api/v1/workspaces/:workspaceId/self-analyses",
      ({ scope }) => memberSelfAnalyses(db, scope.workspaceId),
      {
        scoped: { to: "workspaceId", need: "write" },
        response: {
          200: memberSelfAnalysesSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
        },
        detail: {
          summary: "S6 The members' self-analyses (12)",
          description:
            "Owners and Members by name. How far a self-analysis is shows only when it is shared with this workspace.",
        },
      },
    )
    .get(
      "/api/v1/workspaces/:workspaceId/self-analyses/:userId",
      async ({ scope, params }) => {
        const { userId } = params;
        // An id that could exist nowhere is 404, as resolveScope has it. Any other id
        // not shared here is 403 alike, so the answer tells nothing about users
        // outside the workspace.
        if (!uuidSchema.safeParse(userId).success) {
          throw new ApiError("NOT_FOUND", "No such user");
        }
        // One snapshot for the share and the answers, so a share removed while this
        // reads cannot let in answers written after it went.
        return db.transaction(
          async (tx) => {
            const [analysis] = await tx
              .select({ analysis: selfAnalyses })
              .from(selfAnalyses)
              .innerJoin(
                selfAnalysisShares,
                and(
                  eq(selfAnalysisShares.selfAnalysisId, selfAnalyses.id),
                  eq(selfAnalysisShares.workspaceId, scope.workspaceId),
                ),
              )
              .where(eq(selfAnalyses.userId, userId));
            if (analysis === undefined) {
              throw new ApiError(
                "NOT_SHARED",
                "The self-analysis is not shared with this workspace",
              );
            }
            const { id, status, currency, templateVersionId } =
              analysis.analysis;
            // The stored id: the path may write the UUID in capitals.
            const ownerId = analysis.analysis.userId;
            const sections = await sectionsOf(tx, templateVersionId);
            const rows = await answerRows(tx, id);
            const counts = await commentCounts(tx, id, [scope.workspaceId]);
            const refs = await loadUserRefs(tx, [ownerId], scope.workspaceId);
            const ref = refs.get(ownerId);
            if (ref === undefined) throw new Error(`No user ${ownerId}`);
            return {
              id,
              user: ref,
              status,
              currency,
              sections: sections.map((section) => ({
                ...section,
                answers: section.questions.map((question) => {
                  const row = rows.get(question.key);
                  return {
                    questionKey: question.key,
                    text: row?.text ?? null,
                    amount: row?.amount ?? null,
                    commentCount:
                      counts.get(question.key)?.get(scope.workspaceId) ?? 0,
                  };
                }),
              })),
            };
          },
          { isolationLevel: "repeatable read", accessMode: "read only" },
        );
      },
      {
        scoped: { to: "workspaceId", need: "write" },
        params: memberSelfAnalysisParamsSchema,
        response: {
          200: sharedSelfAnalysisSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
        },
        detail: {
          summary: "S7 A member's self-analysis shared with the workspace (12)",
          description:
            "Read only, with comment counts in this workspace and no history. 403 NOT_SHARED unless shared with this workspace.",
        },
      },
    );
}
