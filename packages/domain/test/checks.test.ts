import { describe, expect, test } from "bun:test";
import {
  type CheckInputs,
  DEFAULT_CHECK_RULES,
  EMPTY_ECONOMICS_INPUTS,
  evaluateChecks,
} from "../src";
import { piayaInputs, piayaRows, row } from "./fixtures";

const base: CheckInputs = {
  workspaceId: "w",
  ideaId: "i",
  competitors: [],
  researchLogs: [],
  costRows: [],
  economics: EMPTY_ECONOMICS_INPUTS,
  rules: DEFAULT_CHECK_RULES,
};

const check = (input: CheckInputs, key: string) => {
  const c = evaluateChecks(input).find((x) => x.key === key);
  if (!c) throw new Error(key);
  return c;
};
const comp = (price: number | null = null) => ({ typicalPrice: price });

describe("all six checks, ordered", () => {
  test("a new idea has everything not started", () => {
    const results = evaluateChecks(base);
    expect(results.map((r) => r.key)).toEqual([
      "competitors",
      "local_price",
      "costs",
      "break_even",
      "permits",
      "demand_signal",
    ]);
    expect(results.every((r) => r.state === "not_started")).toBe(true);
  });

  test("Piaya-like data is done on every check", () => {
    const results = evaluateChecks({
      ...base,
      competitors: [comp(100), comp(120), comp(90), comp()],
      researchLogs: [{ supportsChecks: ["demand_signal"] }],
      costRows: piayaRows,
      economics: piayaInputs,
    });
    expect(results.map((r) => r.state)).toEqual(Array(6).fill("done"));
  });
});

describe("1 competitors", () => {
  test.each([
    [0, "not_started"],
    [1, "partial"],
    [2, "partial"],
    [3, "done"],
    [7, "done"],
  ])("%d competitors is %s", (n, state) => {
    const c = check(
      { ...base, competitors: Array.from({ length: n }, () => comp()) },
      "competitors",
    );
    expect(c.state).toBe(state);
    expect(c.count).toBe(n);
    expect(c.params).toEqual({ min: 3, max: 5 });
    expect(c.link.screen).toBe(15);
  });

  test("the template threshold applies", () => {
    const rules = { ...DEFAULT_CHECK_RULES, competitors: { min: 2, max: 4 } };
    expect(check({ ...base, rules, competitors: [comp(), comp()] }, "competitors").state).toBe(
      "done",
    );
  });
});

describe("2 local price", () => {
  test("two priced competitors, or a tagged log, is done; one priced is partial", () => {
    expect(check({ ...base, competitors: [comp(1), comp(2)] }, "local_price").state).toBe("done");
    expect(
      check({ ...base, researchLogs: [{ supportsChecks: ["local_price"] }] }, "local_price").state,
    ).toBe("done");
    expect(check({ ...base, competitors: [comp(1), comp()] }, "local_price").state).toBe("partial");
    expect(check({ ...base, competitors: [comp()] }, "local_price").state).toBe("not_started");
    expect(
      check({ ...base, researchLogs: [{ supportsChecks: ["permits"] }] }, "local_price").state,
    ).toBe("not_started");
  });
});

describe("3 startup and monthly costs", () => {
  const initial = row("initial", "initial.permits", 10);
  const monthly = row("monthly_fixed", "monthly.rent", 20);

  test("done needs a value in both tables and no empty row; Unknown is fine", () => {
    expect(check({ ...base, costRows: [initial, monthly] }, "costs").state).toBe("done");
    const withUnknown = [initial, monthly, row("initial", "x", null, "unknown")];
    expect(check({ ...base, costRows: withUnknown }, "costs").state).toBe("done");
  });

  test("an empty row keeps it partial and is counted", () => {
    const c = check(
      { ...base, costRows: [initial, monthly, row("monthly_fixed", "y", null, "empty")] },
      "costs",
    );
    expect(c.state).toBe("partial");
    expect(c.detail).toEqual({ emptyRows: 1, missing: [] });
    expect(c.link.screen).toBe(17);
  });

  test("variable rows are ignored", () => {
    const c = check(
      { ...base, costRows: [initial, monthly, row("variable", "v", null, "empty")] },
      "costs",
    );
    expect(c.state).toBe("done");
  });

  test("one table only is partial and names the missing amount", () => {
    const c = check({ ...base, costRows: [initial] }, "costs");
    expect(c.state).toBe("partial");
    expect(c.detail?.missing).toEqual(["monthly_amount"]);
    expect(check({ ...base, costRows: [monthly] }, "costs").detail?.missing).toEqual([
      "initial_amount",
    ]);
  });

  test("no amounts is not started", () => {
    const c = check({ ...base, costRows: [row("initial", "x", null, "empty")] }, "costs");
    expect(c.state).toBe("not_started");
    expect(c.detail?.missing).toEqual(["initial_amount", "monthly_amount"]);
  });
});

