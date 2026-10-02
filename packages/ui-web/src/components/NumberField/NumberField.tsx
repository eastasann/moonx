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
}

export function NumberField({
  label,
  description,
  errorMessage,
  isRequired,
  size = "M",
  placeholder,
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
            <FieldLabel isRequired={isRequired} size={size}>
              {label}
            </FieldLabel>
            <Group
              role="presentation"
              isInvalid={isInvalid}
              isDisabled={isDisabled}
              className={box({ size, numeric: true })}
            >
              <Input placeholder={placeholder} className={bareInput} />
            </Group>
            <FieldHelp description={description} errorMessage={errorMessage} />
          </>
        )}
      </AriaNumberField>
    </I18nProvider>
  );
}
