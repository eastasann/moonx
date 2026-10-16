import { formatNumberAffixes, formatNumberText } from "@moonx/i18n";
import type { Size } from "@moonx/ui-tokens";
import { useId, useRef } from "react";
import {
  TextField as AriaTextField,
  Input,
  Label,
} from "react-aria-components";
import {
  FieldHelp,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import * as styles from "../internal/field.css";
import { useSize } from "../internal/size";
import { useControlledState } from "../internal/useControlledState";
import { useKeepAboveKeyboard } from "../internal/useKeepAboveKeyboard";

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
  /** @default "M", or "L" inside a spacious `Form` */
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
  errorMessage,
  isInvalid,
  value,
  defaultValue,
  onChange,
  onBlur,
  currency,
  isPercent = false,
  isInteger = false,
  size,
  width = "default",
  ...props
}: NumberFieldProps) {
  const resolved = useSize(size);
  const [text, setText] = useControlledState(
    value,
    defaultValue ?? "",
    onChange,
  );
  const frameRef = useRef<HTMLDivElement>(null);
  useKeepAboveKeyboard(frameRef);
  const affixId = useId();
  const { prefix, suffix } = currency
    ? formatNumberAffixes({ currency })
    : isPercent
      ? formatNumberAffixes({ percent: true })
      : { prefix: "", suffix: "" };
  const hasAffix = prefix !== "" || suffix !== "";
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
      {label != null && <Label className={styles.label}>{label}</Label>}
      <div ref={frameRef} className={styles.frame({ size: resolved })}>
        {prefix !== "" && (
          <span id={affixId} className={styles.affix}>
            {prefix}
          </span>
        )}
        <Input
          className={`${styles.input} ${styles.numberInput}`}
          inputMode={isInteger ? "numeric" : "decimal"}
          autoComplete="off"
        />
        {suffix !== "" && (
          <span
            id={prefix === "" ? affixId : undefined}
            className={styles.affix}
          >
            {suffix}
          </span>
        )}
      </div>
      <FieldHelp description={description} errorMessage={errorMessage} />
    </AriaTextField>
  );
}
