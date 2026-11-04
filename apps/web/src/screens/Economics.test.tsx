import type {
  CostItem,
  EconomicsInput,
  Me,
  Role,
  ValidationAnswer,
} from "@moonx/schemas";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api";
import * as sentry from "../lib/sentry";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  answer,
  assumed,
  costItem,
  economicsInputs,
  evidenceOf,
  home,
  prices,
  question,
  resultOf,
  survey,
  validationId,
} from "../test/validation";

// 18 Unit Economics & Scenarios (design-spec 6.4), on the numbers of 8.3.

/** happy-dom's window, whose viewport a test sets. */
const setViewport = (width: number) =>
  act(() =>
    (
      window as unknown as {
        happyDOM: {
          setViewport: (size: { width: number; height: number }) => void;
        };
      }
    ).happyDOM.setViewport({ width, height: 900 }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setViewport(1024);
});

const base = `/w/${workspaceId}/ideas/${home.idea.id}/economics`;
const dataPath = `/api/v1/validations/${validationId}/economics`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

const id = (n: number) => `4c1d2e3f-0000-4000-8000-00000000001${n}`;

/** Piaya Gift Box Delivery's costs, a row per table (design-spec 8.3's totals). */
const piayaCosts: CostItem[] = [
  costItem(id(1), "initial", "Startup", {
    amount: 169500,
    classification: assumed(),
  }),
  costItem(id(2), "monthly_fixed", "Monthly", {
    amount: 41700,
    classification: assumed(),
  }),
  costItem(id(3), "variable", "Per sale", {
    amount: 205,
    classification: assumed(),
  }),
  costItem(id(4), "variable", "Payment / Platform Fee", {
    inputMode: "percent_of_price",
    percent: 0.03,
    classification: assumed(),
    sortOrder: 1,
  }),
];

const piayaNumbers = {
  selling_price: 450,
  operating_days: 26,
  units_conservative: 6,
  units_expected: 10,
  units_strong: 15,
  units_capacity: 25,
};

const worthQuestion = question(
  "V.08.WORTH",
  "Is the return worth the capital and effort?",
  "Is the return worth the capital and effort?",
);

