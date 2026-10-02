import {
  buildKeyMetrics,
  computeEconomics,
  DEFAULT_CHECK_RULES,
  evaluateChecks,
  summarizeFau,
} from "@moonx/domain";
import type { CheckResult, EconomicsResult, FauBreakdown, KeyMetrics } from "@moonx/schemas";
import type { ValidationData } from "./validation";

export interface ValidationState {
  checks: CheckResult[];
  economics: EconomicsResult;
  keyMetrics: KeyMetrics;
  fau: FauBreakdown;
}

/**
 * The calculations of design-spec 6.1 and 6.4 over a seeded validation. The same pure functions
 * run in the apps, so decision snapshots hold what the screens would have shown.
 */
export function stateOf(
  data: ValidationData,
  workspaceId: string,
  ideaId: string,
): ValidationState {
  const economics = computeEconomics(data.costRows, data.economics);
  return {
    checks: evaluateChecks({
      workspaceId,
      ideaId,
      competitors: data.competitors,
      researchLogs: data.researchLogs,
      costRows: data.costRows,
      economics: data.economics,
      rules: DEFAULT_CHECK_RULES,
    }),
    economics,
    keyMetrics: buildKeyMetrics(economics, data.economics, data.costRows),
    fau: summarizeFau(data.fauItems),
  };
}

/** `decision_log_entries.snapshot` for a decision (SDD 5.11). */
export function decisionSnapshot(state: ValidationState) {
  return {
    missingChecks: state.checks.filter((c) => c.state !== "done"),
    keyMetrics: state.keyMetrics,
    fau: state.fau,
  };
}
