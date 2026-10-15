import {
  type Database,
  type DatabaseTransaction,
  memberships,
  selfAnalyses,
  selfAnalysisShares,
  templateQuestions,
  users,
  workspaces,
} from "@moonx/db";
import {
  type CommentTargetType,
  errorBodySchema,
  type Member,
  memberListSchema,
  memberParamsSchema,
  memberRemovalParamsSchema,
  memberRoleUpdateSchema,
  memberSchema,
  mentionCandidatesQuerySchema,
  mentionCandidatesSchema,
  type Role,
  type UserRef,
  type Workspace,
  workspaceCreateSchema,
  workspaceSchema,
  workspaceUpdateSchema,
} from "@moonx/schemas";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AccessPlugin } from "./access";
import { requestContext } from "./entry";
import { ApiError } from "./errors";
import { lockActiveCaller } from "./lock";
import {
  lockMembers,
  memberCounts,
  releaseMember,
  removeMember,
} from "./membership";
import { recordChange, resolveScope, writeInScope } from "./scope";
import { locateTarget } from "./targets";
import { loadUserRefs } from "./user-refs";

/** W0's currency when none is sent (SDD 5.5). */
const DEFAULT_CURRENCY = "PHP";

const noContent = z.undefined().meta({ description: "No content" });

const notAMember = () =>
  new ApiError("NOT_FOUND", "The user is not a member of this workspace");

/** The workspace `workspaceId` as `role` sees it (SDD 5.5 Workspace). */
async function loadWorkspace(
  db: Database | DatabaseTransaction,
  workspaceId: string,
  role: Role,
): Promise<Workspace> {
  const [row] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      currency: workspaces.currency,
      isPersonal: workspaces.isPersonal,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (row === undefined) throw new Error(`No workspace ${workspaceId}`);
  const memberCount = await db.$count(
    memberships,
    eq(memberships.workspaceId, workspaceId),
  );
  return { ...row, myRole: role, memberCount };
}

/**
 * The members of `workspaceId` (SDD 5.5 Member), in the order they joined, or only
 * those in `userIds`. Addresses only for an Owner.
 */
async function loadMembers(
  db: Database | DatabaseTransaction,
  workspaceId: string,
  viewerRole: Role,
  userIds?: readonly string[],
): Promise<Member[]> {
  const rows = await db
    .select({
      userId: memberships.userId,
      email: users.email,
      role: memberships.role,
      joinedAt: memberships.createdAt,
      isPersonalOwner: sql<boolean>`${workspaces.isPersonal} and ${workspaces.createdById} = ${memberships.userId}`,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        userIds === undefined
          ? undefined
          : inArray(memberships.userId, [...userIds]),
      ),
    )
    .orderBy(asc(memberships.createdAt), asc(memberships.userId));
  const refs = await loadUserRefs(
    db,
    rows.map((row) => row.userId),
    workspaceId,
  );
  return rows.map((row) => {
    const user = refs.get(row.userId);
    if (user === undefined) throw new Error(`No user ${row.userId}`);
    return {
      user,
      email: viewerRole === "owner" ? row.email : null,
      role: row.role,
      joinedAt: row.joinedAt.toISOString(),
      isPersonalOwner: row.isPersonalOwner,
    };
  });
}

/**
 * Refuses a caller who stopped being an Owner of `workspaceId` after the request was
 * let in: another Owner demoted or removed them meanwhile. Call it under
 * {@link lockMembers}, which every role change takes.
 *
 * @throws {ApiError} NO_ACCESS or FORBIDDEN
 */
async function requireOwnerStill(
  tx: DatabaseTransaction,
  workspaceId: string,
  callerId: string,
): Promise<void> {
  const [row] = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, callerId),
      ),
    );
  if (row === undefined) {
    throw new ApiError("NO_ACCESS", "The caller left this workspace");
  }
  if (row.role !== "owner") {
    throw new ApiError("FORBIDDEN", "Only an Owner changes members");
  }
}

