import { formatKeyMetric } from "@moonx/domain";
import { formatInputNumber, formatMoney, formatPercent } from "@moonx/i18n";
import type {
  DecisionValue,
  GoNoGoValue,
  KeyMetrics,
  MetricValue,
  QuestionOptions,
  ScenarioColumn,
  TemplateQuestion,
} from "@moonx/schemas";
import { useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useRef } from "react";
import { planKey } from "./ai-exchange";
import { autosave } from "./autosave";
import { DASHBOARD_KEY } from "./dashboard";
import { DECISION_LOG_KEY } from "./decision";
import { ECONOMICS_KEYS, formatMetric, type MetricKind } from "./economics";
import { IDEAS_KEY } from "./idea-actions";
import type { PlanAnswer, PlanReference, PlanRow } from "./plans";
import { usePlanRefresh } from "./plans";
import { HOME_KEYS } from "./validation-home";

/** The URL of P5 for one sub-item. */
export const planAnswerUrl = (planId: string, questionKey: string) =>
  `/api/v1/plans/${planId}/answers/${encodeURIComponent(questionKey)}`;

/** Where each catalog text of the plan item screen that is chosen by data is looked up. */
export const PLAN_ITEM_KEYS = {
  metric: {
    initial_cost_total: "plan:metric.initial_cost_total",
    monthly_fixed_total: "plan:metric.monthly_fixed_total",
    variable_cost_per_unit: "plan:metric.variable_cost_per_unit",
    selling_price: "plan:metric.selling_price",
    contribution_margin: "plan:metric.contribution_margin",
    contribution_margin_rate: "plan:metric.contribution_margin_rate",
    break_even_units_month: "plan:metric.break_even_units_month",
    break_even_units_day: "plan:metric.break_even_units_day",
    break_even_revenue: "plan:metric.break_even_revenue",
    target_margin_units_month: "plan:metric.target_margin_units_month",
    expected_revenue: "plan:metric.expected_revenue",
    expected_operating_profit: "plan:metric.expected_operating_profit",
    payback_months: "plan:metric.payback_months",
    simple_roi: "plan:metric.simple_roi",
    capacity_units_day: "plan:metric.capacity_units_day",
    operating_days: "plan:metric.operating_days",
  },
  scenarioRow: {
    unitsPerDay: "economics:scenarios.unitsPerDay",
    unitsPerMonth: "economics:scenarios.unitsPerMonth",
    revenue: "economics:scenarios.revenue",
    variableCostTotal: "economics:scenarios.variableCostTotal",
    operatingProfit: "economics:scenarios.operatingProfit",
    operatingMargin: "economics:scenarios.operatingMargin",
  },
  decision: {
    proceed: "ideas:decision.proceed",
    hold: "ideas:decision.hold",
    drop: "ideas:decision.drop",
  },
  goNoGo: {
    launch: "ideas:goNoGo.launch",
    delay: "ideas:goNoGo.delay",
    stop: "ideas:goNoGo.stop",
  },
  logKind: {
    validation_decision: "decisionLog:kind.validation_decision",
    go_no_go: "decisionLog:kind.go_no_go",
    version_saved: "decisionLog:kind.version_saved",
  },
  competitorType: {
    direct: "research:competitors.types.direct",
    indirect: "research:competitors.types.indirect",
    substitute: "research:competitors.types.substitute",
  },
  level: {
    low: "validation:fau.confidence.low",
    medium: "validation:fau.confidence.medium",
    high: "validation:fau.confidence.high",
  },
} as const;

/** The decision or Go / No-Go value of a log entry as text. */
export function logValueText(
  t: TFunction,
  value: DecisionValue | GoNoGoValue | null,
): string | null {
  if (value === null) return null;
  if (value === "launch" || value === "delay" || value === "stop") {
    return t(PLAN_ITEM_KEYS.goNoGo[value]);
  }
  return t(PLAN_ITEM_KEYS.decision[value]);
}

/**
 * For the screens that fill a plan (21, 22). A save moves what the plan home, the dashboard, the
 * decision log and notifications show, so `changed` marks those stale while the person keeps
 * typing; the plan's own item and execution queries are left alone then, because a refetch of the
 * item being typed in has nothing to add (the screen writes every save back). Saves still on their
 * way when the screen closes are awaited, then everything under the plan is read again.
 */
