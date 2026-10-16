import { describe, expect, test } from "bun:test";
import {
  buildPitchDeck,
  fitPitchDeck,
  fitPitchSlide,
  fullestPitchDeckInput,
  PITCH_SHORT_TEXTS,
  type PitchDeckInput,
  type PitchSection,
  pitchSlideCutAtBottom,
  pitchTemplateOverflows,
} from "@moonx/domain";
import type { MetricValue, PitchVariant } from "@moonx/schemas";
import { print } from "@moonx/ui-tokens/print";
import template from "../../../data/templates/bcdx/plan.json";
import { loadPitchFonts } from "./pitch-fonts";
import { renderPitchPdf } from "./pitch-pdf";
import { BODY_BOX, pageText, readPdf, textsBelowBody } from "./test-pdf";

// design-spec 6.14 on the BCDX plan template with the most material each slide takes
// (five competitors, six milestones, six launch groups, three risks, three Next Actions,
// §11's table, the scenario table), every text in English or in Japanese, fitted with
// the PDF's own fonts: no slide is cut at the bottom of its body, in either deck. What
// still cuts a slide there: amounts past 6.14's range, long reasons in place of figures,
// and the templates AD6 refuses (pitch_deck_overflow).

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
    expect(deck.slides).toHaveLength(13);
    expect(slide("competition")?.table?.rows).toHaveLength(5);
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
      expect(deck.slides.map((slide) => [slide.key, slide.overflow])).toEqual(
        deck.slides.map((slide) => [slide.key, true]),
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
});

const metric = (
  value: number,
  bound: MetricValue["bound"] = "exact",
): MetricValue => ({ value, bound, reason: null });

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

/** The top of the range design-spec 6.14 gives. */
const RANGE: Amounts = {
  perSale: 999_999,
  startup: 999_999_999,
  revenue: 99_999_999,
  competitorPrice: 999_999_999_999,
};

/** Each slide of both decks in `language` that shows the warning, and where it is cut. */
const warned = (
  language: keyof typeof LANGUAGES,
  change: (input: PitchDeckInput) => PitchDeckInput,
) =>
  (["one", "five"] as const).flatMap((variant) =>
    buildPitchDeck(
      change(fullest(variant, LANGUAGES[language].short)),
    ).slides.flatMap((slide) =>
      fitPitchSlide(slide, fit).overflow
        ? [
            `${variant}.${slide.key}${pitchSlideCutAtBottom(slide, fit) ? " cut at its bottom" : ""}`,
          ]
        : [],
    ),
  );

describe("the amounts of design-spec 6.14's range", () => {
  for (const language of ["en", "ja"] as const) {
    test(`${language}: at the top of the range no number breaks and every slide fits`, () => {
      expect(warned(language, (input) => withAmounts(input, RANGE))).toEqual(
        [],
      );
      expect(
        warned(language, (input) =>
          withAmounts(input, {
            ...RANGE,
            perSale: 9_999,
            perSaleBounded: true,
          }),
        ),
      ).toEqual([]);
    });

    test(`${language}: past it a sale's amounts break the five-minute Business model's figures, with the warning, within its body`, () => {
      for (const amounts of [
        { ...RANGE, perSale: 1_000_000 },
        { ...RANGE, perSale: 99_999, perSaleBounded: true },
      ]) {
        expect(
          warned(language, (input) => withAmounts(input, amounts)),
        ).toEqual(["five.business_model"]);
      }
    });
  }

  test("past it a startup cost cuts the five-minute Economics at the body's bottom, on its page, with the warning", async () => {
    const past = (input: PitchDeckInput) =>
      withAmounts(input, { ...RANGE, startup: 99_999_999_999 });
    expect(warned("en", past)).toEqual(["five.economics cut at its bottom"]);
    const input = past(fullest("five", LANGUAGES.en.short));
    const built = buildPitchDeck(input);
    const deck = fitPitchDeck(built, fit);
    const economics = deck.slides.findIndex(
      (slide) => slide.key === "economics",
    );
    const slide = built.slides[economics];
    if (slide === undefined) throw new Error("No Economics slide");
    expect(deck.slides[economics]?.bullets).toEqual(slide.bullets);
    const pages = await pdfOf(deck);
    expect(pages).toHaveLength(13);
    // Each note keeps its line and gap as the fit measured them, rather than squeezed
    // into the body (react-pdf draws none past the page's edge).
    const labels = slide.bullets.map((bullet) => bullet.label);
    const notes = (pages[economics]?.texts ?? []).filter((text) =>
      labels.some((label) => text.str.startsWith(label)),
    );
    expect(notes).toHaveLength(labels.length);
    const step =
      print.fontSize.table.cellMin * print.typography.cell.lineHeight +
      print.slide.noteGap;
    for (const [index, note] of notes.slice(1).entries()) {
      expect(note.y - (notes[index]?.y ?? 0)).toBeCloseTo(step, 2);
    }
    expect(pages[economics]?.clips).toContainEqual(BODY_BOX);
    const below = textsBelowBody(pages);
    expect(below.length).toBeGreaterThan(0);
    expect(new Set(below.map((text) => text.page))).toEqual(
      new Set([economics + 1]),
    );
    expect(pageText(pages[economics] ?? { texts: [] })).toContain(
      "Yes · Draft · Oct 1",
    );
  }, 30_000);

  test("past it a calculated figure cuts the five-minute Economics at its bottom, with English texts too", () => {
    for (const [key, value] of [
      ["payback_months", metric(9_999.9, "lower")],
      ["simple_roi", metric(-99.999, "approximate")],
    ] as const) {
      const change = (input: PitchDeckInput): PitchDeckInput => ({
        ...withAmounts(input, RANGE),
        keyMetrics: { ...withAmounts(input, RANGE).keyMetrics, [key]: value },
      });
      for (const language of ["en", "ja"] as const) {
        expect(warned(language, change)).toEqual([
          "five.economics cut at its bottom",
        ]);
      }
    }
  });

  // design-spec 6.14 as it stands: a reason shown in place of a figure (6.4) breaks
  // between words, and the long ones cut the five-minute Economics at its bottom with
  // Japanese texts.
  test("a long reason in place of an Economics figure cuts it at its bottom with Japanese texts", () => {
    for (const [key, reason] of [
      ["break_even_units_day", "margin_not_positive"],
      ["payback_months", "margin_not_positive"],
      ["payback_months", "not_recovered"],
      ["simple_roi", "margin_not_positive"],
    ] as const) {
      const change = (input: PitchDeckInput): PitchDeckInput => ({
        ...input,
        keyMetrics: {
          ...input.keyMetrics,
          [key]: { value: null, bound: "exact", reason },
        },
      });
      expect(warned("en", change)).toEqual([]);
      expect(warned("ja", change)).toEqual([
        "five.economics cut at its bottom",
      ]);
    }
  });
});

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

  test("one more §20 text sub-item: the five-minute Economics, with Japanese texts", () => {
    const sections = withTexts("20", 1);
    expect(cutSlides(sections, "en")).toEqual([]);
    expect(cutSlides(sections, "ja")).toEqual(["five.economics"]);
    expect(overflows(sections)).toEqual([
      { variant: "five", slide: "economics", itemNo: 20 },
    ]);
  });

  test("three more: with English texts too, still once", () => {
    const sections = withTexts("20", 3);
    expect(cutSlides(sections, "en")).toEqual(["five.economics"]);
    expect(cutSlides(sections, "ja")).toEqual(["five.economics"]);
    expect(overflows(sections)).toEqual([
      { variant: "five", slide: "economics", itemNo: 20 },
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
