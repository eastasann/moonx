import { ActionButton, Badge, Flex } from "@moonx/ui-web";
import { History, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCommentCount } from "../lib/comments";
import { useOverlay } from "../lib/overlay";
import { useHeaderPanelTarget } from "../lib/panel-target";

/** The Comments and History buttons of the header, for the item the screen registered. */
export function PanelEntries() {
  const { t } = useTranslation("app");
  const { target, commentTarget } = useHeaderPanelTarget();
  const { openPanel } = useOverlay();
  const count = useCommentCount(commentTarget);
  return (
    <>
      {commentTarget ? (
        <Flex gap="space-25" align="center">
          <ActionButton
            isQuiet
            icon={<MessageSquare />}
            aria-label={t("header.comments")}
            onPress={() => openPanel("comments", commentTarget)}
          />
          {count > 0 ? (
            <Badge variant="informative" size="S">
              {count > 99 ? "99+" : count}
            </Badge>
          ) : null}
        </Flex>
      ) : null}
      {target ? (
        <ActionButton
          isQuiet
          icon={<History />}
          aria-label={t("header.history")}
          onPress={() => openPanel("history", target)}
        />
      ) : null}
    </>
  );
}
