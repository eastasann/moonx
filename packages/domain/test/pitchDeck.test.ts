import { describe, expect, test } from "bun:test";
import { formatDate, formatMoney, formatUnits } from "@moonx/i18n";
import type { PitchSlide } from "@moonx/schemas";
import { print } from "@moonx/ui-tokens/print";
import {
  buildKeyMetrics,
  buildPitchDeck,
  computeEconomics,
  PITCH_SLIDE_KEYS,
  type PitchDeckExecutionItem,
  type PitchDeckInput,
  slideFitsAtMinimum,
  slideFontSizes,
} from "../src";
import { piayaInputs, piayaRows } from "./fixtures";

const economics = computeEconomics(piayaRows, piayaInputs);
const keyMetrics = buildKeyMetrics(economics, piayaInputs, piayaRows);

const answer = (text: string | null) => ({ text, rows: null });

const fullAnswers: PitchDeckInput["answers"] = {
  "P.01.1": answer("Gift boxes of piaya delivered across Bacolod."),
  "P.01.6": answer("Gift buyers already pay for delivery."),
  "P.03.1": answer("Office workers who send gifts."),
  "P.03.3": answer("They order on chat apps."),
  "P.03.4": answer("A birthday or a holiday."),
  "P.04.1": answer("Gift shopping takes an afternoon."),
  "P.04.2": answer("Monthly"),
  "P.04.3": answer("High"),
  "P.05.1": answer("A box of 12 piaya with a card."),
  "P.05.3": answer("Order in two taps."),
  "P.06.1": answer("Blue"),
  "P.06.2": answer("No one sells gift boxes."),
  "P.06.3": answer("20,000 office workers."),
  "P.06.4": answer("1%"),
  "P.06.5": answer("Bakeries and malls."),
  "P.06.7": answer("Faster delivery."),
  "P.06.8": answer("Bakeries only sell by the piece."),
  "P.08.1": answer("Gift box sales"),
  "P.08.2": answer("Corporate orders"),
  "P.08.11": answer("Quotes confirm the oven price."),
  "P.10.1": answer("Ten years in the bakery trade."),
  "P.10.2": answer("No delivery experience."),
  "P.10.3": answer("Partner with a courier."),
  "P.20.2": answer("Three months of fixed cost."),
  "P.20.10": answer("Four months."),
  "P.20.11": answer("Cash below one month."),
  "P.24.1": answer("Break-even is 8 sales a day or less."),
  "P.24.2": answer("Rent is above the limit."),
  "P.24.3": answer("No one pays for a test box."),
  "P.30.1": answer("One minute talk."),
  "P.30.2": answer("Five minute talk."),
  "P.11.1": {
    text: null,
    rows: [
      { name: "Ana", role: "Operations" },
      { name: "Ben", role: "Sales" },
    ],
  },
  "P.22.1": {
    text: null,
    rows: [
      { risk: "Low risk", probability: "High", impact: "Low", mitigation: "m0" },
      { risk: "Big risk", probability: "Low", impact: "High", mitigation: "m1" },
      { risk: "Mid risk", probability: "High", impact: "Medium", mitigation: "m2" },
      { risk: "Huge risk", probability: "High", impact: "High", mitigation: "m3" },
      { risk: "Other medium", probability: "Medium", impact: "Medium", mitigation: "m4" },
    ],
  },
};

const item = (over: Partial<PitchDeckExecutionItem>): PitchDeckExecutionItem => ({
  type: "next_action",
  title: "Action",
  status: "todo",
  dueDate: null,
  assigneeName: null,
  goal: null,
  exitCondition: null,
  launchTiming: null,
  actions: null,
  completionCriteria: null,
  ...over,
});

const execution: PitchDeckExecutionItem[] = [
  item({ title: "No date", dueDate: null }),
  item({ title: "Late", dueDate: "2026-11-20" }),
  item({ title: "Done soon", dueDate: "2026-10-02", status: "done" }),
  item({ title: "Soon", dueDate: "2026-10-10", assigneeName: "Ana" }),
  item({ title: "Middle", dueDate: "2026-11-01" }),
  item({ type: "milestone", title: "Launch readiness", dueDate: "2026-12-01", goal: "Open" }),
  item({ type: "milestone", title: "Business decision", dueDate: "2026-10-15", goal: "Decide" }),
  item({ type: "launch", title: "Launch day", launchTiming: "launch_day", actions: "Open doors" }),
  item({ type: "launch", title: "7 days", launchTiming: "t_minus_7", actions: "Print flyers" }),
];

