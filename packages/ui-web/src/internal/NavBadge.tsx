import { formatCount, i18n } from "@moonx/i18n";
import { Badge } from "../components/Badge";
import * as styles from "./NavBadge.css";

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
 * The unread count of a navigation item (design-spec 4.5 Badge): the number alone at the
 * end of SideNav's row (`text`), or the small ink tag over TabBar's icon (`tag`). The
 * item's name carries the count for screen readers (`navItemName`).
 */
export function NavBadge({
  count,
  appearance,
}: {
  count: number;
  appearance: "text" | "tag";
}) {
  return (
    <span aria-hidden="true">
      {appearance === "text" ? (
        <span className={styles.count}>{formatCount(count)}</span>
      ) : (
        <Badge fillStyle="bold">{formatCount(count)}</Badge>
      )}
    </span>
  );
}
