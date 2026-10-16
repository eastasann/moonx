import { describe, expect, test } from "bun:test";
import {
  buildPitchDeck,
  fitPitchDeck,
  fitPitchSlide,
  fullestPitchDeckInput,
  PITCH_SHORT_TEXTS,
  PITCH_TEMPLATE_FIGURES,
  type PitchDeckInput,
  type PitchSection,
  pitchNumbersBreak,
  pitchSlideCutAtBottom,
  pitchTemplateOverflows,
} from "@moonx/domain";
import type {
  KeyMetrics,
  MetricReason,
  MetricValue,
  PitchVariant,
} from "@moonx/schemas";
import { print } from "@moonx/ui-tokens/print";
import template from "../../../data/templates/bcdx/plan.json";
import { loadPitchFonts } from "./pitch-fonts";
import { renderPitchPdf } from "./pitch-pdf";
import { BODY_BOX, pageText, readPdf, textsBelowBody } from "./test-pdf";

// design-spec 6.14 on the BCDX plan template with the most material each slide takes
// (five competitors, six milestones, six launch groups, three risks, three Next Actions,
// §11's table, the scenario table), every text in English or in Japanese, fitted with
// the PDF's own fonts: no slide is cut at the bottom of its body, in either deck, with
// the widest calculated figures or the reasons in their place too. What still cuts a
// slide there: amounts far past 6.14's range, and the templates AD6 refuses
// (pitch_deck_overflow).

const measure = await loadPitchFonts();
const fit = { print, measure, currency: "PHP" };

const SECTIONS: PitchSection[] = template.sections.map((section) => ({
  key: section.key,
  questions: section.questions.map((question) => ({
    key: question.key,
    title: question.title,
    answerType:
      question.answerType as PitchSection["questions"][number]["answerType"],
  })),
}));

const fullest = (
  variant: PitchVariant,
  text: string,
  sections: readonly PitchSection[] = SECTIONS,
): PitchDeckInput => fullestPitchDeckInput(variant, text, sections);

const LANGUAGES = {
  en: {
    short: PITCH_SHORT_TEXTS.en,
    long: "Offices buy gifts every month and nobody delivers them on time. ".repeat(
      60,
    ),
  },
  ja: {
    short: PITCH_SHORT_TEXTS.ja,
    long: "ピアヤの詰め合わせを毎月の贈り物として事務所に届ける。".repeat(80),
  },
} as const;

const CASES = (["one", "five"] as const).flatMap((variant) =>
  (["en", "ja"] as const).map((language) => ({ variant, language })),
);

describe("fitPitchDeck with the PDF's fonts on the most material", () => {
  test("the lists are at the limits of 6.14", () => {
    const deck = buildPitchDeck(fullest("five", LANGUAGES.en.short));
    const slide = (key: string) =>
      deck.slides.find((candidate) => candidate.key === key);
    expect(deck.slides).toHaveLength(14);
    expect(slide("competition")?.table?.rows).toHaveLength(5);
    expect(slide("funding")?.bullets).toHaveLength(3);
    expect(slide("execution")?.table?.rows).toHaveLength(6);
    expect(slide("launch")?.bullets).toHaveLength(6);
    expect(slide("risks")?.table?.rows).toHaveLength(3);
    expect(
      slide("ask")
        ?.bullets.find((bullet) => bullet.label === "Next Actions")
        ?.text.split("; "),
    ).toHaveLength(3);
    expect(
      deck.slides.every((candidate) => candidate.emptySources.length === 0),
    ).toBe(true);
  });

  // A cut leaves each text at least one line (two with CJK in it, CJK_EXTRA_LINES) and
  // its whole label, at the smallest sizes. These short texts take no fewer lines, at
  // sizes no smaller: when they fit uncut, any material of these counts can be cut to
  // fit, and no slide is cut at its bottom.
  for (const { variant, language } of CASES) {
    test(`${variant}, ${language}: every text short, every slide fits without a cut`, () => {
      const deck = fitPitchDeck(
        buildPitchDeck(fullest(variant, LANGUAGES[language].short)),
        fit,
      );
      expect(deck.slides.map((slide) => [slide.key, slide.overflow])).toEqual(
        deck.slides.map((slide) => [slide.key, false]),
      );
    });

    test(`${variant}, ${language}: every text too long, cut on every slide, the PDF keeps every slide above its footer`, async () => {
      const built = buildPitchDeck(fullest(variant, LANGUAGES[language].long));
      const deck = fitPitchDeck(built, fit);
      const shape = (slides: typeof deck.slides) =>
        slides.map((slide) => [
          slide.key,
          slide.bullets.length,
          slide.table?.rows.length ?? null,
        ]);
      expect(shape(deck.slides)).toEqual(shape(built.slides));
      // Economics shows no text of the plan, so nothing of it is cut.
      expect(deck.slides.map((slide) => [slide.key, slide.overflow])).toEqual(
        deck.slides.map((slide) => [slide.key, slide.key !== "economics"]),
      );
      const pages = await readPdf(
        await renderPitchPdf(deck, {
          measure,
          currency: "PHP",
          timeZone: "Asia/Manila",
        }),
      );
      expect(pages).toHaveLength(built.slides.length);
      expect(textsBelowBody(pages)).toEqual([]);
    }, 30_000);
  }
});