export function usePlanChangeRefresh(planId: string): { changed: () => void } {
  const queryClient = useQueryClient();
  const refreshPlan = usePlanRefresh();
  const refresh = useRef(refreshPlan);
  refresh.current = refreshPlan;
  useEffect(
    () => () => {
      void autosave.idle().then(() => refresh.current(planId));
    },
    [planId],
  );
  const changed = useCallback(() => {
    const keys = [
      [...planKey(planId), "home"],
      [...planKey(planId), "pitch-deck"],
      IDEAS_KEY,
      DECISION_LOG_KEY,
      ["notifications"],
      DASHBOARD_KEY,
    ];
    for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, planId]);
  return { changed };
}

/** The execution type a sub-item shows, or null for any other sub-item. */
export function executionTypeOf(question: TemplateQuestion) {
  return question.options?.kind === "execution_view" ? question.options.executionType : null;
}

type TableOptions = Extract<QuestionOptions, { kind: "table" }>;
export type TableColumn = TableOptions["columns"][number];

/** The columns of a table sub-item. */
export const tableColumns = (question: TemplateQuestion): TableColumn[] =>
  question.options?.kind === "table" ? question.options.columns : [];

/** Longest money cell the API takes (`normalizeTableRows`). */
const MAX_MONEY = 1e12;

/** Why a cell is not saved: a percent outside 0-1 or an amount outside 0 to 1e12. */
export type CellProblem = "percent" | "money";

export function cellProblem(
  column: TableColumn,
  value: string | number | null,
): CellProblem | null {
  if (typeof value !== "number") return null;
  if (column.type === "percent") return value < 0 || value > 1 ? "percent" : null;
  if (column.type === "money") return value < 0 || value > MAX_MONEY ? "money" : null;
  return null;
}

/** A cell as text: percent as "40%", money in the workspace currency, text as typed. */
export function cellText(
  column: TableColumn,
  value: string | number | null | undefined,
  currency: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  switch (column.type) {
    case "percent":
      return formatPercent(value);
    case "money":
      return formatMoney(value, currency);
    default:
      return formatInputNumber(value);
  }
}

/** A row with every column empty. */
export const blankRow = (columns: readonly TableColumn[]): PlanRow =>
  Object.fromEntries(columns.map((column) => [column.key, null]));

/** The rows as P5 takes them: a blank text cell is null, and only the table's columns remain. */
export function rowsBody(columns: readonly TableColumn[], rows: readonly PlanRow[]): PlanRow[] {
  return rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => {
        const value = row[column.key] ?? null;
        return [column.key, typeof value === "string" && value.trim() === "" ? null : value];
      }),
    ),
  );
}

/** Whether two sets of rows say the same thing once blanks are dropped. */
export const sameRows = (
  columns: readonly TableColumn[],
  a: readonly PlanRow[],
  b: readonly PlanRow[],
) => JSON.stringify(rowsBody(columns, a)) === JSON.stringify(rowsBody(columns, b));

/** Whether a sub-item counts as answered, by the rule of the plan home (design-spec 6.12). */
export function isSubItemAnswered(
  question: TemplateQuestion,
  answer: PlanAnswer | undefined,
  executionCount: number,
): boolean {
  switch (question.answerType) {
    case "table":
      return (answer?.rows?.length ?? 0) > 0;
    case "execution_view":
      return executionCount > 0;
    case "linked_metric":
      return false;
    default:
      return (answer?.text ?? "").trim() !== "";
  }
}

/** Numbers read from the validation are not answered or unanswered, so they are not counted. */
export const isCountedSubItem = (question: TemplateQuestion) =>
  question.answerType !== "linked_metric";

/** What a number of the linked sub-item shows. */
export interface MetricTileView {
  key: string;
  label: string;
  value: string;
  note: string | null;
}

/** A group of tiles under a heading: one scenario column of the validation's table. */
export interface MetricGroupView {
  key: string;
  heading: string | null;
  tiles: MetricTileView[];
}

function metricText(
  t: TFunction,
  key: string,
  metric: MetricValue | undefined,
  currency: string,
): { value: string; note: string | null } {
  if (!metric || metric.value == null) {
    const reason = metric?.reason && metric.reason !== "empty" ? metric.reason : null;
    return {
      value: t("validation:home.metricEmpty"),
      note: reason ? t(HOME_KEYS.metricReason[reason]) : null,
    };
  }
  return {
    value: formatKeyMetric(key, metric, currency),
    note: metric.bound === "lower" ? t("validation:home.metricLowerBound") : null,
  };
}

