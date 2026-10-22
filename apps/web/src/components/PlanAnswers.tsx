import { hasText, tableTotals } from "@moonx/domain";
import { formatInputPercent, formatMoney } from "@moonx/i18n";
import {
  longTextSchema,
  type PlanAnswer,
  type PlanTableRow,
  shortTextSchema,
  type TemplateQuestion,
} from "@moonx/schemas";
import {
  ActionMenu,
  AlertDialog,
  Button,
  ContextualHelp,
  Dialog,
  Disclosure,
  Flex,
  MenuItem,
  NumberField,
  Radio,
  RadioGroup,
  Stack,
  TableView,
  type TableColumn as TableViewColumn,
  Text,
  TextArea,
  TextField,
  useIsNarrow,
} from "@moonx/ui-web";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, inPath, unwrap } from "../lib/api";
import type { SaveFields, SaveTarget } from "../lib/autosave";
import { useAutosave, useAutosaveState } from "../lib/autosave-react";
import { inputIssueMessage } from "../lib/input-issues";
import { useIsOnline } from "../lib/online";
import {
  parseTableCell,
  storedCellError,
  type TableColumn,
  tableCellInput,
  tableCellText,
} from "../lib/plan-table";
import { SaveFailureNote } from "./SaveFeedback";
import { useWorkspace } from "./workspace";

// The answers of a plan item's sub-items that take one (21, design-spec 6.12): texts and
// choices as 11's, and tables of rows (§11, §13, §21, §22). Each answer is an item of
// 6.0.2, saved whole (P5): a table sends all its rows.

/** The page's save of a plan answer; its prefix per item is 21's save scope. */
export const planAnswerKey = (planId: string, questionKey: string) =>
  `plan_answer:${planId}:${questionKey}`;

/** Where 21 holds its answers: P4's item. */
export interface PlanAnswersCache {
  /** Puts a saved answer in the item's data. */
  put: (answer: PlanAnswer) => void;
  /** Reads the item again: the answers on the server replace the screen's. */
  reload: () => void;
}

/** The save of one answer (P5 PUT), putting the saved answer in the item's data. */
function answerTarget(
  cache: PlanAnswersCache,
  planId: string,
  questionKey: string,
  noun: string,
  onSaved: () => void,
): SaveTarget {
  return {
    key: planAnswerKey(planId, questionKey),
    noun,
    send: async (fields: SaveFields, lockVersion, force) => {
      const answer = await unwrap(
        api()
          .api.v1.plans({ planId: inPath(planId) })
          .answers({ questionKey: inPath(questionKey) })
          .put({
            ...(fields as { text?: string; rows?: PlanTableRow[] | null }),
            lockVersion,
            ...(force ? { force } : {}),
          }),
      );
      cache.put(answer);
      onSaved();
      return answer.lockVersion;
    },
    loadTheirs: () => cache.reload(),
  };
}

/** One sub-item that takes an answer, as 21 shows it: what was saved, under what waits. */
export interface PlanAnswerView {
  question: TemplateQuestion;
  answer: PlanAnswer;
  /** What the text's field shows, text that breaks its rule included. */
  text: string;
  /** The text saved or on its way: what breaks its rule is never sent. */
  value: string | null;
  /** A table's rows, saved or on their way. */
  rows: PlanTableRow[];
  /** A text not blank, a table with a row (design-spec 6.12「項目の状態」). */
  isAnswered: boolean;
}

/** The rule of a sub-item's text (6.0.8): a short text is shorter. */
const textSchemaOf = (question: TemplateQuestion) =>
  question.answerType === "short_text" ? shortTextSchema : longTextSchema;

/** A table's columns (the template's `options.columns`). */
const columnsOf = (question: TemplateQuestion): TableColumn[] =>
  question.options?.kind === "table" ? question.options.columns : [];

const cellId = (row: number, column: string) => `${row}:${column}`;

