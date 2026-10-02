import { executionTypeSchema, type QuestionOptions } from "@moonx/schemas";
import {
  Button,
  Flex,
  InlineAlert,
  Picker,
  PickerItem,
  Stack,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TemplateQuestionNode } from "../../lib/admin-templates";
import { useDebouncedPatch } from "../../lib/admin-templates";
import { linesOf } from "../../lib/template-edit";
import { executionTypeLabel } from "./labels";

type Options = NonNullable<TemplateQuestionNode["options"]>;
type Column = Extract<Options, { kind: "table" }>["columns"][number];
const COLUMN_TYPES: readonly Column["type"][] = ["text", "number", "percent", "money"];

/**
 * The options of a question, by its answer type (design-spec 6.17 27): choices, table columns, the
 * key metrics a number type shows, or the execution list a view shows. Text and amount types take
 * none. Options the API would refuse (an empty list, a blank label) are held back and say so.
 */
export function OptionsEditor({
  question,
  readOnly,
  onSave,
}: {
  question: TemplateQuestionNode;
  readOnly: boolean;
  onSave: (options: QuestionOptions) => Promise<unknown>;
}) {
  switch (question.answerType) {
    case "choice":
      return (
        <LinesOptions
          kind="choice"
          options={question.options}
          readOnly={readOnly}
          onSave={onSave}
        />
      );
    case "linked_metric":
      return (
        <LinesOptions
          kind="linked_metric"
          options={question.options}
          readOnly={readOnly}
          onSave={onSave}
        />
      );
    case "table":
      return <TableOptions options={question.options} readOnly={readOnly} onSave={onSave} />;
    case "execution_view":
      return <ExecutionOptions options={question.options} readOnly={readOnly} onSave={onSave} />;
    default:
      return null;
  }
}

function LinesOptions({
  kind,
  options,
  readOnly,
  onSave,
}: {
  kind: "choice" | "linked_metric";
  options: TemplateQuestionNode["options"];
  readOnly: boolean;
  onSave: (options: QuestionOptions) => Promise<unknown>;
}) {
  const { t } = useTranslation("admin");
  const initial =
    options?.kind === "choice"
      ? options.choices
      : options?.kind === "linked_metric"
        ? options.metricKeys
        : [];
  const [text, setText] = useState(initial.join("\n"));
  const { schedule, flush } = useDebouncedPatch(({ lines }: { lines: string[] }) =>
    onSave(kind === "choice" ? { kind, choices: lines } : { kind, metricKeys: lines }),
  );
  const empty = linesOf(text).length === 0;
  const label = kind === "choice" ? t("edit.options.choices") : t("edit.options.metricKeys");
  return (
    <TextArea
      label={label}
      description={
        kind === "choice" ? t("edit.options.choicesHelp") : t("edit.options.metricKeysHelp")
      }
      value={text}
      isRequired
      isReadOnly={readOnly}
      isInvalid={empty}
      errorMessage={empty ? t("edit.options.atLeastOne") : undefined}
      onChange={(value) => {
        setText(value);
        const lines = linesOf(value);
        if (lines.length > 0) schedule({ lines });
      }}
      onBlur={flush}
    />
  );
}

