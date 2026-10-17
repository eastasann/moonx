import type { ScreenDensity } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import * as styles from "./Well.css";

export interface WellProps {
  /** Inner padding by the screen's density (design-spec 4.4). @default "regular" */
  density?: ScreenDensity;
  /** `region` (with a label) when the Well is a landmark of its own. */
  role?: "region" | "group";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  children: ReactNode;
}

/**
 * A framed block of material read together: the summary on 19, the preview on 24
 * (design-spec 4.4「画面の組み方」).
 */
export function Well({ density = "regular", children, ...props }: WellProps) {
  return (
    <div {...props} className={styles.well({ density })}>
      {children}
    </div>
  );
}
