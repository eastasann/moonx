import { describe, expect, test } from "bun:test";
import type { MetricValue, ScenarioColumn } from "@moonx/schemas";
import { print } from "@moonx/ui-tokens/print";
import template from "../../../data/templates/bcdx/plan.json";
import {
  buildPitchDeck,
  formatMetric,
  type PitchDeckInput,
  type PitchExecutionItem,
  type PitchSection,
  pitchSlideKeys,
} from "./pitch";
import {
  breakLongWords,
  breakSlideWords,
  figureColumns,
  fitPitchDeck,
  fitPitchSlide,
  type MeasureText,
  pitchFrame,
  pitchSizes,
} from "./pitch-fit";
import type { PlanAnswerContent } from "./plan";

// buildPitchDeck() on the BCDX plan template (data/templates/bcdx), and the fit on a font
// whose glyphs are half the size wide (monospaced: 0.6).

const SECTIONS: PitchSection[] = template.sections.map((section) => ({
  key: section.key,
  questions: section.questions.map((question) => ({
    key: question.key,
    title: question.title,
    answerType:
      question.answerType as PitchSection["questions"][number]["answerType"],
  })),
}));

const exact = (value: number): MetricValue => ({
  value,
  bound: "exact",
  reason: null,
});
const empty: MetricValue = { value: null, bound: "exact", reason: "empty" };

const scenario = (
  key: ScenarioColumn["key"],
  units: number,
  revenue: number,
  profit: number,
): ScenarioColumn => ({
  key,
  unitsPerDay: exact(units),
  unitsPerMonth: exact(units * 26),
  revenue: exact(revenue),
  variableCostTotal: exact(0),
  operatingProfit: exact(profit),
  operatingMargin: exact(profit / revenue),
  exceedsCapacity: false,
});

const item = (
  overrides: Partial<PitchExecutionItem> & Pick<PitchExecutionItem, "type">,
): PitchExecutionItem => ({
  title: "Item",
  status: null,
  dueDate: null,
  goal: null,
  launchTiming: null,
  actions: null,
  assignee: null,
  sortOrder: 0,
  ...overrides,
});

/** Every text sub-item answered with its key, so a bullet shows where it came from. */
const allAnswered = () =>
  new Map<string, PlanAnswerContent>(
    SECTIONS.flatMap((section) =>
      section.questions
        .filter((question) =>
          ["long_text", "short_text", "choice"].includes(question.answerType),
        )
        .map((question) => [question.key, { text: question.key, rows: null }]),
    ),
  );

const input = (overrides: Partial<PitchDeckInput> = {}): PitchDeckInput => ({
  variant: "five",
  source: { kind: "latest" },
  header: {
    businessName: "Piaya Gift Box Co.",
    preparedBy: "Ana Santos",
  },
  date: "2026-10-01",
  generatedAt: new Date("2026-10-15T03:00:00.000Z"),
  timeZone: "Asia/Manila",
  currency: "PHP",
  sections: SECTIONS,
  answers: allAnswered(),
  keyMetrics: {
    selling_price: exact(450),
    variable_cost_per_unit: exact(218.75),
    contribution_margin: exact(231.25),
    contribution_margin_rate: exact(0.5139),
    break_even_units_day: exact(6.94),
    initial_cost_total: { value: 169500, bound: "lower", reason: null },
    payback_months: exact(9.17),
    simple_roi: exact(1.309),
  },
  scenarios: [
    scenario("break_even", 6.94, 81000, 0),
    scenario("conservative", 5, 58500, -5586),
    scenario("expected", 10, 117000, 18490),
    scenario("strong", 15, 175500, 42565),
    scenario("capacity", 25, 292500, 90715),
  ],
  execution: [],
  competitors: [],
  canEdit: true,
  commentCount: () => 0,
  ...overrides,
});

const slideOf = (deck: ReturnType<typeof buildPitchDeck>, key: string) => {
  const slide = deck.slides.find((candidate) => candidate.key === key);
  if (slide === undefined) throw new Error(`No slide ${key}`);
  return slide;
};

