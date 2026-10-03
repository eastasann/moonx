import {
  formatInputPercent,
  formatMoney,
  moneyInputFormat,
  PERCENT_INPUT_FORMAT,
} from "@moonx/i18n";
import { MAX_LONG_TEXT } from "@moonx/schemas";
import {
  ActionButton,
  Button,
  Divider,
  Flex,
  Heading,
  NumberField,
  QuestionCard,
  Stack,
  TableView,
  Text,
  TextArea,
} from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { Trash2 } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { ConflictDialog } from "../../components/ConflictDialog";
import { ItemPanelButtons } from "../../components/ItemPanelButtons";
import { formatItemTarget } from "../../lib/panel-target";
import {
  blankRow,
  type CellProblem,
  cellProblem,
  cellText,
  rowsBody,
  sameRows,
  type TableColumn,
  tableColumns,
} from "../../lib/plan-item";
import type { PlanAnswer, PlanRow } from "../../lib/plans";
import { ExampleAndHint, SaveFailure } from "./SubItemParts";
import type { SubItemProps } from "./TextSubItem";
import { usePlanAnswer } from "./usePlanAnswer";

/** A row of the editor: the cells, and an identity that survives adding and removing other rows. */
interface DraftRow {
  uid: number;
  cells: PlanRow;
}

let lastUid = 0;
const draftRows = (rows: readonly PlanRow[] | null | undefined): DraftRow[] =>
  (rows ?? []).map((cells) => ({ uid: ++lastUid, cells }));

const CELL_PROBLEM_KEY = {
  percent: "planItem:problems.percent",
  money: "planItem:problems.money",
} as const satisfies Record<CellProblem, string>;

export interface TableSubItemProps extends SubItemProps {
  currency: string;
  /** Whether the item shows the ownership and capital totals under this table (§13). */
  hasTotals: boolean;
}

/**
 * A table sub-item (design-spec 6.12): rows of the columns in the template, added, edited and
 * removed in place. The whole `rows` array is one answer and is saved together; a cell the API
 * would refuse (a share over 100%, a negative amount) keeps the save from going out and says why.
 */
