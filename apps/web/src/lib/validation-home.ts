import { formatKeyMetric } from "@moonx/domain";
import { formatUnits } from "@moonx/i18n";
import type { CheckResult, FauBreakdown, MetricValue, NextStep } from "@moonx/schemas";
import { queryOptions } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { api, call } from "./api";
import { IDEAS_KEY } from "./idea-actions";

const fetchHome = (ideaId: string) => call(api().api.v1.ideas({ ideaId }).validation.get());

/** V1: the payload of screen 13. */
export type ValidationHomeData = Awaited<ReturnType<typeof fetchHome>>;

/** Under `["ideas", ...]`, so the idea actions and the edit sheet refresh the home with the list. */
const validationHomeKey = (ideaId: string) => [...IDEAS_KEY, "validation-home", ideaId] as const;

export const validationHomeQuery = (ideaId: string) =>
  queryOptions({ queryKey: validationHomeKey(ideaId), queryFn: () => fetchHome(ideaId) });

type Section = ValidationHomeData["sections"][number];

/**
 * Where each catalog text of the home is looked up. Keeping the keys in tables, not template
 * strings, lets the catalog test check every one of them.
 */
export const HOME_KEYS = {
  decision: {
    undecided: "validation:home.decision.undecided",
    proceed: "validation:home.decision.proceed",
    hold: "validation:home.decision.hold",
    drop: "validation:home.decision.drop",
    launch: "validation:home.decision.launch",
    delay: "validation:home.decision.delay",
    stop: "validation:home.decision.stop",
  },
  stage: {
    validation: "validation:stage.validation",
    planning: "validation:stage.planning",
    launch_prep: "validation:stage.launch_prep",
  },
  checkLabel: {
    competitors: "validation:checks.competitors.label",
    local_price: "validation:checks.local_price.label",
    costs: "validation:checks.costs.label",
    break_even: "validation:checks.break_even.label",
    permits: "validation:checks.permits.label",
    demand_signal: "validation:checks.demand_signal.label",
  },
  checkState: {
    not_started: "validation:checks.state.not_started",
    partial: "validation:checks.state.partial",
    done: "validation:checks.state.done",
  },
  nextCheck: {
    competitors: "validation:home.nextSteps.check.competitors",
    local_price: "validation:home.nextSteps.check.local_price",
    costs: "validation:home.nextSteps.check.costs",
    costsMissing: "validation:home.nextSteps.check.costs_missing",
    break_even: "validation:home.nextSteps.check.break_even",
    permits: "validation:home.nextSteps.check.permits",
    demand_signal: "validation:home.nextSteps.check.demand_signal",
  },
  metric: {
    initial_cost_total: "validation:home.metrics.initial_cost_total",
    break_even_units_day: "validation:home.metrics.break_even_units_day",
    expected_operating_profit: "validation:home.metrics.expected_operating_profit",
    payback_months: "validation:home.metrics.payback_months",
    simple_roi: "validation:home.metrics.simple_roi",
  },
  metricReason: {
    needs_price: "validation:economics.reason.needs_price",
    needs_monthly_costs: "validation:economics.reason.needs_monthly_costs",
    needs_expected_sales: "validation:economics.reason.needs_expected_sales",
    needs_startup_costs: "validation:economics.reason.needs_startup_costs",
    margin_not_positive: "validation:economics.reason.margin_not_positive",
    target_margin_unreachable: "validation:economics.reason.target_margin_unreachable",
    not_recovered: "validation:economics.reason.not_recovered",
    empty: "validation:economics.reason.empty",
  },
  fau: {
    fact: "validation:fau.state.fact",
    assumption: "validation:fau.state.assumption",
    unknown: "validation:fau.state.unknown",
    unclassified: "validation:fau.state.unclassified",
    empty: "validation:fau.state.empty",
  },
} as const;

