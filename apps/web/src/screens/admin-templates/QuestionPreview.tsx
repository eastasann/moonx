import {
  Button,
  ContextualHelp,
  Dialog,
  Disclosure,
  NumberField,
  QuestionCard,
  Radio,
  RadioGroup,
  RowList,
  RowListItem,
  Stack,
  TableView,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import type { TemplateQuestionNode } from "../../lib/admin-templates";
import { executionTypeLabel } from "./labels";

export interface PreviewQuestion {
  title: string;
  prompt: string;
  example: string | null;
  hint: string | null;
  answerType: TemplateQuestionNode["answerType"];
  options: TemplateQuestionNode["options"];
}

/**
 * How the question looks in the question form (screen 11): the card with its prompt, answer
 * field, EXAMPLE and hint. The field takes no input.
 */
export function QuestionPreview({
  isOpen,
  onClose,
  question,
}: {
  isOpen: boolean;
  onClose: () => void;
  question: PreviewQuestion;
}) {
  const { t } = useTranslation(["admin", "form", "app"]);
  const choices = question.options?.kind === "choice" ? question.options.choices : null;
  const columns = question.options?.kind === "table" ? question.options.columns : null;
  const metricKeys =
    question.options?.kind === "linked_metric" ? question.options.metricKeys : null;
  const executionType =
    question.options?.kind === "execution_view" ? question.options.executionType : null;
  const field =
    question.answerType === "choice" && choices ? (
      <RadioGroup label={question.prompt} isReadOnly>
        {choices.map((choice) => (
          <Radio key={choice} value={choice}>
            {choice}
          </Radio>
        ))}
      </RadioGroup>
    ) : question.answerType === "short_text" ? (
      <TextField label={question.prompt} placeholder={t("form:placeholder")} isReadOnly />
    ) : question.answerType === "long_text" ? (
      <TextArea label={question.prompt} placeholder={t("form:placeholder")} isReadOnly />
    ) : question.answerType === "amount_with_reason" ? (
      <Stack gap="space-100">
        <NumberField label={question.prompt} isReadOnly />
        <TextArea label={t("admin:edit.preview.reason")} isReadOnly />
      </Stack>
    ) : question.answerType === "table" ? (
      <Stack gap="space-100">
        <Text>{question.prompt}</Text>
        <TableView
          aria-label={question.prompt}
          layout="table"
          columns={(columns ?? []).map((column, index) => ({
            id: column.key || String(index),
            label: column.label || column.key,
            isRowHeader: index === 0,
            isNumeric: column.type !== "text",
          }))}
          rows={[{ id: "blank", cells: {} }]}
        />
      </Stack>
    ) : question.answerType === "linked_metric" ? (
      <Stack gap="space-100">
        <Text>{question.prompt}</Text>
        <Text tone="secondary">{t("admin:edit.preview.metrics")}</Text>
        <RowList aria-label={t("admin:edit.preview.metrics")}>
          {(metricKeys ?? []).map((key) => (
            <RowListItem key={key}>{key}</RowListItem>
          ))}
        </RowList>
      </Stack>
    ) : (
      <Stack gap="space-100">
        <Text>{question.prompt}</Text>
        <Text tone="secondary">
          {executionType
            ? t("admin:edit.preview.execution", { name: executionTypeLabel(t, executionType) })
            : t("admin:edit.preview.executionNone")}
        </Text>
      </Stack>
    );

  return (
    <Dialog
      isOpen={isOpen}
      isDismissable
      size="medium"
      title={t("admin:edit.preview.title")}
      closeLabel={t("app:close")}
      onOpenChange={(open) => !open && onClose()}
      actions={
        <Button variant="secondary" onPress={onClose}>
          {t("app:close")}
        </Button>
      }
    >
      <QuestionCard
        title={question.title}
        isFocused
        autoScroll={false}
        emptyLabel={t("form:empty")}
        // A preview takes no focus and has no neighbouring cards to move to.
        onFocusRequest={() => {}}
        onNavigate={() => {}}
      >
        <Stack gap="space-200">
          {field}
          {question.example ? (
            <Disclosure title={t("form:example")} defaultExpanded headingLevel={2}>
              <Text variant="body-long">{question.example}</Text>
            </Disclosure>
          ) : null}
          {question.hint ? (
            <ContextualHelp label={t("form:hint")} title={t("form:hint")}>
              <Text>{question.hint}</Text>
            </ContextualHelp>
          ) : null}
        </Stack>
      </QuestionCard>
    </Dialog>
  );
}
