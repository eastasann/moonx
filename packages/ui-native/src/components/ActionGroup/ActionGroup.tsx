import type { ComponentSize } from "@moonx/ui-tokens";
import { createContext, type ReactNode, useContext } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useControlledState } from "../../internal/useControlledState";
import { ActionButtonPressable } from "../ActionButton/ActionButton";

export type ActionGroupSelectionMode = "none" | "single" | "multiple";

interface GroupState {
  selectionMode: ActionGroupSelectionMode;
  size: ComponentSize;
  isQuiet: boolean;
  isDisabled: boolean;
  selected: readonly string[];
  toggle: (id: string) => void;
}

const GroupContext = createContext<GroupState>({
  selectionMode: "none",
  size: "M",
  isQuiet: false,
  isDisabled: false,
  selected: [],
  toggle: () => {},
});

export interface ActionGroupProps {
  /** Names the toolbar. Required because the group has no visible label. */
  "aria-label": string;
  /** `none` makes plain action buttons; `single` and `multiple` make them toggles. */
  selectionMode?: ActionGroupSelectionMode;
  /** ids of the selected items (controlled). */
  value?: readonly string[];
  defaultValue?: readonly string[];
  onChange?: (value: string[]) => void;
  size?: ComponentSize;
  isQuiet?: boolean;
  /** Disables every item in all selection modes. */
  isDisabled?: boolean;
  orientation?: "horizontal" | "vertical";
  children: ReactNode;
}

/**
 * A row (or column) of `ActionGroupItem`s. In `single` mode the group is a radio group and the
 * items are radios; in `multiple` mode they are checkboxes, because React Native has no
 * pressed-toggle role. Pressing a selected item in `single` mode clears the selection, as on Web.
 */
export function ActionGroup({
  selectionMode = "none",
  value,
  defaultValue = [],
  onChange,
  size = "M",
  isQuiet = false,
  isDisabled = false,
  orientation = "horizontal",
  children,
  "aria-label": ariaLabel,
}: ActionGroupProps) {
  styles.useVariants({ orientation });
  const [selected, setSelected] = useControlledState<readonly string[]>(
    value,
    defaultValue,
    onChange ? (next) => onChange([...next]) : undefined,
  );
  const toggle = (id: string) => {
    if (selected.includes(id)) setSelected(selected.filter((key) => key !== id));
    else setSelected(selectionMode === "single" ? [id] : [...selected, id]);
  };
  return (
    <GroupContext.Provider value={{ selectionMode, size, isQuiet, isDisabled, selected, toggle }}>
      <View
        role={selectionMode === "single" ? "radiogroup" : "toolbar"}
        aria-label={ariaLabel}
        style={styles.group}
      >
        {children}
      </View>
    </GroupContext.Provider>
  );
}

interface ActionGroupItemBase {
  /** Identifies the item in `value` / `onChange`. */
  id: string;
  isDisabled?: boolean;
  /** Fires in `none` mode. Selection modes report through the group's `onChange`. */
  onPress?: () => void;
  testID?: string;
}

interface ActionGroupItemWithText extends ActionGroupItemBase {
  children: ReactNode;
  icon?: ReactNode;
  "aria-label"?: string;
}

interface ActionGroupItemIconOnly extends ActionGroupItemBase {
  icon: ReactNode;
  children?: undefined;
  "aria-label": string;
}

export type ActionGroupItemProps = ActionGroupItemWithText | ActionGroupItemIconOnly;

export function ActionGroupItem({
  id,
  icon,
  children,
  isDisabled = false,
  onPress,
  testID,
  "aria-label": ariaLabel,
}: ActionGroupItemProps) {
  const group = useContext(GroupContext);
  const toggling = group.selectionMode !== "none";
  const isSelected = toggling && group.selected.includes(id);
  return (
    <ActionButtonPressable
      role={
        group.selectionMode === "single"
          ? "radio"
          : group.selectionMode === "multiple"
            ? "checkbox"
            : "button"
      }
      checked={toggling ? isSelected : undefined}
      size={group.size}
      isQuiet={group.isQuiet}
      isSelected={isSelected}
      isDisabled={group.isDisabled || isDisabled}
      icon={icon}
      aria-label={ariaLabel}
      testID={testID}
      onPress={toggling ? () => group.toggle(id) : onPress}
    >
      {children}
    </ActionButtonPressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  group: {
    gap: theme.space["50"],
    variants: {
      orientation: {
        horizontal: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
        vertical: { flexDirection: "column", alignItems: "stretch" },
      },
    },
  },
}));