export function TableSubItem({
  planId,
  question,
  answer,
  isReadOnly,
  hasPanels,
  isFocused,
  isOpenAll,
  onFocusRequest,
  onNavigate,
  onSaved,
  currency,
  hasTotals,
}: TableSubItemProps) {
  const { t } = useTranslation(["planItem", "form", "app"]);
  const columns = tableColumns(question);
  // A different set of rows from the server starts the cells over, since number fields hold their own text.
  const generation = useRef(0);
  const editor = usePlanAnswer<DraftRow[]>({
    planId,
    answer,
    isReadOnly,
    initial: (source) => {
      generation.current += 1;
      return draftRows(source.rows);
    },
    body: (rows) => ({
      rows: rowsBody(
        columns,
        rows.map((row) => row.cells),
      ),
    }),
    matches: (rows, saved) =>
      sameRows(
        columns,
        rows.map((row) => row.cells),
        saved.rows ?? [],
      ),
    restore: (patch) => (Array.isArray(patch.rows) ? draftRows(patch.rows as PlanRow[]) : null),
    onSaved,
  });
  const { draft: rows, item } = editor;

  const problemOf = (row: DraftRow, column: TableColumn) =>
    cellProblem(column, row.cells[column.key] ?? null);
  const hasProblem = (next: DraftRow[]) =>
    next.some((row) => columns.some((column) => problemOf(row, column) !== null));
  const update = (next: DraftRow[], delay?: number) =>
    editor.change(next, { delay, send: !hasProblem(next) });
  const setCell = (uid: number, key: string, value: string | number | null, delay?: number) =>
    update(
      rows.map((row) =>
        row.uid === uid ? { ...row, cells: { ...row.cells, [key]: value } } : row,
      ),
      delay,
    );

  const totals = hasTotals
    ? totalsOfRows(
        columns,
        rows.map((row) => row.cells),
      )
    : null;
  const summary = t("planItem:rowCount", { count: rows.length });

  const editable = (
    <Stack gap="space-300">
      {rows.length === 0 ? (
        <Text tone="secondary">{t("planItem:noRows")}</Text>
      ) : (
        rows.map((row, position) => (
          <Stack key={`${generation.current}:${row.uid}`} gap="space-200">
            {position > 0 ? <Divider /> : null}
            <Flex gap="space-200" align="center" justify="between">
              <Heading level={3}>{t("planItem:rowTitle", { position: position + 1 })}</Heading>
              <ActionButton
                isQuiet
                size="S"
                icon={<Trash2 />}
                aria-label={t("planItem:removeRow", { position: position + 1 })}
                onPress={() =>
                  update(
                    rows.filter((candidate) => candidate.uid !== row.uid),
                    0,
                  )
                }
              />
            </Flex>
            {columns.map((column) => (
              <CellField
                key={column.key}
                column={column}
                value={row.cells[column.key] ?? null}
                currency={currency}
                problem={problemOf(row, column)}
                onChange={(value) =>
                  setCell(row.uid, column.key, value, column.type === "text" ? undefined : 0)
                }
                onBlur={() => void editor.flush()}
              />
            ))}
          </Stack>
        ))
      )}
      <Flex>
        <Button
          variant="secondary"
          onPress={() => update([...rows, ...draftRows([blankRow(columns)])], 0)}
        >
          {t("planItem:addRow")}
        </Button>
      </Flex>
    </Stack>
  );

  const readOnly =
    rows.length === 0 ? (
      <Text tone="secondary">{t("planItem:noRows")}</Text>
    ) : (
      <TableView
        aria-label={question.prompt}
        density="compact"
        layout="auto"
        columns={columns.map((column, index) => ({
          id: column.key,
          label: column.label,
          isRowHeader: index === 0,
          isNumeric: column.type !== "text",
        }))}
        rows={rows.map((row) => ({
          id: String(row.uid),
          cells: Object.fromEntries(
            columns.map((column) => [
              column.key,
              cellText(column, row.cells[column.key], currency) ?? t("planItem:noValue"),
            ]),
          ),
        }))}
      />
    );

  return (
    <>
      <QuestionCard
        title={question.title}
        isFocused={isFocused || isOpenAll}
        autoScroll={!isOpenAll}
        answer={rows.length > 0 ? summary : ""}
        emptyLabel={t("form:empty")}
        actions={
          hasPanels ? (
            <ItemPanelButtons
              target={formatItemTarget("plan_answer", planId, question.key)}
              commentCount={answer.commentCount}
            />
          ) : null
        }
        onFocusRequest={onFocusRequest}
        onNavigate={onNavigate}
      >
        <Stack gap="space-200">
          <Text variant="label">{question.prompt}</Text>
          {isReadOnly ? readOnly : editable}
          {totals ? (
            <Stack gap="space-50">
              <Text variant="label" as="span">
                {t("planItem:totals.ownership", { value: formatInputPercent(totals.ownership) })}
              </Text>
              <Text variant="label" as="span">
                {t("planItem:totals.capital", { value: formatMoney(totals.capital, currency) })}
              </Text>
            </Stack>
          ) : null}
          <SaveFailure
            item={item}
            resend={() => ({
              rows: rowsBody(
                columns,
                rows.map((row) => row.cells),
              ),
            })}
          />
          <ExampleAndHint question={question} />
        </Stack>
      </QuestionCard>
      <ConflictDialog
        current={item.conflict}
        itemName={t("form:conflict.answer")}
        theirText={rowsSummary(t, (item.conflict?.value as PlanAnswer | undefined)?.rows)}
        mineText={rowsSummary(t, item.mine?.rows as PlanRow[] | undefined)}
        onLoadTheirs={item.loadTheirs}
        onKeepMine={item.keepMine}
      />
    </>
  );
}

function rowsSummary(t: TFunction, rows: readonly PlanRow[] | null | undefined): string | null {
  return rows ? t("planItem:rowCount", { count: rows.length }) : null;
}

/**
 * The sums under the ownership table, from the rows on screen: they follow what is typed and a
 * saved version shows its own rows. The columns are the ones the API sums for the `totals`
 * reference.
 */
function totalsOfRows(columns: readonly TableColumn[], rows: readonly PlanRow[]) {
  const sum = (key: string) =>
    columns.some((column) => column.key === key)
      ? rows.reduce(
          (total, row) => total + (typeof row[key] === "number" ? (row[key] as number) : 0),
          0,
        )
      : 0;
  return { ownership: sum("ownership"), capital: sum("capital") };
}

interface CellFieldProps {
  column: TableColumn;
  value: string | number | null;
  currency: string;
  problem: CellProblem | null;
  onChange: (value: string | number | null) => void;
  onBlur: () => void;
}

function CellField({ column, value, currency, problem, onChange, onBlur }: CellFieldProps) {
  const { t } = useTranslation("planItem");
  if (column.type === "text") {
    return (
      <TextArea
        label={column.label}
        value={typeof value === "string" ? value : ""}
        maxLength={MAX_LONG_TEXT}
        onChange={(next) => onChange(next)}
        onBlur={onBlur}
      />
    );
  }
  return (
    <NumberField
      label={column.label}
      defaultValue={typeof value === "number" ? value : Number.NaN}
      formatOptions={
        column.type === "percent"
          ? PERCENT_INPUT_FORMAT
          : column.type === "money"
            ? moneyInputFormat(currency)
            : undefined
      }
      isInvalid={problem !== null}
      errorMessage={problem ? t(CELL_PROBLEM_KEY[problem]) : undefined}
      // A number is read when it is committed, not per keystroke: the rows go out as a whole, and
      // the half-typed 15 on the way to 150 must not be what the server keeps.
      onChange={(next) => onChange(Number.isNaN(next) ? null : next)}
      onBlur={onBlur}
    />
  );
}
