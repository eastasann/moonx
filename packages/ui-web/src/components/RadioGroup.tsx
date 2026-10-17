import type { RadioGroupVariant, Size } from "@moonx/ui-tokens";
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
import * as styles from "./choice.css";

const GroupContext = createContext<{
  size: Size;
  variant: RadioGroupVariant;
}>({ size: "M", variant: "default" });

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
  /**
   * `cards`: each choice is a card with its title and `description`, side by side (one
   * column on a phone), under the question in a larger type (s19-decision.html). The
   * orientation then has no effect.
   * @default "default"
   */
  variant?: RadioGroupVariant;
  /**
   * @default "M". Not the density's L: 06 semantic.density gives L to fields and Buttons,
   * and the spacious mockups draw boxes, circles and switches at M (s19, s25).
   */
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
  variant = "default",
  size,
  children,
  ...props
}: RadioGroupProps) {
  const resolved = size ?? "M";
  const isCards = variant === "cards";
  return (
    <AriaRadioGroup
      {...props}
      orientation={orientation}
      isInvalid={invalidOf({ errorMessage, isInvalid })}
      validationBehavior="aria"
      className={isCards ? styles.cardGroup : styles.group}
    >
      {label != null && (
        <Label className={isCards ? styles.cardQuestion : styles.groupLabel}>
          {label}
        </Label>
      )}
      <div
        className={
          isCards ? styles.cardOptions : styles.options({ orientation })
        }
      >
        <GroupContext.Provider value={{ size: resolved, variant }}>
          {children}
        </GroupContext.Provider>
      </div>
      <FieldHelp description={description} errorMessage={errorMessage} />
    </AriaRadioGroup>
  );
}

export interface RadioProps
  extends Pick<AriaRadioProps, "value" | "isDisabled" | "id" | "aria-label"> {
  children?: ReactNode;
  /** A line under the choice's name ("Worth planning"); a card's second line in `cards`. */
  description?: ReactNode;
}

/** One choice of a RadioGroup. */
export function Radio({ children, description, ...props }: RadioProps) {
  const { size, variant } = useContext(GroupContext);
  if (variant === "cards") {
    return (
      <AriaRadio {...props} className={styles.card}>
        <span className={`${styles.circle({ size })} ${styles.cardCircle}`} />
        <span className={styles.cardText}>
          {children != null && (
            <span className={styles.cardTitle}>{children}</span>
          )}
          {description != null && (
            <span className={styles.cardDescription}>{description}</span>
          )}
        </span>
      </AriaRadio>
    );
  }
  return (
    <AriaRadio {...props} className={styles.row({ size })}>
      <span className={styles.circle({ size })} />
      {description == null ? (
        children != null && <span className={styles.rowLabel}>{children}</span>
      ) : (
        <span className={styles.cardText}>
          {children != null && (
            <span className={styles.rowLabel}>{children}</span>
          )}
          <span className={styles.cardDescription}>{description}</span>
        </span>
      )}
    </AriaRadio>
  );
}
