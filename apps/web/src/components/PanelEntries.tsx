import { ActionButton } from "@moonx/ui-web";
import { History, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOverlay } from "../lib/overlay";
import { useHeaderPanelTarget } from "../lib/panel-target";

/** The Comments and History buttons of the header, for the item the screen registered. */
export function PanelEntries() {
  const { t } = useTranslation("app");
  const target = useHeaderPanelTarget();
  const { openPanel } = useOverlay();
  if (!target) return null;
  return (
    <>
      <ActionButton
        isQuiet
        icon={<MessageSquare />}
        aria-label={t("header.comments")}
        onPress={() => openPanel("comments", target)}
      />
      <ActionButton
        isQuiet
        icon={<History />}
        aria-label={t("header.history")}
        onPress={() => openPanel("history", target)}
      />
    </>
  );
}