describe("buildPitchDeck: the slides", () => {
  test("eight slides for one minute and twelve for five, in the order of 6.14", () => {
    const one = buildPitchDeck(input({ variant: "one" }));
    expect(one.slides.map((slide) => [slide.key, slide.type])).toEqual([
      ["title", "title"],
      ["problem", "text"],
      ["customer", "text"],
      ["solution", "text"],
      ["why_now", "text"],
      ["business_model", "number"],
      ["why_us", "text"],
      ["next_step", "text"],
    ]);
    const five = buildPitchDeck(input());
    expect(five.slides.map((slide) => [slide.key, slide.type])).toEqual([
      ["title", "title"],
      ["problem", "text"],
      ["customer", "text"],
      ["solution", "text"],
      ["market", "text"],
      ["competition", "table"],
      ["business_model", "number"],
      ["economics", "table"],
      ["why_us", "text"],
      ["execution", "table"],
      ["risks", "table"],
      ["ask", "text"],
    ]);
  });

  test("a text slide has one bullet per source, labelled with the sub-item", () => {
    const five = buildPitchDeck(input());
    expect(slideOf(five, "problem").bullets).toEqual(
      ["P.04.1", "P.04.2", "P.04.3", "P.04.4", "P.04.5"].map((key, index) => ({
        label: [
          "Primary problem",
          "Frequency",
          "Severity",
          "Current alternatives",
          "Why are alternatives insufficient?",
        ][index] as string,
        text: key,
        empty: false,
      })),
    );
    expect(slideOf(five, "customer").bullets.map((b) => b.text)).toEqual([
      "P.03.1",
      "P.03.2",
      "P.03.3",
      "P.03.4",
      "P.03.5",
    ]);
    expect(slideOf(five, "solution").bullets.map((b) => b.text)).toEqual([
      "P.05.1",
      "P.05.2",
      "P.05.3",
      "P.05.4",
      "P.05.5",
    ]);
    expect(slideOf(five, "market").bullets.map((b) => b.text)).toEqual([
      "P.06.1",
      "P.06.2",
      "P.06.3",
      "P.06.4",
    ]);
    const one = buildPitchDeck(input({ variant: "one" }));
    expect(slideOf(one, "problem").bullets.map((b) => b.text)).toEqual([
      "P.04.1",
      "P.04.2",
      "P.04.3",
    ]);
    expect(slideOf(one, "customer").bullets.map((b) => b.text)).toEqual([
      "P.03.1",
      "P.03.3",
      "P.03.4",
    ]);
    expect(slideOf(one, "solution").bullets.map((b) => b.text)).toEqual([
      "P.05.1",
      "P.05.3",
    ]);
    expect(slideOf(one, "why_now").bullets.map((b) => b.text)).toEqual([
      "P.01.6",
      "P.06.8",
    ]);
  });

  test("the counts of 6.14's examples: Ask 5, Why us 4, and 1 and 2 in the one-minute deck", () => {
    const five = buildPitchDeck(input());
    expect(slideOf(five, "ask").bullets.map((b) => b.label)).toEqual([
      "We proceed to launch if",
      "We delay if",
      "We stop / abandon if",
      "Next Actions",
      "Trigger for additional funding",
    ]);
    expect(slideOf(five, "why_us").bullets.map((b) => b.label)).toEqual([
      "Founder advantages",
      "Missing capabilities",
      "How will we fill the gaps?",
      "Founders",
    ]);
    const one = buildPitchDeck(input({ variant: "one" }));
    expect(slideOf(one, "why_us").bullets.map((b) => b.label)).toEqual([
      "Founder advantages",
    ]);
    expect(slideOf(one, "next_step").bullets.map((b) => b.label)).toEqual([
      "Next Actions",
      "We proceed to launch if",
    ]);
  });

  test("a blank source keeps its bullet as Not written yet and is named", () => {
    const answers = allAnswered();
    answers.set("P.04.2", { text: "  ", rows: null });
    answers.delete("P.04.3");
    const problem = slideOf(buildPitchDeck(input({ answers })), "problem");
    expect(problem.bullets).toHaveLength(5);
    expect(problem.bullets[1]).toEqual({
      label: "Frequency",
      text: "Not written yet",
      empty: true,
    });
    expect(problem.bullets[2]?.empty).toBe(true);
    expect(problem.emptySources).toEqual(["Frequency", "Severity"]);
  });

  test("a source the plan's template does not have is empty under its ID", () => {
    const sections = SECTIONS.map((section) => ({
      ...section,
      questions: section.questions.filter((q) => q.key !== "P.04.2"),
    }));
    const problem = slideOf(buildPitchDeck(input({ sections })), "problem");
    expect(problem.bullets[1]).toEqual({
      label: "P.04.2",
      text: "Not written yet",
      empty: true,
    });
    expect(problem.emptySources).toEqual(["P.04.2"]);
  });

  test("the title slide: Business Name, §1, Prepared by, the date and the version", () => {
    const title = slideOf(buildPitchDeck(input()), "title");
    expect(title.title).toEqual({ text: "Piaya Gift Box Co.", empty: false });
    expect(title.subtitle).toEqual({ text: "P.01.1", empty: false });
    expect(title.bullets).toEqual([
      { label: "Prepared by", text: "Ana Santos", empty: false },
      { label: "Date", text: "Oct 1", empty: false },
      { label: "Version", text: "Draft", empty: false },
    ]);
    const version = buildPitchDeck(
      input({
        source: {
          kind: "version",
          versionId: crypto.randomUUID(),
          name: "v1 For advisors",
          savedAt: "2025-09-20T02:00:00.000Z",
        },
        date: "2025-09-20",
        header: { businessName: " ", preparedBy: "" },
        answers: new Map(),
      }),
    );
    const blank = slideOf(version, "title");
    expect(blank.title).toEqual({ text: "Not written yet", empty: true });
    expect(blank.subtitle?.empty).toBe(true);
    expect(blank.bullets.map((b) => b.text)).toEqual([
      "Not written yet",
      "Sep 20, 2025",
      "v1 For advisors",
    ]);
    expect(blank.emptySources).toEqual([
      "Business Name",
      "What is the business?",
      "Prepared by",
    ]);
    expect(version.footer).toEqual({
      businessName: " ",
      versionLabel: "v1 For advisors",
      date: "2025-09-20",
    });
  });

  test("§29 Next Actions: open ones, soonest first and undated last, at most three in one bullet", () => {
    const execution = [
      item({ type: "next_action", title: "Undated", sortOrder: 0 }),
      item({ type: "next_action", title: "Later", dueDate: "2026-10-27" }),
      item({
        type: "next_action",
        title: "Done",
        dueDate: "2026-10-01",
        status: "done",
      }),
      item({ type: "next_action", title: "Overdue", dueDate: "2026-10-13" }),
      item({ type: "next_action", title: "Soon", dueDate: "2026-10-17" }),
      item({
        type: "milestone",
        title: "Not an action",
        dueDate: "2026-10-02",
      }),
    ];
    const bullet = slideOf(
      buildPitchDeck(input({ variant: "one", execution })),
      "next_step",
    ).bullets[0];
    expect(bullet).toEqual({
      label: "Next Actions",
      // Generated on Oct 15 in Manila: the 13th is two days past (design-spec 1.2).
      text: "Overdue (Oct 13, overdue 2d); Soon (Oct 17); Later (Oct 27)",
      empty: false,
    });
    const undated = slideOf(
      buildPitchDeck(
        input({
          execution: [
            item({ type: "next_action", title: "B", sortOrder: 1 }),
            item({ type: "next_action", title: "A", dueDate: "2026-11-01" }),
          ],
        }),
      ),
      "ask",
    ).bullets[3];
    expect(undated?.text).toBe("A (Nov 1); B");
    const none = slideOf(buildPitchDeck(input()), "ask");
    expect(none.bullets[3]).toEqual({
      label: "Next Actions",
      text: "Not written yet",
      empty: true,
    });
    expect(none.emptySources).toContain("Next Actions");
  });

  test("§11 founders as Name (Role) in one bullet", () => {
    const answers = allAnswered();
    answers.set("P.11.1", {
      text: null,
      rows: [
        { name: "Ana Santos", role: "Founder & baker" },
        { name: "Paolo Cruz", role: null },
        { name: "", role: "" },
        { name: null, role: "Advisor" },
      ],
    });
    const whyUs = slideOf(buildPitchDeck(input({ answers })), "why_us");
    expect(whyUs.bullets[3]).toEqual({
      label: "Founders",
      text: "Ana Santos (Founder & baker); Paolo Cruz; Advisor",
      empty: false,
    });
  });

  test("the business model's figures and notes", () => {
    const one = slideOf(
      buildPitchDeck(input({ variant: "one" })),
      "business_model",
    );
    expect(one.numbers).toEqual([
      { label: "Price", metricKey: "selling_price", value: exact(450) },
      {
        label: "Contribution / sale",
        metricKey: "contribution_margin",
        value: exact(231.25),
      },
      {
        label: "Break-even / day",
        metricKey: "break_even_units_day",
        value: exact(6.94),
      },
    ]);
    expect(one.bullets.map((b) => b.label)).toEqual(["Primary revenue stream"]);
    expect(one.editInValidation).toBe("economics");
    const five = slideOf(buildPitchDeck(input()), "business_model");
    expect(five.numbers.map((n) => n.metricKey)).toEqual([
      "selling_price",
      "variable_cost_per_unit",
      "contribution_margin",
      "contribution_margin_rate",
    ]);
    // §8's text sub-items, not its numbers.
    expect(five.bullets.map((b) => b.text)).toEqual([
      "P.08.1",
      "P.08.2",
      "P.08.11",
    ]);
  });

  test("a metric the validation cannot give stays in place with its reason", () => {
    const slide = slideOf(
      buildPitchDeck(
        input({
          variant: "one",
          keyMetrics: {
            selling_price: empty,
            contribution_margin: empty,
            break_even_units_day: empty,
          },
        }),
      ),
      "business_model",
    );
    expect(slide.numbers.map((n) => n.value)).toEqual([empty, empty, empty]);
    expect(slide.emptySources).toEqual([]);
  });

  test("Competition: the validation's top competitors in 15's order", () => {
    const slide = slideOf(
      buildPitchDeck(
        input({
          competitors: [
            {
              name: "Bongbong's",
              type: "direct",
              typicalPrice: 380,
              strength: "Known brand",
            },
            { name: "Cookies", type: null, typicalPrice: null, strength: null },
          ],
        }),
      ),
      "competition",
    );
    expect(slide.table).toEqual({
      columns: [
        { label: "Name", numeric: false, width: 0.25 },
        { label: "Type", numeric: false, width: 0.18 },
        { label: "Price", numeric: true, width: 0.15 },
        { label: "Strength", numeric: false, width: 0.42 },
      ],
      rows: [
        ["Bongbong's", "Direct Competitor", "₱380", "Known brand"],
        ["Cookies", null, null, null],
      ],
    });
    expect(slide.bullets.map((b) => b.label)).toEqual([
      "Key competitors / substitutes",
      "What must we do differently or better?",
    ]);
    expect(slide.editInValidation).toBeNull();
    const none = slideOf(buildPitchDeck(input()), "competition");
    expect(none.table?.rows).toEqual([]);
    expect(none.emptySources).toEqual(["Competitors"]);
  });

  test("Economics: the scenario table, the startup figures and §20's text sub-items", () => {
    const slide = slideOf(buildPitchDeck(input()), "economics");
    expect(slide.table?.rows).toEqual([
      ["Conservative", "5", "₱58,500", "−₱5,586"],
      ["Expected", "10", "₱117,000", "₱18,490"],
      ["Strong", "15", "₱175,500", "₱42,565"],
    ]);
    expect(slide.table?.columns.map((c) => [c.label, c.numeric])).toEqual([
      ["Scenario", false],
      ["Units / day", true],
      ["Revenue / month", true],
      ["Operating profit / month", true],
    ]);
    expect(slide.numbers.map((n) => [n.label, n.metricKey])).toEqual([
      ["Startup cost", "initial_cost_total"],
      ["Break-even / day", "break_even_units_day"],
      ["Payback", "payback_months"],
      ["ROI", "simple_roi"],
    ]);
    expect(slide.bullets.map((b) => b.label)).toEqual([
      "Opening cash reserve",
      "Runway if sales are below plan",
      "Trigger for additional funding",
    ]);
    expect(slide.editInValidation).toBe("costs");
  });

  test("Execution plan: milestones by deadline, at most six, and the launch by timing", () => {
    const milestones = Array.from({ length: 8 }, (_, index) =>
      item({
        type: "milestone",
        title: `M${index}`,
        goal: `Goal ${index}`,
        assignee: index === 0 ? "Ana Santos" : null,
        dueDate:
          index === 1 ? null : `2026-11-${String(20 - index).padStart(2, "0")}`,
        status: index === 0 ? "done" : "todo",
        sortOrder: index,
      }),
    );
    const launch = [
      item({
        type: "launch",
        title: "Launch day",
        launchTiming: "launch_day",
        actions: "Deliver",
        sortOrder: 2,
      }),
      item({
        type: "launch",
        title: "Renamed T-30",
        launchTiming: "t_minus_30",
        actions: "Sign the lease",
        sortOrder: 0,
      }),
      item({
        type: "launch",
        title: "Also T-30",
        launchTiming: "t_minus_30",
        actions: "Order the oven",
        sortOrder: 1,
      }),
      item({
        type: "launch",
        title: "Nothing to do",
        launchTiming: "first_30",
        sortOrder: 3,
      }),
      item({
        type: "launch",
        title: "Loose",
        launchTiming: null,
        actions: "Print flyers",
        sortOrder: 4,
      }),
    ];
    const slide = slideOf(
      buildPitchDeck(input({ execution: [...milestones, ...launch] })),
      "execution",
    );
    expect(slide.table?.rows.map((row) => row[0])).toEqual([
      "M7",
      "M6",
      "M5",
      "M4",
      "M3",
      "M2",
    ]);
    expect(slide.table?.rows[0]).toEqual([
      "M7",
      "Goal 7",
      null,
      "Nov 13",
      "To do",
    ]);
    const late = slideOf(
      buildPitchDeck(
        input({
          execution: [
            item({
              type: "milestone",
              title: "Late",
              dueDate: "2026-10-10",
              status: "doing",
            }),
            item({
              type: "milestone",
              title: "Done late",
              dueDate: "2026-10-11",
              status: "done",
            }),
          ],
        }),
      ),
      "execution",
    );
    expect(late.table?.rows.map((row) => row[3])).toEqual([
      "Oct 10, overdue 5d",
      "Oct 11",
    ]);
    expect(slide.bullets).toEqual([
      { label: "T−30", text: "Sign the lease; Order the oven", empty: false },
      { label: "Launch day", text: "Deliver", empty: false },
      { label: "Other", text: "Print flyers", empty: false },
    ]);
    const none = slideOf(buildPitchDeck(input()), "execution");
    expect(none.table?.rows).toEqual([]);
    expect(none.bullets).toEqual([
      { label: "Launch Plan", text: "Not written yet", empty: true },
    ]);
    expect(none.emptySources).toEqual(["Launch Plan", "Pre-launch Milestones"]);
  });

  test("Risks: §22's top three by impact, then probability, keeping the table's order on ties", () => {
    const answers = allAnswered();
    answers.set("P.22.1", {
      text: null,
      rows: [
        {
          risk: "A",
          probability: "Low",
          impact: "Medium",
          mitigation: "a",
          trigger_indicator: "x",
        },
        { risk: "B", probability: "High", impact: "Medium", mitigation: "b" },
        { risk: "C", probability: "Medium", impact: "High", mitigation: "c" },
        { risk: "D", probability: "unclear", impact: null, mitigation: null },
        { risk: "E", probability: "Low", impact: "Medium", mitigation: "e" },
      ],
    });
    const slide = slideOf(buildPitchDeck(input({ answers })), "risks");
    expect(slide.table?.rows).toEqual([
      ["C", "Medium", "High", "c"],
      ["B", "High", "Medium", "b"],
      ["A", "Low", "Medium", "a"],
    ]);
    expect(slide.bullets).toEqual([]);
    const none = slideOf(buildPitchDeck(input()), "risks");
    expect(none.emptySources).toEqual(["Key Risks"]);
  });

  test("Edit source and Edit in validation only while the plan can be edited", () => {
    const editable = buildPitchDeck(input());
    expect(
      editable.slides.map((slide) => [
        slide.key,
        slide.editSource?.itemNo,
        slide.editInValidation,
      ]),
    ).toEqual([
      ["title", 1, null],
      ["problem", 4, null],
      ["customer", 3, null],
      ["solution", 5, null],
      ["market", 6, null],
      ["competition", 6, null],
      ["business_model", 8, "economics"],
      ["economics", 20, "costs"],
      ["why_us", 10, null],
      ["execution", 23, null],
      ["risks", 22, null],
      ["ask", 24, null],
    ]);
    expect(
      slideOf(buildPitchDeck(input({ variant: "one" })), "why_now").editSource,
    ).toEqual({ itemNo: 1 });
    expect(
      slideOf(buildPitchDeck(input({ variant: "one" })), "next_step")
        .editSource,
    ).toEqual({ itemNo: 29 });
    const readOnly = buildPitchDeck(input({ canEdit: false }));
    for (const slide of readOnly.slides) {
      expect(slide.editSource).toBeNull();
      expect(slide.editInValidation).toBeNull();
    }
  });

  test("comments count per slide of the variant, and §30 is the speaker notes", () => {
    const seen: string[] = [];
    const deck = buildPitchDeck(
      input({
        variant: "one",
        commentCount: (target) => {
          seen.push(target);
          return target === "one.problem" ? 2 : 0;
        },
      }),
    );
    expect(seen).toContain("one.why_now");
    expect(slideOf(deck, "problem").commentCount).toBe(2);
    expect(deck.speakerNotes).toBe("P.30.1");
    expect(buildPitchDeck(input()).speakerNotes).toBe("P.30.2");
    expect(
      buildPitchDeck(input({ answers: new Map() })).speakerNotes,
    ).toBeNull();
  });

  test("the deck's source, footer and generation time", () => {
    const deck = buildPitchDeck(input());
    expect(deck.source).toEqual({ kind: "latest" });
    expect(deck.businessName).toBe("Piaya Gift Box Co.");
    expect(deck.generatedAt).toBe("2026-10-15T03:00:00.000Z");
    expect(deck.footer).toEqual({
      businessName: "Piaya Gift Box Co.",
      versionLabel: "Draft",
      date: "2026-10-01",
    });
    expect(
      deck.slides.every((slide) => !slide.overflow && slide.shrink === 0),
    ).toBe(true);
  });
});

