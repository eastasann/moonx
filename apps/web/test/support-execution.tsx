import type { ExecutionStatus, ExecutionType, UserRef } from "@moonx/schemas";
import { configure } from "@testing-library/react";
import { LAUNCH_TIMINGS } from "../src/lib/execution";
import type { ExecutionItem, PlanHome } from "../src/lib/plans";
import { IDEA_ID, idea } from "./question-fixtures";
import { type Handler, makeMe, type StubRequest, stubApi, WORKSPACE } from "./support";
import { registerQuestionFormHooks } from "./support-questions";

/** The hooks of the plan-screen tests, and a longer wait: these screens load several queries. */
export function registerPlanHooks() {
  registerQuestionFormHooks();
  configure({ asyncUtilTimeout: 5000 });
}

export const PLAN_ID = "77777777-7777-4777-8777-777777777777";
export const PLAN = `/api/v1/plans/${PLAN_ID}`;
export const VERSION_ID = "88888888-8888-4888-8888-888888888888";
export const EXECUTION_PATH = (search = "") =>
  `/w/${WORKSPACE}/ideas/${IDEA_ID}/plans/${PLAN_ID}/execution${search}`;

export const ANA: UserRef = {
  id: "44444444-4444-4444-8444-444444444444",
  displayName: "Ana Villanueva",
  avatarUrl: null,
  badge: null,
};
export const PAOLO: UserRef = {
  id: "55555555-0000-4000-8000-000000000001",
  displayName: "Paolo Reyes",
  avatarUrl: null,
  badge: null,
};
export const VIEWER: UserRef = {
  id: "55555555-0000-4000-8000-000000000002",
  displayName: "Vera Viewer",
  avatarUrl: null,
  badge: null,
};

export const MEMBERS = {
  items: [
    { user: ANA, email: null, role: "owner", joinedAt: "2026-01-01T00:00:00Z" },
    { user: PAOLO, email: null, role: "member", joinedAt: "2026-01-01T00:00:00Z" },
    { user: VIEWER, email: null, role: "viewer", joinedAt: "2026-01-01T00:00:00Z" },
  ],
};

export const viewerMe = () =>
  makeMe({
    memberships: [
      {
        workspace: { id: WORKSPACE, name: "BCDX", isPersonal: false, currency: "PHP" },
        role: "viewer",
      },
    ],
  });

/** The date the stub treats as today, which decides `overdue`. */
const TODAY = "2026-10-02";

