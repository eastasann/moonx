import type { ComponentSize } from "@moonx/ui-tokens";
import * as CheckboxPrimitive from "@rn-primitives/checkbox";
import { Asterisk, Check, Minus } from "lucide-react-native";
import { type ReactNode, useContext } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { FieldHelp, fieldAccessibility } from "../../internal/FieldParts";
import { SizeContext } from "../../internal/SizeContext";
import { sizeVariants } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";
import { useControlledState } from "../../internal/useControlledState";
import { CheckboxGroupContext } from "../CheckboxGroup/context";

export interface CheckboxProps {
  /** Required. Its text is the checkbox's accessible name. */
  children: ReactNode;
  /** Identifies the item inside a `CheckboxGroup`. */
  value?: string;
  isSelected?: boolean;
  defaultSelected?: boolean;
  onChange?: (isSelected: boolean) => void;
  /** Shows the mixed state. The checkbox is announced as "mixed"; pressing it still toggles `isSelected`. */
  isIndeterminate?: boolean;
  isDisabled?: boolean;
  /** Keeps the current state and ignores presses. */
  isReadOnly?: boolean;
  /**
   * Marks the label with an asterisk. React Native has no `aria-required`, so assistive
   * technology is not told; the screen's `errorMessage` carries the rule.
   */
  isRequired?: boolean;
  isInvalid?: boolean;
  description?: ReactNode;
  /** Shown only while `isInvalid` is true, so it can stay set while the checkbox is valid. */
  errorMessage?: ReactNode;
  size?: ComponentSize;
  "aria-label"?: string;
  testID?: string;
}

export function Checkbox({
  children,
  value,
  isSelected,
  defaultSelected = false,
  onChange,
  isIndeterminate = false,
  isDisabled: isDisabledProp = false,
  isReadOnly: isReadOnlyProp = false,
  isRequired = false,
  isInvalid: isInvalidProp = false,
  description,
  errorMessage,
  size: sizeProp,
  "aria-label": ariaLabel,
  testID,
}: CheckboxProps) {
  const { theme } = useUnistyles();
  const group = useContext(CheckboxGroupContext);
  const groupSize = useContext(SizeContext);
  const size = sizeProp ?? groupSize ?? "M";
  const [own, setOwn] = useControlledState(isSelected, defaultSelected, onChange);
  const checked = group && value !== undefined ? group.selected.includes(value) : own;
  const isDisabled = isDisabledProp || (group?.isDisabled ?? false);
  const isReadOnly = isReadOnlyProp || (group?.isReadOnly ?? false);
  const isInvalid = isInvalidProp || (group?.isInvalid ?? false);

  styles.useVariants({
    size,
    selected: checked || isIndeterminate,
    invalid: isInvalid,
    disabled: isDisabled,
  });

  const toggle = (next: boolean) => {
    if (isReadOnly) return;
    // `setOwn` reports to `onChange` itself; a member of a group reports through the group.
    if (group && value !== undefined) {
      group.setSelected(value, next);
      onChange?.(next);
    } else {
      setOwn(next);
    }
  };

  const Glyph = isIndeterminate ? Minus : Check;
  const hasHelp = Boolean(description) || Boolean(isInvalid && errorMessage);
  return (
    <View style={styles.wrapper}>
      <CheckboxPrimitive.Root
        checked={checked}
        onCheckedChange={toggle}
        disabled={isDisabled}
        testID={testID}
        {...fieldAccessibility({ label: "", description, errorMessage, isInvalid })}
        aria-label={ariaLabel}
        aria-checked={isIndeterminate ? "mixed" : checked}
        accessibilityState={{ checked: isIndeterminate ? "mixed" : checked, disabled: isDisabled }}
        style={styles.row}
      >
        {({ pressed }: { pressed: boolean }) => (
          <>
            <View style={styles.box(pressed)}>
              {checked || isIndeterminate ? (
                <View aria-hidden importantForAccessibility="no-hide-descendants">
                  <Glyph
                    size="80%"
                    color={styles.glyph.color}
                    strokeWidth={theme.icon["stroke-width"]}
                  />
                </View>
              ) : null}
            </View>
            <Content textStyle={styles.label} iconSize={theme.scale.component.icon.size.S}>
              {children}
            </Content>
            {isRequired ? (
              <View aria-hidden importantForAccessibility="no-hide-descendants">
                <Asterisk size={theme.scale.component.icon.size.XS} color={styles.label.color} />
              </View>
            ) : null}
          </>
        )}
      </CheckboxPrimitive.Root>
      {hasHelp ? (
        <View style={styles.help}>
          <FieldHelp description={description} errorMessage={errorMessage} isInvalid={isInvalid} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const control = theme.scale.component.checkbox["control-size"];
  const color = theme.color;
  return {
    wrapper: { alignItems: "flex-start" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space["100"],
      minHeight: theme.scale.component["target-min"],
    },
    box: (pressed: boolean) => ({
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      backgroundColor: color.surface.raised,
      borderWidth: theme["border-width"].strong,
      borderColor: pressed ? color.text.secondary : color.border.strong,
      borderRadius: theme.radius.chip,
      variants: {
        size: sizeVariants((s) => ({ width: control[s], height: control[s] })),
        selected: {
          true: {
            backgroundColor: color.control["track-fill"],
            borderColor: color.control["track-fill"],
          },
          false: {},
        },
        invalid: { true: { borderColor: color.negative.fg }, false: {} },
        disabled: { true: {}, false: {} },
      },
      compoundVariants: [
        { invalid: true, selected: true, styles: { backgroundColor: color.negative.fg } },
        {
          disabled: true,
          styles: { backgroundColor: color.control.disabled, borderColor: color.border.hairline },
        },
      ],
    }),
    glyph: {
      color: color.control["on-primary"],
      variants: { disabled: { true: { color: color.text.disabled }, false: {} } },
    },
    label: {
      ...fontStyle(theme, "body"),
      color: color.text.primary,
      variants: {
        size: sizeVariants((s) => ({ fontSize: theme.scale.component.field["font-size"][s] })),
        disabled: { true: { color: color.text.disabled }, false: {} },
      },
    },
    help: {
      variants: {
        size: sizeVariants((s) => ({ marginLeft: control[s] + theme.space["100"] })),
      },
    },
  };
});
