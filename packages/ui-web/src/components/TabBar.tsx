import { Menu as MenuIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { IconSlot } from "../internal/IconSlot";
import { NavBadge, useNavItemName } from "../internal/NavBadge";
import { Menu, MenuTrigger } from "./Menu";
import type { NavItem } from "./SideNav";
import * as styles from "./TabBar.css";

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
}

/**
 * The phone's navigation (design-spec 4.3・6.0.1): a tab per page and More, which opens
 * the rest in a tray. Tablet and wider show the SideNav instead.
 */
export function TabBar({ items, currentId, more }: TabBarProps) {
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
      <MenuTrigger>
        <AriaButton
          aria-current={isMoreCurrent ? "true" : undefined}
          className={styles.tab}
        >
          <IconSlot size="L">
            <MenuIcon />
          </IconSlot>
          <span className={styles.label}>{t("components:nav.more")}</span>
        </AriaButton>
        <Menu>{more}</Menu>
      </MenuTrigger>
    </nav>
  );
}
