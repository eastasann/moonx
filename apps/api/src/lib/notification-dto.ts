import { schema } from "@moonx/db";
import type { LinkTarget, Notification, UserRef } from "@moonx/schemas";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ApiError } from "../errors";
import { locateTarget } from "./comment-target";
import type { Executor } from "./db";
import { type DecisionLogSummary, excerpt, loadDecisionSummaries } from "./decision-log";
import { iso, isoOrNull } from "./dto";
import { i18n } from "./i18n";
import { decodeCursor, toPage } from "./page";
import { loadUserRefs } from "./users";

type Row = typeof schema.notifications.$inferSelect & { workspaceName: string };

const group = <T>(items: T[], by: (item: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(by(item), [...(groups.get(by(item)) ?? []), item]);
  return groups;
};

/** The short name of the item a comment notification is about; a generic phrase if it is gone. */
async function labelOf(db: Executor, link: LinkTarget): Promise<string> {
  const target = link.target;
  if (!target) return i18n.t("common:notification.unknownTarget");
  try {
    const located = await locateTarget(db, {
      type: target.type as Parameters<typeof locateTarget>[1]["type"],
      id: target.id,
      key: target.key ?? null,
    });
    return located.label;
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") {
      return i18n.t("common:notification.unknownTarget");
    }
    throw error;
  }
}

/**
 * Which of the notifications still lead somewhere the person may open (SDD 5.11 `accessible`,
 * design-spec 6.16). Leaving the workspace closes all of its notifications. A comment on a self
 * analysis also needs the right to read it: being its owner, or an Owner / Member of a workspace
 * it is still shared with.
 */
async function accessibleIds(db: Executor, userId: string, rows: Row[]): Promise<Set<string>> {
  const memberships = await db
    .select({ workspaceId: schema.memberships.workspaceId, role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, userId),
        inArray(schema.memberships.workspaceId, [...new Set(rows.map((r) => r.workspaceId))]),
      ),
    );
  const roleIn = new Map(memberships.map((m) => [m.workspaceId, m.role]));
  const analysisIds = [
    ...new Set(
      rows.flatMap((r) => {
        const target = (r.link as LinkTarget).target;
        return target?.type === "self_analysis_answer" ? [target.id] : [];
      }),
    ),
  ];
  const [owners, shares] =
    analysisIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({ id: schema.selfAnalyses.id, ownerId: schema.selfAnalyses.userId })
            .from(schema.selfAnalyses)
            .where(inArray(schema.selfAnalyses.id, analysisIds)),
          db
            .select({
              analysisId: schema.selfAnalysisShares.selfAnalysisId,
              workspaceId: schema.selfAnalysisShares.workspaceId,
            })
            .from(schema.selfAnalysisShares)
            .where(inArray(schema.selfAnalysisShares.selfAnalysisId, analysisIds)),
        ]);
  const ownerOf = new Map(owners.map((o) => [o.id, o.ownerId]));
  const shared = new Set(shares.map((s) => `${s.analysisId}:${s.workspaceId}`));
  const ok = new Set<string>();
  for (const row of rows) {
    const role = roleIn.get(row.workspaceId);
    if (!role) continue;
    const target = (row.link as LinkTarget).target;
    if (target?.type === "self_analysis_answer") {
      const reads =
        ownerOf.get(target.id) === userId ||
        (role !== "viewer" && shared.has(`${target.id}:${row.workspaceId}`));
      if (!reads) continue;
    }
    ok.add(row.id);
  }
  return ok;
}

function dueTitle(stage: string | null, title: string): string {
  return i18n.t(`common:notification.due_${stage}`, { title });
}

function decisionTitle(actor: string, summary: DecisionLogSummary | undefined): string {
  if (!summary) return i18n.t("common:notification.decision", { actor, idea: "" }).trimEnd();
  if (summary.kind === "go_no_go") {
    return i18n.t("common:notification.goNoGo", { actor, plan: summary.plan?.name ?? "" });
  }
  if (summary.kind === "version_saved") {
    return i18n.t("common:notification.versionSaved", {
      actor,
      version: summary.versionName ?? "",
      plan: summary.plan?.name ?? "",
    });
  }
  return i18n.t("common:notification.decision", { actor, idea: summary.idea.name });
}