const pdfOf = async (deck: ReturnType<typeof fitPitchDeck>) =>
  readPdf(
    await renderPitchPdf(deck, {
      measure,
      currency: "PHP",
      timeZone: "Asia/Manila",
    }),
  );

/** The BCDX plan template with `count` more text sub-items in §`key`. */
const withTexts = (key: string, count: number): PitchSection[] =>
  SECTIONS.map((section) =>
    section.key === key
      ? {
          ...section,
          questions: [
            ...section.questions,
            ...Array.from({ length: count }, (_, index) => ({
              key: `P.${key}.${index + 20}`,
              title: `Added ${index}`,
              answerType: "long_text" as const,
            })),
          ],
        }
      : section,
  );

/** The BCDX plan template with the sub-items `keys` titled `title`. */
const retitled = (keys: readonly string[], title: string): PitchSection[] =>
  SECTIONS.map((section) => ({
    ...section,
    questions: section.questions.map((question) =>
      keys.includes(question.key) ? { ...question, title } : question,
    ),
  }));

describe("fitPitchDeck with the PDF's fonts on an operator's template", () => {
  test("labels too long for a line are kept whole, and the slide still fits", async () => {
    // Titles of wide letters at the 200-character limit take four lines: cut below that,
    // the last two bullets would be taller than the fit counts them.
    const sections = SECTIONS.map((section) => ({
      ...section,
      questions: section.questions.map((question) =>
        question.key === "P.04.4" || question.key === "P.04.5"
          ? {
              ...question,
              title: "MMMMM ".repeat(33).trim(),
            }
          : question,
      ),
    }));
    const deck = fitPitchDeck(
      buildPitchDeck(fullest("five", LANGUAGES.en.long, sections)),
      fit,
    );
    const problem = deck.slides.find((slide) => slide.key === "problem");
    expect(problem?.bullets.map((bullet) => bullet.text.endsWith("…"))).toEqual(
      [true, true, true, true, true],
    );
    expect(textsBelowBody(await pdfOf(deck))).toEqual([]);
  }, 30_000);

  test("a label's word wider than the line breaks inside the body", async () => {
    const sections = SECTIONS.map((section) => ({
      ...section,
      questions: section.questions.map((question) =>
        question.key === "P.04.4"
          ? { ...question, title: "Supercalifragilistic".repeat(5) }
          : question,
      ),
    }));
    const pages = await pdfOf(
      fitPitchDeck(
        buildPitchDeck(fullest("five", LANGUAGES.en.short, sections)),
        fit,
      ),
    );
    const problem = pages[1]?.texts ?? [];
    expect(pageText({ texts: problem }).replace(/\s/gu, "")).toContain(
      `${"Supercalifragilistic".repeat(5)}:`,
    );
    expect(
      problem
        .filter((text) => text.x + text.width > BODY_BOX.right + 0.5)
        .map((text) => text.str),
    ).toEqual([]);
  }, 30_000);

  test("a slide still too tall once every text is cut runs past the body's bottom on its page, with the warning", async () => {
    // A template AD6 refuses (pitch_deck_overflow): thirty more §20 text sub-items.
    const built = buildPitchDeck(
      fullest("five", LANGUAGES.en.short, withTexts("20", 30)),
    );
    const deck = fitPitchDeck(built, fit);
    const funding = deck.slides.findIndex((slide) => slide.key === "funding");
    const slide = built.slides[funding];
    if (slide === undefined) throw new Error("No Funding plan slide");
    expect(deck.slides[funding]?.overflow).toBe(true);
    expect(deck.slides[funding]?.bullets).toEqual(slide.bullets);
    const pages = await pdfOf(deck);
    expect(pages).toHaveLength(14);
    // Each bullet keeps its line and gap as the fit measured them, rather than squeezed
    // into the body (react-pdf draws none past the page's edge).
    const labels = slide.bullets.map((bullet) => `${bullet.label}:`);
    const bullets = (pages[funding]?.texts ?? []).filter((text) =>
      labels.some((label) => text.str.startsWith(label)),
    );
    expect(bullets.length).toBeGreaterThan(10);
    const step =
      print.fontSize.text.bulletMin * print.typography.bullet.lineHeight +
      print.slide.bulletGap;
    for (const [index, bullet] of bullets.slice(1).entries()) {
      expect(bullet.y - (bullets[index]?.y ?? 0)).toBeCloseTo(step, 2);
    }
    expect(pages[funding]?.clips).toContainEqual(BODY_BOX);
    const below = textsBelowBody(pages);
    expect(below.length).toBeGreaterThan(0);
    expect(new Set(below.map((text) => text.page))).toEqual(
      new Set([funding + 1]),
    );
    expect(pageText(pages[funding] ?? { texts: [] })).toContain(
      "Yes · Draft · Oct 1",
    );
  }, 30_000);
});

