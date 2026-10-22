import type { DecisionLogEntry, DecisionLogSummary } from "@moonx/schemas";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, type Call, renderApp, stubApi } from "../test/api";
import { checks, ideaSummary, workspaceId } from "../test/ideas";
import { home } from "../test/validation";

// 7 Decision Log (design-spec 6.15, SDD 5.11 L1・L2).

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = `/w/${workspaceId}/decisions`;
const kenji = {
  id: "6f1c2b3a-0000-4000-8000-000000000003",
  displayName: "Kenji Mori",
  avatarUrl: null,
  badge: null,
};

const hold: DecisionLogSummary = {
  id: "d0000000-0000-4000-8000-000000000001",
  kind: "validation_decision",
  value: "hold",
  versionName: null,
  idea: { id: home.idea.id, name: home.idea.name },
  plan: null,
  reasonExcerpt: "Costs are not in yet.",
  recordedBy: kenji,
  recordedAt: "2026-10-20T01:00:00Z",
};
const saved: DecisionLogSummary = {
  id: "d0000000-0000-4000-8000-000000000002",
  kind: "version_saved",
  value: null,
  versionName: "v1 For advisors",
  idea: { id: home.idea.id, name: home.idea.name },
  plan: { id: "e0000000-0000-4000-8000-000000000001", name: "Plan A" },
  reasonExcerpt: null,
  recordedBy: kenji,
  recordedAt: "2026-10-19T01:00:00Z",
};

const metric = (value: number) => ({
  value,
  bound: "exact" as const,
  reason: null,
});
const holdEntry: DecisionLogEntry = {
  ...hold,
  reason: "Costs are not in yet. Permits are unknown.",
  snapshot: {
    missingChecks: (
      checks as DecisionLogEntry["snapshot"]["missingChecks"]
    ).filter(({ state }) => state !== "done"),
    keyMetrics: {
      initial_cost_total: metric(169500),
      break_even_units_day: metric(6.9),
      expected_operating_profit: metric(18490),
      payback_months: metric(9.2),
      simple_roi: metric(1.309),
    },
    fau: {
      fact: 12,
      factNoEvidence: 0,
      assumption: { total: 9, low: 2, medium: 4, high: 3 },
      unknown: 2,
      unclassified: 3,
      empty: 18,
    },
  },
};

const versionRef = {
  id: "e0000000-0000-4000-8000-000000000002",
  name: "v1 For advisors",
};
const savedEntry: DecisionLogEntry = {
  ...saved,
  reason: null,
  snapshot: { ...holdEntry.snapshot, planVersion: versionRef },
};
const goNoGo: DecisionLogSummary = {
  ...saved,
  id: "d0000000-0000-4000-8000-000000000003",
  kind: "go_no_go",
  value: "delay",
  reasonExcerpt: "Permits first.",
};
const goNoGoEntry: DecisionLogEntry = {
  ...goNoGo,
  reason: "Permits first.",
  snapshot: {
    ...holdEntry.snapshot,
    conditions: { launchIf: null, delayIf: null, stopIf: null },
    planVersion: versionRef,
  },
};

function logApi(
  items: DecisionLogSummary[] = [hold, saved],
  /** An entry L2 finds by its id, of an idea of another workspace. */
  elsewhere?: string,
) {
  return stubApi((call: Call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(ana);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(ana);
    if (
      method === "GET" &&
      path.startsWith(`/api/v1/workspaces/${workspaceId}/decision-log`)
    ) {
      const url = new URL(path, "http://localhost");
      const kind = url.searchParams.get("kind");
      return Response.json({
        items:
          kind === null ? items : items.filter((item) => item.kind === kind),
        nextCursor: null,
      });
    }
    if (method === "GET" && path === `/api/v1/decision-log/${hold.id}`) {
      return Response.json(holdEntry);
    }
    if (method === "GET" && path === `/api/v1/decision-log/${saved.id}`) {
      return Response.json(savedEntry);
    }
    if (method === "GET" && path === `/api/v1/decision-log/${goNoGo.id}`) {
      return Response.json(goNoGoEntry);
    }
    if (method === "GET" && path === `/api/v1/decision-log/${elsewhere}`) {
      return Response.json({
        ...holdEntry,
        id: elsewhere,
        idea: { id: "e9999999-0000-4000-8000-000000000001", name: "Other" },
      });
    }
    if (
      method === "GET" &&
      path.startsWith(`/api/v1/workspaces/${workspaceId}/ideas`)
    ) {
      return Response.json({
        items: [ideaSummary(home.idea.id, home.idea.name)],
        nextCursor: null,
        hiddenDroppedCount: 0,
      });
    }
    if (
      method === "GET" &&
      path === `/api/v1/workspaces/${workspaceId}/members`
    ) {
      return Response.json({
        items: [
          { user: kenji, role: "member", joinedAt: "2026-10-01T00:00:00Z" },
        ],
      });
    }
    return undefined;
  });
}

