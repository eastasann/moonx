import type {
  DecisionContext,
  DecisionLogSummary,
  Me,
  Role,
} from "@moonx/schemas";
import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SLOW_LOADING_MS } from "../components/states";
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

const empty = { value: null, bound: "exact", reason: "empty" } as const;

/**
 * A new idea's material (design-spec 6.5「判断材料が空」): nothing in but the one-line
 * concept every idea is created with (6.0.8), every check open.
 */
const nothingYet: DecisionContext = {
  summary: {
    oneLineConcept: "Healthy bowls for office lunches.",
    customer: null,
    problem: null,
    solution: null,
    marketType: null,
    biggestOpportunity: null,
    biggestRisk: null,
    biggestUnknown: null,
  },
  keyMetrics: {
    initial_cost_total: empty,
    break_even_units_day: empty,
    expected_operating_profit: empty,
    payback_months: empty,
    simple_roi: empty,
  },
  missingChecks: checks.map((check) => ({
    ...check,
    state: "not_started",
    count: check.count === null ? null : 0,
    detail:
      check.key === "costs"
        ? { emptyRows: 18, missing: ["initial_amount", "monthly_amount"] }
        : check.key === "break_even"
          ? { missing: ["price", "monthly_costs"] }
          : null,
  })),
  fau: {
    fact: 0,
    factNoEvidence: 0,
    assumption: { total: 0, low: 0, medium: 0, high: 0 },
    unknown: 0,
    unclassified: 0,
    empty: 41,
  },
  lastDecision: null,
};

/**
 * The API of 19, answering V18 with `material` (asked at each read when a function, whose
 * promise holds the read back, or which may answer in its place);
 * `record` answers V19 in place of a recorded decision.
 */
