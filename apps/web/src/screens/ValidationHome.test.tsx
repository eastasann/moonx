import {
  type CostRowState,
  evaluateValidation,
  keyMetricOf,
} from "@moonx/domain";
import type { Me, Role, ValidationHome } from "@moonx/schemas";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as sentry from "../lib/sentry";
import {
  ana,
  apiError,
  authError,
  type Call,
  renderApp,
  stubApi,
} from "../test/api";
import { validationHome, workspaceId } from "../test/ideas";
import { section01, section02 } from "../test/validation";

// 13 Validation home (design-spec 6.1) and the input mechanism its Edit summary uses
// (6.0.2, M9, SDD ADR-019・ADR-021).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const home = validationHome();
const path = `/w/${workspaceId}/ideas/${home.idea.id}`;
const ideaPath = `/api/v1/ideas/${home.idea.id}`;

const as = (role: Role, extra: Partial<Me> = {}): Me => ({
  ...ana,
  ...extra,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

/** The API of 13, with `patch` answering I2 PATCH and `signIn` A1. */
function homeApi({
  me = ana,
  data = home,
  patch = () => Response.json({ ...home.idea, lockVersion: 4 }),
  signIn = () => Response.json({}),
}: {
  me?: Me;
  data?: typeof home;
  patch?: (call: Call) => Response;
  signIn?: () => Response;
} = {}) {
  return stubApi((call) => {
    const { method, path: called } = call;
    if (method === "GET" && called === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && called === "/api/v1/me") return Response.json(me);
    if (method === "GET" && called === `${ideaPath}/validation`) {
      return Response.json(data);
    }
    if (method === "PATCH" && called === ideaPath) return patch(call);
    if (method === "POST" && called === "/api/auth/sign-in/email") {
      return signIn();
    }
    return undefined;
  });
}

/**
 * V1's titles of the sections (SDD 5.7): 01 and 02 the template's, 03〜09 fixed. The
 * template below has no 10, which V1 then names by its key.
 */
const sectionTitles: Record<string, string> = {
  "01": "01 Customer & Problem",
  "02": "02 Market",
  "03": "03 Research Log",
  "04": "04 Competitors",
  "05": "05 Costs",
  "06-08": "06–08 Unit Economics",
  "09": "09 Assumptions & Risks",
};

/** A row of the template's cost table, without an amount, as a new validation has it. */
const emptyRow = (
  category: CostRowState["category"],
  templateKey: string,
  sortOrder: number,
): CostRowState => ({
  id: `8a1c0000-0000-4000-8000-00000000000${sortOrder}`,
  sortOrder,
  category,
  templateKey,
  inputMode: "amount",
  amount: null,
  percent: null,
  fau: null,
  confidence: null,
  activeEvidenceCount: 0,
});

/**
 * 13 of an idea just created (SDD 5.7 V1), evaluated as the API does: nothing answered,
 * the template's cost rows without amounts, no number, research, decision or plan.
 */
function createdHome(): ValidationHome {
  const fresh = validationHome({ latestDecision: null });
  const evaluation = evaluateValidation(
    {
      sections: [section01, section02],
      thresholds: {
        competitors: { min: 3 },
        local_price: { pricedCompetitors: 2, researchLogs: 1 },
        permits: { researchLogs: 1 },
        demand_signal: { researchLogs: 1 },
      },
      answers: [],
      researchLogs: [],
      competitors: [],
      assumptionCount: 0,
      riskCount: 0,
      costRows: [
        emptyRow("initial", "initial.permits", 0),
        emptyRow("monthly_fixed", "monthly.rent", 1),
      ],
      economicsInputs: [],
    },
    { workspaceId, ideaId: fresh.idea.id, canWrite: true },
  );
  const metric = (key: keyof ValidationHome["keyMetrics"]) =>
    keyMetricOf(evaluation.keyMetrics, key);
  return {
    ...fresh,
    summary: {
      customer: null,
      problem: null,
      solution: null,
      marketType: null,
    },
    keyMetrics: {
      initial_cost_total: metric("initial_cost_total"),
      break_even_units_day: metric("break_even_units_day"),
      expected_operating_profit: metric("expected_operating_profit"),
      payback_months: metric("payback_months"),
    },
    economicsWarnings: evaluation.economics.warnings,
    nextSteps: evaluation.nextSteps,
    checks: evaluation.checks,
    fau: evaluation.fau,
    sections: evaluation.sections.map((section) => ({
      ...section,
      title: sectionTitles[section.key] ?? section.key,
    })),
    decisions: [],
    plans: [],
    archivedPlanCount: 0,
    canAddPlan: false,
  };
}

async function openEditSummary() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit summary" }));
  const sheet = await screen.findByRole("dialog", { name: "Edit summary" });
  return { user, sheet };
}

const concept = (sheet: HTMLElement) =>
  within(sheet).getByRole("textbox", { name: /One-line concept/ });

describe("13 Validation home (design-spec 6.1)", () => {
  test("the numbers, next steps with the first one's reason, checks, sections, decisions", async () => {
    homeApi();
    const router = renderApp(path);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Bacolod Health Bowl",
      }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(document.title).toBe("Bacolod Health Bowl · BCDX · moonx"),
    );
    const numbers = screen.getByRole("group", { name: "Key numbers" });
    expect(numbers.textContent).toContain("₱114,000+");
    expect(numbers.textContent).toContain("Lower bound");
    expect(numbers.textContent).toContain("2.3+");
    expect(numbers.textContent).toContain("Needs Expected sales");
    const next = within(screen.getByRole("list", { name: "Next steps" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(next[0]).toContain("Add evidence (1)");
    expect(next[0]).toContain(
      "A Fact in 01 Customer & Problem lost its research log.",
    );
    expect(next[1]).toBe("Classify answers (3)");
    expect(next[2]).toBe("Fill or mark 1 empty cost row");
    const checks = screen.getByRole("list", { name: "Checks" });
    expect(checks.textContent).toContain("Done (4)");
    expect(checks.textContent).toContain("1 row is Empty");
    expect(checks.textContent).toContain(
      "Fill the Permits cost row, or log what you found",
    );
    const sections = screen.getByRole("list", { name: "Sections" });
    expect(sections.textContent).toContain("10/10");
    expect(sections.textContent).toContain("5 entries");
    expect(sections.textContent).toContain("4 (3–5)");
    expect(sections.textContent).toContain("2 · 3");
    expect(screen.getByText("“Permits are not checked yet.”")).toBeTruthy();
    expect(screen.getByText("62 items")).toBeTruthy();
    // Permits opens its cost row on 17; the checks with no link are not links.
    expect(
      within(checks)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([`/w/${workspaceId}/ideas/${home.idea.id}/costs`]);
    // Record decision opens 19 (design-spec 6.1「操作」).
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Record decision" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${home.idea.id}/decide`,
      ),
    );
  });

  test("just created: every number Empty, every check Not started, F/A/U Empty alone, Start with 01, no decisions", async () => {
    const created = createdHome();
    homeApi({ data: created });
    renderApp(path);
    const numbers = await screen.findByRole("group", { name: "Key numbers" });
    expect(within(numbers).getAllByText("Empty")).toHaveLength(4);
    const checks = within(screen.getByRole("list", { name: "Checks" }))
      .getAllByRole("listitem")
      .map((check) => check.textContent);
    expect(checks).toHaveLength(6);
    for (const check of checks) {
      expect(check).toContain("Not started");
      expect(check).not.toMatch(/Done|Partial/);
    }
    const fau = screen.getByRole("figure", {
      name: "Items by Fact, Assumption and Unknown",
    });
    expect(
      within(fau)
        .getAllByRole("listitem")
        .map((entry) => entry.textContent),
    ).toEqual([`Empty${created.fau.empty}`]);
    const [first] = within(screen.getByRole("list", { name: "Next steps" }))
      .getAllByRole("listitem")
      .map((step) => step.textContent);
    expect(first).toContain("Start with 01 Customer & Problem");
    expect(first).toContain("Nothing is filled in yet.");
    expect(
      screen.getByRole("region", { name: "Decisions" }).textContent,
    ).toContain("No decisions yet");
    expect(screen.getByRole("region", { name: "Plans" }).textContent).toContain(
      "No decisions yet",
    );
  });

  test("a decision but no plan: Plans says a plan starts after Proceed", async () => {
    // The fixture's idea is on Hold, with no plan.
    homeApi();
    renderApp(path);
    const plans = await screen.findByRole("region", { name: "Plans" });
    expect(plans.textContent).toContain(
      "No plans yet. A plan can start after a Proceed decision.",
    );
    expect(plans.textContent).not.toContain("No decisions yet");
  });

  test("another workspace's idea under this one's URL: no access, no tools", async () => {
    homeApi({
      data: validationHome({
        workspaceId: "6ba7b811-9dad-41d1-80b4-00c04fd430c8",
      }),
    });
    renderApp(path);
    expect(
      await screen.findByRole("heading", {
        name: "You don't have access to this",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit summary" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Record decision" }),
    ).toBeNull();
    expect(document.title).toBe("moonx");
  });

  test("a contribution margin of zero or less: the break-even's reason and its warning, a link to 18", async () => {
    const data = validationHome();
    homeApi({
      data: {
        ...data,
        keyMetrics: {
          ...data.keyMetrics,
          break_even_units_day: {
            value: null,
            bound: "exact",
            reason: "margin_not_positive",
          },
        },
        economicsWarnings: ["margin_not_positive"],
      },
    });
    renderApp(path);
    const numbers = await screen.findByRole("group", { name: "Key numbers" });
    expect(numbers.textContent).toContain(
      "Contribution margin is zero or negative. Review price or variable costs.",
    );
    expect(
      within(numbers)
        .getByRole("link", { name: "Contribution margin is zero or negative" })
        .getAttribute("href"),
    ).toBe(`${path}/economics`);
  });

  test("sections open 11 and 14〜18; an empty summary answer opens its question", async () => {
    homeApi();
    renderApp(path);
    await screen.findByRole("heading", {
      level: 1,
      name: "Bacolod Health Bowl",
    });
    const sections = screen.getByRole("list", { name: "Sections" });
    expect(
      within(sections)
        .getByRole("link", { name: /01 Customer & Problem/ })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${home.idea.id}/questions/01`);
    expect(
      within(sections)
        .getByRole("link", { name: /03 Research Log/ })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${home.idea.id}/research`);
    expect(
      within(sections)
        .getByRole("link", { name: /04 Competitors/ })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${home.idea.id}/competitors`);
    expect(
      within(sections)
        .getByRole("link", { name: /09 Assumptions & Risks/ })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${home.idea.id}/assumptions`);
    expect(
      within(sections)
        .getByRole("link", { name: /05 Costs/ })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${home.idea.id}/costs`);
    expect(
      within(sections)
        .getByRole("link", { name: /06–08 Unit Economics/ })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${home.idea.id}/economics`);
    const summary = screen.getByRole("region", { name: "Summary" });
    expect(
      within(summary)
        .getByRole("link", { name: "Answer in 01 Customer & Problem" })
        .getAttribute("href"),
    ).toBe(
      `/w/${workspaceId}/ideas/${home.idea.id}/questions/01?q=V.01.PROBLEM`,
    );
  });

  test("AI ▼: Export for AI on every question section, Import from AI into this validation, both back here", async () => {
    homeApi();
    renderApp(path);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "AI" }));
    const back = encodeURIComponent(path);
    expect(
      (
        await screen.findByRole("menuitem", { name: "Export for AI" })
      ).getAttribute("href"),
    ).toBe(
      `/w/${workspaceId}/ai/export?source=validation&id=${home.validationId}&returnTo=${back}`,
    );
    expect(
      screen
        .getByRole("menuitem", { name: "Import from AI" })
        .getAttribute("href"),
    ).toBe(
      `/w/${workspaceId}/ai/import?target=validation&id=${home.validationId}&returnTo=${back}`,
    );
  });

  test("a Viewer: no Edit summary, no AI, no ⋯; an empty summary answer opens its question to read", async () => {
    homeApi({ me: as("viewer") });
    renderApp(path);
    await screen.findByRole("heading", {
      level: 1,
      name: "Bacolod Health Bowl",
    });
    expect(screen.queryByRole("button", { name: "Edit summary" })).toBeNull();
    expect(screen.queryByRole("button", { name: "AI" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Record decision" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "More for Bacolod Health Bowl" }),
    ).toBeNull();
    // 11 opens read only: the way stays, worded for one who cannot answer.
    expect(screen.queryByRole("link", { name: /Answer in/ })).toBeNull();
    const summary = screen.getByRole("region", { name: "Summary" });
    expect(
      within(summary)
        .getByRole("link", { name: "Open 01 Customer & Problem" })
        .getAttribute("href"),
    ).toBe(
      `/w/${workspaceId}/ideas/${home.idea.id}/questions/01?q=V.01.PROBLEM`,
    );
  });

  test("dropped: the Drop badge, and Edit summary and Record decision stay (6.1 状態, PRD MB-12)", async () => {
    homeApi({
      me: as("member"),
      data: validationHome({ latestDecision: "drop" }),
    });
    renderApp(path);
    // The badge leads the line above the name.
    const status = (
      await screen.findByRole("heading", {
        level: 1,
        name: "Bacolod Health Bowl",
      })
    ).previousElementSibling as HTMLElement;
    expect(within(status).getByText("Drop")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit summary" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Record decision" }),
    ).toBeTruthy();
  });

  test("archived: the notice and Restore for an Owner, and no Edit summary or AI", async () => {
    const calls = homeApi({
      data: validationHome({ archived: true }),
    });
    renderApp(path);
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit summary" })).toBeNull();
    // No AI round trip on an archived idea (design-spec 6.8).
    expect(screen.queryByRole("button", { name: "AI" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Record decision" }),
    ).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path: called }) =>
            method === "POST" && called === `${ideaPath}/restore`,
        ),
      ).toBe(true),
    );
  });
});

