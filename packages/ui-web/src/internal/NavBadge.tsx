import { formatCount } from "@moonx/i18n";
import { useTranslation } from "react-i18next";
import { Badge } from "../components/Badge";
import * as styles from "./NavBadge.css";

/**
 * Names a navigation item, with its unread count when there is one ("Notifications, 3
 * unread").
 */
export function useNavItemName(): (label: string, count?: number) => string {
  const { t } = useTranslation(["components"]);
  return (label, count = 0) =>
    count > 0
      ? t("components:nav.itemUnread", {
          label,
          count,
          formatted: formatCount(count),
        })
      : label;
}

/**
 * The unread count of a navigation item (design-spec 4.5 Badge): the number alone at the
 * end of SideNav's row (`text`), or the small ink tag over TabBar's icon (`tag`). The
 * item's name carries the count for screen readers (`useNavItemName`).
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
