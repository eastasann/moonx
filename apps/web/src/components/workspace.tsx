import type { Me, Role } from "@moonx/schemas";
import { useIsFetching } from "@tanstack/react-query";
import {
  type HistoryState,
  useNavigate,
  useRouter,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  formatPanelTarget,
  isPanelName,
  type PanelName,
  type PanelTarget,
  parsePanelTarget,
} from "../lib/panel-target";
import { meQuery } from "../lib/queries";

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
export type ModalName =
  | "switch-workspace"
  | "new-idea"
  | "evidence"
  | "share"
  | "create-plan"
  | "save-version"
  | "go-no-go"
  | "update-template";

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
    /**
     * 12's member whose answers the screen stays about while its list stands alone beside
     * a panel (← from them on a desktop): kept with the entry, so Back, Forward and a
     * reload find the same member.
     */
    teamMember?: string;
  }
}

/** What a modal opens about (SDD 4章): M2's item, and whether Fact opened it. */
interface ModalOptions {
  /**
   * `?about=<targetType>:<targetId>[:<targetKey>]` for M2, `<templateKind>:<targetId>`
   * for M8.
   */
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

/**
 * What the screen's modal `name` is open about, or undefined while it is closed (SDD
 * 4章): the URL's `?modal=` names it, `target` is what it is about (M2's item; anything
 * defined for a modal about the screen as a whole), and `canOpen` lets the person open
 * it in the state the screen read. Decided as it opens: once open it stays until it is
 * closed, though it may no longer open (archived meanwhile, another role, its item
 * deleted), with the last `target` it had if that has gone, so a send from it shows the
 * refusal in it (design-spec 6.0.6) instead of the modal going with what was typed. A
 * `?modal=` naming it that may not open shows nothing, and once `isDecided` (the data
 * deciding it has been read) its `modal` and `about` come off the URL in place of the
 * entry: a change later (Restore, a role, a Proceed read again) then opens nothing
 * unasked. Not while that data is still being read, which may let it open: a cached read
 * being read again counts as being read (19's Proceed onto 13's `?modal=create-plan`).
 * The user's own `me`, whose role every gated modal follows, counts as such data too, so
 * a screen passes only what is its own in `isDecided`.
 *
 * A screen asks once for each modal name it shows, with every `target` of that name
 * folded into one: the modal it does not find is otherwise taken off the URL under the
 * one it would open.
 */
export function useSearchModalAbout<T>(
  modal: string | undefined,
  name: ModalName,
  target: T | undefined,
  canOpen: boolean,
  isDecided: boolean,
): T | undefined {
  const isOpen = useAskedOpen(
    modal === name,
    canOpen && target !== undefined,
    isDecided,
    {
      search: ({ modal: _, about: __, ...rest }) => rest,
      // The entry stays what it was, but has no modal left to go back over.
      state: (previous) => ({ ...previous, openedModal: false }),
    },
  );
  // A ref, not state: a target is often made anew on each render, which state would loop.
  const lastTarget = useRef<T | undefined>(undefined);
  if (!isOpen) {
    lastTarget.current = undefined;
  } else if (target !== undefined) {
    lastTarget.current = target;
  }
  return isOpen ? lastTarget.current : undefined;
}

/** How a refused ask comes off the current history entry: its search, its state. */
export interface AskTakenOff {
  search?: (search: Record<string, unknown>) => Record<string, unknown>;
  state?: (state: HistoryState) => HistoryState;
}

/**
 * Whether a modal or an input the URL or the history entry asks for is open, decided as
 * {@link useSearchModalAbout} decides a modal (SDD 4章): open while asked (`isAsked`) and
 * `canOpen`, and once open until it is no longer asked (closed). Asked where it may not
 * open, it shows nothing, and once `isDecided` and the role (`me`) have been read the ask
 * comes off the current entry in place (`takeOff`), so a change later opens nothing
 * unasked. Used for `?modal=`, 14's and 16's `new=1` and 15's New competitor.
 */
export function useAskedOpen(
  isAsked: boolean,
  canOpen: boolean,
  isDecided: boolean,
  takeOff: AskTakenOff,
): boolean {
  const navigate = useNavigate();
  const [wasOpen, setOpen] = useState(false);
  const isOpen = isAsked && (canOpen || wasOpen);
  if (isOpen !== wasOpen) setOpen(isOpen);
  // The workspace's layout reads `me` again behind its cached role on each visit.
  const isRoleRead =
    useIsFetching({ queryKey: meQuery().queryKey, exact: true }) === 0;
  const isRefused = isAsked && !isOpen && isDecided && isRoleRead;
  const latestTakeOff = useRef(takeOff);
  latestTakeOff.current = takeOff;
  useEffect(() => {
    if (!isRefused) return;
    const { search = (previous) => previous, state = (previous) => previous } =
      latestTakeOff.current;
    void navigate({ to: ".", search, replace: true, state });
  }, [isRefused, navigate]);
  return isOpen;
}

/**
 * Whether the screen's modal `name`, about the screen as a whole, is open (SDD 4章):
 * {@link useSearchModalAbout} with nothing more to find than whether `canOpen`. Leave
 * `isDecided` out only for a modal the role alone decides, which the hook waits for.
 */
export function useSearchModal(
  modal: string | undefined,
  name: ModalName,
  canOpen: boolean,
  isDecided = true,
): boolean {
  return (
    useSearchModalAbout(modal, name, true as const, canOpen, isDecided) === true
  );
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
        // The entry stays what it was without the panel (12's member left by ←), but
        // its detail, opened over a list that had the panel, no longer goes back there
        // (as `show` marks a new entry).
        state: ({ openedPanel: _, ...rest }) => ({
          ...rest,
          openedDetail: false,
        }),
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
