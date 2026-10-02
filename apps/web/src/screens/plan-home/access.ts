import { DEFAULT_CURRENCY } from "@moonx/i18n";
import type { PlanHome } from "../../lib/plans";
import { useMe } from "../../lib/session";

/** What the signed-in person may do on screen 20 (design-spec 1.3, 6.12). */
export interface PlanAccess {
  /** Owner or Member of the plan's workspace. */
  isEditor: boolean;
  /** An editor on a plan and idea that are not archived: edit, save versions, record Go / No-Go, AI. */
  canChange: boolean;
  /** `canChange` on the latest plan; a saved version is a read-only snapshot. */
  canEditLatest: boolean;
  /** Add plan needs a Proceed decision (M5); the plan being open does not matter. */
  canAddPlan: boolean;
  /** Archive and restore (P3): the plan's own archived flag does not block it, an archived idea does. */
  canToggleArchive: boolean;
  currency: string;
  timeZone: string;
}

export function usePlanAccess(plan: PlanHome, workspaceId: string): PlanAccess {
  const ideaArchived = plan.ideaArchived;
  const me = useMe();
  const membership = me.memberships.find((m) => m.workspace.id === workspaceId);
  const isEditor = membership !== undefined && membership.role !== "viewer";
  const canChange = isEditor && !plan.archived && !ideaArchived;
  return {
    isEditor,
    canChange,
    canEditLatest: canChange && plan.viewingVersion === null,
    canAddPlan: isEditor && !ideaArchived && plan.latestDecision === "proceed",
    canToggleArchive: isEditor && !ideaArchived,
    currency: membership?.workspace.currency ?? DEFAULT_CURRENCY,
    timeZone: me.timezone,
  };
}
