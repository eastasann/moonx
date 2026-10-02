import type { CheckKey, CheckResult, CheckState, LinkTarget, SupportsCheck } from "@moonx/schemas";
import {
  type CostRowInput,
  computeEconomics,
  costTableStats,
  type EconomicsInputValues,
} from "./economics";

/** Template thresholds (design-spec 6.1, 27). The params of each check in `template_check_rules`. */
export interface CheckRules {
  competitors: { min: number; max: number };
  local_price: { pricedCompetitors: number; researchLogs: number };
  permits: { researchLogs: number };
  demand_signal: { researchLogs: number };
}

export const DEFAULT_CHECK_RULES: CheckRules = {
  competitors: { min: 3, max: 5 },
  local_price: { pricedCompetitors: 2, researchLogs: 1 },
  permits: { researchLogs: 1 },
  demand_signal: { researchLogs: 1 },
};

/** The template key of the Permits row that check 5 reads (design-spec 6.1). */
export const PERMITS_ROW_KEY = "initial.permits";

export interface CheckInputs {
  workspaceId: string;
  ideaId: string;
  /** Competitor and research log rows that are not deleted. */
  competitors: { typicalPrice: number | null }[];
  researchLogs: { supportsChecks: SupportsCheck[] }[];
  costRows: CostRowInput[];
  economics: EconomicsInputValues;
  rules: CheckRules;
}

export const CHECK_KEYS: CheckKey[] = [
  "competitors",
  "local_price",
  "costs",
  "break_even",
  "permits",
  "demand_signal",
];

const SCREEN = {
  questions: 11,
  researchLog: 14,
  competitors: 15,
  assumptionsRisks: 16,
  costs: 17,
  economics: 18,
  decision: 19,
} as const;

const taggedLogs = (logs: CheckInputs["researchLogs"], tag: SupportsCheck) =>
  logs.filter((l) => l.supportsChecks.includes(tag)).length;

/** Evaluates the six required checks in the order of design-spec 6.1. */
export function evaluateChecks(input: CheckInputs): CheckResult[] {
  const { workspaceId, ideaId, rules } = input;
  const base: LinkTarget = { screen: 0, workspaceId, ideaId };
  const link = (screen: number, extra: Partial<LinkTarget> = {}): LinkTarget => ({
    ...base,
    screen,
    ...extra,
  });
  const state = (done: boolean, partial: boolean): CheckState =>
    done ? "done" : partial ? "partial" : "not_started";

  const competitorCount = input.competitors.length;
  const priced = input.competitors.filter((c) => c.typicalPrice != null).length;
  const priceLogs = taggedLogs(input.researchLogs, "local_price");
  const permitLogs = taggedLogs(input.researchLogs, "permits");
  const demandLogs = taggedLogs(input.researchLogs, "demand_signal");

  const initial = costTableStats(input.costRows, "initial");
  const monthly = costTableStats(input.costRows, "monthly_fixed");
  const emptyRows = initial.emptyRows + monthly.emptyRows;
  const missingAmounts: NonNullable<CheckResult["detail"]>["missing"] = [];
  if (initial.filled === 0) missingAmounts.push("initial_amount");
  if (monthly.filled === 0) missingAmounts.push("monthly_amount");

  const economics = computeEconomics(input.costRows, input.economics);
  const hasPrice = input.economics.sellingPrice != null;
  const hasMonthly = economics.totals.monthlyFixed.amount != null;
  const missingBreakEven: NonNullable<CheckResult["detail"]>["missing"] = [];
  if (!hasPrice) missingBreakEven.push("price");
  if (!hasMonthly) missingBreakEven.push("monthly_costs");

  const permitsRow = input.costRows.find(
    (r) => r.category === "initial" && r.templateKey === PERMITS_ROW_KEY,
  );
  const permitsAnswered =
    permitsRow != null &&
    permitsRow.amount != null &&
    (permitsRow.fauState === "fact" ||
      permitsRow.fauState === "fact_no_evidence" ||
      permitsRow.fauState === "assumption");

  return [
    {
      key: "competitors",
      state: state(
        competitorCount >= rules.competitors.min,
        competitorCount >= 1 && competitorCount < rules.competitors.min,
      ),
      count: competitorCount,
      params: { ...rules.competitors },
      detail: null,
      link: link(SCREEN.competitors),
    },
    {
      key: "local_price",
      state: state(
        priced >= rules.local_price.pricedCompetitors ||
          priceLogs >= rules.local_price.researchLogs,
        priced >= 1,
      ),
      count: priced,
      params: { ...rules.local_price },
      detail: null,
      link: link(SCREEN.competitors),
    },
    {
      key: "costs",
      state: state(
        initial.filled >= 1 && monthly.filled >= 1 && emptyRows === 0,
        initial.filled + monthly.filled >= 1,
      ),
      count: null,
      params: {},
      detail: { emptyRows, missing: missingAmounts },
      link: link(SCREEN.costs),
    },
    {
      key: "break_even",
      state: state(economics.breakEvenUnitsMonth.value != null, hasPrice || hasMonthly),
      count: null,
      params: {},
      detail: { missing: missingBreakEven },
      link: hasPrice
        ? hasMonthly
          ? link(SCREEN.economics)
          : link(SCREEN.costs, { tab: "monthly_fixed" })
        : link(SCREEN.economics, { field: "selling_price" }),
    },
    {
      key: "permits",
      state: state(permitsAnswered || permitLogs >= rules.permits.researchLogs, false),
      count: permitLogs,
      params: { ...rules.permits },
      detail: null,
      link: link(SCREEN.costs, permitsRow?.id ? { rowId: permitsRow.id } : {}),
    },
    {
      key: "demand_signal",
      state: state(demandLogs >= rules.demand_signal.researchLogs, false),
      count: demandLogs,
      params: { ...rules.demand_signal },
      detail: null,
      link: link(SCREEN.researchLog, { tab: "new" }),
    },
  ];
}

export { SCREEN as CHECK_SCREENS };
