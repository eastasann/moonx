import type { ComponentSize } from "@moonx/ui-tokens";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, type TextInputProps } from "react-native";
import {
  FieldFrame,
  FieldHelp,
  FieldInput,
  FieldLabel,
  type FieldProps,
  FieldRoot,
  fieldAccessibility,
} from "../../internal/FieldParts";
import { useControlledState } from "../../internal/useControlledState";
import { constrain, createNumberSyntax } from "./numberSyntax";

export interface NumberFieldProps extends FieldProps {
  /** `NaN` while the field is empty, as in the Web part. */
  value?: number;
  defaultValue?: number;
  /**
   * Called with the parsed number when the field is committed (blur or the return key), after
   * snapping to `step` and clamping to `minValue` / `maxValue`. `NaN` for an empty field. A
   * screen that recalculates on every keystroke reads the text from `onInputChange`.
   */
  onChange?: (value: number) => void;
  /** Called with the text as it is typed. */
  onInputChange?: (text: string) => void;
  minValue?: number;
  maxValue?: number;
  /** Snaps a committed value to multiples of `step` counted from `minValue` (or 0). */
  step?: number;
  /**
   * Intl.NumberFormat options for display and parsing, for example `{ style: "currency",
   * currency: "PHP" }` or `{ style: "percent" }`. Parsing and grouping follow en-PH.
   */
  formatOptions?: Intl.NumberFormatOptions;
  placeholder?: string;
  autoFocus?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Accessible name when it must differ from `label`. */
  "aria-label"?: string;
  testID?: string;
  size?: ComponentSize;
}

function keyboardFor(
  formatOptions: Intl.NumberFormatOptions | undefined,
  minValue: number | undefined,
): TextInputProps["keyboardType"] {
  const negative = minValue === undefined || minValue < 0;
  // iOS's numeric pads have no minus key; its punctuation pad does.
  if (negative && Platform.OS === "ios") return "numbers-and-punctuation";
  return formatOptions?.maximumFractionDigits === 0 ? "number-pad" : "decimal-pad";
}

/**
 * Text that shows the number in en-PH (grouping, currency symbol, percent) once the field is
 * left and takes the digits as typed while it has focus. The Web part's stepper keys and wheel
 * have no phone equivalent, and `name` is dropped (nothing is submitted by the platform).
 */
export function NumberField({
  label,
  description,
  errorMessage,
  isInvalid,
  isRequired,
  isLabelHidden,
  size = "M",
  placeholder,
  value,
  defaultValue,
  onChange,
  onInputChange,
  minValue,
  maxValue,
  step,
  formatOptions,
  autoFocus,
  isDisabled = false,
  isReadOnly = false,
  onFocus,
  onBlur,
  "aria-label": ariaLabel,
  testID,
}: NumberFieldProps) {
  const optionsKey = JSON.stringify(formatOptions ?? {});
  // biome-ignore lint/correctness/useExhaustiveDependencies: `optionsKey` is the value of `formatOptions`, which screens usually pass as a new literal each render.
  const syntax = useMemo(() => createNumberSyntax(formatOptions), [optionsKey]);
  const [number, setNumber] = useControlledState(value, defaultValue ?? Number.NaN, onChange);
  const show = (n: number) => (Number.isNaN(n) ? "" : syntax.format(n));
  const [text, setText] = useState(() => show(number));
  const [focused, setFocused] = useState(false);
  const shown = useRef(number);

  // A value changed from outside (reset, recalculation) replaces the text; the field's own commit
  // is already on screen.
  useEffect(() => {
    if (Object.is(shown.current, number)) return;
    shown.current = number;
    setText(show(number));
  });

  const commit = () => {
    // Untouched text can differ from the value by display rounding, so it is not parsed back.
    if (text === show(number)) return;
    const parsed = syntax.parse(text);
    const next = Number.isNaN(parsed)
      ? Number.NaN
      : constrain(parsed, { min: minValue, max: maxValue, step });
    shown.current = next;
    setText(show(next));
    if (!Object.is(next, number)) setNumber(next);
  };

  return (
    <FieldRoot size={size} isDisabled={isDisabled} isInvalid={isInvalid}>
      <FieldLabel isRequired={isRequired} isLabelHidden={isLabelHidden}>
        {label}
      </FieldLabel>
      <FieldFrame isFocused={focused}>
        <FieldInput
          {...fieldAccessibility({ label, description, errorMessage, isInvalid, ariaLabel })}
          testID={testID}
          numeric
          value={text}
          onChangeText={(next) => {
            setText(next);
            onInputChange?.(next);
          }}
          placeholder={placeholder}
          keyboardType={keyboardFor(formatOptions, minValue)}
          autoFocus={autoFocus}
          readOnly={isReadOnly}
          onFocusChange={setFocused}
          onFocus={onFocus}
          onBlur={() => {
            commit();
            onBlur?.();
          }}
          onSubmitEditing={commit}
        />
      </FieldFrame>
      <FieldHelp description={description} errorMessage={errorMessage} isInvalid={isInvalid} />
    </FieldRoot>
  );
}
