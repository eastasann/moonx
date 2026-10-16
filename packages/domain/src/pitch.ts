import {
  formatDate,
  formatInputNumber,
  formatMoney,
  formatMonths,
  formatOverdue,
  formatPercent,
  formatUnits,
  i18n,
  type resources,
} from "@moonx/i18n";
import {
  type AnswerType,
  type CompetitorType,
  type DateOnly,
  type ExecutionStatus,
  type ExecutionType,
  type KeyMetrics,
  type LaunchTiming,
  launchTimingSchema,
  type MetricValue,
  type PitchBullet,
  type PitchDeck,
  type PitchSlide,
  type PitchSlideKey,
  type PitchTableColumn,
  type PitchText,
  type PitchVariant,
  type PlanTableRow,
  type ScenarioColumn,
  type ScenarioKey,
} from "@moonx/schemas";
import {
  COST_ROW_METRIC_PREFIX,
  type KeyMetricKey,
  keyMetricOf,
} from "./economics";
import { hasText } from "./fau";
import type { PlanAnswerContent } from "./plan";

// The Pitch Deck of design-spec 6.14: which plan sub-items, validation numbers and lists
// each slide of the one- and five-minute decks shows, built the same for 23 and the PDF
// (ADR-012). The sources are the BCDX plan template's question IDs; a source the plan's
// template does not have shows "Not written yet" under its ID.

/** A plan sub-item as the deck names and finds it. */
export interface PitchQuestion {
  key: string;
  title: string;
  answerType: AnswerType;
}

/** A plan item (§1–§30) of the plan's template. */
export interface PitchSection {
  key: string;
  questions: readonly PitchQuestion[];
}

/** An execution item that is not deleted, its assignee by name. */
export interface PitchExecutionItem {
  type: ExecutionType;
  title: string;
  status: ExecutionStatus | null;
  dueDate: DateOnly | null;
  goal: string | null;
  launchTiming: LaunchTiming | null;
  actions: string | null;
  /** A member's display name or the name written in; null without an assignee. */
  assignee: string | null;
  sortOrder: number;
}

/** A competitor of 15, in the order 15 lists them. */
export interface PitchCompetitor {
  name: string;
  type: CompetitorType | null;
  typicalPrice: number | null;
  strength: string | null;
}

/** What a deck is built from: the plan now or a saved version (design-spec 6.14). */
export interface PitchDeckInput {
  variant: PitchVariant;
  source: PitchDeck["source"];
  header: { businessName: string; preparedBy: string };
  /** The day of the content: the plan's last change, or the version's save. */
  date: DateOnly;
  generatedAt: Date;
  /** The caller's time zone, which decides whether a date shows its year. */
  timeZone: string;
  currency: string;
  sections: readonly PitchSection[];
  answers: ReadonlyMap<string, PlanAnswerContent>;
  keyMetrics: KeyMetrics;
  scenarios: readonly ScenarioColumn[];
  execution: readonly PitchExecutionItem[];
  /** At most five, in 15's order. */
  competitors: readonly PitchCompetitor[];
  /** Owner or Member, on the plan now, neither plan nor idea archived. */
  canEdit: boolean;
  /** The comments on the slide `{variant}.{key}`. */
  commentCount: (target: string) => number;
}

// ---- Numbers ----

type MetricFormat =
  | "money"
  | "cents"
  | "percent"
  | "units"
  | "input"
  | "months";

/** How each key metric shows (design-spec 6.4「端数」). */
const METRIC_FORMATS: Record<KeyMetricKey, MetricFormat> = {
  initial_cost_total: "money",
  monthly_fixed_total: "money",
  variable_cost_per_unit: "cents",
  selling_price: "money",
  contribution_margin: "cents",
  contribution_margin_rate: "percent",
  break_even_units_month: "units",
  break_even_units_day: "units",
  break_even_revenue: "money",
  target_margin_units_month: "units",
  expected_revenue: "money",
  expected_operating_profit: "money",
  payback_months: "months",
  simple_roi: "percent",
  capacity_units_day: "input",
  operating_days: "input",
};

