import type { ComponentSize } from "@moonx/ui-tokens";
import { Asterisk } from "lucide-react";
import type { ReactNode } from "react";
import { FieldError, Label, Text } from "react-aria-components";
import { visuallyHidden } from "../../styles.css";
import {
  description as descriptionClass,
  errorMessage as errorClass,
  icon,
  label,
} from "./field.css";

/**
 * Props every field-like component shares. Strings come from the screen (packages/i18n);
 * the component has no text of its own.
 */
export interface FieldProps {
  label: ReactNode;
  description?: ReactNode;
  /** Rendered only while `isInvalid` is true, so it can stay set while the field is valid. */
  errorMessage?: ReactNode;
  isInvalid?: boolean;
  isRequired?: boolean;
  /**
   * Keeps the label for assistive technology and hides it visually, for a field whose meaning is
   * clear from its surroundings, such as a cell under a column heading.
   */
  isLabelHidden?: boolean;
  size?: ComponentSize;
}

export function FieldLabel({
  children,
  isRequired,
  isLabelHidden,
  size,
  id,
}: {
  id?: string;
  children: ReactNode;
  isRequired?: boolean;
  isLabelHidden?: boolean;
  size: ComponentSize;
}) {
  return (
    <Label id={id} className={isLabelHidden ? visuallyHidden : label({ size })}>
      {children}
      {isRequired ? <Asterisk aria-hidden="true" className={icon({ size: "XS" })} /> : null}
    </Label>
  );
}

/** Description and error text under a field. Both stay while the field is invalid. */
export function FieldHelp({
  description,
  errorMessage,
}: Pick<FieldProps, "description" | "errorMessage">) {
  return (
    <>
      {description ? (
        <Text slot="description" className={descriptionClass}>
          {description}
        </Text>
      ) : null}
      {errorMessage ? <FieldError className={errorClass}>{errorMessage}</FieldError> : null}
    </>
  );
}