describe("13's blocks and counts (design-spec 6.1・6.0.3, SDD 8.2)", () => {
  test("a block that fails to render says so alone: the other blocks and the navigation stay", async () => {
    // React logs what a boundary catches; the failure is the test's point.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(sentry, "reportError").mockReturnValue(
      "3f2a9c1d0b8e4f5aa1b2c3d4e5f6a7b8",
    );
    homeApi({
      data: {
        ...home,
        // A check's Next step without its check: what V1 never sends (SDD 5.2).
        nextSteps: [
          {
            kind: "check",
            count: null,
            checkKey: null,
            sectionKey: null,
            link: null,
          },
        ],
      },
    });
    renderApp(path);
    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Something went wrong",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Ref: 3f2a9c1d")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Next steps" })).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Bacolod Health Bowl" }),
    ).toBeTruthy();
    expect(screen.getByRole("list", { name: "Checks" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Sections" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Key numbers" })).toBeTruthy();
    // The side navigation and the TabBar alike (the width picks one).
    for (const nav of screen.getAllByRole("navigation", { name: "Main" })) {
      expect(
        within(nav)
          .getByRole("link", { name: "Ideas" })
          .getAttribute("aria-current"),
      ).toBe("page");
    }
  });

  test("the F/A/U legend counts a Fact without evidence among the Facts and says how many", async () => {
    homeApi();
    renderApp(path);
    const fau = await screen.findByRole("figure", {
      name: "Items by Fact, Assumption and Unknown",
    });
    const entries = within(fau)
      .getAllByRole("listitem")
      .map((entry) => entry.textContent);
    expect(entries[0]).toBe("Fact5(1 without evidence)");
    expect(entries[1]).toBe("Assumption37L6 M17 H14");
    cleanup();
    vi.unstubAllGlobals();
    homeApi({ data: { ...home, fau: { ...home.fau, factNoEvidence: 0 } } });
    renderApp(path);
    const none = await screen.findByRole("figure", {
      name: "Items by Fact, Assumption and Unknown",
    });
    expect(within(none).getAllByRole("listitem")[0]?.textContent).toBe("Fact5");
  });

  test("a proposer who left reads as a former member (design-spec 6.16)", async () => {
    homeApi({
      data: validationHome({
        proposer: {
          ...home.idea.proposer,
          displayName: "Kenji Mori",
          badge: "former_member",
        },
      }),
    });
    renderApp(path);
    expect(
      await screen.findByText("— Kenji Mori (former member)"),
    ).toBeTruthy();
  });

  test("counts past a thousand group their thousands (design-spec 1.2)", async () => {
    homeApi({
      data: {
        ...home,
        fau: {
          fact: 1200,
          factNoEvidence: 1001,
          assumption: { total: 3000, low: 1000, medium: 1000, high: 1000 },
          unknown: 1500,
          unclassified: 0,
          empty: 0,
        },
        sections: home.sections.map((section) =>
          section.key === "09"
            ? { ...section, count: 1234, countB: 1500 }
            : section,
        ),
      },
    });
    renderApp(path);
    const fau = await screen.findByRole("figure", {
      name: "Items by Fact, Assumption and Unknown",
    });
    expect(fau.textContent).toContain("(1,001 without evidence)");
    expect(fau.textContent).toContain("L1,000 M1,000 H1,000");
    expect(screen.getByText("5,700 items")).toBeTruthy();
    expect(
      screen.getByRole("list", { name: "Sections" }).textContent,
    ).toContain("1,234 · 1,500");
  });
});