const metric = (
  value: number,
  bound: MetricValue["bound"] = "exact",
): MetricValue => ({ value, bound, reason: null });

const because = (reason: MetricReason): MetricValue => ({
  value: null,
  bound: "exact",
  reason,
});

/** Amounts as the figures and cells show them, each with the marks it may carry. */
interface Amounts {
  /** Price, variable cost and contribution per sale. */
  perSale: number;
  /** Variable cost a lower bound ("+"), contribution and its margin upper ones ("≤"). */
  perSaleBounded?: boolean;
  /** A lower bound ("+"), as with an Unknown cost row. */
  startup: number;
  /** Each scenario's revenue, and its operating profit as a loss with "≤". */
  revenue: number;
  competitorPrice: number;
}

const withAmounts = (
  input: PitchDeckInput,
  amounts: Amounts,
): PitchDeckInput => {
  const cents = amounts.perSale + 0.99;
  const bounded = amounts.perSaleBounded === true;
  return {
    ...input,
    keyMetrics: {
      ...input.keyMetrics,
      selling_price: metric(amounts.perSale),
      variable_cost_per_unit: metric(cents, bounded ? "lower" : "exact"),
      contribution_margin: metric(cents, bounded ? "upper" : "exact"),
      contribution_margin_rate: metric(0.999, bounded ? "upper" : "exact"),
      initial_cost_total: metric(amounts.startup, "lower"),
    },
    scenarios: input.scenarios.map((scenario) => ({
      ...scenario,
      revenue: metric(amounts.revenue),
      operatingProfit: metric(-amounts.revenue, "upper"),
    })),
    competitors: input.competitors.map((competitor) => ({
      ...competitor,
      typicalPrice: amounts.competitorPrice,
    })),
  };
};

const withFigures =
  (figures: KeyMetrics, amounts?: Amounts) =>
  (input: PitchDeckInput): PitchDeckInput => {
    const amounted =
      amounts === undefined ? input : withAmounts(input, amounts);
    return {
      ...amounted,
      keyMetrics: { ...amounted.keyMetrics, ...figures },
    };
  };

/** The top of the range design-spec 6.14 gives. */
const RANGE: Amounts = {
  perSale: 999_999,
  startup: 999_999_999,
  revenue: 999_999_999_999,
  competitorPrice: 9_999_999,
};

/** Past the range, up to where 6.14 says every slide still fits its body. */
const FAR: Amounts = {
  perSale: 1_000_000_000_000,
  perSaleBounded: true,
  startup: 999_999_999_999,
  revenue: 10_000_000_000_000_000,
  competitorPrice: 1_000_000_000_000,
};

/** The calculated figures design-spec 6.14 measures: the widest it names, together. */
const WIDEST: KeyMetrics = {
  break_even_units_day: metric(99_999.9, "lower"),
  payback_months: metric(9_999.9, "lower"),
  simple_roi: metric(-99.999, "approximate"),
};

