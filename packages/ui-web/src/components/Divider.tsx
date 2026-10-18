import type { DividerSize } from "@moonx/ui-tokens";
import { Separator } from "react-aria-components";
import * as styles from "./Divider.css";

export interface DividerProps {
  /** @default "M" */
  size?: DividerSize;
  /** @default "horizontal" */
  orientation?: "horizontal" | "vertical";
}

/** A rule between groups (design-spec 4.4: lines and space instead of boxes). */
export function Divider({
  size = "M",
  orientation = "horizontal",
}: DividerProps) {
  return (
    <Separator
      orientation={orientation}
      className={styles.divider({ size, orientation })}
    />
  );
}
