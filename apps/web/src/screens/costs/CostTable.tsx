import type { CostCategory, CostItem } from "@moonx/schemas";
import { Button, Flex, Heading, Stack, TableView, type TableViewColumn, Text } from "@moonx/ui-web";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { COST_TABLE_KEYS } from "../../lib/costs";
import {
  AmountField,
  CanReduceField,
  FauField,
  NameField,
  NotesField,
  type RowView,
  WhyNeededField,
} from "./CostFields";
import { type RowActions, RowMenu } from "./CostRowMenu";

export interface CostTableProps {
  category: CostCategory;
  /** The rows of this table in order. */
  items: readonly CostItem[];
  viewOf: (item: CostItem) => RowView;
  actions: RowActions;
  /** Below tablet the rows are cards that open a sheet; elsewhere the fields are in the cells. */
  isNarrow: boolean;
  /** The table's total with its breakdown, drawn under the rows. */
  subtotal: ReactNode;
  isReadOnly: boolean;
  isAdding: boolean;
  onAdd: () => void;
  onOpenRow: (id: string) => void;
}

const COLUMNS: Record<CostCategory, TableViewColumn["id"][]> = {
  initial: ["name", "amount", "fau", "whyNeeded", "canReduce", "actions"],
  monthly_fixed: ["name", "amount", "fau", "notes", "actions"],
  variable: ["name", "amount", "fau", "actions"],
};

const NARROW_COLUMNS = ["name", "amount", "fau", "actions"];

const WIDTHS: Record<string, TableViewColumn["width"]> = {
  name: "2fr",
  amount: "2fr",
  fau: "2fr",
  whyNeeded: "3fr",
  notes: "3fr",
  canReduce: "1fr",
  actions: 64,
};

/** One of the three cost tables with its heading, its rows, "Add row" and its subtotal (design-spec 6.3). */
export function CostTable({
  category,
  items,
  viewOf,
  actions,
  isNarrow,
  subtotal,
  isReadOnly,
  isAdding,
  onAdd,
  onOpenRow,
}: CostTableProps) {
  const { t } = useTranslation("costs");
  const title = t(COST_TABLE_KEYS[category]);
  const ids = isNarrow ? NARROW_COLUMNS : COLUMNS[category];
  const columns: TableViewColumn[] = ids.map((id) => ({
    id,
    label: t(`columns.${id}`),
    isRowHeader: id === "name",
    width: WIDTHS[id],
  }));

  const rows = items.map((item, index) => {
    const live = viewOf(item);
    // The card of a phone shows the row as text; the sheet it opens holds the fields.
    const view: RowView = isNarrow ? { ...live, isReadOnly: true } : live;
    return {
      id: item.id,
      textValue: live.draft.name,
      cells: {
        name: <NameField view={view} isLabelHidden />,
        amount: <AmountField view={view} isLabelHidden />,
        fau: <FauField view={view} />,
        whyNeeded: <WhyNeededField view={view} isLabelHidden />,
        notes: <NotesField view={view} isLabelHidden />,
        canReduce: <CanReduceField view={view} isLabelHidden />,
        actions: (
          <RowMenu
            view={live}
            isFirst={index === 0}
            isLast={index === items.length - 1}
            actions={actions}
          />
        ),
      },
    };
  });

  return (
    <Stack gap="space-200">
      <Heading level={2}>{title}</Heading>
      <TableView
        aria-label={title}
        columns={columns}
        rows={rows}
        density="regular"
        layout="auto"
        onRowAction={isNarrow ? (key) => onOpenRow(String(key)) : undefined}
        emptyState={<Text tone="secondary">{t("noRows")}</Text>}
      />
      <Flex gap="space-200" align="center" justify="between" wrap>
        {isReadOnly ? null : (
          <Button
            variant="secondary"
            size="S"
            isDisabled={isAdding}
            aria-label={t("addRowTo", { table: title })}
            onPress={onAdd}
          >
            {t("addRow")}
          </Button>
        )}
        {subtotal}
      </Flex>
    </Stack>
  );
}
