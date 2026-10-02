import type { FauBreakdown, Me } from "@moonx/schemas";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ValidationHomeData } from "../src/lib/validation-home";
import { makeMe, renderApp, stubApi, WORKSPACE } from "./support";

export const IDEA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const VALIDATION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const PLAN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const ANA = "44444444-4444-4444-8444-444444444444";
export const PAOLO = "77777777-7777-4777-8777-777777777777";

export const HOME_PATH = `/api/v1/ideas/${IDEA}/validation`;
export const IDEA_PATH = `/api/v1/ideas/${IDEA}`;

const ana = { id: ANA, displayName: "Ana Villanueva", avatarUrl: null, badge: null } as const;
const paolo = { id: PAOLO, displayName: "Paolo Reyes", avatarUrl: null, badge: null } as const;

export { ana, paolo };

const link = { workspaceId: WORKSPACE, ideaId: IDEA };

export const EMPTY_FAU: FauBreakdown = {
  fact: 0,
  factNoEvidence: 0,
  assumption: { total: 0, low: 0, medium: 0, high: 0 },
  unknown: 0,
  unclassified: 0,
  empty: 18,
};

type Idea = ValidationHomeData["idea"];

export function makeDetail(overrides: Partial<Idea> = {}): Idea {
  return {
    id: IDEA,
    name: "Piaya Gift Box Delivery",
    oneLineConcept: "Corporate gift boxes of Bacolod piaya, delivered same day",
    proposer: ana,
    stage: "validation",
    latestDecision: null,
    archived: false,
    checks: [],
    keyMetrics: {} as Idea["keyMetrics"],
    plans: [],
    lastActivityAt: "2026-10-01T02:00:00.000Z",
    createdAt: "2026-09-20T02:00:00.000Z",
    lockVersion: 3,
    updatedAt: "2026-10-01T02:00:00.000Z",
    updatedBy: ana,
    workspaceId: WORKSPACE,
    validationId: VALIDATION,
    proposedSolution: "Same-day boxes",
    duplicatedFrom: null,
    ...overrides,
  };
}

const section = (
  key: ValidationHomeData["sections"][number]["key"],
  title: string,
  rest: Partial<ValidationHomeData["sections"][number]> = {},
): ValidationHomeData["sections"][number] => ({
  key,
  title,
  answered: null,
  total: null,
  count: null,
  fau: null,
  ...rest,
});

const SECTION_TITLES = {
  "01": "01 Customer & Problem",
  "02": "02 Market",
  "03": "03 Research Log",
  "04": "04 Competitors",
  "05": "05 Costs",
  "06-08": "06–08 Unit Economics & Scenarios",
  "09": "09 Assumptions & Risks",
  "10": "10 Final Assessment",
} as const;

const NOT_STARTED = [
  "competitors",
  "local_price",
  "costs",
  "break_even",
  "permits",
  "demand_signal",
] as const;

