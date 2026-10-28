import { describe, expect, test } from "vitest";
import { costItem, economicsInputs } from "../test/validation";
import { costRowView, numberView, settleUnknown } from "./worksheet";

// A value with Unknown (SDD 5.7 V14・V16 refuse the two in one save; design-spec 6.0.3).

const unknown = { fau: "unknown", confidence: null } as const;
const none = { fau: null, confidence: null };

describe("settleUnknown", () => {
  test("a value waiting with Unknown was typed after it: the value stands, Unclassified", () => {
    expect(
      settleUnknown({ classification: unknown, amount: 5 }, [
        "amount",
        "percent",
      ]),
    ).toEqual({ classification: none, amount: 5 });
    expect(
      settleUnknown({ classification: unknown, value: 26 }, ["value"]),
    ).toEqual({ classification: none, value: 26 });
  });

  test("Unknown with its value cleared, or a value alone, go as they are", () => {
    const chosen = { classification: unknown, amount: null };
    expect(settleUnknown(chosen, ["amount", "percent"])).toBe(chosen);
    const typed = { amount: 5 };
    expect(settleUnknown(typed, ["amount", "percent"])).toBe(typed);
    // A value refused by its rule was never queued: the Unknown goes alone.
    const left = { classification: unknown };
    expect(settleUnknown(left, ["amount", "percent"])).toBe(left);
  });
});

describe("costRowView", () => {
  const saved = costItem(
    "4c1d2e3f-0000-4000-8000-000000000001",
    "initial",
    "Permits",
    {
      classification: { ...unknown, state: "unknown", evidence: [] },
    },
  );

  test("a saved Unknown row shows Unknown until a value is typed into it", () => {
    expect(costRowView(saved).state).toBe("unknown");
    const typed = costRowView(saved, { amount: 8500 });
    expect(typed.state).toBe("unclassified");
    expect(typed.amount).toBe(8500);
  });

  test("Unknown chosen clears the value it shows", () => {
    const row = costItem(
      "4c1d2e3f-0000-4000-8000-000000000002",
      "initial",
      "Rent",
      {
        amount: 12000,
      },
    );
    const view = costRowView(row, { classification: unknown, amount: null });
    expect(view.state).toBe("unknown");
    expect(view.amount).toBeNull();
  });
});

describe("an Unknown waiting whose cleared value was taken back", () => {
  // A keystroke that broke its rule took back the null sent with the Unknown: the saved
  // value is still not the item's, as the Unknown clears it when it goes.
  test("a cost row shows Unknown, with no amount to count", () => {
    const row = costItem(
      "4c1d2e3f-0000-4000-8000-000000000003",
      "initial",
      "Rent",
      {
        amount: 12000,
      },
    );
    const view = costRowView(row, { classification: unknown });
    expect(view.state).toBe("unknown");
    expect(view.amount).toBeNull();
  });

  test("a number shows Unknown, with no value to calculate with", () => {
    const [price] = economicsInputs({ selling_price: 250 });
    if (price === undefined) throw new Error("No price");
    const view = numberView(price, { classification: unknown });
    expect(view.state).toBe("unknown");
    expect(view.value).toBeNull();
  });
});
