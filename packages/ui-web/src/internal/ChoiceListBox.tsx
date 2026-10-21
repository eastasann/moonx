import { Check } from "lucide-react";
import {
  ListBox,
  ListBoxItem,
  type ListBoxProps,
  Text,
  VisuallyHidden,
} from "react-aria-components";
import { IconSlot } from "./IconSlot";
import * as styles from "./listbox.css";

/** One choice of a Picker or ComboBox. */
export interface ChoiceItem {
  id: string;
  /** The text shown, also used to filter and to type-select. */
  label: string;
  /**
   * The words read out and typed to find it, where the label shown is a mark: 17's "—"
   * for a Can Reduce? not answered is "Undecided".
   */
  spokenLabel?: string;
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
          textValue={item.spokenLabel ?? item.label}
          isDisabled={item.isDisabled}
          className={styles.option}
        >
          {({ isSelected }) => (
            <>
              <span className={styles.optionText}>
                <Text slot="label">
                  <ChoiceLabel item={item} />
                </Text>
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

/** A choice's label as shown, read as its spoken label where it has one. */
export function ChoiceLabel({ item }: { item: ChoiceItem }) {
  if (item.spokenLabel === undefined) return <>{item.label}</>;
  return (
    <>
      <span aria-hidden="true">{item.label}</span>
      <VisuallyHidden elementType="span">{item.spokenLabel}</VisuallyHidden>
    </>
  );
}
