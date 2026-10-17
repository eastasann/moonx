import { Menu as MenuIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Button as AriaButton,
  Link as AriaLink,
  type PressEvent,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { IconSlot } from "../internal/IconSlot";
import { NavBadge, useNavItemName } from "../internal/NavBadge";
import type { AppFrameBack } from "./AppFrame";
import { Menu, MenuTrigger } from "./Menu";
import type { NavItem } from "./SideNav";
import * as styles from "./TabBar.css";

/** Whether More's menu is open, and where focus goes in it when something else opened it. */
export interface MoreMenuState {
  isOpen: boolean;
  /**
   * Where focus lands in the menu when ← More opened it: undefined when More itself did,
   * which React Aria then decides for its own press.
   */
  autoFocus?: boolean | "first" | "last";
  onOpenChange: (isOpen: boolean) => void;
}

export interface TabBarProps {
  /** Dashboard, Ideas, Self Analysis, Notifications: those the user may open. */
  items: NavItem[];
  /**
   * The page on screen. One that is not a tab (Decision Log, Account…) marks More, where
   * it is found.
   */
  currentId?: string;
  /**
   * `MenuItem`s of More: Decision Log, Switch workspace, Account, Workspace Settings,
   * Admin, Log out (design-spec 5章「共通ナビ」).
   */
  more: ReactNode;
  /**
   * More's menu, held by the screen so the phone header's ← More of 7・4・9・26 can open it
   * too (`useMoreMenu`). Without it, More alone opens it.
   */
  moreMenu?: MoreMenuState;
}

/**
 * The phone's navigation (design-spec 4.3・6.0.1): a tab per page and More, which opens
 * the rest in a tray. Tablet and wider show the SideNav instead.
 */
export function TabBar({ items, currentId, more, moreMenu }: TabBarProps) {
  const { t } = useTranslation(["components"]);
  const navItemName = useNavItemName();
  const isMoreCurrent =
    currentId !== undefined && !items.some((item) => item.id === currentId);
  return (
    <nav aria-label={t("components:nav.label")} className={styles.tabBar}>
      {items.map((item) => {
        const hasBadge = item.badge !== undefined && item.badge > 0;
        return (
          <AriaLink
            key={item.id}
            href={item.href}
            aria-label={navItemName(item.label, item.badge)}
            aria-current={item.id === currentId ? "page" : undefined}
            className={styles.tab}
          >
            <IconSlot size="L">{item.icon}</IconSlot>
            <span className={styles.label}>{item.label}</span>
            {/* After the name, apart from it: the link's visible text reads
                "Notifications 3", which its name contains (WCAG 2.5.3). */}
            {hasBadge && " "}
            {hasBadge && (
              <span className={styles.badge}>
                <NavBadge count={item.badge ?? 0} appearance="tag" />
              </span>
            )}
          </AriaLink>
        );
      })}
      <MenuTrigger
        isOpen={moreMenu?.isOpen}
        onOpenChange={moreMenu?.onOpenChange}
      >
        <AriaButton
          aria-current={isMoreCurrent ? "true" : undefined}
          className={styles.tab}
        >
          <IconSlot size="L">
            <MenuIcon />
          </IconSlot>
          <span className={styles.label}>{t("components:nav.more")}</span>
        </AriaButton>
        <Menu autoFocus={moreMenu?.autoFocus}>{more}</Menu>
      </MenuTrigger>
    </nav>
  );
}

/**
 * More's menu for a screen the More menu opens (7 Decision Log, 4 Account, 9 Workspace
 * Settings, 26 Admin): `tabBar` goes to the TabBar's `moreMenu`, `back` to AppFrame's
 * `back`, so the phone header reads "← More" and pressing it opens the menu again
 * (design-spec 6.0.1). Focus goes into the menu as it does when More is pressed the same
 * way (the first item from a keyboard or a screen reader, the menu otherwise; ↓ and ↑ the
 * first and last item), and back to ← More when the menu closes.
 */
export function useMoreMenu(): {
  tabBar: MoreMenuState;
  back: AppFrameBack;
} {
  const { t } = useTranslation(["components"]);
  const [state, setState] = useState<{
    isOpen: boolean;
    autoFocus?: boolean | "first" | "last";
  }>({ isOpen: false });
  return {
    tabBar: {
      ...state,
      onOpenChange: (isOpen) => setState({ isOpen }),
    },
    back: {
      label: t("components:nav.more"),
      // React Aria's MenuTrigger: the first item for a keyboard or a virtual press, the
      // menu itself for a mouse or a touch. Always set here, as the trigger's own last
      // choice would otherwise carry over.
      onPress: (event: PressEvent) =>
        setState({
          isOpen: true,
          autoFocus:
            event.pointerType === "keyboard" || event.pointerType === "virtual"
              ? "first"
              : true,
        }),
      menu: {
        isOpen: state.isOpen,
        open: (focus) => setState({ isOpen: true, autoFocus: focus }),
      },
    },
  };
}