/**
 * The widest figures one by one and together, the reasons 6.4 shows in place, and the
 * figures AD6 sets (SDD 5.13).
 */
const FIGURES: [string, KeyMetrics][] = [
  ...Object.entries(WIDEST).map(([key, value]): [string, KeyMetrics] => [
    key,
    { [key]: value },
  ]),
  ["the widest together", WIDEST],
  ...(
    [
      ["break_even_units_day", "margin_not_positive"],
      ["payback_months", "margin_not_positive"],
      ["payback_months", "not_recovered"],
      ["simple_roi", "margin_not_positive"],
    ] as const
  ).map(([key, reason]): [string, KeyMetrics] => [
    `${key} ${reason}`,
    { [key]: because(reason) },
  ]),
  [
    "every reason of a margin at or below zero",
    {
      break_even_units_day: because("margin_not_positive"),
      payback_months: because("margin_not_positive"),
      simple_roi: because("margin_not_positive"),
    },
  ],
  ...PITCH_TEMPLATE_FIGURES.slice(1).map(
    (figures, index): [string, KeyMetrics] => [
      `AD6's figures ${index + 1}`,
      figures,
    ],
  ),
];

/**
 * The sets of FIGURES that break the five-minute Economics figures: the wide values with
 * nothing narrower beside them. A reason takes no more than its longest word, which
 * leaves the wide values beside it room.
 */
const BREAKING = new Set([
  ...Object.keys(WIDEST),
  "the widest together",
  "AD6's figures 1",
]);

/** A loss per sale as large as the price: contribution margin "−100.0%". */
const withLoss =
  (perSale: number, bounded: boolean) =>
  (input: PitchDeckInput): PitchDeckInput => ({
    ...input,
    keyMetrics: {
      ...input.keyMetrics,
      selling_price: metric(perSale),
      variable_cost_per_unit: metric(
        2 * perSale + 0.99,
        bounded ? "lower" : "exact",
      ),
      contribution_margin: metric(
        -(perSale + 0.99),
        bounded ? "upper" : "exact",
      ),
      contribution_margin_rate: metric(-1.0001, bounded ? "upper" : "exact"),
    },
  });

/**
 * Each slide of both decks in `language` whose numbers break, that shows the warning, or
 * that is cut at the bottom of its body.
 */
const flagged = (
  language: keyof typeof LANGUAGES,
  change: (input: PitchDeckInput) => PitchDeckInput,
) =>
  (["one", "five"] as const).flatMap((variant) =>
    buildPitchDeck(
      change(fullest(variant, LANGUAGES[language].short)),
    ).slides.flatMap((slide) => {
      const fitted = fitPitchSlide(slide, fit);
      const flags = [
        pitchNumbersBreak(fitted, fit) ? ["numbers break"] : [],
        fitted.overflow ? ["warned"] : [],
        pitchSlideCutAtBottom(slide, fit) ? ["cut at its bottom"] : [],
      ].flat();
      return flags.length === 0
        ? []
        : [`${variant}.${slide.key}: ${flags.join(", ")}`];
    }),
  );

/**
 * Whether a number cell of `key` in the five-minute deck breaks at the largest size a
 * slide sets cells in (shrink 0): a slide with fewer or shorter texts shrinks less than
 * the most material does.
 */
const cellsBreakAtLargest = (
  key: string,
  change: (input: PitchDeckInput) => PitchDeckInput,
) => {
  const slide = buildPitchDeck(
    change(fullest("five", LANGUAGES.en.short)),
  ).slides.find((candidate) => candidate.key === key);
  if (slide === undefined) throw new Error(`No slide ${key}`);
  return pitchNumbersBreak({ ...slide, shrink: 0, numbers: [] }, fit);
};