const base = (over: Partial<PitchDeckInput> = {}): PitchDeckInput => ({
  variant: "five",
  source: { kind: "latest" },
  generatedAt: "2026-10-02T00:00:00Z",
  header: {
    businessName: "Piaya Gift Box Co.",
    preparedBy: "Ana",
    versionLabel: "Draft",
    date: "2026-10-01",
  },
  currency: "PHP",
  answers: fullAnswers,
  keyMetrics,
  scenarios: economics.scenarios,
  competitors: [
    {
      name: "Mall Bakery",
      type: "Bakery",
      typicalPrice: 300,
      strength: "Foot traffic",
      weakness: null,
    },
  ],
  execution,
  commentCounts: { "five.market": 2 },
  ...over,
});

const slide = (deck: ReturnType<typeof buildPitchDeck>, key: string): PitchSlide => {
  const found = deck.slides.find((s) => s.key === key);
  if (!found) throw new Error(`no slide ${key}`);
  return found;
};

describe("buildPitchDeck structure", () => {
  test("one-minute deck has 8 slides with the specified keys and types", () => {
    const deck = buildPitchDeck(base({ variant: "one" }));
    expect(deck.slides.map((s) => s.key)).toEqual(PITCH_SLIDE_KEYS.one);
    expect(deck.slides.map((s) => s.type)).toEqual([
      "title",
      "text",
      "text",
      "text",
      "text",
      "number",
      "text",
      "text",
    ]);
    expect(deck.speakerNotes).toBe("One minute talk.");
  });

  test("five-minute deck has 12 slides with the specified keys and types", () => {
    const deck = buildPitchDeck(base());
    expect(deck.slides.map((s) => s.key)).toEqual(PITCH_SLIDE_KEYS.five);
    expect(deck.slides.map((s) => s.type)).toEqual([
      "title",
      "text",
      "text",
      "text",
      "text",
      "table",
      "number",
      "table",
      "text",
      "table",
      "table",
      "text",
    ]);
    expect(deck.speakerNotes).toBe("Five minute talk.");
  });

  test("is deterministic", () => {
    expect(buildPitchDeck(base())).toEqual(buildPitchDeck(base()));
  });

  test("edit sources, validation links and comment counts", () => {
    const deck = buildPitchDeck(base());
    const sources = Object.fromEntries(deck.slides.map((s) => [s.key, s.editSource?.itemNo]));
    expect(sources).toEqual({
      title: 1,
      problem: 4,
      customer: 3,
      solution: 5,
      market: 6,
      competition: 6,
      business_model: 8,
      economics: 20,
      why_us: 10,
      execution: 23,
      risks: 22,
      ask: 24,
    });
    expect(slide(deck, "business_model").editInValidation).toBe("economics");
    expect(slide(deck, "economics").editInValidation).toBe("costs");
    expect(slide(deck, "problem").editInValidation).toBeNull();
    expect(slide(deck, "market").commentCount).toBe(2);
    expect(slide(deck, "problem").commentCount).toBe(0);
  });

  test("footer carries the version name or Draft", () => {
    const latest = buildPitchDeck(base());
    expect(latest.footer).toEqual({
      businessName: "Piaya Gift Box Co.",
      versionLabel: "Draft",
      date: "2026-10-01",
    });
    const version = buildPitchDeck(
      base({
        source: {
          kind: "version",
          versionId: "v",
          name: "v1 For advisors",
          savedAt: "2026-09-20T00:00:00Z",
        },
        header: { ...base().header, versionLabel: "v1 For advisors" },
      }),
    );
    expect(version.footer.versionLabel).toBe("v1 For advisors");
    expect(version.source.kind).toBe("version");
    expect(slide(version, "title").bullets?.[0]?.text).toContain("v1 For advisors");
  });

  test("a complete plan has no empty sources and no overflow", () => {
    for (const variant of ["one", "five"] as const) {
      const deck = buildPitchDeck(base({ variant }));
      for (const s of deck.slides) {
        expect(s.emptySources).toEqual([]);
        expect(s.overflow).toBe(false);
        expect(slideFitsAtMinimum(s)).toBe(true);
      }
    }
  });
});

