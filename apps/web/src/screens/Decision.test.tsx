import type {
  DecisionContext,
  DecisionLogSummary,
  Me,
  Role,
} from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { checks, workspaceId } from "../test/ideas";
import { home } from "../test/validation";

// 19 Decision (design-spec 6.5).

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = `/w/${workspaceId}/ideas/${home.idea.id}/decide`;
const contextPath = `/api/v1/ideas/${home.idea.id}/decision-context`;
const recordPath = `/api/v1/ideas/${home.idea.id}/decisions`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

const kenji = {
  id: "7d793037-a076-4c2b-9f8e-3a1b2c3d4e5f",
  displayName: "Kenji Mori",
  avatarUrl: null,
  badge: null,
};

const hold: DecisionLogSummary = {
  id: "9b2c1e5a-1111-4111-8111-111111111111",
  kind: "validation_decision",
  value: "hold",
  versionName: null,
  idea: { id: home.idea.id, name: home.idea.name },
  plan: null,
  reasonExcerpt: "Permits are not checked yet.",
  recordedBy: kenji,
  recordedAt: "2026-10-02T02:00:00.000Z",
};

const context: DecisionContext = {
  summary: {
    oneLineConcept: "Healthy bowls for office lunches.",
    customer: "Office workers near Lacson St.",
    problem: null,
    solution: "Five rotating bowls.",
    marketType: "Red",
    biggestOpportunity: null,
    biggestRisk: null,
    biggestUnknown: "Whether they order again.",
  },
  keyMetrics: {
    initial_cost_total: { value: 114000, bound: "lower", reason: null },
    break_even_units_day: { value: 19.8, bound: "exact", reason: null },
    expected_operating_profit: { value: 49708, bound: "exact", reason: null },
    payback_months: { value: 2.29, bound: "lower", reason: null },
    simple_roi: { value: null, bound: "exact", reason: "needs_startup_costs" },
  },
  missingChecks: checks.filter(({ state }) => state !== "done"),
  fau: {
    fact: 5,
    factNoEvidence: 1,
    assumption: { total: 37, low: 6, medium: 17, high: 14 },
    unknown: 4,
    unclassified: 3,
    empty: 13,
  },
  lastDecision: hold,
};

