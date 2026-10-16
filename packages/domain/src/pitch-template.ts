import {
  launchTimingSchema,
  type MetricValue,
  type PitchSlideKey,
  type PitchVariant,
  pitchVariantSchema,
  type ScenarioColumn,
} from "@moonx/schemas";
import {
  buildPitchDeck,
  type PitchDeckInput,
  type PitchExecutionItem,
  type PitchSection,
} from "./pitch";
import { type FitOptions, pitchSlideCutAtBottom } from "./pitch-fit";
import type { PlanAnswerContent } from "./plan";

// Whether a plan template's Pitch Deck fits the most material (design-spec 6.14, SDD 5.13
// AD6 `pitch_deck_overflow`). A cut leaves each text one line (two with CJK in it) and its
// whole label, at the smallest sizes, so a slide is cut at its bottom when even those do
// not fit: what the template decides (its sub-items and their titles) and the lists at
// their limits, not the length of the answers. Numbers stay in the range 6.14 gives, where
// none wraps.

/** Texts that take one line at the smallest sizes, in English and in Japanese. */
export const PITCH_SHORT_TEXTS = { en: "Yes", ja: "はい" } as const;

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
 * The deck input with every source of both decks filled with `text` and each list at its
 * limit or past it (§11 has none), on a plan of `sections`: five competitors, more
 * milestones, risks and Next Actions than a slide takes, two launch rows in each timing,
 * three founders. Deadlines are overdue, so each carries its days.
 */
export function fullestPitchDeckInput(
  variant: PitchVariant,
  text: string,
  sections: readonly PitchSection[],
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

/** A slide of a plan template's deck that the most material runs past the bottom of. */
export interface PitchTemplateOverflow {
  variant: PitchVariant;
  slide: PitchSlideKey;
  /** The plan item its Edit source goes to (design-spec 6.14). */
  itemNo: number;
}

/**
 * The slides of the one- and five-minute decks of a plan template of `sections` that
 * are cut at the bottom of their body on the most material ({@link
 * fullestPitchDeckInput}), with English or with Japanese texts: once each, one-minute
 * deck first, in slide order.
 */
export function pitchTemplateOverflows(
  sections: readonly PitchSection[],
  options: Omit<FitOptions, "currency">,
): PitchTemplateOverflow[] {
  return pitchVariantSchema.options.flatMap((variant) => {
    const decks = Object.values(PITCH_SHORT_TEXTS).map((text) => {
      const input = fullestPitchDeckInput(variant, text, sections);
      return {
        slides: buildPitchDeck(input).slides,
        fit: { ...options, currency: input.currency },
      };
    });
    return (decks[0]?.slides ?? []).flatMap((slide, index) => {
      const cut = decks.some(({ slides, fit }) => {
        const same = slides[index];
        return same !== undefined && pitchSlideCutAtBottom(same, fit);
      });
      if (!cut) return [];
      if (slide.editSource === null)
        throw new Error(`The ${slide.key} slide has no Edit source`);
      return [{ variant, slide: slide.key, itemNo: slide.editSource.itemNo }];
    });
  });
}
