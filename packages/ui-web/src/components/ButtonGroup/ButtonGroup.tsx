import type { ReactNode } from "react";
import { Group } from "react-aria-components";
import { buttonGroup } from "./ButtonGroup.css";

export interface ButtonGroupProps {
  orientation?: "horizontal" | "vertical";
  /** Where the buttons sit along the main axis (horizontal) or cross axis (vertical). */
  align?: "start" | "center" | "end";
  /** Names the group for assistive technology. */
  "aria-label"?: string;
  children: ReactNode;
}

/** Lays out Buttons with the standard gap. Each Button keeps its own variant and size. */
export function ButtonGroup({
  orientation = "horizontal",
  align = "start",
  children,
  "aria-label": ariaLabel,
}: ButtonGroupProps) {
  return (
    <Group aria-label={ariaLabel} className={buttonGroup({ orientation, align })}>
      {children}
    </Group>
  );
}
