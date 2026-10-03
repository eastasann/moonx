import { type ReactNode, useCallback, useMemo } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  FieldHelp,
  FieldLabel,
  type FieldProps,
  FieldRoot,
  textOf,
} from "../../internal/FieldParts";
import { SizeContext } from "../../internal/SizeContext";
import { useControlledState } from "../../internal/useControlledState";
import { CheckboxGroupContext } from "./context";

export interface CheckboxGroupProps extends FieldProps {
  /** `value` of every checked item. */
  value?: readonly string[];
  defaultValue?: readonly string[];
  onChange?: (value: string[]) => void;
  isDisabled?: boolean;
  /** Keeps the current choice and ignores presses. */
  isReadOnly?: boolean;
  orientation?: "vertical" | "horizontal";
  /** `Checkbox` elements, each with a `value`. They take the group's `size`. */
  children: ReactNode;
  testID?: string;
}

const NONE: readonly string[] = [];

export function CheckboxGroup({
  label,
  description,
  errorMessage,
  isInvalid = false,
  isRequired,
  isLabelHidden,
  size = "M",
  orientation = "vertical",
  value,
  defaultValue = NONE,
  onChange,
  isDisabled = false,
  isReadOnly = false,
  children,
  testID,
}: CheckboxGroupProps) {
  styles.useVariants({ orientation });
  const [selected, setValue] = useControlledState<readonly string[]>(value, defaultValue, (next) =>
    onChange?.([...next]),
  );
  const setSelected = useCallback(
    (item: string, isSelected: boolean) => {
      const without = selected.filter((v) => v !== item);
      setValue(isSelected ? [...without, item] : without);
    },
    [selected, setValue],
  );
  const state = useMemo(
    () => ({ selected, setSelected, isDisabled, isReadOnly, isInvalid }),
    [selected, setSelected, isDisabled, isReadOnly, isInvalid],
  );
  return (
    <SizeContext.Provider value={size}>
      <CheckboxGroupContext.Provider value={state}>
        <FieldRoot size={size} isDisabled={isDisabled} isInvalid={isInvalid}>
          <FieldLabel isRequired={isRequired} isLabelHidden={isLabelHidden}>
            {label}
          </FieldLabel>
          <View role="group" aria-label={textOf(label)} testID={testID} style={styles.list}>
            {children}
          </View>
          <FieldHelp description={description} errorMessage={errorMessage} isInvalid={isInvalid} />
        </FieldRoot>
      </CheckboxGroupContext.Provider>
    </SizeContext.Provider>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.space["100"],
    variants: {
      orientation: {
        vertical: { flexDirection: "column", alignItems: "flex-start" },
        horizontal: { flexDirection: "row", flexWrap: "wrap", columnGap: theme.space["400"] },
      },
    },
  },
}));
