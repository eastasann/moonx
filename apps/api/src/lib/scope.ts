import { schema } from "@moonx/db";
import type { Role } from "@moonx/schemas";
import { and, eq, isNull } from "drizzle-orm";
import { ApiError } from "../errors";
import type { Executor } from "./db";
import type { AuthUser } from "./session";

/** What the authorization of one request rests on (SDD 7.1 "実装"). */
export interface Scope {
  workspaceId: string;
  role: Role;
  ideaId: string | null;
  validationId: string | null;
  planId: string | null;
  ideaArchived: boolean;
  planArchived: boolean;
}

/** A resource the request names. The workspace is found from it, never taken from the client. */
export type ScopeRef =
  | { workspaceId: string }
  | { ideaId: string }
  | { validationId: string }
  | { planId: string }
  | { executionItemId: string }
  | { researchLogId: string }
  | { competitorId: string }
  | { assumptionId: string }
  | { riskId: string }
  | { costItemId: string }
  | { evidenceId: string };

interface Found {
  workspaceId: string;
  ideaId: string | null;
  validationId: string | null;
  planId: string | null;
  ideaArchived: boolean;
  planArchived: boolean;
}

const idea = (row: { ideaId: string; workspaceId: string; archivedAt: Date | null }) => ({
  workspaceId: row.workspaceId,
  ideaId: row.ideaId,
  ideaArchived: row.archivedAt != null,
});

async function ideaOf(db: Executor, ideaId: string) {
  const [row] = await db
    .select({
      ideaId: schema.ideas.id,
      workspaceId: schema.ideas.workspaceId,
      archivedAt: schema.ideas.archivedAt,
    })
    .from(schema.ideas)
    .where(eq(schema.ideas.id, ideaId));
  return row ? idea(row) : null;
}

async function validationOf(db: Executor, validationId: string): Promise<Found | null> {
  const [row] = await db
    .select({
      validationId: schema.validations.id,
      ideaId: schema.ideas.id,
      workspaceId: schema.ideas.workspaceId,
      archivedAt: schema.ideas.archivedAt,
    })
    .from(schema.validations)
    .innerJoin(schema.ideas, eq(schema.ideas.id, schema.validations.ideaId))
    .where(eq(schema.validations.id, validationId));
  return row
    ? { ...idea(row), validationId: row.validationId, planId: null, planArchived: false }
    : null;
}

async function planOf(db: Executor, planId: string): Promise<Found | null> {
  const [row] = await db
    .select({
      planId: schema.businessPlans.id,
      planArchivedAt: schema.businessPlans.archivedAt,
      ideaId: schema.ideas.id,
      workspaceId: schema.ideas.workspaceId,
      archivedAt: schema.ideas.archivedAt,
    })
    .from(schema.businessPlans)
    .innerJoin(schema.ideas, eq(schema.ideas.id, schema.businessPlans.ideaId))
    .where(eq(schema.businessPlans.id, planId));
  return row
    ? {
        ...idea(row),
        validationId: null,
        planId: row.planId,
        planArchived: row.planArchivedAt != null,
      }
    : null;
}

/** A row of a validation table: the validation id found, then resolved like the validation. */
async function viaValidation(
  db: Executor,
  lookup: Promise<{ validationId: string }[]>,
): Promise<Found | null> {
  const [row] = await lookup;
  return row ? validationOf(db, row.validationId) : null;
}