const formatAs = (
  format: MetricFormat,
  metric: MetricValue,
  currency: string,
): string => {
  if (metric.value === null) {
    return i18n.t(`common:metricReason.${metric.reason ?? "none"}`);
  }
  const bound = { bound: metric.bound };
  switch (format) {
    case "money":
      return formatMoney(metric.value, currency, bound);
    case "cents":
      return formatMoney(metric.value, currency, { ...bound, cents: true });
    case "percent":
      return formatPercent(metric.value, bound);
    case "units":
      return formatUnits(metric.value, bound);
    case "input":
      return formatInputNumber(metric.value);
    case "months":
      return formatMonths(metric.value, bound);
  }
};

/**
 * A key metric as design-spec 6.4 shows it, as the deck's figures are printed: the value
 * in its format with its bound, or why it has none.
 *
 * @throws {Error} for a key that is not a single-value key metric
 */
export const formatMetric = (
  key: string,
  metric: MetricValue,
  currency: string,
): string => {
  if (key.startsWith(COST_ROW_METRIC_PREFIX)) {
    return formatAs("money", metric, currency);
  }
  const format = METRIC_FORMATS[key as KeyMetricKey] as
    | MetricFormat
    | undefined;
  if (format === undefined) throw new Error(`No key metric ${key}`);
  return formatAs(format, metric, currency);
};

// ---- Slides ----

type BulletSource =
  /** A text sub-item. */
  | { kind: "answer"; key: string }
  /**
   * The text sub-items of an item, in template order (§8, §20). With `none`, a template
   * with no such sub-item shows one bullet named by that slide, as Not written yet.
   */
  | { kind: "texts"; section: string; none?: HeadedSlideKey }
  /** §29: open Next Actions, soonest first, in one bullet. */
  | { kind: "next_actions" }
  /** §11: the founders as "Name (Role)", in one bullet. */
  | { kind: "founders" }
  /** §25: the launch rows' actions, one bullet per timing. */
  | { kind: "launch" };

/** The metrics a deck shows as figures, each with its label in the catalog. */
type PitchNumberKey = keyof (typeof resources)["en"]["pitch"]["number"];

/** Every slide but the title, whose heading is the Business Name. */
type HeadedSlideKey = Exclude<PitchSlideKey, "title">;

type TableSource = "competitors" | "scenarios" | "milestones" | "risks";

interface SlideSpec {
  key: PitchSlideKey;
  type: PitchSlide["type"];
  /** Where Edit source goes (design-spec 6.14). */
  itemNo: number;
  editInValidation?: "costs" | "economics";
  bullets?: readonly BulletSource[];
  numbers?: readonly PitchNumberKey[];
  table?: TableSource;
}

const answer = (key: string): BulletSource => ({ kind: "answer", key });
const answers = (...keys: string[]) => keys.map(answer);

/** The sub-items each source of design-spec 6.14 reads. */
const KEYS = {
  business: "P.01.1",
  whyWork: "P.01.6",
  founders: "P.11.1",
  risks: "P.22.1",
  milestones: "P.23.1",
  launch: "P.25.1",
  nextActions: "P.29.1",
  oneMinute: "P.30.1",
  fiveMinute: "P.30.2",
} as const;

const TITLE: SlideSpec = { key: "title", type: "title", itemNo: 1 };

