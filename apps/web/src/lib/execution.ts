import type { ExecutionStatus, ExecutionType, LaunchTiming, Member, UserRef } from "@moonx/schemas";
import type { TFunction } from "i18next";
import { sendJson } from "./api";
import {
  EXECUTION_TABS,
  EXECUTION_TYPE_OF_TAB,
  type ExecutionItem,
  type ExecutionSearch,
  type ExecutionTab,
} from "./plans";
import type { FieldSpec } from "./row-fields";

/** The tab that lists one execution type (design-spec 6.13). */
export const EXECUTION_TAB_OF_TYPE: Record<ExecutionType, ExecutionTab> = Object.fromEntries(
  EXECUTION_TABS.map((tab) => [EXECUTION_TYPE_OF_TAB[tab], tab]),
) as Record<ExecutionType, ExecutionTab>;

/** Where each catalog text of the execution screens is looked up (a table, so the keys are checked). */
export const EXECUTION_KEYS = {
  status: {
    todo: "execution:status.todo",
    doing: "execution:status.doing",
    done: "execution:status.done",
    open: "execution:status.open",
    resolved: "execution:status.resolved",
  },
  timing: {
    t_minus_30: "execution:timing.t_minus_30",
    t_minus_7: "execution:timing.t_minus_7",
    launch_day: "execution:timing.launch_day",
    first_30: "execution:timing.first_30",
    days_31_90: "execution:timing.days_31_90",
    other: "execution:timing.other",
  },
  tab: {
    milestones: "execution:tabs.milestones",
    launch: "execution:tabs.launch",
    kpis: "execution:tabs.kpis",
    questions: "execution:tabs.questions",
    actions: "execution:tabs.actions",
  },
  type: {
    milestone: "execution:types.milestone",
    launch: "execution:types.launch",
    kpi: "execution:types.kpi",
    open_question: "execution:types.open_question",
    next_action: "execution:types.next_action",
  },
  empty: {
    milestone: {
      heading: "execution:empty.milestone.heading",
      body: "execution:empty.milestone.body",
    },
    launch: { heading: "execution:empty.launch.heading", body: "execution:empty.launch.body" },
    kpi: { heading: "execution:empty.kpi.heading", body: "execution:empty.kpi.body" },
    open_question: {
      heading: "execution:empty.open_question.heading",
      body: "execution:empty.open_question.body",
    },
    next_action: {
      heading: "execution:empty.next_action.heading",
      body: "execution:empty.next_action.body",
    },
  },
} as const satisfies {
  status: Record<ExecutionStatus, string>;
  timing: Record<LaunchTiming, string>;
  tab: Record<ExecutionTab, string>;
  type: Record<ExecutionType, string>;
  empty: Record<ExecutionType, { heading: string; body: string }>;
};

/** The launch time buckets in the order they show (design-spec 6.13). */
export const LAUNCH_TIMINGS: readonly LaunchTiming[] = [
  "t_minus_30",
  "t_minus_7",
  "launch_day",
  "first_30",
  "days_31_90",
  "other",
];

/** Statuses of each type; KPI rows have none (SDD 5.9 P9). */
export const STATUSES_OF_TYPE: Record<ExecutionType, readonly ExecutionStatus[]> = {
  milestone: ["todo", "doing", "done"],
  launch: ["todo", "doing", "done"],
  kpi: [],
  open_question: ["open", "resolved"],
  next_action: ["todo", "doing", "done"],
};

/** A status that ends the work, so an item with it is never overdue. */
export const isFinished = (status: ExecutionStatus | null) =>
  status === "done" || status === "resolved";

/** One piece of the detail form: a run of fields, or one of the controls the row editor does not draw. */
export type LayoutPart =
  | { part: "fields"; keys: readonly string[] }
  | { part: "assignee" }
  | { part: "timing" };

/** The key of the field the Launch bucket is saved under. */
export const TIMING_KEY = "launchTiming";

/**
 * Every field of an item's detail form that the autosave editor holds, in the order of the
 * original table (design-spec 6.13). "Owner" of the original reads "Assignee" here. The assignee
 * is not among them: it saves two fields at once and has its own control.
 */
