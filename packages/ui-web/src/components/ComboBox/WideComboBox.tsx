import { ChevronDown } from "lucide-react";
import { ComboBox as AriaComboBox, Button, Group, Input, ListBox } from "react-aria-components";
import { FieldHelp, FieldLabel } from "../_internal/FieldParts";
import { bareInput, box, fieldRoot, icon, inlineButton, listbox } from "../_internal/field.css";
import { SizeContext } from "../_internal/SizeContext";
import { ResponsivePopover } from "../ResponsivePopover";
import type { ComboBoxProps } from "./types";

/** The popover form: typing happens in the field and the list drops down under it. */
export function WideComboBox({
  label,
  description,
  errorMessage,
  isRequired,
  isLabelHidden,
  size = "M",
  placeholder,
  value,
  defaultValue,
  onChange,
  openLabel,
  emptyMessage,
  children,
  ...props
}: ComboBoxProps) {
  return (
    <SizeContext.Provider value={size}>
      <AriaComboBox
        {...props}
        isRequired={isRequired}
        validationBehavior="aria"
        allowsEmptyCollection={Boolean(emptyMessage)}
        selectedKey={value}
        defaultSelectedKey={defaultValue}
        onSelectionChange={(key) => onChange?.(key === null ? null : String(key))}
        className={fieldRoot({ size })}
      >
        <FieldLabel isRequired={isRequired} isLabelHidden={isLabelHidden} size={size}>
          {label}
        </FieldLabel>
        <Group role="presentation" className={box({ size })}>
          <Input placeholder={placeholder} className={bareInput} />
          <Button aria-label={openLabel} className={inlineButton}>
            <ChevronDown aria-hidden="true" className={icon({ size })} />
          </Button>
        </Group>
        <FieldHelp description={description} errorMessage={errorMessage} />
        <ResponsivePopover>
          <ListBox
            className={listbox}
            renderEmptyState={emptyMessage ? () => emptyMessage : undefined}
          >
            {children}
          </ListBox>
        </ResponsivePopover>
      </AriaComboBox>
    </SizeContext.Provider>
  );
}