/** N1: the person's notifications across workspaces, newest first. */
export async function listNotifications(
  db: Executor,
  userId: string,
  q: { filter: "all" | "unread"; cursor: string | undefined; limit: number },
) {
  const offset = decodeCursor(q.cursor);
  const fetched = await db
    .select({ n: schema.notifications, workspaceName: schema.workspaces.name })
    .from(schema.notifications)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.notifications.workspaceId))
    .where(
      and(
        eq(schema.notifications.userId, userId),
        q.filter === "unread" ? isNull(schema.notifications.readAt) : undefined,
      ),
    )
    .orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id))
    .limit(q.limit + 1)
    .offset(offset);
  const page = toPage(
    fetched.map((f) => ({ ...f.n, workspaceName: f.workspaceName })),
    offset,
    q.limit,
  );
  const rows = page.items;
  if (rows.length === 0) return { items: [] as Notification[], nextCursor: page.nextCursor };

  const byWorkspace = group(rows, (r) => r.workspaceId);
  const actorRefs = new Map<string, Map<string, UserRef>>();
  const decisions = new Map<string, DecisionLogSummary>();
  for (const [workspaceId, inWorkspace] of byWorkspace) {
    actorRefs.set(
      workspaceId,
      await loadUserRefs(
        db,
        inWorkspace.map((r) => r.actorId),
        workspaceId,
      ),
    );
    const decisionIds = inWorkspace.flatMap((r) =>
      r.decisionLogEntryId ? [r.decisionLogEntryId] : [],
    );
    if (decisionIds.length > 0) {
      const summaries = await loadDecisionSummaries(
        db,
        workspaceId,
        inArray(schema.decisionLogEntries.id, decisionIds),
        decisionIds.length,
      );
      for (const s of summaries) decisions.set(s.id, s);
    }
  }
  const commentIds = rows.flatMap((r) => (r.commentId ? [r.commentId] : []));
  const itemIds = rows.flatMap((r) => (r.executionItemId ? [r.executionItemId] : []));
  const [comments, items, accessible] = await Promise.all([
    commentIds.length === 0
      ? []
      : db
          .select({
            id: schema.comments.id,
            body: schema.comments.body,
            deletedAt: schema.comments.deletedAt,
          })
          .from(schema.comments)
          .where(inArray(schema.comments.id, commentIds)),
    itemIds.length === 0
      ? []
      : db
          .select({ id: schema.executionItems.id, title: schema.executionItems.title })
          .from(schema.executionItems)
          .where(inArray(schema.executionItems.id, itemIds)),
    accessibleIds(db, userId, rows),
  ]);
  const commentOf = new Map(comments.map((c) => [c.id, c]));
  const itemOf = new Map(items.map((i) => [i.id, i.title]));
  const labels = new Map<string, string>();
  for (const row of rows) {
    if (row.kind !== "mention" && row.kind !== "comment") continue;
    if (!accessible.has(row.id)) continue;
    const link = row.link as LinkTarget;
    const key = `${link.target?.type}:${link.target?.id}:${link.target?.key ?? ""}`;
    if (!labels.has(key)) labels.set(key, await labelOf(db, link));
  }

  const out: Notification[] = rows.map((row) => {
    const link = row.link as LinkTarget;
    const actor = row.actorId ? (actorRefs.get(row.workspaceId)?.get(row.actorId) ?? null) : null;
    const actorName = actor?.displayName ?? i18n.t("common:deletedUser");
    const comment = row.commentId ? commentOf.get(row.commentId) : undefined;
    // Text of something the person can no longer read must not leave through the notification.
    if (!accessible.has(row.id)) {
      return {
        id: row.id,
        kind: row.kind,
        workspace: { id: row.workspaceId, name: row.workspaceName },
        actor,
        title: "",
        excerpt: null,
        link,
        accessible: false,
        readAt: isoOrNull(row.readAt),
        createdAt: iso(row.createdAt),
      };
    }
    let title: string;
    let text: string | null = null;
    if (row.kind === "mention" || row.kind === "comment") {
      const target = labels.get(
        `${link.target?.type}:${link.target?.id}:${link.target?.key ?? ""}`,
      ) as string;
      title = i18n.t(`common:notification.${row.kind}`, { actor: actorName, target });
      text = comment && !comment.deletedAt ? excerpt(comment.body) : null;
    } else if (row.kind === "decision") {
      const summary = row.decisionLogEntryId ? decisions.get(row.decisionLogEntryId) : undefined;
      title = decisionTitle(actorName, summary);
      text = summary?.reasonExcerpt ?? null;
    } else {
      title = dueTitle(row.dueStage, itemOf.get(row.executionItemId ?? "") ?? "");
    }
    return {
      id: row.id,
      kind: row.kind,
      workspace: { id: row.workspaceId, name: row.workspaceName },
      actor,
      title,
      excerpt: text,
      link,
      accessible: true,
      readAt: isoOrNull(row.readAt),
      createdAt: iso(row.createdAt),
    };
  });
  return { items: out, nextCursor: page.nextCursor };
}
