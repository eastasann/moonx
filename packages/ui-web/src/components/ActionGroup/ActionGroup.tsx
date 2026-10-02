import type { ComponentSize } from "@moonx/ui-tokens";
import { createContext, type ReactNode, useContext } from "react";
import {
  Button as AriaButton,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
} from "react-aria-components";
import { ActionButtonContent } from "../ActionButton/ActionButton";
import { actionButton } from "../ActionButton/ActionButton.css";
import { actionGroup } from "./ActionGroup.css";

export type ActionGroupSelectionMode = "none" | "single" | "multiple";

interface GroupState {
  selectionMode: ActionGroupSelectionMode;
  size: ComponentSize;
  isQuiet: boolean;
  isDisabled: boolean;
}

const GroupContext = createContext<GroupState>({
  selectionMode: "none",
  size: "M",
  isQuiet: false,
  isDisabled: false,
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

export function ActionGroup({
  selectionMode = "none",
  value,
  defaultValue,
  onChange,
  size = "M",
  isQuiet = false,
  isDisabled = false,
  orientation = "horizontal",
  children,
  ...props
}: ActionGroupProps) {
  const className = actionGroup({ orientation });
  return (
    <GroupContext.Provider value={{ selectionMode, size, isQuiet, isDisabled }}>
      {selectionMode === "none" ? (
        <Toolbar aria-label={props["aria-label"]} orientation={orientation} className={className}>
          {children}
        </Toolbar>
      ) : (
        <ToggleButtonGroup
          aria-label={props["aria-label"]}
          isDisabled={isDisabled}
          orientation={orientation}
          selectionMode={selectionMode}
          selectedKeys={value ? new Set(value) : undefined}
          defaultSelectedKeys={defaultValue ? new Set(defaultValue) : undefined}
          onSelectionChange={(keys) => onChange?.([...keys].map(String))}
          className={className}
        >
          {children}
        </ToggleButtonGroup>
      )}
    </GroupContext.Provider>
  );
}

interface ActionGroupItemBase {
  /** Identifies the item in `value` / `onChange`. */
  id: string;
  isDisabled?: boolean;
  /** Fires in `none` mode. Selection modes report through the group's `onChange`. */
  onPress?: () => void;
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
  isDisabled,
  onPress,
  "aria-label": ariaLabel,
}: ActionGroupItemProps) {
  const { selectionMode, size, isQuiet, isDisabled: groupDisabled } = useContext(GroupContext);
  const disabled = groupDisabled || isDisabled;
  const iconOnly = children === undefined || children === null;
  const className = actionButton({ size, quiet: isQuiet, iconOnly });
  const content = (
    <ActionButtonContent icon={icon} size={size}>
      {children}
    </ActionButtonContent>
  );
  if (selectionMode === "none") {
    return (
      <AriaButton
        aria-label={ariaLabel}
        isDisabled={disabled}
        onPress={onPress}
        className={className}
      >
        {content}
      </AriaButton>
    );
  }
  return (
    <ToggleButton id={id} aria-label={ariaLabel} isDisabled={disabled} className={className}>
      {content}
    </ToggleButton>
  );
}
