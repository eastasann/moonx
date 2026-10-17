import { Check } from "lucide-react";
import {
  ListBox,
  ListBoxItem,
  type ListBoxProps,
  Text,
} from "react-aria-components";
import { IconSlot } from "./IconSlot";
import * as styles from "./listbox.css";

/** One choice of a Picker or ComboBox. */
export interface ChoiceItem {
  id: string;
  /** The text shown, also used to filter and to type-select. */
  label: string;
  /** A second line under the label. */
  description?: string;
  isDisabled?: boolean;
}

export interface ChoiceListBoxProps
  extends Omit<
    ListBoxProps<ChoiceItem>,
    "items" | "children" | "className" | "style"
  > {
  /** Left out inside a ComboBox, which hands the list its filtered items. */
  items?: Iterable<ChoiceItem>;
}

/** The list of choices inside a Picker's or ComboBox's popover or tray. */
export function ChoiceListBox({ items, ...props }: ChoiceListBoxProps) {
  return (
    <ListBox {...props} items={items} className={styles.listBox}>
      {(item) => (
        <ListBoxItem
          id={item.id}
          textValue={item.label}
          isDisabled={item.isDisabled}
          className={styles.option}
        >
          {({ isSelected }) => (
            <>
              <span className={styles.optionText}>
                <Text slot="label">{item.label}</Text>
                {item.description != null && (
                  <Text slot="description" className={styles.optionDescription}>
                    {item.description}
                  </Text>
                )}
              </span>
              <span className={styles.check}>
                {isSelected && (
                  <IconSlot size="S">
                    <Check />
                  </IconSlot>
                )}
              </span>
            </>
          )}
        </ListBoxItem>
      )}
    </ListBox>
  );
}
