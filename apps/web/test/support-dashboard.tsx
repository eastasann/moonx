import { formatIsoDate } from "@moonx/i18n";
import type { Activity, DueItem } from "@moonx/schemas";
import { type Handler, makeMe, stubApi, WORKSPACE } from "./support";
import { ANA, BACOLOD, KENJI, makeIdea } from "./support-ideas";

export const DASH = `/api/v1/workspaces/${WORKSPACE}/dashboard`;

const user = (id: string, displayName: string) => ({
  id,
  displayName,
  avatarUrl: null,
  badge: null,
});
export const PAOLO = "77777777-7777-4777-8777-777777777777";
export const GRACE = "88888888-8888-4888-8888-888888888888";
export const people = {
  ana: user(ANA, "Ana Villanueva"),
  kenji: user(KENJI, "Kenji Mori"),
  paolo: user(PAOLO, "Paolo Gonzaga"),
};

/** A calendar date `days` from today where the test's user lives (Asia/Manila). */
export const inDays = (days: number) =>
  formatIsoDate(new Date(Date.now() + days * 86_400_000), "Asia/Manila");

export const PLAN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export const dueItem = (overrides: Partial<DueItem> = {}): DueItem => ({
  id: "d0000000-0000-4000-8000-000000000001",
  type: "next_action",
  title: "Get supplier quote",
  dueDate: inDays(-2),
  overdue: true,
  assignee: { user: people.kenji },
  isMine: false,
  idea: { id: BACOLOD.id, name: BACOLOD.name },
  plan: { id: PLAN, name: "Plan A" },
  ...overrides,
});

export const DUE_ITEMS: DueItem[] = [
  dueItem({
    id: "d0000000-0000-4000-8000-000000000002",
    title: "Book venue",
    type: "milestone",
    dueDate: inDays(3),
    overdue: false,
    assignee: { user: people.ana },
    isMine: true,
  }),
  dueItem(),
  dueItem({
    id: "d0000000-0000-4000-8000-000000000003",
    title: "Print flyers",
    dueDate: inDays(0),
    overdue: false,
    assignee: { name: "Print shop" },
  }),
];

export const ACTIVITY: Activity[] = [
  {
    kind: "comment",
    actor: people.paolo,
    at: new Date(Date.now() - 3_600_000).toISOString(),
    summary: "01 WHO",
    idea: { id: BACOLOD.id, name: BACOLOD.name },
    plan: null,
    link: {
      screen: 11,
      workspaceId: WORKSPACE,
      ideaId: BACOLOD.id,
      sectionKey: "01",
      questionKey: "V.01.WHO",
      panel: "comments",
      target: {
        type: "validation_answer",
        id: "66666666-6666-4666-8666-666666666666",
        key: "V.01.WHO",
      },
    },
  },
  {
    kind: "decision",
    actor: people.ana,
    at: new Date(Date.now() - 7_200_000).toISOString(),
    summary: "hold",
    idea: { id: BACOLOD.id, name: BACOLOD.name },
    plan: null,
    link: { screen: 13, workspaceId: WORKSPACE, ideaId: BACOLOD.id },
  },
  {
    kind: "go_no_go",
    actor: people.ana,
    at: new Date(Date.now() - 10_800_000).toISOString(),
    summary: "delay",
    idea: { id: BACOLOD.id, name: BACOLOD.name },
    plan: { id: PLAN, name: "Plan A" },
    link: { screen: 20, workspaceId: WORKSPACE, ideaId: BACOLOD.id, planId: PLAN },
  },
  {
    kind: "version_saved",
    actor: people.paolo,
    at: new Date(Date.now() - 14_400_000).toISOString(),
    summary: "v1 For advisors",
    idea: { id: BACOLOD.id, name: BACOLOD.name },
    plan: { id: PLAN, name: "Plan A" },
    link: { screen: 20, workspaceId: WORKSPACE, ideaId: BACOLOD.id, planId: PLAN },
  },
];

export const DASH_IDEAS = [
  makeIdea({ id: "a1000000-0000-4000-8000-000000000001", name: "Piaya Gift Box Delivery" }),
  {
    ...BACOLOD,
    checks: BACOLOD.checks.map((check) =>
      check.key === "costs" || check.key === "competitors"
        ? { ...check, state: "not_started" as const }
        : check,
    ),
  },
];

export interface DashboardOptions {
  me?: ReturnType<typeof makeMe>;
  ideas?: typeof DASH_IDEAS;
  droppedCount?: number;
}

/** The stub of every request of the dashboard, with the fixtures above by default. */
export function dashboardApi(extra: Record<string, Handler> = {}, options: DashboardOptions = {}) {
  return stubApi({
    "GET /api/v1/me": () => ({ body: options.me ?? makeMe() }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET ${DASH}/ideas`]: () => ({
      body: { items: options.ideas ?? DASH_IDEAS, droppedCount: options.droppedCount ?? 1 },
    }),
    [`GET ${DASH}/self-analyses`]: () => ({
      body: {
        items: [
          { user: people.ana, shared: true, status: "done" },
          { user: people.kenji, shared: false, status: null },
          { user: people.paolo, shared: true, status: "in_progress" },
        ],
      },
    }),
    [`GET ${DASH}/due-soon`]: () => ({ body: { items: DUE_ITEMS } }),
    [`GET ${DASH}/activity`]: () => ({ body: { items: ACTIVITY } }),
    ...extra,
  });
}
