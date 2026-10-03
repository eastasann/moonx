import { formatCount } from "@moonx/i18n";
import { ActionButton, Badge, Flex } from "@moonx/ui-web";
import { History, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOverlay } from "../lib/overlay";

/** The number of comments on an item as a small badge; nothing when there are none. */
export function CommentCountBadge({ count }: { count: number }) {
  return count > 0 ? (
    <Badge variant="informative" size="S">
      {formatCount(count)}
    </Badge>
  ) : null;
}

/**
 * The quiet Comments and History buttons next to one item (design-spec 6.0.4, 6.0.5). `target` is
 * `<targetType>:<targetId>[:<targetKey>]`; the buttons open the panels for it.
 */
export function ItemPanelButtons({
  target,
  commentCount = 0,
  showHistory = true,
}: {
  target: string;
  commentCount?: number;
  showHistory?: boolean;
}) {
  const { t } = useTranslation("panels");
  const { openPanel } = useOverlay();
  return (
    <Flex gap="space-50" align="center">
      <ActionButton
        isQuiet
        size="S"
        icon={<MessageSquare />}
        aria-label={t("item.comments")}
        onPress={() => openPanel("comments", target)}
      />
      <CommentCountBadge count={commentCount} />
      {showHistory ? (
        <ActionButton
          isQuiet
          size="S"
          icon={<History />}
          aria-label={t("item.history")}
          onPress={() => openPanel("history", target)}
        />
      ) : null}
    </Flex>
  );
}
