import {
  assumptions,
  businessPlans,
  changeHistory,
  comments,
  competitors,
  costItems,
  type Database,
  decisionLogEntries,
  executionItems,
  ideas,
  planVersions,
  researchLogEntries,
  risks,
  users,
  validations,
} from "@moonx/db";
import { formatIsoDate } from "@moonx/i18n";
import {
  type Activity,
  type DueItem,
  dashboardActivitySchema,
  dashboardDueSoonSchema,
  dashboardIdeasSchema,
  dashboardSelfAnalysesSchema,
  errorBodySchema,
  type LinkTarget,
  type TargetRef,
} from "@moonx/schemas";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  not,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { Elysia } from "elysia";
import type { AccessPlugin } from "./access";
import { ideaSummaries, loadIdeaContexts } from "./idea-views";
import { loadItemLabels } from "./labels";
import { type ItemPlace, itemLink } from "./links";
import { memberSelfAnalyses } from "./self-analysis";
import { loadUserRefs } from "./user-refs";

/** How many moves Recent activity shows (design-spec 6.9). */
const ACTIVITY_LIMIT = 20;
/**
 * Saves of one item by one person this close after each other read as one move
 * (design-spec 6.9): autosave writes a history row each time typing stops.
 */
const ACTIVITY_MERGE_MS = 10 * 60 * 1000;
/** How far ahead Due soon looks, in days (design-spec 6.9). */
const DUE_SOON_DAYS = 7;
/** The history rows read at a time while gathering Recent activity. */
const HISTORY_BATCH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `value`, which the data model guarantees here. */
const required = <T>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) throw new Error(`No ${what}`);
  return value;
};

/** Whether a comment is on a `type` row of `table` that is deleted (design-spec 6.9). */
const onDeletedRow = (
  type: string,
  table:
    | typeof researchLogEntries
    | typeof competitors
    | typeof assumptions
    | typeof risks
    | typeof costItems
    | typeof executionItems,
  db: Database,
): SQL =>
  sql`(${comments.targetType} = ${type} and exists (${db
    .select({ one: sql`1` })
    .from(table as typeof competitors)
    .where(
      and(eq(table.id, comments.targetId), isNotNull(table.deletedAt)),
    )}))`;

interface PendingActivity {
  kind: Activity["kind"];
  actorId: string;
  at: Date;
  ideaId: string;
  planId: string | null;
  /** A change or comment on one item: labelled and linked by it. */
  target: TargetRef | null;
  /** A comment's item opens with the comment panel. */
  comment: boolean;
  /** A decision's value or a saved version's name. */
  summary: string | null;
}

/** What the dashboard routes need from the app. */
export interface DashboardRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

const errors = {
  401: errorBodySchema,
  403: errorBodySchema,
  404: errorBodySchema,
} as const;

