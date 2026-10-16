import { i18n } from "@moonx/i18n";
import type { Size, SizeWithXS } from "@moonx/ui-tokens";
import { Ellipsis } from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps as AriaMenuProps,
  MenuTrigger as AriaMenuTrigger,
  type MenuTriggerProps as AriaMenuTriggerProps,
  Text,
} from "react-aria-components";
import { FixedLocale } from "../internal/FixedLocale";
import { IconSlot } from "../internal/IconSlot";
import { ResponsivePopover } from "../internal/ResponsivePopover";
import { ActionButtonBase } from "./ActionButton";
import * as styles from "./Menu.css";

const MenuSizeContext = createContext<Size>("M");

export interface MenuTriggerProps
  extends Pick<
    AriaMenuTriggerProps,
    "isOpen" | "defaultOpen" | "onOpenChange"
  > {
  /** The button that opens it, then the `Menu`. */
  children: ReactNode;
}

/** Opens the `Menu` inside it from the button before it ("AI ▼"). */
export function MenuTrigger(props: MenuTriggerProps) {
  return <AriaMenuTrigger {...props} />;
}

export interface MenuProps
  extends Pick<
    AriaMenuProps<object>,
    "onAction" | "disabledKeys" | "aria-label" | "aria-labelledby"
  > {
  /** @default "M" */
  size?: Size;
  /** `MenuItem`s. */
  children: ReactNode;
}

/**
 * A list of actions in a popover on tablet and wider, in a tray on a phone
 * (design-spec 4.5). Choosing an item, Escape or a press outside closes it, and focus
 * returns to the button that opened it.
 */
export function Menu({ size = "M", children, ...props }: MenuProps) {
  return (
    <FixedLocale>
      <ResponsivePopover>
        <MenuSizeContext.Provider value={size}>
          <AriaMenu {...props} className={styles.menu}>
            {children}
          </AriaMenu>
        </MenuSizeContext.Provider>
      </ResponsivePopover>
    </FixedLocale>
  );
}

export interface MenuItemProps
  extends Pick<
    AriaMenuItemProps,
    "id" | "href" | "routerOptions" | "isDisabled" | "onAction" | "textValue"
  > {
  /** The label. */
  children: ReactNode;
  /** A second line under the label. */
  description?: ReactNode;
  /** A Lucide icon before the label. */
  icon?: ReactNode;
}

/**
 * One action of a `Menu`. With `href` it moves to that page through the app's router
 * (design-spec 4.5 RouterProvider), as "Export for AI" opens 24.
 */
export function MenuItem({
  children,
  description,
  icon,
  ...props
}: MenuItemProps) {
  const size = useContext(MenuSizeContext);
  return (
    <AriaMenuItem
      {...props}
      textValue={
        props.textValue ?? (typeof children === "string" ? children : undefined)
      }
      className={styles.menuItem[size]}
    >
      {icon !== undefined && <IconSlot size={size}>{icon}</IconSlot>}
      <span className={styles.itemText}>
        <Text slot="label">{children}</Text>
        {description !== undefined && (
          <Text slot="description" className={styles.itemDescription}>
            {description}
          </Text>
        )}
      </span>
    </AriaMenuItem>
  );
}

export interface ActionMenuProps
  extends Pick<MenuProps, "onAction" | "disabledKeys">,
    Pick<AriaMenuTriggerProps, "isOpen" | "defaultOpen" | "onOpenChange"> {
  /**
   * The ⋯ button's size.
   * @default "M"
   */
  size?: SizeWithXS;
  /** @default "M" */
  menuSize?: Size;
  /** @default true */
  isQuiet?: boolean;
  isDisabled?: boolean;
  /** @default the catalog's "More actions" */
  "aria-label"?: string;
  /** `MenuItem`s. */
  children: ReactNode;
}

/** The ⋯ button of a row or an idea, opening its actions (duplicate, archive, update). */
export function ActionMenu({
  size = "M",
  menuSize = "M",
  isQuiet = true,
  isDisabled,
  "aria-label": label,
  onAction,
  disabledKeys,
  children,
  ...state
}: ActionMenuProps) {
  return (
    <MenuTrigger {...state}>
      <ActionButtonBase
        size={size}
        isQuiet={isQuiet}
        isDisabled={isDisabled}
        aria-label={label ?? i18n.t("components:actionMenu.label")}
      >
        <Ellipsis />
      </ActionButtonBase>
      <Menu size={menuSize} onAction={onAction} disabledKeys={disabledKeys}>
        {children}
      </Menu>
    </MenuTrigger>
  );
}