describe("empty sources", () => {
  const empty = buildPitchDeck(
    base({ answers: {}, competitors: [], execution: [], variant: "five" }),
  );

  test("empty text materials become 'Not written yet' bullets and named sources", () => {
    const problem = slide(empty, "problem");
    expect(problem.bullets).toEqual([
      { text: "Not written yet", empty: true },
      { text: "Not written yet", empty: true },
      { text: "Not written yet", empty: true },
    ]);
    expect(problem.emptySources).toEqual(["§4 Primary problem", "§4 Frequency", "§4 Severity"]);
    expect(empty.speakerNotes).toBeNull();
  });

  test("title slide, competition, execution, risks report their materials", () => {
    expect(slide(empty, "title").emptySources).toEqual(["§1 What is the business?"]);
    expect(slide(empty, "competition").emptySources).toContain("Validation competitors");
    expect(slide(empty, "competition").table?.rows).toEqual([]);
    expect(slide(empty, "execution").emptySources).toEqual([
      "§23 Pre-launch milestones",
      "§25 Launch Plan",
    ]);
    expect(slide(empty, "risks").emptySources).toEqual(["§22 Key risks"]);
    expect(slide(empty, "ask").emptySources).toContain("§29 Next Actions");
    for (const s of empty.slides) expect(slideFitsAtMinimum(s)).toBe(true);
  });

  test("a Red market keeps the Blue/Mixed bullet, shown as 'Not written yet' when empty", () => {
    const red = buildPitchDeck(
      base({
        variant: "one",
        answers: { ...fullAnswers, "P.06.1": answer("Red"), "P.06.8": answer(null) },
      }),
    );
    expect(slide(red, "why_now").emptySources).toEqual([
      "§6 If Blue/Mixed, why has nobody captured it?",
    ]);
    expect(slide(red, "why_now").bullets).toHaveLength(2);
    const unknown = buildPitchDeck(
      base({
        variant: "one",
        answers: { ...fullAnswers, "P.06.1": answer(null), "P.06.8": answer(null) },
      }),
    );
    expect(slide(unknown, "why_now").emptySources).toEqual([
      "§6 If Blue/Mixed, why has nobody captured it?",
    ]);
  });
});

describe("bullet counts (design-spec 6.14)", () => {
  const countOf = (deck: ReturnType<typeof buildPitchDeck>, key: string) =>
    slide(deck, key).bullets?.length ?? 0;

  test("text slides have 2 to 4 bullets, also when every material is empty", () => {
    const filled = [buildPitchDeck(base({ variant: "one" })), buildPitchDeck(base())];
    const blank = [
      buildPitchDeck(base({ variant: "one", answers: {}, execution: [] })),
      buildPitchDeck(base({ answers: {}, execution: [] })),
    ];
    const decks = [
      { variant: "one", deck: filled[0] },
      { variant: "five", deck: filled[1] },
      { variant: "one", deck: blank[0] },
      { variant: "five", deck: blank[1] },
    ] as const;
    for (const { variant, deck } of decks) {
      for (const s of deck.slides.filter((x) => x.type === "text")) {
        // Ask has five, and the one-minute Why us has the single Founder advantages bullet.
        if (s.key === "ask") continue;
        if (s.key === "why_us" && variant === "one") continue;
        expect(s.bullets?.length ?? 0).toBeGreaterThanOrEqual(2);
        expect(s.bullets?.length ?? 0).toBeLessThanOrEqual(4);
      }
    }
    expect(countOf(filled[1] as ReturnType<typeof buildPitchDeck>, "ask")).toBe(5);
  });

  test("one-minute Why us shows only §10 Founder advantages", () => {
    const one = buildPitchDeck(base({ variant: "one" }));
    expect(slide(one, "why_us").bullets?.map((b) => b.text)).toEqual([
      "Ten years in the bakery trade.",
    ]);
    const none = slide(buildPitchDeck(base({ variant: "one", answers: {} })), "why_us");
    expect(none.bullets).toHaveLength(1);
    expect(none.emptySources).toEqual(["§10 Founder advantages"]);
  });
});

