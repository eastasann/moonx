import { fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { DecisionContext } from "../src/lib/decision";
import { renderApp, stubApi, WORKSPACE } from "./support";
import {
  ana,
  EMPTY_FAU,
  HOME_PATH,
  IDEA,
  makeFullHome,
  makeNewHome,
  meOf,
  paolo,
  type Role,
} from "./support-validation-home";

export const CONTEXT_PATH = `/api/v1/ideas/${IDEA}/decision-context`;
export const DECISIONS_PATH = `/api/v1/ideas/${IDEA}/decisions`;
export const DECIDE_URL = `/w/${WORKSPACE}/ideas/${IDEA}/decide`;
export const HOME_URL = `/w/${WORKSPACE}/ideas/${IDEA}`;
export const LAST_ID = "99999999-9999-4999-8999-999999999999";

const link = { workspaceId: WORKSPACE, ideaId: IDEA };

type Context = DecisionContext;

/** Two checks missing, the Piaya numbers and a Hold recorded on Sep 30 (design-spec 6.5). */
export function makeContext(overrides: Partial<Context> = {}): Context {
  return {
    summary: {
      oneLineConcept: "Corporate gift boxes of Bacolod piaya, delivered same day",
      customer: "Office managers in Bacolod",
      problem: "Gifts for clients are hard to source on short notice",
      solution: "Same-day boxes",
      marketType: "Mixed",
      biggestOpportunity: "Corporate gifting season",
      biggestRisk: "Permit delays",
      biggestUnknown: null,
    },
    keyMetrics: {
      initial_cost_total: { value: 169500, bound: "exact", reason: null },
      break_even_units_day: { value: 6.9, bound: "exact", reason: null },
      expected_operating_profit: { value: 18490, bound: "exact", reason: null },
      payback_months: { value: 9.2, bound: "exact", reason: null },
      simple_roi: { value: 1.309, bound: "exact", reason: null },
    },
    missingChecks: [
      {
        key: "permits",
        state: "not_started",
        count: 0,
        params: { researchLogs: 1 },
        detail: null,
        link: { ...link, screen: 17 },
      },
      {
        key: "costs",
        state: "partial",
        count: null,
        params: {},
        detail: { emptyRows: 2, missing: [] },
        link: { ...link, screen: 17 },
      },
    ],
    fau: {
      fact: 12,
      factNoEvidence: 0,
      assumption: { total: 9, low: 3, medium: 4, high: 2 },
      unknown: 2,
      unclassified: 3,
      empty: 0,
    },
    lastDecision: {
      id: LAST_ID,
      kind: "validation_decision",
      value: "hold",
      versionName: null,
      idea: { id: IDEA, name: "Piaya Gift Box Delivery" },
      plan: null,
      reasonExcerpt: "Wait for the permit",
      recordedBy: ana,
      recordedAt: "2026-09-30T02:00:00.000Z",
    },
    ...overrides,
  } as Context;
}

/** Nothing filled in: every number Empty and all six checks missing. */
export function makeEmptyContext(): Context {
  const base = makeContext();
  const missing = makeNewHome().checks;
  return makeContext({
    summary: {
      oneLineConcept: base.summary.oneLineConcept,
      customer: null,
      problem: null,
      solution: null,
      marketType: null,
      biggestOpportunity: null,
      biggestRisk: null,
      biggestUnknown: null,
    },
    keyMetrics: {
      initial_cost_total: { value: null, bound: "exact", reason: "empty" },
      break_even_units_day: { value: null, bound: "exact", reason: "needs_price" },
      expected_operating_profit: { value: null, bound: "exact", reason: "needs_price" },
      payback_months: { value: null, bound: "exact", reason: "needs_startup_costs" },
      simple_roi: { value: null, bound: "exact", reason: "needs_startup_costs" },
    },
    missingChecks: missing,
    fau: EMPTY_FAU,
    lastDecision: null,
  });
}

export const signedIn = (role: Role = "owner") => ({
  "GET /api/v1/me": () => ({ body: meOf(role) }),
  "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
});

/** The entry V19 answers with; only `canCreatePlan` and `latestDecision` matter to the screen. */
export const recordedAnswer = (value: "proceed" | "hold" | "drop", canCreatePlan = false) => ({
  status: 201,
  body: { entry: { id: "e2", value }, latestDecision: value, canCreatePlan },
});

/** The 409 of V19 when Kenji decided after the screen opened, two minutes ago. */
export const changedAnswer = () => ({
  status: 409,
  body: {
    error: {
      code: "DECISION_CHANGED",
      message: "A newer decision was recorded",
      requestId: "r",
      latest: {
        id: "88888888-8888-4888-8888-888888888888",
        kind: "validation_decision",
        value: "hold",
        versionName: null,
        idea: { id: IDEA, name: "Piaya Gift Box Delivery" },
        plan: null,
        reasonExcerpt: "Need the permit first",
        recordedBy: { ...paolo, displayName: "Kenji" },
        recordedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      },
    },
  },
});

/** Opens screen 19 as `role` with the Piaya context; `extra` adds the V19 handler. */
export async function openDecide(
  extra: Parameters<typeof stubApi>[0] = {},
  options: { role?: Role; context?: Context; holdContext?: boolean } = {},
) {
  const api = stubApi({
    ...signedIn(options.role),
    [`GET ${HOME_PATH}`]: () => ({ body: makeFullHome() }),
    [`GET ${CONTEXT_PATH}`]: () => ({ body: options.context ?? makeContext() }),
    ...extra,
  });
  if (options.holdContext) {
    // The materials never arrive, which is what a slow read looks like.
    const answer = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input instanceof Request ? input.url : input).includes("decision-context")
        ? new Promise<Response>(() => {})
        : answer(input, init),
    );
  }
  const view = await renderApp(DECIDE_URL);
  return { api, ...view };
}

export const waitForForm = () =>
  screen.findByRole("heading", { level: 1, name: "Record decision — Piaya Gift Box Delivery" });

export const decisionPosts = (api: ReturnType<typeof stubApi>) =>
  api.calls.filter((c) => c.method === "POST" && c.url.pathname === DECISIONS_PATH);

/** Chooses a value and writes the reason, once the materials are in (the button is enabled then). */
export async function fillDecision(
  value: "Proceed" | "Hold" | "Drop",
  reason: string,
  missing = 2,
) {
  await waitForForm();
  await screen.findByRole("heading", { name: `Checks — ${missing} missing` });
  fireEvent.click(screen.getByRole("radio", { name: value }));
  fireEvent.change(screen.getByRole("textbox", { name: /^Why\?/ }), { target: { value: reason } });
}

export const pressRecord = () =>
  fireEvent.click(screen.getByRole("button", { name: "Record decision" }));
