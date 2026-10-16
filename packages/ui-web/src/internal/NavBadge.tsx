import { formatCount, i18n } from "@moonx/i18n";
import { Badge } from "../components/Badge";

/** A navigation item's name, with its unread count when there is one ("Notifications, 3 unread"). */
export function navItemName(label: string, count = 0): string {
  return count > 0
    ? i18n.t("components:nav.itemUnread", {
        label,
        count,
        formatted: formatCount(count),
      })
    : label;
}

/**
 * The unread count of a navigation item: the ink badge (design-spec 4.5 Badge). The
 * item's name carries the count for screen readers (`navItemName`).
 */
export function NavBadge({ count }: { count: number }) {
  return (
    <span aria-hidden="true">
      <Badge fillStyle="bold">{formatCount(count)}</Badge>
    </span>
  );
}
