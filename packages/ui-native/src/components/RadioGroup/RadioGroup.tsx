import * as RadioPrimitive from "@rn-primitives/radio-group";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import {
  FieldHelp,
  FieldLabel,
  type FieldProps,
  FieldRoot,
  textOf,
  useFieldState,
} from "../../internal/FieldParts";
import { SizeContext } from "../../internal/SizeContext";
import { sizeVariants } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";
import { useControlledState } from "../../internal/useControlledState";

interface RadioGroupState {
  value: string | null;
  isInvalid: boolean;
}
const RadioGroupContext = createContext<RadioGroupState>({ value: null, isInvalid: false });

export interface RadioGroupProps extends FieldProps {
  /** `value` of the chosen radio, or `null` for none. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  isDisabled?: boolean;
  /** Keeps the current choice and ignores presses. */
  isReadOnly?: boolean;
  orientation?: "vertical" | "horizontal";
  /** Required. `Radio` items only; they take their size from the group. */
  children: ReactNode;
  testID?: string;
}

export function RadioGroup({
  label,
  description,
  errorMessage,
  isInvalid = false,
  isRequired,
  isLabelHidden,
  size = "M",
  orientation = "vertical",
  value,
  defaultValue = null,
  onChange,
  isDisabled = false,
  isReadOnly = false,
  children,
  testID,
}: RadioGroupProps) {
  styles.useVariants({ orientation });
  const [current, setCurrent] = useControlledState<string | null>(value, defaultValue);
  const state = useMemo(() => ({ value: current, isInvalid }), [current, isInvalid]);
  return (
    <SizeContext.Provider value={size}>
      <RadioGroupContext.Provider value={state}>
        <FieldRoot size={size} isDisabled={isDisabled} isInvalid={isInvalid}>
          <FieldLabel isRequired={isRequired} isLabelHidden={isLabelHidden}>
            {label}
          </FieldLabel>
          <RadioPrimitive.Root
            value={current ?? undefined}
            onValueChange={(next) => {
              if (isReadOnly) return;
              setCurrent(next);
              onChange?.(next);
            }}
            disabled={isDisabled}
            aria-label={textOf(label)}
            testID={testID}
            style={styles.list}
          >
            {children}
          </RadioPrimitive.Root>
          <FieldHelp description={description} errorMessage={errorMessage} isInvalid={isInvalid} />
        </FieldRoot>
      </RadioGroupContext.Provider>
    </SizeContext.Provider>
  );
}

export interface RadioProps {
  /** Reported by the group's `onChange` when this radio is chosen. */
  value: string;
  children: ReactNode;
  isDisabled?: boolean;
  testID?: string;
}

/** Ratio of the ring to the control when chosen; the same as the Web part. */
const SELECTED_RING_RATIO = 0.3;

export function Radio({ value, children, isDisabled: isDisabledProp = false, testID }: RadioProps) {
  const { theme } = useUnistyles();
  const size = useContext(SizeContext) ?? "M";
  const group = useContext(RadioGroupContext);
  // A disabled group has to look disabled on every radio, not only block the presses.
  const field = useFieldState();
  const isDisabled = isDisabledProp || field.isDisabled;
  const selected = group.value === value;
  const control = theme.scale.component["radio-button"]["control-size"][size];
  styles.useVariants({ size, selected, invalid: group.isInvalid, disabled: isDisabled });
  return (
    <RadioPrimitive.Item value={value} disabled={isDisabled} testID={testID} style={styles.row}>
      {({ pressed }: { pressed: boolean }) => (
        <>
          <View
            style={[
              styles.indicator(pressed),
              selected ? { borderWidth: control * SELECTED_RING_RATIO } : null,
            ]}
          />
          <Content textStyle={styles.label} iconSize={theme.scale.component.icon.size.S}>
            {children}
          </Content>
        </>
      )}
    </RadioPrimitive.Item>
  );
}

const styles = StyleSheet.create((theme) => {
  const color = theme.color;
  const control = theme.scale.component["radio-button"]["control-size"];
  return {
    list: {
      gap: theme.space["100"],
      variants: {
        orientation: {
          vertical: { flexDirection: "column", alignItems: "flex-start" },
          horizontal: { flexDirection: "row", flexWrap: "wrap", columnGap: theme.space["400"] },
        },
      },
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space["100"],
      minHeight: theme.scale.component["target-min"],
    },
    indicator: (pressed: boolean) => ({
      flexShrink: 0,
      borderRadius: theme.radius.pill,
      backgroundColor: color.surface.raised,
      borderWidth: theme["border-width"].strong,
      borderColor: pressed ? color.text.secondary : color.border.strong,
      variants: {
        size: sizeVariants((s) => ({ width: control[s], height: control[s] })),
        selected: { true: { borderColor: color.control["track-fill"] }, false: {} },
        invalid: { true: { borderColor: color.negative.fg }, false: {} },
        disabled: { true: {}, false: {} },
      },
      compoundVariants: [
        {
          disabled: true,
          styles: { backgroundColor: color.control.disabled, borderColor: color.border.hairline },
        },
        { disabled: true, selected: true, styles: { borderColor: color.text.disabled } },
      ],
    }),
    label: {
      ...fontStyle(theme, "body"),
      color: color.text.primary,
      variants: {
        size: sizeVariants((s) => ({ fontSize: theme.scale.component.field["font-size"][s] })),
        disabled: { true: { color: color.text.disabled }, false: {} },
      },
    },
  };
});