describe("source materials (design-spec 6.14)", () => {
  test("five-minute business model reads the text sub-items of §8", () => {
    const s = slide(buildPitchDeck(base()), "business_model");
    expect(s.bullets?.map((b) => b.text)).toEqual([
      "Revenue: Gift box sales",
      "Secondary revenue: Corporate orders",
      "Why the startup cost is justified: Quotes confirm the oven price.",
    ]);
    expect(s.editSource?.itemNo).toBe(8);
    const empty = slide(buildPitchDeck(base({ answers: {} })), "business_model");
    expect(empty.emptySources).toEqual([
      "§8 Primary revenue stream",
      "§8 Secondary revenue streams",
      "§8 Why is the startup cost justified?",
    ]);
  });

  test("five-minute Why us reads §10 and the whole §11 table", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ name: `Founder ${i}`, role: `Role ${i}` }));
    const s = slide(
      buildPitchDeck(base({ answers: { ...fullAnswers, "P.11.1": { text: null, rows } } })),
      "why_us",
    );
    expect(s.bullets).toHaveLength(4);
    expect(s.bullets?.slice(0, 3).map((b) => b.text)).toEqual([
      "Ten years in the bakery trade.",
      "Missing capabilities: No delivery experience.",
      "Filling the gaps: Partner with a courier.",
    ]);
    expect(s.bullets?.[3]?.text).toBe(
      "Founders: Founder 0 — Role 0; Founder 1 — Role 1; Founder 2 — Role 2; Founder 3 — Role 3; Founder 4 — Role 4",
    );
    const none = slide(buildPitchDeck(base({ answers: {} })), "why_us");
    expect(none.emptySources).toEqual([
      "§10 Founder advantages",
      "§10 Missing capabilities",
      "§10 How will we fill the gaps?",
      "§11 Founders",
    ]);
  });

  test("economics shows a typed sales volume as entered, not rounded to one decimal", () => {
    const inputs = { ...piayaInputs, unitsConservative: 6.25, unitsCapacity: 12.5 };
    const typed = computeEconomics(piayaRows, inputs);
    const deck = buildPitchDeck(
      base({
        keyMetrics: buildKeyMetrics(typed, inputs, piayaRows),
        scenarios: typed.scenarios,
      }),
    );
    const row = slide(deck, "economics").table?.rows[0];
    expect(row?.[0]).toBe("Units per day");
    expect(row?.[1]).toBe("6.25");
  });

  test("economics reads the text sub-items of §20 under the scenario table", () => {
    const s = slide(buildPitchDeck(base()), "economics");
    expect(s.bullets?.map((b) => b.text.split(":")[0])).toEqual([
      expect.stringContaining("Startup cost"),
      "Opening cash reserve",
      "Runway",
      "Funding trigger",
    ]);
    expect(s.bullets?.[3]?.text).toBe("Funding trigger: Cash below one month.");
    const empty = slide(buildPitchDeck(base({ answers: {} })), "economics");
    expect(empty.emptySources).toEqual([
      "§20 Opening cash reserve",
      "§20 Runway if sales are below plan",
      "§20 Trigger for additional funding",
    ]);
  });
});