const SLIDES: Record<PitchVariant, readonly SlideSpec[]> = {
  one: [
    TITLE,
    {
      key: "problem",
      type: "text",
      itemNo: 4,
      bullets: answers("P.04.1", "P.04.2", "P.04.3"),
    },
    {
      key: "customer",
      type: "text",
      itemNo: 3,
      bullets: answers("P.03.1", "P.03.3", "P.03.4"),
    },
    {
      key: "solution",
      type: "text",
      itemNo: 5,
      bullets: answers("P.05.1", "P.05.3"),
    },
    {
      key: "why_now",
      type: "text",
      itemNo: 1,
      bullets: answers(KEYS.whyWork, "P.06.8"),
    },
    {
      key: "business_model",
      type: "number",
      itemNo: 8,
      editInValidation: "economics",
      numbers: ["selling_price", "contribution_margin", "break_even_units_day"],
      bullets: answers("P.08.1"),
    },
    // Only Founder advantages (design-spec 6.14, the user's decision of 2026-10-03).
    { key: "why_us", type: "text", itemNo: 10, bullets: answers("P.10.1") },
    {
      key: "next_step",
      type: "text",
      itemNo: 29,
      bullets: [{ kind: "next_actions" }, answer("P.24.1")],
    },
  ],
  five: [
    TITLE,
    {
      key: "problem",
      type: "text",
      itemNo: 4,
      bullets: answers("P.04.1", "P.04.2", "P.04.3", "P.04.4", "P.04.5"),
    },
    {
      key: "customer",
      type: "text",
      itemNo: 3,
      bullets: answers("P.03.1", "P.03.2", "P.03.3", "P.03.4", "P.03.5"),
    },
    {
      key: "solution",
      type: "text",
      itemNo: 5,
      bullets: answers("P.05.1", "P.05.2", "P.05.3", "P.05.4", "P.05.5"),
    },
    {
      key: "market",
      type: "text",
      itemNo: 6,
      bullets: answers("P.06.1", "P.06.2", "P.06.3", "P.06.4"),
    },
    {
      key: "competition",
      type: "table",
      itemNo: 6,
      table: "competitors",
      bullets: answers("P.06.5", "P.06.7"),
    },
    {
      key: "business_model",
      type: "number",
      itemNo: 8,
      editInValidation: "economics",
      numbers: [
        "selling_price",
        "variable_cost_per_unit",
        "contribution_margin",
        "contribution_margin_rate",
      ],
      bullets: [{ kind: "texts", section: "08" }],
    },
    // Two slides: wide or missing figures over the scenario table leave §20's notes no
    // room (design-spec 6.14, the user's decision of 2026-10-16).
    {
      key: "economics",
      type: "table",
      itemNo: 20,
      editInValidation: "costs",
      numbers: [
        "initial_cost_total",
        "break_even_units_day",
        "payback_months",
        "simple_roi",
      ],
      table: "scenarios",
    },
    {
      key: "funding",
      type: "text",
      itemNo: 20,
      bullets: [{ kind: "texts", section: "20", none: "funding" }],
    },
    {
      key: "why_us",
      type: "text",
      itemNo: 10,
      bullets: [...answers("P.10.1", "P.10.2", "P.10.3"), { kind: "founders" }],
    },
    // Two slides: six milestones and six launch groups do not fit one (design-spec
    // 6.14, the user's decision of 2026-10-16).
    { key: "execution", type: "table", itemNo: 23, table: "milestones" },
    { key: "launch", type: "text", itemNo: 25, bullets: [{ kind: "launch" }] },
    { key: "risks", type: "table", itemNo: 22, table: "risks" },
    {
      key: "ask",
      type: "text",
      itemNo: 24,
      bullets: [
        ...answers("P.24.1", "P.24.2", "P.24.3"),
        { kind: "next_actions" },
        answer("P.20.11"),
      ],
    },
  ],
};

/** At most this many of each list (design-spec 6.14). */
const LIMITS = { nextActions: 3, milestones: 6, risks: 3 } as const;

const TEXT_TYPES: ReadonlySet<AnswerType> = new Set([
  "long_text",
  "short_text",
  "choice",
]);

/** §22's Probability and Impact, highest first; other text ranks last. */
const LEVEL_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
const levelRank = (value: string | number | null | undefined) =>
  typeof value === "string" ? (LEVEL_RANK[value.trim().toLowerCase()] ?? 0) : 0;

const SCENARIO_ROWS: readonly ScenarioKey[] = [
  "conservative",
  "expected",
  "strong",
];

const notWritten = (): PitchText => ({
  text: i18n.t("pitch:notWrittenYet"),
  empty: true,
});

