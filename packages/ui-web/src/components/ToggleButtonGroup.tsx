import type { SizeWithXS } from "@moonx/ui-tokens";
import { createContext, type ReactNode, useContext } from "react";
import {
  ToggleButton as AriaToggleButton,
  ToggleButtonGroup as AriaToggleButtonGroup,
  type ToggleButtonGroupProps as AriaToggleButtonGroupProps,
  type ToggleButtonProps as AriaToggleButtonProps,
} from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import * as styles from "./SegmentedControl.css";

const ToggleDefaults = createContext<{ size: SizeWithXS }>({ size: "M" });

export interface ToggleButtonGroupProps
  extends Pick<
    AriaToggleButtonGroupProps,
    | "selectionMode"
    | "selectedKeys"
    | "defaultSelectedKeys"
    | "onSelectionChange"
    | "disallowEmptySelection"
    | "isDisabled"
    | "orientation"
    | "aria-label"
    | "aria-labelledby"
    | "aria-describedby"
  > {
  /** XS to XL, Spectrum 2's steps (design-spec 4.5). @default "M" */
  size?: SizeWithXS;
  /** The buttons without the groove around them. */
  isQuiet?: boolean;
  /**
   * Fills the line, the buttons sharing it, none narrower than its label (inside
   * FauPicker, 6.0.3).
   */
  isJustified?: boolean;
  children: ReactNode;
}

/**
 * Buttons that stay pressed, such as F/A/U's `[Fact] [Assumption] [Unknown]`, in
 * SegmentedControl's groove (design-spec 4.5). With the default single selection,
 * pressing the selected button again clears it (design-spec 6.0.3);
 * `disallowEmptySelection` keeps one selected.
 */
export function ToggleButtonGroup({
  size = "M",
  isQuiet = false,
  isJustified = false,
  selectionMode = "single",
  orientation = "horizontal",
  children,
  ...props
}: ToggleButtonGroupProps) {
  return (
    <AriaToggleButtonGroup
      {...props}
      selectionMode={selectionMode}
      orientation={orientation}
      className={styles.control({ isJustified, isQuiet, orientation })}
    >
      <ToggleDefaults.Provider value={{ size }}>
        {children}
      </ToggleDefaults.Provider>
    </AriaToggleButtonGroup>
  );
}

export interface ToggleButtonProps
  extends Pick<
    AriaToggleButtonProps,
    "id" | "isDisabled" | "aria-label" | "aria-describedby"
  > {
  /** The key the group reports when this button is selected. */
  id: string;
  children: ReactNode;
}

/** One button of a ToggleButtonGroup. */
export function ToggleButton({ children, ...props }: ToggleButtonProps) {
  const { size } = useContext(ToggleDefaults);
  return (
    <AriaToggleButton {...props} className={styles.item({ size })}>
      <IconSlot size={size}>{children}</IconSlot>
    </AriaToggleButton>
  );
}
