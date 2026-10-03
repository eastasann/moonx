import {
  type Bound,
  createI18n,
  formatDate,
  formatInputNumber,
  formatMoney,
  formatMonths,
  formatPercent,
  formatUnits,
} from "@moonx/i18n";
import type {
  ExecutionStatus,
  ExecutionType,
  KeyMetrics,
  LaunchTiming,
  MetricValue,
  PitchDeck,
  PitchSlide,
  PitchSource,
  PitchVariant,
  ScenarioColumn,
} from "@moonx/schemas";
import { print } from "@moonx/ui-tokens/print";

const t = createI18n().t;

/** Text shown in place of an empty material; PDF and screens both print it in gray. */
export const PITCH_EMPTY_TEXT = t("plan:pitch.empty");

/** Slide keys in order (design-spec 6.14). Comment keys are `${variant}.${slideKey}`. */
export const PITCH_SLIDE_KEYS: Record<PitchVariant, string[]> = {
  one: [
    "title",
    "problem",
    "customer",
    "solution",
    "why_now",
    "business_model",
    "why_us",
    "next_step",
  ],
  five: [
    "title",
    "problem",
    "customer",
    "solution",
    "market",
    "competition",
    "business_model",
    "economics",
    "why_us",
    "execution",
    "risks",
    "ask",
  ],
};

/** An execution item (design-spec 6.13) as the deck reads it. */
export interface PitchDeckExecutionItem {
  type: ExecutionType;
  title: string;
  status: ExecutionStatus | null;
  /** "YYYY-MM-DD". */
  dueDate: string | null;
  /** Display name of the assignee (member or free text). */
  assigneeName: string | null;
  goal: string | null;
  exitCondition: string | null;
  launchTiming: LaunchTiming | null;
  actions: string | null;
  completionCriteria: string | null;
}

/** A competitor from the validation, as the deck reads it. */
export interface PitchDeckCompetitor {
  name: string;
  type: string | null;
  typicalPrice: number | null;
  strength: string | null;
  weakness: string | null;
}

/** Everything the deck is built from. The caller resolves "latest" or a version snapshot. */
export interface PitchDeckInput {
  variant: PitchVariant;
  source: PitchSource;
  generatedAt: string;
  header: {
    businessName: string;
    preparedBy: string;
    /** Version name, or "Draft". */
    versionLabel: string;
    /** "YYYY-MM-DD". */
    date: string;
  };
  currency: string;
  /** Plan answers by question key (`P.04.1` and so on). */
  answers: Record<
    string,
    { text: string | null; rows: Record<string, string | number | null>[] | null }
  >;
  keyMetrics: KeyMetrics;
  scenarios: ScenarioColumn[];
  /** The validation's top competitors, at most 5, in display order. */
  competitors: PitchDeckCompetitor[];
  /** All non-deleted execution items of the plan. */
  execution: PitchDeckExecutionItem[];
  /** Comment counts by `${variant}.${slideKey}`. */
  commentCounts: Record<string, number>;
}

// ---- Layout model shared by truncation (build) and shrinking (slideFontSizes) ----

const SLIDE = print.slide;
const CONTENT_WIDTH = SLIDE.width - 2 * SLIDE["margin-x"];
/** Height under the slide margins, the footer and the gap above the footer. */
const CONTENT_HEIGHT = SLIDE.height - 2 * SLIDE["margin-y"] - SLIDE["footer-height"] - SLIDE.gap;
const BLOCK_GAP = SLIDE.gap / 2;
const BULLET_INDENT = SLIDE.gap;
const CELL_PAD_X = (SLIDE.gap * 2) / 3;
const CELL_PAD_Y = SLIDE.gap / 3;
const BODY_LINE_HEIGHT = 1.35;
const HEADING_LINE_HEIGHT = 1.25;
/** Latin glyph width in em (design brief: about 0.55em). */
const LATIN_EM = 0.55;
/** CJK and full-width glyph width in em. */
const WIDE_EM = 1;
/** Digits of tabular figures are wider than the Latin average. */
const FIGURE_EM = 0.6;
/** Extra characters around a figure: currency symbol, bound mark and sign. */
const FIGURE_EXTRA_CHARS = 5;
/** Greedy line breaking wastes part of each line; the estimate keeps this much back. */
const WRAP_SAFETY = 1.1;
/** A table slide reserves this many lines for each note under its table. */
const TABLE_NOTE_LINES = 2;
const ELLIPSIS = "…";

const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿가-힣豈-﫿︰-﹯＀-｠￠-￦]|[\ud840-\ud87f][\udc00-\udfff]/;

function emWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += WIDE.test(ch) ? WIDE_EM : LATIN_EM;
  return width;
}

function linesNeeded(text: string, fontSize: number, width: number): number {
  return Math.max(1, Math.ceil((emWidth(text) * fontSize * WRAP_SAFETY) / width));
}

interface Truncated {
  text: string;
  cut: boolean;
}

