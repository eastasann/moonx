import { schema } from "@moonx/db";
import type { DueItem, UserRef } from "@moonx/schemas";
import { and, asc, eq, inArray, isNotNull, isNull, lte, notInArray, or } from "drizzle-orm";
import type { Executor } from "./db";
import { loadUserRefs } from "./users";

/** Days ahead of today that Due soon looks (design-spec 6.9). */
const DUE_SOON_DAYS = 7;

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Today's calendar date where the user is: "overdue" and "within a week" follow their day, not
 * UTC (design-spec 6.13). `users.timezone` holds IANA names; a value Intl cannot read falls back
 * to UTC instead of failing the dashboard.
 */
function todayIn(timezone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return dateOnly(now);
  }
}

/** `today` shifted by whole days, as `YYYY-MM-DD`. Dates carry no time zone, so UTC is the calendar. */
export function addDays(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
}

/**
 * D3. Execution items with a due date that is overdue or within a week, not Done / Resolved or
 * deleted, of the workspace's plans that are not archived under ideas that are not archived. The
 * caller's own items come first, then by due date.
 */
export async function loadDueSoon(
  db: Executor,
  p: { workspaceId: string; userId: string; timezone: string; now: Date },
): Promise<DueItem[]> {
  const today = todayIn(p.timezone, p.now);
  const rows = await db
    .select({
      item: schema.executionItems,
      ideaId: schema.ideas.id,
      ideaName: schema.ideas.name,
      planId: schema.businessPlans.id,
      planName: schema.businessPlans.name,
    })
    .from(schema.executionItems)
    .innerJoin(
      schema.businessPlans,
      eq(schema.businessPlans.id, schema.executionItems.businessPlanId),
    )
    .innerJoin(schema.ideas, eq(schema.ideas.id, schema.businessPlans.ideaId))
    .where(
      and(
        eq(schema.ideas.workspaceId, p.workspaceId),
        isNull(schema.ideas.archivedAt),
        isNull(schema.businessPlans.archivedAt),
        isNull(schema.executionItems.deletedAt),
        isNotNull(schema.executionItems.dueDate),
        lte(schema.executionItems.dueDate, addDays(today, DUE_SOON_DAYS)),
        or(
          isNull(schema.executionItems.status),
          notInArray(schema.executionItems.status, ["done", "resolved"]),
        ),
      ),
    )
    .orderBy(asc(schema.executionItems.dueDate), asc(schema.executionItems.id));
  const refs = await loadUserRefs(
    db,
    rows.map((r) => r.item.assigneeUserId),
    p.workspaceId,
  );
  const items = rows.map(({ item, ideaId, ideaName, planId, planName }): DueItem => {
    const dueDate = item.dueDate as string;
    const user = item.assigneeUserId ? refs.get(item.assigneeUserId) : undefined;
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      dueDate,
      overdue: dueDate < today,
      assignee: user ? { user } : item.assigneeName ? { name: item.assigneeName } : null,
      isMine: item.assigneeUserId === p.userId,
      idea: { id: ideaId, name: ideaName },
      plan: { id: planId, name: planName },
    };
  });
  // Array.prototype.sort is stable, so the due-date order of the query survives inside each group.
  return items.sort((a, b) => Number(b.isMine) - Number(a.isMine));
}

/** One row of D2. */
export interface DashboardSelfAnalysis {
  user: UserRef;
  shared: boolean;
  status: "not_started" | "in_progress" | "done" | null;
}

/**
 * D2. Owners and Members with whether their self analysis is shared with this workspace. The
 * progress is only revealed for a shared one (design-spec 6.9, 6.11).
 */
export async function loadSelfAnalysisOverview(
  db: Executor,
  workspaceId: string,
): Promise<DashboardSelfAnalysis[]> {
  const members = await db
    .select({ userId: schema.memberships.userId, role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.workspaceId, workspaceId),
        inArray(schema.memberships.role, ["owner", "member"]),
      ),
    );
  const ids = members.map((m) => m.userId);
  if (ids.length === 0) return [];
  const [refs, shared] = await Promise.all([
    loadUserRefs(db, ids, workspaceId),
    db
      .select({ userId: schema.selfAnalyses.userId, status: schema.selfAnalyses.status })
      .from(schema.selfAnalysisShares)
      .innerJoin(
        schema.selfAnalyses,
        eq(schema.selfAnalyses.id, schema.selfAnalysisShares.selfAnalysisId),
      )
      .where(
        and(
          eq(schema.selfAnalysisShares.workspaceId, workspaceId),
          inArray(schema.selfAnalyses.userId, ids),
        ),
      ),
  ]);
  const statusOf = new Map(shared.map((s) => [s.userId, s.status]));
  return members
    .map((m) => ({
      role: m.role,
      user: refs.get(m.userId) as UserRef,
      shared: statusOf.has(m.userId),
      status: statusOf.get(m.userId) ?? null,
    }))
    .sort(
      (a, b) =>
        Number(b.role === "owner") - Number(a.role === "owner") ||
        a.user.displayName.localeCompare(b.user.displayName),
    )
    .map(({ user, shared: isShared, status }) => ({ user, shared: isShared, status }));
}