describe("the amounts of design-spec 6.14's range", () => {
  for (const language of ["en", "ja"] as const) {
    test(`${language}: at the top of the range no number breaks and no slide is warned`, () => {
      expect(flagged(language, (input) => withAmounts(input, RANGE))).toEqual(
        [],
      );
      expect(
        flagged(language, (input) =>
          withAmounts(input, {
            ...RANGE,
            perSale: 9_999,
            perSaleBounded: true,
          }),
        ),
      ).toEqual([]);
      // A loss per sale: up to ₱99,999, or ₱999 with the marks.
      expect(flagged(language, withLoss(99_999, false))).toEqual([]);
      expect(flagged(language, withLoss(999, true))).toEqual([]);
      expect(flagged(language, withLoss(100_000, false))).toEqual([
        "five.business_model: numbers break",
      ]);
      expect(flagged(language, withLoss(1_000, true))).toEqual([
        "five.business_model: numbers break",
      ]);
    });
  }

  test("the cells of the range do not break at their largest size, and past it they do", () => {
    const at = (amounts: Amounts) => (input: PitchDeckInput) =>
      withAmounts(input, amounts);
    expect(cellsBreakAtLargest("competition", at(RANGE))).toBe(false);
    expect(cellsBreakAtLargest("economics", at(RANGE))).toBe(false);
    expect(
      cellsBreakAtLargest(
        "competition",
        at({ ...RANGE, competitorPrice: 10_000_000 }),
      ),
    ).toBe(true);
    expect(
      cellsBreakAtLargest(
        "economics",
        at({ ...RANGE, revenue: 1_000_000_000_000 }),
      ),
    ).toBe(true);
    // A scenario's daily sales, up to their input limit (design-spec 6.0.8).
    expect(
      cellsBreakAtLargest("economics", (input) => ({
        ...input,
        scenarios: input.scenarios.map((scenario) => ({
          ...scenario,
          unitsPerDay: metric(999_999_999.99),
        })),
      })),
    ).toBe(false);
  });

  for (const language of ["en", "ja"] as const) {
    test(`${language}: past it the numbers break without the warning, within their body`, () => {
      for (const amounts of [
        { ...RANGE, perSale: 1_000_000 },
        { ...RANGE, perSale: 10_000, perSaleBounded: true },
      ]) {
        expect(
          flagged(language, (input) => withAmounts(input, amounts)),
        ).toEqual(["five.business_model: numbers break"]);
      }
      expect(
        flagged(language, (input) =>
          withAmounts(input, { ...RANGE, startup: 1_000_000_000 }),
        ),
      ).toEqual(["five.economics: numbers break"]);
      expect(
        flagged(language, (input) =>
          withAmounts(input, {
            ...RANGE,
            competitorPrice: 1_000_000_000_000,
          }),
        ),
      ).toEqual(["five.competition: numbers break"]);
    });
  }

  for (const language of ["en", "ja"] as const) {
    test(`${language}: the five-minute Economics figures break by their total width`, () => {
      // The startup cost of the most material, "₱1,269,500+": one figure at a time up
      // to 9,999.9+, 999.9+ months or ≈ −999.9%.
      const one = (figures: KeyMetrics, amounts?: Amounts) =>
        Object.entries(figures).map(([key, value]) =>
          flagged(language, withFigures({ [key]: value }, amounts)),
        );
      expect(
        one({
          break_even_units_day: metric(9_999.9, "lower"),
          payback_months: metric(999.9, "lower"),
          simple_roi: metric(-9.999, "approximate"),
        }),
      ).toEqual([[], [], []]);
      const breaks = ["five.economics: numbers break"];
      expect(one(WIDEST)).toEqual([breaks, breaks, breaks]);
      // All three at once break sooner.
      expect(
        flagged(
          language,
          withFigures({
            break_even_units_day: metric(9_999.9, "lower"),
            payback_months: metric(999.9, "lower"),
            simple_roi: metric(-9.999, "approximate"),
          }),
        ),
      ).toEqual(breaks);
      // A startup cost of "₱999,999,999+" leaves the others less room.
      const top = { ...RANGE, perSale: 1_450, competitorPrice: 1_380 };
      expect(
        one(
          {
            break_even_units_day: metric(999.9, "lower"),
            payback_months: metric(99.9, "lower"),
          },
          top,
        ),
      ).toEqual([[], []]);
      expect(
        one(
          {
            break_even_units_day: metric(9_999.9, "lower"),
            payback_months: metric(999.9, "lower"),
          },
          top,
        ),
      ).toEqual([breaks, breaks]);
    });
  }

  for (const language of ["en", "ja"] as const) {
    test(`${language}: the widest calculated figures and the reasons in their place fit every slide, unwarned`, () => {
      for (const amounts of [undefined, RANGE]) {
        for (const [name, figures] of FIGURES) {
          const breaks = BREAKING.has(name);
          expect({
            name,
            flagged: flagged(language, withFigures(figures, amounts)),
          }).toEqual({
            name,
            flagged: breaks ? ["five.economics: numbers break"] : [],
          });
        }
      }
    });
  }

  for (const language of ["en", "ja"] as const) {
    test(`${language}: far past it, up to 6.14's bounds, every slide still fits its body unwarned`, () => {
      for (const [name, figures] of [
        ["as they are", {}] as [string, KeyMetrics],
        ...FIGURES,
      ]) {
        const flags = flagged(language, withFigures(figures, FAR));
        expect({
          name,
          warnedOrCut: flags.filter((flag) => !flag.endsWith("numbers break")),
        }).toEqual({ name, warnedOrCut: [] });
      }
    });
  }

  test("past those bounds the scenario table cuts the five-minute Economics at its bottom, with the warning", () => {
    for (const language of ["en", "ja"] as const) {
      expect(
        flagged(language, (input) =>
          withAmounts(input, { ...FAR, revenue: 1_000_000_000_000_000_000 }),
        ),
      ).toEqual([
        "one.business_model: numbers break",
        "five.competition: numbers break",
        "five.business_model: numbers break",
        "five.economics: numbers break, warned, cut at its bottom",
      ]);
    }
  });
});