function decisionApi({
  me = ana,
  archived = false,
  material = context,
  record,
  patch,
}: {
  me?: Me;
  archived?: boolean;
  material?:
    | DecisionContext
    | (() => DecisionContext | Response | Promise<DecisionContext>);
  record?: (call: Call) => Response | undefined;
  /** Answers 13's Edit summary (I2 PATCH). */
  patch?: () => Promise<Response>;
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
      return typeof material === "function"
        ? Promise.resolve(material()).then((read) =>
            read instanceof Response ? read : Response.json(read),
          )
        : Response.json(material);
    }
    if (method === "PATCH" && path === `/api/v1/ideas/${home.idea.id}`) {
      return patch?.();
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
    // A Fact whose research log was deleted is a Fact, with how many said (6.0.3).
    expect(shown).toContain("Fact 5 (1 without evidence)");
    expect(shown).toContain("Unknown 4");
    expect(shown).toContain("Unclassified 3");
    expect(shown).toContain("Empty 13");
    // Each kind leads with its moon (6.5): Unclassified's diamond, Empty's dotted ring.
    for (const [kind, shape] of [
      ["Unclassified 3", "rect"],
      ["Empty 13", "circle[stroke-dasharray]"],
    ] as const) {
      // The kind's line: its moon, then its name and count.
      const [label] = screen.getAllByText(
        (_, element) =>
          element?.textContent === kind && element.childElementCount === 1,
      );
      expect(
        label?.parentElement?.querySelector(`svg ${shape}`),
      ).not.toBeNull();
    }
    expect(shown).toContain("Last decision: Hold · Oct 2 · Kenji Mori");
    expect(
      screen.getByRole("link", { name: home.idea.name }).getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${home.idea.id}`);
  });

  test("F/A/U counts past a thousand group their thousands; no Facts without evidence, no words for them", async () => {
    decisionApi({
      material: {
        ...context,
        fau: {
          fact: 1234,
          factNoEvidence: 0,
          assumption: { total: 2000, low: 1000, medium: 500, high: 500 },
          unknown: 1500,
          unclassified: 100,
          empty: 99999,
        },
      },
    });
    renderApp(base);
    await screen.findByText("Healthy bowls for office lunches.");
    const shown = material().textContent ?? "";
    for (const count of [
      "Fact 1,234",
      "Assumption 2,000",
      "Unknown 1,500",
      "Unclassified 100",
      "Empty 99,999",
    ]) {
      expect(shown).toContain(count);
    }
    expect(shown).not.toContain("without evidence");
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
    expect(question.textContent).toContain(
      "Both decisions stay in the log, and yours becomes the latest.",
    );
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
    // Proceed recorded: Later leaves for 13 without a draft (design-spec 6.5).
    const prompt = await screen.findByRole("alertdialog", {
      name: "Create a plan draft?",
    });
    await user.click(within(prompt).getByRole("button", { name: "Later" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${home.idea.id}`,
      ),
    );
    expect(router.state.location.search).toEqual({});
  });

  test("Cancel on someone's newer decision: nothing sent, the material read again, that decision the last one and the next base", async () => {
    const user = userEvent.setup();
    const drop: DecisionLogSummary = {
      ...hold,
      id: "9b2c1e5a-3333-4333-8333-333333333333",
      value: "drop",
      reasonExcerpt: "No repeat orders.",
      recordedAt: "2026-10-21T02:00:00.000Z",
    };
    let latest = hold;
    const calls = decisionApi({
      material: () => ({ ...context, lastDecision: latest }),
      // As V19: refused while the decision it is based on is not the latest.
      record: (call) =>
        (call.body as { basedOnDecisionId: string | null })
          .basedOnDecisionId === latest.id
          ? undefined
          : apiError(409, "DECISION_CHANGED", { latest }),
    });
    const router = renderApp(base);
    await screen.findByText("Healthy bowls for office lunches.");
    // Kenji records Drop after 19 opened.
    latest = drop;
    await user.click(screen.getByRole("radio", { name: /Hold/ }));
    await user.type(screen.getByRole("textbox", { name: /Why\?/ }), "Later.");
    await user.click(screen.getByRole("button", { name: "Record decision" }));
    const question = await screen.findByRole("alertdialog", {
      name: /^Kenji Mori recorded Drop .* Record yours as well\?$/,
    });
    const posts = () => calls.filter(({ method }) => method === "POST");
    const reads = () =>
      calls.filter(
        ({ method, path }) => method === "GET" && path === contextPath,
      ).length;
    const readsBefore = reads();
    await user.click(within(question).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(reads()).toBe(readsBefore + 1));
    await waitFor(() =>
      expect(material().textContent).toContain(
        "Last decision: Drop · Oct 21 · Kenji Mori",
      ),
    );
    expect(
      screen.queryByRole("alertdialog", { name: /recorded Drop/ }),
    ).toBeNull();
    expect(posts()).toHaveLength(1);
    expect(screen.queryByText("Couldn't record")).toBeNull();
    expect(router.state.location.pathname).toBe(base);
    // The input stays, and the next record is based on Kenji's Drop.
    await user.click(screen.getByRole("button", { name: "Record decision" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]?.body).toEqual({
      value: "hold",
      reason: "Later.",
      basedOnDecisionId: drop.id,
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${home.idea.id}`,
      ),
    );
  });

  test("Record decision cannot be pressed while the material is read, the first time or again after Cancel, which shows its skeleton", async () => {
    const user = userEvent.setup();
    const drop: DecisionLogSummary = {
      ...hold,
      id: "9b2c1e5a-3333-4333-8333-333333333333",
      value: "drop",
      recordedAt: "2026-10-21T02:00:00.000Z",
    };
    let latest = hold;
    let release: () => void = () => {};
    const calls = decisionApi({
      material: () =>
        new Promise((resolve) => {
          const read = { ...context, lastDecision: latest };
          release = () => resolve(read);
        }),
      record: (call) =>
        (call.body as { basedOnDecisionId: string | null })
          .basedOnDecisionId === latest.id
          ? undefined
          : apiError(409, "DECISION_CHANGED", { latest: drop }),
    });
    const router = renderApp(base);
    const recordButton = () =>
      screen.getByRole("button", { name: "Record decision" });
    // The fields come first (6.5「ローディング」), Record waits for the material.
    await user.click(await screen.findByRole("radio", { name: /Hold/ }));
    await user.type(screen.getByRole("textbox", { name: /Why\?/ }), "Later.");
    expect(recordButton().hasAttribute("disabled")).toBe(true);
    act(() => release());
    await screen.findByText("Healthy bowls for office lunches.");
    await waitFor(() =>
      expect(recordButton().hasAttribute("disabled")).toBe(false),
    );
    latest = drop;
    await user.click(recordButton());
    const question = await screen.findByRole("alertdialog", {
      name: /recorded Drop/,
    });
    await user.click(within(question).getByRole("button", { name: "Cancel" }));
    // Read again, still on its way: the material's skeleton in place of the old one,
    // and Record cannot send.
    await waitFor(() =>
      expect(
        calls.filter(
          ({ method, path }) => method === "GET" && path === contextPath,
        ),
      ).toHaveLength(2),
    );
    expect(
      screen.queryByRole("region", { name: "What you know so far" }),
    ).toBeNull();
    expect(screen.queryByText(/Last decision/)).toBeNull();
    expect(
      screen
        .getByRole("heading", { level: 2, name: "Summary" })
        .closest("[inert]"),
    ).not.toBeNull();
    expect(recordButton().hasAttribute("disabled")).toBe(true);
    const posts = () => calls.filter(({ method }) => method === "POST");
    expect(posts()).toHaveLength(1);
    act(() => release());
    await waitFor(() =>
      expect(material().textContent).toContain("Last decision: Drop"),
    );
    await waitFor(() =>
      expect(recordButton().hasAttribute("disabled")).toBe(false),
    );
    await user.click(recordButton());
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]?.body).toEqual({
      value: "hold",
      reason: "Later.",
      basedOnDecisionId: drop.id,
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${home.idea.id}`,
      ),
    );
  });

  test("the material read again after Cancel: past 10 seconds Taking longer than usual, whose Retry asks again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const drop: DecisionLogSummary = {
        ...hold,
        id: "9b2c1e5a-3333-4333-8333-333333333333",
        value: "drop",
        recordedAt: "2026-10-21T02:00:00.000Z",
      };
      // The first read answers; the next two never do; the fourth does, with Drop.
      let reads = 0;
      const calls = decisionApi({
        material: () => {
          reads += 1;
          if (reads === 1) return context;
          if (reads < 4) return new Promise<DecisionContext>(() => {});
          return { ...context, lastDecision: drop };
        },
        record: () => apiError(409, "DECISION_CHANGED", { latest: drop }),
      });
      renderApp(base);
      await screen.findByText("Healthy bowls for office lunches.");
      await user.click(screen.getByRole("radio", { name: /Hold/ }));
      await user.type(screen.getByRole("textbox", { name: /Why\?/ }), "Later.");
      await user.click(screen.getByRole("button", { name: "Record decision" }));
      const question = await screen.findByRole("alertdialog", {
        name: /recorded Drop/,
      });
      await user.click(
        within(question).getByRole("button", { name: "Cancel" }),
      );
      await waitFor(() => expect(reads).toBe(2));
      act(() => vi.advanceTimersByTime(SLOW_LOADING_MS - 1000));
      expect(screen.queryByText("Taking longer than usual")).toBeNull();
      act(() => vi.advanceTimersByTime(1000));
      expect(
        await screen.findByRole("heading", {
          level: 2,
          name: "Taking longer than usual",
        }),
      ).toBeTruthy();
      expect(
        screen
          .getByRole("button", { name: "Record decision" })
          .hasAttribute("disabled"),
      ).toBe(true);
      await user.click(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(reads).toBe(3));
      // The skeleton again, for another 10 seconds.
      expect(screen.queryByText("Taking longer than usual")).toBeNull();
      act(() => vi.advanceTimersByTime(SLOW_LOADING_MS));
      await user.click(await screen.findByRole("button", { name: "Retry" }));
      await waitFor(() =>
        expect(material().textContent).toContain("Last decision: Drop"),
      );
      expect(
        screen
          .getByRole("button", { name: "Record decision" })
          .hasAttribute("disabled"),
      ).toBe(false);
      expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("nothing known yet: each field Empty (the concept every idea has aside), 6 missing, and a decision can still be recorded", async () => {
    const user = userEvent.setup();
    const calls = decisionApi({ material: nothingYet });
    const router = renderApp(base);
    await screen.findByRole("list", { name: "Missing checks" });
    // The Summary's items and the key numbers, each label with its value.
    const fields = [...material().querySelectorAll("dt")].map((label) => [
      label.textContent,
      label.nextElementSibling?.textContent,
    ]);
    expect(fields).toEqual([
      ["Concept", "Healthy bowls for office lunches."],
      ...[
        "Customer",
        "Problem",
        "Solution",
        "Market type",
        "Biggest opportunity",
        "Biggest unknown",
        "Biggest risk",
        "Startup",
        "Break-even",
        "Expected profit",
        "Payback",
        "ROI",
      ].map((label) => [label, "Empty"]),
    ]);
    expect(material().textContent).toContain("6 missing");
    expect(
      within(screen.getByRole("list", { name: "Missing checks" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(6);
    expect(material().textContent).not.toContain("Last decision");
    await user.click(screen.getByRole("radio", { name: /Drop/ }));
    expect(
      screen.getByText(
        "6 checks are missing. They will be recorded with this decision.",
      ),
    ).toBeTruthy();
    await user.type(
      screen.getByRole("textbox", { name: /Why\?/ }),
      "Nothing to go on.",
    );
    await user.click(screen.getByRole("button", { name: "Record decision" }));
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "POST")?.body).toEqual({
        value: "drop",
        reason: "Nothing to go on.",
        basedOnDecisionId: null,
      }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${home.idea.id}`,
      ),
    );
  });

  test("every check done: All 6 checks done, and no word of missing ones", async () => {
    const user = userEvent.setup();
    decisionApi({ material: { ...context, missingChecks: [] } });
    renderApp(base);
    expect(await screen.findByText("All 6 checks done")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Missing checks" })).toBeNull();
    expect(material().textContent).not.toContain("missing");
    await user.click(screen.getByRole("radio", { name: /Proceed/ }));
    expect(screen.queryByText(/checks? (is|are) missing/)).toBeNull();
  });

  test("Proceed asks for a plan draft first: Create draft opens M5 over 13", async () => {
    const user = userEvent.setup();
    decisionApi();
    const router = renderApp(base);
    await screen.findByText("Healthy bowls for office lunches.");
    await user.click(screen.getByRole("radio", { name: /Proceed/ }));
    await user.type(screen.getByRole("textbox", { name: /Why\?/ }), "Go.");
    await user.click(screen.getByRole("button", { name: "Record decision" }));
    const prompt = await screen.findByRole("alertdialog", {
      name: "Create a plan draft?",
    });
    // 19 stays until the answer.
    expect(router.state.location.pathname).toBe(base);
    await user.click(
      within(prompt).getByRole("button", { name: "Create draft" }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${home.idea.id}`,
      ),
    );
    expect(router.state.location.search).toEqual({ modal: "create-plan" });
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

  test("a read behind the material shown keeps Record and a failed record's Retry pressable, on the material shown", async () => {
    const user = userEvent.setup();
    let gate: Promise<void> = Promise.resolve();
    let failing = true;
    const calls = decisionApi({
      material: () => gate.then(() => context),
      record: () => (failing ? apiError(500, "INTERNAL") : undefined),
    });
    const router = renderApp(base);
    await screen.findByText("Healthy bowls for office lunches.");
    await user.click(screen.getByRole("radio", { name: /Hold/ }));
    await user.type(screen.getByRole("textbox", { name: /Why\?/ }), "Later.");
    await user.click(screen.getByRole("button", { name: "Record decision" }));
    await screen.findByText("Couldn't record");
    const pressable = () =>
      ["Retry", "Record decision"].map(
        (name) =>
          !screen.getByRole("button", { name }).hasAttribute("disabled"),
      );
    expect(pressable()).toEqual([true, true]);
    gate = new Promise(() => {});
    const reads = () =>
      calls.filter(
        ({ method, path }) => method === "GET" && path === contextPath,
      ).length;
    const readsBefore = reads();
    try {
      // The window's focus reads the material again (TanStack Query's refetch on focus).
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await waitFor(() => expect(reads()).toBe(readsBefore + 1));
      expect(pressable()).toEqual([true, true]);
      expect(material().textContent).toContain("Last decision: Hold");
      failing = false;
      await user.click(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() =>
        expect(calls.filter(({ method }) => method === "POST")).toHaveLength(2),
      );
      expect(
        calls.filter(({ method }) => method === "POST")[1]?.body,
      ).toMatchObject({ basedOnDecisionId: hold.id });
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(
          `/w/${workspaceId}/ideas/${home.idea.id}`,
        ),
      );
    } finally {
      act(() => focusManager.setFocused(undefined));
    }
  });

  test("a read of the material that failed: Record and a failed record's Retry cannot be pressed until it is read", async () => {
    const user = userEvent.setup();
    let readFails = true;
    const calls = decisionApi({
      material: () => (readFails ? apiError(500, "INTERNAL") : context),
      record: () => apiError(500, "INTERNAL"),
    });
    renderApp(base);
    const recordButton = () =>
      screen.getByRole("button", { name: "Record decision" });
    // The first read fails: its state in place of the material.
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Something went wrong",
      }),
    ).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /Hold/ }));
    await user.type(screen.getByRole("textbox", { name: /Why\?/ }), "Later.");
    expect(recordButton().hasAttribute("disabled")).toBe(true);
    readFails = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Healthy bowls for office lunches.");
    await waitFor(() =>
      expect(recordButton().hasAttribute("disabled")).toBe(false),
    );
    await user.click(recordButton());
    await screen.findByText("Couldn't record");
    // The record's, the only Retry so far.
    const recordRetry = screen.getByRole("button", { name: "Retry" });
    expect(recordRetry.hasAttribute("disabled")).toBe(false);
    // Read again behind it, and that read fails.
    readFails = true;
    try {
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      expect(
        await screen.findByRole("heading", {
          level: 2,
          name: "Something went wrong",
        }),
      ).toBeTruthy();
    } finally {
      act(() => focusManager.setFocused(undefined));
    }
    expect(recordButton().hasAttribute("disabled")).toBe(true);
    expect(recordRetry.hasAttribute("disabled")).toBe(true);
    expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
  });

  test("a record that meets an ended session says nothing on 19: M9 asks to sign in again", async () => {
    const user = userEvent.setup();
    decisionApi({
      // 13's summary still on its way: input unsaved, so the lost session opens M9.
      patch: () => new Promise<Response>(() => {}),
      record: () => apiError(401, "UNAUTHENTICATED"),
    });
    const router = renderApp(`/w/${workspaceId}/ideas/${home.idea.id}`);
    await user.click(
      await screen.findByRole("button", { name: "Edit summary" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Edit summary" });
    await user.type(
      within(sheet).getByRole("textbox", { name: /One-line concept/ }),
      "!",
    );
    await user.tab();
    await act(() => router.navigate({ href: base }));
    await screen.findByText("Healthy bowls for office lunches.");
    await user.click(screen.getByRole("radio", { name: /Hold/ }));
    await user.type(screen.getByRole("textbox", { name: /Why\?/ }), "Later.");
    await user.click(screen.getByRole("button", { name: "Record decision" }));
    expect(
      await screen.findByRole("dialog", { name: "Sign in again" }),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe(base);
    expect(screen.queryByText("Couldn't record")).toBeNull();
    expect(screen.queryByText(/^Ref:/)).toBeNull();
  });

  test("a recorder who left reads as a former member, in the last decision and the question (design-spec 6.16)", async () => {
    const user = userEvent.setup();
    const former = { ...kenji, badge: "former_member" as const };
    decisionApi({
      material: { ...context, lastDecision: { ...hold, recordedBy: former } },
      record: () =>
        apiError(409, "DECISION_CHANGED", {
          latest: {
            ...hold,
            recordedBy: former,
            recordedAt: new Date().toISOString(),
          },
        }),
    });
    renderApp(base);
    await screen.findByText("Healthy bowls for office lunches.");
    expect(material().textContent).toContain(
      "Last decision: Hold · Oct 2 · Kenji Mori (former member)",
    );
    await user.click(screen.getByRole("radio", { name: /Hold/ }));
    await user.type(screen.getByRole("textbox", { name: /Why\?/ }), "Later.");
    await user.click(screen.getByRole("button", { name: "Record decision" }));
    expect(
      await screen.findByRole("alertdialog", {
        name: /^Kenji Mori \(former member\) recorded Hold/,
      }),
    ).toBeTruthy();
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
