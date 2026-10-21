import { formatNumberAffixes, formatNumberText } from "@moonx/i18n";
import type { Size } from "@moonx/ui-tokens";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { TextField as AriaTextField, Input } from "react-aria-components";
import {
  FieldHelp,
  FieldLabel,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import * as styles from "../internal/field.css";
import { useFieldWidth, useSize } from "../internal/size";
import { useTableCell } from "../internal/tableCell";
import { useControlledState } from "../internal/useControlledState";
import { useKeepAboveKeyboard } from "../internal/useKeepAboveKeyboard";
import { cssVarName } from "../styles/helpers";

const endPrefixWidthName = cssVarName(styles.endPrefixWidth);

export interface NumberFieldProps extends FieldTextProps {
  /**
   * The text as typed ("1,500.50"). The screen reads the number from it with
   * `numberTextSchema` of packages/schemas, which refuses what the field cannot be sure
   * of, such as "1,5" (design-spec 6.0.8).
   */
  value?: string;
  defaultValue?: string;
  onChange?: (text: string) => void;
  onBlur?: () => void;
  /** ISO 4217 code: the amount's currency symbol shows beside the number. */
  currency?: string;
  /** The number is a percent (15 for 15%): the percent sign shows beside it. */
  isPercent?: boolean;
  /** Whole numbers only (days): the phone shows a keypad without a decimal point. */
  isInteger?: boolean;
  /**
   * Shown faintly while the field is empty: the value used when none is entered (18's
   * operating days "30", design-spec 6.4).
   */
  placeholder?: string;
  /** @default "M"; "L" in a spacious pattern, dialog or `Form` (06 semantic.density) */
  size?: Size;
  /** @default "default" */
  width?: "default" | "full";
  name?: string;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  autoFocus?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * A number input in the en-PH format: amounts with the currency symbol, percents with
 * "%", and the whole part regrouped by thousands when the field loses focus (design-spec
 * 1.2・4.5). It keeps the typed text instead of parsing it, so a value the form refuses
 * stays on screen next to the reason, unchanged (6.0.8). Nothing is rounded, clamped or
 * stepped: those would change a value the user did not choose.
 */
export function NumberField({
  label,
  description,
  descriptionTone,
  errorMessage,
  isInvalid,
  value,
  defaultValue,
  onChange,
  onBlur,
  currency,
  isPercent = false,
  isInteger = false,
  placeholder,
  size,
  width: givenWidth,
  ...props
}: NumberFieldProps) {
  const resolved = useSize(size);
  const width = useFieldWidth(givenWidth);
  const [text, setText] = useControlledState(
    value,
    defaultValue ?? "",
    onChange,
  );
  const frameRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useKeepAboveKeyboard(frameRef);
  const affixId = useId();
  const { prefix, suffix } = currency
    ? formatNumberAffixes({ currency })
    : isPercent
      ? formatNumberAffixes({ percent: true })
      : { prefix: "", suffix: "" };
  const hasAffix = prefix !== "" || suffix !== "";
  // What the input shows: the text, or the placeholder while it is empty.
  const shown = text === "" ? (placeholder ?? "") : text;
  // In a table's number column the digits stay where the cell's value was: at the end.
  const alignsEnd = useTableCell()?.isNumeric ?? false;
  // In a number column the symbol is drawn over the input's start, and the input keeps
  // its width there, measured (the symbol's face may not be the digits').
  const endPrefixRef = useRef<HTMLSpanElement>(null);
  const [endPrefixWidth, setEndPrefixWidth] = useState(0);
  useLayoutEffect(() => {
    const symbol = endPrefixRef.current;
    // The symbol is drawn there only in a number column, and only for an amount.
    if (!alignsEnd || prefix === "" || symbol === null) {
      setEndPrefixWidth(0);
      return;
    }
    const measure = () =>
      setEndPrefixWidth(symbol.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(symbol);
    return () => observer.disconnect();
  }, [alignsEnd, prefix]);
  const input = (
    <Input
      ref={inputRef}
      className={`${styles.input} ${styles.numberInput}${alignsEnd ? ` ${styles.endInput}` : ""}`}
      inputMode={isInteger ? "numeric" : "decimal"}
      autoComplete="off"
      placeholder={placeholder}
    />
  );
  return (
    <AriaTextField
      {...props}
      value={text}
      onChange={setText}
      onBlur={() => {
        // A field that cannot be edited never reports a change, not even regrouping.
        if (!props.isReadOnly && !props.isDisabled) {
          const grouped = formatNumberText(text);
          if (grouped !== text) setText(grouped);
        }
        onBlur?.();
      }}
      isInvalid={invalidOf({ errorMessage, isInvalid })}
      validationBehavior="aria"
      // The symbol sits outside the input, so screen readers hear it as its description.
      aria-describedby={hasAffix ? affixId : undefined}
      className={styles.fieldRoot({ size: resolved, width })}
    >
      {label != null && (
        <FieldLabel label={label} isRequired={props.isRequired} />
      )}
      <div
        ref={frameRef}
        className={`${styles.frame({ size: resolved })}${alignsEnd ? ` ${styles.endFrame}` : ""}`}
        // A press on the frame around an end-aligned input (its empty start, the symbol)
        // types in the input, as a press on the input would.
        onPointerDown={
          alignsEnd
            ? (event) => {
                if (event.target === inputRef.current) return;
                event.preventDefault();
                inputRef.current?.focus();
              }
            : undefined
        }
      >
        {prefix !== "" && !alignsEnd && (
          <span id={affixId} className={styles.affix}>
            {prefix}
          </span>
        )}
        {alignsEnd ? (
          <span
            className={styles.endSizer}
            data-value={`${prefix}${shown}`}
            style={{ [endPrefixWidthName]: `${endPrefixWidth}px` }}
          >
            {input}
            {prefix !== "" && (
              <span className={styles.endPrefix}>
                <span
                  ref={endPrefixRef}
                  id={affixId}
                  className={`${styles.affix} ${styles.endPrefixSymbol}`}
                >
                  {prefix}
                </span>
                <span className={styles.endPrefixText} aria-hidden="true">
                  {shown}
                </span>
              </span>
            )}
          </span>
        ) : (
          input
        )}
        {suffix !== "" && (
          <span
            id={prefix === "" ? affixId : undefined}
            className={styles.affix}
          >
            {suffix}
          </span>
        )}
      </div>
      <FieldHelp
        description={description}
        descriptionTone={descriptionTone}
        errorMessage={errorMessage}
      />
    </AriaTextField>
  );
}
