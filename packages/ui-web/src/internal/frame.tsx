import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { cssVarName } from "../styles/helpers";
import * as styles from "./frame.css";
import { useIsDesktop } from "./useIsDesktop";

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
 * Whether AppFrame's body leaves patterns D and F room for their two columns (design-spec
 * 4.1・4.3): false while a desktop's docked panel narrows the body below
 * `layout.two-column-min-width`. True outside AppFrame, where no panel docks.
 */
export const TwoColumnRoomContext = createContext(true);

/**
 * Whether patterns D and F stand in their two columns: on a desktop whose body has room
 * for them. Otherwise they take the tablet's arrangement, a docked panel staying beside
 * the body (4.1).
 */
export function useTwoColumns(): boolean {
  const isDesktop = useIsDesktop();
  const hasRoom = useContext(TwoColumnRoomContext);
  return isDesktop && hasRoom;
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

/**
 * The bar fixed to the bottom of the body (design-spec 4.1, 4.3): the main action of a
 * hub, a form or a step, a question form's previous and next, a worksheet's results.
 * With `isPhoneOnly`, it is an ordinary row at the end of the page from the tablet
 * breakpoint up, as wide as the page's column (`width`).
 */
export function BottomBar({
  isPhoneOnly = false,
  width = "reading",
  children,
}: {
  isPhoneOnly?: boolean;
  width?: "reading" | "content";
  children: ReactNode;
}) {
  const inset = useKeyboardInset();
  const classes = [styles.bottomBar];
  if (isPhoneOnly) classes.push(styles.phoneOnlyBar);
  if (isPhoneOnly && width === "content") classes.push(styles.phoneOnlyContent);
  return (
    <div
      className={classes.join(" ")}
      style={{ [keyboardInsetName]: `${inset}px` }}
    >
      {children}
    </div>
  );
}

/**
 * The bands across the top of the body (design-spec 6.0.6), each an `InlineAlert`.
 * Several at once stand in this order, offline first (6.0.1).
 */
export interface FrameBanners {
  /** "You're offline. Changes can't be saved until you reconnect." */
  offline?: ReactNode;
  /** "A new version of moonx is available." with Reload. */
  newVersion?: ReactNode;
  /** iPhone Safari's "Add moonx to your Home Screen…" (signed in only). */
  addToHomeScreen?: ReactNode;
}

/** The bands of `FrameBanners`, in their order; nothing when there are none. */
export function Banners({ banners }: { banners?: FrameBanners }) {
  if (
    banners === undefined ||
    (banners.offline == null &&
      banners.newVersion == null &&
      banners.addToHomeScreen == null)
  ) {
    return null;
  }
  return (
    <div className={styles.bands}>
      {banners.offline}
      {banners.newVersion}
      {banners.addToHomeScreen}
    </div>
  );
}

/** The phone's floating new-item button of a list (4.1 D), above the keyboard too. */
export function FloatingAction({ children }: { children: ReactNode }) {
  const inset = useKeyboardInset();
  return (
    <div
      className={styles.floatingAction}
      style={{ [keyboardInsetName]: `${inset}px` }}
    >
      {children}
    </div>
  );
}
