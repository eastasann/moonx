import { describe, expect, test } from "bun:test";
import { print } from "@moonx/ui-tokens/print";
import template from "../../../data/templates/bcdx/plan.json";
import { buildPitchDeck, formatMetric, type PitchSection } from "./pitch";
import {
  fitPitchSlide,
  type MeasureText,
  pitchSlideCutAtBottom,
} from "./pitch-fit";
import {
  fullestPitchDeckInput,
  PITCH_SHORT_TEXTS,
  PITCH_TEMPLATE_FIGURES,
  pitchTemplateOverflows,
} from "./pitch-template";

// The check of a plan template's Pitch Deck (SDD 5.13 AD6 pitch_deck_overflow) on the
// BCDX plan template and variants of it, with the font of pitch.test.ts: glyphs half the
// size wide (monospaced: 0.6). apps/api checks it with the PDF's own fonts.

const measure: MeasureText = (text, font) =>
  [...text].length * font.size * (font.family === "mono" ? 0.6 : 0.5);
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

const slideOf = (
  sections: readonly PitchSection[],
  text: string,
  key: string,
) => {
  const slide = buildPitchDeck(
    fullestPitchDeckInput("five", text, sections),
  ).slides.find((candidate) => candidate.key === key);
  if (slide === undefined) throw new Error(`No slide ${key}`);
  return slide;
};

describe("fullestPitchDeckInput", () => {
  test("fills every text source and takes each list past its limit", () => {
    const input = fullestPitchDeckInput("five", "Yes", SECTIONS);
    const texts = SECTIONS.flatMap((section) =>
      section.questions.filter((question) =>
        ["long_text", "short_text", "choice"].includes(question.answerType),
      ),
    );
    expect(
      texts.every(
        (question) => input.answers.get(question.key)?.text === "Yes",
      ),
    ).toBe(true);
    const count = (type: string) =>
      input.execution.filter((item) => item.type === type).length;
    expect([count("milestone"), count("launch"), count("next_action")]).toEqual(
      [8, 12, 4],
    );
    expect(input.answers.get("P.22.1")?.rows).toHaveLength(4);
    expect(input.competitors).toHaveLength(5);
    const deck = buildPitchDeck(input);
    expect(deck.slides.every((slide) => slide.emptySources.length === 0)).toBe(
      true,
    );
  });
});

describe("pitchSlideCutAtBottom", () => {
  test("a slide whose texts are cut to fit is not cut at its bottom", () => {
    const slide = slideOf(
      SECTIONS,
      "Offices buy gifts every month. ".repeat(80),
      "problem",
    );
    expect(fitPitchSlide(slide, fit).overflow).toBe(true);
    expect(pitchSlideCutAtBottom(slide, fit)).toBe(false);
  });

  test("a slide still too tall with every text cut is", () => {
    const slide = slideOf(withTexts("20", 30), PITCH_SHORT_TEXTS.en, "funding");
    expect(fitPitchSlide(slide, fit).overflow).toBe(true);
    expect(pitchSlideCutAtBottom(slide, fit)).toBe(true);
  });
});

describe("pitchTemplateOverflows", () => {
  test("the BCDX plan template: no slide", () => {
    expect(pitchTemplateOverflows(SECTIONS, { print, measure })).toEqual([]);
  });

  test("names each slide cut once, by its deck and the item its Edit source opens", () => {
    // Past the bottom in English and in Japanese alike: still one entry.
    const sections = withTexts("08", 30);
    for (const text of Object.values(PITCH_SHORT_TEXTS)) {
      expect(
        pitchSlideCutAtBottom(slideOf(sections, text, "business_model"), fit),
      ).toBe(true);
    }
    expect(pitchTemplateOverflows(sections, { print, measure })).toEqual([
      { variant: "five", slide: "business_model", itemNo: 8 },
    ]);
  });

  test("in slide order", () => {
    const keys = ["P.04.1", "P.04.2", "P.04.3", "P.04.4", "P.04.5"];
    const longTitles = withTexts("20", 30).map((section) => ({
      ...section,
      questions: section.questions.map((question) =>
        keys.includes(question.key)
          ? { ...question, title: "MMMMM ".repeat(33).trim() }
          : question,
      ),
    }));
    expect(pitchTemplateOverflows(longTitles, { print, measure })).toEqual([
      { variant: "five", slide: "problem", itemNo: 4 },
      { variant: "five", slide: "funding", itemNo: 20 },
    ]);
  });

  test("the figures it sets: as they are, wide, without a margin, and without a profit (SDD 5.13)", () => {
    const shown = PITCH_TEMPLATE_FIGURES.map((figures) => {
      const metrics = {
        ...fullestPitchDeckInput("five", PITCH_SHORT_TEXTS.en, SECTIONS)
          .keyMetrics,
        ...figures,
      };
      return [
        "contribution_margin",
        "break_even_units_day",
        "payback_months",
        "simple_roi",
      ].map((key) => {
        const value = metrics[key];
        if (value === undefined) throw new Error(`No ${key}`);
        return formatMetric(key, value, "PHP");
      });
    });
    const margin =
      "Contribution margin is zero or negative. Review price or variable costs.";
    const notRecovered = "Not recovered: Expected profit is zero or negative";
    expect(shown).toEqual([
      ["₱731.25", "116.9", "19.2 months", "130.9%"],
      ["₱731.25", "99,999.9+", "9,999.9+ months", "≈ −9,999.9%"],
      ["−₱731.25", margin, margin, margin],
      ["₱731.25", "116.9", notRecovered, "130.9%"],
      ["₱731.25", "99,999.9+", notRecovered, "≈ −9,999.9%"],
    ]);
  });

  test("sets the calculated figures wide and as reasons too, on the slides that show them", () => {
    // Slides just tall enough for Economics with the figures of fullestPitchDeckInput.
    const shorter = (height: number) => ({
      ...print,
      slide: { ...print.slide, height },
    });
    const economics = slideOf(SECTIONS, PITCH_SHORT_TEXTS.en, "economics");
    let height = print.slide.height;
    while (
      !pitchSlideCutAtBottom(economics, { ...fit, print: shorter(height - 1) })
    ) {
      height -= 1;
    }
    expect(
      pitchTemplateOverflows(SECTIONS, { print: shorter(height), measure }),
    ).toContainEqual({ variant: "five", slide: "economics", itemNo: 20 });
  });
});