const SCENARIO_ROWS: {
  id: keyof typeof PLAN_ITEM_KEYS.scenarioRow;
  kind: MetricKind;
  of: (column: ScenarioColumn) => MetricValue;
}[] = [
  { id: "unitsPerDay", kind: "units", of: (c) => c.unitsPerDay },
  { id: "unitsPerMonth", kind: "units", of: (c) => c.unitsPerMonth },
  { id: "revenue", kind: "money", of: (c) => c.revenue },
  { id: "variableCostTotal", kind: "money", of: (c) => c.variableCostTotal },
  { id: "operatingProfit", kind: "money", of: (c) => c.operatingProfit },
  { id: "operatingMargin", kind: "percent", of: (c) => c.operatingMargin },
];

const isMetricLabelKey = (key: string): key is keyof typeof PLAN_ITEM_KEYS.metric =>
  key in PLAN_ITEM_KEYS.metric;

/**
 * The numbers of a `linked_metric` sub-item (design-spec 6.12): each key of `options.metricKeys`
 * is a key metric or, as `scenario:<name>`, a column of the scenario table. A key that has no
 * name of its own (a cost row) takes the sub-item's title.
 */
export function metricGroups(
  t: TFunction,
  question: TemplateQuestion,
  metrics: KeyMetrics,
  scenarios: readonly ScenarioColumn[],
  currency: string,
): MetricGroupView[] {
  const keys = question.options?.kind === "linked_metric" ? question.options.metricKeys : [];
  const plain: MetricTileView[] = [];
  const groups: MetricGroupView[] = [];
  for (const key of keys) {
    if (key.startsWith("scenario:")) {
      const name = key.slice("scenario:".length) as ScenarioColumn["key"];
      const column = scenarios.find((candidate) => candidate.key === name);
      groups.push({
        key,
        heading: t(ECONOMICS_KEYS.scenarioFull[name]),
        tiles: SCENARIO_ROWS.map((row) => {
          const metric = column ? row.of(column) : undefined;
          const text = metric ? formatMetric(row.kind, metric, currency) : null;
          return {
            key: `${key}:${row.id}`,
            label: t(PLAN_ITEM_KEYS.scenarioRow[row.id]),
            value: text ?? t("validation:home.metricEmpty"),
            note: null,
          };
        }),
      });
      continue;
    }
    const text = metricText(t, key, metrics[key], currency);
    plain.push({
      key,
      label: isMetricLabelKey(key) ? t(PLAN_ITEM_KEYS.metric[key]) : question.title,
      ...text,
    });
  }
  return plain.length > 0 ? [{ key: "metrics", heading: null, tiles: plain }, ...groups] : groups;
}

/** A key metric as a tile, for the `metrics` reference. */
export function referenceMetricTiles(
  t: TFunction,
  data: Record<string, MetricValue>,
  currency: string,
): MetricTileView[] {
  return Object.entries(data).map(([key, metric]) => ({
    key,
    label: isMetricLabelKey(key) ? t(PLAN_ITEM_KEYS.metric[key]) : key,
    ...metricText(t, key, metric, currency),
  }));
}

/** A reference of the given kind, or undefined. */
export const referenceOf = (references: readonly PlanReference[], kind: PlanReference["kind"]) =>
  references.find((reference) => reference.kind === kind);

/** The sums under §13's Ownership and capital table. */
export function totalsOf(references: readonly PlanReference[]) {
  const data = referenceOf(references, "totals")?.data as
    | { ownership: number; capital: number }
    | undefined;
  return data ?? null;
}

/**
 * The validation screen that holds the numbers of a linked sub-item: costs (17) for the cost
 * totals and cost rows, economics (18) for the price, margin, break-even and scenarios.
 */
export function metricEditScreen(question: TemplateQuestion): 17 | 18 {
  const keys = question.options?.kind === "linked_metric" ? question.options.metricKeys : [];
  const costKeys = new Set(["initial_cost_total", "monthly_fixed_total"]);
  return keys.length > 0 && keys.every((key) => key.startsWith("cost_row:") || costKeys.has(key))
    ? 17
    : 18;
}
