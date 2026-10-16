import {
  businessPlans,
  comments,
  type Database,
  decisionLogEntries,
  ideas,
  memberships,
  notifications,
  planVersions,
  selfAnalyses,
  selfAnalysisShares,
  users,
  validations,
  workspaces,
} from "@moonx/db";
import { i18n } from "@moonx/i18n";
import {
  errorBodySchema,
  linkTargetSchema,
  type Notification,
  notificationIdParamsSchema,
  notificationPageSchema,
  notificationQuerySchema,
  type Role,
  type TargetRef,
  unreadCountSchema,
  uuidSchema,
} from "@moonx/schemas";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AccessPlugin } from "./access";
import { ApiError } from "./errors";
import { excerpt } from "./idea-views";
import { loadItemLabels } from "./labels";
import { loadUserRefs } from "./user-refs";

type NotificationRow = typeof notifications.$inferSelect;
type CommentRow = typeof comments.$inferSelect;
type DecisionRow = typeof decisionLogEntries.$inferSelect;

const noContent = z.undefined().meta({ description: "No content" });

/** `rows`, which a query answers, keyed by their id. */
async function byId<T extends { id: string }>(
  rows: Promise<T[]> | T[],
): Promise<Map<string, T>> {
  return new Map((await rows).map((row) => [row.id, row]));
}

/** What `map` holds for `id`, which the data model guarantees is there. */
const known = <T>(map: ReadonlyMap<string, T>, id: string, what: string): T => {
  const value = map.get(id);
  if (value === undefined) throw new Error(`No ${what} ${id}`);
  return value;
};

const present = <T>(values: readonly (T | null | undefined)[]): T[] => [
  ...new Set(values.filter((value): value is T => value != null)),
];

/**
 * The `Notification` of each of `rows` (SDD 5.11) for `recipientId`: who did what and
 * where in English, the start of the comment or reason, and whether the recipient can
 * still open it.
 */