let counter = 0;
export function execItem(
  type: ExecutionType,
  title: string,
  overrides: Partial<ExecutionItem> = {},
): ExecutionItem {
  counter += 1;
  const id = `99999999-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  return {
    id,
    type,
    title,
    assignee: null,
    dueDate: null,
    status: type === "kpi" ? null : type === "open_question" ? "open" : "todo",
    overdue: false,
    goal: null,
    exitCondition: null,
    launchTiming: type === "launch" ? "other" : null,
    actions: null,
    completionCriteria: null,
    kpiArea: null,
    kpiTarget: null,
    kpiReviewFrequency: null,
    kpiActual: null,
    kpiActualUpdatedAt: null,
    whyItMatters: null,
    answer: null,
    fromPreset: false,
    completedAt: null,
    sortOrder: counter,
    commentCount: 0,
    lockVersion: 1,
    updatedAt: "2026-10-01T00:00:00.000Z",
    updatedBy: null,
    ...overrides,
  };
}

export const MILESTONES = [
  execItem("milestone", "Business decision", {
    fromPreset: true,
    status: "done",
    goal: "Decide to go",
    sortOrder: 0,
  }),
  execItem("milestone", "Legal / company setup", {
    status: "doing",
    dueDate: "2026-09-15",
    overdue: true,
    assignee: { user: ANA },
    exitCondition: "Registered",
    sortOrder: 1,
  }),
  execItem("milestone", "Launch readiness", { sortOrder: 2 }),
];

export const LAUNCH = [
  execItem("launch", "30 days before launch", { launchTiming: "t_minus_30", sortOrder: 0 }),
  execItem("launch", "Launch day", { launchTiming: "launch_day", sortOrder: 1 }),
  execItem("launch", "Print flyers", { launchTiming: "t_minus_30", sortOrder: 2 }),
  execItem("launch", "Thank-you post", { launchTiming: "other", sortOrder: 3 }),
];

export const KPIS = [
  execItem("kpi", "Revenue", { kpiArea: "Financial", sortOrder: 0, kpiTarget: "₱100k" }),
  execItem("kpi", "Repeat Rate", { kpiArea: "Customer", sortOrder: 1 }),
  execItem("kpi", "Cash Balance", {
    kpiArea: "Financial",
    sortOrder: 2,
    kpiActual: "₱42k",
    kpiActualUpdatedAt: "2026-09-30T02:00:00.000Z",
  }),
];

export const ACTIONS = [
  execItem("next_action", "File permit", {
    dueDate: "2026-09-20",
    overdue: true,
    assignee: { name: "Uncle Ben" },
    sortOrder: 0,
  }),
  execItem("next_action", "Call the landlord", {
    dueDate: "2026-10-05",
    assignee: { user: ANA },
    status: "doing",
    sortOrder: 1,
  }),
  execItem("next_action", "Order boxes", {
    dueDate: "2026-10-09",
    assignee: { user: PAOLO },
    sortOrder: 2,
  }),
  execItem("next_action", "Pick a logo", { status: "done", sortOrder: 3 }),
];

export const planHome = (overrides: Partial<PlanHome> = {}): PlanHome => ({
  id: PLAN_ID,
  name: "Plan A",
  archived: false,
  latestVersion: null,
  hasChangesSinceVersion: false,
  latestGoNoGo: null,
  ideaId: IDEA_ID,
  workspaceId: WORKSPACE,
  template: { versionId: "tv", versionNumber: 1, newerVersion: null },
  businessName: "Piaya Gift Box Co.",
  preparedBy: "Ana",
  date: "2026-10-01T00:00:00.000Z",
  latestDecision: "proceed",
  ideaArchived: false,
  draftOnly: false,
  viewingVersion: null,
  keyMetrics: {} as PlanHome["keyMetrics"],
  versions: [],
  execution: { dueSoon: 0, overdue: 0 },
  lockVersion: 1,
  updatedAt: null,
  updatedBy: null,
  parts: [
    {
      part: "a",
      completeItems: 0,
      totalItems: 2,
      items: [
        {
          itemNo: 1,
          title: "Executive Summary",
          marks: ["V"],
          filled: 0,
          total: 3,
          commentCount: 0,
        },
        {
          itemNo: 2,
          title: "Vision & Purpose",
          marks: ["S"],
          filled: 0,
          total: 1,
          commentCount: 0,
        },
      ],
    },
    {
      part: "b",
      completeItems: 0,
      totalItems: 1,
      items: [
        { itemNo: 11, title: "Founder Roles", marks: [], filled: 0, total: 2, commentCount: 0 },
      ],
    },
  ],
  ...overrides,
});

const ORDER_OF_TYPE = (item: ExecutionItem, all: ExecutionItem[]) => {
  if (item.type === "next_action") {
    return [item.dueDate ? Date.parse(item.dueDate) : Number.MAX_SAFE_INTEGER, item.sortOrder];
  }
  if (item.type === "launch") {
    return [LAUNCH_TIMINGS.indexOf(item.launchTiming ?? "other"), item.sortOrder];
  }
  if (item.type === "kpi") {
    const areas = [...all].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.kpiArea);
    return [areas.indexOf(item.kpiArea), item.sortOrder];
  }
  return [0, item.sortOrder];
};

export interface ExecutionApiOptions {
  me?: ReturnType<typeof makeMe>;
  archived?: boolean;
  planArchived?: boolean;
  items?: ExecutionItem[];
}

const FINISHED: (ExecutionStatus | null)[] = ["done", "resolved"];

/**
 * The stub of every request of screens 21 and 22 for execution items: a store of rows that
 * answers the list the way the server sorts it and applies the writes.
 */
export function executionApi(
  extra: Record<string, Handler> = {},
  options: ExecutionApiOptions = {},
) {
  const store: ExecutionItem[] = (
    options.items ?? [...MILESTONES, ...LAUNCH, ...KPIS, ...ACTIONS]
  ).map((item) => ({ ...item }));
  const rowOf = (id: string) => store.find((row) => row.id === id);
  const handlers: Record<string, Handler> = {
    "GET /api/v1/me": () => ({ body: options.me ?? makeMe() }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET /api/v1/ideas/${IDEA_ID}`]: () => ({
      body: { ...idea, archived: options.archived ?? false },
    }),
    [`GET /api/v1/workspaces/${WORKSPACE}/members`]: () => ({ body: MEMBERS }),
    [`GET ${PLAN}`]: () => ({
      body: planHome({
        archived: options.planArchived ?? false,
        ideaArchived: options.archived ?? false,
      }),
    }),
    [`GET ${PLAN}/execution-items`]: ({ url }) => {
      const type = url.searchParams.get("type");
      const rows = store.filter((row) => row.type === type);
      const sorted = [...rows].sort((a, b) => {
        const [a0 = 0, a1 = 0] = ORDER_OF_TYPE(a, rows);
        const [b0 = 0, b1 = 0] = ORDER_OF_TYPE(b, rows);
        return a0 - b0 || a1 - b1;
      });
      return { body: { items: sorted } };
    },
    [`POST ${PLAN}/execution-items`]: ({ body }) => {
      const input = body as Partial<ExecutionItem> & { type: ExecutionType; title: string };
      const created = execItem(input.type, input.title, {
        ...input,
        sortOrder: store.length + 100,
        lockVersion: 0,
      });
      store.push(created);
      return { status: 201, body: created };
    },
    [`PUT ${PLAN}/execution-items/order`]: ({ body }) => {
      const { ids } = body as { ids: string[] };
      ids.forEach((id, index) => {
        const row = rowOf(id);
        if (row) row.sortOrder = index;
      });
      return { status: 204 };
    },
  };
  for (const row of store) {
    handlers[`PATCH /api/v1/execution-items/${row.id}`] = ({ body }) => {
      const { lockVersion: _lock, force: _force, ...fields } = body as Record<string, unknown>;
      const next = patchedItem(row, fields);
      Object.assign(row, next);
      return { body: row };
    };
    handlers[`DELETE /api/v1/execution-items/${row.id}`] = () => {
      store.splice(store.indexOf(row), 1);
      return { status: 204 };
    };
  }
  const stub = stubApi({ ...handlers, ...extra });
  return { ...stub, store };
}