describe("13's plans (design-spec 6.1・6.12)", () => {
  const proceeded = {
    ...validationHome({ latestDecision: "proceed" }),
    plans: [
      {
        id: "3d6f0a2c-5b1e-4c8d-9a7f-2e4b6c8d0a1f",
        name: "Plan A",
        archived: false,
        latestVersion: null,
        hasChangesSinceVersion: false,
        latestGoNoGo: null,
      },
    ],
  };

  test("a plan opens its 20; after Proceed, Add plan opens M5 over 13", async () => {
    const user = userEvent.setup();
    homeApi({ data: proceeded });
    const router = renderApp(path);
    const plans = await screen.findByRole("list", { name: "Plans" });
    expect(
      within(plans)
        .getByRole("link", { name: /Plan A/ })
        .getAttribute("href"),
    ).toBe(`${path}/plans/3d6f0a2c-5b1e-4c8d-9a7f-2e4b6c8d0a1f`);
    expect(within(plans).getByText("No version saved")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Add plan" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        modal: "create-plan",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Create plan draft" }),
    ).toBeTruthy();
  });

  test("no Add plan before Proceed, nor for a Viewer", async () => {
    homeApi();
    renderApp(path);
    await screen.findByRole("heading", {
      level: 1,
      name: "Bacolod Health Bowl",
    });
    expect(screen.queryByRole("link", { name: "Add plan" })).toBeNull();
    cleanup();
    vi.unstubAllGlobals();
    homeApi({ me: as("viewer"), data: proceeded });
    renderApp(path);
    await screen.findAllByRole("list", { name: "Plans" });
    expect(screen.queryByRole("link", { name: "Add plan" })).toBeNull();
    // A Viewer opening M5's URL gets nothing (6.0.6: no way to act).
    cleanup();
    vi.unstubAllGlobals();
    homeApi({ me: as("viewer"), data: proceeded });
    renderApp(`${path}?modal=create-plan`);
    await screen.findAllByRole("list", { name: "Plans" });
    expect(
      screen.queryByRole("dialog", { name: "Create plan draft" }),
    ).toBeNull();
  });

  test.each([
    [
      "the latest decision is Hold",
      { ...proceeded, idea: { ...proceeded.idea, latestDecision: "hold" } },
    ],
    [
      "the idea is archived, after Proceed",
      { ...proceeded, idea: { ...proceeded.idea, archived: true } },
    ],
  ] as const)(
    "%s: an Owner has no Add plan, and M5's URL opens nothing (6.1・6.8)",
    async (_, data) => {
      homeApi({ data });
      renderApp(path);
      const plans = await screen.findByRole("list", { name: "Plans" });
      expect(within(plans).getByRole("link", { name: /Plan A/ })).toBeTruthy();
      expect(screen.queryByRole("link", { name: "Add plan" })).toBeNull();
      cleanup();
      vi.unstubAllGlobals();
      homeApi({ data });
      renderApp(`${path}?modal=create-plan`);
      await screen.findByRole("list", { name: "Plans" });
      expect(
        screen.queryByRole("dialog", { name: "Create plan draft" }),
      ).toBeNull();
      expect(screen.queryByRole("link", { name: "Add plan" })).toBeNull();
    },
  );
});

