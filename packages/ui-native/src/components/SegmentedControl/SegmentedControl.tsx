import type { ComponentSize } from "@moonx/ui-tokens";
import * as ToggleGroupPrimitive from "@rn-primitives/toggle-group";
import { createContext, type ReactNode, useContext } from "react";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { atLeastTarget, sizeVariants } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";
import { useControlledState } from "../../internal/useControlledState";

const SizeContext = createContext<ComponentSize>("M");

export interface SegmentedControlProps {
  /** Names the control. Required because it has no visible label of its own. */
  "aria-label": string;
  /** `value` of the chosen segment. One segment is always chosen once the user picks one. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  size?: ComponentSize;
  isDisabled?: boolean;
  orientation?: "horizontal" | "vertical";
  /** Required. `SegmentedControlItem` items only. */
  children: ReactNode;
  testID?: string;
}

/** A single choice with no empty state. Use ToggleButtonGroup when the choice can be cleared. */
export function SegmentedControl({
  value,
  defaultValue,
  onChange,
  size = "M",
  orientation = "horizontal",
  isDisabled = false,
  children,
  "aria-label": ariaLabel,
  testID,
}: SegmentedControlProps) {
  styles.useVariants({ orientation });
  const [current, setCurrent] = useControlledState<string | undefined>(value, defaultValue);
  return (
    <SizeContext.Provider value={size}>
      <ToggleGroupPrimitive.Root
        type="single"
        value={current}
        onValueChange={(next) => {
          // The primitive reports a press on the chosen segment as undefined; there is no empty state.
          if (next === undefined || next === current) return;
          setCurrent(next);
          onChange?.(next);
        }}
        disabled={isDisabled}
        aria-label={ariaLabel}
        testID={testID}
        style={styles.control}
      >
        {children}
      </ToggleGroupPrimitive.Root>
    </SizeContext.Provider>
  );
}

export interface SegmentedControlItemProps {
  value: string;
  children: ReactNode;
  "aria-label"?: string;
  isDisabled?: boolean;
  testID?: string;
}

export function SegmentedControlItem({
  value,
  children,
  isDisabled: isDisabledProp = false,
  "aria-label": ariaLabel,
  testID,
}: SegmentedControlItemProps) {
  const size = useContext(SizeContext);
  const root = ToggleGroupPrimitive.useRootContext();
  const selected = root.value === value;
  // A disabled group has to look disabled on every item, not only block the presses.
  const isDisabled = isDisabledProp || Boolean(root.disabled);
  styles.useVariants({ size, selected, disabled: isDisabled });
  return (
    <ToggleGroupPrimitive.Item
      value={value}
      disabled={isDisabled}
      aria-label={ariaLabel}
      testID={testID}
      style={({ pressed }: { pressed: boolean }) => styles.segment(pressed)}
    >
      <Content textStyle={styles.label} iconSize={styles.icon.width}>
        {children}
      </Content>
    </ToggleGroupPrimitive.Item>
  );
}

const styles = StyleSheet.create((theme) => {
  const color = theme.color;
  const action = theme.scale.component["action-button"];
  const target = theme.scale.component["target-min"];
  return {
    control: {
      alignSelf: "flex-start",
      padding: theme.space["50"],
      gap: theme.space["50"],
      backgroundColor: color.control.secondary,
      borderRadius: theme.radius.control,
      variants: {
        orientation: {
          horizontal: { flexDirection: "row", alignItems: "stretch" },
          vertical: { flexDirection: "column", alignItems: "stretch" },
        },
      },
    },
    segment: (pressed: boolean) => ({
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      minWidth: target,
      backgroundColor: pressed ? color.control["secondary-pressed"] : "transparent",
      borderRadius: theme.radius.chip,
      variants: {
        size: sizeVariants((s) => ({
          minHeight: atLeastTarget(action.height[s], target),
          paddingHorizontal: action["padding-x"][s],
        })),
        selected: {
          true: {
            backgroundColor: pressed ? color.control["primary-pressed"] : color.control.primary,
          },
          false: {},
        },
        disabled: { true: { backgroundColor: "transparent" }, false: {} },
      },
    }),
    label: {
      ...fontStyle(theme, "button"),
      color: color.control["on-secondary"],
      variants: {
        size: sizeVariants((s) => ({ fontSize: theme.scale.component.button["font-size"][s] })),
        selected: { true: { color: color.control["on-primary"] }, false: {} },
        disabled: { true: { color: color.text.disabled }, false: {} },
      },
    },
    icon: { width: theme.scale.component.icon.size.S },
  };
});