/** The row after a PATCH: assignee fields become `assignee`, and `overdue` follows the deadline. */
export function patchedItem(row: ExecutionItem, fields: Record<string, unknown>): ExecutionItem {
  const { assigneeUserId, assigneeName, ...rest } = fields as {
    assigneeUserId?: string | null;
    assigneeName?: string | null;
  } & Partial<ExecutionItem>;
  let { assignee } = row;
  if (assigneeUserId) {
    assignee = { user: [ANA, PAOLO].find((u) => u.id === assigneeUserId) ?? ANA };
  } else if (assigneeName) assignee = { name: assigneeName };
  else if (assigneeUserId === null || assigneeName === null) assignee = null;
  const next = { ...row, ...rest, assignee, lockVersion: row.lockVersion + 1 };
  next.overdue = next.dueDate !== null && next.dueDate < TODAY && !FINISHED.includes(next.status);
  return next;
}

/** The requests that changed something. */
export const writes = (calls: StubRequest[]) => calls.filter((c) => c.method !== "GET");

export const conflictBody = (value: unknown, lockVersion: number) => ({
  status: 409,
  body: {
    error: {
      code: "CONFLICT",
      message: "x",
      requestId: "abcdef12",
      current: {
        value,
        lockVersion,
        updatedAt: new Date().toISOString(),
        updatedBy: PAOLO,
      },
    },
  },
});