/** The text of a Next steps entry (design-spec 6.1 "Next steps の決め方"). */
export function nextStepText(t: TFunction, step: NextStep, sections: Section[]): string {
  const count = step.count ?? 0;
  switch (step.kind) {
    case "add_evidence":
      return t("validation:home.nextSteps.addEvidence", { count });
    case "classify":
      return t("validation:home.nextSteps.classify", { count });
    case "start_customer_problem":
      return t("validation:home.nextSteps.startCustomerProblem");
    case "start_section":
      return t("validation:home.nextSteps.startSection", {
        section: sections.find((s) => s.key === step.sectionKey)?.title ?? step.sectionKey ?? "",
      });
    case "check_unknowns":
      return t("validation:home.nextSteps.checkUnknowns", { count });
    case "ready_to_decide":
      return t("validation:home.nextSteps.readyToDecide");
    case "check": {
      switch (step.checkKey) {
        case "competitors":
          return t(HOME_KEYS.nextCheck.competitors, { count });
        case "costs":
          return step.count
            ? t(HOME_KEYS.nextCheck.costs, { count: step.count })
            : t(HOME_KEYS.nextCheck.costsMissing);
        case "local_price":
          return t(HOME_KEYS.nextCheck.local_price);
        case "break_even":
          return t(HOME_KEYS.nextCheck.break_even);
        case "permits":
          return t(HOME_KEYS.nextCheck.permits);
        case "demand_signal":
          return t(HOME_KEYS.nextCheck.demand_signal);
        case null:
          return "";
      }
    }
  }
}

/** The check's name; the competitors check carries the template's range. */
export function checkLabel(t: TFunction, check: Pick<CheckResult, "key" | "params">): string {
  return t(HOME_KEYS.checkLabel[check.key], {
    min: check.params.min ?? 0,
    max: check.params.max ?? 0,
  });
}

/** "Done", "Partial (2)": the state, with the count for the checks that count entries once they have any. */
export function checkStateText(t: TFunction, check: CheckResult): string {
  const state = t(HOME_KEYS.checkState[check.state]);
  const counted = check.key === "competitors" || check.key === "demand_signal";
  return counted && check.count != null && check.state !== "not_started"
    ? t("validation:home.checkRow.withCount", { state, count: check.count })
    : state;
}

/**
 * What is missing for a check that is not done, one sentence per gap. A done competitors check
 * past the range only carries the template's "aim for" guidance (design-spec 6.1).
 */
export function checkReasons(t: TFunction, check: CheckResult): string[] {
  const { params, detail, count } = check;
  if (check.state === "done") {
    return check.key === "competitors" && count != null && count > (params.max ?? count)
      ? [t("validation:home.checkRow.competitorsAim", { min: params.min, max: params.max })]
      : [];
  }
  switch (check.key) {
    case "competitors":
      return [t("validation:home.reason.competitors", { count: count ?? 0, min: params.min })];
    case "local_price":
      return [
        check.state === "partial"
          ? t("validation:home.reason.local_price_priced", {
              count: count ?? 0,
              needed: params.pricedCompetitors,
            })
          : t("validation:home.reason.local_price", { needed: params.pricedCompetitors }),
      ];
    case "costs": {
      const reasons: string[] = [];
      if (detail?.emptyRows) {
        reasons.push(t("validation:home.reason.costs_empty", { count: detail.emptyRows }));
      }
      if (detail?.missing?.includes("initial_amount")) {
        reasons.push(t("validation:home.reason.costs_initial_amount"));
      }
      if (detail?.missing?.includes("monthly_amount")) {
        reasons.push(t("validation:home.reason.costs_monthly_amount"));
      }
      return reasons;
    }
    case "break_even": {
      const missing = detail?.missing ?? [];
      const reasons: string[] = [];
      if (missing.includes("price")) reasons.push(t(HOME_KEYS.metricReason.needs_price));
      if (missing.includes("monthly_costs")) {
        reasons.push(t(HOME_KEYS.metricReason.needs_monthly_costs));
      }
      if (reasons.length === 0) reasons.push(t(HOME_KEYS.metricReason.margin_not_positive));
      return reasons;
    }
    case "permits":
      return [t("validation:home.reason.permits")];
    case "demand_signal":
      return [t("validation:home.reason.demand_signal")];
  }
}

export type HomeMetricKey = keyof typeof HOME_KEYS.metric;
/** The home shows four of the key numbers; the decision screen adds ROI (design-spec 6.5). */
export const HOME_METRIC_KEYS: HomeMetricKey[] = [
  "initial_cost_total",
  "break_even_units_day",
  "expected_operating_profit",
  "payback_months",
];

export interface MetricView {
  key: HomeMetricKey;
  label: string;
  value: string;
  /** The reason the number is missing, or the lower-bound remark. */
  note: string | null;
  /** The break-even tile also carries the negative-margin warning (design-spec 6.1 "状態"). */
  marginNegative: boolean;
}

/**
 * One key number as the home shows it: "₱450,000+" for a lower bound, "Empty" with the reason
 * for a number that cannot be computed (design-spec 6.1 "主要指標").
 */