/** D1–D4 (SDD 5.6): the blocks of 5 Dashboard. */
export function dashboardRoutes({ access, db, now }: DashboardRoutesOptions) {
  /**
   * The history of `workspaceId` as moves (design-spec 6.9), newest first, at most
   * {@link ACTIVITY_LIMIT}. One operation is one move: the rows of one batch, or else
   * the rows one request wrote (one person, one moment, one idea), such as an idea and
   * its cost rows. An operation on one item joins the run of saves of that item by the
   * same person, each within {@link ACTIVITY_MERGE_MS} of the next, shown at the last.
   * Moves are made newest first, so the first ones made are the newest; older
   * operations only join them.
   */
  async function historyMoves(workspaceId: string): Promise<PendingActivity[]> {
    const ideaOf = sql<string>`coalesce(
      case when ${changeHistory.containerType} = 'idea' then ${changeHistory.containerId} end,
      ${validations.ideaId},
      ${businessPlans.ideaId}
    )`;
    const operation = sql<string>`coalesce(
      'batch/' || ${changeHistory.batchId}::text,
      ${changeHistory.changedById}::text || '/' || ${changeHistory.changedAt}::text || '/' || ${ideaOf}::text
    )`;
    const lastAt = sql<Date>`max(${changeHistory.changedAt})`.mapWith(
      changeHistory.changedAt,
    );
    const moves: PendingActivity[] = [];
    /** The latest move on each item, which an earlier save may still join. */
    const runs = new Map<string, PendingActivity | null>();
    /** Where the page before ended: operations sort by their last moment, then key. */
    let after: { at: string; key: string } | null = null;
    for (;;) {
      const operations = await db
        .select({
          key: operation,
          at: lastAt,
          atText: sql<string>`max(${changeHistory.changedAt})::text`,
          actorId: sql<string>`min(${changeHistory.changedById}::text)`,
          ideaId: sql<string>`min(${ideaOf}::text)`,
          planId: sql<string | null>`min(${businessPlans.id}::text)`,
          rows: sql<number>`count(*)::int`,
          targetType: sql<string>`min(${changeHistory.targetType})`,
          targetId: sql<string>`min(${changeHistory.targetId}::text)`,
          targetKey: sql<string | null>`min(${changeHistory.targetKey})`,
        })
        .from(changeHistory)
        .leftJoin(
          validations,
          and(
            eq(changeHistory.containerType, "validation"),
            eq(validations.id, changeHistory.containerId),
          ),
        )
        .leftJoin(
          businessPlans,
          and(
            eq(changeHistory.containerType, "business_plan"),
            eq(businessPlans.id, changeHistory.containerId),
          ),
        )
        .innerJoin(ideas, eq(ideas.id, ideaOf))
        .where(
          and(
            eq(changeHistory.workspaceId, workspaceId),
            isNull(ideas.deletedAt),
            or(isNull(businessPlans.id), isNull(businessPlans.deletedAt)),
          ),
        )
        .groupBy(operation)
        .having(
          after === null
            ? undefined
            : sql`(max(${changeHistory.changedAt}), ${operation}) < (${after.at}::timestamptz, ${after.key})`,
        )
        .orderBy(desc(lastAt), desc(operation))
        .limit(HISTORY_BATCH);
      for (const op of operations) {
        const move: PendingActivity = {
          kind: "change",
          actorId: op.actorId,
          at: op.at,
          ideaId: op.ideaId,
          planId: op.planId,
          target: null,
          comment: false,
          summary: null,
        };
        if (op.rows > 1 || op.key.startsWith("batch/")) {
          if (moves.length === ACTIVITY_LIMIT) return moves;
          moves.push(move);
          continue;
        }
        const target: TargetRef = {
          type: op.targetType as TargetRef["type"],
          id: op.targetId,
          key: op.targetKey,
        };
        const item = `${target.type}/${target.id}/${target.key ?? ""}`;
        const run = runs.get(item);
        if (
          run !== undefined &&
          run !== null &&
          run.actorId === op.actorId &&
          run.at.getTime() - op.at.getTime() <= ACTIVITY_MERGE_MS
        ) {
          // The run is shown at its last save; it now starts here.
          runs.set(item, { ...run, at: op.at });
          continue;
        }
        if (moves.length === ACTIVITY_LIMIT) return moves;
        moves.push({ ...move, target });
        runs.set(item, { ...move, target });
      }
      const last = operations.at(-1);
      if (last === undefined || operations.length < HISTORY_BATCH) return moves;
      after = { at: last.atText, key: last.key };
    }
  }

  return new Elysia()
    .use(access)
    .get(
      "/api/v1/workspaces/:workspaceId/dashboard/ideas",
      async ({ scope }) => {
        const rows = await db
          .select()
          .from(ideas)
          .where(
            and(
              eq(ideas.workspaceId, scope.workspaceId),
              isNull(ideas.deletedAt),
              isNull(ideas.archivedAt),
            ),
          );
        const shown = rows
          .filter((row) => row.latestDecision !== "drop")
          .sort(
            (a, b) =>
              b.lastActivityAt.getTime() - a.lastActivityAt.getTime() ||
              a.id.localeCompare(b.id),
          );
        const contexts = await loadIdeaContexts(db, shown, scope.role);
        return {
          items: await ideaSummaries(db, scope.workspaceId, contexts),
          droppedCount: rows.length - shown.length,
        };
      },
      {
        scoped: { to: "workspaceId", need: "read" },
        response: { 200: dashboardIdeasSchema, ...errors },
        detail: {
          summary: "D1 The ideas of the dashboard",
          description:
            "Not archived and not Drop, by latest activity. droppedCount counts the Drop ideas not archived.",
        },
      },
    )
    .get(
      "/api/v1/workspaces/:workspaceId/dashboard/self-analyses",
      ({ scope }) => memberSelfAnalyses(db, scope.workspaceId),
      {
        scoped: { to: "workspaceId", need: "write" },
        response: { 200: dashboardSelfAnalysesSchema, ...errors },
        detail: {
          summary: "D2 The members' self-analyses",
          description:
            "Owners and Members by name. How far a self-analysis is shows only when it is shared with this workspace.",
        },
      },
    )
    .get(
      "/api/v1/workspaces/:workspaceId/dashboard/due-soon",
      async ({ scope, caller }) => {
        const [me] = await db
          .select({ timezone: users.timezone })
          .from(users)
          .where(eq(users.id, caller.id));
        const today = formatIsoDate(new Date(now()), {
          timeZone: me?.timezone ?? "UTC",
        });
        const until = new Date(
          Date.parse(`${today}T00:00:00Z`) + DUE_SOON_DAYS * DAY_MS,
        )
          .toISOString()
          .slice(0, 10);
        const rows = await db
          .select({
            id: executionItems.id,
            type: executionItems.type,
            title: executionItems.title,
            dueDate: executionItems.dueDate,
            assigneeUserId: executionItems.assigneeUserId,
            assigneeName: executionItems.assigneeName,
            ideaId: ideas.id,
            ideaName: ideas.name,
            planId: businessPlans.id,
            planName: businessPlans.name,
          })
          .from(executionItems)
          .innerJoin(
            businessPlans,
            eq(businessPlans.id, executionItems.businessPlanId),
          )
          .innerJoin(ideas, eq(ideas.id, businessPlans.ideaId))
          .where(
            and(
              eq(ideas.workspaceId, scope.workspaceId),
              isNull(ideas.deletedAt),
              isNull(ideas.archivedAt),
              isNull(businessPlans.deletedAt),
              isNull(businessPlans.archivedAt),
              isNull(executionItems.deletedAt),
              inArray(executionItems.type, [
                "milestone",
                "launch",
                "open_question",
                "next_action",
              ]),
              lte(executionItems.dueDate, until),
              or(
                isNull(executionItems.status),
                and(
                  ne(executionItems.status, "done"),
                  ne(executionItems.status, "resolved"),
                ),
              ),
            ),
          )
          .orderBy(
            asc(executionItems.dueDate),
            asc(sql`lower(${executionItems.title})`),
            asc(executionItems.id),
          );
        const refs = await loadUserRefs(
          db,
          rows.flatMap((row) =>
            row.assigneeUserId === null ? [] : [row.assigneeUserId],
          ),
          scope.workspaceId,
        );
        const items = rows.map((row): DueItem => {
          const user =
            row.assigneeUserId === null
              ? undefined
              : refs.get(row.assigneeUserId);
          return {
            id: row.id,
            type: row.type,
            title: row.title,
            dueDate: row.dueDate as string,
            overdue: (row.dueDate as string) < today,
            assignee:
              user !== undefined
                ? { user }
                : row.assigneeName !== null
                  ? { name: row.assigneeName }
                  : null,
            isMine: row.assigneeUserId === caller.id,
            idea: { id: row.ideaId, name: row.ideaName },
            plan: { id: row.planId, name: row.planName },
          };
        });
        return {
          items: [
            ...items.filter((item) => item.isMine),
            ...items.filter((item) => !item.isMine),
          ],
        };
      },
      {
        scoped: { to: "workspaceId", need: "read" },
        response: { 200: dashboardDueSoonSchema, ...errors },
        detail: {
          summary: "D3 Execution items due soon",
          description:
            "Not Done or Resolved, overdue or due within 7 days of today in the caller's time zone, outside archived ideas and plans. The caller's own first, then by due date.",
        },
      },
    )
    .get(
      "/api/v1/workspaces/:workspaceId/dashboard/activity",
      async ({ scope, caller }) => {
        const workspaceId = scope.workspaceId;
        const changes = await historyMoves(workspaceId);
        const commentRows = await db
          .select({
            authorId: comments.authorId,
            createdAt: comments.createdAt,
            containerType: comments.containerType,
            containerId: comments.containerId,
            targetType: comments.targetType,
            targetId: comments.targetId,
            targetKey: comments.targetKey,
            ideaId: ideas.id,
            planId: businessPlans.id,
          })
          .from(comments)
          .leftJoin(
            validations,
            and(
              eq(comments.containerType, "validation"),
              eq(validations.id, comments.containerId),
            ),
          )
          .leftJoin(
            businessPlans,
            and(
              eq(comments.containerType, "business_plan"),
              eq(businessPlans.id, comments.containerId),
            ),
          )
          .innerJoin(
            ideas,
            eq(
              ideas.id,
              sql<string>`coalesce(
                case when ${comments.containerType} = 'idea' then ${comments.containerId} end,
                ${validations.ideaId},
                ${businessPlans.ideaId}
              )`,
            ),
          )
          .where(
            and(
              eq(comments.workspaceId, workspaceId),
              ne(comments.containerType, "self_analysis"),
              isNull(comments.deletedAt),
              isNull(ideas.deletedAt),
              or(isNull(businessPlans.id), isNull(businessPlans.deletedAt)),
              not(
                or(
                  onDeletedRow("research_log_entry", researchLogEntries, db),
                  onDeletedRow("competitor", competitors, db),
                  onDeletedRow("assumption", assumptions, db),
                  onDeletedRow("risk", risks, db),
                  onDeletedRow("cost_item", costItems, db),
                  onDeletedRow("execution_item", executionItems, db),
                ) as SQL,
              ),
            ),
          )
          .orderBy(desc(comments.createdAt), desc(comments.id))
          .limit(ACTIVITY_LIMIT);
        const decisionRows = await db
          .select({
            kind: decisionLogEntries.kind,
            value: decisionLogEntries.value,
            recordedById: decisionLogEntries.recordedById,
            recordedAt: decisionLogEntries.recordedAt,
            ideaId: decisionLogEntries.ideaId,
            planId: decisionLogEntries.businessPlanId,
            versionName: planVersions.name,
          })
          .from(decisionLogEntries)
          .innerJoin(ideas, eq(ideas.id, decisionLogEntries.ideaId))
          .leftJoin(
            businessPlans,
            eq(businessPlans.id, decisionLogEntries.businessPlanId),
          )
          .leftJoin(
            planVersions,
            eq(planVersions.id, decisionLogEntries.planVersionId),
          )
          .where(
            and(
              eq(decisionLogEntries.workspaceId, workspaceId),
              isNull(ideas.deletedAt),
              or(isNull(businessPlans.id), isNull(businessPlans.deletedAt)),
            ),
          )
          .orderBy(
            desc(decisionLogEntries.recordedAt),
            desc(decisionLogEntries.createdAt),
            desc(decisionLogEntries.id),
          )
          .limit(ACTIVITY_LIMIT);

        const pending = [
          ...changes,
          ...commentRows.map(
            (row): PendingActivity => ({
              kind: "comment",
              actorId: row.authorId,
              at: row.createdAt,
              ideaId: row.ideaId,
              planId: row.planId,
              target: {
                type: row.targetType,
                id: row.targetId,
                key: row.targetKey,
              },
              comment: true,
              summary: null,
            }),
          ),
          ...decisionRows.map(
            (row): PendingActivity => ({
              kind: row.kind === "validation_decision" ? "decision" : row.kind,
              actorId: row.recordedById,
              at: row.recordedAt,
              ideaId: row.ideaId,
              planId: row.planId,
              target: null,
              comment: false,
              summary:
                row.kind === "version_saved"
                  ? required(row.versionName, "version name")
                  : required(row.value, "decision value"),
            }),
          ),
        ]
          .sort((a, b) => b.at.getTime() - a.at.getTime())
          .slice(0, ACTIVITY_LIMIT);

        const labels = await loadItemLabels(
          db,
          pending.flatMap((move) =>
            move.target === null ? [] : [move.target],
          ),
        );
        const ideaNames = await namesById(
          ideas,
          pending.map((move) => move.ideaId),
        );
        const planNames = await namesById(
          businessPlans,
          pending.flatMap((move) =>
            move.planId === null ? [] : [move.planId],
          ),
        );
        const actors = await loadUserRefs(
          db,
          pending.map((move) => move.actorId),
          workspaceId,
        );
        const items = pending.map((move): Activity => {
          const place: ItemPlace = {
            workspaceId,
            ideaId: move.ideaId,
            planId: move.planId,
            selfAnalysisOwnerId: null,
          };
          const hub: LinkTarget =
            move.planId === null
              ? { screen: 13, workspaceId, ideaId: move.ideaId }
              : {
                  screen: 20,
                  workspaceId,
                  ideaId: move.ideaId,
                  planId: move.planId,
                };
          const ideaName = required(ideaNames.get(move.ideaId), "idea");
          const planName =
            move.planId === null
              ? null
              : required(planNames.get(move.planId), "plan");
          const link: LinkTarget =
            move.target === null
              ? hub
              : move.comment
                ? {
                    ...itemLink(move.target, place, caller.id),
                    panel: "comments",
                    target: move.target,
                  }
                : itemLink(move.target, place, caller.id);
          const actor = actors.get(move.actorId);
          if (actor === undefined) throw new Error(`No user ${move.actorId}`);
          return {
            kind: move.kind,
            actor,
            at: move.at.toISOString(),
            summary:
              move.summary ??
              (move.target === null
                ? (planName ?? ideaName)
                : labels(move.target)),
            idea: { id: move.ideaId, name: ideaName },
            plan:
              move.planId === null || planName === null
                ? null
                : { id: move.planId, name: planName },
            link,
          };
        });
        return { items };

        async function namesById(
          table: typeof ideas | typeof businessPlans,
          ids: readonly string[],
        ) {
          const unique = [...new Set(ids)];
          if (unique.length === 0) return new Map<string, string>();
          const rows = await db
            .select({ id: table.id, name: table.name })
            .from(table as typeof ideas)
            .where(inArray(table.id, unique));
          return new Map(rows.map((row) => [row.id, row.name]));
        }
      },
      {
        scoped: { to: "workspaceId", need: "read" },
        response: { 200: dashboardActivitySchema, ...errors },
        detail: {
          summary: "D4 Recent activity",
          description:
            "The latest 20 changes, comments and decision log entries, newest first. An operation over many items is one move, and saves of one item by one person within 10 minutes of each other are one, at the last. Nothing about self-analyses.",
        },
      },
    );
}
