import type { Me, Role } from "@moonx/schemas";
import {
  useNavigate,
  useRouter,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { createContext, useContext } from "react";
import {
  formatPanelTarget,
  isPanelName,
  type PanelName,
  type PanelTarget,
  parsePanelTarget,
} from "../lib/panel-target";

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
    /**
     * The entry was added by opening a panel (PNL-1) from the screen under it: the entry's
     * index in the history, and the place it was opened on ({@link placeOf}). Closing
     * goes back over the entry only while it is still that entry at that place; a move
     * on the screen since (another row, a filter) leaves it in place, and an entry pushed
     * later carries a copy of the state but another index.
     */
    openedPanel?: { index: number; place: string };
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

/** Where a location is on its screen, apart from the panel: its path and other parameters. */
function placeOf(location: {
  pathname: string;
  search: Record<string, unknown>;
}): string {
  const { panel: _, target: __, ...rest } = location.search;
  return JSON.stringify([
    location.pathname,
    Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

/** The panel open over the screen (SDD 4章 `?panel=&target=`), and what it is about. */
export interface OpenPanel {
  name: PanelName;
  target: PanelTarget;
}

/**
 * Opens, switches or closes the screen's panel by its search parameters (SDD 4章), as
 * {@link useModal} does a modal: opening adds a history entry, so Back (a phone's back
 * gesture) closes it; another panel or target while one is open replaces the entry;
 * closing goes back over the entry it added, or takes the parameters off one opened
 * from its URL. A `target` that names nothing opens nothing.
 */
export function usePanel(): {
  open: OpenPanel | null;
  show: (name: PanelName, target: PanelTarget) => void;
  close: () => void;
  /**
   * `href`, a place on the same screen (another entry, a filter), with the open panel's
   * parameters: moving about the screen leaves the panel open (design-spec 6.0.4).
   */
  keep: (href: string) => string;
} {
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ strict: false }) as {
    panel?: unknown;
    target?: unknown;
  };
  const openedHere = useRouterState({
    select: ({ location }) =>
      location.state.openedPanel !== undefined &&
      location.state.openedPanel.index === location.state.__TSR_index &&
      location.state.openedPanel.place === placeOf(location),
  });
  const target = parsePanelTarget(search.target);
  const open =
    isPanelName(search.panel) && target !== undefined
      ? { name: search.panel, target }
      : null;
  return {
    open,
    show: (name, next) => {
      // From the location as its URL reads, as it is read again once the panel is open:
      // the place the entry keeps is then the place it has.
      const location = router.state.location;
      void navigate({
        to: ".",
        search: () => ({
          ...location.search,
          panel: name,
          target: formatPanelTarget(next),
        }),
        replace: open !== null,
        // A new entry is the panel's alone: Back from it closes the panel, and a detail
        // or modal the screen opened in the entry before stays that entry's to close.
        state: (previous) =>
          open === null
            ? {
                ...previous,
                openedPanel: {
                  index: location.state.__TSR_index + 1,
                  place: placeOf(location),
                },
                openedDetail: false,
                openedModal: false,
              }
            : previous,
      });
    },
    close: () => {
      if (openedHere) {
        router.history.back();
        return;
      }
      void navigate({
        to: ".",
        search: ({ panel: _, target: __, ...rest }) => rest,
        replace: true,
      });
    },
    keep: (href) => {
      if (open === null) return href;
      const [path, query = ""] = href.split("?");
      const params = new URLSearchParams(query);
      params.set("panel", open.name);
      params.set("target", formatPanelTarget(open.target));
      return `${path}?${params}`;
    },
  };
}