/** The home of an idea nobody has filled in yet (design-spec 6.1 "作ったばかり"). */
export function makeNewHome(overrides: Partial<ValidationHomeData> = {}): ValidationHomeData {
  return {
    validationId: VALIDATION,
    idea: makeDetail({ proposedSolution: null }),
    template: { versionId: "v1", versionNumber: 1, newerVersion: null },
    summary: { customer: null, problem: null, solution: null, marketType: null },
    keyMetrics: {
      initial_cost_total: { value: null, bound: "exact", reason: "empty" },
      break_even_units_day: { value: null, bound: "exact", reason: "needs_price" },
      expected_operating_profit: { value: null, bound: "exact", reason: "needs_price" },
      payback_months: { value: null, bound: "exact", reason: "needs_startup_costs" },
    },
    economicsWarnings: [],
    nextSteps: [
      {
        kind: "start_customer_problem",
        count: null,
        checkKey: null,
        sectionKey: "01",
        link: { ...link, screen: 11, sectionKey: "01" },
      },
      {
        kind: "check",
        count: 3,
        checkKey: "competitors",
        sectionKey: null,
        link: { ...link, screen: 15 },
      },
      {
        kind: "check",
        count: null,
        checkKey: "local_price",
        sectionKey: null,
        link: { ...link, screen: 15 },
      },
    ],
    checks: [
      {
        key: "competitors",
        state: "not_started",
        count: 0,
        params: { min: 3, max: 5 },
        detail: null,
        link: { ...link, screen: 15 },
      },
      {
        key: "local_price",
        state: "not_started",
        count: 0,
        params: { pricedCompetitors: 2, researchLogs: 1 },
        detail: null,
        link: { ...link, screen: 15 },
      },
      {
        key: "costs",
        state: "not_started",
        count: null,
        params: {},
        detail: { emptyRows: 18, missing: ["initial_amount", "monthly_amount"] },
        link: { ...link, screen: 17 },
      },
      {
        key: "break_even",
        state: "not_started",
        count: null,
        params: {},
        detail: { missing: ["price", "monthly_costs"] },
        link: { ...link, screen: 18, field: "selling_price" },
      },
      {
        key: "permits",
        state: "not_started",
        count: 0,
        params: { researchLogs: 1 },
        detail: null,
        link: { ...link, screen: 17 },
      },
      {
        key: "demand_signal",
        state: "not_started",
        count: 0,
        params: { researchLogs: 1 },
        detail: null,
        link: { ...link, screen: 14, tab: "new" },
      },
    ],
    fau: EMPTY_FAU,
    sections: [
      section("01", SECTION_TITLES["01"], {
        answered: 0,
        total: 10,
        fau: { ...EMPTY_FAU, empty: 10 },
      }),
      section("02", SECTION_TITLES["02"], {
        answered: 0,
        total: 8,
        fau: { ...EMPTY_FAU, empty: 8 },
      }),
      section("03", SECTION_TITLES["03"], { count: 0 }),
      section("04", SECTION_TITLES["04"], { count: 0, fau: null }),
      section("05", SECTION_TITLES["05"], { answered: 0, total: 24, fau: null }),
      section("06-08", SECTION_TITLES["06-08"], { answered: 0, total: 7, fau: null }),
      section("09", SECTION_TITLES["09"], { count: 0, countB: 0 }),
      section("10", SECTION_TITLES["10"], { answered: 0, total: 6, fau: null }),
    ],
    decisions: [],
    plans: [],
    canAddPlan: false,
    ...overrides,
  };
}

const done = (
  key: (typeof NOT_STARTED)[number],
  screen: number,
  count: number | null,
  params: Record<string, number>,
) => ({
  key,
  state: "done" as const,
  count,
  params,
  detail: null,
  link: { ...link, screen },
});

