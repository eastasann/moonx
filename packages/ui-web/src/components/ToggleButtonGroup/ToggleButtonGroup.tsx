import type { ComponentSize } from "@moonx/ui-tokens";
import { createContext, type ReactNode, useContext } from "react";
import { ToggleButtonGroup as AriaToggleButtonGroup, ToggleButton } from "react-aria-components";
import { group, item } from "./ToggleButtonGroup.css";

const SizeContext = createContext<ComponentSize>("M");

export interface ToggleButtonGroupProps {
  /** Names the group. Required because the buttons carry only a letter or icon. */
  "aria-label": string;
  /** `value` of the chosen item, or `null` for none. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  size?: ComponentSize;
  isDisabled?: boolean;
  orientation?: "horizontal" | "vertical";
  /** Required. `ToggleButtonGroupItem` items only. */
  children: ReactNode;
}

const toKeys = (value: string | null | undefined) =>
  value === undefined ? undefined : new Set(value === null ? [] : [value]);

/**
 * A single choice that can be cleared: pressing the chosen item again deselects it.
 * Use SegmentedControl when one item must always be chosen.
 */
export function ToggleButtonGroup({
  value,
  defaultValue,
  onChange,
  size = "M",
  orientation = "horizontal",
  children,
  ...props
}: ToggleButtonGroupProps) {
  return (
    <SizeContext.Provider value={size}>
      <AriaToggleButtonGroup
        {...props}
        selectionMode="single"
        disallowEmptySelection={false}
        orientation={orientation}
        selectedKeys={toKeys(value)}
        defaultSelectedKeys={toKeys(defaultValue)}
        onSelectionChange={(keys) => {
          const [first] = keys;
          onChange?.(first === undefined ? null : String(first));
        }}
        className={group({ orientation })}
      >
        {children}
      </AriaToggleButtonGroup>
    </SizeContext.Provider>
  );
}

export interface ToggleButtonGroupItemProps {
  /** Reported by the group's `onChange`. */
  value: string;
  children: ReactNode;
  /** Names the item when `children` is a letter or an icon. */
  "aria-label"?: string;
  isDisabled?: boolean;
}

export function ToggleButtonGroupItem({ value, children, ...props }: ToggleButtonGroupItemProps) {
  const size = useContext(SizeContext);
  return (
    <ToggleButton {...props} id={value} className={item({ size })}>
      {children}
    </ToggleButton>
  );
}
