import type { ComponentSize } from "@moonx/ui-tokens";
import * as ToggleGroupPrimitive from "@rn-primitives/toggle-group";
import { createContext, type ReactNode, useContext } from "react";
import { StyleSheet } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { atLeastTarget, sizeVariants } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";
import { useControlledState } from "../../internal/useControlledState";

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
  testID?: string;
}

/**
 * A single choice that can be cleared: pressing the chosen item again deselects it.
 * Use SegmentedControl when one item must always be chosen.
 */
export function ToggleButtonGroup({
  value,
  defaultValue = null,
  onChange,
  size = "M",
  orientation = "horizontal",
  isDisabled = false,
  children,
  "aria-label": ariaLabel,
  testID,
}: ToggleButtonGroupProps) {
  styles.useVariants({ orientation });
  const [current, setCurrent] = useControlledState<string | null>(value, defaultValue, onChange);
  return (
    <SizeContext.Provider value={size}>
      <ToggleGroupPrimitive.Root
        type="single"
        value={current ?? undefined}
        onValueChange={(next) => setCurrent(next ?? null)}
        disabled={isDisabled}
        aria-label={ariaLabel}
        testID={testID}
        style={styles.group}
      >
        {children}
      </ToggleGroupPrimitive.Root>
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
  testID?: string;
}

export function ToggleButtonGroupItem({
  value,
  children,
  isDisabled: isDisabledProp = false,
  "aria-label": ariaLabel,
  testID,
}: ToggleButtonGroupItemProps) {
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
      style={({ pressed }: { pressed: boolean }) => styles.item(pressed)}
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
    group: {
      alignSelf: "flex-start",
      gap: theme.space["75"],
      variants: {
        orientation: {
          horizontal: { flexDirection: "row", alignItems: "center" },
          vertical: { flexDirection: "column", alignItems: "stretch" },
        },
      },
    },
    item: (pressed: boolean) => ({
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      minWidth: target,
      backgroundColor: pressed ? color.control.secondary : color.surface.raised,
      borderWidth: theme["border-width"].strong,
      borderColor: color.border.strong,
      borderRadius: theme.radius.control,
      variants: {
        size: sizeVariants((s) => ({
          minHeight: atLeastTarget(action.height[s], target),
          paddingHorizontal: action["padding-x"][s],
        })),
        selected: {
          true: {
            backgroundColor: color.surface.selected,
            borderColor: color.control["track-fill"],
          },
          false: {},
        },
        disabled: {
          true: { backgroundColor: color.control.disabled, borderColor: color.border.hairline },
          false: {},
        },
      },
    }),
    label: {
      ...fontStyle(theme, "button"),
      color: color.text.primary,
      variants: {
        size: sizeVariants((s) => ({ fontSize: theme.scale.component.button["font-size"][s] })),
        disabled: { true: { color: color.text.disabled }, false: {} },
      },
    },
    icon: { width: theme.scale.component.icon.size.S },
  };
});
