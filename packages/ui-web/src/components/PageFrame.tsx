import type { ReactNode } from "react";
import { Banners, type FrameBanners } from "../internal/frame";
import * as styles from "./PageFrame.css";

export interface PageFrameProps {
  /**
   * The bands across the top (6.0.6): offline and a new version. The iPhone's Home
   * Screen band is for signed-in screens only.
   */
  banners?: Omit<FrameBanners, "addToHomeScreen">;
  /** The screen: its layout pattern (J for 1・29・30, B for 2, G for 3). */
  children: ReactNode;
}

/**
 * The main landmark of the screens without AppFrame: 1 Landing, 2 sign-in and sign-up,
 * 3 Onboarding, 29 Privacy and 30 Support (design-spec 4.5). The pattern inside decides
 * the layout; with no TabBar under it, a pattern's bottom bar keeps the safe area itself
 * (4.3).
 */
export function PageFrame({ banners, children }: PageFrameProps) {
  return (
    <main className={styles.pageFrame}>
      <Banners banners={banners} />
      {children}
    </main>
  );
}
