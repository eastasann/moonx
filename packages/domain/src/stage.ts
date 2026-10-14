import type { GoNoGoValue, Stage } from "@moonx/schemas";

/** One plan of the idea that is not deleted (undone creation, SDD 5.11). */
export interface PlanStageInput {
  archived: boolean;
  /** The latest Go / No-Go recorded on the plan, or null when none. */
  latestGoNoGo: GoNoGoValue | null;
}

/**
 * The stage of an idea (design-spec 6.8): Validation with no plan, Planning with one or
 * more, Launch prep once any plan's latest Go / No-Go is Launch. Archived plans do not
 * count. The decision (Proceed / Hold / Drop) is a separate attribute.
 */
export const ideaStage = (plans: readonly PlanStageInput[]): Stage => {
  const live = plans.filter((plan) => !plan.archived);
  if (live.length === 0) return "validation";
  return live.some((plan) => plan.latestGoNoGo === "launch")
    ? "launch_prep"
    : "planning";
};