export function metricView(
  t: TFunction,
  key: HomeMetricKey,
  metric: MetricValue | undefined,
  options: { currency: string; marginNegative: boolean },
): MetricView {
  const label = t(HOME_KEYS.metric[key]);
  const marginNegative = key === "break_even_units_day" && options.marginNegative;
  if (!metric || metric.value == null) {
    const reason = metric?.reason && metric.reason !== "empty" ? metric.reason : null;
    return {
      key,
      label,
      value: t("validation:home.metricEmpty"),
      note: marginNegative
        ? t("validation:home.marginNegative")
        : reason
          ? t(HOME_KEYS.metricReason[reason])
          : null,
      marginNegative,
    };
  }
  const text = formatKeyMetric(key, metric, options.currency);
  const value =
    key === "break_even_units_day"
      ? t("common:format.perDay", { value: text })
      : key === "expected_operating_profit"
        ? t("common:format.perMonth", { value: text })
        : key === "payback_months"
          ? t("common:format.months", { count: metric.value, value: text })
          : text;
  return {
    key,
    label,
    value,
    note: marginNegative
      ? t("validation:home.marginNegative")
      : key === "initial_cost_total" && metric.bound === "lower"
        ? t("validation:home.metricLowerBound")
        : null,
    marginNegative,
  };
}

export interface FauSegmentView {
  label: string;
  value: number;
  variant: "fact" | "assumption" | "unknown" | "unclassified" | "empty";
  valueLabel: string;
}

/** The parts of the F/A/U band, in the order of the legend: Fact, Assumption, Unknown, Unclassified, Empty. */
export function fauSegments(t: TFunction, fau: FauBreakdown): FauSegmentView[] {
  const { assumption } = fau;
  return [
    {
      label: t(HOME_KEYS.fau.fact),
      value: fau.fact,
      variant: "fact",
      valueLabel: formatUnits(fau.fact),
    },
    {
      label: t(HOME_KEYS.fau.assumption),
      value: assumption.total,
      variant: "assumption",
      valueLabel: assumption.total
        ? t("validation:home.fau.assumptionBreakdown", {
            total: formatUnits(assumption.total),
            low: formatUnits(assumption.low),
            medium: formatUnits(assumption.medium),
            high: formatUnits(assumption.high),
          })
        : formatUnits(0),
    },
    {
      label: t(HOME_KEYS.fau.unknown),
      value: fau.unknown,
      variant: "unknown",
      valueLabel: formatUnits(fau.unknown),
    },
    {
      label: t(HOME_KEYS.fau.unclassified),
      value: fau.unclassified,
      variant: "unclassified",
      valueLabel: formatUnits(fau.unclassified),
    },
    {
      label: t(HOME_KEYS.fau.empty),
      value: fau.empty,
      variant: "empty",
      valueLabel: formatUnits(fau.empty),
    },
  ];
}

/** The count text of a section row: "8/10", "7 entries", "4 (3–5)", "22/24 rows". */
export function sectionProgress(
  t: TFunction,
  section: Section,
  competitorRange: { min: number; max: number } | null,
): string {
  const n = (value: number | null) => formatUnits(value ?? 0);
  switch (section.key) {
    case "03":
      return t("validation:home.sections.entries", { count: section.count ?? 0 });
    case "04":
      return competitorRange
        ? t("validation:home.sections.competitors", {
            count: n(section.count),
            min: competitorRange.min,
            max: competitorRange.max,
          })
        : n(section.count);
    case "09":
      return t("validation:home.sections.assumptionsAndRisks", {
        assumptions: t("validation:home.sections.assumptionsCount", {
          count: section.count ?? 0,
        }),
        risks: t("validation:home.sections.risksCount", { count: section.countB ?? 0 }),
      });
    case "05":
      return t("validation:home.sections.progressRows", {
        answered: n(section.answered),
        total: n(section.total),
      });
    case "06-08":
      return t("validation:home.sections.progressInputs", {
        answered: n(section.answered),
        total: n(section.total),
      });
    default:
      return t("validation:home.sections.progress", {
        answered: n(section.answered),
        total: n(section.total),
      });
  }
}

const EXCERPT_LENGTH = 280;

/** A long answer cut for the Summary block; the full text is on the question screen. */
export function excerpt(text: string): string {
  const flat = text.trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH).trimEnd()}…` : flat;
}