/** A new row: every column of the table, empty. */
const emptyRow = (columns: readonly TableColumn[]): PlanTableRow =>
  Object.fromEntries(columns.map((column) => [column.key, null]));

/**
 * Answering an item's sub-items (design-spec 6.12・6.0.2): each answer's view under what
 * waits to be saved; a text saved as typed unless it breaks its rule (shown, never sent),
 * a choice when made; a table's cells as 17's, each change sending the rows. A text the
 * draft copied over its limit keeps its rule's reason until it is short enough; a cell
 * typed against its rule keeps its last value in the rows sent (6.0.8).
 */
export function usePlanAnswers(
  planId: string,
  cache: PlanAnswersCache,
  onSaved: () => void,
) {
  const { t } = useTranslation(["plans"]);
  const autosave = useAutosave();
  const saves = useAutosaveState();
  const [invalidText, setInvalidText] = useState<Record<string, string>>({});
  // A table's typed cells by question: those against their rule, never sent, and those
  // being typed, shown as typed until the field is left (a number is not regrouped).
  const [invalidCells, setInvalidCells] = useState<
    Record<string, Record<string, string>>
  >({});
  const [typedCells, setTypedCells] = useState<
    Record<string, Record<string, string>>
  >({});
  // A cell's value from before it was typed in, by question and cell: while what is typed
  // breaks the rule, the rows on their way keep this, not a keystroke on the way to it.
  const startCells = useRef(new Map<string, PlanTableRow[string] | null>());
  const keyOf = (questionKey: string) => planAnswerKey(planId, questionKey);
  const targetOf = (question: TemplateQuestion) =>
    answerTarget(
      cache,
      planId,
      question.key,
      question.answerType === "table"
        ? t("plans:item.tableNoun")
        : t("plans:item.noun"),
      onSaved,
    );

  const viewOf = (
    question: TemplateQuestion,
    answer: PlanAnswer,
  ): PlanAnswerView => {
    const unsaved = saves?.items.get(keyOf(question.key))?.unsaved ?? {};
    const value = Object.hasOwn(unsaved, "text")
      ? ((unsaved.text as string | null) ?? null)
      : answer.text;
    const rows = Object.hasOwn(unsaved, "rows")
      ? ((unsaved.rows as PlanTableRow[] | null) ?? [])
      : (answer.rows ?? []);
    return {
      question,
      answer,
      text: invalidText[question.key] ?? value ?? "",
      value,
      rows,
      isAnswered:
        question.answerType === "table" ? rows.length > 0 : hasText(value),
    };
  };

  const changeText = (view: PlanAnswerView, typed: string) => {
    const { question, answer } = view;
    if (textSchemaOf(question).safeParse(typed).success) {
      setInvalidText(({ [question.key]: _, ...rest }) => rest);
      autosave.change(targetOf(question), answer.lockVersion, { text: typed });
    } else {
      setInvalidText((fields) => ({ ...fields, [question.key]: typed }));
      autosave.discard(keyOf(question.key), ["text"]);
    }
  };
  /** A choice is saved when made (6.0.2). */
  const choose = (view: PlanAnswerView, text: string) => {
    autosave.change(targetOf(view.question), view.answer.lockVersion, { text });
    autosave.flush(keyOf(view.question.key));
  };
  /**
   * Why the text breaks its rule: as typed, or as the draft copied it over its limit and
   * not yet shortened (6.0.8).
   */
  const textError = (view: PlanAnswerView): string | undefined => {
    const typed = invalidText[view.question.key];
    const checked = typed ?? view.value;
    if (checked === null) return undefined;
    const [issue] =
      textSchemaOf(view.question).safeParse(checked).error?.issues ?? [];
    return issue === undefined ? undefined : inputIssueMessage(issue);
  };

  const sendRows = (view: PlanAnswerView, rows: PlanTableRow[]) =>
    autosave.change(targetOf(view.question), view.answer.lockVersion, {
      rows,
    });
  const setCell = (
    store: typeof setInvalidCells,
    questionKey: string,
    id: string,
    typed: string | undefined,
  ) =>
    store(({ [questionKey]: cells = {}, ...rest }) => {
      const { [id]: _, ...others } = cells;
      const next = typed === undefined ? others : { ...others, [id]: typed };
      return Object.keys(next).length === 0
        ? rest
        : { ...rest, [questionKey]: next };
    });
  const changeCell = (
    view: PlanAnswerView,
    row: number,
    column: TableColumn,
    typed: string,
  ) => {
    const id = cellId(row, column.key);
    const start = `${view.question.key}|${id}`;
    const current = view.rows[row]?.[column.key] ?? null;
    // Typing comes after focus, which keeps the value; this covers a field with none.
    if (!startCells.current.has(start)) startCells.current.set(start, current);
    const parsed = parseTableCell(column, typed);
    if (!parsed.success) {
      setCell(setInvalidCells, view.question.key, id, typed);
      // Not saved (6.0.8): the cell goes back to what it had before it was typed in. Sent
      // even when that is what the server has, as a keystroke may be on its way there.
      const before = startCells.current.get(start) ?? null;
      if (current === before) return;
      sendRows(
        view,
        view.rows.map((kept, index) =>
          index === row ? { ...kept, [column.key]: before } : kept,
        ),
      );
      return;
    }
    setCell(setInvalidCells, view.question.key, id, undefined);
    if (column.type !== "text") {
      setCell(setTypedCells, view.question.key, id, typed);
    }
    sendRows(
      view,
      view.rows.map((current, index) =>
        index === row ? { ...current, [column.key]: parsed.value } : current,
      ),
    );
  };
  /** A cell's field took focus: what it holds now is what it goes back to (changeCell). */
  const focusCell = (view: PlanAnswerView, row: number, column: TableColumn) =>
    startCells.current.set(
      `${view.question.key}|${cellId(row, column.key)}`,
      view.rows[row]?.[column.key] ?? null,
    );
  const blurCell = (view: PlanAnswerView, row: number, column: TableColumn) => {
    startCells.current.delete(
      `${view.question.key}|${cellId(row, column.key)}`,
    );
    setCell(
      setTypedCells,
      view.question.key,
      cellId(row, column.key),
      undefined,
    );
    autosave.flush(keyOf(view.question.key));
  };
  /** What a cell's field shows: as typed, else the row's value. */
  const cellInput = (
    view: PlanAnswerView,
    row: number,
    column: TableColumn,
  ): string => {
    const id = cellId(row, column.key);
    return (
      invalidCells[view.question.key]?.[id] ??
      typedCells[view.question.key]?.[id] ??
      tableCellInput(column, view.rows[row]?.[column.key])
    );
  };
  /** Why a cell breaks its rule, as typed or as the draft copied it. */
  const cellError = (
    view: PlanAnswerView,
    row: number,
    column: TableColumn,
  ): string | undefined => {
    const typed = invalidCells[view.question.key]?.[cellId(row, column.key)];
    if (typed !== undefined) {
      const parsed = parseTableCell(column, typed);
      return parsed.success ? undefined : parsed.error;
    }
    return storedCellError(column, view.rows[row]?.[column.key]);
  };
  /** Moves the typed cells of the rows after `removed` up one row. */
  const shiftCells = (
    cells: Record<string, string> | undefined,
    removed: number,
  ) =>
    Object.fromEntries(
      Object.entries(cells ?? {}).flatMap(([id, typed]) => {
        const [rowText, ...rest] = id.split(":");
        const row = Number(rowText);
        if (row === removed) return [];
        const column = rest.join(":");
        return [[cellId(row > removed ? row - 1 : row, column), typed]];
      }),
    );
  const addRow = (view: PlanAnswerView) => {
    sendRows(view, [...view.rows, emptyRow(columnsOf(view.question))]);
    autosave.flush(keyOf(view.question.key));
  };
  const deleteRow = (view: PlanAnswerView, row: number) => {
    const key = view.question.key;
    for (const start of [...startCells.current.keys()]) {
      if (start.startsWith(`${key}|`)) startCells.current.delete(start);
    }
    setInvalidCells((all) => ({ ...all, [key]: shiftCells(all[key], row) }));
    setTypedCells((all) => ({ ...all, [key]: shiftCells(all[key], row) }));
    sendRows(
      view,
      view.rows.filter((_, index) => index !== row),
    );
    autosave.flush(keyOf(key));
  };
  return {
    viewOf,
    changeText,
    choose,
    textError,
    changeCell,
    focusCell,
    blurCell,
    cellInput,
    cellError,
    addRow,
    deleteRow,
    keyOf,
  };
}

