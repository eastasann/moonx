import type { ExecutionType } from "@moonx/schemas";
import { QuestionCard, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import type { ExecutionItem } from "../../lib/plans";
import { ExecutionItemsView } from "../execution/ExecutionItemsView";
import { ExampleAndHint } from "./SubItemParts";
import type { SubItemProps } from "./TextSubItem";

export interface ExecutionSubItemProps
  extends Pick<
    SubItemProps,
    "question" | "isFocused" | "isOpenAll" | "onFocusRequest" | "onNavigate"
  > {
  workspaceId: string;
  ideaId: string;
  planId: string;
  type: ExecutionType;
  /** How many items there are, for the closed form of the card. */
  count: number;
  canEdit: boolean;
  /** The rows of a saved version, which replace the live ones. */
  fixedItems?: readonly ExecutionItem[];
  onChanged: () => void;
}

/**
 * An execution sub-item (§23, 25, 26, 28, 29): the same rows as screen 22, listed, added and
 * edited in place. Having one item makes the sub-item answered.
 */
export function ExecutionSubItem({
  question,
  isFocused,
  isOpenAll,
  onFocusRequest,
  onNavigate,
  workspaceId,
  ideaId,
  planId,
  type,
  count,
  canEdit,
  fixedItems,
  onChanged,
}: ExecutionSubItemProps) {
  const { t } = useTranslation(["planItem", "form"]);
  return (
    <QuestionCard
      title={question.title}
      isFocused={isFocused || isOpenAll}
      autoScroll={!isOpenAll}
      answer={count > 0 ? t("planItem:itemCount", { count }) : ""}
      emptyLabel={t("form:empty")}
      onFocusRequest={onFocusRequest}
      onNavigate={onNavigate}
    >
      <Stack gap="space-200">
        <Text variant="label">{question.prompt}</Text>
        <ExecutionItemsView
          workspaceId={workspaceId}
          ideaId={ideaId}
          planId={planId}
          type={type}
          canEdit={canEdit}
          fixedItems={fixedItems}
          onChanged={onChanged}
        />
        <ExampleAndHint question={question} />
      </Stack>
    </QuestionCard>
  );
}
