import { schema } from "@moonx/db";
import { PITCH_SLIDE_KEYS } from "@moonx/domain";
import {
  type CommentTargetRef,
  type ExecutionType,
  economicsFieldSchema,
  type LinkTarget,
  type Role,
} from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { ApiError, validationFailed } from "../errors";
import type { Executor } from "./db";
import { excerpt } from "./decision-log";
import { EXECUTION_TAB } from "./due-notifications";
import { i18n } from "./i18n";
import { requireNotArchived, type Scope, type ScopeRef } from "./scope";
import type { AuthUser } from "./session";
import { QUESTION_SCREEN } from "./validation-data";

type CommentableType = CommentTargetRef["type"];

/** Targets whose `key` names a question, a field or a slide; the others are whole rows. */
const KEYED = new Set<CommentableType>([
  "self_analysis_answer",
  "validation_answer",
  "plan_answer",
  "pitch_slide",
  "economics_input",
]);

/** Targets that sit under a plan; every other target is the idea's or its validation's. */
const PLAN_LEVEL = new Set<CommentableType>(["plan_answer", "pitch_slide", "execution_item"]);

/** Whether comments on this target belong to the plan (its creator hears of them) or the idea. */
export const isPlanLevel = (type: CommentableType) => PLAN_LEVEL.has(type);

/** A comment target found in the database, with what the callers need to decide about it. */
export interface LocatedTarget {
  ref: { type: CommentableType; id: string; key: string | null };
  /**
   * `row_deleted`: the row is soft-deleted, so its comments are hidden until it is restored.
   * `no_question`: the key is not in the template version the item is pinned to (design-spec
   * 6.0.7), so the answer and its comments are hidden.
   */
  state: "ok" | "row_deleted" | "no_question";
  /** Where authorization starts; null for a self-analysis, which belongs to a person. */
  scopeRef: ScopeRef | null;
  selfAnalysis: { ownerId: string } | null;
  label: string;
  sectionKey: string | null;
  executionType: ExecutionType | null;
}

