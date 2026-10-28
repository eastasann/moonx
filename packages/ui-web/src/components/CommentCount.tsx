import { formatCount } from "@moonx/i18n";
import { MessageSquare } from "lucide-react";
import { VisuallyHidden } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { IconSlot } from "../internal/IconSlot";
import * as styles from "./CommentCount.css";

export interface CommentCountProps {
  /** How many comments the item has; none shows nothing. */
  count: number;
}

/**
 * How many comments an item has, beside it in a list's row or a table's (design-spec
 * 6.0.4: 14 and 16's rows, 17 and 18's): the comments' mark and the number, as 15's card
 * shows them, read as "2 comments". It only tells: the thread opens from the item's 💬.
 */
export function CommentCount({ count }: CommentCountProps) {
  const { t } = useTranslation(["components"]);
  if (count <= 0) return null;
  return (
    <span className={styles.commentCount}>
      <IconSlot size="XS">
        <MessageSquare />
      </IconSlot>
      <span aria-hidden="true">{formatCount(count)}</span>
      <VisuallyHidden>
        {t("components:commentCount.comments", {
          count,
          formatted: formatCount(count),
        })}
      </VisuallyHidden>
    </span>
  );
}
