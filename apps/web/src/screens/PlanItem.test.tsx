import type {
  ExecutionItem,
  HistoryEntry,
  KeyMetrics,
  Me,
  MetricValue,
  PlanAnswer,
  PlanItem,
  PlanReference,
  Role,
  TemplateQuestion,
} from "@moonx/schemas";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  anaRef,
  ideaId,
  planHome,
  planId,
  planPath,
  plans,
  versionId,
} from "../test/plans";
import { home as ideaHome } from "../test/validation";

// 21 Plan item (design-spec 6.12・6.13, SDD 5.9 P4・P5・P9・P10).

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const api = `/api/v1/plans/${planId}`;
const itemPath = (itemNo: number, search = "") =>
  planPath(`/items/${itemNo}${search}`);

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

const prompt = (
  key: string,
  title: string,
  extra: Partial<TemplateQuestion> = {},
): TemplateQuestion => ({
  key,
  sectionKey: key.split(".")[1] ?? "",
  title,
  prompt: `${title}?`,
  example: null,
  hint: null,
  answerType: "long_text",
  options: null,
  displayCondition: null,
  hasFau: false,
  ...extra,
});

const answer = (
  questionKey: string,
  extra: Partial<PlanAnswer> = {},
): PlanAnswer => ({
  questionKey,
  text: null,
  rows: null,
  copiedFrom: null,
  commentCount: 0,
  lockVersion: 0,
  updatedAt: null,
  updatedBy: null,
  ...extra,
});

const value = (amount: number): MetricValue => ({
  value: amount,
  bound: "exact",
  reason: null,
});

const metrics: KeyMetrics = {
  initial_cost_total: value(169500),
  break_even_units_month: value(207),
  expected_revenue: value(84000),
  expected_operating_profit: value(18490),
  payback_months: value(9.2),
  selling_price: value(250),
};

const milestone = (
  id: string,
  title: string,
  extra: Partial<ExecutionItem> = {},
): ExecutionItem => ({
  id,
  type: "milestone",
  title,
  assignee: null,
  dueDate: null,
  status: "todo",
  overdue: false,
  goal: null,
  exitCondition: null,
  launchTiming: null,
  actions: null,
  completionCriteria: null,
  kpiArea: null,
  kpiTarget: null,
  kpiReviewFrequency: null,
  kpiActual: null,
  kpiActualUpdatedAt: null,
  whyItMatters: null,
  answer: null,
  fromPreset: true,
  completedAt: null,
  sortOrder: 0,
  commentCount: 0,
  lockVersion: 1,
  updatedAt: "2026-10-01T02:00:00.000Z",
  updatedBy: anaRef,
  ...extra,
});

/** §1: a copied answer, one to write, and the key numbers from the validation. */
const summary: PlanItem = {
  itemNo: 1,
  title: "Executive Summary",
  guidance: "One page a lender reads first.",
  readOnly: false,
  prompts: [
    prompt("P.01.1", "What is the business?", {
      example: "A box of piaya delivered to offices.",
    }),
    prompt("P.01.2", "Who is the primary customer?", {
      hint: "Name who pays.",
    }),
    prompt("P.01.7", "Key numbers", {
      answerType: "linked_metric",
      options: {
        kind: "linked_metric",
        metricKeys: [
          "initial_cost_total",
          "break_even_units_month",
          "expected_revenue",
          "expected_operating_profit",
          "payback_months",
        ],
      },
    }),
  ],
  answers: [
    answer("P.01.1", {
      text: "Healthy bowls for office workers.",
      copiedFrom: {
        source: "IDEA.ONE_LINE_CONCEPT",
        copiedAt: "2026-09-01T02:00:00.000Z",
      },
      commentCount: 1,
      lockVersion: 1,
    }),
    answer("P.01.2"),
  ],
  metrics,
  scenarios: [],
  execution: [],
  references: [],
};

const ownershipColumns = [
  { key: "name", label: "Name", type: "text" as const },
  {
    key: "initial_ownership",
    label: "Initial ownership (%)",
    type: "percent" as const,
  },
  {
    key: "initial_capital",
    label: "Initial capital contribution",
    type: "money" as const,
  },
];

/** §13: the table of owners, with their totals under it. */
const ownership = (rows: PlanAnswer["rows"]): PlanItem => ({
  itemNo: 13,
  title: "Ownership & Money Between Founders",
  guidance: null,
  readOnly: false,
  prompts: [
    prompt("P.13.1", "Ownership and capital", {
      answerType: "table",
      options: { kind: "table", columns: ownershipColumns },
    }),
  ],
  answers: [answer("P.13.1", { rows, lockVersion: rows === null ? 0 : 3 })],
  metrics: {},
  scenarios: [],
  execution: [],
  references: [
    {
      kind: "totals",
      title: "Totals",
      data: { ownership: 0, capital: 0 },
      link: null,
    },
  ],
});

/** §23: the plan's milestones, shown and added as 22's. */
const milestones = (execution: ExecutionItem[]): PlanItem => ({
  itemNo: 23,
  title: "Pre-launch Milestones",
  guidance: null,
  readOnly: false,
  prompts: [
    prompt("P.23.1", "Pre-launch Milestones", {
      answerType: "execution_view",
      options: { kind: "execution_view", executionType: "milestone" },
    }),
  ],
  answers: [],
  metrics: {},
  scenarios: [],
  execution,
  references: [],
});

