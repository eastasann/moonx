import type { CostItem } from "@moonx/schemas";
import { ActionMenu, MenuItem, MenuSeparator } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { useOverlay } from "../../lib/overlay";
import { formatItemTarget } from "../../lib/panel-target";
import type { RowView } from "./CostFields";
import { useRowName } from "./CostFields";

/** What the row menu does to the table; the screen owns the requests. */
export interface RowActions {
  rename: (item: CostItem) => void;
  move: (item: CostItem, direction: "up" | "down") => void;
  remove: (item: CostItem) => void;
}

/**
 * The row's "⋯" menu (design-spec 6.3): Rename, Move up and down, Lump sum, Delete for an editor,
 * and Comments and History for every role.
 */
export function RowMenu({
  view,
  isFirst,
  isLast,
  actions,
}: {
  view: RowView;
  isFirst: boolean;
  isLast: boolean;
  actions: RowActions;
}) {
  const { t } = useTranslation("costs");
  const { openPanel } = useOverlay();
  const { item, draft, api, isReadOnly } = view;
  const name = useRowName(draft);
  const target = formatItemTarget("cost_item", item.id);
  const onAction = (key: string | number) => {
    switch (key) {
      case "rename":
        return actions.rename(item);
      case "up":
        return actions.move(item, "up");
      case "down":
        return actions.move(item, "down");
      case "lumpSum":
        return api.setLumpSum(!draft.isLumpSum);
      case "delete":
        return actions.remove(item);
      case "comments":
        return openPanel("comments", target);
      case "history":
        return openPanel("history", target);
    }
  };
  return (
    <ActionMenu label={t("menu.label", { name })} size="S" onAction={onAction}>
      {isReadOnly ? null : (
        <>
          <MenuItem id="rename">{t("menu.rename")}</MenuItem>
          <MenuItem id="up" isDisabled={isFirst}>
            {t("menu.moveUp")}
          </MenuItem>
          <MenuItem id="down" isDisabled={isLast}>
            {t("menu.moveDown")}
          </MenuItem>
          <MenuItem id="lumpSum">
            {draft.isLumpSum ? t("menu.unmarkLumpSum") : t("menu.lumpSum")}
          </MenuItem>
          <MenuItem id="delete" variant="negative">
            {t("menu.delete")}
          </MenuItem>
          <MenuSeparator />
        </>
      )}
      <MenuItem id="comments">{t("menu.comments")}</MenuItem>
      <MenuItem id="history">{t("menu.history")}</MenuItem>
    </ActionMenu>
  );
}
