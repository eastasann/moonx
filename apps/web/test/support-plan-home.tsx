import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { DecisionLogSummary, GoNoGoContext, PlanHome, PlanSummary } from "../src/lib/plans";
import { renderApp, stubApi, WORKSPACE } from "./support";
import {
  ana,
  HOME_PATH,
  IDEA,
  makeFullHome,
  meOf,
  PLAN,
  type Role,
} from "./support-validation-home";

export type { Role };
export { ana, IDEA, PLAN, WORKSPACE };

export const PLAN_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
export const PLAN_ARCHIVED = "ffffffff-ffff-4fff-8fff-ffffffffffff";
export const VERSION = "99999999-9999-4999-8999-999999999991";
export const VERSION_2 = "99999999-9999-4999-8999-999999999992";

export const PLAN_PATH = `/api/v1/plans/${PLAN}`;
export const PLANS_PATH = `/api/v1/ideas/${IDEA}/plans`;
export const VERSIONS_PATH = `${PLAN_PATH}/versions`;
export const CONTEXT_PATH = `${PLAN_PATH}/go-no-go-context`;
export const GO_NO_GO_PATH = `${PLAN_PATH}/go-no-go`;
export const PLAN_URL = `/w/${WORKSPACE}/ideas/${IDEA}/plans/${PLAN}`;
export const IDEA_URL = `/w/${WORKSPACE}/ideas/${IDEA}`;

const item = (
  itemNo: number,
  title: string,
  marks: ("V" | "S")[],
  filled: number,
  total: number,
  commentCount = 0,
) => ({ itemNo, title, marks, filled, total, commentCount });

/** Piaya Gift Box Delivery, Plan A, with one version saved and changes since (design-spec 6.12, 8.x). */
export function makePlanHome(overrides: Partial<PlanHome> = {}): PlanHome {
  return {
    id: PLAN,
    name: "Plan A",
    archived: false,
    latestVersion: { id: VERSION, name: "v1 For advisors", savedAt: "2026-09-20T02:00:00.000Z" },
    hasChangesSinceVersion: true,
    latestGoNoGo: { value: "delay", recordedAt: "2026-09-28T02:00:00.000Z", recordedBy: ana },
    ideaId: IDEA,
    workspaceId: WORKSPACE,
    template: { versionId: "tv1", versionNumber: 1, newerVersion: null },
    businessName: "Piaya Gift Box Co.",
    preparedBy: "Ana",
    date: "2026-10-01T02:00:00.000Z",
    latestDecision: "proceed",
    viewingVersion: null,
    keyMetrics: {
      initial_cost_total: { value: 169500, bound: "exact", reason: null },
      break_even_units_day: { value: 6.9, bound: "exact", reason: null },
      expected_operating_profit: { value: 18490, bound: "exact", reason: null },
      payback_months: { value: 9.2, bound: "exact", reason: null },
    },
    versions: [
      {
        id: VERSION,
        versionNumber: 1,
        name: "v1 For advisors",
        savedBy: ana,
        savedAt: "2026-09-20T02:00:00.000Z",
      },
    ],
    execution: { dueSoon: 3, overdue: 1 },
    parts: [
      {
        part: "a",
        completeItems: 7,
        totalItems: 10,
        items: [
          item(1, "Executive Summary", ["V"], 5, 6, 1),
          item(2, "Vision & Purpose", ["S"], 0, 4),
        ],
      },
      {
        part: "b",
        completeItems: 9,
        totalItems: 20,
        items: [item(11, "Founder Roles", [], 2, 2)],
      },
    ],
    lockVersion: 5,
    updatedAt: "2026-10-01T02:00:00.000Z",
    updatedBy: ana,
    ...overrides,
  } as PlanHome;
}

export const summaryOf = (id: string, name: string, archived = false): PlanSummary => ({
  id,
  name,
  archived,
  latestVersion: null,
  hasChangesSinceVersion: false,
  latestGoNoGo: null,
});

