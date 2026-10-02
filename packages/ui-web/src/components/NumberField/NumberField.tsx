import { LOCALE } from "@moonx/i18n";
import {
  NumberField as AriaNumberField,
  type NumberFieldProps as AriaNumberFieldProps,
  Group,
  I18nProvider,
  Input,
} from "react-aria-components";
import { FieldHelp, FieldLabel, type FieldProps } from "../_internal/FieldParts";
import { bareInput, box, fieldRoot } from "../_internal/field.css";

export interface NumberFieldProps
  extends FieldProps,
    Omit<
      AriaNumberFieldProps,
      "className" | "style" | "children" | "validationBehavior" | "validate" | keyof FieldProps
    > {
  placeholder?: string;
  /**
   * Intl.NumberFormat options for display and parsing, for example `{ style: "currency",
   * currency: "PHP" }` or `{ style: "percent" }`. Parsing and grouping follow en-PH.
   */
  formatOptions?: Intl.NumberFormatOptions;
  /**
   * Called with the text as it is typed. `onChange` only fires when the field is committed (blur
   * or Enter), so a screen that recalculates on every keystroke reads the text here.
   */
  onInputChange?: (text: string) => void;
}

export function NumberField({
  label,
  description,
  errorMessage,
  isRequired,
  isLabelHidden,
  size = "M",
  placeholder,
  onInputChange,
  ...props
}: NumberFieldProps) {
  return (
    <I18nProvider locale={LOCALE}>
      <AriaNumberField
        {...props}
        isRequired={isRequired}
        validationBehavior="aria"
        className={fieldRoot({ size })}
      >
        {({ isInvalid, isDisabled }) => (
          <>
            <FieldLabel isRequired={isRequired} isLabelHidden={isLabelHidden} size={size}>
              {label}
            </FieldLabel>
            <Group
              role="presentation"
              isInvalid={isInvalid}
              isDisabled={isDisabled}
              className={box({ size, numeric: true })}
            >
              <Input
                placeholder={placeholder}
                className={bareInput}
                onChange={(event) => onInputChange?.(event.target.value)}
              />
            </Group>
            <FieldHelp description={description} errorMessage={errorMessage} />
          </>
        )}
      </AriaNumberField>
    </I18nProvider>
  );
}