type PlanAnswers = ReturnType<typeof usePlanAnswers>;

/** EXAMPLE and Hint side by side ("▸ EXAMPLE  ▸ Hint"), as 11's (design-spec 6.2). */
export function ExampleAndHint({ question }: { question: TemplateQuestion }) {
  const { t } = useTranslation(["validation"]);
  if (question.example === null && question.hint === null) return null;
  return (
    <Flex wrap columnGap="space-200" alignItems="center">
      {question.example !== null && (
        <Disclosure
          title={t("validation:questions.example")}
          isQuiet
          defaultExpanded
        >
          <Text variant="body-long" elementType="p">
            {question.example}
          </Text>
        </Disclosure>
      )}
      {question.hint !== null && (
        <ContextualHelp
          label={t("validation:questions.hint")}
          aria-label={t("validation:questions.hintFor", {
            title: question.title,
          })}
          title={t("validation:questions.hint")}
          size="S"
        >
          {question.hint}
        </ContextualHelp>
      )}
    </Flex>
  );
}

/**
 * A text or choice sub-item's field (design-spec 6.12, as 11's 6.2): a long text that
 * grows, a short one, or the template's choices; read only offline; its save's failure.
 */
export function PlanTextFields({
  view,
  answers,
}: {
  view: PlanAnswerView;
  answers: PlanAnswers;
}) {
  const { t } = useTranslation(["validation"]);
  const autosave = useAutosave();
  const isOnline = useIsOnline();
  const { question } = view;
  const key = answers.keyOf(question.key);
  const label = t("validation:questions.answerLabel", {
    title: question.title,
  });
  if (question.answerType === "choice" && question.options?.kind === "choice") {
    return (
      <>
        <RadioGroup
          aria-label={label}
          orientation="horizontal"
          value={view.text}
          onChange={(value) => answers.choose(view, value)}
          isReadOnly={!isOnline}
        >
          {question.options.choices.map((choice) => (
            <Radio key={choice} value={choice}>
              {choice}
            </Radio>
          ))}
        </RadioGroup>
        <SaveFailureNote itemKey={key} />
      </>
    );
  }
  const Field = question.answerType === "short_text" ? TextField : TextArea;
  return (
    <>
      <Field
        aria-label={label}
        value={view.text}
        onChange={(value) => answers.changeText(view, value)}
        onBlur={() => autosave.flush(key)}
        isReadOnly={!isOnline}
        errorMessage={answers.textError(view)}
        placeholder={t("validation:questions.placeholder")}
        width="full"
      />
      <SaveFailureNote itemKey={key} />
    </>
  );
}

