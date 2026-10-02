import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Link } from "react-aria-components";
import { badge, cell, icon, iconWrap, item, label, root } from "./TabBar.css";

interface TabBarItemBase {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Slot over the icon's corner, such as a Badge with the unread count. */
  badge?: ReactNode;
  /** Marks the tab of the page being shown (`aria-current="page"`). */
  isCurrent?: boolean;
}

/** A tab that navigates (Dashboard, Ideas, Self Analysis, Notifications). */
export interface TabBarLinkItem extends TabBarItemBase {
  href: string;
  onPress?: never;
  isExpanded?: never;
}

/** A tab that opens something instead of navigating (More, which opens the menu tray). */
export interface TabBarActionItem extends TabBarItemBase {
  onPress: () => void;
  href?: never;
  /** Reflects whether the tray the tab opens is showing. */
  isExpanded?: boolean;
}

export type TabBarItem = TabBarLinkItem | TabBarActionItem;

export interface TabBarProps {
  /** Name of the navigation landmark. */
  "aria-label": string;
  /** Five tabs in order: Dashboard, Ideas, Self Analysis, Notifications, More. */
  items: readonly TabBarItem[];
}

function TabContent({ tab }: { tab: TabBarItem }) {
  const Icon = tab.icon;
  return (
    <>
      <span className={iconWrap}>
        <Icon className={icon} aria-hidden />
        {tab.badge ? <span className={badge}>{tab.badge}</span> : null}
      </span>
      <span className={label}>{tab.label}</span>
    </>
  );
}

/**
 * Bottom tab bar of the phone-width app frame (design-spec 6.0.1), fixed to the bottom edge and
 * hidden from tablet width up where `SideNav` takes over.
 */
export function TabBar({ items, ...props }: TabBarProps) {
  return (
    <nav aria-label={props["aria-label"]}>
      <ul className={root}>
        {items.map((tab) => (
          <li key={tab.id} className={cell}>
            {tab.href !== undefined ? (
              <Link
                href={tab.href}
                aria-current={tab.isCurrent ? "page" : undefined}
                className={item}
              >
                <TabContent tab={tab} />
              </Link>
            ) : (
              <Button
                onPress={tab.onPress}
                aria-expanded={tab.isExpanded}
                aria-haspopup={tab.isExpanded === undefined ? undefined : "dialog"}
                className={item}
              >
                <TabContent tab={tab} />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
