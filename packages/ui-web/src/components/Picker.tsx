import type { Size } from "@moonx/ui-tokens";
import { ChevronDown } from "lucide-react";
import {
  Button,
  Label,
  Select,
  type SelectProps,
  SelectValue,
} from "react-aria-components";
import { type ChoiceItem, ChoiceListBox } from "../internal/ChoiceListBox";
import {
  FieldHelp,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import { FixedLocale } from "../internal/FixedLocale";
import * as styles from "../internal/field.css";
import { IconSlot } from "../internal/IconSlot";
import { ResponsivePopover } from "../internal/ResponsivePopover";
import { useSize } from "../internal/size";

export interface PickerProps
  extends FieldTextProps,
    Pick<
      SelectProps<ChoiceItem>,
      | "name"
      | "isDisabled"
      | "isRequired"
      | "autoFocus"
      | "isOpen"
      | "defaultOpen"
      | "onOpenChange"
      | "id"
      | "aria-label"
      | "aria-labelledby"
    > {
  items: Iterable<ChoiceItem>;
  /** The chosen item's `id`, or null for none. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  /** Shown while nothing is chosen. */
  placeholder?: string;
  /** @default "M", or "L" inside a spacious `Form` */
  size?: Size;
  /** @default "default" */
  width?: "default" | "full";
}

/**
 * Picks one item from a list: a popover on tablet and wider, a tray on a phone
 * (design-spec 4.5).
 */
export function Picker({
  label,
  description,
  errorMessage,
  isInvalid,
  items,
  onChange,
  size,
  width = "default",
  ...props
}: PickerProps) {
  const resolved = useSize(size);
  return (
    <FixedLocale>
      <Select
        {...props}
        onChange={(key) => onChange?.(key === null ? null : String(key))}
        isInvalid={invalidOf({ errorMessage, isInvalid })}
        validationBehavior="aria"
        className={styles.fieldRoot({ size: resolved, width })}
      >
        {label != null && <Label className={styles.label}>{label}</Label>}
        <Button
          className={`${styles.frame({ size: resolved })} ${styles.pickerButton}`}
        >
          <SelectValue className={styles.pickerValue}>
            {/* The label alone: the option's description and check stay in the list. */}
            {({ isPlaceholder, selectedText, defaultChildren }) =>
              isPlaceholder ? defaultChildren : selectedText
            }
          </SelectValue>
          <IconSlot size={resolved}>
            <ChevronDown />
          </IconSlot>
        </Button>
        <FieldHelp description={description} errorMessage={errorMessage} />
        <ResponsivePopover>
          <ChoiceListBox items={items} />
        </ResponsivePopover>
      </Select>
    </FixedLocale>
  );
}