function TableOptions({
  options,
  readOnly,
  onSave,
}: {
  options: TemplateQuestionNode["options"];
  readOnly: boolean;
  onSave: (options: QuestionOptions) => Promise<unknown>;
}) {
  const { t } = useTranslation("admin");
  const [columns, setColumns] = useState<Column[]>(
    options?.kind === "table" ? options.columns : [],
  );
  const { schedule, flush } = useDebouncedPatch(({ next }: { next: Column[] }) =>
    onSave({ kind: "table", columns: next }),
  );
  const keyError = (column: Column) =>
    column.key.trim() === ""
      ? t("edit.required")
      : columns.filter((other) => other.key === column.key).length > 1
        ? t("edit.options.columnKeyDuplicate")
        : undefined;
  const valid = (list: Column[]) =>
    list.length > 0 &&
    list.every((column) => column.key.trim() !== "" && column.label.trim() !== "") &&
    new Set(list.map((column) => column.key)).size === list.length;
  const update = (next: Column[]) => {
    setColumns(next);
    if (valid(next)) schedule({ next });
  };
  const edit = (index: number, patch: Partial<Column>) =>
    update(columns.map((column, i) => (i === index ? { ...column, ...patch } : column)));

  return (
    <Stack gap="space-200">
      <Text variant="body-sm" tone="secondary">
        {t("edit.options.columns")}
      </Text>
      {columns.length > 0 && !valid(columns) ? (
        <InlineAlert variant="notice" heading={t("edit.held")} />
      ) : null}
      {columns.map((column, index) => (
        // The columns have no id of their own; rows are edited in place and never reordered.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <Flex key={index} gap="space-100" align="end" wrap>
          <TextField
            label={t("edit.options.columnKey")}
            value={column.key}
            isReadOnly={readOnly}
            isInvalid={keyError(column) !== undefined}
            errorMessage={keyError(column)}
            onChange={(key) => edit(index, { key })}
            onBlur={flush}
          />
          <TextField
            label={t("edit.options.columnLabel")}
            value={column.label}
            isReadOnly={readOnly}
            isInvalid={column.label.trim() === ""}
            errorMessage={column.label.trim() === "" ? t("edit.required") : undefined}
            onChange={(label) => edit(index, { label })}
            onBlur={flush}
          />
          <Picker
            label={t("edit.options.columnType")}
            value={column.type}
            isDisabled={readOnly}
            onChange={(type) => {
              const next = COLUMN_TYPES.find((candidate) => candidate === type);
              if (next) edit(index, { type: next });
            }}
          >
            {COLUMN_TYPES.map((type) => (
              <PickerItem key={type} id={type}>
                {columnTypeLabel(t, type)}
              </PickerItem>
            ))}
          </Picker>
          {readOnly ? null : (
            <Button
              variant="secondary"
              size="S"
              aria-label={t("edit.options.removeColumn", { number: index + 1 })}
              onPress={() => {
                update(columns.filter((_, i) => i !== index));
                flush();
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          )}
        </Flex>
      ))}
      {columns.length === 0 ? <Text tone="negative">{t("edit.options.atLeastOne")}</Text> : null}
      {readOnly ? null : (
        <Flex>
          <Button
            variant="secondary"
            size="S"
            onPress={() => setColumns([...columns, { key: "", label: "", type: "text" }])}
          >
            <Plus aria-hidden />
            {t("edit.options.addColumn")}
          </Button>
        </Flex>
      )}
    </Stack>
  );
}

function columnTypeLabel(t: TFunction, type: Column["type"]) {
  switch (type) {
    case "text":
      return t("edit.options.columnTypes.text");
    case "number":
      return t("edit.options.columnTypes.number");
    case "percent":
      return t("edit.options.columnTypes.percent");
    case "money":
      return t("edit.options.columnTypes.money");
  }
}

function ExecutionOptions({
  options,
  readOnly,
  onSave,
}: {
  options: TemplateQuestionNode["options"];
  readOnly: boolean;
  onSave: (options: QuestionOptions) => Promise<unknown>;
}) {
  const { t } = useTranslation("admin");
  const current = options?.kind === "execution_view" ? options.executionType : null;
  const { schedule, flush } = useDebouncedPatch((next: { options: QuestionOptions }) =>
    onSave(next.options),
  );
  return (
    <Picker
      label={t("edit.options.executionType")}
      value={current}
      isRequired
      isDisabled={readOnly}
      onChange={(value) => {
        const parsed = executionTypeSchema.safeParse(value);
        if (parsed.success) {
          schedule({ options: { kind: "execution_view", executionType: parsed.data } });
          flush();
        }
      }}
    >
      {executionTypeSchema.options.map((type) => (
        <PickerItem key={type} id={type}>
          {executionTypeLabel(t, type)}
        </PickerItem>
      ))}
    </Picker>
  );
}
