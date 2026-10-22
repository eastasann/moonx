import { i18n } from "@moonx/i18n";
import {
  type EconomicsField,
  fitWithSuffix,
  type TargetType,
} from "@moonx/schemas";

/**
 * The longest row text a label quotes, in characters, as the API's labels (SDD 5.11
 * `HistoryEntry.label`): a label names the item in one line.
 */
const LABEL_TEXT_MAX = 80;

type ListType = Extract<
  TargetType,
  | "research_log_entry"
  | "competitor"
  | "assumption"
  | "risk"
  | "cost_item"
  | "economics_input"
  | "execution_item"
>;

/**
 * An item's name as the API words it (SDD 5.11 `HistoryEntry.label`, catalog
 * `common:itemLabel`): "{list} · {its text}", the text cut at 80 characters with "…",
 * or "Untitled" when empty.
 */
export function rowLabel(type: ListType, text: string | null): string {
  const quoted =
    text === null || text.trim() === ""
      ? i18n.t("common:itemLabel.untitled")
      : fitWithSuffix(text, "", LABEL_TEXT_MAX) === text
        ? text
        : fitWithSuffix(text, "…", LABEL_TEXT_MAX);
  return i18n.t("common:itemLabel.row", {
    list: i18n.t(`common:itemLabel.list.${type}`),
    text: quoted,
  });
}

/**
 * A question's name, "{section} {title}" ("01 WHO"); a question the screen does not know
 * by the end of its ID, as the API names one its version lost.
 */
export const questionLabel = (key: string, title: string | undefined) =>
  i18n.t("common:itemLabel.question", {
    section: key.split(".")[1] ?? "",
    title: title ?? key.split(".").slice(2).join("."),
  });

/** A number of 18's name: "Unit Economics · Price". */
export const economicsLabel = (field: EconomicsField) =>
  rowLabel("economics_input", i18n.t(`common:economicsField.${field}`));
