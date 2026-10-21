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
  const id = homeMembership(me)?.workspace.id;
  return id === undefined ? undefined : `/w/${id}`;
}

/**
 * The membership of that workspace: the one a screen outside any workspace (4 Account)
 * stands in, for the navigation and for what "the workspace open now" means there
 * (design-spec 6.16 4).
 */
export function homeMembership(me: Me): Me["memberships"][number] | undefined {
  return (
    me.memberships.find(
      ({ workspace }) => workspace.id === me.lastWorkspaceId,
    ) ??
    me.memberships.find(({ workspace }) => workspace.isPersonal) ??
    me.memberships[0]
  );
}

/**
 * The id of the user's own personal workspace: the first personal one of their
 * memberships, which come in the order joined, the one made at sign-up first (SDD 5.4 U1).
 * Someone else's personal workspace the user was invited to comes after it.
 */
export const ownPersonalId = (me: Me): string | undefined =>
  me.memberships.find(({ workspace }) => workspace.isPersonal)?.workspace.id;

/** The modals opened by the search parameter `modal` (SDD 4章) this app has so far. */
export type ModalName = "switch-workspace" | "new-idea" | "evidence";

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** The entry was added by opening its modal from the screen under it. */
    openedModal?: boolean;
    /**
     * M2 was opened by the Fact button (design-spec 6.0.3): the evidence it attaches
     * makes the item a Fact. Kept with the entry, so Back and a reload keep it too.
     */
    evidenceForFact?: boolean;
  }
}

/** What a modal opens about (SDD 4章): M2's item, and whether Fact opened it. */
interface ModalOptions {
  /** `?about=<targetType>:<targetId>[:<targetKey>]`. */
  about?: string;
  forFact?: boolean;
}

/**
 * Opens or closes a modal of the screen by its search parameter (SDD 4章). Opening adds
 * a history entry, so the browser's Back (a phone's back gesture) closes the modal.
 * Closing goes back over that entry; a modal opened from its URL has none to go back
 * over, and leaves the parameter in place of the entry instead.
 */
export function useModal(): {
  open: (name: ModalName, options?: ModalOptions) => void;
  close: () => void;
} {
  const navigate = useNavigate();
  const router = useRouter();
  const openedHere = useRouterState({
    select: (state) => state.location.state.openedModal === true,
  });
  return {
    open: (name, { about, forFact = false } = {}) =>
      void navigate({
        to: ".",
        search: (previous) => ({
          ...previous,
          modal: name,
          ...(about === undefined ? {} : { about }),
        }),
        state: (previous) => ({
          ...previous,
          openedModal: true,
          evidenceForFact: forFact,
        }),
      }),
    close: () => {
      if (openedHere) {
        router.history.back();
        return;
      }
      void navigate({
        to: ".",
        search: ({ modal: _, about: __, ...rest }) => rest,
        replace: true,
      });
    },
  };
}
