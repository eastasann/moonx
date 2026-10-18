import type { Me, Role } from "@moonx/schemas";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { createContext, useContext } from "react";

/** The workspace a screen under `/w/$workspaceId` belongs to, as the user's membership. */
export interface WorkspaceScope {
  me: Me;
  workspace: Me["memberships"][number]["workspace"];
  role: Role;
}

export const WorkspaceContext = createContext<WorkspaceScope | null>(null);

/**
 * The workspace of the screen. Only the screens under `/w/$workspaceId` have one.
 *
 * @throws {Error} outside them.
 */
export function useWorkspace(): WorkspaceScope {
  const scope = useContext(WorkspaceContext);
  if (scope === null) throw new Error("useWorkspace outside a workspace route");
  return scope;
}

/**
 * The dashboard the user goes back to (design-spec 5章「ログイン後」): the workspace last
 * opened while they still belong to it, else their personal one.
 */
export function dashboardHref(me: Me): string | undefined {
  const ids = me.memberships.map(({ workspace }) => workspace.id);
  const id =
    me.lastWorkspaceId !== null && ids.includes(me.lastWorkspaceId)
      ? me.lastWorkspaceId
      : (me.memberships.find(({ workspace }) => workspace.isPersonal)?.workspace
          .id ?? ids[0]);
  return id === undefined ? undefined : `/w/${id}`;
}

/** The modals opened by the search parameter `modal` (SDD 4章) this app has so far. */
export type ModalName = "switch-workspace";

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** The entry was added by opening its modal from the screen under it. */
    openedModal?: boolean;
  }
}

/**
 * Opens or closes a modal of the screen by its search parameter (SDD 4章). Opening adds
 * a history entry, so the browser's Back (a phone's back gesture) closes the modal.
 * Closing goes back over that entry; a modal opened from its URL has none to go back
 * over, and leaves the parameter in place of the entry instead.
 */
export function useModal(): {
  open: (name: ModalName) => void;
  close: () => void;
} {
  const navigate = useNavigate();
  const router = useRouter();
  const openedHere = useRouterState({
    select: (state) => state.location.state.openedModal === true,
  });
  return {
    open: (name) =>
      void navigate({
        to: ".",
        search: (previous) => ({ ...previous, modal: name }),
        state: (previous) => ({ ...previous, openedModal: true }),
      }),
    close: () => {
      if (openedHere) {
        router.history.back();
        return;
      }
      void navigate({
        to: ".",
        search: ({ modal: _, ...rest }) => rest,
        replace: true,
      });
    },
  };
}