/** A table's cell to type in: text, or a number, an amount, a % (design-spec 6.0.8). */
function CellField({
  view,
  answers,
  row,
  column,
  label,
}: {
  view: PlanAnswerView;
  answers: PlanAnswers;
  row: number;
  column: TableColumn;
  label: string;
}) {
  const { workspace } = useWorkspace();
  const isOnline = useIsOnline();
  const common = {
    value: answers.cellInput(view, row, column),
    onChange: (value: string) => answers.changeCell(view, row, column, value),
    onFocus: () => answers.focusCell(view, row, column),
    onBlur: () => answers.blurCell(view, row, column),
    errorMessage: answers.cellError(view, row, column),
    isReadOnly: !isOnline,
    width: "full" as const,
    ...(label === "" ? {} : { label }),
  };
  if (column.type === "text") {
    return (
      <TextField
        {...common}
        aria-label={label === "" ? column.label : undefined}
      />
    );
  }
  return (
    <NumberField
      {...common}
      aria-label={label === "" ? column.label : undefined}
      currency={column.type === "money" ? workspace.currency : undefined}
      isPercent={column.type === "percent"}
    />
  );
}

/** The question before a table's row is deleted: the history brings it back (6.0.5). */
function DeleteRowQuestion({
  onDelete,
  onClose,
}: {
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["plans", "validation"]);
  return (
    <AlertDialog
      isOpen
      variant="destructive"
      size="S"
      title={t("plans:item.deleteRowTitle")}
      primaryActionLabel={t("plans:item.delete")}
      cancelLabel={t("plans:item.cancel")}
      autoFocusButton="cancel"
      onPrimaryAction={() => {
        onClose();
        onDelete();
      }}
      onCancel={onClose}
    >
      {t("validation:rows.deleteBody")}
    </AlertDialog>
  );
}

