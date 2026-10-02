import type { AnswerType, ExecutionType } from "@moonx/schemas";
import type { TFunction } from "i18next";

/** The name of an answer type in the pickers of screen 27. */
export function answerTypeLabel(t: TFunction, type: AnswerType) {
  switch (type) {
    case "long_text":
      return t("admin:edit.answerTypes.long_text");
    case "short_text":
      return t("admin:edit.answerTypes.short_text");
    case "choice":
      return t("admin:edit.answerTypes.choice");
    case "amount_with_reason":
      return t("admin:edit.answerTypes.amount_with_reason");
    case "table":
      return t("admin:edit.answerTypes.table");
    case "linked_metric":
      return t("admin:edit.answerTypes.linked_metric");
    case "execution_view":
      return t("admin:edit.answerTypes.execution_view");
  }
}

/** The name of an execution list in the pickers and the preview of screen 27. */
export function executionTypeLabel(t: TFunction, type: ExecutionType) {
  switch (type) {
    case "milestone":
      return t("admin:edit.options.executionTypes.milestone");
    case "launch":
      return t("admin:edit.options.executionTypes.launch");
    case "kpi":
      return t("admin:edit.options.executionTypes.kpi");
    case "open_question":
      return t("admin:edit.options.executionTypes.open_question");
    case "next_action":
      return t("admin:edit.options.executionTypes.next_action");
  }
}