describe("7 Decision Log (design-spec 6.15)", () => {
  test("lists where, how and by whom, the value and the date; the first entry's record beside them", async () => {
    logApi();
    renderApp(base);
    const list = await screen.findByRole("grid", { name: "Decisions" });
    const rows = within(list).getAllByRole("row").slice(1);
    expect(rows[0]?.textContent).toContain(home.idea.name);
    expect(rows[0]?.textContent).toContain("Decision · Kenji Mori");
    expect(rows[0]?.textContent).toContain("“Costs are not in yet.”");
    expect(rows[0]?.textContent).toContain("Hold");
    expect(rows[1]?.textContent).toContain(`Plan A · ${home.idea.name}`);
    expect(rows[1]?.textContent).toContain("Version saved · Kenji Mori");
    expect(rows[1]?.textContent).toContain("v1 For advisors");
    // What was kept when it was recorded.
    expect(
      await screen.findByText("Costs are not in yet. Permits are unknown."),
    ).toBeTruthy();
    expect(screen.getByText("Checks missing then")).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Key numbers then" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open validation" })).toBeTruthy();
  });

  test("a Go / No-Go opens its plan's 20, a saved version that version read only", async () => {
    logApi([goNoGo, saved]);
    const plan = `/w/${workspaceId}/ideas/${home.idea.id}/plans/${saved.plan?.id}`;
    renderApp(`${base}?selected=${goNoGo.id}`);
    expect(
      (await screen.findByRole("link", { name: "Open plan" })).getAttribute(
        "href",
      ),
    ).toBe(plan);
    cleanup();
    vi.unstubAllGlobals();
    logApi([goNoGo, saved]);
    renderApp(`${base}?selected=${saved.id}`);
    expect(
      (
        await screen.findByRole("link", { name: "Open this version" })
      ).getAttribute("href"),
    ).toBe(`${plan}?version=${versionRef.id}`);
  });

  test("Kind filters the list, in the URL", async () => {
    const user = userEvent.setup();
    const calls = logApi();
    const router = renderApp(base);
    await screen.findByRole("grid", { name: "Decisions" });
    await user.click(screen.getByRole("button", { name: /^Kind/ }));
    await user.click(
      await screen.findByRole("option", { name: "Version saved" }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        kind: "version_saved",
      }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("grid", { name: "Decisions" })).getAllByRole(
          "row",
        ),
      ).toHaveLength(2),
    );
    expect(
      calls.some(({ path }) =>
        path.includes("decision-log?kind=version_saved"),
      ),
    ).toBe(true);
  });

  test("a period of the Picker counts back from today", async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      now: new Date("2026-10-22T04:00:00Z"),
    });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const calls = logApi();
      const router = renderApp(base);
      await screen.findByRole("grid", { name: "Decisions" });
      await user.click(screen.getByRole("button", { name: /^Period/ }));
      await user.click(
        await screen.findByRole("option", { name: "Last 7 days" }),
      );
      await waitFor(() =>
        expect(router.state.location.search).toMatchObject({
          from: "2026-10-16",
        }),
      );
      expect(calls.some(({ path }) => path.includes("from=2026-10-16"))).toBe(
        true,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("none yet, and none for the filters with Clear filters", async () => {
    const user = userEvent.setup();
    logApi([]);
    const router = renderApp(base);
    expect(
      await screen.findByText(
        "Decisions you record will appear here, with who, when and why.",
      ),
    ).toBeTruthy();
    await router.navigate({ href: `${base}?kind=go_no_go` });
    expect(
      await screen.findByText("Nothing matches these filters"),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  test("Last 12 months on Feb 29 starts on Mar 1 of last year", async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      now: new Date("2028-02-29T04:00:00Z"),
    });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      logApi();
      const router = renderApp(base);
      await screen.findByRole("grid", { name: "Decisions" });
      await user.click(screen.getByRole("button", { name: /^Period/ }));
      await user.click(
        await screen.findByRole("option", { name: "Last 12 months" }),
      );
      await waitFor(() =>
        expect(router.state.location.search).toMatchObject({
          from: "2027-03-01",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("an entry of another workspace's idea is not shown here (SDD 4章)", async () => {
    const elsewhere = "d0000000-0000-4000-8000-0000000000aa";
    logApi([hold, saved], elsewhere);
    renderApp(`${base}?selected=${elsewhere}`);
    expect(
      await screen.findByText("You don't have access to this"),
    ).toBeTruthy();
    expect(screen.queryByText("Other")).toBeNull();
  });
});