/**
 * A table sub-item (design-spec 6.12, 4.5 TableView): its rows of the template's columns,
 * edited in place as 17's (the touched row's cells turn into fields), "+ Add row" under
 * them and Delete row in a row's ⋯; on a phone a row opens a sheet with its fields.
 * "No rows" while it has none. Values a migration left in removed columns are kept and
 * sent back unseen (SDD 5.9 P5). With `hasTotals`, §13's sums under it, without a warning.
 */
export function PlanTableField({
  view,
  answers,
  canEdit,
  hasTotals,
}: {
  view: PlanAnswerView;
  answers: PlanAnswers;
  canEdit: boolean;
  hasTotals: boolean;
}) {
  const { t } = useTranslation(["plans", "app"]);
  const { workspace } = useWorkspace();
  const isOnline = useIsOnline();
  const isPhone = useIsNarrow();
  const { question } = view;
  const columns = columnsOf(question);
  const [editRequest, setEditRequest] = useState<{
    key: string;
    columnId: string;
  } | null>(null);
  const [sheetRow, setSheetRow] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const items = view.rows.map((row, index) => ({ id: String(index), row }));
  const tableColumns: TableViewColumn[] = [
    ...columns.map((column, index) => ({
      id: column.key,
      name: column.label,
      isRowHeader: index === 0,
      numeric: column.type !== "text",
    })),
    ...(canEdit
      ? [{ id: "actions", name: t("plans:item.editRow"), isRowActions: true }]
      : []),
  ];
  const rowName = (index: number) => t("plans:item.row", { n: index + 1 });
  // The new row is the last: on a phone its sheet opens (the table leaves a phone's rows
  // to the screen); wider, its first cell takes the keyboard once the row is saved, as
  // 17's new row does (asked for while the row is only on its way, the table does not
  // keep it in its inputs).
  const [newRow, setNewRow] = useState<number | null>(null);
  const savedRows = view.answer.rows?.length ?? 0;
  const [first] = columns;
  useEffect(() => {
    if (newRow === null || savedRows <= newRow) return;
    setNewRow(null);
    if (first !== undefined) {
      setEditRequest({ key: String(newRow), columnId: first.key });
    }
  }, [newRow, savedRows, first]);
  const add = () => {
    const index = view.rows.length;
    answers.addRow(view);
    if (isPhone) setSheetRow(index);
    else setNewRow(index);
  };
  const totals = tableTotals(question.options, view.rows);
  const sheet = sheetRow === null ? undefined : view.rows[sheetRow];
  return (
    <Stack gap="space-200">
      <TableView
        aria-label={question.title}
        columns={tableColumns}
        items={items}
        textValue={({ id, row }) => {
          const name =
            first === undefined
              ? ""
              : tableCellText(first, row[first.key], workspace.currency);
          return name.trim() === "" ? rowName(Number(id)) : name;
        }}
        isRowEditable={() => canEdit}
        onRowAction={canEdit ? (key) => setSheetRow(Number(key)) : undefined}
        editRequest={editRequest}
        onEditRequestMet={() => setEditRequest(null)}
        renderEmptyState={() => (
          <Text tone="secondary">{t("plans:item.noRows")}</Text>
        )}
        footerAction={
          canEdit ? (
            <Button
              variant="secondary"
              isQuiet
              aria-label={t("plans:item.addRowTo", { title: question.title })}
              onPress={add}
              isDisabled={!isOnline}
            >
              <Plus />
              {t("plans:item.addRow")}
            </Button>
          ) : undefined
        }
        renderCell={({ id, row }, columnId, { isEditing }) => {
          const index = Number(id);
          if (columnId === "actions") {
            return (
              <ActionMenu
                size="S"
                aria-label={t("plans:item.rowMore", { n: index + 1 })}
                disabledKeys={isOnline ? [] : ["delete"]}
                onAction={(key) => {
                  if (key === "delete") setDeleting(index);
                }}
              >
                <MenuItem id="delete">{t("plans:item.deleteRow")}</MenuItem>
              </ActionMenu>
            );
          }
          const column = columns.find(({ key }) => key === columnId);
          if (column === undefined) return null;
          if (isEditing) {
            return (
              <CellField
                view={view}
                answers={answers}
                row={index}
                column={column}
                label=""
              />
            );
          }
          const error = canEdit
            ? answers.cellError(view, index, column)
            : undefined;
          return (
            <Stack gap="space-25">
              <span>
                {tableCellText(column, row[column.key], workspace.currency)}
              </span>
              {error !== undefined && (
                <Text variant="caption" tone="negative">
                  {error}
                </Text>
              )}
            </Stack>
          );
        }}
      />
      {hasTotals && (
        <Text variant="caption" tone="secondary" elementType="p">
          {[
            t("plans:table.cell", {
              label: t("plans:item.ownership"),
              value: formatInputPercent(totals.ownership),
            }),
            t("plans:table.cell", {
              label: t("plans:item.capital"),
              value: formatMoney(totals.capital, workspace.currency, {
                cents: !Number.isInteger(totals.capital),
              }),
            }),
          ].join(t("app:separator"))}
        </Text>
      )}
      {sheet !== undefined && sheetRow !== null && canEdit && (
        <Dialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setSheetRow(null);
          }}
          isDismissable
          size="M"
          title={rowName(sheetRow)}
        >
          <Stack gap="space-300">
            {columns.map((column) => (
              <CellField
                key={column.key}
                view={view}
                answers={answers}
                row={sheetRow}
                column={column}
                label={column.label}
              />
            ))}
            <Flex>
              <Button
                variant="secondary"
                onPress={() => {
                  const row = sheetRow;
                  setSheetRow(null);
                  setDeleting(row);
                }}
                isDisabled={!isOnline}
              >
                {t("plans:item.deleteRow")}
              </Button>
            </Flex>
          </Stack>
        </Dialog>
      )}
      {deleting !== null && (
        <DeleteRowQuestion
          onDelete={() => answers.deleteRow(view, deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
      <SaveFailureNote itemKey={answers.keyOf(question.key)} />
    </Stack>
  );
}

/** A table's rows as a quiet card says them: the first column's values, or how many. */
export function tableExcerpt(
  view: PlanAnswerView,
  currency: string,
  words: { rows: (count: number) => string; separator: string },
): string | null {
  if (view.rows.length === 0) return null;
  const [first] = columnsOf(view.question);
  const names =
    first === undefined
      ? []
      : view.rows
          .map((row) => tableCellText(first, row[first.key], currency).trim())
          .filter((name) => name !== "");
  return names.length === 0
    ? words.rows(view.rows.length)
    : names.join(words.separator);
}