const competitorsReference: PlanReference = {
  kind: "competitors",
  title: "Competitors",
  data: [
    {
      id: "5c0c0000-0000-4000-8000-000000000001",
      name: "Bowl Stop",
      type: "direct",
      typicalPrice: 180,
      strength: "Near the offices",
      weakness: null,
    },
  ],
  link: { screen: 15, workspaceId, ideaId },
};

/** §6: a choice, with the competitors and the validation's 02 to look at. */
const market: PlanItem = {
  itemNo: 6,
  title: "Market & Competition",
  guidance: null,
  readOnly: false,
  prompts: [
    prompt("P.06.1", "Market type", {
      answerType: "choice",
      options: { kind: "choice", choices: ["Red", "Blue", "Mixed"] },
    }),
  ],
  answers: [answer("P.06.1")],
  metrics: {},
  scenarios: [],
  execution: [],
  references: [
    competitorsReference,
    {
      kind: "validation_answers",
      title: "Validation · 02 Market",
      data: [
        { questionKey: "V.02.OCEAN", title: "OCEAN", text: "Red" },
        { questionKey: "V.02.WHY", title: "WHY", text: null },
      ],
      link: { screen: 11, workspaceId, ideaId, sectionKey: "02" },
    },
    {
      kind: "research_log",
      title: "Research Log · Permits",
      data: [],
      link: { screen: 14, workspaceId, ideaId },
    },
    {
      kind: "cost_rows",
      title: "Costs",
      data: [
        {
          id: "c0570000-0000-4000-8000-000000000001",
          category: "monthly_fixed",
          templateKey: "monthly.rent",
          name: "Rent",
          inputMode: "amount",
          amount: 18000,
          percent: null,
          value: value(18000),
        },
        {
          id: null,
          category: "initial",
          templateKey: "initial.lease_deposit",
          name: "Lease Deposit / Advance",
          inputMode: null,
          amount: null,
          percent: null,
          value: { value: null, bound: "exact", reason: "empty" },
        },
      ],
      link: { screen: 17, workspaceId, ideaId },
    },
  ],
};

/**
 * The API of 21: `items` answers P4 (a version's with `version`), the saves keep what
 * they send, and P9 POST makes the item `created`.
 */