export function executionSpecs(t: TFunction, type: ExecutionType): FieldSpec[] {
  const status: FieldSpec = {
    kind: "choice",
    control: "segmented",
    key: "status",
    label: t("execution:fields.status"),
    options: STATUSES_OF_TYPE[type].map((id) => ({ id, label: t(EXECUTION_KEYS.status[id]) })),
  };
  const longText = (key: string, label: string): FieldSpec => ({ kind: "longText", key, label });
  switch (type) {
    case "milestone":
      return [
        { kind: "text", key: "title", required: true, label: t("execution:fields.milestone") },
        longText("goal", t("execution:fields.goal")),
        { kind: "date", key: "dueDate", label: t("execution:fields.deadline") },
        longText("exitCondition", t("execution:fields.exitCondition")),
        status,
      ];
    case "launch":
      return [
        { kind: "text", key: "title", required: true, label: t("execution:fields.timing") },
        {
          kind: "choice",
          control: "picker",
          key: TIMING_KEY,
          label: t("execution:fields.bucket"),
          options: LAUNCH_TIMINGS.map((id) => ({ id, label: t(EXECUTION_KEYS.timing[id]) })),
        },
        longText("actions", t("execution:fields.actions")),
        longText("completionCriteria", t("execution:fields.completionCriteria")),
        { kind: "date", key: "dueDate", label: t("execution:fields.dueDate") },
        status,
      ];
    case "kpi":
      return [
        { kind: "text", key: "kpiArea", label: t("execution:fields.area") },
        { kind: "text", key: "title", required: true, label: t("execution:fields.kpi") },
        longText("kpiTarget", t("execution:fields.target")),
        { kind: "text", key: "kpiReviewFrequency", label: t("execution:fields.reviewFrequency") },
        { kind: "text", key: "kpiActual", label: t("execution:fields.actual") },
      ];
    case "open_question":
      return [
        { kind: "text", key: "title", required: true, label: t("execution:fields.openQuestion") },
        longText("whyItMatters", t("execution:fields.whyItMatters")),
        { kind: "date", key: "dueDate", label: t("execution:fields.targetDate") },
        status,
        longText("answer", t("execution:fields.answer")),
      ];
    case "next_action":
      return [
        { kind: "text", key: "title", required: true, label: t("execution:fields.action") },
        { kind: "date", key: "dueDate", label: t("execution:fields.deadline") },
        status,
      ];
  }
}

/** The order of the detail form: where the assignee and the Launch bucket sit among the fields. */
export function executionLayout(type: ExecutionType): LayoutPart[] {
  switch (type) {
    case "milestone":
      return [
        { part: "fields", keys: ["title", "goal"] },
        { part: "assignee" },
        { part: "fields", keys: ["dueDate", "exitCondition", "status"] },
      ];
    case "launch":
      return [
        { part: "fields", keys: ["title"] },
        { part: "timing" },
        { part: "fields", keys: ["actions"] },
        { part: "assignee" },
        { part: "fields", keys: ["completionCriteria", "dueDate", "status"] },
      ];
    case "kpi":
      return [
        { part: "fields", keys: ["kpiArea", "title", "kpiTarget", "kpiReviewFrequency"] },
        { part: "assignee" },
        { part: "fields", keys: ["kpiActual"] },
      ];
    case "open_question":
      return [
        { part: "fields", keys: ["title", "whyItMatters"] },
        { part: "assignee" },
        { part: "fields", keys: ["dueDate", "status", "answer"] },
      ];
    case "next_action":
      return [
        { part: "fields", keys: ["title"] },
        { part: "assignee" },
        { part: "fields", keys: ["dueDate", "status"] },
      ];
  }
}

const itemsUrl = (planId: string) => `/api/v1/plans/${planId}/execution-items`;

/** P10's URL for one item. */
export const executionItemUrl = (id: string) => `/api/v1/execution-items/${id}`;

export const createExecutionItem = (planId: string, body: Record<string, unknown>) =>
  sendJson<ExecutionItem>("POST", itemsUrl(planId), body);

/** P10 DELETE: a soft delete without a lock. */
export const deleteExecutionItem = (id: string) => sendJson<null>("DELETE", executionItemUrl(id));

/** P11: the ids of one type in their new order. */
export const putExecutionOrder = (planId: string, type: ExecutionType, ids: string[]) =>
  sendJson<null>("PUT", `${itemsUrl(planId)}/order`, { type, ids });

/** One run of rows under a heading, in the order the server returned them. */
export interface ExecutionGroup {
  key: string;
  /** The heading; null for a list that is not grouped. */
  label: string | null;
  items: ExecutionItem[];
}

/**
 * Launch rows under their time bucket (a bucket without rows is left out) and KPIs under their
 * Area; the server already sorts both, so a group is a run of neighbours. Everything else is one
 * group without a heading.
 */
