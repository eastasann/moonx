import type { Size } from "@moonx/ui-tokens";
import { createContext, type ReactNode, useContext } from "react";
import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  type RadioGroupProps as AriaRadioGroupProps,
  type RadioProps as AriaRadioProps,
  Label,
} from "react-aria-components";
import {
  FieldHelp,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import { useSize } from "../internal/size";
import * as styles from "./choice.css";

const GroupSize = createContext<Size>("M");

export interface RadioGroupProps
  extends FieldTextProps,
    Pick<
      AriaRadioGroupProps,
      | "value"
      | "defaultValue"
      | "onChange"
      | "isDisabled"
      | "isReadOnly"
      | "isRequired"
      | "name"
      | "id"
      | "aria-label"
      | "aria-labelledby"
    > {
  /** @default "vertical" */
  orientation?: "vertical" | "horizontal";
  /** @default "M", or "L" inside a spacious `Form` */
  size?: Size;
  /** `Radio`s. */
  children: ReactNode;
}

/** One choice of a few, all in view (Proceed / Hold / Drop, Go / No-Go). */
export function RadioGroup({
  label,
  description,
  errorMessage,
  isInvalid,
  orientation = "vertical",
  size,
  children,
  ...props
}: RadioGroupProps) {
  const resolved = useSize(size);
  return (
    <AriaRadioGroup
      {...props}
      orientation={orientation}
      isInvalid={invalidOf({ errorMessage, isInvalid })}
      validationBehavior="aria"
      className={styles.group}
    >
      {label != null && <Label className={styles.groupLabel}>{label}</Label>}
      <div className={styles.options({ orientation })}>
        <GroupSize.Provider value={resolved}>{children}</GroupSize.Provider>
      </div>
      <FieldHelp description={description} errorMessage={errorMessage} />
    </AriaRadioGroup>
  );
}

export interface RadioProps
  extends Pick<AriaRadioProps, "value" | "isDisabled" | "id" | "aria-label"> {
  children?: ReactNode;
}

/** One choice of a RadioGroup. */
export function Radio({ children, ...props }: RadioProps) {
  const size = useContext(GroupSize);
  return (
    <AriaRadio {...props} className={styles.row({ size })}>
      <span className={styles.circle({ size })} />
      {children != null && <span className={styles.rowLabel}>{children}</span>}
    </AriaRadio>
  );
}
