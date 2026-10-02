import type { GoNoGoValue, Stage } from "@moonx/schemas";

export interface PlanStageInput {
  archived: boolean;
  /** The latest Go / No-Go recorded for this plan, if any. */
  latestGoNoGo: GoNoGoValue | null;
}

/**
 * The stage of an idea (design-spec 6.8). Archived plans are ignored: no plan means Validation,
 * and any plan whose latest Go / No-Go is Launch means Launch prep.
 */
export function decideStage(plans: PlanStageInput[]): Stage {
  const active = plans.filter((p) => !p.archived);
  if (active.length === 0) return "validation";
  return active.some((p) => p.latestGoNoGo === "launch") ? "launch_prep" : "planning";
}
