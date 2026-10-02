import type { ComponentSize } from "@moonx/ui-tokens";
import { createContext, type ReactNode, useContext, useRef } from "react";
import { ToggleButtonGroup as AriaToggleButtonGroup, ToggleButton } from "react-aria-components";
import { control, segment } from "./SegmentedControl.css";

const SizeContext = createContext<ComponentSize>("M");

export interface SegmentedControlProps {
  /** Names the control. Required because it has no visible label of its own. */
  "aria-label": string;
  /** `value` of the chosen segment. One segment is always chosen. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  size?: ComponentSize;
  isDisabled?: boolean;
  orientation?: "horizontal" | "vertical";
  /** Required. `SegmentedControlItem` items only. */
  children: ReactNode;
}

/** A single choice with no empty state. Use ToggleButtonGroup when the choice can be cleared. */
export function SegmentedControl({
  value,
  defaultValue,
  onChange,
  size = "M",
  orientation = "horizontal",
  children,
  ...props
}: SegmentedControlProps) {
  // React Aria reports a press on the chosen segment as a selection change to the same key.
  const current = useRef(value ?? defaultValue);
  if (value !== undefined) current.current = value;
  return (
    <SizeContext.Provider value={size}>
      <AriaToggleButtonGroup
        {...props}
        selectionMode="single"
        disallowEmptySelection
        orientation={orientation}
        selectedKeys={value === undefined ? undefined : [value]}
        defaultSelectedKeys={defaultValue === undefined ? undefined : [defaultValue]}
        onSelectionChange={(keys) => {
          const [first] = keys;
          if (first === undefined || String(first) === current.current) return;
          current.current = String(first);
          onChange?.(String(first));
        }}
        className={control({ orientation })}
      >
        {children}
      </AriaToggleButtonGroup>
    </SizeContext.Provider>
  );
}

export interface SegmentedControlItemProps {
  value: string;
  children: ReactNode;
  "aria-label"?: string;
  isDisabled?: boolean;
}

export function SegmentedControlItem({ value, children, ...props }: SegmentedControlItemProps) {
  const size = useContext(SizeContext);
  return (
    <ToggleButton {...props} id={value} className={segment({ size })}>
      {children}
    </ToggleButton>
  );
}