/** The API of 19; `record` answers V19 in place of a recorded decision. */
function decisionApi({
  me = ana,
  archived = false,
  record,
}: {
  me?: Me;
  archived?: boolean;
  record?: (call: Call) => Response | undefined;
} = {}) {
  return stubApi((call: Call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${home.idea.id}/validation`
    ) {
      return Response.json({ ...home, idea: { ...home.idea, archived } });
    }
    if (method === "GET" && path === contextPath) {
      return Response.json(context);
    }
    if (method === "POST" && path === recordPath) {
      const answered = record?.(call);
      if (answered !== undefined) return answered;
      const body = call.body as { value: "proceed"; reason: string };
      return Response.json(
        {
          entry: {
            ...hold,
            id: "9b2c1e5a-2222-4222-8222-222222222222",
            value: body.value,
            reason: body.reason,
            reasonExcerpt: body.reason,
            recordedBy: ana,
            recordedAt: "2026-10-22T02:00:00.000Z",
            snapshot: {
              missingChecks: context.missingChecks,
              keyMetrics: context.keyMetrics,
              fau: context.fau,
            },
          },
          latestDecision: body.value,
          canCreatePlan: body.value === "proceed",
        },
        { status: 201 },
      );
    }
    return undefined;
  });
}

const material = () =>
  screen.getByRole("region", { name: "What you know so far" });

describe("19 Decision (design-spec 6.5)", () => {
  test("what is known so far: Summary, key numbers, missing checks, F/A/U and the last decision", async () => {
    decisionApi();
    renderApp(base);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Record a decision",
      }),
    ).toBeTruthy();
    await screen.findByText("Healthy bowls for office lunches.");
    const shown = material().textContent ?? "";
    expect(shown).toContain("Office workers near Lacson St.");
    expect(shown).toContain("Five rotating bowls.");
    expect(shown).toContain("₱114,000+");
    expect(shown).toContain("19.8 / day");
    expect(shown).toContain("₱49,708 / mo");
    expect(shown).toContain("2.3+ mo");
    expect(shown).toContain("Needs startup costs");
    expect(shown).toContain("2 missing");
    const missing = within(
      screen.getByRole("list", { name: "Missing checks" }),
    ).getAllByRole("listitem");
    expect(missing[0]?.textContent).toContain("1 row is Empty");
    expect(missing[0]?.textContent).toContain("Partial");
    expect(shown).toContain("Unknown 4");
    expect(shown).toContain("Unclassified 3");
    expect(shown).toContain("Empty 13");
    expect(shown).toContain("Last decision: Hold · Oct 2 · Kenji Mori");
    expect(
      screen.getByRole("link", { name: home.idea.name }).getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${home.idea.id}`);
  });

  test("a choice and a reason are needed; the notes follow the choice", async () => {
    const user = userEvent.setup();
    const calls = decisionApi();
    renderApp(base);
    await screen.findByText("Healthy bowls for office lunches.");
    await user.click(screen.getByRole("button", { name: "Record decision" }));
    expect(screen.getByText("Choose one of the options")).toBeTruthy();
    expect(screen.getByText("Can't be empty")).toBeTruthy();
    expect(calls.some(({ method }) => method === "POST")).toBe(false);
    expect(
      screen.getByText(
        "You can decide again at any time. Every decision stays in the log.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /Proceed/ }));
    expect(
      screen.getByText(
        "Proceed means it is worth planning, not approval to launch.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "2 checks are missing. They will be recorded with this decision.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /Drop/ }));
    expect(
      screen.getByText(
        "Dropped ideas are hidden from lists by default. You can decide again later.",
      ),
    ).toBeTruthy();
  });

  test("Record decision: sent on the last decision, then 13 with Decision recorded", async () => {
    const user = userEvent.setup();
    const calls = decisionApi();
    const router = renderApp(base);
    await screen.findByText("Healthy bowls for office lunches.");
    await user.click(screen.getByRole("radio", { name: /Hold/ }));
    await user.type(
      screen.getByRole("textbox", { name: /Why\?/ }),
      "Permits still unknown.",
    );
    await user.click(screen.getByRole("button", { name: "Record decision" }));
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "POST")?.body).toEqual({
        value: "hold",
        reason: "Permits still unknown.",
        basedOnDecisionId: hold.id,
      }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${home.idea.id}`,
      ),
    );
    // The toasts of the tests before stay in the page's one queue.
    expect(
      (await screen.findAllByText("Decision recorded")).length,
    ).toBeGreaterThan(0);
  });

  test("someone recorded a decision since: asked, and recorded as well when confirmed", async () => {
    const user = userEvent.setup();
    let refused = false;
    const calls = decisionApi({
      record: (call) => {
        if ((call.body as { confirmNewer?: boolean }).confirmNewer) {
          return undefined;
        }
        refused = true;
        return apiError(409, "DECISION_CHANGED", {
          latest: {
            ...hold,
            value: "drop",
            recordedAt: new Date().toISOString(),
          },
        });
      },
    });
    const router = renderApp(base);
    await screen.findByText("Healthy bowls for office lunches.");
    await user.click(screen.getByRole("radio", { name: /Proceed/ }));
    await user.type(screen.getByRole("textbox", { name: /Why\?/ }), "Go.");
    await user.click(screen.getByRole("button", { name: "Record decision" }));
    const question = await screen.findByRole("alertdialog", {
      name: /Kenji Mori recorded Drop .* Record yours as well\?/,
    });
    expect(refused).toBe(true);
    await user.click(
      within(question).getByRole("button", { name: "Record mine" }),
    );
    await waitFor(() =>
      expect(
        calls.filter(({ method }) => method === "POST").at(-1)?.body,
      ).toEqual({
        value: "proceed",
        reason: "Go.",
        basedOnDecisionId: hold.id,
        confirmNewer: true,
      }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${home.idea.id}`,
      ),
    );
  });

  test("a failed record keeps the input and offers Retry", async () => {
    const user = userEvent.setup();
    let failing = true;
    const calls = decisionApi({
      record: () => (failing ? apiError(500, "INTERNAL") : undefined),
    });
    const router = renderApp(base);
    await screen.findByText("Healthy bowls for office lunches.");
    await user.click(screen.getByRole("radio", { name: /Hold/ }));
    await user.type(screen.getByRole("textbox", { name: /Why\?/ }), "Later.");
    await user.click(screen.getByRole("button", { name: "Record decision" }));
    expect(await screen.findByText("Couldn't record")).toBeTruthy();
    expect(screen.getByText("Ref: 8f14e45f")).toBeTruthy();
    expect(
      (screen.getByRole("textbox", { name: /Why\?/ }) as HTMLTextAreaElement)
        .value,
    ).toBe("Later.");
    failing = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(calls.filter(({ method }) => method === "POST")).toHaveLength(2),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${home.idea.id}`,
      ),
    );
  });

  test("a Viewer cannot open it", async () => {
    const calls = decisionApi({ me: as("viewer") });
    renderApp(base);
    expect(
      await screen.findByRole("heading", {
        name: "You don't have access to this",
      }),
    ).toBeTruthy();
    expect(calls.some(({ path }) => path === contextPath)).toBe(false);
  });

  test("an archived idea: the material and the notice, no fields", async () => {
    decisionApi({ archived: true });
    renderApp(base);
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    await screen.findByText("Healthy bowls for office lunches.");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Record decision" }),
    ).toBeNull();
  });
});