export function groupExecutionItems(
  t: TFunction,
  type: ExecutionType,
  items: readonly ExecutionItem[],
): ExecutionGroup[] {
  if (type === "launch") {
    return LAUNCH_TIMINGS.flatMap((timing) => {
      const rows = items.filter((item) => (item.launchTiming ?? "other") === timing);
      return rows.length > 0
        ? [{ key: timing, label: t(EXECUTION_KEYS.timing[timing]), items: rows }]
        : [];
    });
  }
  if (type === "kpi") {
    const groups: ExecutionGroup[] = [];
    for (const item of items) {
      const area = item.kpiArea?.trim() ?? "";
      const found = groups.find((group) => group.key === area);
      if (found) found.items.push(item);
      else groups.push({ key: area, label: area || t("execution:kpi.noArea"), items: [item] });
    }
    return groups;
  }
  return items.length > 0 ? [{ key: type, label: null, items: [...items] }] : [];
}

/** Whether a type keeps the order a person gave it; Next Actions are sorted by due date instead. */
export const isOrderable = (type: ExecutionType) => type !== "next_action";

/**
 * The ids of every row of the type with `id` one place earlier or later within its group, or null
 * at either end. P11 takes the whole list in `sortOrder`, so the row swaps places with its
 * neighbour in that list and keeps its position among the other groups' rows.
 */
export function movedExecutionIds(
  all: readonly ExecutionItem[],
  group: readonly ExecutionItem[],
  id: string,
  direction: "up" | "down",
): string[] | null {
  const at = group.findIndex((item) => item.id === id);
  const neighbour = group[at + (direction === "up" ? -1 : 1)];
  if (at < 0 || !neighbour) return null;
  const ids = [...all].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.id);
  const from = ids.indexOf(id);
  const to = ids.indexOf(neighbour.id);
  if (from < 0 || to < 0) return null;
  ids[from] = neighbour.id;
  ids[to] = id;
  return ids;
}

/** What the filters of the Next Actions tab narrow the list by. */
export interface ActionFilters {
  assignee: ExecutionSearch["assignee"];
  status: ExecutionSearch["status"];
  overdueOnly: boolean;
}

/** Next Actions narrowed by assignee, status and "overdue"; the server's due-date order stays. */
export function filterActions(
  items: readonly ExecutionItem[],
  filters: ActionFilters,
  meId: string,
): ExecutionItem[] {
  return items.filter((item) => {
    if (filters.assignee) {
      const wanted = filters.assignee === "me" ? meId : filters.assignee;
      if (!item.assignee || !("user" in item.assignee) || item.assignee.user.id !== wanted) {
        return false;
      }
    }
    if (filters.status && item.status !== filters.status) return false;
    return !filters.overdueOnly || item.overdue;
  });
}

/** The name of a person who is no longer there reads "Deleted user", as everywhere else. */
export function userName(t: TFunction, user: UserRef): string {
  return user.badge === "deleted" ? t("common:deletedUser") : user.displayName;
}

/** The assignee as text, or null for an item nobody has taken. */
export function assigneeText(t: TFunction, assignee: ExecutionItem["assignee"]): string | null {
  if (!assignee) return null;
  return "user" in assignee ? userName(t, assignee.user) : assignee.name;
}

/** An Owner or Member of the workspace, the people an item can be assigned to (SDD 5.9 P9). */
export interface Assignable {
  id: string;
  name: string;
}

export function assignableMembers(members: readonly Member[] | undefined): Assignable[] {
  return (members ?? [])
    .filter((member) => member.role === "owner" || member.role === "member")
    .map((member) => ({ id: member.user.id, name: member.user.displayName }));
}

/** What the assignee control holds: nobody, a member of the workspace, or a name written by hand. */
export type AssigneeChoice =
  | { kind: "none" }
  | { kind: "member"; userId: string }
  | { kind: "name"; name: string };

export function assigneeChoiceOf(assignee: ExecutionItem["assignee"]): AssigneeChoice {
  if (!assignee) return { kind: "none" };
  return "user" in assignee
    ? { kind: "member", userId: assignee.user.id }
    : { kind: "name", name: assignee.name };
}

/**
 * The request fields for a choice. The API takes one kind of assignee at a time (422 for both),
 * so the other one goes as null, which also clears what was there before.
 */
export function assigneeBody(choice: AssigneeChoice): {
  assigneeUserId: string | null;
  assigneeName: string | null;
} {
  switch (choice.kind) {
    case "member":
      return { assigneeUserId: choice.userId, assigneeName: null };
    case "name": {
      const name = choice.name.trim();
      return { assigneeUserId: null, assigneeName: name === "" ? null : name };
    }
    default:
      return { assigneeUserId: null, assigneeName: null };
  }
}
