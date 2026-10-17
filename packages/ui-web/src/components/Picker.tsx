import { i18n } from "@moonx/i18n";
import type { Size } from "@moonx/ui-tokens";
import { ChevronDown } from "lucide-react";
import { useId } from "react";
import {
  Button,
  Label,
  Select,
  type SelectProps,
  SelectValue,
  VisuallyHidden,
} from "react-aria-components";
import { type ChoiceItem, ChoiceListBox } from "../internal/ChoiceListBox";
import {
  FieldHelp,
  FieldLabel,
  type FieldTextProps,
  invalidOf,
} from "../internal/FieldHelp";
import { FixedLocale } from "../internal/FixedLocale";
import * as styles from "../internal/field.css";
import { IconSlot } from "../internal/IconSlot";
import { ResponsivePopover } from "../internal/ResponsivePopover";
import { useFieldWidth, useSize } from "../internal/size";

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
  /** Shown while nothing is chosen. @default the catalog's "Select an item" */
  placeholder?: string;
  /** @default "M", or "L" inside a spacious `Form` */
  size?: Size;
  /**
   * `fit` is as wide as its value, beside other fields in a line (9's role to invite as,
   * s09-settings.html); a label inside always fits.
   * @default "default"
   */
  width?: "default" | "full" | "fit";
  /**
   * `inside`: the label in the frame before the value, the frame as wide as both
   * (s06-ideas.html's filters "Stage All ▾", s23-deck.html's "From v1 For advisors").
   * @default "top"
   */
  labelPosition?: "top" | "inside";
}

/**
 * Picks one item from a list: a popover on tablet and wider, a tray on a phone
 * (design-spec 4.5).
 */
export function Picker({
  label,
  description,
  descriptionTone,
  errorMessage,
  isInvalid,
  items,
  onChange,
  placeholder,
  size,
  width: givenWidth,
  labelPosition = "top",
  ...props
}: PickerProps) {
  const isInside = labelPosition === "inside" && label != null;
  // Inside, the button reads its label before its value, as they show ("Stage All"):
  // React Aria names it by the value first.
  const labelTextId = useId();
  const valueTextId = useId();
  const resolved = useSize(size);
  const width = useFieldWidth(givenWidth);
  return (
    <FixedLocale>
      <Select
        {...props}
        placeholder={placeholder ?? i18n.t("components:picker.placeholder")}
        onChange={(key) => onChange?.(key === null ? null : String(key))}
        isInvalid={invalidOf({ errorMessage, isInvalid })}
        validationBehavior="aria"
        className={styles.fieldRoot({
          size: resolved,
          width: isInside ? "fit" : width,
        })}
      >
        {label != null && !isInside && (
          <FieldLabel label={label} isRequired={props.isRequired} />
        )}
        {/* Inside, the label names the list too, out of sight: React Aria's label in the
            button would take presses and turn on keyboard focus rings. */}
        {isInside && (
          <VisuallyHidden>
            <Label elementType="span">{label}</Label>
          </VisuallyHidden>
        )}
        <Button
          aria-labelledby={
            isInside ? `${labelTextId} ${valueTextId}` : undefined
          }
          className={`${styles.frame({ size: resolved })} ${styles.pickerButton} ${styles.pickerDisabled}${
            isInside ? ` ${styles.pickerInside}` : ""
          }`}
        >
          {isInside && (
            <>
              <span id={labelTextId} className={styles.insideLabel}>
                {label}
              </span>
              {/* Keeps the words apart in the button's text, as in its name. */}{" "}
            </>
          )}
          <SelectValue
            className={
              isInside
                ? `${styles.pickerValue} ${styles.insideValue}`
                : styles.pickerValue
            }
          >
            {/* The label alone: the option's description and check stay in the list. */}
            {({ isPlaceholder, selectedText, defaultChildren }) => (
              <span id={valueTextId}>
                {isPlaceholder ? defaultChildren : selectedText}
              </span>
            )}
          </SelectValue>
          <IconSlot size={resolved}>
            <ChevronDown />
          </IconSlot>
        </Button>
        <FieldHelp
          description={description}
          descriptionTone={descriptionTone}
          errorMessage={errorMessage}
        />
        <ResponsivePopover>
          <ChoiceListBox items={items} />
        </ResponsivePopover>
      </Select>
    </FixedLocale>
  );
}
