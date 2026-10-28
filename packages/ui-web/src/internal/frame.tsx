import { Plus } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { Button as AriaButton } from "react-aria-components";
import { cssVarName } from "../styles/helpers";
import * as styles from "./frame.css";
import { IconSlot } from "./IconSlot";
import { BottomBarContext } from "./size";
import { useIsDesktop } from "./useIsDesktop";
import { useIsNarrow } from "./useIsNarrow";

const keyboardInsetName = cssVarName(styles.keyboardInset);

/**
 * AppFrame's header slot for a pattern's tools: QuestionFormPattern puts 11's Focus
 * switch there (design-spec 6.2: "Focus ●  ✓ Saved 💬 🕘"). Null outside AppFrame.
 */
export const HeaderToolsContext = createContext<HTMLElement | null>(null);

/** The element in AppFrame's header a pattern may render its tools into. */
export function useHeaderTools(): HTMLElement | null {
  return useContext(HeaderToolsContext);
}

/** Where the header's ← leads instead of the screen's own: back to a list. */
export interface BackTarget {
  label: string;
  onPress: () => void;
}

/**
 * Lets a pattern take over the header's ← on a phone (6.0.1): ListDetailPattern points
 * it at the list while a detail fills the screen, so a phone shows one ←, not two. Null
 * outside AppFrame.
 */
export const BackOverrideContext = createContext<
  ((target: BackTarget | null) => void) | null
>(null);

/**
 * What AppFrame's body leaves room for beside a desktop's docked panel (design-spec
 * 4.1・4.3). Both true outside AppFrame and with no panel docked: only a docked panel
 * narrows the body.
 */
export interface BodyRoom {
  /** Patterns A, D and F's two columns: the body at least `layout.two-column-min-width`. */
  hasTwoColumns: boolean;
  /**
   * Pattern I's thumbnails beside the slide: the body at least
   * `layout.presentation.two-column-min-width`.
   */
  hasThumbnails: boolean;
}

export const fullBodyRoom: BodyRoom = {
  hasTwoColumns: true,
  hasThumbnails: true,
};

export const BodyRoomContext = createContext<BodyRoom>(fullBodyRoom);

/**
 * AppFrame's room as the page is laid out at the moment it is called, read from the
 * layout instead of from the last observation. A render can be a frame behind: the
 * navigation that docks or closes a panel renders, and runs its effects, before the
 * body is measured again.
 */
export const BodyRoomNowContext = createContext<() => BodyRoom>(
  () => fullBodyRoom,
);

/**
 * Whether patterns A, D and F stand in their two columns: on a desktop whose body has
 * room for them. Otherwise they take the tablet's arrangement, a docked panel staying
 * beside the body (4.1).
 */
export function useTwoColumns(): boolean {
  const isDesktop = useIsDesktop();
  const { hasTwoColumns } = useContext(BodyRoomContext);
  return isDesktop && hasTwoColumns;
}

/**
 * {@link useTwoColumns} as the page is laid out when the returned function is called: for
 * an effect that writes into the URL what goes beside a list. On the navigation that
 * docks a panel, the render still says two columns, and what it would put beside the
 * list was never on screen.
 */
export function useTwoColumnsNow(): () => boolean {
  const isDesktop = useIsDesktop();
  const measure = useContext(BodyRoomNowContext);
  return () => isDesktop && measure().hasTwoColumns;
}

/**
 * Whether pattern I shows its thumbnails beside the slide: from the tablet breakpoint up,
 * on a body with room for them. Otherwise it takes the phone's arrangement, the slide on
 * screen alone with the previous and next under it (4.1).
 */
export function useThumbnailColumn(): boolean {
  const isNarrow = useIsNarrow();
  const { hasThumbnails } = useContext(BodyRoomContext);
  return !isNarrow && hasThumbnails;
}