const column = (
  key: keyof (typeof resources)["en"]["pitch"]["column"],
  width: number,
  numeric = false,
): PitchTableColumn => ({
  label: i18n.t(`pitch:column.${key}`),
  numeric,
  width,
});

const cellText = (value: string | number | null | undefined) =>
  value === null || value === undefined
    ? null
    : typeof value === "number"
      ? String(value)
      : hasText(value)
        ? value
        : null;

/** By due date, none last, then in the order the user gave them. */
const byDueDate = (a: PitchExecutionItem, b: PitchExecutionItem) => {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.sortOrder - b.sortOrder;
};

/** Builds the slides of one variant from `input` (design-spec 6.14). */
class DeckBuilder {
  private readonly questions: ReadonlyMap<string, PitchQuestion>;
  private readonly separator = i18n.t("pitch:separator");

  constructor(private readonly input: PitchDeckInput) {
    this.questions = new Map(
      input.sections.flatMap((section) =>
        section.questions.map((question) => [question.key, question] as const),
      ),
    );
  }

  /** A sub-item's title, or its ID when the plan's template does not have it. */
  private sourceName(key: string) {
    return this.questions.get(key)?.title ?? key;
  }

  /** A text sub-item's answer, or null when it is blank or not in the template. */
  private text(key: string): string | null {
    if (!this.questions.has(key)) return null;
    const text = this.input.answers.get(key)?.text ?? null;
    return hasText(text) ? text : null;
  }

  private rows(key: string): PlanTableRow[] {
    if (!this.questions.has(key)) return [];
    return this.input.answers.get(key)?.rows ?? [];
  }

  /** A deadline, with how long it is overdue unless done (design-spec 1.2). */
  private deadline(item: PitchExecutionItem & { dueDate: DateOnly }) {
    const date = this.date(item.dueDate);
    const overdue =
      item.status === "done" || item.status === "resolved"
        ? null
        : formatOverdue(item.dueDate, {
            timeZone: this.input.timeZone,
            now: this.input.generatedAt,
          });
    return overdue === null
      ? date
      : i18n.t("pitch:overdueDeadline", { date, overdue });
  }

  private date(date: DateOnly) {
    return formatDate(date, {
      timeZone: this.input.timeZone,
      now: this.input.generatedAt,
    });
  }

  private filled(label: string, text: string | null): PitchBullet {
    return text === null
      ? { label, ...notWritten() }
      : { label, text, empty: false };
  }

  private bullets(source: BulletSource): PitchBullet[] {
    switch (source.kind) {
      case "answer":
        return [
          this.filled(this.sourceName(source.key), this.text(source.key)),
        ];
      case "texts": {
        const texts =
          this.input.sections
            .find((section) => section.key === source.section)
            ?.questions.filter((question) =>
              TEXT_TYPES.has(question.answerType),
            )
            .map((question) =>
              this.filled(question.title, this.text(question.key)),
            ) ?? [];
        return texts.length === 0 && source.none !== undefined
          ? [this.filled(i18n.t(`pitch:slide.${source.none}`), null)]
          : texts;
      }
      case "next_actions": {
        const open = this.input.execution
          .filter(
            (item) => item.type === "next_action" && item.status !== "done",
          )
          .toSorted(byDueDate)
          .slice(0, LIMITS.nextActions)
          .map((item) =>
            item.dueDate === null
              ? item.title
              : i18n.t("pitch:dated", {
                  text: item.title,
                  date: this.deadline({ ...item, dueDate: item.dueDate }),
                }),
          );
        return [
          this.filled(
            this.sourceName(KEYS.nextActions),
            open.length === 0 ? null : open.join(this.separator),
          ),
        ];
      }
      case "founders": {
        const names = this.rows(KEYS.founders).flatMap((row) => {
          const name = cellText(row.name);
          const role = cellText(row.role);
          if (name !== null && role !== null)
            return [i18n.t("pitch:founder", { name, role })];
          return name !== null ? [name] : role !== null ? [role] : [];
        });
        return [
          this.filled(
            this.sourceName(KEYS.founders),
            names.length === 0 ? null : names.join(this.separator),
          ),
        ];
      }
      case "launch": {
        const rows = this.input.execution
          .filter((item) => item.type === "launch")
          .toSorted((a, b) => a.sortOrder - b.sortOrder);
        // By timing, named by the timing and not the editable Timing text (6.14).
        const groups = launchTimingSchema.options.flatMap((timing) => {
          const actions = rows
            .filter((item) => (item.launchTiming ?? "other") === timing)
            .flatMap((item) => (hasText(item.actions) ? [item.actions] : []));
          return actions.length === 0
            ? []
            : [
                {
                  label: i18n.t(`common:launchTiming.${timing}`),
                  text: actions.join(this.separator),
                  empty: false,
                },
              ];
        });
        return groups.length > 0
          ? groups
          : [this.filled(this.sourceName(KEYS.launch), null)];
      }
    }
  }

