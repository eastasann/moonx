import type { ComponentSize } from "@moonx/ui-tokens";
import { Asterisk, Check, Minus } from "lucide-react";
import { type ReactNode, useContext, useId } from "react";
import {
  Checkbox as AriaCheckbox,
  type CheckboxProps as AriaCheckboxProps,
} from "react-aria-components";
import { ChoiceHelp, describedBy } from "../_internal/ChoiceHelp";
import { icon } from "../_internal/field.css";
import { SizeContext } from "../_internal/SizeContext";
import { box, checkbox, helpIndent, wrapper } from "./Checkbox.css";

export interface CheckboxProps
  extends Omit<
    AriaCheckboxProps,
    "className" | "style" | "children" | "validationBehavior" | "validate" | "aria-describedby"
  > {
  /** Required. Its text is the checkbox's accessible name. */
  children: ReactNode;
  description?: ReactNode;
  /** Rendered only while `isInvalid` is true, so it can stay set while the checkbox is valid. */
  errorMessage?: ReactNode;
  size?: ComponentSize;
}

export function Checkbox({
  children,
  description,
  errorMessage,
  size: sizeProp,
  isInvalid,
  isRequired,
  ...props
}: CheckboxProps) {
  const groupSize = useContext(SizeContext);
  const size = sizeProp ?? groupSize ?? "M";
  const id = useId();
  const ids = { descriptionId: `${id}-description`, errorId: `${id}-error` };
  return (
    <div className={wrapper}>
      <AriaCheckbox
        {...props}
        isInvalid={isInvalid}
        isRequired={isRequired}
        validationBehavior="aria"
        aria-describedby={describedBy({ ...ids, description, errorMessage, isInvalid })}
        className={checkbox({ size })}
      >
        {({ isSelected, isIndeterminate }) => (
          <>
            <span className={box({ size })}>
              {isIndeterminate ? (
                <Minus aria-hidden="true" />
              ) : isSelected ? (
                <Check aria-hidden="true" />
              ) : null}
            </span>
            {children}
            {isRequired ? <Asterisk aria-hidden="true" className={icon({ size: "XS" })} /> : null}
          </>
        )}
      </AriaCheckbox>
      <ChoiceHelp
        {...ids}
        description={description}
        errorMessage={errorMessage}
        isInvalid={isInvalid}
        indentClassName={helpIndent({ size })}
      />
    </div>
  );
}
