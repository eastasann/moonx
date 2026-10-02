import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button, ListBox, Select, type SelectProps, SelectValue } from "react-aria-components";
import { FieldHelp, FieldLabel, type FieldProps } from "../_internal/FieldParts";
import { box, fieldRoot, icon, listbox, valueText } from "../_internal/field.css";
import { OptionItem, type OptionItemProps } from "../_internal/OptionItem";
import { SizeContext } from "../_internal/SizeContext";
import { ResponsivePopover } from "../ResponsivePopover";

export interface PickerProps
  extends FieldProps,
    Omit<
      SelectProps<object>,
      | "className"
      | "style"
      | "children"
      | "validationBehavior"
      | "validate"
      | "value"
      | "defaultValue"
      | "onChange"
      | "selectionMode"
      | keyof FieldProps
    > {
  /** Text shown while nothing is chosen. */
  placeholder?: string;
  /** The `id` of the chosen item, or `null` for none. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  /** Required. `PickerItem` items only. */
  children: ReactNode;
}

export type PickerItemProps = OptionItemProps;
export const PickerItem = OptionItem;

/** Opens as a popover on tablet and wider, and as a tray on a phone. */
export function Picker({
  label,
  description,
  errorMessage,
  isRequired,
  isLabelHidden,
  size = "M",
  value,
  defaultValue,
  onChange,
  children,
  ...props
}: PickerProps) {
  return (
    <SizeContext.Provider value={size}>
      <Select
        {...props}
        isRequired={isRequired}
        validationBehavior="aria"
        value={value}
        defaultValue={defaultValue}
        onChange={(key) => onChange?.(key === null ? null : String(key))}
        className={fieldRoot({ size })}
      >
        <FieldLabel isRequired={isRequired} isLabelHidden={isLabelHidden} size={size}>
          {label}
        </FieldLabel>
        <Button className={box({ size })}>
          <SelectValue className={valueText} />
          <ChevronDown aria-hidden="true" className={icon({ size })} />
        </Button>
        <FieldHelp description={description} errorMessage={errorMessage} />
        <ResponsivePopover>
          <ListBox className={listbox}>{children}</ListBox>
        </ResponsivePopover>
      </Select>
    </SizeContext.Provider>
  );
}