/** One member, locked for the change the transaction makes to them. */
async function lockedMembership(
  tx: DatabaseTransaction,
  workspaceId: string,
  userId: string,
) {
  const [row] = await tx
    .select({
      role: memberships.role,
      displayName: users.displayName,
      isPersonalOwner: sql<boolean>`${workspaces.isPersonal} and ${workspaces.createdById} = ${memberships.userId}`,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, userId),
      ),
    )
    .for("update", { of: memberships });
  return row;
}

/**
 * The users who may be mentioned on a comment about `target` in `workspaceId`: every
 * member, Viewers included (design-spec 6.0.4). The candidates do not depend on the
 * item, so its key is not checked.
 *
 * @throws {ApiError} NOT_FOUND when the item is not in the workspace: it does not
 * exist, is deleted on its screen, is an idea or plan whose creation was undone, or lies
 * in another workspace
 */
async function workspaceCandidates(
  db: Database,
  workspaceId: string,
  callerId: string,
  target: { type: CommentTargetType; id: string },
): Promise<string[]> {
  const place = await locateTarget(db, target);
  const found =
    place?.scope == null || place.deleted
      ? null
      : await resolveScope(db, place.scope, callerId);
  if (found === null || found.workspaceId !== workspaceId) {
    throw new ApiError("NOT_FOUND", "No such item in this workspace");
  }
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.workspaceId, workspaceId));
  return rows.map((row) => row.userId);
}

/**
 * The users who may be mentioned on a comment about a self-analysis answer shared with
 * `workspaceId` (design-spec 6.0.4): its Owners and Members, who can read it. Viewers
 * cannot read shared self-analyses.
 *
 * @throws {ApiError} NOT_FOUND when there is no such self-analysis or question,
 * FORBIDDEN for a Viewer, NOT_SHARED when it is not shared with the workspace
 */
async function selfAnalysisCandidates(
  db: Database,
  workspaceId: string,
  callerRole: Role,
  selfAnalysisId: string,
  questionKey: string | undefined,
): Promise<string[]> {
  const [analysis] = await db
    .select({
      templateVersionId: selfAnalyses.templateVersionId,
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
    .where(eq(selfAnalyses.id, selfAnalysisId));
  if (analysis === undefined) {
    throw new ApiError("NOT_FOUND", "No such self-analysis");
  }
  if (callerRole === "viewer") {
    throw new ApiError("FORBIDDEN", "Viewers cannot comment on self-analyses");
  }
  if (!analysis.shared) {
    throw new ApiError(
      "NOT_SHARED",
      "The self-analysis is not shared with this workspace",
    );
  }
  const [question] =
    questionKey === undefined
      ? []
      : await db
          .select({ id: templateQuestions.id })
          .from(templateQuestions)
          .where(
            and(
              eq(
                templateQuestions.templateVersionId,
                analysis.templateVersionId,
              ),
              eq(templateQuestions.questionKey, questionKey),
            ),
          );
  if (question === undefined) {
    throw new ApiError("NOT_FOUND", "No such question in the self-analysis");
  }
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        inArray(memberships.role, ["owner", "member"]),
      ),
    );
  return rows.map((row) => row.userId);
}

/** By display name, then id, so the list reads alphabetically and never reorders. */
const byName = (a: UserRef, b: UserRef) =>
  a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" }) ||
  a.id.localeCompare(b.id);

/** What the workspace routes need from the app. */
export interface WorkspaceRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

