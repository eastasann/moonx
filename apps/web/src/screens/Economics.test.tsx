import type {
  CostItem,
  EconomicsInput,
  Me,
  Role,
  ValidationAnswer,
} from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  answer,
  assumed,
  costItem,
  economicsInputs,
  home,
  question,
  resultOf,
  validationId,
} from "../test/validation";

// 18 Unit Economics & Scenarios (design-spec 6.4), on the numbers of 8.3.

afterEach(() => {
  vi.unstubAllGlobals();
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
  costs = piayaCosts,
  inputs = economicsInputs(piayaNumbers),
  worth = answer("V.08.WORTH"),
}: {
  me?: Me;
  costs?: CostItem[];
  inputs?: EconomicsInput[];
  worth?: ValidationAnswer;
} = {}) {
  const held = [...inputs];
  return stubApi((call: Call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${home.idea.id}/validation`
    ) {
      return Response.json(home);
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

  test("the scenarios sit in the results, a line each", async () => {
    economicsApi();
    renderApp(base);
    await screen.findByRole("grid", { name: "Inputs" });
    const lines = within(scenarios()).getAllByRole("row");
    expect(lines).toHaveLength(5);
    expect(
      screen
        .getByRole("complementary", { name: "Results" })
        .contains(scenarios()),
    ).toBe(true);
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
});
