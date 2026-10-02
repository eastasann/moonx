import {
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  Input,
} from "react-aria-components";
import { FieldHelp, FieldLabel, type FieldProps } from "../_internal/FieldParts";
import { box, fieldRoot } from "../_internal/field.css";

export interface TextFieldProps
  extends FieldProps,
    Omit<
      AriaTextFieldProps,
      "className" | "style" | "children" | "validationBehavior" | "validate" | keyof FieldProps
    > {
  placeholder?: string;
}

/**
 * Validation is the screen's job (Zod schemas through TanStack Form), so the field only shows the
 * `isInvalid` and `errorMessage` it is given and never runs browser validation.
 */
export function TextField({
  label,
  description,
  errorMessage,
  isRequired,
  size = "M",
  placeholder,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField
      {...props}
      isRequired={isRequired}
      validationBehavior="aria"
      className={fieldRoot({ size })}
    >
      <FieldLabel isRequired={isRequired} size={size}>
        {label}
      </FieldLabel>
      <Input placeholder={placeholder} className={box({ size })} />
      <FieldHelp description={description} errorMessage={errorMessage} />
    </AriaTextField>
  );
}