  private table(source: TableSource): {
    table: NonNullable<PitchSlide["table"]>;
    emptySource: string | null;
  } {
    const { currency } = this.input;
    switch (source) {
      case "competitors":
        return {
          table: {
            columns: [
              column("name", 0.25),
              column("type", 0.18),
              column("price", 0.15, true),
              column("strength", 0.42),
            ],
            rows: this.input.competitors.map((competitor) => [
              competitor.name,
              competitor.type === null
                ? null
                : i18n.t(`common:competitorType.${competitor.type}`),
              competitor.typicalPrice === null
                ? null
                : formatMoney(competitor.typicalPrice, currency),
              cellText(competitor.strength),
            ]),
          },
          emptySource: i18n.t("pitch:source.competitors"),
        };
      case "scenarios":
        return {
          table: {
            columns: [
              column("scenario", 0.28),
              column("unitsPerDay", 0.2, true),
              column("revenue", 0.26, true),
              column("operatingProfit", 0.26, true),
            ],
            rows: SCENARIO_ROWS.map((key) => {
              // EconomicsResult.scenarios always has all five columns.
              const scenario = this.input.scenarios.find(
                (candidate) => candidate.key === key,
              );
              if (scenario === undefined) throw new Error(`No scenario ${key}`);
              return [
                i18n.t(`common:scenario.${key}`),
                // A scenario's daily sales are typed, so they show as typed (6.4).
                formatAs("input", scenario.unitsPerDay, currency),
                formatAs("money", scenario.revenue, currency),
                formatAs("money", scenario.operatingProfit, currency),
              ];
            }),
          },
          emptySource: null,
        };
      case "milestones":
        return {
          table: {
            columns: [
              column("milestone", 0.22),
              column("goal", 0.34),
              column("assignee", 0.16),
              column("deadline", 0.14),
              column("status", 0.14),
            ],
            rows: this.input.execution
              .filter((item) => item.type === "milestone")
              .toSorted(byDueDate)
              .slice(0, LIMITS.milestones)
              .map((item) => [
                item.title,
                cellText(item.goal),
                item.assignee,
                item.dueDate === null
                  ? null
                  : this.deadline({ ...item, dueDate: item.dueDate }),
                item.status === null
                  ? null
                  : i18n.t(`common:executionStatus.${item.status}`),
              ]),
          },
          emptySource: this.sourceName(KEYS.milestones),
        };
      case "risks":
        return {
          table: {
            columns: [
              column("risk", 0.34),
              column("probability", 0.13),
              column("impact", 0.13),
              column("mitigation", 0.4),
            ],
            rows: this.rows(KEYS.risks)
              .map((row, index) => ({ row, index }))
              .toSorted(
                (a, b) =>
                  levelRank(b.row.impact) - levelRank(a.row.impact) ||
                  levelRank(b.row.probability) - levelRank(a.row.probability) ||
                  a.index - b.index,
              )
              .slice(0, LIMITS.risks)
              .map(({ row }) => [
                cellText(row.risk),
                cellText(row.probability),
                cellText(row.impact),
                cellText(row.mitigation),
              ]),
          },
          emptySource: this.sourceName(KEYS.risks),
        };
    }
  }

