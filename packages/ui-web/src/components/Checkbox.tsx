import type { Size } from "@moonx/ui-tokens";
import { Check, Minus } from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import {
  Checkbox as AriaCheckbox,
  CheckboxGroup as AriaCheckboxGroup,
  type CheckboxGroupProps as AriaCheckboxGroupProps,
  type CheckboxProps as AriaCheckboxProps,
  CheckboxGroupStateContext,
  FormValidationContext,
  Label,
} from "react-aria-components";
import {
  FieldHelp,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import { IconSlot } from "../internal/IconSlot";
import * as styles from "./choice.css";

const GroupSize = createContext<Size | undefined>(undefined);

export interface CheckboxProps
  extends Pick<
    AriaCheckboxProps,
    | "isSelected"
    | "defaultSelected"
    | "onChange"
    | "isIndeterminate"
    | "isDisabled"
    | "isReadOnly"
    | "isRequired"
    | "value"
    | "name"
    | "autoFocus"
    | "id"
    | "aria-label"
    | "aria-describedby"
  > {
  /** @default the group's size, else "M" */
  size?: Size;
  /** The label beside the box. */
  children?: ReactNode;
}

/**
 * A box to tick on its own, or one of a CheckboxGroup (`value` names it there). A box is
 * shown invalid only through its group, which writes the reason under it: a lone box has
 * nowhere to say why, and a red border alone would rely on colour (design-spec 4.4).
 */
export function Checkbox({ size, children, ...props }: CheckboxProps) {
  const groupSize = useContext(GroupSize);
  const resolved = size ?? groupSize ?? "M";
  const isInGroup = useContext(CheckboxGroupStateContext) !== null;
  const box = (
    <AriaCheckbox
      {...props}
      validationBehavior="aria"
      className={styles.row({ size: resolved })}
    >
      {({ isSelected, isIndeterminate }) => (
        <>
          <span className={styles.box({ size: resolved })}>
            <IconSlot size="XS">
              {isIndeterminate ? <Minus /> : isSelected ? <Check /> : null}
            </IconSlot>
          </span>
          {children != null && (
            <span className={styles.rowLabel}>{children}</span>
          )}
        </>
      )}
    </AriaCheckbox>
  );
  // Outside a group a Form's error for the box's name would turn it red with nowhere to
  // say why; the group shows the reason instead.
  return isInGroup ? (
    box
  ) : (
    <FormValidationContext.Provider value={{}}>
      {box}
    </FormValidationContext.Provider>
  );
}

export interface CheckboxGroupProps
  extends FieldTextProps,
    Pick<
      AriaCheckboxGroupProps,
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
   * @default "M". Not the density's L: 06 semantic.density gives L to fields and Buttons,
   * and the spacious mockups draw boxes, circles and switches at M (s19, s25).
   */
  size?: Size;
  /** `Checkbox`es, each with a `value`. */
  children: ReactNode;
}

/** Several boxes under one label (24's scope, M6's sharing). */
export function CheckboxGroup({
  label,
  description,
  errorMessage,
  isInvalid,
  orientation = "vertical",
  size,
  children,
  ...props
}: CheckboxGroupProps) {
  const resolved = size ?? "M";
  return (
    <AriaCheckboxGroup
      {...props}
      isInvalid={invalidOf({ errorMessage, isInvalid })}
      validationBehavior="aria"
      className={styles.group}
    >
      {label != null && <Label className={styles.groupLabel}>{label}</Label>}
      <div className={styles.options({ orientation })}>
        <GroupSize.Provider value={resolved}>{children}</GroupSize.Provider>
      </div>
      <FieldHelp description={description} errorMessage={errorMessage} />
    </AriaCheckboxGroup>
  );
}