describe("truncation and overflow", () => {
  test("a very long English text is cut with an ellipsis and flagged", () => {
    const long = "word ".repeat(2000);
    const deck = buildPitchDeck(base({ answers: { ...fullAnswers, "P.04.1": answer(long) } }));
    const problem = slide(deck, "problem");
    expect(problem.overflow).toBe(true);
    expect(problem.bullets?.[0]?.text.endsWith("…")).toBe(true);
    expect(problem.bullets?.[0]?.text.length).toBeLessThan(long.length);
    expect(slideFitsAtMinimum(problem)).toBe(true);
    expect(slide(deck, "customer").overflow).toBe(false);
  });

  test("Japanese text counts as full-width and is cut earlier than Latin text", () => {
    const ja = "地元の菓子を贈り物にしたい人のために配達する。".repeat(100);
    const latin = "a".repeat(ja.length);
    const jaDeck = buildPitchDeck(base({ answers: { ...fullAnswers, "P.04.1": answer(ja) } }));
    const latinDeck = buildPitchDeck(
      base({ answers: { ...fullAnswers, "P.04.1": answer(latin) } }),
    );
    const jaText = slide(jaDeck, "problem").bullets?.[0]?.text ?? "";
    const latinText = slide(latinDeck, "problem").bullets?.[0]?.text ?? "";
    expect(slide(jaDeck, "problem").overflow).toBe(true);
    expect(jaText.endsWith("…")).toBe(true);
    expect(jaText.length).toBeLessThan(latinText.length);
    expect(slideFitsAtMinimum(slide(jaDeck, "problem"))).toBe(true);
  });

  test("overlong table cells and the business name are cut too", () => {
    const long = "x ".repeat(3000);
    const deck = buildPitchDeck(
      base({
        header: { ...base().header, businessName: long },
        competitors: [{ name: long, type: long, typicalPrice: 10, strength: long, weakness: null }],
        answers: {
          ...fullAnswers,
          "P.22.1": {
            text: null,
            rows: [{ risk: long, probability: "High", impact: "High", mitigation: long }],
          },
        },
      }),
    );
    for (const key of ["title", "competition", "risks"]) {
      const s = slide(deck, key);
      expect(s.overflow).toBe(true);
      expect(slideFitsAtMinimum(s)).toBe(true);
    }
    expect(slide(deck, "competition").table?.rows[0]?.[0]?.endsWith("…")).toBe(true);
    // The footer keeps the full name; only slide text is cut.
    expect(deck.footer.businessName).toBe(long);
  });

  test("everything left untruncated fits at the minimum size in every slide", () => {
    const long = "Lorem ipsum dolor sit amet ".repeat(300);
    const answers = Object.fromEntries(
      Object.keys(fullAnswers).map((k) => [k, answer(long)]),
    ) as PitchDeckInput["answers"];
    answers["P.11.1"] = fullAnswers["P.11.1"] as never;
    answers["P.22.1"] = fullAnswers["P.22.1"] as never;
    const manyItems = Array.from({ length: 20 }, (_, i) =>
      item({
        title: `${long}${i}`,
        dueDate: `2026-10-${String(10 + i).padStart(2, "0")}`,
        type: i % 2 === 0 ? "milestone" : "next_action",
        goal: long,
        assigneeName: long,
      }),
    );
    const launchItems = (
      ["t_minus_30", "t_minus_7", "launch_day", "first_30", "days_31_90", "other"] as const
    ).map((t) => item({ type: "launch", title: t, launchTiming: t, actions: long }));
    for (const variant of ["one", "five"] as const) {
      const deck = buildPitchDeck(
        base({ variant, answers, execution: [...manyItems, ...launchItems] }),
      );
      for (const s of deck.slides) expect(slideFitsAtMinimum(s)).toBe(true);
    }
  });
});

