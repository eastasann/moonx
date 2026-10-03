import { schema } from "@moonx/db";
import type { Role, TargetType, TemplateKind } from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { ApiError } from "../errors";
import type { Executor, Tx } from "./db";
import type { Scope, ScopeRef } from "./scope";
import type { AuthUser } from "./session";

/** The screen-level owner of a history row: what `change_history.container_*` holds. */
export type HistoryContainerType = "self_analysis" | "validation" | "business_plan" | "idea";

/** Who may do what with the history of one container, and which rows of the database it is. */
export interface HistoryAccess {
  container: { type: HistoryContainerType; id: string };
  /** null for a self analysis, which belongs to no workspace. */
  workspaceId: string | null;
  /** null for a self analysis: its owner has no workspace role. */
  role: Role | null;
  ownerUserId: string | null;
  ideaId: string | null;
  validationId: string | null;
  planId: string | null;
  archived: boolean;
}

/**
 * What the route's `located` declaration resolves for a history container (SDD 7.1). A self
 * analysis belongs to no workspace and is only for its owner: anyone else, shared members
 * included, gets 403 FORBIDDEN, and the answer is `null` (no scope).
 */
export async function containerScopeRef(
  db: Executor,
  user: Pick<AuthUser, "id">,
  type: HistoryContainerType,
  id: string,
): Promise<ScopeRef | null> {
  if (type === "self_analysis") {
    const [analysis] = await db
      .select({ userId: schema.selfAnalyses.userId })
      .from(schema.selfAnalyses)
      .where(eq(schema.selfAnalyses.id, id));
    if (!analysis) throw new ApiError("NOT_FOUND", "Resource not found");
    if (analysis.userId !== user.id) {
      throw new ApiError("FORBIDDEN", "Only the owner can see the history of a self analysis");
    }
    return null;
  }
  return type === "validation"
    ? { validationId: id }
    : type === "business_plan"
      ? { planId: id }
      : { ideaId: id };
}

/** The workspace and role of the caller for a container, from the scope its route declared. */
export function containerAccess(
  user: Pick<AuthUser, "id">,
  type: HistoryContainerType,
  id: string,
  scope: Scope | null,
): HistoryAccess {
  if (!scope) {
    return {
      container: { type, id },
      workspaceId: null,
      role: null,
      ownerUserId: user.id,
      ideaId: null,
      validationId: null,
      planId: null,
      archived: false,
    };
  }
  return {
    container: { type, id },
    workspaceId: scope.workspaceId,
    role: scope.role,
    ownerUserId: null,
    ideaId: scope.ideaId,
    validationId: scope.validationId,
    planId: scope.planId,
    archived: scope.ideaArchived || scope.planArchived,
  };
}

/** Whether the caller may change the container: Owner or Member, and not archived. */
export function canRevert(access: HistoryAccess): boolean {
  return access.role !== "viewer" && !access.archived;
}

/** Row tables of the validation lists, to find the validation of a row that may be deleted. */
async function validationOfRow(db: Executor, type: TargetType, id: string) {
  switch (type) {
    case "research_log_entry":
      return (
        await db
          .select({ v: schema.researchLogEntries.validationId })
          .from(schema.researchLogEntries)
          .where(eq(schema.researchLogEntries.id, id))
      )[0]?.v;
    case "competitor":
      return (
        await db
          .select({ v: schema.competitors.validationId })
          .from(schema.competitors)
          .where(eq(schema.competitors.id, id))
      )[0]?.v;
    case "assumption":
      return (
        await db
          .select({ v: schema.assumptions.validationId })
          .from(schema.assumptions)
          .where(eq(schema.assumptions.id, id))
      )[0]?.v;
    case "risk":
      return (
        await db
          .select({ v: schema.risks.validationId })
          .from(schema.risks)
          .where(eq(schema.risks.id, id))
      )[0]?.v;
    default:
      return (
        await db
          .select({ v: schema.costItems.validationId })
          .from(schema.costItems)
          .where(eq(schema.costItems.id, id))
      )[0]?.v;
  }
}

const CONTAINER_OF_KIND: Record<TemplateKind, HistoryContainerType> = {
  self_analysis: "self_analysis",
  validation: "validation",
  business_plan: "business_plan",
};

/**
 * The container a TargetRef lives in (SDD 5.1). A row that was soft-deleted still resolves, so
 * its history stays readable and its deletion can be undone. 404 when the row never existed.
 */
export async function containerOfTarget(
  db: Executor,
  ref: { type: TargetType; id: string; key?: string | null },
): Promise<{ type: HistoryContainerType; id: string }> {
  switch (ref.type) {
    case "self_analysis_answer":
      return { type: "self_analysis", id: ref.id };
    case "validation_answer":
    case "economics_input":
      return { type: "validation", id: ref.id };
    case "plan_answer":
    case "pitch_slide":
    case "business_plan":
      return { type: "business_plan", id: ref.id };
    case "idea":
      return { type: "idea", id: ref.id };
    case "template_version": {
      const type = CONTAINER_OF_KIND[ref.key as TemplateKind];
      if (!type) throw new ApiError("NOT_FOUND", "Resource not found");
      return { type, id: ref.id };
    }
    case "execution_item": {
      const [row] = await db
        .select({ planId: schema.executionItems.businessPlanId })
        .from(schema.executionItems)
        .where(eq(schema.executionItems.id, ref.id));
      if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
      return { type: "business_plan", id: row.planId };
    }
    default: {
      const validationId = await validationOfRow(db, ref.type, ref.id);
      if (!validationId) throw new ApiError("NOT_FOUND", "Resource not found");
      return { type: "validation", id: validationId };
    }
  }
}

/**
 * Locks the plan and idea a comment sits under against archiving and checks they are still open,
 * so a concurrent archive cannot let a comment land in something archived. Writes that update the
 * idea's activity row do not need this: that update refuses an archived idea itself, and taking
 * these locks first would invert the item-then-idea order those writers use.
 */
export async function assertOpen(
  tx: Tx,
  ids: { ideaId: string | null; planId: string | null },
): Promise<void> {
  if (ids.planId) {
    const [plan] = await tx
      .select({ archivedAt: schema.businessPlans.archivedAt })
      .from(schema.businessPlans)
      .where(eq(schema.businessPlans.id, ids.planId))
      .for("share");
    // No row: the plan was deleted while this request waited for its lock (H3 undoes a draft).
    if (!plan) throw new ApiError("NOT_FOUND", "Resource not found");
    if (plan.archivedAt) throw new ApiError("ARCHIVED", "Archived items cannot be changed");
  }
  if (ids.ideaId) {
    const [idea] = await tx
      .select({ archivedAt: schema.ideas.archivedAt })
      .from(schema.ideas)
      .where(eq(schema.ideas.id, ids.ideaId))
      .for("share");
    if (!idea) throw new ApiError("NOT_FOUND", "Resource not found");
    if (idea.archivedAt) throw new ApiError("ARCHIVED", "Archived items cannot be changed");
  }
}
