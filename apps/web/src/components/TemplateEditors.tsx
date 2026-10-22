import {
  type AnswerType,
  type CostCategory,
  executionTypeSchema,
  launchTimingSchema,
  type QuestionOptions,
  type TemplateKind,
  type TemplateVersionDetail,
  THRESHOLD_CHECK_KEYS,
  tableColumnTypeSchema,
} from "@moonx/schemas";
import {
  AlertDialog,
  Checkbox,
  CheckboxGroup,
  NumberField,
  Picker,
  Stack,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import {
  type DraftFieldsSpec,
  messageAt,
  useDraftFields,
} from "../lib/draft-fields";
import { useIsOnline } from "../lib/online";
import {
  aiPromptSchema,
  answerTypesFor,
  type ConditionRow,
  type CostRowValues,
  conditionIssues,
  conditionOf,
  conditionRowsOf,
  copyFromIssues,
  costDefaultsIssues,
  exampleSchema,
  hasOptions,
  hintSchema,
  isChoiceKey,
  nameSchema,
  optionsIssues,
  type PresetValues,
  presetsIssues,
  presetsWire,
  promptSchema,
  type Question,
  questionKeyIssues,
  questionTarget,
  type Section,
  schemaIssues,
  sectionKeyIssues,
  sectionTarget,
  subtitleSchema,
  type ThresholdValues,
  thresholdsIssues,
  thresholdsWire,
  titleSchema,
  type VersionItem,
  versionTarget,
} from "../lib/template-drafts";
import { EditableList, moved, without } from "./EditableList";
import { SaveFailureNote } from "./SaveFeedback";

// The fields of a draft's nodes on 27 (design-spec 6.17「下書きの編集」), each node one
// item of 6.0.2's saves.

type Issue = z.core.$ZodIssue;
type AdminT = TFunction<["admin", "common"]>;

/** What the saves of a node are called: "section" in "Couldn't save". */
const nounOf = (kind: TemplateKind, node: "section" | "question", t: AdminT) =>
  t(`admin:noun.${node}.${kind === "business_plan" ? "plan" : "other"}`);

/** The props a text field of a node takes from its fields. */
function textProps<V extends object, F extends keyof V>(
  fields: ReturnType<typeof useDraftFields<V>>,
  field: F,
  isReadOnly: boolean,
) {
  return {
    value: fields.values[field] as string,
    onChange: (value: string) =>
      fields.change({ [field]: value } as unknown as Partial<V>),
    onBlur: () => fields.blur(field),
    errorMessage: messageAt(fields.issues(field)),
    isReadOnly,
    width: "full" as const,
  };
}

/**
 * The name of a field in a list's row: shown over the first row only, as a table's
 * header is, and read out with the row's number in the others.
 */
function rowLabel(label: string, index: number, t: AdminT) {
  return index === 0
    ? { label }
    : {
        "aria-label": t("admin:version.fieldInRow", {
          field: label,
          n: index + 1,
        }),
      };
}

// ---- Section ----

interface SectionValues {
  key: string;
  title: string;
  subtitle: string;
  guidance: string;
  part: "a" | "b" | null;
}

const sectionValuesOf = (section: Section): SectionValues => ({
  key: section.key,
  title: section.title,
  subtitle: section.subtitle ?? "",
  guidance: section.guidance ?? "",
  part: section.part,
});

function sectionSpec(
  version: TemplateVersionDetail,
  sectionId: string,
): DraftFieldsSpec<SectionValues> {
  return {
    issuesOf: (field, value) => {
      switch (field) {
        case "key":
          return sectionKeyIssues(version, sectionId, value as string);
        case "title":
          return schemaIssues(titleSchema, value);
        case "subtitle":
          return schemaIssues(subtitleSchema, value);
        case "guidance":
          return schemaIssues(hintSchema, value);
        default:
          return [];
      }
    },
    // Blank optional texts are saved as none by the API (6.0.8).
    toWire: (_field, value) => value,
    fromWire: (field, value) =>
      (field === "part" ? (value ?? null) : (value ?? "")) as never,
    isChoice: (field) => field === "part",
  };
}

/** A section's fields (design-spec 6.17「セクション」); a plan's item. */
export function SectionEditor({
  version,
  section,
}: {
  version: TemplateVersionDetail;
  section: Section;
}) {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const isPlan = version.kind === "business_plan";
  const target = sectionTarget(
    queryClient,
    version.id,
    section.id,
    nounOf(version.kind, "section", t),
  );
  const fields = useDraftFields(
    target,
    sectionValuesOf(section),
    sectionSpec(version, section.id),
  );
  const isReadOnly = !isOnline;
  // Only a plan's items have a part; another kind's shows it to clear it (AD6), and
  // keeps it once cleared, as the Picker holds the keyboard then.
  const [showsPart] = useState(isPlan || section.part !== null);
  return (
    <Stack gap="space-300">
      <SaveFailureNote itemKey={target.key} />
      <TextField
        {...textProps(fields, "key", isReadOnly)}
        label={t("admin:version.section.key")}
        isRequired
      />
      <TextField
        {...textProps(fields, "title", isReadOnly)}
        label={t("admin:version.section.title")}
        isRequired
      />
      {version.kind === "self_analysis" && (
        <TextField
          {...textProps(fields, "subtitle", isReadOnly)}
          label={t("admin:version.section.subtitle")}
        />
      )}
      <TextArea
        {...textProps(fields, "guidance", isReadOnly)}
        label={
          isPlan
            ? t("admin:version.section.description")
            : t("admin:version.section.guidance")
        }
      />
      {showsPart && (
        <Picker
          label={t("admin:version.section.part")}
          items={[
            ...(isPlan
              ? []
              : [{ id: "none", label: t("admin:version.partNone") }]),
            { id: "a", label: t("admin:version.part.a") },
            { id: "b", label: t("admin:version.part.b") },
          ]}
          value={fields.values.part ?? (isPlan ? null : "none")}
          onChange={(value) =>
            fields.change({
              part: value === "a" || value === "b" ? value : null,
            })
          }
          errorMessage={messageAt(fields.issues("part"))}
          isDisabled={isReadOnly}
        />
      )}
    </Stack>
  );
}

// ---- Question ----

interface QuestionValues {
  key: string;
  title: string;
  prompt: string;
  example: string;
  hint: string;
  answerType: AnswerType;
  options: QuestionOptions | null;
  displayCondition: ConditionRow[];
  hasFau: boolean;
  copyFrom: string[];
}

const questionValuesOf = (question: Question): QuestionValues => ({
  key: question.key,
  title: question.title,
  prompt: question.prompt,
  example: question.example ?? "",
  hint: question.hint ?? "",
  answerType: question.answerType,
  options: question.options,
  displayCondition: conditionRowsOf(question.displayCondition),
  hasFau: question.hasFau,
  copyFrom: question.copyFrom ?? [],
});

function questionSpec(
  version: TemplateVersionDetail,
  question: Question,
): DraftFieldsSpec<QuestionValues> {
  return {
    issuesOf: (field, value) => {
      switch (field) {
        case "key":
          // A published ID is shown, never sent (design-spec 6.6).
          return question.isKeyPublished
            ? []
            : questionKeyIssues(version, question.id, value as string);
        case "title":
          return schemaIssues(titleSchema, value);
        case "prompt":
          return schemaIssues(promptSchema, value);
        case "example":
          return schemaIssues(exampleSchema, value);
        case "hint":
          return schemaIssues(hintSchema, value);
        case "options":
          return optionsIssues(value as QuestionOptions | null);
        case "displayCondition":
          return conditionIssues(version, value as ConditionRow[]);
        case "copyFrom":
          return copyFromIssues(value as string[]);
        default:
          return [];
      }
    },
    toWire: (field, value) => {
      if (field === "displayCondition") {
        return conditionOf(version, value as ConditionRow[]);
      }
      if (field === "copyFrom") {
        const sources = value as string[];
        return sources.length === 0 ? null : sources;
      }
      return value;
    },
    fromWire: (field, value) => {
      switch (field) {
        case "displayCondition":
          return conditionRowsOf(
            value as Record<string, string[]> | null,
          ) as never;
        case "copyFrom":
          return ((value as string[] | null) ?? []) as never;
        case "example":
        case "hint":
          return (value ?? "") as never;
        case "options":
          return (value ?? null) as never;
        default:
          return value as never;
      }
    },
    isChoice: (field) => field === "answerType" || field === "hasFau",
  };
}

/** A question's fields (design-spec 6.17「設問」); a plan's prompt. */
export function QuestionEditor({
  version,
  question,
}: {
  version: TemplateVersionDetail;
  question: Question;
}) {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const target = questionTarget(
    queryClient,
    version.id,
    question.id,
    nounOf(version.kind, "question", t),
  );
  const fields = useDraftFields(
    target,
    questionValuesOf(question),
    questionSpec(version, question),
  );
  // The new type asked about, with the kind of settings it would drop.
  const [asking, setAsking] = useState<{
    type: AnswerType;
    drops: QuestionOptions["kind"];
  } | null>(null);
  const isReadOnly = !isOnline;
  const { values } = fields;
  const setType = (answerType: AnswerType) =>
    // Sent with the settings cleared: AD4 drops the old type's (design-spec 6.17). The
    // new type's start empty, to be filled in (AD6 asks for them).
    fields.change({ answerType, options: null });
  return (
    <Stack gap="space-300">
      <SaveFailureNote itemKey={target.key} />
      <TextField
        {...textProps(fields, "key", isReadOnly || question.isKeyPublished)}
        label={t("admin:version.question.key")}
        isRequired
        description={
          question.isKeyPublished
            ? t("admin:version.question.keyPublished")
            : t(`admin:version.question.keyForm.${version.kind}`)
        }
      />
      <TextField
        {...textProps(fields, "title", isReadOnly)}
        label={t("admin:version.question.title")}
        isRequired
      />
      <TextArea
        {...textProps(fields, "prompt", isReadOnly)}
        label={t("admin:version.question.prompt")}
        isRequired
      />
      <TextArea
        {...textProps(fields, "example", isReadOnly)}
        label={t("admin:version.question.example")}
      />
      <TextArea
        {...textProps(fields, "hint", isReadOnly)}
        label={t("admin:version.question.hint")}
      />
      <Picker
        label={t("admin:version.question.answerType")}
        items={answerTypesFor(version.kind, question.answerType).map(
          (type) => ({
            id: type,
            label: t(`admin:answerType.${type}`),
          }),
        )}
        value={values.answerType}
        onChange={(value) => {
          const type = answerTypesFor(version.kind, question.answerType).find(
            (candidate) => candidate === value,
          );
          if (type === undefined || type === values.answerType) return;
          if (values.options !== null && hasOptions(values.options)) {
            setAsking({ type, drops: values.options.kind });
          } else {
            setType(type);
          }
        }}
        isDisabled={isReadOnly}
        isRequired
      />
      <OptionsEditor
        answerType={values.answerType}
        options={values.options}
        issues={fields.issues("options")}
        onChange={(options, quietly) => fields.change({ options }, { quietly })}
        onDone={() => fields.blur("options")}
        isReadOnly={isReadOnly}
      />
      <ConditionsEditor
        version={version}
        question={question}
        rows={values.displayCondition}
        issues={fields.issues("displayCondition")}
        onChange={(displayCondition, quietly) =>
          fields.change({ displayCondition }, { quietly })
        }
        onDone={() => fields.blur("displayCondition")}
        isReadOnly={isReadOnly}
      />
      {version.kind === "validation" && (
        <Checkbox
          isSelected={values.hasFau}
          onChange={(hasFau) => fields.change({ hasFau })}
          isDisabled={isReadOnly}
        >
          {t("admin:version.question.askFau")}
        </Checkbox>
      )}
      {version.kind === "business_plan" && (
        <Stack gap="space-100">
          <EditableList
            label={t("admin:version.question.copyFrom")}
            rows={values.copyFrom}
            rowLabel={(source, index) =>
              source.trim() === ""
                ? t("admin:version.question.sourceN", { n: index + 1 })
                : source
            }
            renderRow={(source, index) => (
              <TextField
                aria-label={t("admin:version.question.sourceN", {
                  n: index + 1,
                })}
                value={source}
                onChange={(value) =>
                  fields.change({
                    copyFrom: values.copyFrom.map((item, at) =>
                      at === index ? value : item,
                    ),
                  })
                }
                onBlur={() => fields.blur("copyFrom")}
                errorMessage={messageAt(fields.issues("copyFrom"), [index])}
                isReadOnly={isReadOnly}
                width="fill"
              />
            )}
            onMove={(index, step) => {
              fields.change({ copyFrom: moved(values.copyFrom, index, step) });
              fields.blur("copyFrom");
            }}
            onRemove={(index) => {
              fields.change({ copyFrom: without(values.copyFrom, index) });
              fields.blur("copyFrom");
            }}
            onAdd={() =>
              fields.change(
                { copyFrom: [...values.copyFrom, ""] },
                { quietly: true },
              )
            }
            addLabel={t("admin:version.question.addSource")}
            emptyText={t("admin:version.question.copiesNothing")}
            isReadOnly={isReadOnly}
            errorMessage={messageAt(fields.issues("copyFrom"))}
          />
          <Text variant="caption" tone="secondary">
            {t("admin:version.question.copyFromForm")}
          </Text>
        </Stack>
      )}
      {asking !== null && (
        <AlertDialog
          isOpen
          variant="warning"
          size="S"
          title={t("admin:version.question.changeTypeTitle", {
            type: t(`admin:answerType.${asking.type}`),
          })}
          primaryActionLabel={t("admin:version.question.changeType")}
          cancelLabel={t("admin:version.cancel")}
          autoFocusButton="cancel"
          onPrimaryAction={() => {
            setType(asking.type);
            setAsking(null);
          }}
          onCancel={() => setAsking(null)}
        >
          {t(`admin:version.question.changeTypeBody.${asking.drops}`)}
        </AlertDialog>
      )}
    </Stack>
  );
}

/**
 * What a question's answer type holds (design-spec 6.17「型ごとの設定」): a choice's
 * choices, a table's columns, the key numbers shown, or the execution list shown. Other
 * types hold nothing.
 */
function OptionsEditor({
  answerType,
  options,
  issues,
  onChange,
  onDone,
  isReadOnly,
}: {
  answerType: AnswerType;
  options: QuestionOptions | null;
  issues: readonly Issue[];
  /** `quietly`: a row was just added, empty. */
  onChange: (options: QuestionOptions, quietly: boolean) => void;
  /** A choice made, a row moved or removed: saved now. */
  onDone: () => void;
  isReadOnly: boolean;
}) {
  const { t } = useTranslation(["admin", "common"]);
  const at = (path: PropertyKey[]) => messageAt(issues, path);
  const whole = at([]);
  if (answerType === "choice" || answerType === "linked_metric") {
    const isChoice = answerType === "choice";
    const entries =
      options?.kind === "choice"
        ? options.choices
        : options?.kind === "linked_metric"
          ? options.metricKeys
          : [];
    const listKey = isChoice ? "choices" : "metricKeys";
    const make = (next: string[]): QuestionOptions =>
      isChoice
        ? { kind: "choice", choices: next }
        : { kind: "linked_metric", metricKeys: next };
    const nameOf = (index: number) =>
      isChoice
        ? t("admin:version.question.choiceN", { n: index + 1 })
        : t("admin:version.question.metricN", { n: index + 1 });
    return (
      <Stack gap="space-100">
        <EditableList
          label={
            isChoice
              ? t("admin:version.question.choices")
              : t("admin:version.question.metrics")
          }
          rows={entries}
          rowLabel={(entry, index) =>
            entry.trim() === "" ? nameOf(index) : entry
          }
          renderRow={(entry, index) => (
            <TextField
              aria-label={nameOf(index)}
              value={entry}
              onChange={(value) =>
                onChange(
                  make(entries.map((item, i) => (i === index ? value : item))),
                  false,
                )
              }
              onBlur={onDone}
              errorMessage={at([listKey, index])}
              isReadOnly={isReadOnly}
              width="fill"
            />
          )}
          onMove={(index, step) => {
            onChange(make(moved(entries, index, step)), false);
            onDone();
          }}
          onRemove={(index) => {
            onChange(make(without(entries, index)), false);
            onDone();
          }}
          onAdd={() => onChange(make([...entries, ""]), true)}
          addLabel={
            isChoice
              ? t("admin:version.question.addChoice")
              : t("admin:version.question.addMetric")
          }
          emptyText={
            isChoice
              ? t("admin:version.question.noChoices")
              : t("admin:version.question.noMetrics")
          }
          isReadOnly={isReadOnly}
          errorMessage={whole}
        />
        {!isChoice && (
          <Text variant="caption" tone="secondary">
            {t("admin:version.question.metricForm")}
          </Text>
        )}
      </Stack>
    );
  }
  if (answerType === "table") {
    const columns = options?.kind === "table" ? options.columns : [];
    type Column = (typeof columns)[number];
    const make = (next: Column[]): QuestionOptions => ({
      kind: "table",
      columns: next,
    });
    const update = (index: number, patch: Partial<Column>) =>
      make(
        columns.map((column, i) =>
          i === index ? { ...column, ...patch } : column,
        ),
      );
    return (
      <EditableList
        label={t("admin:version.question.columns")}
        rows={columns}
        hasLabels
        rowLabel={(column, index) =>
          column.label.trim() === ""
            ? t("admin:version.question.columnN", { n: index + 1 })
            : column.label
        }
        renderRow={(column, index) => (
          <>
            <TextField
              {...rowLabel(t("admin:version.question.columnKey"), index, t)}
              value={column.key}
              onChange={(key) => onChange(update(index, { key }), false)}
              onBlur={onDone}
              errorMessage={at(["columns", index, "key"])}
              isReadOnly={isReadOnly}
              isRequired
              width="fill"
            />
            <TextField
              {...rowLabel(t("admin:version.question.columnLabel"), index, t)}
              value={column.label}
              onChange={(label) => onChange(update(index, { label }), false)}
              onBlur={onDone}
              errorMessage={at(["columns", index, "label"])}
              isReadOnly={isReadOnly}
              isRequired
              width="fill"
            />
            <Picker
              {...rowLabel(t("admin:version.question.columnType"), index, t)}
              items={tableColumnTypeSchema.options.map((type) => ({
                id: type,
                label: t(`admin:columnType.${type}`),
              }))}
              value={column.type}
              onChange={(value) => {
                const type = tableColumnTypeSchema.safeParse(value).data;
                if (type === undefined) return;
                onChange(update(index, { type }), false);
                onDone();
              }}
              isDisabled={isReadOnly}
              width="fit"
            />
          </>
        )}
        onMove={(index, step) => {
          onChange(make(moved(columns, index, step)), false);
          onDone();
        }}
        onRemove={(index) => {
          onChange(make(without(columns, index)), false);
          onDone();
        }}
        onAdd={() =>
          onChange(
            make([...columns, { key: "", label: "", type: "text" }]),
            true,
          )
        }
        addLabel={t("admin:version.question.addColumn")}
        emptyText={t("admin:version.question.noColumns")}
        isReadOnly={isReadOnly}
        errorMessage={whole}
      />
    );
  }
  if (answerType === "execution_view") {
    return (
      <Picker
        label={t("admin:version.question.executionList")}
        items={executionTypeSchema.options.map((type) => ({
          id: type,
          label: t(`admin:executionType.${type}`),
        }))}
        value={
          options?.kind === "execution_view" ? options.executionType : null
        }
        onChange={(value) => {
          const executionType = executionTypeSchema.safeParse(value).data;
          if (executionType === undefined) return;
          onChange({ kind: "execution_view", executionType }, false);
          onDone();
        }}
        errorMessage={whole}
        isDisabled={isReadOnly}
        isRequired
      />
    );
  }
  return null;
}

/**
 * "Shown when" (design-spec 6.17「型ごとの設定」): each condition a question of the
 * version and the answers it shows on, ticked among its choices or one per line.
 */
function ConditionsEditor({
  version,
  question,
  rows,
  issues,
  onChange,
  onDone,
  isReadOnly,
}: {
  version: TemplateVersionDetail;
  question: Question;
  rows: ConditionRow[];
  issues: readonly Issue[];
  onChange: (rows: ConditionRow[], quietly: boolean) => void;
  onDone: () => void;
  isReadOnly: boolean;
}) {
  const { t } = useTranslation(["admin"]);
  const others = version.sections.flatMap((section) =>
    section.questions.filter((other) => other.id !== question.id),
  );
  const update = (index: number, patch: Partial<ConditionRow>) =>
    rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
  const at = (path: PropertyKey[]) => messageAt(issues, path);
  return (
    <EditableList
      label={t("admin:version.question.shownWhen")}
      rows={rows}
      hasLabels
      rowLabel={(row, index) =>
        row.key ?? t("admin:version.question.conditionN", { n: index + 1 })
      }
      renderRow={(row, index) => {
        const choices =
          row.key === null || !isChoiceKey(version, row.key)
            ? null
            : (others.find((other) => other.key === row.key)?.options ?? null);
        const listed = others.some((other) => other.key === row.key);
        return (
          <>
            <Picker
              {...rowLabel(
                t("admin:version.question.conditionQuestion"),
                index,
                t,
              )}
              items={[
                ...others.map((other) => ({
                  id: other.key,
                  label: t("admin:version.questionName", {
                    key: other.key,
                    title: other.title,
                  }),
                })),
                // An ID of the file no question has: shown, for Check to name (AD6).
                ...(row.key !== null && !listed
                  ? [
                      {
                        id: row.key,
                        label: t("admin:version.question.notInTemplate", {
                          key: row.key,
                        }),
                      },
                    ]
                  : []),
              ]}
              value={row.key}
              onChange={(value) => {
                if (value === null || value === row.key) return;
                onChange(
                  update(index, { key: value, values: [], text: "" }),
                  false,
                );
                onDone();
              }}
              errorMessage={at([index, "key"])}
              isDisabled={isReadOnly}
              isRequired
            />
            {choices?.kind === "choice" ? (
              <CheckboxGroup
                {...rowLabel(
                  t("admin:version.question.conditionValues"),
                  index,
                  t,
                )}
                value={row.values}
                onChange={(values) => {
                  // In the order of the choices, with values the file gave kept last.
                  const ordered = [
                    ...choices.choices.filter((choice) =>
                      values.includes(choice),
                    ),
                    ...values.filter(
                      (value) => !choices.choices.includes(value),
                    ),
                  ];
                  onChange(update(index, { values: ordered }), false);
                  onDone();
                }}
                errorMessage={at([index, "values"])}
                isDisabled={isReadOnly}
                orientation="horizontal"
              >
                {[
                  ...choices.choices,
                  ...row.values.filter(
                    (value) => !choices.choices.includes(value),
                  ),
                ].map((choice) => (
                  <Checkbox key={choice} value={choice}>
                    {choice}
                  </Checkbox>
                ))}
              </CheckboxGroup>
            ) : (
              <TextArea
                {...rowLabel(
                  t("admin:version.question.conditionText"),
                  index,
                  t,
                )}
                value={row.text}
                onChange={(text) => onChange(update(index, { text }), false)}
                onBlur={onDone}
                errorMessage={at([index, "values"])}
                isReadOnly={isReadOnly}
                width="fill"
              />
            )}
          </>
        );
      }}
      onMove={(index, step) => {
        onChange(moved(rows, index, step), false);
        onDone();
      }}
      onRemove={(index) => {
        onChange(without(rows, index), false);
        onDone();
      }}
      onAdd={() =>
        onChange([...rows, { key: null, values: [], text: "" }], true)
      }
      addLabel={t("admin:version.question.addCondition")}
      emptyText={t("admin:version.question.always")}
      isReadOnly={isReadOnly}
      errorMessage={at([])}
    />
  );
}

// ---- Settings ----

/** The template's name (design-spec 6.17): the template's, shared by its versions. */
export function NameEditor({ version }: { version: TemplateVersionDetail }) {
  const { t } = useTranslation(["admin", "common"]);
  return (
    <TextSetting
      version={version}
      item="name"
      field="name"
      saved={version.name}
      schema={nameSchema}
      label={t("admin:version.settings.name")}
      isRequired
    />
  );
}

/** A self analysis's AI prompt (design-spec 6.17), a long text. */
export function AiPromptEditor({
  version,
}: {
  version: TemplateVersionDetail;
}) {
  const { t } = useTranslation(["admin", "common"]);
  return (
    <TextSetting
      version={version}
      item="ai-prompt"
      field="aiPrompt"
      saved={version.aiPrompt}
      schema={aiPromptSchema}
      label={t("admin:version.settings.ai-prompt")}
      isLong
    />
  );
}

function TextSetting({
  version,
  item,
  field,
  saved,
  schema,
  label,
  isRequired = false,
  isLong = false,
}: {
  version: TemplateVersionDetail;
  item: VersionItem;
  field: "name" | "aiPrompt";
  saved: string;
  schema: z.ZodType;
  label: string;
  isRequired?: boolean;
  isLong?: boolean;
}) {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const target = versionTarget(queryClient, version.id, item, label);
  const fields = useDraftFields<Record<string, string>>(
    target,
    { [field]: saved },
    {
      issuesOf: (_field, value) => schemaIssues(schema, value),
      toWire: (_field, value) => value,
      fromWire: (_field, value) => (value ?? "") as string,
      isChoice: () => false,
    },
  );
  const props = {
    ...textProps(fields, field, !isOnline),
    label,
    isRequired,
  };
  return (
    <Stack gap="space-300">
      <SaveFailureNote itemKey={target.key} />
      {isLong ? <TextArea {...props} /> : <TextField {...props} />}
      {item === "name" && (
        <Text variant="caption" tone="secondary">
          {t("admin:version.nameNote")}
        </Text>
      )}
    </Stack>
  );
}

/** Why the API refused a list of 27's settings as a whole (SDD 8.2), under it. */
function ListRefusal({ issues }: { issues: readonly Issue[] }) {
  const message = messageAt(issues);
  return message === undefined ? null : (
    <Text variant="caption" tone="negative">
      {message}
    </Text>
  );
}

/** One list of 27's settings: its rows, saved whole as AD5 replaces it (6.17). */
function useListSetting<R>(
  version: TemplateVersionDetail,
  item: VersionItem,
  noun: string,
  saved: R,
  spec: {
    issuesOf: (value: R) => Issue[];
    toWire: (value: R) => unknown;
    fromWire: (value: unknown) => R;
  },
) {
  const queryClient = useQueryClient();
  const target = versionTarget(queryClient, version.id, item, noun);
  const fields = useDraftFields<{ items: R }>(
    target,
    { items: saved },
    {
      issuesOf: (_field, value) => spec.issuesOf(value as R),
      toWire: (_field, value) => spec.toWire(value as R),
      fromWire: (_field, value) => spec.fromWire(value) as never,
      isChoice: () => false,
    },
  );
  return { target, fields };
}

/** 17's tables, in their order (design-spec 6.3). */
export const COST_CATEGORIES = [
  "initial",
  "monthly_fixed",
  "variable",
] as const satisfies readonly CostCategory[];

/** A row of one group of a list AD5 takes whole, with its place in that list. */
interface Placed<R> {
  place: number;
  row: R;
}

/** The rows of `rows` that `isIn` keeps, each with its place in `rows`. */
const placedIn = <R,>(rows: readonly R[], isIn: (row: R) => boolean) =>
  rows.flatMap((row, place) => (isIn(row) ? [{ place, row }] : []));

/** `rows` with the rows at the places `a` and `b` swapped. */
const swapped = <R,>(rows: readonly R[], a: Placed<R>, b: Placed<R>) =>
  rows.map((row, place) =>
    place === a.place ? b.row : place === b.place ? a.row : row,
  );

/** `rows` with `patch` applied to the row at `place`. */
const patched = <R,>(rows: readonly R[], place: number, patch: Partial<R>) =>
  rows.map((row, at) => (at === place ? { ...row, ...patch } : row));

/**
 * A validation's starting cost rows (design-spec 6.17): by table, each row's key and name,
 * saved as one list (AD5).
 */
export function CostDefaultsEditor({
  version,
}: {
  version: TemplateVersionDetail;
}) {
  const { t } = useTranslation(["admin", "common"]);
  const isOnline = useIsOnline();
  const { target, fields } = useListSetting<CostRowValues[]>(
    version,
    "cost-defaults",
    t("admin:version.settings.cost-defaults"),
    version.costDefaults.map(({ category, key, name }) => ({
      category,
      key,
      name,
    })),
    {
      issuesOf: costDefaultsIssues,
      toWire: (rows) => rows,
      fromWire: (value) => value as CostRowValues[],
    },
  );
  const rows = fields.values.items;
  const issues = fields.issues("items");
  const isReadOnly = !isOnline;
  const set = (next: CostRowValues[], quietly = false) =>
    fields.change({ items: next }, { quietly });
  const done = () => fields.blur("items");
  return (
    <Stack gap="space-400">
      <SaveFailureNote itemKey={target.key} />
      {COST_CATEGORIES.map((category) => {
        const entries = placedIn(rows, (row) => row.category === category);
        return (
          <EditableList
            key={category}
            label={t(`admin:costCategory.${category}`)}
            rows={entries}
            hasLabels
            rowLabel={({ row }, index) =>
              row.name.trim() !== ""
                ? row.name
                : row.key.trim() !== ""
                  ? row.key
                  : t("admin:version.rowN", { n: index + 1 })
            }
            renderRow={({ place, row }, index) => (
              <>
                <TextField
                  {...rowLabel(t("admin:version.costKey"), index, t)}
                  value={row.key}
                  onChange={(key) => set(patched(rows, place, { key }))}
                  onBlur={done}
                  errorMessage={messageAt(issues, [place, "key"])}
                  isReadOnly={isReadOnly}
                  isRequired
                  width="fill"
                />
                <TextField
                  {...rowLabel(t("admin:version.costName"), index, t)}
                  value={row.name}
                  onChange={(name) => set(patched(rows, place, { name }))}
                  onBlur={done}
                  errorMessage={messageAt(issues, [place, "name"])}
                  isReadOnly={isReadOnly}
                  width="fill"
                />
              </>
            )}
            onMove={(index, step) => {
              const a = entries[index];
              const b = entries[index + step];
              if (a === undefined || b === undefined) return;
              set(swapped(rows, a, b));
              done();
            }}
            onRemove={(index) => {
              const entry = entries[index];
              if (entry === undefined) return;
              set(without(rows, entry.place));
              done();
            }}
            onAdd={() => {
              // After the table's last row, or after the tables before it.
              const order = COST_CATEGORIES.indexOf(category);
              const at =
                rows.findLastIndex(
                  (row) => COST_CATEGORIES.indexOf(row.category) <= order,
                ) + 1;
              set(
                [
                  ...rows.slice(0, at),
                  { category, key: "", name: "" },
                  ...rows.slice(at),
                ],
                true,
              );
            }}
            addLabel={t("admin:version.addRow")}
            emptyText={t("admin:version.none")}
            isReadOnly={isReadOnly}
          />
        );
      })}
      <ListRefusal issues={issues} />
    </Stack>
  );
}

/** The thresholds of each check and their names, in the order design-spec 6.1 tells them. */
export const CHECK_PARAMS = {
  competitors: [["min", "admin:checkRule.competitors.min"]],
  local_price: [
    ["pricedCompetitors", "admin:checkRule.local_price.pricedCompetitors"],
    ["researchLogs", "admin:checkRule.local_price.researchLogs"],
  ],
  permits: [["researchLogs", "admin:checkRule.permits.researchLogs"]],
  demand_signal: [
    ["researchLogs", "admin:checkRule.demand_signal.researchLogs"],
  ],
} as const;

const thresholdValuesOf = (version: TemplateVersionDetail): ThresholdValues =>
  Object.fromEntries(
    THRESHOLD_CHECK_KEYS.map((checkKey) => {
      const rule = version.checkRules.find(
        (item) => item.checkKey === checkKey,
      );
      return [
        checkKey,
        Object.fromEntries(
          CHECK_PARAMS[checkKey].map(([param]) => {
            const value = rule?.params[param];
            return [param, value === undefined ? "" : String(value)];
          }),
        ),
      ];
    }),
  );

/** A validation's check thresholds (design-spec 6.17, 6.1): whole numbers 1–99. */
export function CheckRulesEditor({
  version,
}: {
  version: TemplateVersionDetail;
}) {
  const { t } = useTranslation(["admin", "common"]);
  const isOnline = useIsOnline();
  const { target, fields } = useListSetting<ThresholdValues>(
    version,
    "check-rules",
    t("admin:version.settings.check-rules"),
    thresholdValuesOf(version),
    {
      issuesOf: thresholdsIssues,
      toWire: (values) => thresholdsWire(version, values),
      fromWire: (value) =>
        thresholdValuesOf({
          ...version,
          checkRules: value as TemplateVersionDetail["checkRules"],
        }),
    },
  );
  const values = fields.values.items;
  const issues = fields.issues("items");
  return (
    <Stack gap="space-400">
      <SaveFailureNote itemKey={target.key} />
      {THRESHOLD_CHECK_KEYS.map((checkKey) => (
        <Stack key={checkKey} gap="space-200">
          <Text variant="label">{t(`admin:checkRule.${checkKey}.title`)}</Text>
          {CHECK_PARAMS[checkKey].map(([param, label]) => (
            <NumberField
              key={param}
              label={t(label)}
              value={values[checkKey]?.[param] ?? ""}
              onChange={(text) =>
                fields.change({
                  items: {
                    ...values,
                    [checkKey]: { ...values[checkKey], [param]: text },
                  },
                })
              }
              onBlur={() => fields.blur("items")}
              errorMessage={messageAt(issues, [checkKey, param])}
              isReadOnly={!isOnline}
              isRequired
              isInteger
            />
          ))}
        </Stack>
      ))}
      <ListRefusal issues={issues} />
    </Stack>
  );
}

const PRESET_TYPES = ["milestone", "launch", "kpi"] as const;

/**
 * A plan's starting execution rows (design-spec 6.17, 6.13): by kind, each row's first
 * column, a KPI's area and a launch row's timing, saved as one list (AD5).
 */
export function ExecutionPresetsEditor({
  version,
}: {
  version: TemplateVersionDetail;
}) {
  const { t } = useTranslation(["admin", "common"]);
  const isOnline = useIsOnline();
  const { target, fields } = useListSetting<PresetValues[]>(
    version,
    "execution-presets",
    t("admin:version.settings.execution-presets"),
    version.executionPresets.map((preset) => ({
      type: preset.type,
      title: preset.title,
      area: preset.area ?? "",
      launchTiming: preset.launchTiming,
    })),
    {
      issuesOf: presetsIssues,
      toWire: presetsWire,
      fromWire: (value) =>
        (value as PresetValues[]).map((preset) => ({
          ...preset,
          area: preset.area ?? "",
          launchTiming: preset.launchTiming ?? null,
        })),
    },
  );
  const rows = fields.values.items;
  const issues = fields.issues("items");
  const isReadOnly = !isOnline;
  const set = (next: PresetValues[], quietly = false) =>
    fields.change({ items: next }, { quietly });
  const done = () => fields.blur("items");
  return (
    <Stack gap="space-400">
      <SaveFailureNote itemKey={target.key} />
      {PRESET_TYPES.map((type) => {
        const entries = placedIn(rows, (row) => row.type === type);
        return (
          <EditableList
            key={type}
            label={t(`admin:presetType.${type}`)}
            rows={entries}
            hasLabels
            rowLabel={({ row }, index) =>
              row.title.trim() === ""
                ? t("admin:version.rowN", { n: index + 1 })
                : row.title
            }
            renderRow={({ place, row }, index) => (
              <>
                <TextField
                  {...rowLabel(
                    t(`admin:version.presetTitle.${type}`),
                    index,
                    t,
                  )}
                  value={row.title}
                  onChange={(title) => set(patched(rows, place, { title }))}
                  onBlur={done}
                  errorMessage={messageAt(issues, [place, "title"])}
                  isReadOnly={isReadOnly}
                  isRequired
                  width="fill"
                />
                {type === "kpi" && (
                  <TextField
                    {...rowLabel(t("admin:version.presetArea"), index, t)}
                    value={row.area}
                    onChange={(area) => set(patched(rows, place, { area }))}
                    onBlur={done}
                    errorMessage={messageAt(issues, [place, "area"])}
                    isReadOnly={isReadOnly}
                  />
                )}
                {type === "launch" && (
                  <Picker
                    {...rowLabel(t("admin:version.presetTiming"), index, t)}
                    items={launchTimingSchema.options.map((timing) => ({
                      id: timing,
                      label: t(`common:launchTiming.${timing}`),
                    }))}
                    value={row.launchTiming}
                    onChange={(value) => {
                      const launchTiming =
                        launchTimingSchema.safeParse(value).data;
                      if (launchTiming === undefined) return;
                      set(patched(rows, place, { launchTiming }));
                      done();
                    }}
                    errorMessage={messageAt(issues, [place, "launchTiming"])}
                    isDisabled={isReadOnly}
                    isRequired
                    width="fit"
                  />
                )}
              </>
            )}
            onMove={(index, step) => {
              const a = entries[index];
              const b = entries[index + step];
              if (a === undefined || b === undefined) return;
              set(swapped(rows, a, b));
              done();
            }}
            onRemove={(index) => {
              const entry = entries[index];
              if (entry === undefined) return;
              set(without(rows, entry.place));
              done();
            }}
            onAdd={() => {
              const order = PRESET_TYPES.indexOf(type);
              const at =
                rows.findLastIndex(
                  (row) => PRESET_TYPES.indexOf(row.type) <= order,
                ) + 1;
              set(
                [
                  ...rows.slice(0, at),
                  { type, title: "", area: "", launchTiming: null },
                  ...rows.slice(at),
                ],
                true,
              );
            }}
            addLabel={t("admin:version.addRow")}
            emptyText={t("admin:version.none")}
            isReadOnly={isReadOnly}
          />
        );
      })}
      <ListRefusal issues={issues} />
    </Stack>
  );
}
