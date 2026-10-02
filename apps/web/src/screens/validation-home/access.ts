import { useMe } from "../../lib/session";
import type { ValidationHomeData } from "../../lib/validation-home";

/** What the signed-in person may do on the home of this idea (design-spec 2.2, 6.1 "状態"). */
export interface HomeAccess {
  /** Owner or Member of the idea's workspace. */
  isEditor: boolean;
  /** An editor on an idea that is not archived: edit, decide, AI, Add plan, archive, migrate. */
  canChange: boolean;
  currency: string;
  timeZone: string;
}

export function useHomeAccess(data: ValidationHomeData, workspaceId: string): HomeAccess {
  const me = useMe();
  const membership = me.memberships.find((m) => m.workspace.id === workspaceId);
  const isEditor = membership !== undefined && membership.role !== "viewer";
  return {
    isEditor,
    canChange: isEditor && !data.idea.archived,
    currency: membership?.workspace.currency ?? "PHP",
    timeZone: me.timezone,
  };
}
