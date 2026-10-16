import { i18n } from "@moonx/i18n";
import { ChevronsUpDown } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import { NavBadge, navItemName } from "../internal/NavBadge";
import { useIsDesktop } from "../internal/useIsDesktop";
import { Avatar } from "./Avatar";
import { Divider } from "./Divider";
import { Menu, MenuTrigger } from "./Menu";
import * as styles from "./SideNav.css";
import { Tooltip, TooltipTrigger } from "./Tooltip";

/** A page of the common navigation (design-spec 5章「共通ナビ」). */
export interface NavItem {
  id: string;
  /** Its name: "Dashboard", "Ideas", "Self Analysis", "Notifications"… */
  label: string;
  /** A Lucide icon. */
  icon: ReactNode;
  href: string;
  /** The unread count beside Notifications; 0 or none shows nothing. */
  badge?: number;
}

export interface SideNavProps {
  /** The current workspace, at the top; pressing it opens M7. */
  workspaceName: string;
  onWorkspacePress: () => void;
  /** Dashboard, Ideas, Self Analysis, Notifications, Decision Log (those the user may open). */
  items: NavItem[];
  /** Settings and Admin, after a rule; only those the user may open. */
  secondaryItems?: NavItem[];
  /** The item of the page on screen (`aria-current="page"`). */
  currentId?: string;
  /** The signed-in user, at the bottom: their avatar and name open `userMenu`. */
  user: { name: string; avatarSrc?: string | null };
  /** `MenuItem`s of the account menu: Account, Log out. */
  userMenu: ReactNode;
}

/**
 * The sidebar of AppFrame (design-spec 4.3・6.0.1): the workspace, the pages and the
 * account. Names beside the icons on a desktop, icons alone on a tablet (their names in
 * tooltips), and nothing on a phone, where the TabBar takes its place.
 */
export function SideNav({
  workspaceName,
  onWorkspacePress,
  items,
  secondaryItems = [],
  currentId,
  user,
  userMenu,
}: SideNavProps) {
  // On a desktop the names are on screen; a tooltip would repeat them.
  const hasTooltips = !useIsDesktop();
  return (
    <nav aria-label={i18n.t("components:nav.label")} className={styles.sideNav}>
      <TooltipTrigger isDisabled={!hasTooltips}>
        <AriaButton
          aria-label={i18n.t("components:nav.workspace", {
            name: workspaceName,
          })}
          onPress={onWorkspacePress}
          className={styles.workspace}
        >
          <span className={styles.label}>{workspaceName}</span>
          <IconSlot size="M">
            <ChevronsUpDown />
          </IconSlot>
        </AriaButton>
        <Tooltip placement="end">{workspaceName}</Tooltip>
      </TooltipTrigger>
      {[items, secondaryItems]
        .filter((group) => group.length > 0)
        .map((group, index) => (
          <Fragment key={group[0]?.id}>
            {index > 0 && <Divider size="S" />}
            <ul className={styles.list}>
              {group.map((item) => {
                const hasBadge = item.badge !== undefined && item.badge > 0;
                return (
                  <li key={item.id}>
                    <TooltipTrigger isDisabled={!hasTooltips}>
                      <AriaLink
                        href={item.href}
                        aria-label={navItemName(item.label, item.badge)}
                        aria-current={
                          item.id === currentId ? "page" : undefined
                        }
                        className={styles.item}
                      >
                        <IconSlot size="M">{item.icon}</IconSlot>
                        <span className={styles.label}>{item.label}</span>
                        {/* The space keeps the name and the count apart in the
                            link's visible text, which its name must contain
                            (WCAG 2.5.3). */}
                        {hasBadge && " "}
                        {hasBadge && (
                          <span className={styles.badge}>
                            <NavBadge count={item.badge ?? 0} />
                          </span>
                        )}
                      </AriaLink>
                      <Tooltip placement="end">{item.label}</Tooltip>
                    </TooltipTrigger>
                  </li>
                );
              })}
            </ul>
          </Fragment>
        ))}
      <MenuTrigger>
        <TooltipTrigger isDisabled={!hasTooltips}>
          {/* Named by the user's name; the menu trigger tells it opens a menu. */}
          <AriaButton className={styles.account}>
            <Avatar name={user.name} src={user.avatarSrc} />
            <span className={styles.label}>{user.name}</span>
            <span className={styles.chevron}>
              <IconSlot size="S">
                <ChevronsUpDown />
              </IconSlot>
            </span>
          </AriaButton>
          <Tooltip placement="end">{user.name}</Tooltip>
        </TooltipTrigger>
        <Menu>{userMenu}</Menu>
      </MenuTrigger>
    </nav>
  );
}