/** The slides cut at the bottom of their body on the most material in `language`. */
const cutSlides = (
  sections: readonly PitchSection[],
  language: keyof typeof LANGUAGES,
) =>
  (["one", "five"] as const).flatMap((variant) =>
    buildPitchDeck(fullest(variant, LANGUAGES[language].short, sections))
      .slides.filter((slide) => pitchSlideCutAtBottom(slide, fit))
      .map((slide) => `${variant}.${slide.key}`),
  );

const overflows = (sections: readonly PitchSection[]) =>
  pitchTemplateOverflows(sections, { print, measure });

describe("pitchTemplateOverflows with the PDF's fonts (AD6 pitch_deck_overflow)", () => {
  test("the BCDX plan template: no slide", () => {
    expect(overflows(SECTIONS)).toEqual([]);
  });

  test("three more §20 text sub-items fit the five-minute Funding plan; four more do not, with Japanese texts", () => {
    expect(overflows(withTexts("20", 3))).toEqual([]);
    const sections = withTexts("20", 4);
    expect(cutSlides(sections, "en")).toEqual([]);
    expect(cutSlides(sections, "ja")).toEqual(["five.funding"]);
    expect(overflows(sections)).toEqual([
      { variant: "five", slide: "funding", itemNo: 20 },
    ]);
  });

  test("eight more: with English texts too, still once", () => {
    const sections = withTexts("20", 8);
    expect(cutSlides(sections, "en")).toEqual(["five.funding"]);
    expect(cutSlides(sections, "ja")).toEqual(["five.funding"]);
    expect(overflows(sections)).toEqual([
      { variant: "five", slide: "funding", itemNo: 20 },
    ]);
  });

  test("four more §8 text sub-items: the five-minute Business model, with Japanese texts", () => {
    const sections = withTexts("08", 4);
    expect(cutSlides(sections, "en")).toEqual([]);
    expect(overflows(sections)).toEqual([
      { variant: "five", slide: "business_model", itemNo: 8 },
    ]);
  });

  test("§4's titles long, past a line with the ellipsis: the Problem slides, once in each deck", () => {
    const keys = ["P.04.1", "P.04.2", "P.04.3", "P.04.4", "P.04.5"];
    const longer = retitled(keys, "MMMMM ".repeat(12).trim());
    expect(cutSlides(longer, "en")).toEqual([]);
    expect(overflows(longer)).toEqual([
      { variant: "five", slide: "problem", itemNo: 4 },
    ]);
    // 197 characters, near the 200 a title may take (design-spec 6.0.8).
    const longest = retitled(keys, "MMMMM ".repeat(33).trim());
    expect(cutSlides(longest, "en")).toEqual(["five.problem"]);
    expect(cutSlides(longest, "ja")).toEqual(["one.problem", "five.problem"]);
    expect(overflows(longest)).toEqual([
      { variant: "one", slide: "problem", itemNo: 4 },
      { variant: "five", slide: "problem", itemNo: 4 },
    ]);
  });
});