test("a lost session met by an action of ⋯ leaves for the sign-in screen (SDD 8.2)", async () => {
  stubApi(({ method, path: called }) => {
    if (method === "GET" && called === "/api/v1/me") return Response.json(ana);
    if (method === "GET" && called === `${ideaPath}/validation`) {
      return Response.json(home);
    }
    if (method === "POST" && called === `${ideaPath}/archive`) {
      return apiError(401, "UNAUTHENTICATED");
    }
    return undefined;
  });
  const router = renderApp(path);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "More for Bacolod Health Bowl" }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toEqual({ next: path });
});

describe("Edit summary: saved as typed (design-spec 6.0.2)", () => {
  test("sent once typing pauses, with the version read and the client; Saved in the header", async () => {
    const calls = homeApi();
    renderApp(path);
    const { user, sheet } = await openEditSummary();
    await user.clear(concept(sheet));
    await user.type(concept(sheet), "Bowls by noon");
    await waitFor(
      () =>
        expect(
          calls.filter(
            ({ method, path: called }) =>
              method === "PATCH" && called === ideaPath,
          ),
        ).toHaveLength(1),
      { timeout: 3000 },
    );
    const patch = calls.findLast(
      ({ method, path: called }) => method === "PATCH" && called === ideaPath,
    );
    expect(patch?.body).toEqual({
      oneLineConcept: "Bowls by noon",
      lockVersion: 3,
    });
    expect(await screen.findByText("Saved")).toBeTruthy();
  });

  test("an empty name says why and is not sent", async () => {
    const calls = homeApi();
    renderApp(path);
    const { user, sheet } = await openEditSummary();
    await user.clear(within(sheet).getByRole("textbox", { name: /^Name/ }));
    expect(within(sheet).getByText("Can't be empty")).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(
      calls.filter(
        ({ method, path: called }) => method === "PATCH" && called === ideaPath,
      ),
    ).toEqual([]);
  });

  test("someone saved first: the question, Copy my input, then Load theirs or Overwrite", async () => {
    let conflicted = 0;
    const calls = homeApi({
      patch: ({ body }) => {
        const force = (body as { force?: boolean }).force === true;
        if (!force && conflicted < 2) {
          conflicted += 1;
          return apiError(409, "CONFLICT", {
            current: {
              value: {
                name: "Bacolod Health Bowl",
                oneLineConcept: "Theirs",
                proposedSolution: null,
              },
              lockVersion: 5,
              updatedAt: new Date().toISOString(),
              updatedBy: {
                id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
                displayName: "Paolo Gonzaga",
                avatarUrl: null,
                badge: null,
              },
            },
          });
        }
        return Response.json({ ...home.idea, lockVersion: 6 });
      },
    });
    renderApp(path);
    const { user, sheet } = await openEditSummary();
    await user.clear(concept(sheet));
    await user.type(concept(sheet), "Mine");
    await user.tab();
    const question = await screen.findByRole("alertdialog", {
      name: /Paolo Gonzaga updated this summary/,
    });
    await user.click(
      within(question).getByRole("button", { name: "Copy my input" }),
    );
    // userEvent stands in for the clipboard.
    expect(await navigator.clipboard.readText()).toBe("Mine");
    await user.click(
      within(question).getByRole("button", { name: "Load theirs" }),
    );
    await waitFor(() =>
      expect(concept(sheet)).toHaveProperty("value", "Theirs"),
    );

    await user.type(concept(sheet), " and mine");
    await user.tab();
    const again = await screen.findByRole("alertdialog", {
      name: /Paolo Gonzaga updated this summary/,
    });
    await user.click(
      within(again).getByRole("button", { name: "Overwrite with mine" }),
    );
    await waitFor(() =>
      expect(
        calls.findLast(({ method }) => method === "PATCH")?.body,
      ).toMatchObject({ oneLineConcept: "Theirs and mine", force: true }),
    );
  });

  test("a copy that fails shows the input in the question, to select", async () => {
    homeApi({
      patch: () =>
        apiError(409, "CONFLICT", {
          current: {
            value: {
              name: "Bacolod Health Bowl",
              oneLineConcept: "Theirs",
              proposedSolution: null,
            },
            lockVersion: 5,
            updatedAt: new Date().toISOString(),
            updatedBy: null,
          },
        }),
    });
    renderApp(path);
    const { user, sheet } = await openEditSummary();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("Not allowed"),
    );
    await user.clear(concept(sheet));
    await user.type(concept(sheet), "Mine");
    await user.tab();
    const question = await screen.findByRole("alertdialog", {
      name: /Someone updated this summary/,
    });
    await user.click(
      within(question).getByRole("button", { name: "Copy my input" }),
    );
    expect(
      await within(question).findByRole("textbox", { name: "Your input" }),
    ).toHaveProperty("value", "Mine");
    expect(question.textContent).toContain(
      "Couldn't copy. Select your input below to copy it.",
    );
  });

  test("a failure that may pass: Couldn't save and Retry beside the fields", async () => {
    homeApi({ patch: () => apiError(503, "UPSTREAM_UNAVAILABLE") });
    renderApp(path);
    const { user, sheet } = await openEditSummary();
    await user.type(concept(sheet), "!");
    await user.tab();
    expect(await within(sheet).findByText("Couldn't save")).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  test("refused for good: the reason beside Couldn't save", async () => {
    homeApi({ patch: () => apiError(409, "ARCHIVED") });
    renderApp(path);
    const { user, sheet } = await openEditSummary();
    await user.type(concept(sheet), "!");
    await user.tab();
    expect(await within(sheet).findByText("It's archived")).toBeTruthy();
  });
});

describe("M9 Sign in again (design-spec 3.8)", () => {
  test("the session ended with input unsaved: sign in with the password, and it is sent", async () => {
    let signedIn = false;
    const calls = homeApi({
      patch: () =>
        signedIn
          ? Response.json({ ...home.idea, lockVersion: 4 })
          : apiError(401, "UNAUTHENTICATED"),
      signIn: () => {
        const answer = calls.filter(
          ({ path: p }) => p === "/api/auth/sign-in/email",
        ).length;
        if (answer === 1) return authError(401, "INVALID_EMAIL_OR_PASSWORD");
        signedIn = true;
        return Response.json({});
      },
    });
    renderApp(path);
    const { user, sheet } = await openEditSummary();
    await user.type(concept(sheet), "!");
    await user.tab();
    const m9 = await screen.findByRole("dialog", { name: "Sign in again" });
    expect(within(m9).getByRole("textbox", { name: "Email" })).toHaveProperty(
      "value",
      ana.email,
    );
    const password = within(m9).getByLabelText(/^Password/);
    await user.type(password, "wrong-password");
    await user.click(within(m9).getByRole("button", { name: "Sign in" }));
    expect(await within(m9).findByText("Password is incorrect")).toBeTruthy();
    await user.clear(password);
    await user.type(password, "the-right-password");
    await user.click(within(m9).getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Sign in again" }),
      ).toBeNull(),
    );
    await waitFor(() =>
      expect(
        calls.filter(
          ({ method, path: p }) => method === "PATCH" && p === ideaPath,
        ),
      ).toHaveLength(2),
    );
    expect(
      calls.find(({ path: p }) => p === "/api/auth/sign-in/email")?.body,
    ).toEqual({ email: ana.email, password: "wrong-password" });
  });

  test("a Google user signs in on the login page, after the unsaved input is confirmed lost", async () => {
    homeApi({
      me: { ...ana, hasPassword: false },
      patch: () => apiError(401, "UNAUTHENTICATED"),
    });
    const router = renderApp(path);
    const { user, sheet } = await openEditSummary();
    await user.type(concept(sheet), "!");
    await user.tab();
    const m9 = await screen.findByRole("dialog", { name: "Sign in again" });
    expect(within(m9).queryByLabelText(/^Password/)).toBeNull();
    expect(within(m9).queryByRole("textbox", { name: "Email" })).toBeNull();
    await user.click(
      within(m9).getByRole("button", { name: "Sign in on the login page" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: /Leave this page\?/,
    });
    expect(confirm.textContent).toContain(
      "Unsaved changes on this page will be lost.",
    );
    await user.click(
      within(confirm).getByRole("button", {
        name: "Sign in on the login page",
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toEqual({ next: path });
  });
});
