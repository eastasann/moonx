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
 * The one stage an item is in on `today`, or null while the due date is more than 3 days away.
 * Only this stage is ever created. After a missed run the notice of the current stage is still
 * made (ADR-014: "past 8am and not yet notified"), but earlier stages are skipped: an item whose
 * due date was set to yesterday gets "overdue", not also "in 3 days" and "today" in the same hour.
 */
export function dueStageOn(dueDate: string, today: string): DueStage | null {
  if (today > dueDate) return "overdue";
  if (today === dueDate) return "due_day";
  if (today >= addDays(dueDate, -3)) return "three_days_before";
  return null;
}

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
    const stage = dueStageOn(dueDate, local.date);
    return stage ? [{ item, dueDate, stage }] : [];
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
  const created = await db
    .insert(schema.notifications)
    .values(
      due.map(({ item, dueDate, stage }) => ({
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
  logger.log("info", "due notifications", { checkedItems: items.length, created: created.length });
  return { checkedItems: items.length, created: created.length };
}