describe("next actions, milestones and risks", () => {
  test("next actions are the closest three open ones, undated last", () => {
    const deck = buildPitchDeck(base({ variant: "one" }));
    const next = slide(deck, "next_step");
    expect(next.bullets?.map((b) => b.text)).toEqual([
      `Soon · due ${formatDate("2026-10-10")} · Ana`,
      `Middle · due ${formatDate("2026-11-01")}`,
      `Late · due ${formatDate("2026-11-20")}`,
      "Proceed if: Break-even is 8 sales a day or less.",
    ]);
  });

  test("undated actions come last and done ones are skipped", () => {
    const deck = buildPitchDeck(
      base({
        variant: "one",
        execution: [
          item({ title: "B", dueDate: null }),
          item({ title: "A", dueDate: "2026-10-05", status: "doing" }),
          item({ title: "Done", dueDate: "2026-10-01", status: "done" }),
        ],
      }),
    );
    const texts = slide(deck, "next_step").bullets?.map((b) => b.text);
    expect(texts?.slice(0, 2)).toEqual([`A · due ${formatDate("2026-10-05")}`, "B"]);
  });

  test("the five-minute Ask skips done next actions too", () => {
    const deck = buildPitchDeck(
      base({
        variant: "five",
        execution: [
          item({ title: "Done", dueDate: "2026-10-01", status: "done" }),
          item({ title: "Open", dueDate: "2026-10-05", status: "doing" }),
        ],
      }),
    );
    const text = (slide(deck, "ask").bullets ?? [])
      .map((b) => `${b.label ?? ""} ${b.text}`)
      .join("\n");
    expect(text).toContain("Open");
    expect(text).not.toContain("Done");
  });

  test("risks: top 3 by impact then probability", () => {
    const risks = slide(buildPitchDeck(base()), "risks");
    expect(risks.table?.rows.map((r) => r[0])).toEqual(["Huge risk", "Big risk", "Mid risk"]);
    expect(risks.table?.columns).toEqual(["Risk", "Probability", "Impact", "Mitigation"]);
  });

  test("execution: milestones by due date, launch grouped by timing", () => {
    const rows = slide(buildPitchDeck(base()), "execution").table?.rows ?? [];
    expect(rows.map((r) => r[0])).toEqual([
      "Business decision",
      "Launch readiness",
      "7 days before launch",
      "Launch day",
    ]);
    expect(rows[0]).toEqual(["Business decision", "Decide", formatDate("2026-10-15"), null]);
    expect(rows[2]?.[1]).toBe("Print flyers");
  });

  test("milestones are limited to six", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      item({ type: "milestone", title: `M${i}`, dueDate: `2026-11-0${9 - i}` }),
    );
    const rows = slide(buildPitchDeck(base({ execution: many })), "execution").table?.rows;
    expect(rows).toHaveLength(6);
    expect(rows?.[0]?.[0]).toBe("M8");
  });
});

describe("numbers and tables", () => {
  test("one-minute business model carries key metrics as they are", () => {
    const s = slide(buildPitchDeck(base({ variant: "one" })), "business_model");
    expect(s.numbers?.map((n) => n.metricKey)).toEqual([
      "selling_price",
      "contribution_margin",
      "break_even_units_day",
    ]);
    for (const n of s.numbers ?? []) expect(n.value).toBe(keyMetrics[n.metricKey]);
  });

  test("five-minute business model has four numbers", () => {
    const s = slide(buildPitchDeck(base()), "business_model");
    expect(s.numbers?.map((n) => n.metricKey)).toEqual([
      "selling_price",
      "variable_cost_per_unit",
      "contribution_margin",
      "contribution_margin_rate",
    ]);
  });

  test("economics slide formats the scenario table from computeEconomics", () => {
    const s = slide(buildPitchDeck(base()), "economics");
    const expected = economics.scenarios.find((c) => c.key === "expected");
    const conservative = economics.scenarios.find((c) => c.key === "conservative");
    expect(s.table?.columns).toEqual(["Per month", "Conservative", "Expected", "Strong"]);
    expect(s.table?.rows[0]?.[2]).toBe(formatUnits(expected?.unitsPerDay.value ?? 0));
    expect(s.table?.rows[1]?.[1]).toBe(
      formatMoney(conservative?.revenue.value ?? 0, "PHP", { bound: conservative?.revenue.bound }),
    );
    expect(s.table?.rows[2]?.[2]).toBe(
      formatMoney(expected?.operatingProfit.value ?? 0, "PHP", {
        bound: expected?.operatingProfit.bound,
      }),
    );
    expect(s.bullets?.[0]?.text).toContain(formatMoney(169500, "PHP"));
  });

  test("missing scenario values show a dash", () => {
    const s = slide(buildPitchDeck(base({ scenarios: [], keyMetrics: {} })), "economics");
    expect(s.table?.rows[0]).toEqual(["Units per day", "—", "—", "—"]);
  });

  test("competition table formats price with the workspace currency", () => {
    const s = slide(buildPitchDeck(base({ currency: "JPY" })), "competition");
    expect(s.table?.rows[0]).toEqual([
      "Mall Bakery",
      "Bakery",
      formatMoney(300, "JPY"),
      "Foot traffic",
    ]);
  });
});

