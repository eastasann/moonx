import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Separator, Tooltip, TooltipTrigger } from "react-aria-components";
import { badge, icon, label, link, list, nav, root, separator, slot, tooltip } from "./SideNav.css";
import { useSideNavCollapsed } from "./useSideNavCollapsed";

export interface SideNavItem {
  id: string;
  /** Visible text. In the collapsed sidebar it stays as the accessible name and tooltip. */
  label: string;
  href: string;
  icon: LucideIcon;
  /** Trailing slot, such as a Badge with the unread count. */
  badge?: ReactNode;
  /** Marks the item of the page being shown (`aria-current="page"`). */
  isCurrent?: boolean;
}

export interface SideNavState {
  isCollapsed: boolean;
}

/** A slot receives the collapsed state so a workspace switcher or user menu can drop its label. */
export type SideNavSlot = ReactNode | ((state: SideNavState) => ReactNode);

export interface SideNavProps {
  /** Name of the navigation landmark. */
  "aria-label": string;
  /** Main destinations: Dashboard, Ideas, Self Analysis, Notifications, Decision Log. */
  items: readonly SideNavItem[];
  /** Destinations after a divider: Settings, Admin. */
  secondaryItems?: readonly SideNavItem[];
  /** Top slot: the current workspace and its switcher (M7). */
  workspaceSwitcher: SideNavSlot;
  /** Bottom slot: the user menu. */
  userMenu: SideNavSlot;
  /** Forces the icons-only form. By default it follows the viewport (tablet widths). */
  isCollapsed?: boolean;
}

function renderSlot(content: SideNavSlot, state: SideNavState) {
  return typeof content === "function" ? content(state) : content;
}

function NavLink({ item, isCollapsed }: { item: SideNavItem; isCollapsed: boolean }) {
  const Icon = item.icon;
  const anchor = (
    <Link href={item.href} aria-current={item.isCurrent ? "page" : undefined} className={link}>
      <Icon className={icon} aria-hidden />
      <span className={label}>{item.label}</span>
      {item.badge ? <span className={badge}>{item.badge}</span> : null}
    </Link>
  );
  if (!isCollapsed) return <li>{anchor}</li>;
  return (
    <li>
      <TooltipTrigger>
        {anchor}
        <Tooltip placement="end" className={tooltip}>
          {item.label}
        </Tooltip>
      </TooltipTrigger>
    </li>
  );
}

/**
 * Left sidebar of the app frame (design-spec 6.0.1). Full width from desktop, icons only on
 * tablet, hidden below tablet where `TabBar` takes over.
 */
export function SideNav({
  items,
  secondaryItems,
  workspaceSwitcher,
  userMenu,
  isCollapsed,
  ...props
}: SideNavProps) {
  const viewportCollapsed = useSideNavCollapsed();
  const collapsed = isCollapsed ?? viewportCollapsed;
  const state = { isCollapsed: collapsed };
  return (
    <div className={root} data-collapsed={collapsed}>
      <div className={slot}>{renderSlot(workspaceSwitcher, state)}</div>
      <nav className={nav} aria-label={props["aria-label"]}>
        <ul className={list}>
          {items.map((item) => (
            <NavLink key={item.id} item={item} isCollapsed={collapsed} />
          ))}
        </ul>
        {secondaryItems?.length ? (
          <>
            <Separator className={separator} />
            <ul className={list}>
              {secondaryItems.map((item) => (
                <NavLink key={item.id} item={item} isCollapsed={collapsed} />
              ))}
            </ul>
          </>
        ) : null}
      </nav>
      <div className={slot}>{renderSlot(userMenu, state)}</div>
    </div>
  );
}