describe("4 break-even", () => {
  test("done when it can be computed", () => {
    const c = check({ ...base, costRows: piayaRows, economics: piayaInputs }, "break_even");
    expect(c.state).toBe("done");
    expect(c.link.screen).toBe(18);
  });

  test("price only or monthly costs only is partial and links to the missing input", () => {
    const priceOnly = check(
      { ...base, economics: { ...EMPTY_ECONOMICS_INPUTS, sellingPrice: 100 } },
      "break_even",
    );
    expect(priceOnly.state).toBe("partial");
    expect(priceOnly.detail?.missing).toEqual(["monthly_costs"]);
    expect(priceOnly.link).toMatchObject({ screen: 17, tab: "monthly_fixed" });

    const monthlyOnly = check({ ...base, costRows: [row("monthly_fixed", "m", 50)] }, "break_even");
    expect(monthlyOnly.state).toBe("partial");
    expect(monthlyOnly.detail?.missing).toEqual(["price"]);
    expect(monthlyOnly.link).toMatchObject({ screen: 18, field: "selling_price" });
  });

  test("a margin of zero or less is partial", () => {
    const c = check(
      {
        ...base,
        costRows: [row("variable", "v", 100), row("monthly_fixed", "m", 50)],
        economics: { ...EMPTY_ECONOMICS_INPUTS, sellingPrice: 100 },
      },
      "break_even",
    );
    expect(c.state).toBe("partial");
  });

  test("nothing is not started", () => {
    expect(check(base, "break_even").detail?.missing).toEqual(["price", "monthly_costs"]);
  });
});

describe("5 permits", () => {
  const permits = (amount: number | null, fauState: Parameters<typeof row>[3]) => ({
    ...row("initial", "initial.permits", amount, fauState),
    id: "row-1",
  });

  test.each(["fact", "assumption", "fact_no_evidence"] as const)(
    "a %s amount is done, even 0",
    (state) => {
      const c = check({ ...base, costRows: [permits(0, state)] }, "permits");
      expect(c.state).toBe("done");
      expect(c.link).toMatchObject({ screen: 17, rowId: "row-1" });
    },
  );

  test("unknown, unclassified or empty amounts do not count", () => {
    for (const [amount, state] of [
      [null, "unknown"],
      [5, "unclassified"],
      [null, "empty"],
    ] as const) {
      expect(check({ ...base, costRows: [permits(amount, state)] }, "permits").state).toBe(
        "not_started",
      );
    }
  });

  test("a tagged log counts; a custom row named Permits does not", () => {
    expect(
      check({ ...base, researchLogs: [{ supportsChecks: ["permits"] }] }, "permits"),
    ).toMatchObject({ state: "done", count: 1 });
    const custom = row("initial", "custom.permits", 10, "fact");
    const c = check({ ...base, costRows: [custom] }, "permits");
    expect(c.state).toBe("not_started");
    expect(c.link.rowId).toBeUndefined();
  });
});

describe("6 demand signal", () => {
  test("needs a tagged log", () => {
    const logs = [{ supportsChecks: ["demand_signal" as const, "permits" as const] }];
    expect(check({ ...base, researchLogs: logs }, "demand_signal")).toMatchObject({
      state: "done",
      count: 1,
    });
    expect(check(base, "demand_signal")).toMatchObject({
      state: "not_started",
      link: { screen: 14, tab: "new" },
    });
  });
});