/** The API of 18 over `inputs` and `costs`. */
function economicsApi({
  me = ana,
  archived = false,
  costs = piayaCosts,
  inputs = economicsInputs(piayaNumbers),
  worth = answer("V.08.WORTH"),
  evidence,
  recordLast = () => Response.json(me),
}: {
  me?: Me;
  archived?: boolean;
  costs?: CostItem[];
  inputs?: EconomicsInput[];
  worth?: ValidationAnswer;
  /** V5's answer to a removal of evidence. */
  evidence?: (call: Call) => Response;
  /** U2's answer to the record of the workspace last opened. */
  recordLast?: () => Response;
} = {}) {
  const held = [...inputs];
  return stubApi((call: Call) => {
    const { method, path } = call;
    if (
      method === "GET" &&
      path.startsWith(`/api/v1/validations/${validationId}/research-log`)
    ) {
      return Response.json({ items: [survey, prices], nextCursor: null });
    }
    if (method === "DELETE" && path.startsWith("/api/v1/evidence/")) {
      return evidence?.(call);
    }
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return recordLast();
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${home.idea.id}/validation`
    ) {
      return Response.json({ ...home, idea: { ...home.idea, archived } });
    }
    if (method === "GET" && path === dataPath) {
      return Response.json({
        inputs: held,
        worth,
        worthQuestion,
        result: resultOf(costs, held),
        costItems: costs,
      });
    }
    const field = path.match(new RegExp(`^${dataPath}/(\\w+)$`))?.[1];
    if (method === "PUT" && field !== undefined) {
      const found = held.find(({ fieldKey }) => fieldKey === field);
      if (found === undefined) return undefined;
      const body = call.body as {
        value: number | null;
        classification?: { fau: "unknown" | "assumption" | null };
        lockVersion: number;
      };
      const fau = body.classification?.fau ?? found.classification.fau;
      const next: EconomicsInput = {
        ...found,
        value: body.value,
        classification: {
          ...found.classification,
          fau,
          state: fau ?? (body.value === null ? "empty" : "unclassified"),
        },
        lockVersion: body.lockVersion + 1,
      };
      held.splice(held.indexOf(found), 1, next);
      return Response.json(next);
    }
    const answerPath = path.match(
      new RegExp(`^/api/v1/validations/${validationId}/answers/(.+)$`),
    );
    if (method === "PUT" && answerPath !== null) {
      const { lockVersion, ...fields } = call.body as {
        lockVersion: number;
        text?: string;
      };
      return Response.json(
        answer("V.08.WORTH", { ...fields, lockVersion: lockVersion + 1 }),
      );
    }
    return undefined;
  });
}

const results = () => screen.getByRole("group", { name: "Results" });
const scenarios = () => screen.getByRole("grid", { name: "Scenarios" });
const rowOf = (name: string) =>
  screen.getByRole("row", { name: new RegExp(name) });
/** A result's value and what follows it, by its label. */
const tileOf = (label: string) =>
  [...results().querySelectorAll("dt")].find(
    (term) => term.textContent === label,
  )?.parentElement?.textContent;
/** The panel on a phone: a sheet over the screen (4.5 Panel). */
const phonePanel = (name: "Comments" | "History") =>
  screen.getByRole("dialog", { name });

describe("18 Unit Economics & Scenarios (design-spec 6.4)", () => {
  test("the numbers of 8.3: unit economics, break-even, target margin, scenarios, payback and ROI", async () => {
    economicsApi();
    renderApp(base);
    await screen.findByRole("grid", { name: "Inputs" });
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "06–08 Unit Economics & Scenarios",
      }),
    ).toBeTruthy();
    expect(rowOf("Price").textContent).toContain("₱450");
    // The target margin left empty shows and uses its default.
    expect(rowOf("Target margin").textContent).toContain("15% (default)");
    const shown = results().textContent ?? "";
    expect(shown).toContain("₱218.50");
    expect(shown).toContain("₱231.50");
    expect(shown).toContain("51.4% of the price");
    expect(shown).toContain("6.9");
    expect(shown).toContain("180.1 / month · ₱81,058 / month");
    expect(shown).toContain("9.8");
    expect(shown).toContain("254.3 / month at 15%");
    expect(shown).toContain("₱18,490");
    expect(shown).toContain("9.2 months");
    expect(shown).toContain("130.9%");
    expect(screen.getByText("using default 15%")).toBeTruthy();
    const table = scenarios().textContent ?? "";
    expect(table).toContain("₱117,000");
    expect(table).toContain("₱56,810");
    expect(table).toContain("15.8%");
    // A loss shows as one.
    expect(table).toContain("−₱5,586");
    expect(
      screen.getByText(/Startup ₱169,500 · Monthly ₱41,700/).textContent,
    ).toContain("Variable ₱218.50 / sale");
    expect(
      screen.getByRole("link", { name: /Costs/ }).getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${home.idea.id}/costs`);
  });

  test("a price typed changes the results at once and is saved with its version", async () => {
    const user = userEvent.setup();
    const calls = economicsApi();
    renderApp(base);
    await screen.findByRole("grid", { name: "Inputs" });
    await user.click(within(rowOf("Price")).getByText("₱450"));
    const price = await screen.findByRole("textbox", {
      name: "Value of Price",
    });
    await user.clear(price);
    await user.type(price, "500");
    // VC 205 + 3% × 500 = 220; contribution 280.
    await waitFor(() => expect(results().textContent).toContain("₱280.00"));
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PUT")?.body).toEqual({
        value: 500,
        lockVersion: 1,
      }),
    );
    await user.clear(price);
    await user.type(price, "0");
    expect(screen.getByText("Enter a number greater than 0")).toBeTruthy();
  });

  test("a new number: its first save at version 0; Unknown sends no value", async () => {
    const user = userEvent.setup();
    const calls = economicsApi({
      inputs: economicsInputs({ selling_price: 450 }),
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Daily sales" });
    // An empty scenario is Empty, not 0.
    expect(scenarios().textContent).toContain("Empty");
    expect(results().textContent).toContain("Needs Expected sales");
    await user.click(
      within(
        within(screen.getByRole("grid", { name: "Daily sales" })).getByRole(
          "row",
          { name: /Expected/ },
        ),
      ).getAllByText("Empty")[0] as HTMLElement,
    );
    await user.type(
      await screen.findByRole("textbox", { name: "Value of Expected" }),
      "10",
    );
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PUT")?.body).toEqual({
        value: 10,
        lockVersion: 0,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: /^F\/A\/U of Strong/ }),
    );
    await user.click(await screen.findByRole("radio", { name: /Unknown/ }));
    await waitFor(() =>
      expect(
        calls
          .filter(({ method }) => method === "PUT")
          .map(({ path, body }) => [path.split("/").at(-1), body]),
      ).toContainEqual([
        "units_strong",
        {
          value: null,
          classification: { fau: "unknown", confidence: null },
          lockVersion: 0,
        },
      ]),
    );
  });

  test("warnings over the results: no positive margin, a scenario over capacity, costs incomplete", async () => {
    economicsApi({
      costs: [
        ...piayaCosts.slice(0, 2),
        costItem(id(5), "variable", "Materials", {
          amount: 500,
          classification: assumed(),
        }),
        costItem(id(6), "variable", "Packaging"),
      ],
      inputs: economicsInputs({ ...piayaNumbers, units_strong: 30 }),
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Inputs" });
    const warnings = screen.getByText("Warnings").closest('[role="alert"]');
    expect(warnings).not.toBeNull();
    const text = warnings?.textContent ?? "";
    expect(text).toContain(
      "Contribution margin is zero or negative. Review price or variable costs.",
    );
    expect(text).toContain("Strong exceeds capacity limit");
    expect(text).toContain(
      "Some cost rows are Empty or Unknown, so results may look better than reality.",
    );
  });

  test("the worth question: quiet until pressed; its answer is saved", async () => {
    const user = userEvent.setup();
    const calls = economicsApi();
    renderApp(base);
    await screen.findByRole("grid", { name: "Inputs" });
    const label = "Answer to Is the return worth the capital and effort?";
    expect(screen.queryByRole("textbox", { name: label })).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "Is the return worth the capital and effort?",
      }),
    );
    const answerField = await screen.findByRole("textbox", { name: label });
    await user.type(answerField, "Yes, in a year.");
    await user.tab();
    await waitFor(() =>
      expect(
        calls.find(
          ({ method, path }) => method === "PUT" && path.includes("answers"),
        )?.body,
      ).toEqual({ text: "Yes, in a year.", lockVersion: 0 }),
    );
  });

  test("?q=V.08.WORTH opens the question with its answer to type", async () => {
    economicsApi();
    renderApp(`${base}?q=V.08.WORTH`);
    expect(
      await screen.findByRole("textbox", {
        name: "Answer to Is the return worth the capital and effort?",
      }),
    ).toBeTruthy();
  });

  test("wider than a phone the scenarios are a table under both columns, a column each", async () => {
    economicsApi({
      inputs: economicsInputs({ ...piayaNumbers, units_strong: undefined }),
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Inputs" });
    expect(
      screen
        .getByRole("complementary", { name: "Results" })
        .contains(scenarios()),
    ).toBe(false);
    expect(
      within(scenarios())
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      "Metric",
      "Break-even",
      "Conservative",
      "Expected",
      "Strong",
      "Capacity limit",
    ]);
    const rows = within(scenarios())
      .getAllByRole("row")
      .slice(1)
      .map((row) =>
        [...row.querySelectorAll('[role="rowheader"], [role="gridcell"]')].map(
          (cell) => cell.textContent,
        ),
      );
    expect(rows.map(([name]) => name)).toEqual([
      "Units / day",
      "Units / month",
      "Revenue",
      "Variable costs",
      "Operating profit",
      "Operating margin",
    ]);
    // Break-even makes nothing; Conservative a loss, shown as one; Strong is empty.
    expect(rows[4]).toEqual([
      "Operating profit",
      "₱0",
      "−₱5,586",
      "₱18,490",
      "Empty",
      expect.any(String),
    ]);
  });

  test("on a phone the scenarios stay in the results, a line each; no table under the inputs", async () => {
    const user = userEvent.setup();
    setViewport(390);
    economicsApi({
      inputs: economicsInputs({ ...piayaNumbers, units_strong: undefined }),
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Inputs" });
    expect(screen.queryByRole("grid", { name: "Scenarios" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /^BE / }));
    const drawer = await screen.findByRole("dialog", { name: "Results" });
    const lines = within(
      within(drawer).getByRole("grid", { name: "Scenarios" }),
    ).getAllByRole("row");
    expect(lines.map((line) => line.textContent?.split("Units")[0])).toEqual([
      "Break-even",
      "Conservative",
      "Expected",
      "Strong",
      "Capacity limit",
    ]);
    // An empty scenario is Empty, a loss shows as one.
    expect(lines[3]?.textContent).toContain("Empty");
    expect(lines[1]?.textContent).toContain("−₱5,586");
  });

  test("a Viewer reads every number and the question; nothing to edit", async () => {
    economicsApi({ me: as("viewer") });
    renderApp(base);
    await screen.findByRole("grid", { name: "Inputs" });
    expect(screen.queryByRole("button", { name: /^F\/A\/U of/ })).toBeNull();
    expect(rowOf("Price").textContent).toContain("Assumption · Medium");
    expect(
      screen.queryByRole("textbox", { name: /Answer to Is the return/ }),
    ).toBeNull();
  });

  test("a number's 💬 opens its thread in the comments panel (design-spec 6.0.4)", async () => {
    const user = userEvent.setup();
    economicsApi();
    const router = renderApp(base);
    await user.click(
      await screen.findByRole("button", {
        name: "Comments on Unit Economics · Price",
      }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        panel: "comments",
        target: `economics_input:${validationId}:selling_price`,
      }),
    );
  });

  test("a number's 🕘 opens its changes in the history panel (design-spec 6.0.5)", async () => {
    const user = userEvent.setup();
    economicsApi();
    const router = renderApp(base);
    await user.click(
      await screen.findByRole("button", {
        name: "History of Unit Economics · Price",
      }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        panel: "history",
        target: `economics_input:${validationId}:selling_price`,
      }),
    );
  });
  test("the price as typed (6.4「端数」): ₱149.50 with its cents, a whole price without", async () => {
    economicsApi({
      inputs: economicsInputs({ ...piayaNumbers, selling_price: 149.5 }),
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Inputs" });
    expect(rowOf("Price").textContent).toContain("₱149.50");
    vi.unstubAllGlobals();
    cleanup();
    economicsApi();
    renderApp(base);
    await screen.findByRole("grid", { name: "Inputs" });
    expect(rowOf("Price").textContent).toContain("₱450");
    expect(rowOf("Price").textContent).not.toContain("₱450.00");
  });

  test("removing a Fact number's last evidence asks with its noun: number (6.0.3)", async () => {
    const user = userEvent.setup();
    const link = evidenceOf("7d0f0000-0000-4000-8000-000000000021", survey);
    const calls = economicsApi({
      inputs: economicsInputs(piayaNumbers).map((input) =>
        input.fieldKey === "selling_price"
          ? {
              ...input,
              classification: {
                fau: "fact",
                confidence: null,
                state: "fact",
                evidence: [link],
              },
            }
          : input,
      ),
      evidence: () =>
        Response.json({
          classification: {
            fau: null,
            confidence: null,
            state: "unclassified",
            evidence: [],
          },
          lockVersion: 2,
        }),
    });
    renderApp(
      `${base}?modal=evidence&about=economics_input:${validationId}:selling_price`,
    );
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    await user.click(
      await within(sheet).findByRole("button", { name: /Remove/ }),
    );
    const ask = await screen.findByRole("alertdialog", {
      name: "Remove the last evidence?",
    });
    expect(ask.textContent).toContain("This number will become Unclassified.");
    await user.click(within(ask).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "DELETE")?.path).toBe(
        `/api/v1/evidence/${link.id}?lockVersion=1`,
      ),
    );
  });

  test("?modal=evidence opens nothing for a Viewer, an archived idea, or an about 18 does not hold (6.0.3)", async () => {
    const price = `economics_input:${validationId}:selling_price`;
    const worth = `validation_answer:${validationId}:V.08.WORTH`;
    const cases: [Parameters<typeof economicsApi>[0], string][] = [
      [{ me: as("viewer") }, price],
      [{ me: as("viewer") }, worth],
      [{ archived: true }, price],
      [{ archived: true }, worth],
      // Another validation's number, 17's row, and a question 18 does not ask.
      [
        {},
        "economics_input:0e0e0e0e-0000-4000-8000-000000000000:selling_price",
      ],
      [{}, `cost_item:${id(1)}`],
      [{}, `validation_answer:${validationId}:V.01.WHO`],
    ];
    for (const [api, about] of cases) {
      cleanup();
      vi.unstubAllGlobals();
      economicsApi({
        ...api,
        worth: answer("V.08.WORTH", {
          text: "Yes, in a year.",
          classification: assumed(),
        }),
      });
      renderApp(`${base}?modal=evidence&about=${about}`);
      await screen.findByRole("grid", { name: "Inputs" });
      expect(screen.queryByRole("dialog", { name: "Evidence" })).toBeNull();
    }
  });

  test("on a phone a number's sheet closes before its 💬 or 🕘 opens the panel (6.0.4・6.0.5)", async () => {
    const user = userEvent.setup();
    setViewport(390);
    economicsApi();
    const router = renderApp(base);
    await screen.findByRole("grid", { name: "Inputs" });
    for (const [button, panel] of [
      ["Comments on Unit Economics · Price", "Comments"],
      ["History of Unit Economics · Price", "History"],
    ] as const) {
      await user.click(rowOf("Price"));
      const sheet = await screen.findByRole("dialog", { name: "Edit Price" });
      await user.click(within(sheet).getByRole("button", { name: button }));
      await waitFor(() => expect(phonePanel(panel)).toBeTruthy());
      expect(screen.queryByRole("dialog", { name: "Edit Price" })).toBeNull();
      expect(router.state.location.search).toMatchObject({
        panel: panel.toLowerCase(),
        target: `economics_input:${validationId}:selling_price`,
      });
      await act(() => router.history.back());
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: panel })).toBeNull(),
      );
    }
  });

  test("the results' reasons: Break-even is above capacity, a margin not reachable, Not recovered, using default 30 days", async () => {
    economicsApi({
      inputs: economicsInputs({
        selling_price: 450,
        target_margin: 0.6,
        units_conservative: 4,
        units_expected: 5,
        units_strong: 5,
        units_capacity: 5,
      }),
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Inputs" });
    // At the default 30 days: 41,700 ÷ 231.50 = 180.1 a month, 6 a day, over 5.
    const warnings = screen.getByText("Warnings").closest('[role="alert"]');
    expect(warnings?.textContent).toContain("Break-even is above capacity");
    expect(warnings?.textContent).not.toContain("exceeds capacity limit");
    // 60% of ₱450 is ₱270, more than the ₱231.50 each sale earns.
    expect(tileOf("Units for target margin")).toContain(
      "This margin is not reachable: contribution margin is at or below the target",
    );
    // Expected: 150 a month earn ₱34,725, short of ₱41,700.
    expect(tileOf("Expected profit")).toContain("−₱6,975");
    expect(tileOf("Payback")).toContain(
      "Not recovered: Expected profit is zero or negative",
    );
    expect(screen.getByText("using default 30 days")).toBeTruthy();
    expect(screen.queryByText("using default 15%")).toBeNull();
  });

  test("an archived idea reads only: no field, F/A/U read, the worth question open to read, the notice and Restore", async () => {
    const user = userEvent.setup();
    economicsApi({
      archived: true,
      worth: answer("V.08.WORTH", {
        text: "Yes, in a year.",
        classification: assumed("high"),
        lockVersion: 2,
      }),
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Inputs" });
    expect(screen.getByText("This idea is archived")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    // A number pressed opens no field.
    await user.click(within(rowOf("Price")).getByText("₱450"));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /^F\/A\/U of/ })).toBeNull();
    expect(rowOf("Price").textContent).toContain("Assumption · Medium");
    // The worth question is open without being pressed, its answer and F/A/U to read.
    const card = screen.getByRole("region", {
      name: "Is the return worth the capital and effort?",
    });
    expect(
      within(card).queryByRole("button", {
        name: "Is the return worth the capital and effort?",
      }),
    ).toBeNull();
    expect(within(card).getByText("Yes, in a year.")).toBeTruthy();
    expect(card.textContent).toContain("Assumption · High");
    expect(
      within(card).queryByLabelText(/^Fact, Assumption or Unknown for/),
    ).toBeNull();
    expect(within(card).queryByText("Add evidence")).toBeNull();
  });
});

describe("the record of the workspace last opened (U2, SDD 11章)", () => {
  const unrecorded = { ...ana, lastWorkspaceId: null };

  test("a 4xx it should not get goes to Sentry with its request id, though nothing shows it", async () => {
    const report = vi.spyOn(sentry, "reportError").mockReturnValue(null);
    economicsApi({
      me: unrecorded,
      recordLast: () => apiError(400, "BAD_REQUEST"),
    });
    renderApp(base);
    await waitFor(() =>
      expect(report).toHaveBeenCalledWith(expect.any(ApiError), {
        requestId: "8f14e45f-0000",
      }),
    );
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  test("a membership lost meanwhile (422) is not reported: the next visit records another", async () => {
    const report = vi.spyOn(sentry, "reportError").mockReturnValue(null);
    const calls = economicsApi({
      me: unrecorded,
      recordLast: () => apiError(422, "VALIDATION_FAILED"),
    });
    renderApp(base);
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path }) => method === "PATCH" && path === "/api/v1/me",
        ),
      ).toBe(true),
    );
    await screen.findByRole("grid", { name: "Inputs" });
    expect(report).not.toHaveBeenCalled();
  });
});