describe("pitchSlideKeys", () => {
  test("names the slides of each deck in order, as their comments' keys use them", () => {
    for (const variant of ["one", "five"] as const) {
      expect(pitchSlideKeys(variant)).toEqual(
        buildPitchDeck(input({ variant })).slides.map((slide) => slide.key),
      );
    }
    expect(pitchSlideKeys("one")).toHaveLength(8);
    expect(pitchSlideKeys("five")).toHaveLength(12);
  });
});

describe("formatMetric", () => {
  test("each metric in its format, with its bound", () => {
    expect(formatMetric("selling_price", exact(450), "PHP")).toBe("₱450");
    expect(formatMetric("contribution_margin", exact(231.25), "PHP")).toBe(
      "₱231.25",
    );
    expect(formatMetric("contribution_margin_rate", exact(0.5139), "PHP")).toBe(
      "51.4%",
    );
    expect(formatMetric("break_even_units_day", exact(6.94), "PHP")).toBe(
      "6.9",
    );
    expect(formatMetric("payback_months", exact(9.17), "PHP")).toBe(
      "9.2 months",
    );
    expect(
      formatMetric(
        "initial_cost_total",
        { value: 169500, bound: "lower", reason: null },
        "PHP",
      ),
    ).toBe("₱169,500+");
    expect(
      formatMetric(
        "simple_roi",
        { value: -0.24, bound: "approximate", reason: null },
        "PHP",
      ),
    ).toBe("≈ −24.0%");
    expect(formatMetric("capacity_units_day", exact(6.25), "PHP")).toBe("6.25");
    expect(formatMetric("cost_row:monthly.rent", exact(8000), "USD")).toBe(
      "$8,000",
    );
  });

  test("why a metric has no value, and a dash when there is no reason", () => {
    expect(
      formatMetric(
        "contribution_margin",
        { value: null, bound: "exact", reason: "needs_price" },
        "PHP",
      ),
    ).toBe("Needs price");
    expect(formatMetric("selling_price", empty, "PHP")).toBe("Empty");
    expect(
      formatMetric(
        "payback_months",
        { value: null, bound: "exact", reason: "not_recovered" },
        "PHP",
      ),
    ).toBe("Not recovered: Expected profit is zero or negative");
    expect(
      formatMetric(
        "simple_roi",
        { value: null, bound: "exact", reason: null },
        "PHP",
      ),
    ).toBe("-");
  });

  test("throws on a key that is not a single-value key metric", () => {
    expect(() => formatMetric("scenario:expected", exact(1), "PHP")).toThrow();
  });
});