/** W0–W3 and W8 (SDD 5.5): workspaces, their settings and members. */
export function workspaceRoutes({ access, db, now }: WorkspaceRoutesOptions) {
  return new Elysia()
    .use(access)
    .post(
      "/api/v1/workspaces",
      async ({ caller, body, status }) => {
        const at = new Date(now());
        const id = await db.transaction(async (tx) => {
          await lockActiveCaller(tx, caller.id);
          const [workspace] = await tx
            .insert(workspaces)
            .values({
              name: body.name,
              currency: body.currency ?? DEFAULT_CURRENCY,
              isPersonal: false,
              createdById: caller.id,
              createdAt: at,
              updatedAt: at,
            })
            .returning({ id: workspaces.id });
          if (workspace === undefined) {
            throw new Error("workspace insert returned no row");
          }
          await tx.insert(memberships).values({
            workspaceId: workspace.id,
            userId: caller.id,
            role: "owner",
            createdAt: at,
            updatedAt: at,
          });
          await tx
            .update(users)
            .set({ lastWorkspaceId: workspace.id })
            .where(eq(users.id, caller.id));
          return workspace.id;
        });
        return status(201, await loadWorkspace(db, id, "owner"));
      },
      {
        signedIn: true,
        body: workspaceCreateSchema,
        parse: "json",
        response: {
          201: workspaceSchema,
          401: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "W0 Create a workspace",
          description:
            "The caller becomes its Owner and lands on it. The currency defaults to PHP.",
        },
      },
    )
    .get(
      "/api/v1/workspaces/:workspaceId",
      ({ scope }) => loadWorkspace(db, scope.workspaceId, scope.role),
      {
        scoped: { to: "workspaceId", need: "read" },
        response: {
          200: workspaceSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
        },
        detail: { summary: "W1 A workspace" },
      },
    )
    .patch(
      "/api/v1/workspaces/:workspaceId",
      async ({ scope, body }) => {
        const at = new Date(now());
        await writeInScope(db, scope, at, async (tx) => {
          const [current] = await tx
            .select({ name: workspaces.name, currency: workspaces.currency })
            .from(workspaces)
            .where(eq(workspaces.id, scope.workspaceId))
            .for("no key update");
          if (current === undefined) throw new Error("The workspace is gone");
          const changes = Object.fromEntries(
            (["name", "currency"] as const)
              .filter(
                (field) =>
                  body[field] !== undefined && body[field] !== current[field],
              )
              .map((field) => [field, body[field]]),
          );
          if (Object.keys(changes).length === 0) return;
          await tx
            .update(workspaces)
            .set({ ...changes, updatedAt: at })
            .where(eq(workspaces.id, scope.workspaceId));
          recordChange(tx);
        });
        return loadWorkspace(db, scope.workspaceId, scope.role);
      },
      {
        scoped: { to: "workspaceId", need: "owner" },
        body: workspaceUpdateSchema,
        parse: "json",
        response: {
          200: workspaceSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "W1 Change a workspace's name or currency",
          description: "Owner only. Amounts are not converted.",
        },
      },
    )
    .get(
      "/api/v1/workspaces/:workspaceId/members",
      async ({ scope }) => ({
        items: await loadMembers(db, scope.workspaceId, scope.role),
      }),
      {
        scoped: { to: "workspaceId", need: "read" },
        response: {
          200: memberListSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
        },
        detail: {
          summary: "W2 The members of a workspace",
          description:
            "In the order they joined. Only an Owner gets the addresses.",
        },
      },
    )
    .patch(
      "/api/v1/workspaces/:workspaceId/members/:userId",
      async ({ scope, params, body, caller, request }) => {
        const at = new Date(now());
        await writeInScope(db, scope, at, async (tx) => {
          await lockMembers(tx, scope.workspaceId);
          await requireOwnerStill(tx, scope.workspaceId, caller.id);
          const target = await lockedMembership(
            tx,
            scope.workspaceId,
            params.userId,
          );
          if (target === undefined) throw notAMember();
          if (target.role === body.role) return;
          if (target.isPersonalOwner) {
            throw new ApiError(
              "PERSONAL_OWNER",
              "The owner of a personal workspace stays its Owner",
            );
          }
          if (
            target.role === "owner" &&
            (await memberCounts(tx, scope.workspaceId)).owners === 1
          ) {
            throw new ApiError(
              "LAST_OWNER",
              "A workspace needs at least one Owner",
            );
          }
          await tx
            .update(memberships)
            .set({ role: body.role, updatedAt: at })
            .where(
              and(
                eq(memberships.workspaceId, scope.workspaceId),
                eq(memberships.userId, params.userId),
              ),
            );
          if (body.role === "viewer") {
            await releaseMember(tx, {
              workspaceId: scope.workspaceId,
              userId: params.userId,
              assigneeName: target.displayName,
              actorId: caller.id,
              client: requestContext(request).client,
              at,
            });
          }
          recordChange(tx);
        });
        const [member] = await loadMembers(db, scope.workspaceId, scope.role, [
          params.userId,
        ]);
        if (member === undefined) throw notAMember();
        return member;
      },
      {
        scoped: { to: "workspaceId", need: "owner" },
        params: memberParamsSchema,
        body: memberRoleUpdateSchema,
        parse: "json",
        response: {
          200: memberSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
          409: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "W3 Change a member's role",
          description:
            "Owner only. Becoming a Viewer ends the member's self-analysis share here and names them in free text on their execution items.",
        },
      },
    )
    .delete(
      "/api/v1/workspaces/:workspaceId/members/:userId",
      async ({ scope, params, caller, request, set }) => {
        const userId = params.userId === "me" ? caller.id : params.userId;
        const leaving = userId === caller.id;
        if (!leaving && scope.role !== "owner") {
          throw new ApiError(
            "FORBIDDEN",
            "Only an Owner removes other members",
          );
        }
        const at = new Date(now());
        await writeInScope(db, scope, at, async (tx) => {
          await lockMembers(tx, scope.workspaceId);
          if (!leaving)
            await requireOwnerStill(tx, scope.workspaceId, caller.id);
          const target = await lockedMembership(tx, scope.workspaceId, userId);
          if (target === undefined) throw notAMember();
          if (target.isPersonalOwner) {
            throw leaving
              ? new ApiError(
                  "CANNOT_LEAVE_PERSONAL",
                  "Nobody leaves their own personal workspace",
                )
              : new ApiError(
                  "PERSONAL_OWNER",
                  "The owner of a personal workspace stays in it",
                );
          }
          if (
            target.role === "owner" &&
            (await memberCounts(tx, scope.workspaceId)).owners === 1
          ) {
            throw new ApiError(
              "LAST_OWNER",
              "A workspace needs at least one Owner",
            );
          }
          await removeMember(tx, {
            workspaceId: scope.workspaceId,
            userId,
            assigneeName: target.displayName,
            actorId: caller.id,
            client: requestContext(request).client,
            at,
          });
          recordChange(tx);
        });
        set.status = 204;
      },
      {
        scoped: { to: "workspaceId", need: "read" },
        params: memberRemovalParamsSchema,
        response: {
          204: noContent,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
          409: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "W3 Remove a member, or leave",
          description:
            "An Owner removes anyone; every member may leave with userId me. Ends the member's self-analysis share here and names them in free text on their execution items.",
        },
      },
    )
    .get(
      "/api/v1/workspaces/:workspaceId/mention-candidates",
      async ({ scope, query, caller }) => {
        const userIds =
          query.targetType === "self_analysis_answer"
            ? await selfAnalysisCandidates(
                db,
                scope.workspaceId,
                scope.role,
                query.targetId,
                query.targetKey,
              )
            : await workspaceCandidates(db, scope.workspaceId, caller.id, {
                type: query.targetType,
                id: query.targetId,
              });
        const refs = await loadUserRefs(db, userIds, scope.workspaceId);
        return { items: [...refs.values()].sort(byName) };
      },
      {
        scoped: { to: "workspaceId", need: "read" },
        query: mentionCandidatesQuerySchema,
        response: {
          200: mentionCandidatesSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "W8 Whom a comment may mention",
          description:
            "Every member, Viewers included; 404 NOT_FOUND when the item is not in the workspace (missing, deleted, or another workspace's). On a self-analysis answer (targetKey is its question), only the Owners and Members of a workspace it is shared with, and Viewers may not ask.",
        },
      },
    );
}
