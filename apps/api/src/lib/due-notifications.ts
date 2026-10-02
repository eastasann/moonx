import { schema } from "@moonx/db";
import type { DueNotificationsResult, ExecutionType, LinkTarget } from "@moonx/schemas";
import { and, eq, isNotNull, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import type { AppContext } from "../context";
import { addDays, localTime, resolveTimeZone } from "./timezone";

type DueStage = (typeof schema.notifications.$inferInsert)["dueStage"] & string;

/** Hour (assignee's local time) from which the day's notice may be created (design-spec 6.13). */
const NOTICE_HOUR = 8;

/** The `tab` of the execution route (SDD 4) that shows each item type. */
export const EXECUTION_TAB: Record<ExecutionType, string> = {
  milestone: "milestones",
  launch: "launch",
  kpi: "kpis",
  open_question: "questions",
  next_action: "actions",
};

/**
 * Every stage an item has reached on `today`, oldest first: empty while the due date is more than
 * 3 days away, then "three_days_before", plus "due_day" from the due date, plus "overdue" after it.
 * All of them are returned, not just the latest, so a run after an outage still creates the stages
 * that were missed (ADR-014: not missing any); the unique key keeps each stage to one notice.
 */
export function dueStagesOn(dueDate: string, today: string): DueStage[] {
  const stages: DueStage[] = [];
  if (today >= addDays(dueDate, -3)) stages.push("three_days_before");
  if (today >= dueDate) stages.push("due_day");
  if (today > dueDate) stages.push("overdue");
  return stages;
}

/** Rows per INSERT; see the loop in `processDueNotifications`. */
const INSERT_CHUNK = 1000;

/**
 * Z3: creates the due notices that are owed at this moment (SDD 5.14, ADR-014, design-spec 6.13).
 * Called hourly; the unique key `(execution_item_id, due_date, due_stage)` makes a repeated or
 * concurrent run harmless, and a new due date is a new key, so changing the date sends again.
 */
export async function processDueNotifications(
  ctx: Pick<AppContext, "db" | "now" | "logger">,
): Promise<DueNotificationsResult> {
  const { db, logger } = ctx;
  const now = ctx.now();
  // Local dates differ from the UTC date by at most one day (UTC-12 to UTC+14), and a stage
  // starts 3 days before the due date, so nothing due later than this can be in a stage anywhere.
  const horizon = addDays(now.toISOString().slice(0, 10), 4);

  const items = await db
    .select({
      id: schema.executionItems.id,
      type: schema.executionItems.type,
      title: schema.executionItems.title,
      dueDate: schema.executionItems.dueDate,
      assigneeId: schema.users.id,
      timezone: schema.users.timezone,
      workspaceId: schema.ideas.workspaceId,
      ideaId: schema.ideas.id,
      planId: schema.businessPlans.id,
    })
    .from(schema.executionItems)
    .innerJoin(
      schema.businessPlans,
      eq(schema.businessPlans.id, schema.executionItems.businessPlanId),
    )
    .innerJoin(schema.ideas, eq(schema.ideas.id, schema.businessPlans.ideaId))
    .innerJoin(schema.users, eq(schema.users.id, schema.executionItems.assigneeUserId))
    .innerJoin(
      schema.memberships,
      and(
        eq(schema.memberships.workspaceId, schema.ideas.workspaceId),
        eq(schema.memberships.userId, schema.users.id),
      ),
    )
    .where(
      and(
        isNotNull(schema.executionItems.dueDate),
        isNull(schema.executionItems.deletedAt),
        isNull(schema.ideas.archivedAt),
        isNull(schema.businessPlans.archivedAt),
        eq(schema.users.status, "active"),
        or(
          isNull(schema.executionItems.status),
          notInArray(schema.executionItems.status, ["done", "resolved"]),
        ),
        lte(schema.executionItems.dueDate, horizon),
      ),
    );

  const due = items.flatMap((item) => {
    const zone = resolveTimeZone(item.timezone);
    if (zone !== item.timezone) {
      logger.log("warn", "unknown time zone, using the default", {
        userId: item.assigneeId,
        timezone: item.timezone,
      });
    }
    const local = localTime(now, zone);
    if (local.hour < NOTICE_HOUR) return [];
    // The query keeps only rows with a due date.
    const dueDate = item.dueDate as string;
    return dueStagesOn(dueDate, local.date).map((stage) => ({ item, dueDate, stage }));
  });
  if (due.length === 0) return { checkedItems: items.length, created: 0 };

  const link = (item: (typeof items)[number]): LinkTarget => ({
    screen: 22,
    workspaceId: item.workspaceId,
    ideaId: item.ideaId,
    planId: item.planId,
    tab: EXECUTION_TAB[item.type],
    rowId: item.id,
  });
  let created = 0;
  // A statement carries at most 65,534 bind parameters, and a long outage leaves many stages to make.
  for (let from = 0; from < due.length; from += INSERT_CHUNK) {
    const inserted = await db
      .insert(schema.notifications)
      .values(
        due.slice(from, from + INSERT_CHUNK).map(({ item, dueDate, stage }) => ({
          userId: item.assigneeId,
          workspaceId: item.workspaceId,
          kind: "due" as const,
          executionItemId: item.id,
          dueStage: stage,
          dueDate,
          link: link(item),
          createdAt: now,
        })),
      )
      .onConflictDoNothing({
        target: [
          schema.notifications.executionItemId,
          schema.notifications.dueDate,
          schema.notifications.dueStage,
        ],
        where: sql`${schema.notifications.kind} = 'due'`,
      })
      .returning({ id: schema.notifications.id });
    created += inserted.length;
  }
  logger.log("info", "due notifications", { checkedItems: items.length, created });
  return { checkedItems: items.length, created };
}
