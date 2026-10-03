import type { ComponentSize } from "@moonx/ui-tokens";
import { Ellipsis } from "lucide-react-native";
import { Pressable } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { atLeastTarget, sizeVariants } from "../../internal/sizes";
import { Menu, type MenuProps } from "../Menu";

export interface ActionMenuProps<T extends object> extends Omit<MenuProps<T>, "trigger"> {
  /** Accessible name of the "⋯" button (and so of the menu), for example "More actions". */
  label: string;
  size?: ComponentSize;
  isDisabled?: boolean;
  testID?: string;
}

interface TriggerProps {
  "aria-label": string;
  size: ComponentSize;
  isDisabled: boolean;
  testID?: string;
  onPress?: () => void;
}

function Trigger({ "aria-label": label, size, isDisabled, testID, onPress }: TriggerProps) {
  styles.useVariants({ size, disabled: isDisabled });
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => styles.trigger(pressed)}
    >
      <Ellipsis
        aria-hidden
        color={styles.icon.color}
        size={styles.icon.width}
        strokeWidth={styles.icon.strokeWidth}
      />
    </Pressable>
  );
}

/** A quiet icon-only "⋯" button that opens a `Menu` (row actions, an idea's actions). */
export function ActionMenu<T extends object>({
  label,
  size = "M",
  isDisabled = false,
  testID,
  ...props
}: ActionMenuProps<T>) {
  return (
    <Menu
      {...props}
      trigger={<Trigger aria-label={label} size={size} isDisabled={isDisabled} testID={testID} />}
    />
  );
}

const styles = StyleSheet.create((theme) => {
  const tokens = theme.scale.component["action-button"];
  const target = theme.scale.component["target-min"];
  const iconSizes = theme.scale.component.icon.size;
  return {
    trigger: (pressed: boolean) => ({
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.control,
      backgroundColor: pressed ? theme.color.surface.sunken : "transparent",
      variants: {
        size: sizeVariants((s) => ({
          minWidth: atLeastTarget(tokens.height[s], target),
          minHeight: atLeastTarget(tokens.height[s], target),
          padding: tokens["padding-icon-only"][s],
        })),
        disabled: { true: {}, false: {} },
      },
    }),
    icon: {
      color: theme.color.text.primary,
      strokeWidth: theme.icon["stroke-width"],
      width: iconSizes.S,
      variants: {
        size: {
          S: { width: iconSizes.XS },
          M: { width: iconSizes.S },
          L: { width: iconSizes.M },
          XL: { width: iconSizes.L },
        },
        disabled: { true: { color: theme.color.text.disabled }, false: {} },
      },
    },
  };
});