describe("slideFontSizes", () => {
  const types = ["title", "text", "number", "table"] as const;
  const mins = print["font-size"];
  const step = print.slide["shrink-step"];

  const shortSlide = (type: (typeof types)[number]): PitchSlide => ({
    key: "x",
    type,
    title: "Short",
    bullets: [{ text: "One line", empty: false }],
    numbers:
      type === "number"
        ? [
            {
              label: "Price",
              metricKey: "selling_price",
              value: { value: 450, bound: "exact", reason: null },
            },
          ]
        : undefined,
    table: type === "table" ? { columns: ["A", "B"], rows: [["a", "b"]] } : undefined,
    emptySources: [],
    overflow: false,
    editSource: null,
    editInValidation: null,
    commentCount: 0,
  });

  test("short content keeps the default sizes", () => {
    expect(slideFontSizes(shortSlide("title"))).toEqual({ heading: 44, body: 22 });
    expect(slideFontSizes(shortSlide("text"))).toEqual({ heading: 32, body: 22 });
    expect(slideFontSizes(shortSlide("number"))).toMatchObject({
      heading: 32,
      figure: 48,
      figureLabel: 16,
    });
    expect(slideFontSizes(shortSlide("table"))).toMatchObject({ heading: 32, cell: 16 });
  });

  test("long content shrinks by the step and stops at the minimum", () => {
    const text = (n: number): PitchSlide => ({
      ...shortSlide("text"),
      bullets: Array.from({ length: 4 }, () => ({ text: "a".repeat(n), empty: false })),
    });
    let sawShrunk = false;
    for (const n of [100, 200, 300, 400, 600, 5000]) {
      const sizes = slideFontSizes(text(n));
      expect(sizes.body).toBeGreaterThanOrEqual(mins.text["bullet-min"]);
      expect(sizes.heading).toBeGreaterThanOrEqual(mins.text["heading-min"]);
      expect((mins.text.bullet - sizes.body) % step).toBe(0);
      if (sizes.body < mins.text.bullet) sawShrunk = true;
    }
    expect(sawShrunk).toBe(true);
    expect(slideFontSizes(text(5000))).toEqual({
      heading: mins.text["heading-min"],
      body: mins.text["bullet-min"],
    });
  });

  test("a table with many long cells shrinks toward the cell minimum", () => {
    const wide: PitchSlide = {
      ...shortSlide("table"),
      bullets: undefined,
      table: {
        columns: ["A", "B", "C", "D"],
        rows: Array.from({ length: 8 }, () => Array.from({ length: 4 }, () => "word ".repeat(12))),
      },
    };
    const sizes = slideFontSizes(wide);
    expect(sizes.cell).toBeLessThan(mins.table.cell);
    expect(sizes.cell).toBeGreaterThanOrEqual(mins.table["cell-min"]);
  });

  test("a figure too wide for its cell shrinks, never below the minimum", () => {
    const huge: PitchSlide = {
      ...shortSlide("number"),
      numbers: Array.from({ length: 4 }, () => ({
        label: "Revenue",
        metricKey: "expected_revenue",
        value: { value: 1e13, bound: "exact" as const, reason: null },
      })),
    };
    const sizes = slideFontSizes(huge);
    expect(sizes.figure).toBeGreaterThanOrEqual(mins.number["figure-min"]);
    expect(sizes.figureLabel).toBeGreaterThanOrEqual(mins.number["figure-label-min"]);
  });

  test("built decks never get sizes below the minimums", () => {
    const headingMin = (type: PitchSlide["type"]) =>
      type === "title" ? mins.title["title-min"] : mins[type]["heading-min"];
    for (const variant of ["one", "five"] as const) {
      for (const s of buildPitchDeck(base({ variant })).slides) {
        expect(slideFontSizes(s).heading).toBeGreaterThanOrEqual(headingMin(s.type));
      }
    }
  });
});
