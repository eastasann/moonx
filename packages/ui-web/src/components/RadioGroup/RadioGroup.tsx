import { type ReactNode, useContext } from "react";
import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  type RadioGroupProps as AriaRadioGroupProps,
} from "react-aria-components";
import { FieldHelp, FieldLabel, type FieldProps } from "../_internal/FieldParts";
import { choiceGroupItems, fieldRoot, fieldRootAuto } from "../_internal/field.css";
import { SizeContext } from "../_internal/SizeContext";
import { indicator, radio } from "./RadioGroup.css";

export interface RadioGroupProps
  extends FieldProps,
    Omit<
      AriaRadioGroupProps,
      "className" | "style" | "children" | "validationBehavior" | "validate" | keyof FieldProps
    > {
  /** Required. `Radio` items only; they take their size from the group. */
  children: ReactNode;
}

export function RadioGroup({
  label,
  description,
  errorMessage,
  isRequired,
  size = "M",
  orientation = "vertical",
  children,
  ...props
}: RadioGroupProps) {
  return (
    <SizeContext.Provider value={size}>
      <AriaRadioGroup
        {...props}
        isRequired={isRequired}
        orientation={orientation}
        validationBehavior="aria"
        className={`${fieldRoot({ size })} ${fieldRootAuto}`}
      >
        <FieldLabel isRequired={isRequired} size={size}>
          {label}
        </FieldLabel>
        <div className={choiceGroupItems({ orientation })}>{children}</div>
        <FieldHelp description={description} errorMessage={errorMessage} />
      </AriaRadioGroup>
    </SizeContext.Provider>
  );
}

export interface RadioProps {
  /** Reported by the group's `onChange` when this radio is chosen. */
  value: string;
  children: ReactNode;
  isDisabled?: boolean;
}

export function Radio({ children, ...props }: RadioProps) {
  const size = useContext(SizeContext) ?? "M";
  return (
    <AriaRadio {...props} className={radio({ size })}>
      <span className={indicator({ size })} />
      {children}
    </AriaRadio>
  );
}
