import type { SizeWithXS } from "@moonx/ui-tokens";
import { createContext, type ReactNode, useContext } from "react";
import {
  ToggleButton as AriaToggleButton,
  ToggleButtonGroup as AriaToggleButtonGroup,
  type ToggleButtonGroupProps as AriaToggleButtonGroupProps,
  type ToggleButtonProps as AriaToggleButtonProps,
} from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import { isIconOnly } from "../internal/iconOnly";
import * as styles from "./ActionButton.css";

const ToggleDefaults = createContext<{
  size: SizeWithXS;
  isQuiet: boolean;
}>({
  size: "M",
  isQuiet: false,
});

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
  isQuiet?: boolean;
  children: ReactNode;
}

/**
 * Buttons that stay pressed, such as F/A/U's `[Fact] [Assumption] [Unknown]`. With the
 * default single selection, pressing the selected button again clears it (design-spec
 * 6.0.3); `disallowEmptySelection` keeps one selected.
 */
export function ToggleButtonGroup({
  size = "M",
  isQuiet = false,
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
      className={styles.group({ orientation, density: "regular" })}
    >
      <ToggleDefaults.Provider value={{ size, isQuiet }}>
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
  const { size, isQuiet } = useContext(ToggleDefaults);
  return (
    <AriaToggleButton
      {...props}
      className={styles.actionButton({
        size,
        isQuiet,
        iconOnly: isIconOnly(children),
      })}
    >
      <IconSlot size={size}>{children}</IconSlot>
    </AriaToggleButton>
  );
}