  private slide(spec: SlideSpec): PitchSlide {
    const { input } = this;
    const emptySources: string[] = [];
    const track = <T extends PitchText>(text: T, name: string): T => {
      if (text.empty) emptySources.push(name);
      return text;
    };

    let title: PitchText;
    let subtitle: PitchText | null = null;
    let bullets: PitchBullet[];
    if (spec.type === "title") {
      const businessName = input.header.businessName;
      const businessNameLabel = i18n.t("pitch:source.businessName");
      title = track(
        hasText(businessName)
          ? { text: businessName, empty: false }
          : notWritten(),
        businessNameLabel,
      );
      const business = this.text(KEYS.business);
      subtitle = track(
        business === null ? notWritten() : { text: business, empty: false },
        this.sourceName(KEYS.business),
      );
      const preparedBy = i18n.t("pitch:meta.preparedBy");
      bullets = [
        track(
          this.filled(
            preparedBy,
            hasText(input.header.preparedBy) ? input.header.preparedBy : null,
          ),
          preparedBy,
        ),
        {
          label: i18n.t("pitch:meta.date"),
          text: this.date(input.date),
          empty: false,
        },
        {
          label: i18n.t("pitch:meta.version"),
          text: versionLabel(input.source),
          empty: false,
        },
      ];
    } else {
      title = {
        text: i18n.t(`pitch:slide.${spec.key as HeadedSlideKey}`),
        empty: false,
      };
      bullets = (spec.bullets ?? [])
        .flatMap((source) => this.bullets(source))
        .map((bullet) => track(bullet, bullet.label));
    }

    let table: PitchSlide["table"] = null;
    if (spec.table !== undefined) {
      const built = this.table(spec.table);
      table = built.table;
      if (table.rows.length === 0 && built.emptySource !== null) {
        emptySources.push(built.emptySource);
      }
    }

    const target = `${input.variant}.${spec.key}`;
    return {
      key: spec.key,
      type: spec.type,
      title,
      subtitle,
      bullets,
      numbers: (spec.numbers ?? []).map((metricKey) => ({
        label: i18n.t(`pitch:number.${metricKey}`),
        metricKey,
        value: keyMetricOf(input.keyMetrics, metricKey),
      })),
      table,
      emptySources,
      shrink: 0,
      overflow: false,
      editSource: input.canEdit ? { itemNo: spec.itemNo } : null,
      editInValidation: input.canEdit ? (spec.editInValidation ?? null) : null,
      commentCount: input.commentCount(target),
    };
  }

  build(): PitchDeck {
    const { input } = this;
    const notes = this.text(
      input.variant === "one" ? KEYS.oneMinute : KEYS.fiveMinute,
    );
    return {
      variant: input.variant,
      source: input.source,
      businessName: input.header.businessName,
      generatedAt: input.generatedAt.toISOString(),
      footer: {
        businessName: input.header.businessName,
        versionLabel: versionLabel(input.source),
        date: input.date,
      },
      speakerNotes: notes,
      slides: SLIDES[input.variant].map((spec) => this.slide(spec)),
    };
  }
}

/** The version's name, or "Draft" for the plan now (design-spec 1.4). */
const versionLabel = (source: PitchDeck["source"]) =>
  source.kind === "version" ? source.name : i18n.t("pitch:draft");

/**
 * The slides of a deck, in its order: what a comment on a slide may name as its key
 * (`{variant}.{slide}`, SDD 5.1 TargetRef).
 */
export const pitchSlideKeys = (variant: PitchVariant): PitchSlideKey[] =>
  SLIDES[variant].map((spec) => spec.key);

/**
 * The slides of the one- or five-minute deck (design-spec 6.14) with every source in
 * place: blank sources show "Not written yet" and are named in `emptySources`, and
 * nothing is cut yet (`fitPitchDeck` shrinks and cuts for the slide's size).
 */
export const buildPitchDeck = (input: PitchDeckInput): PitchDeck =>
  new DeckBuilder(input).build();