/**
 * How much of the layout viewport's bottom the on-screen keyboard covers: the keyboard
 * shrinks the visual viewport only, so things fixed to the bottom would sit under it
 * (design-spec 4.3). Measured once a frame at most.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const measure = () =>
      setInset(
        Math.max(
          0,
          Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
        ),
      );
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/** The column a bottom bar lines its content up with, from the tablet breakpoint up. */
export type BarColumn = "reading" | "form" | "comparison" | "worksheet";

/**
 * The bar fixed to the bottom of the body (design-spec 4.1, 4.3): the main action of a
 * hub, a focused form or a step, a question form's previous and next, a worksheet's
 * summary. `actions` on a phone makes its Buttons XL, the ones that are not quiet sharing
 * the width, or with `isShared` every one of them (4.3: B shares it with Cancel). With
 * `isPhoneOnly` it is an ordinary row at the end of the page from the tablet breakpoint
 * up (B). `note` stands at its start from the tablet breakpoint up (G).
 */
export function BottomBar({
  variant = "actions",
  isPhoneOnly = false,
  isShared = false,
  column = "reading",
  note,
  children,
}: {
  variant?: "actions" | "footer" | "navigation" | "summary";
  isPhoneOnly?: boolean;
  isShared?: boolean;
  column?: BarColumn;
  note?: ReactNode;
  children: ReactNode;
}) {
  const inset = useKeyboardInset();
  const isNarrow = useIsNarrow();
  const classes = [styles.bar, styles.bottomBar[variant]];
  if (isPhoneOnly) classes.push(styles.phoneOnlyBar);
  const content =
    variant === "actions" && isNarrow ? (
      <BottomBarContext.Provider value={isShared ? "all" : "main"}>
        {children}
      </BottomBarContext.Provider>
    ) : (
      children
    );
  return (
    <div
      className={classes.join(" ")}
      style={{ [keyboardInsetName]: `${inset}px` }}
    >
      <div className={styles.barInner({ variant, column, isShared })}>
        {note != null && !isNarrow && (
          <span className={styles.barNote}>{note}</span>
        )}
        {content}
      </div>
    </div>
  );
}

/**
 * The bands across the top of the body (design-spec 6.0.1・6.0.6・6.0.7), each an
 * `AlertBanner`. Several at once stand in this order, offline first.
 */
export interface FrameBanners {
  /** "You're offline. Changes can't be saved until you reconnect." */
  offline?: ReactNode;
  /** "A new version of moonx is available." with Reload. */
  newVersion?: ReactNode;
  /** iPhone Safari's "Add moonx to your Home Screen…" (signed in only). */
  addToHomeScreen?: ReactNode;
  /** 10, 13 and 20: "A newer template is available." with Update template (6.0.7). */
  template?: ReactNode;
}

/** The bands of `FrameBanners`, in their order; nothing when there are none. */
export function Banners({ banners }: { banners?: FrameBanners }) {
  if (
    banners === undefined ||
    (banners.offline == null &&
      banners.newVersion == null &&
      banners.addToHomeScreen == null &&
      banners.template == null)
  ) {
    return null;
  }
  return (
    <div className={styles.bands}>
      {banners.offline}
      {banners.newVersion}
      {banners.addToHomeScreen}
      {banners.template}
    </div>
  );
}

/**
 * Inside the list pane of pattern D (s06-ideas.html): a ListView's rows reach the pane's
 * edges, inset by the pane's padding.
 */
export const ListPaneContext = createContext(false);

/**
 * The phone's floating new-item button of a list (4.1 D, s06-ideas.html .fab): "+" alone,
 * named by `label`, above the TabBar and the keyboard.
 */
export function FloatingAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const inset = useKeyboardInset();
  return (
    <div
      className={styles.floatingAction}
      style={{ [keyboardInsetName]: `${inset}px` }}
    >
      <AriaButton
        aria-label={label}
        onPress={onPress}
        className={styles.floatingButton}
      >
        <IconSlot size="L">
          <Plus />
        </IconSlot>
      </AriaButton>
    </div>
  );
}