/** Half the size per glyph, 0.6 for the monospaced font, as with IBM Plex Mono. */
const measure: MeasureText = (text, font) =>
  [...text].length * font.size * (font.family === "mono" ? 0.6 : 0.5);
const fit = { print, measure, currency: "PHP" };

describe("fitPitchDeck", () => {
  test("the sizes of each type shrink by the step and stop at their minimum", () => {
    expect(pitchSizes("text", 0, print)).toMatchObject({
      heading: 32,
      bullet: 22,
    });
    expect(pitchSizes("text", 1, print)).toMatchObject({
      heading: 30,
      bullet: 20,
    });
    expect(pitchSizes("text", 9, print)).toMatchObject({
      heading: 26,
      bullet: 18,
    });
    expect(pitchSizes("title", 9, print)).toMatchObject({
      heading: 32,
      subtitle: 18,
    });
    // Notes under figures are the size of a table's cells.
    expect(pitchSizes("number", 9, print)).toMatchObject({
      figure: 36,
      figureLabel: 14,
      bullet: 12,
    });
    expect(pitchSizes("table", 9, print)).toMatchObject({
      cell: 12,
      bullet: 12,
    });
    expect(pitchFrame(print)).toEqual({ contentWidth: 864, bodyHeight: 412 });
  });

  test("short sources fit as they are, the economics slide a little smaller", () => {
    const deck = fitPitchDeck(buildPitchDeck(input()), fit);
    const economics = slideOf(deck, "economics");
    expect(economics.overflow).toBe(false);
    expect(economics.shrink).toBeGreaterThan(0);
    for (const slide of deck.slides.filter((s) => s.key !== "economics")) {
      expect({
        key: slide.key,
        shrink: slide.shrink,
        overflow: slide.overflow,
      }).toEqual({
        key: slide.key,
        shrink: 0,
        overflow: false,
      });
    }
  });

  test("long sources shrink the slide before anything is cut", () => {
    const answers = allAnswered();
    // Five bullets of three lines each at 22 pt do not fit; at 18 pt they take two.
    for (const key of ["P.04.1", "P.04.2", "P.04.3", "P.04.4", "P.04.5"]) {
      answers.set(key, { text: "word ".repeat(30).trim(), rows: null });
    }
    const slide = fitPitchSlide(
      slideOf(buildPitchDeck(input({ answers })), "problem"),
      fit,
    );
    expect(slide.shrink).toBeGreaterThan(0);
    expect(slide.overflow).toBe(false);
    expect(slide.bullets.every((b) => !b.text.endsWith("…"))).toBe(true);
  });

  test("past the smallest sizes the longest text is cut from its end, keeping every bullet", () => {
    const answers = allAnswered();
    const long = Array.from({ length: 400 }, (_, i) => `w${i}`).join(" ");
    answers.set("P.04.1", { text: long, rows: null });
    const slide = fitPitchSlide(
      slideOf(buildPitchDeck(input({ answers })), "problem"),
      fit,
    );
    expect(slide.shrink).toBe(3);
    expect(slide.overflow).toBe(true);
    expect(slide.bullets).toHaveLength(5);
    const cutText = slide.bullets[0]?.text ?? "";
    expect(cutText.endsWith("…")).toBe(true);
    expect(long.startsWith(cutText.slice(0, -1))).toBe(true);
    expect(cutText.length).toBeLessThan(long.length);
    expect(slide.bullets.slice(1).map((b) => b.text)).toEqual([
      "P.04.2",
      "P.04.3",
      "P.04.4",
      "P.04.5",
    ]);
  });

  test("of texts taking as many lines, the later one is cut first", () => {
    const answers = allAnswered();
    const long = Array.from({ length: 220 }, (_, i) => `w${i}`).join(" ");
    for (const key of ["P.04.1", "P.04.5"]) {
      answers.set(key, { text: long, rows: null });
    }
    const slide = fitPitchSlide(
      slideOf(buildPitchDeck(input({ answers })), "problem"),
      fit,
    );
    const first = slide.bullets[0]?.text ?? "";
    const last = slide.bullets[4]?.text ?? "";
    expect(slide.overflow).toBe(true);
    expect(last.endsWith("…")).toBe(true);
    expect(last.length).toBeLessThanOrEqual(first.length);
  });

  test("text without spaces breaks between characters, as Japanese does", () => {
    const answers = allAnswered();
    answers.set("P.04.1", { text: "ピアヤ".repeat(600), rows: null });
    const slide = fitPitchSlide(
      slideOf(buildPitchDeck(input({ answers })), "problem"),
      fit,
    );
    expect(slide.overflow).toBe(true);
    const cutText = slide.bullets[0]?.text ?? "";
    expect(cutText.endsWith("…")).toBe(true);
    expect(cutText.length).toBeGreaterThan(50);
  });

  test("a long cell is cut in its table", () => {
    const answers = allAnswered();
    answers.set("P.22.1", {
      text: null,
      rows: [
        {
          risk: "Stale",
          probability: "High",
          impact: "High",
          mitigation: "bake ".repeat(400).trim(),
        },
      ],
    });
    const slide = fitPitchSlide(
      slideOf(buildPitchDeck(input({ answers })), "risks"),
      fit,
    );
    expect(slide.overflow).toBe(true);
    expect(slide.shrink).toBe(3);
    expect(slide.table?.rows[0]?.[3]?.endsWith("…")).toBe(true);
    expect(slide.table?.rows[0]?.slice(0, 3)).toEqual([
      "Stale",
      "High",
      "High",
    ]);
  });

  test("the title slide cuts a long Business Name and §1, keeping its three lines", () => {
    const answers = allAnswered();
    answers.set("P.01.1", { text: "gift ".repeat(500).trim(), rows: null });
    const slide = fitPitchSlide(
      slideOf(
        buildPitchDeck(
          input({
            answers,
            header: {
              businessName: "Piaya ".repeat(40).trim(),
              preparedBy: "Ana Santos",
            },
          }),
        ),
        "title",
      ),
      fit,
    );
    expect(slide.overflow).toBe(true);
    expect(slide.shrink).toBe(6);
    expect(slide.subtitle?.text.endsWith("…")).toBe(true);
    expect(slide.bullets.map((b) => b.text)).toEqual([
      "Ana Santos",
      "Oct 1",
      "Draft",
    ]);
  });

  test("line feeds start new lines, a blank line counting as one", () => {
    const at = (text: string) => {
      const answers = allAnswered();
      for (const key of ["P.04.1", "P.04.2", "P.04.3", "P.04.4", "P.04.5"]) {
        answers.set(key, { text, rows: null });
      }
      return fitPitchSlide(
        slideOf(buildPitchDeck(input({ answers })), "problem"),
        fit,
      );
    };
    // Five bullets of four short paragraphs with blank lines between: seven lines each.
    expect(at("a\n\nb\n\nc\n\nd").shrink).toBeGreaterThan(at("a b c d").shrink);
  });

  test("a word wider than the line breaks between whole characters", () => {
    const answers = allAnswered();
    answers.set("P.04.1", { text: "👍🏽".repeat(1000), rows: null });
    const slide = fitPitchSlide(
      slideOf(buildPitchDeck(input({ answers })), "problem"),
      fit,
    );
    const cutText = slide.bullets[0]?.text ?? "";
    expect(cutText.endsWith("…")).toBe(true);
    expect(/^(👍🏽)+…$/u.test(cutText)).toBe(true);
  });

  test("figures as wide as their values and labels; values too wide for the slide break and show as cut", () => {
    const deck = buildPitchDeck(input());
    const model = slideOf(deck, "business_model");
    const sizes = pitchSizes("number", 0, print);
    const columns = figureColumns(model, sizes, fit);
    expect(columns.fits).toBe(true);
    // "₱450" is the narrowest value, and every column gets an equal share of the rest.
    const widths = columns.map((column) => column.width);
    expect(widths[0]).toBeLessThan(widths[1] ?? 0);
    expect(
      widths.reduce((sum, width) => sum + width, 0) + 3 * print.slide.gap,
    ).toBeCloseTo(pitchFrame(print).contentWidth, 6);
    const huge = {
      value: 123_456_789_012,
      bound: "exact" as const,
      reason: null,
    };
    const wide = fitPitchSlide(
      slideOf(
        buildPitchDeck(
          input({
            keyMetrics: {
              ...input().keyMetrics,
              selling_price: huge,
              variable_cost_per_unit: huge,
              contribution_margin: huge,
              contribution_margin_rate: huge,
            },
          }),
        ),
        "business_model",
      ),
      fit,
    );
    expect(wide.overflow).toBe(true);
    expect(wide.shrink).toBe(6);
  });

  test("a figure's reason breaks between its words, so it does not count as cut", () => {
    const margin: MetricValue = {
      value: null,
      bound: "exact",
      reason: "margin_not_positive",
    };
    const slide = fitPitchSlide(
      slideOf(
        buildPitchDeck(
          input({
            variant: "one",
            keyMetrics: {
              selling_price: exact(450),
              contribution_margin: margin,
              break_even_units_day: margin,
            },
          }),
        ),
        "business_model",
      ),
      fit,
    );
    expect(slide.overflow).toBe(false);
  });

  test("breakLongWords breaks only words wider than the box, where the fit does", () => {
    const font = { family: "body" as const, weight: 400, size: 10 };
    // 5 pt a character; the fit measures at 95% of 100 pt: 19 characters a line.
    const url = "https://example.com/a-very-long-path-without-spaces";
    const broken = breakLongWords(`See ${url} now`, font, 100, measure);
    expect(broken.startsWith("See ")).toBe(true);
    expect(broken.endsWith(" now")).toBe(true);
    const pieces = broken.slice(4, -4).split("\n");
    expect(pieces.join("")).toBe(url);
    expect(pieces.every((piece) => piece.length <= 19)).toBe(true);
    expect(breakLongWords("short words only", font, 100, measure)).toBe(
      "short words only",
    );
    expect(breakLongWords("ピアヤ".repeat(30), font, 100, measure)).toBe(
      "ピアヤ".repeat(30),
    );
    // A long run between CJK characters breaks as the fit breaks it.
    const mixed = breakLongWords(`詳細は${url}で`, font, 100, measure);
    expect(mixed.startsWith("詳細は")).toBe(true);
    expect(mixed.endsWith("で")).toBe(true);
    expect(mixed.replaceAll("\n", "")).toBe(`詳細は${url}で`);
    expect(mixed).toContain("\n");
    // An emoji of several code points stays whole.
    const thumbs = breakLongWords("👍🏽".repeat(20), font, 100, measure);
    expect(thumbs.split("\n").every((piece) => /^(👍🏽)+$/u.test(piece))).toBe(
      true,
    );
  });

  test("breakSlideWords breaks the long words of every text in its box", () => {
    const url = "https://example.com/".concat("x".repeat(200));
    const answers = allAnswered();
    answers.set("P.06.5", { text: `See ${url}`, rows: null });
    const slide = breakSlideWords(
      slideOf(
        buildPitchDeck(
          input({
            answers,
            competitors: [
              { name: url, type: null, typicalPrice: null, strength: null },
            ],
          }),
        ),
        "competition",
      ),
      fit,
    );
    expect(slide.table?.rows[0]?.[0]).toContain("\n");
    expect(slide.table?.rows[0]?.[0]?.replaceAll("\n", "")).toBe(url);
    expect(slide.bullets[0]?.text).toContain("\n");
    const title = breakSlideWords(
      slideOf(
        buildPitchDeck(
          input({ header: { businessName: url, preparedBy: "Ana" } }),
        ),
        "title",
      ),
      fit,
    );
    expect(title.title.text).toContain("\n");
    expect(title.subtitle?.text).toBe("P.01.1");
  });

  test("does not change the slide it is given", () => {
    const answers = allAnswered();
    answers.set("P.04.1", { text: "x ".repeat(3000), rows: null });
    const slide = slideOf(buildPitchDeck(input({ answers })), "problem");
    const before = structuredClone(slide);
    fitPitchSlide(slide, fit);
    expect(slide).toEqual(before);
  });
});
