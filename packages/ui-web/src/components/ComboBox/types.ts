import type { ReactNode } from "react";
import type { ComboBoxProps as AriaComboBoxProps } from "react-aria-components";
import type { FieldProps } from "../_internal/FieldParts";

interface ComboBoxBase
  extends FieldProps,
    Omit<
      AriaComboBoxProps<object>,
      | "className"
      | "style"
      | "children"
      | "validationBehavior"
      | "validate"
      | "value"
      | "defaultValue"
      | "onChange"
      | "selectedKey"
      | "defaultSelectedKey"
      | "onSelectionChange"
      | "items"
      | "defaultItems"
      | keyof FieldProps
    > {
  placeholder?: string;
  /** The `id` of the chosen item, or `null` when the text matches none. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  /** Accessible name of the button that opens the list. */
  openLabel: string;
  /** Shown in the list when the typed text matches nothing. Without it the list stays closed. */
  emptyMessage?: string;
  /**
   * `ComboBoxItem` elements, placed directly (not inside a fragment or wrapper component). The
   * tray form reads each item's `id` and text from these elements.
   */
  children: ReactNode;
}

/** `customValueLabel` is the label of the tray's "use this text" action, so it is required with `allowsCustomValue`. */
export type ComboBoxProps = ComboBoxBase &
  (
    | { allowsCustomValue?: false; customValueLabel?: string }
    | { allowsCustomValue: true; customValueLabel: string }
  );