/** An idea with every check done and every number computed (the Piaya check data of design-spec 8.3). */
export function makeFullHome(overrides: Partial<ValidationHomeData> = {}): ValidationHomeData {
  const fau: FauBreakdown = {
    fact: 12,
    factNoEvidence: 0,
    assumption: { total: 9, low: 3, medium: 4, high: 2 },
    unknown: 2,
    unclassified: 3,
    empty: 18,
  };
  return makeNewHome({
    idea: makeDetail({ latestDecision: "proceed", stage: "planning" }),
    summary: {
      customer: "Office managers in Bacolod",
      problem: "Gifts for clients are hard to source on short notice",
      solution: "Same-day boxes",
      marketType: "Blue Ocean",
    },
    keyMetrics: {
      initial_cost_total: { value: 169500, bound: "exact", reason: null },
      break_even_units_day: { value: 6.9, bound: "exact", reason: null },
      expected_operating_profit: { value: 18490, bound: "exact", reason: null },
      payback_months: { value: 9.2, bound: "exact", reason: null },
    },
    nextSteps: [
      {
        kind: "ready_to_decide",
        count: null,
        checkKey: null,
        sectionKey: null,
        link: { ...link, screen: 19 },
      },
    ],
    checks: [
      done("competitors", 15, 4, { min: 3, max: 5 }),
      done("local_price", 15, 2, { pricedCompetitors: 2, researchLogs: 1 }),
      { ...done("costs", 17, null, {}), detail: { emptyRows: 0, missing: [] } },
      { ...done("break_even", 18, null, {}), detail: { missing: [] } },
      done("permits", 17, 1, { researchLogs: 1 }),
      done("demand_signal", 14, 2, { researchLogs: 1 }),
    ],
    fau,
    sections: [
      section("01", SECTION_TITLES["01"], { answered: 8, total: 10, fau }),
      section("02", SECTION_TITLES["02"], { answered: 8, total: 8, fau }),
      section("03", SECTION_TITLES["03"], { count: 7 }),
      section("04", SECTION_TITLES["04"], { count: 4 }),
      section("05", SECTION_TITLES["05"], { answered: 22, total: 24, fau }),
      section("06-08", SECTION_TITLES["06-08"], { answered: 5, total: 7, fau }),
      section("09", SECTION_TITLES["09"], { count: 3, countB: 2 }),
      section("10", SECTION_TITLES["10"], { answered: 2, total: 6, fau }),
    ],
    decisions: [
      {
        id: "e1",
        kind: "validation_decision",
        value: "proceed",
        versionName: null,
        idea: { id: IDEA, name: "Piaya Gift Box Delivery" },
        plan: null,
        reasonExcerpt: "Permit cost is confirmed",
        recordedBy: ana,
        recordedAt: "2026-09-30T02:00:00.000Z",
      },
    ],
    plans: [
      {
        id: PLAN,
        name: "Gift box plan",
        archived: false,
        latestVersion: { id: "pv1", name: "v1 For advisors", savedAt: "2026-10-01T02:00:00.000Z" },
        hasChangesSinceVersion: true,
        latestGoNoGo: { value: "launch", recordedAt: "2026-10-01T02:00:00.000Z", recordedBy: ana },
      },
    ],
    canAddPlan: true,
    ...overrides,
  });
}

export const HOME_URL = `/w/${WORKSPACE}/ideas/${IDEA}`;

/** Stubs the API for the edit sheet: a signed-in owner, the full home and the given extra handlers. */
export function stubEditApi(extra: Parameters<typeof stubApi>[0]) {
  return stubApi({
    "GET /api/v1/me": () => ({ body: makeMe() }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET ${HOME_PATH}`]: () => ({ body: makeFullHome() }),
    ...extra,
  });
}

/** Opens the app on the home and the Edit summary sheet. */
export async function openEditSheet() {
  await renderApp(HOME_URL);
  await screen.findByRole("heading", { level: 1, name: "Piaya Gift Box Delivery" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit summary" }));
  const dialog = await screen.findByRole("dialog", { name: "Edit summary" });
  return { dialog, user };
}

export const patchesOf = (api: ReturnType<typeof stubApi>) =>
  api.calls.filter((c) => c.method === "PATCH" && c.url.pathname === IDEA_PATH);

/** The I2 answer when someone else saved first: their version, three minutes old. */
export const conflictAnswer = (lockVersion = 4) => ({
  status: 409,
  body: {
    error: {
      code: "CONFLICT",
      message: "The item was changed by someone else",
      requestId: "r",
      current: {
        value: { name: "Piaya Boxes", oneLineConcept: "Their concept", proposedSolution: null },
        lockVersion,
        updatedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
        updatedBy: paolo,
      },
    },
  },
});

export type Role = "owner" | "member" | "viewer";

/** The signed-in person with the given role in the workspace. */
export const meOf = (role: Role): Me => {
  const me = makeMe();
  const [first, ...rest] = me.memberships;
  if (!first) throw new Error("fixture has no workspace");
  return { ...me, memberships: [{ ...first, role }, ...rest] };
};

/** Opens the app on the home of the full-home fixture, signed in with the given role. */
export const openHome = async (
  home: ValidationHomeData,
  handlers: Parameters<typeof stubApi>[0] = {},
  role: Role = "owner",
) => {
  const api = stubApi({
    "GET /api/v1/me": () => ({ body: meOf(role) }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET ${HOME_PATH}`]: () => ({ body: home }),
    ...handlers,
  });
  const view = await renderApp(HOME_URL);
  await screen.findByRole("heading", { level: 1, name: home.idea.name });
  return { api, user: userEvent.setup(), ...view };
};