async function find(db: Executor, ref: ScopeRef): Promise<Found | null> {
  if ("workspaceId" in ref) {
    const [row] = await db
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, ref.workspaceId));
    return row
      ? {
          workspaceId: row.id,
          ideaId: null,
          validationId: null,
          planId: null,
          ideaArchived: false,
          planArchived: false,
        }
      : null;
  }
  if ("ideaId" in ref) {
    const found = await ideaOf(db, ref.ideaId);
    return found ? { ...found, validationId: null, planId: null, planArchived: false } : null;
  }
  if ("validationId" in ref) return validationOf(db, ref.validationId);
  if ("planId" in ref) return planOf(db, ref.planId);
  if ("executionItemId" in ref) {
    const [row] = await db
      .select({ planId: schema.executionItems.businessPlanId })
      .from(schema.executionItems)
      .where(
        and(
          eq(schema.executionItems.id, ref.executionItemId),
          isNull(schema.executionItems.deletedAt),
        ),
      );
    return row ? planOf(db, row.planId) : null;
  }
  if ("researchLogId" in ref) {
    return viaValidation(
      db,
      db
        .select({ validationId: schema.researchLogEntries.validationId })
        .from(schema.researchLogEntries)
        .where(
          and(
            eq(schema.researchLogEntries.id, ref.researchLogId),
            isNull(schema.researchLogEntries.deletedAt),
          ),
        ),
    );
  }
  if ("competitorId" in ref) {
    return viaValidation(
      db,
      db
        .select({ validationId: schema.competitors.validationId })
        .from(schema.competitors)
        .where(
          and(eq(schema.competitors.id, ref.competitorId), isNull(schema.competitors.deletedAt)),
        ),
    );
  }
  if ("assumptionId" in ref) {
    return viaValidation(
      db,
      db
        .select({ validationId: schema.assumptions.validationId })
        .from(schema.assumptions)
        .where(
          and(eq(schema.assumptions.id, ref.assumptionId), isNull(schema.assumptions.deletedAt)),
        ),
    );
  }
  if ("riskId" in ref) {
    return viaValidation(
      db,
      db
        .select({ validationId: schema.risks.validationId })
        .from(schema.risks)
        .where(and(eq(schema.risks.id, ref.riskId), isNull(schema.risks.deletedAt))),
    );
  }
  if ("costItemId" in ref) {
    return viaValidation(
      db,
      db
        .select({ validationId: schema.costItems.validationId })
        .from(schema.costItems)
        .where(and(eq(schema.costItems.id, ref.costItemId), isNull(schema.costItems.deletedAt))),
    );
  }
  return viaValidation(
    db,
    db
      .select({ validationId: schema.evidenceLinks.validationId })
      .from(schema.evidenceLinks)
      .where(
        and(eq(schema.evidenceLinks.id, ref.evidenceId), isNull(schema.evidenceLinks.deletedAt)),
      ),
  );
}

/**
 * Finds the workspace a resource belongs to and the caller's role in it. 404 when the resource
 * does not exist, 403 NO_ACCESS when the caller is not a member. An operator (`is_admin`) gets no
 * special access to workspace content: only the membership counts (SDD 7.1).
 */
export async function resolveScope(
  db: Executor,
  user: Pick<AuthUser, "id">,
  ref: ScopeRef,
): Promise<Scope> {
  const found = await find(db, ref);
  if (!found) throw new ApiError("NOT_FOUND", "Resource not found");
  const [membership] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.workspaceId, found.workspaceId),
        eq(schema.memberships.userId, user.id),
      ),
    );
  if (!membership) throw new ApiError("NO_ACCESS", "Not a member of this workspace");
  return { ...found, role: membership.role };
}

/** Owner or Member: the roles that may edit (SDD 7.1). */
export function requireEditor(scope: Scope): void {
  if (scope.role === "viewer") throw new ApiError("FORBIDDEN", "Viewers cannot make changes");
}

/** Owner-only operations (SDD 7.1). Throws 403 FORBIDDEN otherwise. */
export function requireOwner(scope: Scope): void {
  if (scope.role !== "owner") throw new ApiError("FORBIDDEN", "Only an Owner can do this");
}

/** The idea or plan the scope sits under must not be archived (design-spec 6.8). */
export function requireNotArchived(scope: Scope): void {
  if (scope.ideaArchived || scope.planArchived) {
    throw new ApiError("ARCHIVED", "Archived items cannot be changed");
  }
}

/**
 * What a route needs from the caller's membership. `writable` changes the content of an idea or
 * plan: 409 ARCHIVED comes first and applies to every role, then 403 for a Viewer (SDD 7.1).
 * `plan-archive-toggle` is `writable` for archiving or restoring a plan: the plan's own archived
 * flag does not block it, an archived idea does.
 */
export type Need = "member" | "editor" | "writable" | "owner" | "plan-archive-toggle";

/** Throws when the scope does not satisfy `need`. */
export function enforce(scope: Scope, need: Need): void {
  if (need === "owner") requireOwner(scope);
  else if (need === "editor") requireEditor(scope);
  else if (need === "writable") {
    requireNotArchived(scope);
    requireEditor(scope);
  } else if (need === "plan-archive-toggle") {
    requireNotArchived({ ...scope, planArchived: false });
    requireEditor(scope);
  }
}

/**
 * `resolveScope` plus `enforce`. Routes get this through the `scoped` / `located` declarations
 * (access.ts); a transaction that must check again after taking its locks calls it directly.
 */
export async function authorize(
  db: Executor,
  user: Pick<AuthUser, "id">,
  ref: ScopeRef,
  need: Need,
): Promise<Scope> {
  const scope = await resolveScope(db, user, ref);
  enforce(scope, need);
  return scope;
}
