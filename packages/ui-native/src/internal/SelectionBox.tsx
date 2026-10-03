import { Check, Minus } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export interface SelectionBoxProps {
  isSelected: boolean;
  isIndeterminate?: boolean;
  isDisabled?: boolean;
}

/**
 * The drawn checkbox of a selectable row. Hidden from assistive technology: the row or the
 * `SelectionCheckbox` around it carries the state.
 */
export function SelectionBox({
  isSelected,
  isIndeterminate = false,
  isDisabled = false,
}: SelectionBoxProps) {
  const { theme } = useUnistyles();
  const on = isSelected || isIndeterminate;
  styles.useVariants({ on, disabled: isDisabled });
  const Glyph = isIndeterminate ? Minus : Check;
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants" style={styles.box}>
      {on ? (
        <Glyph
          size={theme.scale.component.icon.size.XS}
          color={styles.glyph.color}
          strokeWidth={theme.icon["stroke-width"]}
        />
      ) : null}
    </View>
  );
}

export interface SelectionCheckboxProps extends SelectionBoxProps {
  onPress: () => void;
  "aria-label": string;
  testID?: string;
}

/**
 * A checkbox of its own beside a row's content. The pressable is the touch target (44 or more);
 * the box inside stays small.
 */
export function SelectionCheckbox({
  onPress,
  "aria-label": ariaLabel,
  testID,
  ...state
}: SelectionCheckboxProps) {
  return (
    <Pressable
      role="checkbox"
      aria-label={ariaLabel}
      aria-checked={state.isIndeterminate ? "mixed" : state.isSelected}
      aria-disabled={state.isDisabled ?? false}
      disabled={state.isDisabled}
      testID={testID}
      onPress={onPress}
      style={styles.target}
    >
      <SelectionBox {...state} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => {
  const size = theme.scale.component.checkbox["control-size"].M;
  return {
    target: {
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      minWidth: theme.scale.component["target-min"],
      minHeight: theme.scale.component["target-min"],
    },
    box: {
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      borderWidth: theme["border-width"].strong,
      borderRadius: theme.radius.chip,
      backgroundColor: theme.color.surface.raised,
      borderColor: theme.color.border.strong,
      variants: {
        on: {
          true: {
            backgroundColor: theme.color.control.primary,
            borderColor: theme.color.control.primary,
          },
          false: {},
        },
        disabled: {
          true: {
            backgroundColor: theme.color.control.disabled,
            borderColor: theme.color.border.hairline,
          },
          false: {},
        },
      },
    },
    glyph: {
      color: theme.color.control["on-primary"],
      variants: { disabled: { true: { color: theme.color.text.disabled }, false: {} } },
    },
  };
});