/** Cuts `text` so that it needs at most `lines` lines, ending in "…" when something was cut. */
function truncateToLines(text: string, lines: number, fontSize: number, width: number): Truncated {
  if (linesNeeded(text, fontSize, width) <= lines) return { text, cut: false };
  const chars = Array.from(text);
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${chars.slice(0, mid).join("").trimEnd()}${ELLIPSIS}`;
    if (linesNeeded(candidate, fontSize, width) <= lines) low = mid;
    else high = mid - 1;
  }
  return { text: `${chars.slice(0, low).join("").trimEnd()}${ELLIPSIS}`, cut: true };
}

type FontSet = { heading: number; body: number; figure: number; figureLabel: number; cell: number };

const FONT = print["font-size"];

function fontsFor(type: PitchSlide["type"], step: number | "min"): FontSet {
  const pick = (size: number, min: number) =>
    step === "min" ? min : Math.max(min, size - step * SLIDE["shrink-step"]);
  switch (type) {
    case "title": {
      const t = FONT.title;
      const heading = pick(t.title, t["title-min"]);
      const body = pick(t.subtitle, t["subtitle-min"]);
      return { heading, body, figure: body, figureLabel: body, cell: body };
    }
    case "text": {
      const t = FONT.text;
      const heading = pick(t.heading, t["heading-min"]);
      const body = pick(t.bullet, t["bullet-min"]);
      return { heading, body, figure: body, figureLabel: body, cell: body };
    }
    case "number": {
      const t = FONT.number;
      const heading = pick(t.heading, t["heading-min"]);
      const figureLabel = pick(t["figure-label"], t["figure-label-min"]);
      return {
        heading,
        body: figureLabel,
        figure: pick(t.figure, t["figure-min"]),
        figureLabel,
        cell: figureLabel,
      };
    }
    case "table": {
      const t = FONT.table;
      const heading = pick(t.heading, t["heading-min"]);
      const cell = pick(t.cell, t["cell-min"]);
      return { heading, body: cell, figure: cell, figureLabel: cell, cell };
    }
  }
}

const lineBox = (size: number, lines: number) => lines * size * BODY_LINE_HEIGHT;

function headingHeight(slide: PitchSlide, fonts: FontSet): number {
  return (
    linesNeeded(slide.title, fonts.heading, CONTENT_WIDTH) * fonts.heading * HEADING_LINE_HEIGHT
  );
}

function bulletsHeight(slide: PitchSlide, fonts: FontSet, width: number): number {
  const bullets = slide.bullets ?? [];
  if (bullets.length === 0) return 0;
  const lines = bullets.map((b) => linesNeeded(b.text, fonts.body, width));
  return (
    lines.reduce((sum, n) => sum + lineBox(fonts.body, n), 0) + (bullets.length - 1) * BLOCK_GAP
  );
}

/** Columns of the number grid: one row up to two figures, otherwise two columns. */
function numberColumns(count: number): number {
  return Math.min(2, Math.max(1, count));
}

function numberCellWidth(count: number): number {
  const columns = numberColumns(count);
  return (CONTENT_WIDTH - (columns - 1) * SLIDE.gap) / columns;
}

function figureChars(value: MetricValue): number {
  if (value.value == null) return 1;
  return formatUnits(Math.abs(value.value)).length + FIGURE_EXTRA_CHARS;
}

function numbersHeight(slide: PitchSlide, fonts: FontSet): number {
  const numbers = slide.numbers ?? [];
  if (numbers.length === 0) return 0;
  const width = numberCellWidth(numbers.length);
  const rows = Math.ceil(numbers.length / numberColumns(numbers.length));
  let total = 0;
  for (let r = 0; r < rows; r++) {
    const row = numbers.slice(
      r * numberColumns(numbers.length),
      (r + 1) * numberColumns(numbers.length),
    );
    const labelLines = Math.max(...row.map((n) => linesNeeded(n.label, fonts.figureLabel, width)));
    const figureLines = Math.max(
      ...row.map((n) =>
        Math.max(1, Math.ceil((figureChars(n.value) * FIGURE_EM * fonts.figure) / width)),
      ),
    );
    total +=
      figureLines * fonts.figure * HEADING_LINE_HEIGHT + lineBox(fonts.figureLabel, labelLines);
  }
  return total + (rows - 1) * SLIDE.gap;
}

function tableColumnWidth(columns: number): number {
  return CONTENT_WIDTH / Math.max(1, columns) - CELL_PAD_X;
}

function tableRowHeight(cells: (string | null)[], fonts: FontSet, width: number): number {
  const lines = Math.max(1, ...cells.map((c) => (c ? linesNeeded(c, fonts.cell, width) : 1)));
  return lineBox(fonts.cell, lines) + CELL_PAD_Y;
}

function tableHeight(slide: PitchSlide, fonts: FontSet): number {
  if (!slide.table) return 0;
  const width = tableColumnWidth(slide.table.columns.length);
  return [slide.table.columns, ...slide.table.rows].reduce(
    (sum, cells) => sum + tableRowHeight(cells, fonts, width),
    0,
  );
}

function usedHeight(slide: PitchSlide, fonts: FontSet): number {
  const blocks: number[] = [];
  if (slide.type === "title") {
    blocks.push(headingHeight(slide, fonts));
    if (slide.subtitle) {
      blocks.push(lineBox(fonts.body, linesNeeded(slide.subtitle, fonts.body, CONTENT_WIDTH)));
    }
    if (slide.bullets?.length) blocks.push(bulletsHeight(slide, fonts, CONTENT_WIDTH));
    return blocks.reduce((a, b) => a + b, 0) + (blocks.length - 1) * BLOCK_GAP;
  }
  blocks.push(headingHeight(slide, fonts));
  if (slide.type === "number") blocks.push(numbersHeight(slide, fonts));
  if (slide.type === "table") blocks.push(tableHeight(slide, fonts));
  if (slide.bullets?.length) {
    const width = slide.type === "table" ? CONTENT_WIDTH : CONTENT_WIDTH - BULLET_INDENT;
    blocks.push(bulletsHeight(slide, fonts, width));
  }
  const body = blocks.slice(1).filter((h) => h > 0);
  return (blocks[0] ?? 0) + body.reduce((sum, h) => sum + SLIDE.gap + h, 0);
}

function fitsWith(slide: PitchSlide, fonts: FontSet): boolean {
  return usedHeight(slide, fonts) <= CONTENT_HEIGHT;
}

/** True when the slide fits at the smallest allowed font sizes (estimate). */
export function slideFitsAtMinimum(slide: PitchSlide): boolean {
  return fitsWith(slide, fontsFor(slide.type, "min"));
}

/**
 * Font sizes in px on the 960x540 base for a slide. Sizes start at the default for the slide type
 * and shrink together by the shrink-step until the estimated text fits, never below the
 * type's minimum. PDF and screens both use it so they break lines the same way. `body` is the
 * subtitle on a title slide, the bullet on a text slide, the figure label on a number slide and
 * the cell on a table slide; table columns are assumed to be of equal width.
 */
export function slideFontSizes(slide: PitchSlide): {
  heading: number;
  body: number;
  figure?: number;
  figureLabel?: number;
  cell?: number;
} {
  const min = fontsFor(slide.type, "min");
  let step = 0;
  let fonts = fontsFor(slide.type, step);
  while (!fitsWith(slide, fonts)) {
    const next = fontsFor(slide.type, step + 1);
    const same =
      next.heading === fonts.heading &&
      next.body === fonts.body &&
      next.figure === fonts.figure &&
      next.figureLabel === fonts.figureLabel &&
      next.cell === fonts.cell;
    if (same) break;
    step += 1;
    fonts = next;
  }
  // `min` guards the contract even if the token set changes shape.
  const clamp = (value: number, floor: number) => Math.max(value, floor);
  switch (slide.type) {
    case "title":
      return { heading: clamp(fonts.heading, min.heading), body: clamp(fonts.body, min.body) };
    case "text":
      return { heading: clamp(fonts.heading, min.heading), body: clamp(fonts.body, min.body) };
    case "number":
      return {
        heading: clamp(fonts.heading, min.heading),
        body: clamp(fonts.body, min.body),
        figure: clamp(fonts.figure, min.figure),
        figureLabel: clamp(fonts.figureLabel, min.figureLabel),
      };
    case "table":
      return {
        heading: clamp(fonts.heading, min.heading),
        body: clamp(fonts.body, min.body),
        cell: clamp(fonts.cell, min.cell),
      };
  }
}

// ---- Slide content ----

const PITCH_TITLE_KEYS = {
  problem: 1,
  customer: 1,
  solution: 1,
  why_now: 1,
  business_model: 1,
  why_us: 1,
  next_step: 1,
  market: 1,
  competition: 1,
  economics: 1,
  execution: 1,
  risks: 1,
  ask: 1,
};

const SLIDE_TITLES: Record<string, string> = Object.fromEntries(
  Object.keys(PITCH_TITLE_KEYS).map((key) => [key, t(`plan:pitch.title.${key}`)]),
);

const LAUNCH_TIMING_ORDER: LaunchTiming[] = [
  "t_minus_30",
  "t_minus_7",
  "launch_day",
  "first_30",
  "days_31_90",
  "other",
];

const LAUNCH_TIMING_LABEL = Object.fromEntries(
  LAUNCH_TIMING_ORDER.map((timing) => [timing, t(`plan:pitch.timing.${timing}`)]),
) as Record<LaunchTiming, string>;

const MAX_NEXT_ACTIONS = 3;
const MAX_MILESTONES = 6;
const MAX_RISKS = 3;
const MAX_COMPETITORS = 5;
const NO_VALUE = t("plan:pitch.noValue");

interface RawBullet {
  /** Material name for `emptySources`, set when the bullet is empty. */
  source: string;
  label?: string;
  text: string | null;
}

interface RawSlide {
  key: string;
  type: PitchSlide["type"];
  title: string;
  subtitle?: string | null;
  bullets?: RawBullet[];
  numbers?: PitchSlide["numbers"];
  table?: { columns: string[]; rows: (string | null)[][] };
  /** Materials missing outside the bullets (competitors, rows). */
  extraEmpty?: { source: string }[];
  editSource: number;
  editInValidation: PitchSlide["editInValidation"];
}

function normalize(text: string | null | undefined): string | null {
  if (text == null) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  return flat === "" ? null : flat;
}

function lastValueMetric(keyMetrics: KeyMetrics, key: string): MetricValue {
  return keyMetrics[key] ?? { value: null, bound: "exact", reason: "empty" };
}

function formatMetric(
  metric: MetricValue | undefined,
  format: (value: number, bound: Bound) => string,
): string {
  if (!metric || metric.value == null) return NO_VALUE;
  return format(metric.value, metric.bound);
}

const IMPACT_RANK = (value: string | number | null | undefined): number => {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (text.startsWith("h")) return 3;
  if (text.startsWith("m")) return 2;
  if (text.startsWith("l")) return 1;
  return 0;
};

/**
 * Builds the Pitch Deck (design-spec 6.14, SDD 5.9) from plan answers, key metrics and execution
 * items. Pure and deterministic: the same input gives the same deck. Text beyond what fits at the
 * type's smallest font size is cut with "…" and the slide gets `overflow: true`.
 *
 * Answer keys read (`P.{item}.{n}`): 01.1, 01.6, 03.1, 03.3, 03.4, 04.1, 04.2, 04.3, 05.1, 05.3,
 * 06.1 to 06.8, 08.1, 08.2, 08.11, 10.1 to 10.3, 11.1 (rows: name, role), 20.2, 20.10, 20.11, 22.1 (rows: risk,
 * probability, impact, mitigation), 24.1 to 24.3, 30.1 (one-minute notes), 30.2 (five-minute notes).
 * Execution items of type milestone, launch and next_action are read; done next actions are
 * skipped.
 *
 * `editSource` is the item that holds most of the slide's material: title 1, problem 4, customer 3,
 * solution 5, why_now 1 (the Blue/Mixed answer in 6 is a secondary source), market 6,
 * competition 6, business_model 8, economics 20, why_us 10, execution 23, risks 22, next_step 29
 * (one-minute) and ask 24 (the three conditions are most of the slide; 29 and 20 are secondary).
 * `editInValidation` is "economics" on business_model (price and margin drive it) and "costs" on
 * the economics slide (startup cost, payback and ROI follow from the cost rows).
 */
export function buildPitchDeck(input: PitchDeckInput): PitchDeck {
  const { variant, header, answers } = input;
  const text = (key: string) => normalize(answers[key]?.text);
  const rowsOf = (key: string) => answers[key]?.rows ?? [];
  const cellText = (value: string | number | null | undefined) =>
    normalize(value == null ? null : String(value));
  const metric = (key: string) => lastValueMetric(input.keyMetrics, key);
  const money = (value: number, bound: Bound, decimals?: 0 | 2) =>
    formatMoney(value, input.currency, { bound, decimals });
  const dateText = (due: string | null) => (due ? formatDate(due) : null);

  const nextActions = input.execution
    .filter((i) => i.type === "next_action" && i.status !== "done" && normalize(i.title))
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const da = a.item.dueDate;
      const db = b.item.dueDate;
      if (da && db) return da === db ? a.index - b.index : da < db ? -1 : 1;
      if (da) return -1;
      if (db) return 1;
      return a.index - b.index;
    })
    .slice(0, MAX_NEXT_ACTIONS)
    .map(({ item }) => item);

  const actionText = (item: PitchDeckExecutionItem) =>
    [
      normalize(item.title),
      item.dueDate ? t("plan:pitch.due", { date: formatDate(item.dueDate) }) : null,
      normalize(item.assigneeName),
    ]
      .filter(Boolean)
      .join(" · ");

  const nextActionBullets = (): RawBullet[] =>
    nextActions.length > 0
      ? nextActions.map((a) => ({
          source: t("plan:pitch.source.s29NextActions"),
          text: actionText(a),
        }))
      : [{ source: t("plan:pitch.source.s29NextActions"), text: null }];

  const bullet = (key: string, source: string, label?: string): RawBullet => ({
    source,
    label,
    text: text(key),
  });

  const base = (key: string, extra: Partial<RawSlide> & Pick<RawSlide, "type" | "editSource">) =>
    ({
      key,
      title: SLIDE_TITLES[key] ?? key,
      editInValidation: null,
      ...extra,
    }) as RawSlide;

  const titleSlide = (): RawSlide => {
    const name = normalize(header.businessName);
    const info = [
      normalize(header.preparedBy)
        ? t("plan:pitch.preparedBy", { name: normalize(header.preparedBy) })
        : null,
      formatDate(header.date),
      header.versionLabel,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      key: "title",
      type: "title",
      title: name ?? PITCH_EMPTY_TEXT,
      subtitle: text("P.01.1"),
      bullets: [
        { source: "", text: info },
        ...(text("P.01.1")
          ? []
          : [{ source: t("plan:pitch.source.s1WhatIsTheBusiness"), text: null }]),
      ],
      extraEmpty: name ? [] : [{ source: t("plan:pitch.source.businessName") }],
      editSource: 1,
      editInValidation: null,
    };
  };

  const problem = () =>
    base("problem", {
      type: "text",
      editSource: 4,
      bullets: [
        bullet("P.04.1", t("plan:pitch.source.s4PrimaryProblem")),
        bullet("P.04.2", t("plan:pitch.source.s4Frequency"), t("plan:pitch.label.frequency")),
        bullet("P.04.3", t("plan:pitch.source.s4Severity"), t("plan:pitch.label.severity")),
      ],
    });

  const customer = () =>
    base("customer", {
      type: "text",
      editSource: 3,
      bullets: [
        bullet("P.03.1", t("plan:pitch.source.s3PrimaryCustomer")),
        bullet("P.03.3", t("plan:pitch.source.s3CustomerBehavior"), t("plan:pitch.label.behavior")),
        bullet(
          "P.03.4",
          t("plan:pitch.source.s3BuyingTrigger"),
          t("plan:pitch.label.buyingTrigger"),
        ),
      ],
    });

  const solution = () =>
    base("solution", {
      type: "text",
      editSource: 5,
      bullets: [
        bullet("P.05.1", t("plan:pitch.source.s5InitialOfferAtLaunch")),
        bullet(
          "P.05.3",
          t("plan:pitch.source.s5CoreCustomerExperience"),
          t("plan:pitch.label.experience"),
        ),
      ],
    });

  const whyNow = () =>
    base("why_now", {
      type: "text",
      editSource: 1,
      bullets: [
        bullet("P.01.6", t("plan:pitch.source.s1WhyCanThisWork")),
        bullet(
          "P.06.8",
          t("plan:pitch.source.s6IfBlueMixedWhyHasNobodyCapturedIt"),
          t("plan:pitch.label.whyNobody"),
        ),
      ],
    });

  const whyUsOne = () =>
    base("why_us", {
      type: "text",
      editSource: 10,
      bullets: [
        bullet("P.10.1", t("plan:pitch.source.s10FounderAdvantages")),
        bullet(
          "P.10.2",
          t("plan:pitch.source.s10MissingCapabilities"),
          t("plan:pitch.label.missingCapabilities"),
        ),
        bullet(
          "P.10.3",
          t("plan:pitch.source.s10HowWillWeFillTheGaps"),
          t("plan:pitch.label.fillGaps"),
        ),
      ],
    });

  const nextStep = () =>
    base("next_step", {
      type: "text",
      editSource: 29,
      bullets: [
        ...nextActionBullets(),
        bullet(
          "P.24.1",
          t("plan:pitch.source.s24WeProceedToLaunchIf"),
          t("plan:pitch.label.proceedIf"),
        ),
      ],
    });

  const businessModelOne = () =>
    base("business_model", {
      type: "number",
      editSource: 8,
      editInValidation: "economics",
      bullets: [
        bullet(
          "P.08.1",
          t("plan:pitch.source.s8PrimaryRevenueStream"),
          t("plan:pitch.label.revenue"),
        ),
      ],
      numbers: [
        {
          label: t("plan:pitch.number.price"),
          metricKey: "selling_price",
          value: metric("selling_price"),
        },
        {
          label: t("plan:pitch.number.profitPerSale"),
          metricKey: "contribution_margin",
          value: metric("contribution_margin"),
        },
        {
          label: t("plan:pitch.number.breakEvenPerDay"),
          metricKey: "break_even_units_day",
          value: metric("break_even_units_day"),
        },
      ],
    });

  const market = () =>
    base("market", {
      type: "text",
      editSource: 6,
      bullets: [
        bullet("P.06.1", t("plan:pitch.source.s6MarketType"), t("plan:pitch.label.marketType")),
        bullet("P.06.2", t("plan:pitch.source.s6Why"), t("plan:pitch.label.why")),
        bullet(
          "P.06.3",
          t("plan:pitch.source.s6ReachableMarket"),
          t("plan:pitch.label.reachableMarket"),
        ),
        bullet(
          "P.06.4",
          t("plan:pitch.source.s6RequiredMarketShare"),
          t("plan:pitch.label.requiredShare"),
        ),
      ],
    });

  const competition = () => {
    const rows = input.competitors
      .slice(0, MAX_COMPETITORS)
      .map((c) => [
        normalize(c.name),
        normalize(c.type),
        c.typicalPrice == null ? null : money(c.typicalPrice, "exact"),
        normalize(c.strength),
      ]);
    return base("competition", {
      type: "table",
      editSource: 6,
      table: {
        columns: [
          t("plan:pitch.column.name"),
          t("plan:pitch.column.type"),
          t("plan:pitch.column.typicalPrice"),
          t("plan:pitch.column.strength"),
        ],
        rows,
      },
      bullets: [
        ...(rows.length === 0
          ? [{ source: t("plan:pitch.source.validationCompetitors"), text: null }]
          : []),
        bullet(
          "P.06.5",
          t("plan:pitch.source.s6KeyCompetitorsSubstitutes"),
          t("plan:pitch.label.keyCompetitors"),
        ),
        bullet(
          "P.06.7",
          t("plan:pitch.source.s6WhatMustWeDoDifferentlyOrBetter"),
          t("plan:pitch.label.ourEdge"),
        ),
      ],
    });
  };

  const businessModelFive = () =>
    base("business_model", {
      type: "number",
      editSource: 8,
      editInValidation: "economics",
      bullets: [
        bullet(
          "P.08.1",
          t("plan:pitch.source.s8PrimaryRevenueStream"),
          t("plan:pitch.label.revenue"),
        ),
        bullet(
          "P.08.2",
          t("plan:pitch.source.s8SecondaryRevenueStreams"),
          t("plan:pitch.label.secondaryRevenue"),
        ),
        bullet(
          "P.08.11",
          t("plan:pitch.source.s8WhyIsTheStartupCostJustified"),
          t("plan:pitch.label.startupJustified"),
        ),
      ],
      numbers: [
        {
          label: t("plan:pitch.number.price"),
          metricKey: "selling_price",
          value: metric("selling_price"),
        },
        {
          label: t("plan:pitch.number.variableCost"),
          metricKey: "variable_cost_per_unit",
          value: metric("variable_cost_per_unit"),
        },
        {
          label: t("plan:pitch.number.profitPerSale"),
          metricKey: "contribution_margin",
          value: metric("contribution_margin"),
        },
        {
          label: t("plan:pitch.number.margin"),
          metricKey: "contribution_margin_rate",
          value: metric("contribution_margin_rate"),
        },
      ],
    });

  const economics = () => {
    const scenario = (key: ScenarioColumn["key"]) => input.scenarios.find((s) => s.key === key);
    const columns = [
      t("plan:pitch.column.perMonth"),
      t("plan:pitch.column.conservative"),
      t("plan:pitch.column.expected"),
      t("plan:pitch.column.strong"),
    ];
    const keys = ["conservative", "expected", "strong"] as const;
    const cells = (
      pick: (s: ScenarioColumn) => MetricValue,
      format: (v: number, b: Bound) => string,
    ) =>
      keys.map((k) => {
        const s = scenario(k);
        return s ? formatMetric(pick(s), format) : NO_VALUE;
      });
    const summary = [
      t("plan:pitch.summary.startup", {
        value: formatMetric(metric("initial_cost_total"), (v, b) => money(v, b)),
      }),
      t("plan:pitch.summary.breakEven", {
        value: formatMetric(metric("break_even_units_day"), (v, b) => formatUnits(v, { bound: b })),
      }),
      t("plan:pitch.summary.payback", {
        value: formatMetric(metric("payback_months"), (v, b) => formatMonths(v, { bound: b })),
      }),
      t("plan:pitch.summary.roi", {
        value: formatMetric(metric("simple_roi"), (v, b) => formatPercent(v, { bound: b })),
      }),
    ].join(" · ");
    return base("economics", {
      type: "table",
      editSource: 20,
      editInValidation: "costs",
      table: {
        columns,
        rows: [
          [
            t("plan:pitch.row.unitsPerDay"),
            ...cells(
              (s) => s.unitsPerDay,
              (v) => formatInputNumber(v),
            ),
          ],
          [
            t("plan:pitch.label.revenue"),
            ...cells(
              (s) => s.revenue,
              (v, b) => money(v, b),
            ),
          ],
          [
            t("plan:pitch.row.operatingProfit"),
            ...cells(
              (s) => s.operatingProfit,
              (v, b) => money(v, b),
            ),
          ],
        ],
      },
      bullets: [
        { source: "", text: summary },
        bullet(
          "P.20.2",
          t("plan:pitch.source.s20OpeningCashReserve"),
          t("plan:pitch.label.openingCash"),
        ),
        bullet(
          "P.20.10",
          t("plan:pitch.source.s20RunwayIfSalesAreBelowPlan"),
          t("plan:pitch.label.runway"),
        ),
        bullet(
          "P.20.11",
          t("plan:pitch.source.s20TriggerForAdditionalFunding"),
          t("plan:pitch.label.fundingTrigger"),
        ),
      ],
    });
  };

  const whyUsFive = () => {
    const founders = rowsOf("P.11.1")
      .map((r) => [cellText(r.name), cellText(r.role)] as const)
      .filter(([name, role]) => name || role)
      .map(([name, role]) => [name, role].filter(Boolean).join(" — "));
    return base("why_us", {
      type: "text",
      editSource: 10,
      bullets: [
        bullet("P.10.1", t("plan:pitch.source.s10FounderAdvantages")),
        bullet(
          "P.10.2",
          t("plan:pitch.source.s10MissingCapabilities"),
          t("plan:pitch.label.missingCapabilities"),
        ),
        bullet(
          "P.10.3",
          t("plan:pitch.source.s10HowWillWeFillTheGaps"),
          t("plan:pitch.label.fillGaps"),
        ),
        {
          source: t("plan:pitch.source.s11Founders"),
          label: t("plan:pitch.label.founders"),
          text: founders.length > 0 ? founders.join("; ") : null,
        },
      ],
    });
  };

  const execution = () => {
    const byDue = (a: { due: string | null; index: number }, b: typeof a) => {
      if (a.due && b.due) return a.due === b.due ? a.index - b.index : a.due < b.due ? -1 : 1;
      if (a.due) return -1;
      if (b.due) return 1;
      return a.index - b.index;
    };
    const milestones = input.execution
      .filter((i) => i.type === "milestone" && normalize(i.title))
      .map((item, index) => ({ item, index, due: item.dueDate }))
      .sort(byDue)
      .slice(0, MAX_MILESTONES)
      .map(({ item }) => [
        normalize(item.title),
        normalize(item.goal),
        dateText(item.dueDate),
        normalize(item.assigneeName),
      ]);
    const launch = input.execution.filter((i) => i.type === "launch");
    const launchRows = LAUNCH_TIMING_ORDER.flatMap((timing) => {
      const group = launch.filter((i) => (i.launchTiming ?? "other") === timing);
      if (group.length === 0) return [];
      const actions = group
        .map((i) => normalize(i.actions) ?? normalize(i.title))
        .filter((a): a is string => a != null)
        .join("; ");
      const dues = group
        .map((i) => i.dueDate)
        .filter((d): d is string => d != null)
        .sort();
      const assignees = [
        ...new Set(group.map((i) => normalize(i.assigneeName)).filter((a): a is string => !!a)),
      ];
      return [
        [
          LAUNCH_TIMING_LABEL[timing],
          actions || null,
          dateText(dues[0] ?? null),
          assignees.length > 0 ? assignees.join(", ") : null,
        ],
      ];
    });
    const empty: RawBullet[] = [];
    if (milestones.length === 0)
      empty.push({ source: t("plan:pitch.source.s23PreLaunchMilestones"), text: null });
    if (launchRows.length === 0)
      empty.push({ source: t("plan:pitch.source.s25LaunchPlan"), text: null });
    return base("execution", {
      type: "table",
      editSource: 23,
      table: {
        columns: [
          t("plan:pitch.column.milestoneTiming"),
          t("plan:pitch.column.goalActions"),
          t("plan:pitch.column.due"),
          t("plan:pitch.column.assignee"),
        ],
        rows: [...milestones, ...launchRows],
      },
      bullets: empty,
    });
  };

  const risks = () => {
    const rows = rowsOf("P.22.1")
      .map((r, index) => ({ r, index }))
      .filter(({ r }) => cellText(r.risk))
      .sort(
        (a, b) =>
          IMPACT_RANK(b.r.impact) - IMPACT_RANK(a.r.impact) ||
          IMPACT_RANK(b.r.probability) - IMPACT_RANK(a.r.probability) ||
          a.index - b.index,
      )
      .slice(0, MAX_RISKS)
      .map(({ r }) => [
        cellText(r.risk),
        cellText(r.probability),
        cellText(r.impact),
        cellText(r.mitigation),
      ]);
    return base("risks", {
      type: "table",
      editSource: 22,
      table: {
        columns: [
          t("plan:pitch.column.risk"),
          t("plan:pitch.column.probability"),
          t("plan:pitch.column.impact"),
          t("plan:pitch.column.mitigation"),
        ],
        rows,
      },
      bullets:
        rows.length === 0 ? [{ source: t("plan:pitch.source.s22KeyRisks"), text: null }] : [],
    });
  };

  const ask = () =>
    base("ask", {
      type: "text",
      editSource: 24,
      bullets: [
        bullet(
          "P.24.1",
          t("plan:pitch.source.s24WeProceedToLaunchIf"),
          t("plan:pitch.label.proceedIf"),
        ),
        bullet("P.24.2", t("plan:pitch.source.s24WeDelayIf"), t("plan:pitch.label.delayIf")),
        bullet("P.24.3", t("plan:pitch.source.s24WeStopAbandonIf"), t("plan:pitch.label.stopIf")),
        nextActions.length > 0
          ? {
              source: t("plan:pitch.source.s29NextActions"),
              label: t("plan:pitch.label.nextActions"),
              text: nextActions.map(actionText).join("; "),
            }
          : { source: t("plan:pitch.source.s29NextActions"), text: null },
        bullet(
          "P.20.11",
          t("plan:pitch.source.s20TriggerForAdditionalFunding"),
          t("plan:pitch.label.fundingTrigger"),
        ),
      ],
    });

  const raws: Record<string, () => RawSlide> = {
    title: titleSlide,
    problem,
    customer,
    solution,
    why_now: whyNow,
    business_model: variant === "one" ? businessModelOne : businessModelFive,
    why_us: variant === "one" ? whyUsOne : whyUsFive,
    next_step: nextStep,
    market,
    competition,
    economics,
    execution,
    risks,
    ask,
  };

  const slides = PITCH_SLIDE_KEYS[variant].map((key) =>
    finishSlide(raws[key]?.() as RawSlide, input.commentCounts[`${variant}.${key}`] ?? 0),
  );

  return {
    variant,
    source: input.source,
    businessName: header.businessName,
    generatedAt: input.generatedAt,
    footer: {
      businessName: header.businessName,
      versionLabel: header.versionLabel,
      date: header.date,
    },
    speakerNotes: text(variant === "one" ? "P.30.1" : "P.30.2"),
    slides,
  };
}

/** Per-block line budget at the minimum font sizes, given the room left under the heading. */
function evenLines(room: number, blocks: number, lineHeight: number, gap: number): number {
  if (blocks === 0) return 1;
  return Math.max(1, Math.floor((room - (blocks - 1) * gap) / blocks / lineHeight));
}

/** Turns raw content into a `PitchSlide`, cutting text to the budgets of the slide's type. */
function finishSlide(raw: RawSlide, commentCount: number): PitchSlide {
  const fonts = fontsFor(raw.type, "min");
  const emptySources: string[] = (raw.extraEmpty ?? []).map((e) => e.source);
  let overflow = false;
  const cut = (value: string, lines: number, size: number, width: number) => {
    const result = truncateToLines(value, lines, size, width);
    if (result.cut) overflow = true;
    return result.text;
  };

  const provisional: PitchSlide = {
    key: raw.key,
    type: raw.type,
    title: raw.title,
    emptySources: [],
    overflow: false,
    editSource: { itemNo: raw.editSource },
    editInValidation: raw.editInValidation,
    commentCount,
  };
  const rawBullets = raw.bullets ?? [];
  const bulletWidth =
    raw.type === "text" || raw.type === "number" ? CONTENT_WIDTH - BULLET_INDENT : CONTENT_WIDTH;

  let title = raw.title;
  let subtitle = raw.subtitle ?? null;
  let bullets: PitchSlide["bullets"];

  const makeBullets = (lineFor: (b: RawBullet) => number) => {
    const out: { text: string; empty: boolean }[] = [];
    for (const b of rawBullets) {
      if (b.text == null) {
        emptySources.push(b.source);
        out.push({ text: PITCH_EMPTY_TEXT, empty: true });
        continue;
      }
      const full = b.label ? `${b.label}: ${b.text}` : b.text;
      out.push({ text: cut(full, lineFor(b), fonts.body, bulletWidth), empty: false });
    }
    return out;
  };

  if (raw.type === "title") {
    title = cut(raw.title, 2, fonts.heading, CONTENT_WIDTH);
    subtitle = subtitle ? cut(subtitle, 3, fonts.body, CONTENT_WIDTH) : null;
    bullets = makeBullets(() => 2);
  } else {
    const heading =
      linesNeeded(raw.title, fonts.heading, CONTENT_WIDTH) * fonts.heading * HEADING_LINE_HEIGHT;
    const room = CONTENT_HEIGHT - heading - SLIDE.gap;
    if (raw.type === "text") {
      const lines = evenLines(room, rawBullets.length, fonts.body * BODY_LINE_HEIGHT, BLOCK_GAP);
      bullets = makeBullets(() => lines);
    } else if (raw.type === "number") {
      const grid = numbersHeight({ ...provisional, numbers: raw.numbers }, fonts);
      const left = room - grid - (rawBullets.length > 0 ? SLIDE.gap : 0);
      const lines = evenLines(left, rawBullets.length, fonts.body * BODY_LINE_HEIGHT, BLOCK_GAP);
      bullets = makeBullets(() => lines);
    } else {
      bullets = makeBullets(noteLines);
    }
  }

  let table = raw.table;
  if (table && raw.type === "table") {
    const noteHeight =
      rawBullets.reduce((sum, b) => sum + lineBox(fonts.body, noteLines(b)), 0) +
      Math.max(0, rawBullets.length - 1) * BLOCK_GAP;
    const width = tableColumnWidth(table.columns.length);
    const header = tableRowHeight(table.columns, fonts, width);
    const room = CONTENT_HEIGHT - headingHeight({ ...provisional, title }, fonts) - SLIDE.gap;
    const tableRoom = room - (rawBullets.length > 0 ? SLIDE.gap + noteHeight : 0) - header;
    const perRow = table.rows.length === 0 ? 0 : tableRoom / table.rows.length;
    const lines = Math.max(1, Math.floor((perRow - CELL_PAD_Y) / (fonts.cell * BODY_LINE_HEIGHT)));
    table = {
      columns: table.columns,
      rows: table.rows.map((row) =>
        row.map((cell) => (cell == null ? null : cut(cell, lines, fonts.cell, width))),
      ),
    };
  }

  return {
    ...provisional,
    title,
    subtitle,
    ...(bullets && bullets.length > 0 ? { bullets } : {}),
    ...(raw.numbers ? { numbers: raw.numbers } : {}),
    ...(table ? { table } : {}),
    emptySources,
    overflow,
  };
}

function noteLines(b: RawBullet): number {
  return b.text == null ? 1 : TABLE_NOTE_LINES;
}
