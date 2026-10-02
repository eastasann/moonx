import { OptionItem, type OptionItemProps } from "../_internal/OptionItem";
import { useIsNarrow } from "../ResponsivePopover";
import { NarrowComboBox } from "./NarrowComboBox";
import type { ComboBoxProps } from "./types";
import { WideComboBox } from "./WideComboBox";

export type { ComboBoxProps } from "./types";
export type ComboBoxItemProps = OptionItemProps;
export const ComboBoxItem = OptionItem;

/**
 * Tablet and wider: typing happens in the field and the list drops down as a popover. Below
 * `semantic.breakpoint.tablet`: pressing the field opens a tray that holds its own search field and
 * the list, because a modal tray would hide the field the person is typing in.
 *
 * With `allowsCustomValue` the typed text is a valid value, so `onChange` reports `null` and the
 * text is read from `onInputChange`. In the tray the text is confirmed with Enter or the
 * `customValueLabel` action, and `onInputChange` fires once, on confirmation.
 */
export function ComboBox(props: ComboBoxProps) {
  const narrow = useIsNarrow();
  return narrow ? <NarrowComboBox {...props} /> : <WideComboBox {...props} />;
}