const humanize = (text: string) => {
  const spaced = text.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** The short name of a target in a notification title: "WHO", "Costs · Rent", an idea's name. */
export function targetLabel(ref: LocatedTarget["ref"], name: string | null): string {
  const key = ref.key ?? "";
  const named = (prefix: string) => `${prefix} · ${excerpt(name) ?? ""}`.trimEnd();
  switch (ref.type) {
    case "validation_answer":
      return key.split(".").slice(2).join(" ").replaceAll("_", " ");
    case "self_analysis_answer":
      return key.split(".").slice(1).join(" ");
    case "plan_answer":
      return `${i18n.t("common:target.plan")} ${key.replace(/^P\./, "")}`.trimEnd();
    case "economics_input":
      return `${i18n.t("common:target.economics")} · ${humanize(key)}`;
    case "pitch_slide":
      return `${i18n.t("common:target.pitchDeck")} · ${humanize(key.split(".").at(-1) ?? "")}`;
    case "research_log_entry":
      return named(i18n.t("common:target.researchLog"));
    case "competitor":
      return named(i18n.t("common:target.competitor"));
    case "assumption":
      return named(i18n.t("common:target.assumption"));
    case "risk":
      return named(i18n.t("common:target.risk"));
    case "cost_item":
      return named(i18n.t("common:target.cost"));
    case "execution_item":
      return named(i18n.t("common:target.execution"));
    case "idea":
      return name ?? "";
  }
}

async function findQuestion(db: Executor, versionId: string, key: string) {
  const [row] = await db
    .select({ sectionKey: schema.templateSections.key })
    .from(schema.templateQuestions)
    .innerJoin(
      schema.templateSections,
      eq(schema.templateSections.id, schema.templateQuestions.templateSectionId),
    )
    .where(
      and(
        eq(schema.templateQuestions.templateVersionId, versionId),
        eq(schema.templateQuestions.questionKey, key),
      ),
    );
  return row ?? null;
}

interface RowFound {
  validationId: string;
  name: string;
  deletedAt: Date | null;
}

/** A row of a validation table (any soft-deleted one included) and the text that names it. */
async function findRow(
  db: Executor,
  type: "research_log_entry" | "competitor" | "assumption" | "risk" | "cost_item",
  id: string,
): Promise<RowFound | null> {
  let rows: RowFound[];
  switch (type) {
    case "research_log_entry":
      rows = await db
        .select({
          validationId: schema.researchLogEntries.validationId,
          name: schema.researchLogEntries.topic,
          deletedAt: schema.researchLogEntries.deletedAt,
        })
        .from(schema.researchLogEntries)
        .where(eq(schema.researchLogEntries.id, id));
      break;
    case "competitor":
      rows = await db
        .select({
          validationId: schema.competitors.validationId,
          name: schema.competitors.name,
          deletedAt: schema.competitors.deletedAt,
        })
        .from(schema.competitors)
        .where(eq(schema.competitors.id, id));
      break;
    case "assumption":
      rows = await db
        .select({
          validationId: schema.assumptions.validationId,
          name: schema.assumptions.statement,
          deletedAt: schema.assumptions.deletedAt,
        })
        .from(schema.assumptions)
        .where(eq(schema.assumptions.id, id));
      break;
    case "risk":
      rows = await db
        .select({
          validationId: schema.risks.validationId,
          name: schema.risks.statement,
          deletedAt: schema.risks.deletedAt,
        })
        .from(schema.risks)
        .where(eq(schema.risks.id, id));
      break;
    case "cost_item":
      rows = await db
        .select({
          validationId: schema.costItems.validationId,
          name: schema.costItems.name,
          deletedAt: schema.costItems.deletedAt,
        })
        .from(schema.costItems)
        .where(eq(schema.costItems.id, id));
      break;
  }
  return rows[0] ?? null;
}

const missing = () => new ApiError("NOT_FOUND", "Comment target not found");

/**
 * Finds a comment target (SDD 5.1 TargetRef) and says whether its comments are visible. Keyed
 * targets can be addressed before they have a row, so for them existence means the key is valid.
 * 404 when the owning row or container does not exist; a malformed key is a 422.
 */
export async function locateTarget(db: Executor, input: CommentTargetRef): Promise<LocatedTarget> {
  const key = input.key ?? null;
  if (KEYED.has(input.type) !== (key !== null)) {
    throw validationFailed([
      {
        path: "key",
        code: key === null ? "invalid_type" : "unrecognized_keys",
        message: key === null ? "A key is required for this target" : "This target has no key",
      },
    ]);
  }
  const ref = { type: input.type, id: input.id, key };
  const base = {
    ref,
    state: "ok" as LocatedTarget["state"],
    scopeRef: null as ScopeRef | null,
    selfAnalysis: null as LocatedTarget["selfAnalysis"],
    label: "",
    sectionKey: null as string | null,
    executionType: null as ExecutionType | null,
  };
  const result = (patch: Partial<typeof base> & { name?: string | null }): LocatedTarget => {
    const { name, ...rest } = patch;
    return { ...base, ...rest, label: targetLabel(ref, name ?? null) };
  };
  const questionState = async (versionId: string) => {
    const question = await findQuestion(db, versionId, key as string);
    return question
      ? { state: "ok" as const, sectionKey: question.sectionKey }
      : { state: "no_question" as const, sectionKey: null };
  };

  switch (input.type) {
    case "self_analysis_answer": {
      const [row] = await db
        .select({
          ownerId: schema.selfAnalyses.userId,
          version: schema.selfAnalyses.templateVersionId,
        })
        .from(schema.selfAnalyses)
        .where(eq(schema.selfAnalyses.id, input.id));
      if (!row) throw missing();
      return result({
        selfAnalysis: { ownerId: row.ownerId },
        ...(await questionState(row.version)),
      });
    }
    case "validation_answer": {
      const [row] = await db
        .select({ version: schema.validations.templateVersionId })
        .from(schema.validations)
        .where(eq(schema.validations.id, input.id));
      if (!row) throw missing();
      return result({
        scopeRef: { validationId: input.id },
        ...(await questionState(row.version)),
      });
    }
    case "economics_input": {
      const [row] = await db
        .select({ id: schema.validations.id })
        .from(schema.validations)
        .where(eq(schema.validations.id, input.id));
      if (!row) throw missing();
      const valid = economicsFieldSchema.safeParse(key).success;
      return result({
        scopeRef: { validationId: input.id },
        state: valid ? "ok" : "no_question",
      });
    }
    case "plan_answer": {
      const [row] = await db
        .select({ version: schema.businessPlans.templateVersionId })
        .from(schema.businessPlans)
        .where(eq(schema.businessPlans.id, input.id));
      if (!row) throw missing();
      return result({ scopeRef: { planId: input.id }, ...(await questionState(row.version)) });
    }
    case "pitch_slide": {
      const [row] = await db
        .select({ id: schema.businessPlans.id })
        .from(schema.businessPlans)
        .where(eq(schema.businessPlans.id, input.id));
      if (!row) throw missing();
      const [variant, slide] = (key as string).split(".");
      const slides = PITCH_SLIDE_KEYS[variant as keyof typeof PITCH_SLIDE_KEYS] as
        | string[]
        | undefined;
      return result({
        scopeRef: { planId: input.id },
        state: slides && slide && slides.includes(slide) ? "ok" : "no_question",
      });
    }
    case "idea": {
      const [row] = await db
        .select({ name: schema.ideas.name })
        .from(schema.ideas)
        .where(eq(schema.ideas.id, input.id));
      if (!row) throw missing();
      return result({ scopeRef: { ideaId: input.id }, name: row.name });
    }
    case "execution_item": {
      const [row] = await db
        .select({
          planId: schema.executionItems.businessPlanId,
          title: schema.executionItems.title,
          type: schema.executionItems.type,
          deletedAt: schema.executionItems.deletedAt,
        })
        .from(schema.executionItems)
        .where(eq(schema.executionItems.id, input.id));
      if (!row) throw missing();
      return result({
        scopeRef: { planId: row.planId },
        name: row.title,
        executionType: row.type,
        state: row.deletedAt ? "row_deleted" : "ok",
      });
    }
    default: {
      const found = await findRow(db, input.type, input.id);
      if (!found) throw missing();
      return result({
        scopeRef: { validationId: found.validationId },
        name: found.name,
        state: found.deletedAt ? "row_deleted" : "ok",
      });
    }
  }
}

/** The workspaces a comment on this target may sit in, and the caller's rights there. */
export interface TargetAccess {
  located: LocatedTarget;
  scope: Scope | null;
  /** Workspaces whose comments the caller sees on a read. */
  workspaceIds: string[];
  /** Workspace and role a comment written now would belong to; null when the caller has none for a read. */
  workspace: { id: string; role: Role } | null;
}

async function activeShares(db: Executor, analysisId: string) {
  const rows = await db
    .select({ workspaceId: schema.selfAnalysisShares.workspaceId })
    .from(schema.selfAnalysisShares)
    .where(eq(schema.selfAnalysisShares.selfAnalysisId, analysisId));
  return rows.map((r) => r.workspaceId);
}

/**
 * What the route's `located` declaration resolves for the comments of a target (SDD 7.1), `null`
 * for the one case with no workspace: the analysis' owner reading every share at once.
 *
 * - Ordinary targets: the target's workspace.
 * - Self-analysis targets: the workspace the caller names (`workspaceId`), which a write always
 *   has to name.
 */
export function targetScopeRef(
  located: LocatedTarget,
  user: Pick<AuthUser, "id">,
  opts: { workspaceId?: string; write: boolean },
): ScopeRef | null {
  if (!located.selfAnalysis) return located.scopeRef as ScopeRef;
  if (!opts.write && located.selfAnalysis.ownerId === user.id) return null;
  if (!opts.workspaceId) {
    throw validationFailed([
      { path: "workspaceId", code: "invalid_type", message: "workspaceId is required" },
    ]);
  }
  return { workspaceId: opts.workspaceId };
}

/**
 * Decides what the caller may do with the comments of a target (SDD 7.1), given the scope the
 * route resolved with `targetScopeRef`.
 *
 * - Ordinary targets: any member of the target's workspace reads and writes, Viewers included.
 * - Self-analysis targets: comments live in the workspace the analysis is shared with. A reader
 *   must be an Owner or Member there (a Viewer cannot read it) and name the workspace. Only the
 *   analysis' owner reads every share at once. A stopped share hides its comments from everyone.
 *
 * `existing` is for operations on a comment that already exists: what the caller may not see is
 * then a 404 instead of the 403 / 422 a new comment would get.
 */
export async function authorizeTarget(
  db: Executor,
  located: LocatedTarget,
  scope: Scope | null,
  opts: { workspaceId?: string; existing?: boolean },
): Promise<TargetAccess> {
  if (located.selfAnalysis) {
    const analysisId = located.ref.id;
    if (!scope) {
      return {
        located,
        scope: null,
        workspaceIds: await activeShares(db, analysisId),
        workspace: null,
      };
    }
    if (scope.role === "viewer")
      throw new ApiError("FORBIDDEN", "Viewers cannot read self analyses");
    const shares = await activeShares(db, analysisId);
    if (!shares.includes(scope.workspaceId)) {
      if (opts.existing) throw missing();
      throw new ApiError("NOT_SHARED", "This self analysis is not shared here");
    }
    return {
      located,
      scope,
      workspaceIds: [scope.workspaceId],
      workspace: { id: scope.workspaceId, role: scope.role },
    };
  }

  if (!scope) throw new ApiError("INTERNAL", "A workspace target needs a scope");
  if (opts.workspaceId && opts.workspaceId !== scope.workspaceId) {
    throw validationFailed([
      { path: "workspaceId", code: "invalid_value", message: "Not the workspace of the target" },
    ]);
  }
  return {
    located,
    scope,
    workspaceIds: [scope.workspaceId],
    workspace: { id: scope.workspaceId, role: scope.role },
  };
}

/** Refuses a write the target's state or archive does not allow (409 ARCHIVED, 404, 422). */
export function requireCommentable(access: TargetAccess, existing: boolean): void {
  const { state } = access.located;
  if (state === "row_deleted" || (state === "no_question" && existing)) throw missing();
  if (state === "no_question") {
    throw new ApiError("QUESTION_NOT_FOUND", "The question is not in this template version");
  }
  if (access.scope) requireNotArchived(access.scope);
}

/** Where a notification about a comment on the target opens (design-spec 6.15 "押した先"). */
export function commentLink(
  located: LocatedTarget,
  where: {
    workspaceId: string;
    ideaId: string | null;
    planId: string | null;
    /** Who opens it: the owner of a self-analysis sees it on 10/11, others on 12. */
    recipientId: string;
  },
): LinkTarget {
  const { ref } = located;
  const target = { type: ref.type, id: ref.id, ...(ref.key ? { key: ref.key } : {}) };
  const base: LinkTarget = {
    screen: 13,
    workspaceId: where.workspaceId,
    ...(where.ideaId ? { ideaId: where.ideaId } : {}),
    ...(where.planId ? { planId: where.planId } : {}),
    target,
    panel: "comments",
  };
  const row = (screen: number): LinkTarget => ({ ...base, screen, rowId: ref.id });
  const questionKey = ref.key ? { questionKey: ref.key } : {};
  switch (ref.type) {
    case "self_analysis_answer":
      return located.selfAnalysis?.ownerId === where.recipientId
        ? { ...base, screen: 11, sectionKey: located.sectionKey ?? undefined, ...questionKey }
        : {
            ...base,
            screen: 12,
            userId: located.selfAnalysis?.ownerId,
            sectionKey: located.sectionKey ?? undefined,
            ...questionKey,
          };
    case "validation_answer": {
      const section = (ref.key ?? "").split(".")[1] ?? "";
      return {
        ...base,
        screen: QUESTION_SCREEN[section] ?? 11,
        sectionKey: section,
        ...questionKey,
      };
    }
    case "economics_input":
      return {
        ...base,
        screen: 18,
        field: ref.key as NonNullable<LinkTarget["field"]>,
      };
    case "research_log_entry":
      return row(14);
    case "competitor":
      return row(15);
    case "assumption":
    case "risk":
      return row(16);
    case "cost_item":
      return row(17);
    case "plan_answer": {
      const itemNo = Number((ref.key ?? "").split(".")[1]);
      return {
        ...base,
        screen: 21,
        ...questionKey,
        ...(Number.isInteger(itemNo) ? { itemNo } : {}),
      };
    }
    case "pitch_slide":
      return { ...base, screen: 23 };
    case "execution_item":
      return {
        ...row(22),
        ...(located.executionType ? { tab: EXECUTION_TAB[located.executionType] } : {}),
      };
    case "idea":
      return base;
  }
}