async function notificationViews(
  db: Database,
  recipientId: string,
  rows: readonly NotificationRow[],
): Promise<Notification[]> {
  if (rows.length === 0) return [];
  const workspaceIds = present(rows.map((row) => row.workspaceId));
  const workspaceNames = new Map(
    (
      await db
        .select({ id: workspaces.id, name: workspaces.name })
        .from(workspaces)
        .where(inArray(workspaces.id, workspaceIds))
    ).map((row) => [row.id, row.name]),
  );
  const roles = new Map<string, Role>(
    (
      await db
        .select({
          workspaceId: memberships.workspaceId,
          role: memberships.role,
        })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, recipientId),
            inArray(memberships.workspaceId, workspaceIds),
          ),
        )
    ).map((row) => [row.workspaceId, row.role]),
  );
  const commentIds = present(rows.map((row) => row.commentId));
  const commentRows: Map<string, CommentRow> =
    commentIds.length === 0
      ? new Map()
      : await byId(
          db.select().from(comments).where(inArray(comments.id, commentIds)),
        );
  const decisionIds = present(rows.map((row) => row.decisionLogEntryId));
  const decisionRows: Map<string, DecisionRow> =
    decisionIds.length === 0
      ? new Map()
      : await byId(
          db
            .select()
            .from(decisionLogEntries)
            .where(inArray(decisionLogEntries.id, decisionIds)),
        );
  const commentList = [...commentRows.values()];
  const decisionList = [...decisionRows.values()];

  // Where each comment is: its idea and plan, or the self-analysis and its owner.
  const containerIds = (type: CommentRow["containerType"]) =>
    present(
      commentList
        .filter((row) => row.containerType === type)
        .map((row) => row.containerId),
    );
  const validationIdeas = new Map(
    containerIds("validation").length === 0
      ? []
      : (
          await db
            .select({ id: validations.id, ideaId: validations.ideaId })
            .from(validations)
            .where(inArray(validations.id, containerIds("validation")))
        ).map((row) => [row.id, row.ideaId]),
  );
  const planIds = present([
    ...containerIds("business_plan"),
    ...decisionList.map((row) => row.businessPlanId),
  ]);
  const plans =
    planIds.length === 0
      ? new Map<string, { id: string; name: string; ideaId: string }>()
      : await byId(
          db
            .select({
              id: businessPlans.id,
              name: businessPlans.name,
              ideaId: businessPlans.ideaId,
            })
            .from(businessPlans)
            .where(inArray(businessPlans.id, planIds)),
        );
  const ideaOfComment = (row: CommentRow): string | null =>
    row.containerType === "idea"
      ? row.containerId
      : row.containerType === "validation"
        ? (validationIdeas.get(row.containerId) ?? null)
        : row.containerType === "business_plan"
          ? (plans.get(row.containerId)?.ideaId ?? null)
          : null;
  const ideaIds = present([
    ...commentList.map(ideaOfComment),
    ...decisionList.map((row) => row.ideaId),
  ]);
  const ideaNames = new Map(
    ideaIds.length === 0
      ? []
      : (
          await db
            .select({ id: ideas.id, name: ideas.name })
            .from(ideas)
            .where(inArray(ideas.id, ideaIds))
        ).map((row) => [row.id, row.name]),
  );
  const analysisIds = containerIds("self_analysis");
  const analyses =
    analysisIds.length === 0
      ? new Map<string, { id: string; ownerId: string; ownerName: string }>()
      : await byId(
          db
            .select({
              id: selfAnalyses.id,
              ownerId: selfAnalyses.userId,
              ownerName: users.displayName,
            })
            .from(selfAnalyses)
            .innerJoin(users, eq(users.id, selfAnalyses.userId))
            .where(inArray(selfAnalyses.id, analysisIds)),
        );
  const shares = new Set(
    analysisIds.length === 0
      ? []
      : (
          await db
            .select({
              analysisId: selfAnalysisShares.selfAnalysisId,
              workspaceId: selfAnalysisShares.workspaceId,
            })
            .from(selfAnalysisShares)
            .where(inArray(selfAnalysisShares.selfAnalysisId, analysisIds))
        ).map((row) => `${row.analysisId}/${row.workspaceId}`),
  );
  const versionIds = present(decisionList.map((row) => row.planVersionId));
  const versionNames = new Map(
    versionIds.length === 0
      ? []
      : (
          await db
            .select({ id: planVersions.id, name: planVersions.name })
            .from(planVersions)
            .where(inArray(planVersions.id, versionIds))
        ).map((row) => [row.id, row.name]),
  );
  const targets: TargetRef[] = commentList.map((row) => ({
    type: row.targetType,
    id: row.targetId,
    key: row.targetKey,
  }));
  const labelOf = await loadItemLabels(db, targets);
  const actors = new Map<string, Awaited<ReturnType<typeof loadUserRefs>>>();
  for (const workspaceId of workspaceIds) {
    actors.set(
      workspaceId,
      await loadUserRefs(
        db,
        present(
          rows
            .filter((row) => row.workspaceId === workspaceId)
            .map((row) => row.actorId),
        ),
        workspaceId,
      ),
    );
  }

  const join = (...parts: string[]) =>
    parts.join(i18n.t("notifications:place.separator"));
  const ideaName = (id: string | null) => {
    if (id === null) throw new Error("A comment in an idea names its idea");
    return known(ideaNames, id, "idea");
  };
  const planPlace = (planId: string) => {
    const plan = known(plans, planId, "plan");
    return join(plan.name, ideaName(plan.ideaId));
  };
  const commentPlace = (row: CommentRow) => {
    if (row.targetType === "idea") return ideaName(row.targetId);
    const label = labelOf({
      type: row.targetType,
      id: row.targetId,
      key: row.targetKey,
    });
    if (row.containerType === "self_analysis") {
      const analysis = known(analyses, row.containerId, "self-analysis");
      return join(
        label,
        analysis.ownerId === recipientId
          ? i18n.t("notifications:place.ownSelfAnalysis")
          : i18n.t("notifications:place.selfAnalysis", {
              name: analysis.ownerName,
            }),
      );
    }
    if (row.containerType === "business_plan") {
      return join(label, planPlace(row.containerId));
    }
    return join(label, ideaName(ideaOfComment(row)));
  };

  return rows.map((row) => {
    const role = roles.get(row.workspaceId) ?? null;
    const actor =
      row.actorId === null
        ? null
        : (actors.get(row.workspaceId)?.get(row.actorId) ?? null);
    const actorName = actor?.displayName ?? i18n.t("notifications:someone");
    const comment =
      row.commentId === null ? undefined : commentRows.get(row.commentId);
    const decision =
      row.decisionLogEntryId === null
        ? undefined
        : decisionRows.get(row.decisionLogEntryId);
    if (comment === undefined && decision === undefined) {
      throw new Error(`Notification ${row.id} names no comment or decision`);
    }
    let accessible = role !== null;
    if (comment?.containerType === "self_analysis") {
      // Only its owner and the Owners and Members of a workspace it is shared with
      // now read a self-analysis (design-spec 6.15).
      const owner = known(
        analyses,
        comment.containerId,
        "self-analysis",
      ).ownerId;
      accessible =
        shares.has(`${comment.containerId}/${comment.workspaceId}`) &&
        (owner === recipientId || (role !== null && role !== "viewer"));
    }
    let title: string;
    let text: string | null = null;
    if (!accessible) {
      // Who acted, and nothing of what the recipient can no longer read: not the
      // comment as edited since, nor the names of the idea, plan or item now.
      const kind = decision?.kind ?? (row.kind as "mention" | "comment");
      title = i18n.t(`notifications:titleNoAccess.${kind}`, {
        actor: actorName,
      });
    } else if (comment !== undefined) {
      title = i18n.t(`notifications:title.${row.kind as "comment"}`, {
        actor: actorName,
        place: commentPlace(comment),
      });
      text = comment.deletedAt === null ? comment.body : null;
    } else if (decision !== undefined) {
      const place =
        decision.businessPlanId === null
          ? ideaName(decision.ideaId)
          : planPlace(decision.businessPlanId);
      title =
        decision.kind === "version_saved"
          ? i18n.t("notifications:title.version_saved", {
              actor: actorName,
              version: known(
                versionNames,
                decision.planVersionId ?? "",
                "saved version",
              ),
              place,
            })
          : i18n.t(`notifications:title.${decision.kind}`, {
              actor: actorName,
              value:
                decision.kind === "go_no_go"
                  ? i18n.t(`common:goNoGo.${decision.value as "launch"}`)
                  : i18n.t(`common:decision.${decision.value as "proceed"}`),
              place,
            });
      text = decision.kind === "version_saved" ? null : decision.reason;
    } else {
      throw new Error(`Notification ${row.id} names no comment or decision`);
    }
    return {
      id: row.id,
      kind: row.kind,
      workspace: {
        id: row.workspaceId,
        name: known(workspaceNames, row.workspaceId, "workspace"),
      },
      actor,
      title,
      excerpt: excerpt(text),
      link: linkTargetSchema.parse(row.link),
      accessible,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/** What the notification routes need from the app. */
export interface NotificationRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

/** N1–N3 (SDD 5.11): 8 Notifications and the unread count of the navigation. */
export function notificationRoutes({
  access,
  db,
  now,
}: NotificationRoutesOptions) {
  return new Elysia()
    .use(access)
    .get(
      "/api/v1/notifications",
      async ({ caller, query }) => {
        const offset = query.cursor ?? 0;
        const rows = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, caller.id),
              query.filter === "unread"
                ? isNull(notifications.readAt)
                : undefined,
            ),
          )
          .orderBy(desc(notifications.createdAt), desc(notifications.id))
          .limit(query.limit + 1)
          .offset(offset);
        const page = rows.slice(0, query.limit);
        return {
          items: await notificationViews(db, caller.id, page),
          nextCursor:
            rows.length > query.limit ? String(offset + query.limit) : null,
        };
      },
      {
        signedIn: true,
        query: notificationQuerySchema,
        response: {
          200: notificationPageSchema,
          401: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "N1 The caller's notifications (8)",
          description:
            "Across workspaces, newest first; filter=unread for the unread only. accessible is false once the caller left the workspace or can no longer read the item; such a notification says only who did what, without the place or the excerpt.",
        },
      },
    )
    .get(
      "/api/v1/notifications/unread-count",
      async ({ caller }) => {
        const [row] = await db
          .select({ total: count() })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, caller.id),
              isNull(notifications.readAt),
            ),
          );
        return { total: row?.total ?? 0 };
      },
      {
        signedIn: true,
        response: { 200: unreadCountSchema, 401: errorBodySchema },
        detail: {
          summary: "N2 How many notifications are unread",
          description:
            "For the badge of the navigation. The client asks when a screen opens, when the app comes to the front and every 60 seconds.",
        },
      },
    )
    .post(
      "/api/v1/notifications/read-all",
      async ({ caller, set }) => {
        await db
          .update(notifications)
          .set({ readAt: new Date(now()) })
          .where(
            and(
              eq(notifications.userId, caller.id),
              isNull(notifications.readAt),
            ),
          );
        set.status = 204;
      },
      {
        signedIn: true,
        response: { 204: noContent, 401: errorBodySchema },
        detail: { summary: "N3 Mark all as read (8)" },
      },
    )
    .post(
      "/api/v1/notifications/:id/read",
      async ({ caller, params, set }) => {
        const mine = and(
          eq(notifications.id, params.id),
          eq(notifications.userId, caller.id),
        );
        const [row] = uuidSchema.safeParse(params.id).success
          ? await db
              .select({ id: notifications.id })
              .from(notifications)
              .where(mine)
          : [];
        if (row === undefined) {
          throw new ApiError("NOT_FOUND", "No such notification");
        }
        await db
          .update(notifications)
          .set({ readAt: new Date(now()) })
          .where(and(mine, isNull(notifications.readAt)));
        set.status = 204;
      },
      {
        signedIn: true,
        params: notificationIdParamsSchema,
        response: {
          204: noContent,
          401: errorBodySchema,
          404: errorBodySchema,
        },
        detail: {
          summary: "N3 Mark a notification as read (8)",
          description:
            "The caller's own only; another person's is 404 NOT_FOUND. Reading it again changes nothing.",
        },
      },
    );
}
