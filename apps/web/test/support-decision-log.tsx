import { type Handler, makeMe, stubApi, WORKSPACE } from "./support";
import { BACOLOD, IDEA_A, MEMBERS } from "./support-ideas";

export const LOG = `/api/v1/workspaces/${WORKSPACE}/decision-log`;
export const LOG_PATH = (search = "") => `/w/${WORKSPACE}/decisions${search}`;

const ANA = {
  id: "44444444-4444-4444-8444-444444444444",
  displayName: "Ana Villanueva",
  avatarUrl: null,
  badge: null,
};
const KENJI = {
  id: "66666666-6666-4666-8666-666666666666",
  displayName: "Kenji Ito",
  avatarUrl: null,
  badge: null,
};
const PLAN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export const ENTRY_HOLD = "e0000000-0000-4000-8000-000000000001";
export const ENTRY_GO = "e0000000-0000-4000-8000-000000000002";
export const ENTRY_VERSION = "e0000000-0000-4000-8000-000000000003";

const at = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

export const SUMMARIES = [
  {
    id: ENTRY_GO,
    kind: "go_no_go",
    value: "delay",
    versionName: null,
    idea: { id: IDEA_A, name: "Piaya Gift Box Delivery" },
    plan: { id: PLAN, name: "Plan A" },
    reasonExcerpt: "Permit not ready",
    recordedBy: ANA,
    recordedAt: at(2),
  },
  {
    id: ENTRY_VERSION,
    kind: "version_saved",
    value: null,
    versionName: "v1 For advisors",
    idea: { id: IDEA_A, name: "Piaya Gift Box Delivery" },
    plan: { id: PLAN, name: "Plan A" },
    reasonExcerpt: null,
    recordedBy: ANA,
    recordedAt: at(5),
  },
  {
    id: ENTRY_HOLD,
    kind: "validation_decision",
    value: "hold",
    versionName: null,
    idea: { id: BACOLOD.id, name: BACOLOD.name },
    plan: null,
    reasonExcerpt: "Costs and permits are still missing",
    recordedBy: KENJI,
    recordedAt: at(30),
  },
];

const snapshot = {
  missingChecks: [
    {
      key: "permits",
      state: "not_started",
      count: null,
      params: { researchLogs: 0 },
      detail: null,
      link: { screen: 14, ideaId: BACOLOD.id },
    },
  ],
  keyMetrics: {
    initial_cost_total: { value: 450000, bound: "lower", reason: null },
    break_even_units_day: { value: 13, bound: "exact", reason: null },
    expected_operating_profit: { value: null, bound: "exact", reason: "needs_price" },
    payback_months: { value: null, bound: "exact", reason: "not_recovered" },
  },
  fau: {
    fact: 4,
    factNoEvidence: 1,
    assumption: { total: 5, low: 1, medium: 2, high: 2 },
    unknown: 3,
    unclassified: 2,
    empty: 10,
  },
};

export const ENTRIES: Record<string, unknown> = {
  [ENTRY_HOLD]: {
    ...SUMMARIES[2],
    reason: "Costs and permits are still missing.\nCome back after the city hall visit.",
    snapshot,
  },
  [ENTRY_GO]: {
    ...SUMMARIES[0],
    reason: "Permit not ready",
    snapshot: {
      ...snapshot,
      missingChecks: [],
      conditions: { launchIf: "Permit approved", delayIf: null, stopIf: "Rent above ₱20,000" },
      planVersion: { id: "f0000000-0000-4000-8000-000000000001", name: "v1 For advisors" },
    },
  },
  [ENTRY_VERSION]: {
    ...SUMMARIES[1],
    reason: null,
    snapshot: {
      ...snapshot,
      missingChecks: [],
      planVersion: { id: "f0000000-0000-4000-8000-000000000001", name: "v1 For advisors" },
    },
  },
};

export interface DecisionLogOptions {
  me?: ReturnType<typeof makeMe>;
  items?: typeof SUMMARIES;
  /** The workspace the entries' ideas belong to; another one stands for an id copied across workspaces. */
  ideaWorkspaceId?: string;
}

/** The stub of every request screen 7 makes. The list answers with `items` filtered like the API does. */
export function decisionLogApi(
  extra: Record<string, Handler> = {},
  options: DecisionLogOptions = {},
) {
  const items = options.items ?? SUMMARIES;
  return stubApi({
    "GET /api/v1/me": () => ({ body: options.me ?? makeMe() }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET ${LOG}`]: ({ url }) => {
      const kind = url.searchParams.get("kind");
      const idea = url.searchParams.get("ideaId");
      return {
        body: {
          items: items.filter(
            (entry) => (!kind || entry.kind === kind) && (!idea || entry.idea.id === idea),
          ),
          nextCursor: null,
        },
      };
    },
    [`GET /api/v1/workspaces/${WORKSPACE}/ideas`]: () => ({
      body: {
        items: [BACOLOD, { ...BACOLOD, id: IDEA_A, name: "Piaya Gift Box Delivery" }],
        nextCursor: null,
        hiddenDroppedCount: 0,
      },
    }),
    [`GET /api/v1/workspaces/${WORKSPACE}/members`]: () => ({ body: MEMBERS }),
    ...Object.fromEntries(
      [IDEA_A, BACOLOD.id].map((id): [string, Handler] => [
        `GET /api/v1/ideas/${id}`,
        () => ({
          body: { ...BACOLOD, id, workspaceId: options.ideaWorkspaceId ?? WORKSPACE },
        }),
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(ENTRIES).map(([id, body]): [string, Handler] => [
        `GET /api/v1/decision-log/${id}`,
        () => ({ body }),
      ]),
    ),
    ...extra,
  });
}
