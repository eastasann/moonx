import type { ReactNode } from "react";
import {
  CheckboxGroup as AriaCheckboxGroup,
  type CheckboxGroupProps as AriaCheckboxGroupProps,
} from "react-aria-components";
import { FieldHelp, FieldLabel, type FieldProps } from "../_internal/FieldParts";
import { choiceGroupItems, fieldRoot, fieldRootAuto } from "../_internal/field.css";
import { SizeContext } from "../_internal/SizeContext";

export interface CheckboxGroupProps
  extends FieldProps,
    Omit<
      AriaCheckboxGroupProps,
      "className" | "style" | "children" | "validationBehavior" | "validate" | keyof FieldProps
    > {
  orientation?: "vertical" | "horizontal";
  /** `Checkbox` elements, each with a `value`. They take the group's `size`. */
  children: ReactNode;
}

export function CheckboxGroup({
  label,
  description,
  errorMessage,
  isRequired,
  isLabelHidden,
  size = "M",
  orientation = "vertical",
  children,
  ...props
}: CheckboxGroupProps) {
  return (
    <SizeContext.Provider value={size}>
      <AriaCheckboxGroup
        {...props}
        isRequired={isRequired}
        validationBehavior="aria"
        className={`${fieldRoot({ size })} ${fieldRootAuto}`}
      >
        <FieldLabel isRequired={isRequired} isLabelHidden={isLabelHidden} size={size}>
          {label}
        </FieldLabel>
        <div className={choiceGroupItems({ orientation })}>{children}</div>
        <FieldHelp description={description} errorMessage={errorMessage} />
      </AriaCheckboxGroup>
    </SizeContext.Provider>
  );
}
