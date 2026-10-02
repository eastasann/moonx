import { formatIsoDate } from "@moonx/i18n";
import type { Activity, DueItem, ExecutionType, UserRef } from "@moonx/schemas";
import { queryOptions } from "@tanstack/react-query";
import { api, call, sendJson } from "./api";
import { IDEAS_KEY } from "./idea-actions";

/**
 * D1 reads the ideas, so it lives under their prefix and every change to an idea refreshes it.
 * The other three blocks share a prefix of their own for the changes that reach them.
 */
export const DASHBOARD_KEY = ["dashboard"] as const;

const workspaceKey = (workspaceId: string) => [...DASHBOARD_KEY, workspaceId] as const;

/** D1: the ideas that are neither archived nor dropped, and how many dropped ones are hidden. */
export const dashboardIdeasQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: [...IDEAS_KEY, "dashboard", workspaceId],
    queryFn: () => call(api().api.v1.workspaces({ workspaceId }).dashboard.ideas.get()),
  });

/**
 * D2: Owners and Members with whether their self analysis is shared here. D2 to D4 are read
 * again each time the dashboard opens: execution items, comments and decisions change them from
 * screens that have no reason to know the dashboard exists, so no mutation could keep them fresh.
 */
export const dashboardSelfAnalysesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: [...workspaceKey(workspaceId), "self-analyses"],
    queryFn: () => call(api().api.v1.workspaces({ workspaceId }).dashboard["self-analyses"].get()),
    staleTime: 0,
  });

// D3 and D4 are read with `sendJson`: Treaty would turn a due date ("2026-10-05") into a `Date`,
// which a time zone west of UTC then shows a day early.

/** D3: execution items that are overdue or due within a week, the caller's own first. */
export const dashboardDueSoonQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: [...workspaceKey(workspaceId), "due-soon"],
    queryFn: () =>
      sendJson<{ items: DueItem[] }>("GET", `/api/v1/workspaces/${workspaceId}/dashboard/due-soon`),
    staleTime: 0,
  });

/** D4: the latest 20 changes, comments, decisions, Go / No-Go records and saved versions. */
export const dashboardActivityQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: [...workspaceKey(workspaceId), "activity"],
    queryFn: () =>
      sendJson<{ items: Activity[] }>(
        "GET",
        `/api/v1/workspaces/${workspaceId}/dashboard/activity`,
      ),
    staleTime: 0,
  });

/** The 22 tab an execution item opens on (SDD 4: `?tab=milestones|launch|kpis|questions|actions`). */
export const EXECUTION_TAB: Record<ExecutionType, string> = {
  milestone: "milestones",
  launch: "launch",
  kpi: "kpis",
  open_question: "questions",
  next_action: "actions",
};

/**
 * Whole days from today to the due date on the person's calendar: negative when overdue. Both
 * sides are calendar dates, so the difference is counted in UTC days and no time zone shifts it.
 */
export function daysUntil(dueDate: string, now: Date, timeZone: string): number {
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  return Math.round((day(dueDate) - day(formatIsoDate(now, timeZone))) / 86_400_000);
}

/** Who a due item is assigned to: a member, a name typed in, or nobody. */
export function assigneeOf(item: DueItem): UserRef | { name: string } | null {
  if (!item.assignee) return null;
  return "user" in item.assignee ? item.assignee.user : item.assignee;
}