export const plansAnswer = (items: PlanSummary[]) => ({ body: { items } });

/** Plan A and an archived Plan B. */
export const PLANS = [summaryOf(PLAN, "Plan A"), summaryOf(PLAN_ARCHIVED, "Plan B", true)];

export function makeContext(overrides: Partial<GoNoGoContext> = {}): GoNoGoContext {
  return {
    conditions: {
      launchIf: "We have 20 pre-orders",
      delayIf: null,
      stopIf: "Permit is refused",
    },
    keyMetrics: {
      initial_cost_total: { value: 169500, bound: "exact", reason: null },
      break_even_units_day: { value: 6.9, bound: "exact", reason: null },
      expected_operating_profit: { value: 18490, bound: "exact", reason: null },
      payback_months: { value: 9.2, bound: "exact", reason: null },
      simple_roi: { value: 1.309, bound: "exact", reason: null },
    },
    currentVersion: {
      id: VERSION,
      versionNumber: 1,
      name: "v1 For advisors",
      savedBy: ana,
      savedAt: "2026-09-20T02:00:00.000Z",
    },
    hasChangesSinceVersion: false,
    history: [
      {
        id: "g1",
        kind: "go_no_go",
        value: "delay",
        versionName: "v1 For advisors",
        idea: { id: IDEA, name: "Piaya Gift Box Delivery" },
        plan: { id: PLAN, name: "Plan A" },
        reasonExcerpt: "Permit not yet issued",
        recordedBy: ana,
        recordedAt: "2026-09-28T02:00:00.000Z",
      } satisfies DecisionLogSummary,
    ],
    ...overrides,
  } as GoNoGoContext;
}

export const signedIn = (role: Role = "owner") => ({
  "GET /api/v1/me": () => ({ body: meOf(role) }),
  "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
});

type Handlers = Parameters<typeof stubApi>[0];

/** The reads every plan screen makes: the plan, the idea's plans and the idea (name, archived). */
export function planApi(
  options: {
    role?: Role;
    plan?: PlanHome;
    ideaArchived?: boolean;
    plans?: PlanSummary[];
  } = {},
  extra: Handlers = {},
) {
  const home = makeFullHome();
  return stubApi({
    ...signedIn(options.role),
    [`GET ${PLAN_PATH}`]: () => ({
      body: { ...(options.plan ?? makePlanHome()), ideaArchived: options.ideaArchived ?? false },
    }),
    [`GET ${PLANS_PATH}`]: () => plansAnswer(options.plans ?? PLANS),
    [`GET ${HOME_PATH}`]: () => ({
      body: { ...home, idea: { ...home.idea, archived: options.ideaArchived ?? false } },
    }),
    ...extra,
  });
}

/** Opens screen 20 (or `path`) with the API stubbed and waits for the plan's heading. */
export async function openPlanHome(
  options: Parameters<typeof planApi>[0] = {},
  extra: Handlers = {},
  path: string = PLAN_URL,
) {
  const api = planApi(options, extra);
  const view = await renderApp(path);
  await screen.findByRole("heading", { level: 1, name: (options.plan ?? makePlanHome()).name });
  return { api, user: userEvent.setup(), ...view };
}

/** Holds back the reads whose URL contains `part`, which is what a slow or broken read looks like. */
export function holdReads(part: string, answer?: () => Response) {
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    String(input instanceof Request ? input.url : input).includes(part)
      ? answer
        ? Promise.resolve(answer())
        : new Promise<Response>(() => {})
      : original(input, init),
  );
}

export const callsTo = (api: ReturnType<typeof stubApi>, method: string, path: string) =>
  api.calls.filter((c) => c.method === method && c.url.pathname === path);

export const refusal = (code: string, status = 409) => ({
  status,
  body: { error: { code, message: code, requestId: "r" } },
});

export { screen, waitFor };
