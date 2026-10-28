import type { Size } from "@moonx/ui-tokens";
import { createContext, type ReactNode, useContext } from "react";
import {
  type Key,
  ToggleButton,
  ToggleButtonGroup,
} from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import * as styles from "./SegmentedControl.css";

const SizeOfControl = createContext<Size>("M");

export interface SegmentedControlProps {
  /**
   * The chosen segment's id, or null while none is chosen (6.0.3's confidence until the
   * user picks one). Once chosen, pressing it again keeps it chosen.
   */
  selectedKey?: string | null;
  defaultSelectedKey?: string | null;
  onSelectionChange?: (key: string) => void;
  isDisabled?: boolean;
  /** @default "M" */
  size?: Size;
  /** Fills the line, the segments sharing it, none narrower than its label. */
  isJustified?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** What is said under it, such as why its value was refused. */
  "aria-describedby"?: string;
  children: ReactNode;
}

const toSet = (key: string | null | undefined) =>
  key === undefined ? undefined : new Set<Key>(key === null ? [] : [key]);

/**
 * One of a few exclusive options: Low / Medium / High, 1 min / 5 min, Markdown / JSON,
 * Cards / Table (design-spec 4.5).
 */
export function SegmentedControl({
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  size = "M",
  isJustified = false,
  children,
  ...props
}: SegmentedControlProps) {
  return (
    <ToggleButtonGroup
      {...props}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={toSet(selectedKey)}
      defaultSelectedKeys={toSet(defaultSelectedKey)}
      onSelectionChange={(keys) => {
        const [key] = keys;
        if (key !== undefined) onSelectionChange?.(String(key));
      }}
      className={styles.control({ isJustified })}
    >
      <SizeOfControl.Provider value={size}>{children}</SizeOfControl.Provider>
    </ToggleButtonGroup>
  );
}

export interface SegmentedControlItemProps {
  /** The key the control reports when this segment is chosen. */
  id: string;
  isDisabled?: boolean;
  /** An icon alone needs this. */
  "aria-label"?: string;
  children: ReactNode;
}

/** One segment of a SegmentedControl. */
export function SegmentedControlItem({
  children,
  ...props
}: SegmentedControlItemProps) {
  const size = useContext(SizeOfControl);
  return (
    <ToggleButton {...props} className={styles.item({ size })}>
      <IconSlot size={size}>{children}</IconSlot>
    </ToggleButton>
  );
}
