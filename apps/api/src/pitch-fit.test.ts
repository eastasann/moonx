import { describe, expect, test } from "bun:test";
import {
  buildPitchDeck,
  fitPitchDeck,
  type PitchDeckInput,
  type PitchExecutionItem,
  type PitchSection,
  type PlanAnswerContent,
} from "@moonx/domain";
import {
  launchTimingSchema,
  type MetricValue,
  type PitchVariant,
  type ScenarioColumn,
} from "@moonx/schemas";
import { print } from "@moonx/ui-tokens/print";
import template from "../../../data/templates/bcdx/plan.json";
import { loadPitchFonts } from "./pitch-fonts";
import { renderPitchPdf } from "./pitch-pdf";
import { BODY_BOX, pageText, readPdf, textsBelowBody } from "./test-pdf";

// design-spec 6.14 on the BCDX plan template with the most material each slide takes
// (five competitors, six milestones, six launch groups, three risks, three Next Actions,
// §11's table, the scenario table), every text in English or in Japanese, fitted with
// the PDF's own fonts: no slide is cut at the bottom of its body, in either deck.

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

const TEXT_TYPES = new Set(["long_text", "short_text", "choice"]);

const exact = (value: number): MetricValue => ({
  value,
  bound: "exact",
  reason: null,
});

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

const rows = <T>(count: number, row: (index: number) => T): T[] =>
  Array.from({ length: count }, (_, index) => row(index));

/**
 * Every source of both decks filled with `text`, each list at its limit or past it (§11
 * has none), from the template's `sections`.
 */
function fullest(
  variant: PitchVariant,
  text: string,
  sections = SECTIONS,
): PitchDeckInput {
  const answers = new Map<string, PlanAnswerContent>(
    sections.flatMap((section) =>
      section.questions
        .filter((question) => TEXT_TYPES.has(question.answerType))
        .map((question) => [question.key, { text, rows: null }] as const),
    ),
  );
  answers.set("P.11.1", {
    text: null,
    rows: rows(3, () => ({
      name: text,
      role: text,
      responsibilities: text,
      authority: text,
      time: text,
    })),
  });
  answers.set("P.22.1", {
    text: null,
    rows: rows(4, () => ({
      risk: text,
      probability: text,
      impact: text,
      mitigation: text,
      trigger_indicator: text,
    })),
  });
  const item = (
    fields: Pick<PitchExecutionItem, "type"> & Partial<PitchExecutionItem>,
  ): PitchExecutionItem => ({
    title: text,
    status: "todo",
    dueDate: null,
    goal: null,
    launchTiming: null,
    actions: null,
    assignee: text,
    sortOrder: 0,
    ...fields,
  });
  const execution = [
    // Overdue, so each deadline carries its days ("Oct 3, overdue 12d") and wraps in its
    // column.
    ...rows(8, (index) =>
      item({
        type: "milestone",
        goal: text,
        dueDate: `2026-10-0${index + 1}`,
        sortOrder: index,
      }),
    ),
    ...launchTimingSchema.options.flatMap((launchTiming, group) =>
      rows(2, (index) =>
        item({
          type: "launch",
          launchTiming,
          actions: text,
          sortOrder: group * 2 + index,
        }),
      ),
    ),
    ...rows(4, (index) =>
      item({ type: "next_action", dueDate: `2026-10-0${index + 1}` }),
    ),
  ];
  return {
    variant,
    source: { kind: "latest" },
    header: { businessName: text, preparedBy: text },
    date: "2026-10-01",
    generatedAt: new Date("2026-10-15T03:00:00.000Z"),
    timeZone: "Asia/Manila",
    currency: "PHP",
    sections,
    answers,
    keyMetrics: {
      selling_price: exact(1450),
      variable_cost_per_unit: exact(718.75),
      contribution_margin: exact(731.25),
      contribution_margin_rate: exact(0.5043),
      break_even_units_day: exact(116.94),
      initial_cost_total: { value: 1_269_500, bound: "lower", reason: null },
      payback_months: exact(19.17),
      simple_roi: exact(1.309),
    },
    scenarios: [
      scenario("break_even", 116.94, 3_381_000, 0),
      scenario("conservative", 85, 2_458_500, -925_586),
      scenario("expected", 150, 4_337_000, 1_118_490),
      scenario("strong", 215, 6_175_500, 2_842_565),
      scenario("capacity", 325, 9_292_500, 5_490_715),
    ],
    execution,
    competitors: rows(5, () => ({
      name: text,
      type: "direct",
      typicalPrice: 1380,
      strength: text,
    })),
    canEdit: true,
    commentCount: () => 0,
  };
}

const LANGUAGES = {
  en: {
    short: "Yes",
    long: "Offices buy gifts every month and nobody delivers them on time. ".repeat(
      60,
    ),
  },
  ja: {
    short: "はい",
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

  test("more §20 text sub-items than the notes hold: cut at the body's bottom, on its page, with the warning", async () => {
    const sections = SECTIONS.map((section) =>
      section.key === "20"
        ? {
            ...section,
            questions: [
              ...section.questions,
              ...rows(10, (index) => ({
                key: `P.20.${index + 12}`,
                title: `Added ${index}`,
                answerType: "long_text" as const,
              })),
            ],
          }
        : section,
    );
    const built = buildPitchDeck(fullest("five", LANGUAGES.en.short, sections));
    const deck = fitPitchDeck(built, fit);
    const economics = deck.slides.findIndex(
      (slide) => slide.key === "economics",
    );
    expect(deck.slides[economics]?.overflow).toBe(true);
    expect(deck.slides[economics]?.bullets).toEqual(
      built.slides[economics]?.bullets,
    );
    const pages = await pdfOf(deck);
    expect(pages).toHaveLength(13);
    // Each note keeps its line and gap as the fit measured them, rather than squeezed
    // into the body (react-pdf draws none past the page's edge).
    const notes = (pages[economics]?.texts ?? []).filter((text) =>
      text.str.startsWith("Added "),
    );
    expect(notes.length).toBeGreaterThan(1);
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
});
