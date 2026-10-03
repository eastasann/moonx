import type { ComponentSize } from "@moonx/ui-tokens";
import { Check } from "lucide-react";
import { type ReactElement, type ReactNode, useContext } from "react";
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps as AriaMenuProps,
  MenuSection as AriaMenuSection,
  Header,
  MenuTrigger,
  Separator,
  Text,
} from "react-aria-components";
import { SizeContext } from "../_internal/SizeContext";
import { ResponsivePopover, type ResponsivePopoverProps } from "../ResponsivePopover";
import { check, item, itemLabel, menu, sectionHeader, separator } from "./Menu.css";

export interface MenuProps<T extends object>
  extends Omit<AriaMenuProps<T>, "className" | "style" | "aria-label" | "aria-labelledby"> {
  /**
   * The element that opens the menu. It must be a React Aria pressable such as `Button`; the menu
   * takes its accessible name from it.
   */
  trigger: ReactElement;
  placement?: ResponsivePopoverProps["placement"];
  /** Height, padding and text size of the items. */
  size?: ComponentSize;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A menu in a popover on tablet and wider and in a tray below it. Items are `MenuItem`,
 * optionally grouped with `MenuSection` and `MenuSeparator`.
 */
export function Menu<T extends object>({
  trigger,
  placement,
  size = "M",
  isOpen,
  defaultOpen,
  onOpenChange,
  ...props
}: MenuProps<T>) {
  return (
    <MenuTrigger isOpen={isOpen} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger}
      <ResponsivePopover placement={placement}>
        <SizeContext.Provider value={size}>
          <AriaMenu {...props} className={menu} />
        </SizeContext.Provider>
      </ResponsivePopover>
    </MenuTrigger>
  );
}

export interface MenuItemProps extends Omit<AriaMenuItemProps, "className" | "style" | "children"> {
  /** `negative` marks a destructive action such as Delete. */
  variant?: "default" | "negative";
  children: ReactNode;
}

export function MenuItem({ variant = "default", children, ...props }: MenuItemProps) {
  const size = useContext(SizeContext) ?? "M";
  return (
    <AriaMenuItem {...props} className={item({ variant, size })}>
      {({ isSelected }) => (
        <>
          <Text slot="label" className={itemLabel}>
            {children}
          </Text>
          {isSelected ? <Check aria-hidden className={check} /> : null}
        </>
      )}
    </AriaMenuItem>
  );
}

export interface MenuSectionProps {
  /** Heading of the group. It is also the accessible name of the group. */
  title: string;
  children: ReactNode;
}

export function MenuSection({ title, children }: MenuSectionProps) {
  return (
    <AriaMenuSection>
      <Header className={sectionHeader}>{title}</Header>
      {children}
    </AriaMenuSection>
  );
}

export function MenuSeparator() {
  return <Separator className={separator} />;
}