function itemApi({
  me = ana,
  items,
  version,
  home = planHome(),
  ideaArchived = false,
  created,
  history = [],
}: {
  me?: Me;
  items: PlanItem[];
  version?: PlanItem[];
  home?: ReturnType<typeof planHome>;
  ideaArchived?: boolean;
  created?: ExecutionItem;
  history?: HistoryEntry[];
}) {
  const answers = new Map(
    items.flatMap((item) =>
      item.answers.map((saved) => [saved.questionKey, saved] as const),
    ),
  );
  return stubApi((call: Call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (method === "GET" && path === `/api/v1/ideas/${ideaId}/validation`) {
      return Response.json({
        ...ideaHome,
        idea: { ...ideaHome.idea, archived: ideaArchived },
      });
    }
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${ideaId}/plans?includeArchived=true`
    ) {
      return Response.json({ items: plans });
    }
    if (method === "GET" && path === api) return Response.json(home);
    if (method === "GET" && path === `${api}?versionId=${versionId}`) {
      return Response.json({ ...home, viewingVersion: home.latestVersion });
    }
    if (method === "GET" && path.startsWith(`${api}/items/`)) {
      const [no, search] = (path.split("/items/")[1] ?? "").split("?");
      const list = search === `versionId=${versionId}` ? version : items;
      const item = list?.find(({ itemNo }) => itemNo === Number(no));
      return item === undefined ? undefined : Response.json(item);
    }
    if (
      method === "GET" &&
      path === `/api/v1/validations/${ideaHome.validationId}/costs`
    ) {
      return Response.json({
        items: [
          {
            id: "c0570000-0000-4000-8000-000000000001",
            category: "monthly_fixed",
            templateKey: "monthly.rent",
            name: "Stall rent",
          },
        ],
      });
    }
    if (method === "PUT" && path.startsWith(`${api}/answers/`)) {
      const key = decodeURIComponent(path.split("/answers/")[1] ?? "");
      const body = call.body as {
        text?: string;
        rows?: PlanAnswer["rows"];
        lockVersion: number;
      };
      const before = answers.get(key) ?? answer(key);
      const after = {
        ...before,
        ...(body.text === undefined ? {} : { text: body.text }),
        ...(body.rows === undefined ? {} : { rows: body.rows }),
        lockVersion: body.lockVersion + 1,
      };
      answers.set(key, after);
      return Response.json(after);
    }
    if (method === "POST" && path === `${api}/execution-items`) {
      return created === undefined
        ? undefined
        : Response.json(created, { status: 201 });
    }
    if (method === "PATCH" && path.startsWith("/api/v1/execution-items/")) {
      const id = path.split("/").at(-1);
      const item = items
        .flatMap(({ execution }) => execution)
        .find((entry) => entry.id === id);
      const body = call.body as Partial<ExecutionItem> & {
        lockVersion: number;
      };
      return item === undefined
        ? undefined
        : Response.json({
            ...item,
            ...body,
            lockVersion: body.lockVersion + 1,
          });
    }
    if (
      method === "GET" &&
      path === `/api/v1/workspaces/${workspaceId}/members`
    ) {
      return Response.json({
        items: [
          {
            user: anaRef,
            email: null,
            role: "owner",
            joinedAt: "2026-01-01T00:00:00.000Z",
            isPersonalOwner: false,
          },
        ],
      });
    }
    if (method === "GET" && path.startsWith("/api/v1/comments?")) {
      return Response.json({ threads: [], unresolvedCount: 0 });
    }
    if (method === "GET" && path.startsWith("/api/v1/history?")) {
      return Response.json({ items: history, nextCursor: null });
    }
    return undefined;
  });
}

const sent = (calls: Call[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path);

const card = (title: string) => screen.getByRole("region", { name: title });

describe("21 Plan item (design-spec 6.12)", () => {
  test("opens on the first sub-item not answered, its field focused; the numbers do not count", async () => {
    itemApi({ items: [summary] });
    renderApp(itemPath(1));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "1 Executive Summary",
      }),
    ).toBeTruthy();
    const customer = await screen.findByRole("textbox", {
      name: "Answer to Who is the primary customer?",
    });
    await waitFor(() => expect(document.activeElement).toBe(customer));
    // Two sub-items take an answer; Key numbers is read from the validation.
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getByText("One page a lender reads first.")).toBeTruthy();
    // The others stay quiet: their answer's start, and the numbers in one line.
    expect(card("What is the business?").textContent).toContain(
      "Healthy bowls for office workers.",
    );
    expect(card("Key numbers").textContent).toContain("₱169,500");
    await waitFor(() =>
      expect(document.title).toBe(
        "1 Executive Summary · Plan A · BCDX · moonx",
      ),
    );
    // The breadcrumbs, and the way through the plan's items.
    const crumbs = screen.getByRole("list", { name: "Breadcrumbs" });
    expect(
      within(crumbs).getByRole("link", { name: "Plan A" }).getAttribute("href"),
    ).toBe(planPath());
    expect(
      screen.getByRole("button", { name: /Next: 2 Vision & Purpose/ })
        .textContent,
    ).toContain("Next: 2 Vision & Purpose");
    expect(screen.queryByRole("button", { name: "Previous item" })).toBeNull();
  });

  test("?q= focuses that sub-item; its Example opens with it, its comments and history beside it", async () => {
    const user = userEvent.setup();
    itemApi({ items: [summary] });
    renderApp(itemPath(1, "?q=P.01.1"));
    const business = await screen.findByRole("textbox", {
      name: "Answer to What is the business?",
    });
    await waitFor(() => expect(document.activeElement).toBe(business));
    const open = card("What is the business?");
    expect(
      within(open)
        .getByRole("button", { name: "EXAMPLE" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      within(open).getByText("A box of piaya delivered to offices."),
    ).toBeTruthy();
    expect(
      within(open).getByRole("button", {
        name: /Comments on 01 What is the business\?/,
      }),
    ).toBeTruthy();
    await user.click(
      within(open).getByRole("button", {
        name: "History of 01 What is the business?",
      }),
    );
    expect(
      await screen.findByRole("complementary", { name: "History" }),
    ).toBeTruthy();
  });

  test("a text saves as typed (P5), with the version it was read at", async () => {
    const user = userEvent.setup();
    const calls = itemApi({ items: [summary] });
    renderApp(itemPath(1));
    const customer = await screen.findByRole("textbox", {
      name: "Answer to Who is the primary customer?",
    });
    await waitFor(() => expect(document.activeElement).toBe(customer));
    await user.type(customer, "Office workers");
    await user.tab();
    await waitFor(() =>
      expect(sent(calls, "PUT", `${api}/answers/P.01.2`)).toHaveLength(1),
    );
    expect(sent(calls, "PUT", `${api}/answers/P.01.2`)[0]?.body).toEqual({
      text: "Office workers",
      lockVersion: 0,
    });
    await waitFor(() => expect(screen.getByText("2/2")).toBeTruthy());
  });

  test("a text the draft copied over its limit says so and is sent only once short enough", async () => {
    const user = userEvent.setup();
    const long = "x".repeat(20001);
    const calls = itemApi({
      items: [
        {
          ...summary,
          answers: [
            answer("P.01.1", {
              text: long,
              copiedFrom: {
                source: "IDEA.PROPOSED_SOLUTION",
                copiedAt: "2026-09-01T02:00:00.000Z",
              },
              lockVersion: 1,
            }),
            answer("P.01.2", { text: "Office workers", lockVersion: 1 }),
          ],
        },
      ],
    });
    renderApp(itemPath(1, "?q=P.01.1"));
    const business = await screen.findByRole("textbox", {
      name: "Answer to What is the business?",
    });
    expect(
      await within(card("What is the business?")).findByText(
        "Too long. Shorten to 20,000 characters.",
      ),
    ).toBeTruthy();
    await user.type(business, "y");
    await user.tab();
    expect(sent(calls, "PUT", `${api}/answers/P.01.1`)).toHaveLength(0);
  });

  test("a choice saves as it is chosen", async () => {
    const user = userEvent.setup();
    const calls = itemApi({ items: [market] });
    renderApp(itemPath(6));
    const blue = await screen.findByRole("radio", { name: "Blue" });
    await user.click(blue);
    await waitFor(() =>
      expect(sent(calls, "PUT", `${api}/answers/P.06.1`)[0]?.body).toEqual({
        text: "Blue",
        lockVersion: 0,
      }),
    );
  });

  test("the numbers are read only, with the way to fix them in the validation", async () => {
    itemApi({ items: [summary] });
    renderApp(itemPath(1, "?q=P.01.7"));
    const numbers = await screen.findByRole("region", {
      name: "Key numbers",
    });
    await waitFor(() =>
      expect(within(numbers).getByText("Startup cost")).toBeTruthy(),
    );
    expect(within(numbers).getByText("₱169,500")).toBeTruthy();
    expect(within(numbers).getByText("Payback")).toBeTruthy();
    expect(within(numbers).queryByRole("textbox")).toBeNull();
    // Several numbers are 18's to fix (design-spec 6.4「直す画面」).
    expect(
      within(numbers)
        .getByRole("link", { name: "Edit in validation" })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${ideaId}/economics`);
  });

  test("a scenario shows 6.4's column of it; one number opens where it is fixed", async () => {
    const figure = (amount: number) => value(amount);
    const model: PlanItem = {
      itemNo: 8,
      title: "Business Model",
      guidance: null,
      readOnly: false,
      prompts: [
        prompt("P.08.3", "Average selling price", {
          answerType: "linked_metric",
          options: { kind: "linked_metric", metricKeys: ["selling_price"] },
        }),
        prompt("P.08.9", "Expected scenario", {
          answerType: "linked_metric",
          options: {
            kind: "linked_metric",
            metricKeys: ["scenario:expected"],
          },
        }),
        prompt("P.08.11", "Why is the startup cost justified?"),
        prompt("P.08.12", "Payroll", {
          answerType: "linked_metric",
          options: {
            kind: "linked_metric",
            metricKeys: ["cost_row:monthly.salaries"],
          },
        }),
        prompt("P.08.13", "Price and rent", {
          answerType: "linked_metric",
          options: {
            kind: "linked_metric",
            metricKeys: ["selling_price", "cost_row:monthly.rent"],
          },
        }),
      ],
      answers: [answer("P.08.11")],
      metrics: {
        selling_price: value(250),
        "cost_row:monthly.rent": value(18000),
      },
      scenarios: [
        {
          key: "expected",
          unitsPerDay: figure(12),
          unitsPerMonth: figure(360),
          revenue: figure(90000),
          variableCostTotal: figure(43200),
          operatingProfit: figure(18490),
          operatingMargin: figure(0.205),
          exceedsCapacity: false,
        },
      ],
      execution: [],
      references: [],
    };
    itemApi({ items: [model] });
    renderApp(itemPath(8, "?q=P.08.9"));
    const scenario = await screen.findByRole("region", {
      name: "Expected scenario",
    });
    await waitFor(() =>
      expect(within(scenario).getByText("₱90,000")).toBeTruthy(),
    );
    expect(scenario.textContent).toContain("₱18,490");
    expect(scenario.textContent).toContain("20.5%");
    // Not 18's whole row: the month's units and the variable costs stay on 18.
    expect(scenario.textContent).not.toContain("₱43,200");
    expect(
      within(scenario)
        .getByRole("link", { name: "Edit in validation" })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${ideaId}/economics`);
    // Quiet, a single number reads as its value; a deleted cost row as Empty (6.4).
    expect(card("Average selling price").textContent).toContain("₱250");
    expect(card("Payroll").textContent).toContain("Empty");
    // Beside other numbers, a cost row goes by its name in the validation (6.4).
    await waitFor(() =>
      expect(card("Price and rent").textContent).toContain(
        "Stall rent ₱18,000",
      ),
    );
    expect(card("Price and rent").textContent).toContain("Price ₱250");
  });

  test("AI ▼ exports this item and imports into this plan, both back to 21", async () => {
    const user = userEvent.setup();
    itemApi({ items: [summary] });
    renderApp(itemPath(1));
    await screen.findByRole("heading", {
      level: 1,
      name: "1 Executive Summary",
    });
    await user.click(screen.getByRole("button", { name: "AI" }));
    const back = encodeURIComponent(itemPath(1));
    expect(
      (
        await screen.findByRole("menuitem", { name: "Export for AI" })
      ).getAttribute("href"),
    ).toBe(
      `/w/${workspaceId}/ai/export?source=business_plan&id=${planId}&scope=01&returnTo=${back}`,
    );
    expect(
      screen
        .getByRole("menuitem", { name: "Import from AI" })
        .getAttribute("href"),
    ).toBe(
      `/w/${workspaceId}/ai/import?target=business_plan&id=${planId}&returnTo=${back}`,
    );
  });

  test("the item switch lists the plan's items by part", async () => {
    const user = userEvent.setup();
    itemApi({ items: [summary] });
    renderApp(itemPath(1));
    await user.click(
      await screen.findByRole("button", { name: "Switch item" }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getByRole("menuitem", {
          name: "13 Ownership & Money Between Founders",
        })
        .getAttribute("href"),
    ).toBe(itemPath(13));
    expect(within(menu).getByText("Part B: Execution Plan")).toBeTruthy();
  });

  test("an item number outside 1–30 is Not found", async () => {
    itemApi({ items: [summary] });
    renderApp(itemPath(31));
    expect(await screen.findByText("Not found. Check the link.")).toBeTruthy();
  });
});

describe("21's table sub-items (design-spec 6.12・6.0.8)", () => {
  test("No rows, then Add row sends a row of empty cells", async () => {
    const user = userEvent.setup();
    const calls = itemApi({ items: [ownership(null)] });
    renderApp(itemPath(13));
    const table = await screen.findByRole("region", {
      name: "Ownership and capital",
    });
    expect(within(table).getByText("No rows")).toBeTruthy();
    await user.click(
      within(table).getByRole("button", {
        name: "Add row to Ownership and capital",
      }),
    );
    await waitFor(() =>
      expect(sent(calls, "PUT", `${api}/answers/P.13.1`)[0]?.body).toEqual({
        rows: [{ name: null, initial_ownership: null, initial_capital: null }],
        lockVersion: 0,
      }),
    );
  });

  test("a % is shown as typed and kept as its rate; the totals under the table, no warning", async () => {
    const user = userEvent.setup();
    const calls = itemApi({
      items: [
        ownership([
          { name: "Ana", initial_ownership: 0.4, initial_capital: 50000 },
          { name: "Paolo", initial_ownership: 0.35, initial_capital: 25000.5 },
        ]),
      ],
    });
    renderApp(itemPath(13));
    const table = await screen.findByRole("region", {
      name: "Ownership and capital",
    });
    expect(table.textContent).toContain("40%");
    expect(table.textContent).toContain("₱50,000");
    expect(
      screen.getByText("Total ownership: 75% · Total capital: ₱75,000.50"),
    ).toBeTruthy();
    // A row's cells turn into fields when it is touched (4.5 TableView).
    await user.click(within(table).getByText("35%"));
    const share = await within(table).findByRole("textbox", {
      name: "Initial ownership (%)",
    });
    await user.clear(share);
    await user.type(share, "60");
    await user.tab();
    await waitFor(() =>
      expect(sent(calls, "PUT", `${api}/answers/P.13.1`).at(-1)?.body).toEqual({
        rows: [
          { name: "Ana", initial_ownership: 0.4, initial_capital: 50000 },
          { name: "Paolo", initial_ownership: 0.6, initial_capital: 25000.5 },
        ],
        lockVersion: 3,
      }),
    );
    expect(
      await screen.findByText(
        "Total ownership: 100% · Total capital: ₱75,000.50",
      ),
    ).toBeTruthy();
  });

  test("a cell against its rule says why and is not sent", async () => {
    const user = userEvent.setup();
    const calls = itemApi({
      items: [
        ownership([
          { name: "Ana", initial_ownership: 0.4, initial_capital: 50000 },
        ]),
      ],
    });
    renderApp(itemPath(13));
    const table = await screen.findByRole("region", {
      name: "Ownership and capital",
    });
    await user.click(within(table).getByText("40%"));
    const share = await within(table).findByRole("textbox", {
      name: "Initial ownership (%)",
    });
    await user.clear(share);
    await user.type(share, "140");
    expect(await within(table).findByText(/100/)).toBeTruthy();
    await user.tab();
    // Neither 140 nor the 1 and 14 typed on the way: the cell keeps what it had.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const shares = sent(calls, "PUT", `${api}/answers/P.13.1`).map(
      (call) =>
        (call.body as { rows: { initial_ownership: number | null }[] }).rows[0]
          ?.initial_ownership,
    );
    expect(shares.filter((share) => share !== 0.4)).toEqual([]);
  });

  test("Delete row asks first, then sends the rows without it", async () => {
    const user = userEvent.setup();
    const calls = itemApi({
      items: [
        ownership([
          { name: "Ana", initial_ownership: 0.4, initial_capital: 50000 },
          { name: "Paolo", initial_ownership: 0.35, initial_capital: 25000 },
        ]),
      ],
    });
    renderApp(itemPath(13));
    await user.click(
      await screen.findByRole("button", { name: "More for row 1" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete row" }),
    );
    const question = await screen.findByRole("alertdialog", {
      name: "Delete this row?",
    });
    expect(sent(calls, "PUT", `${api}/answers/P.13.1`)).toHaveLength(0);
    await user.click(within(question).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(sent(calls, "PUT", `${api}/answers/P.13.1`)[0]?.body).toEqual({
        rows: [
          { name: "Paolo", initial_ownership: 0.35, initial_capital: 25000 },
        ],
        lockVersion: 3,
      }),
    );
  });
});

describe("21's execution sub-items (design-spec 6.12・6.13)", () => {
  const lease = milestone("5e0c0000-0000-4000-8000-000000000001", "Lease", {
    goal: "A stall near the plaza",
    dueDate: "2026-09-30",
    overdue: true,
    commentCount: 2,
  });

  test("Nothing yet, then + Add makes one: Add waits for its first column", async () => {
    const user = userEvent.setup();
    const made = milestone(
      "5e0c0000-0000-4000-8000-000000000009",
      "Sign the lease",
      { fromPreset: false },
    );
    const calls = itemApi({ items: [milestones([])], created: made });
    renderApp(itemPath(23));
    const card23 = await screen.findByRole("region", {
      name: "Pre-launch Milestones",
    });
    expect(within(card23).getByText("Nothing yet")).toBeTruthy();
    expect(screen.getByText("0/1")).toBeTruthy();
    await user.click(
      within(card23).getByRole("button", { name: "Add milestone" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New milestone" });
    const add = within(dialog).getByRole("button", { name: "Add" });
    expect(add.hasAttribute("disabled")).toBe(true);
    await user.type(
      within(dialog).getByRole("textbox", { name: /Milestone/ }),
      "Sign the lease",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Goal" }),
      "A stall",
    );
    await user.click(add);
    await waitFor(() =>
      expect(sent(calls, "POST", `${api}/execution-items`)[0]?.body).toEqual({
        type: "milestone",
        title: "Sign the lease",
        goal: "A stall",
        status: "todo",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New milestone" }),
      ).toBeNull(),
    );
    expect(
      within(screen.getByRole("grid", { name: "Milestones" })).getByText(
        "Sign the lease",
      ),
    ).toBeTruthy();
    expect(screen.getByText("1/1")).toBeTruthy();
  });

  test("a row says its state, assignee, date and Overdue; opened, it saves as typed (P10)", async () => {
    const user = userEvent.setup();
    const calls = itemApi({ items: [milestones([lease])] });
    renderApp(itemPath(23));
    const list = await screen.findByRole("grid", { name: "Milestones" });
    const row = within(list).getByRole("row", { name: /Lease/ });
    expect(row.textContent).toContain("To do");
    expect(row.textContent).toContain("Sep 30");
    expect(within(row).getByText("Overdue")).toBeTruthy();
    expect(row.textContent).toContain("2 comments");
    expect(
      screen
        .getByRole("link", { name: "Open in Execution" })
        .getAttribute("href"),
    ).toBe(planPath("/execution?tab=milestones"));
    await user.click(within(row).getByText("Lease"));
    const dialog = await screen.findByRole("dialog", {
      name: "Edit milestone",
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Exit Condition" }),
      "Signed",
    );
    await user.tab();
    await waitFor(() =>
      expect(
        sent(calls, "PATCH", `/api/v1/execution-items/${lease.id}`)[0]?.body,
      ).toEqual({ exitCondition: "Signed", lockVersion: 1 }),
    );
  });

  test("the row's ⋯ holds Comments, History and Delete; Delete asks first", async () => {
    const user = userEvent.setup();
    const calls = itemApi({ items: [milestones([lease])] });
    renderApp(itemPath(23));
    await user.click(
      await screen.findByRole("button", { name: "More for Lease" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Comments (2)" }),
    ).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "History" })).toBeTruthy();
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Delete this milestone?",
    });
    await user.click(within(question).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        sent(calls, "DELETE", `/api/v1/execution-items/${lease.id}`),
      ).toHaveLength(1),
    );
  });

  test("the header's 💬 and 🕘 list the item's sub-items and its milestones (SDD 6.3)", async () => {
    const user = userEvent.setup();
    const calls = itemApi({ items: [milestones([lease])] });
    renderApp(itemPath(23));
    await screen.findByRole("grid", { name: "Milestones" });
    /** Whether `path` reads 21's whole screen: §23 and its milestones. */
    const readsScreen = (path: string, api: string) => {
      if (!path.startsWith(`${api}?`)) return false;
      const query = new URLSearchParams(path.split("?")[1]);
      return (
        query.get("containerType") === "business_plan" &&
        query.get("containerId") === planId &&
        query.getAll("sectionKeys").join(",") === "23,execution:milestone"
      );
    };
    // The header's 💬 counts the screen's threads from the start.
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path }) =>
            method === "GET" && readsScreen(path, "/api/v1/comments"),
        ),
      ).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "History" }));
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path }) =>
            method === "GET" && readsScreen(path, "/api/v1/history"),
        ),
      ).toBe(true),
    );
  });

  test("Next Actions stay in due-date order as one is added", async () => {
    const user = userEvent.setup();
    const action = (id: string, title: string, dueDate: string | null) =>
      milestone(id, title, {
        type: "next_action",
        dueDate,
        fromPreset: false,
      });
    const actions: PlanItem = {
      ...milestones([
        action(
          "5e0c0000-0000-4000-8000-000000000011",
          "Call the bank",
          "2026-11-05",
        ),
        action("5e0c0000-0000-4000-8000-000000000012", "Visit stalls", null),
      ]),
      itemNo: 29,
      title: "Next Actions",
      prompts: [
        prompt("P.29.1", "Next Actions", {
          answerType: "execution_view",
          options: { kind: "execution_view", executionType: "next_action" },
        }),
      ],
    };
    itemApi({
      items: [actions],
      created: action(
        "5e0c0000-0000-4000-8000-000000000013",
        "Book the permit",
        "2026-11-01",
      ),
    });
    renderApp(itemPath(29));
    await user.click(
      await screen.findByRole("button", { name: "Add next action" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "New next action",
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: /Action/ }),
      "Book the permit",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New next action" }),
      ).toBeNull(),
    );
    const titles = within(screen.getByRole("grid", { name: "Next Actions" }))
      .getAllByRole("row")
      .map((row) => row.textContent ?? "");
    expect(titles.map((text) => text.split(/To do/)[0])).toEqual([
      "Book the permit",
      "Call the bank",
      "Visit stalls",
    ]);
  });

  test("a name over 60 characters over a member assignee says why, and the member stays", async () => {
    const user = userEvent.setup();
    const assigned = milestone(
      "5e0c0000-0000-4000-8000-000000000021",
      "Lease",
      {
        assignee: { user: anaRef },
      },
    );
    const calls = itemApi({ items: [milestones([assigned])] });
    renderApp(itemPath(23));
    const list = await screen.findByRole("grid", { name: "Milestones" });
    await user.click(within(list).getByText("Lease"));
    const dialog = await screen.findByRole("dialog", {
      name: "Edit milestone",
    });
    const assignee = within(dialog).getByRole("combobox", { name: "Assignee" });
    await user.clear(assignee);
    await user.type(assignee, "x".repeat(61));
    expect(
      await within(dialog).findByText("Too long. Shorten to 60 characters."),
    ).toBeTruthy();
    // Past the typing pause (6.0.2): no name was left waiting to be saved.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(
      sent(calls, "PATCH", `/api/v1/execution-items/${assigned.id}`).filter(
        (call) =>
          ((call.body as { assigneeName?: string | null }).assigneeName ?? "")
            .length > 0,
      ),
    ).toEqual([]);
  });

  test("a member chosen as the assignee is sent as the member, not as a name", async () => {
    const user = userEvent.setup();
    const calls = itemApi({
      items: [milestones([])],
      created: milestone("5e0c0000-0000-4000-8000-000000000009", "Lease"),
    });
    renderApp(itemPath(23));
    await user.click(
      await screen.findByRole("button", { name: "Add milestone" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New milestone" });
    await user.type(
      within(dialog).getByRole("textbox", { name: /Milestone/ }),
      "Lease",
    );
    await user.click(
      within(dialog).getByRole("combobox", { name: "Assignee" }),
    );
    await user.keyboard("Ana");
    await user.click(
      await screen.findByRole("option", { name: "Ana Villanueva" }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(sent(calls, "POST", `${api}/execution-items`)[0]?.body).toEqual({
        type: "milestone",
        title: "Lease",
        status: "todo",
        assigneeUserId: ana.id,
      }),
    );
  });

  test("an assignee's name over 60 characters says why and is not sent", async () => {
    const user = userEvent.setup();
    const calls = itemApi({
      items: [milestones([])],
      created: milestone("5e0c0000-0000-4000-8000-000000000009", "Lease"),
    });
    renderApp(itemPath(23));
    await user.click(
      await screen.findByRole("button", { name: "Add milestone" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New milestone" });
    await user.type(
      within(dialog).getByRole("textbox", { name: /Milestone/ }),
      "Lease",
    );
    const assignee = within(dialog).getByRole("combobox", { name: "Assignee" });
    await user.type(assignee, "x".repeat(61));
    const add = within(dialog).getByRole("button", { name: "Add" });
    expect(add.hasAttribute("disabled")).toBe(true);
    await user.type(assignee, "{Backspace}");
    await waitFor(() => expect(add.hasAttribute("disabled")).toBe(false));
    await user.click(add);
    await waitFor(() =>
      expect(sent(calls, "POST", `${api}/execution-items`)[0]?.body).toEqual({
        type: "milestone",
        title: "Lease",
        status: "todo",
        assigneeName: "x".repeat(60),
      }),
    );
  });
});

describe("21 read only (design-spec 6.12・6.2)", () => {
  test("a Viewer reads every sub-item open: answers as text, Empty, the Example, the numbers to open", async () => {
    itemApi({
      me: as("viewer"),
      items: [{ ...summary, readOnly: true }],
    });
    renderApp(itemPath(1));
    await screen.findByRole("heading", {
      level: 1,
      name: "1 Executive Summary",
    });
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryByRole("button", { name: "AI" })).toBeNull();
    expect(card("What is the business?").textContent).toContain(
      "Healthy bowls for office workers.",
    );
    expect(card("What is the business?").textContent).toContain(
      "A box of piaya delivered to offices.",
    );
    expect(card("Who is the primary customer?").textContent).toContain("Empty");
    expect(
      within(card("Key numbers"))
        .getByRole("link", { name: "Open in validation" })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${ideaId}/economics`);
    // Comments are open to every role (6.2).
    expect(
      within(card("What is the business?")).getByRole("button", {
        name: /Comments on 01 What is the business\?/,
      }),
    ).toBeTruthy();
  });

  test("a Viewer reads a table and a milestone without a way to change them", async () => {
    const user = userEvent.setup();
    itemApi({
      me: as("viewer"),
      items: [
        {
          ...ownership([
            { name: "Ana", initial_ownership: 0.4, initial_capital: 50000 },
          ]),
          readOnly: true,
        },
        {
          ...milestones([
            milestone("5e0c0000-0000-4000-8000-000000000001", "Lease", {
              goal: "A stall near the plaza",
            }),
          ]),
          readOnly: true,
        },
      ],
    });
    renderApp(itemPath(13));
    const table = await screen.findByRole("region", {
      name: "Ownership and capital",
    });
    expect(table.textContent).toContain("40%");
    expect(within(table).queryByRole("button", { name: /Add row/ })).toBeNull();
    expect(
      within(table).queryByRole("button", { name: /More for row/ }),
    ).toBeNull();

    cleanup();
    renderApp(itemPath(23));
    const list = await screen.findByRole("grid", { name: "Milestones" });
    expect(screen.queryByRole("button", { name: "Add milestone" })).toBeNull();
    await user.click(within(list).getByText("Lease"));
    const dialog = await screen.findByRole("dialog", { name: "Lease" });
    expect(within(dialog).queryAllByRole("textbox")).toEqual([]);
    expect(dialog.textContent).toContain("A stall near the plaza");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "More for Lease" }));
    expect(
      await screen.findByRole("menuitem", { name: "Comments" }),
    ).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
  });

  test("a saved version reads as it was kept, with the way back to the latest", async () => {
    itemApi({
      items: [summary],
      version: [
        {
          ...summary,
          readOnly: true,
          answers: [
            answer("P.01.1", { text: "Bowls as they were." }),
            answer("P.01.2"),
          ],
        },
      ],
    });
    renderApp(itemPath(1, `?version=${versionId}`));
    expect(
      await screen.findByText("Viewing v1 For advisors (read only)"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Show the latest" })
        .getAttribute("href"),
    ).toBe(itemPath(1));
    expect(card("What is the business?").textContent).toContain(
      "Bowls as they were.",
    );
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.getByText("As saved in this version")).toBeTruthy();
    // The item switch opens the other items on the same version.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Switch item" }));
    expect(
      (
        await screen.findByRole("menuitem", { name: /13 Ownership/ })
      ).getAttribute("href"),
    ).toBe(itemPath(13, `?version=${versionId}`));
  });

  test("an archived plan says so, with Restore for an Owner, and its panels say so too", async () => {
    const user = userEvent.setup();
    itemApi({
      items: [{ ...summary, readOnly: true }],
      home: planHome({ archived: true }),
      history: [
        {
          id: "a0000000-0000-4000-8000-000000000021",
          batchId: null,
          target: { type: "plan_answer", id: planId, key: "P.01.1" },
          label: "01 What is the business?",
          action: "update",
          source: "manual",
          before: { text: "Bowls." },
          after: { text: "Healthy bowls for office workers." },
          changedBy: anaRef,
          changedAt: "2026-10-01T02:00:00.000Z",
          revertible: true,
        },
      ],
    });
    renderApp(itemPath(1));
    expect(await screen.findByText("This plan is archived")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    await user.click(screen.getByRole("button", { name: "History" }));
    const panel = await waitFor(
      () =>
        screen.queryByRole("complementary", { name: "History" }) ??
        screen.getByRole("dialog", { name: "History" }),
    );
    expect(
      await within(panel).findByText(
        "This plan is archived. Restore it to make changes.",
      ),
    ).toBeTruthy();
    await waitFor(() => expect(panel.textContent).toContain("office workers"));
    expect(
      within(panel).queryByRole("button", { name: /Revert to this point/ }),
    ).toBeNull();
  });

  test("an archived idea says so, and its plan's item reads only", async () => {
    itemApi({
      items: [{ ...summary, readOnly: true }],
      home: planHome({ ideaArchived: true }),
      ideaArchived: true,
    });
    renderApp(itemPath(1));
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(screen.queryByText("This plan is archived")).toBeNull();
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryByRole("button", { name: "AI" })).toBeNull();
    expect(
      within(card("Key numbers"))
        .getByRole("link", { name: "Open in validation" })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${ideaId}/economics`);
  });
});

describe("21's references (design-spec 6.12「参照（常に最新）」)", () => {
  test("each reference opens with its content and the screen with the whole of it", async () => {
    const user = userEvent.setup();
    itemApi({ items: [market] });
    renderApp(itemPath(6));
    await screen.findByRole("heading", {
      level: 1,
      name: "6 Market & Competition",
    });
    expect(screen.getByText("References")).toBeTruthy();
    expect(screen.getByText("Always the latest")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Competitors" }));
    expect(await screen.findByText("Bowl Stop")).toBeTruthy();
    expect(screen.getByText("Type: Direct Competitor")).toBeTruthy();
    expect(screen.getByText("Typical Price: ₱180")).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "Open in validation" })[0]
        ?.getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${ideaId}/competitors`);
    await user.click(
      screen.getByRole("button", { name: "Validation · 02 Market" }),
    );
    expect(await screen.findByText("OCEAN")).toBeTruthy();
    // A cost row the validation does not have (design-spec 6.0.7).
    await user.click(screen.getByRole("button", { name: "Costs" }));
    const costs = await screen.findByText("Lease Deposit / Advance");
    expect(costs.parentElement?.parentElement?.textContent).toContain(
      "Not in validation",
    );
    expect(screen.getByText("₱18,000")).toBeTruthy();
    // A reference with nothing in it says so.
    await user.click(
      screen.getByRole("button", { name: "Research Log · Permits" }),
    );
    expect(await screen.findByText("Nothing in it yet")).toBeTruthy();
  });
});
