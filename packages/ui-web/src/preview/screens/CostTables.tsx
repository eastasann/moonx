import type { Confidence, FauState } from "@moonx/schemas";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { FauPicker } from "../../components/FauPicker";
import { Heading } from "../../components/Heading";
import { ActionMenu, MenuItem } from "../../components/Menu";
import { MoonGlyph, type MoonState } from "../../components/MoonGlyph";
import { NumberField } from "../../components/NumberField";
import { type TableColumn, TableView } from "../../components/TableView";
import { Text } from "../../components/Text";
import { TextField } from "../../components/TextField";
import { Flex, Stack } from "../../layout/Flex";

interface CostRow {
  id: string;
  name: string;
  /** The amount as typed, or "" for none (Unknown or Empty). */
  amount: string;
  /** A variable cost as a share of the price ("35%"), with the amount it comes to. */
  percent?: string;
  state: FauState;
  confidence: Confidence | null;
  note?: string;
  reduce?: string;
  isLumpSum?: boolean;
}

type CostKind = "startup" | "monthly" | "variable";

/** s17-costs.html's columns of each table, with their widths (its colgroups). */
const columnsOf: Record<CostKind, TableColumn[]> = {
  startup: [
    { id: "mark", name: "State", isMark: true },
    { id: "name", name: "Item", isRowHeader: true, width: "31%" },
    { id: "amount", name: "Amount", numeric: true, width: 120 },
    { id: "fau", name: "F/A/U", width: 178, isBelowName: true },
    { id: "note", name: "Why needed", isHiddenOnPhone: true },
    { id: "reduce", name: "Can reduce?", width: 96, isHiddenOnPhone: true },
    { id: "more", name: "Row actions", isRowActions: true },
  ],
  monthly: [
    { id: "mark", name: "State", isMark: true },
    { id: "name", name: "Item", isRowHeader: true, width: "31%" },
    { id: "amount", name: "Amount", numeric: true, width: 120 },
    { id: "fau", name: "F/A/U", width: 178, isBelowName: true },
    { id: "note", name: "Notes", isHiddenOnPhone: true },
    { id: "more", name: "Row actions", isRowActions: true },
  ],
  variable: [
    { id: "mark", name: "State", isMark: true },
    { id: "name", name: "Item", isRowHeader: true, width: "31%" },
    { id: "amount", name: "Amount", numeric: true, width: 170 },
    { id: "fau", name: "F/A/U", isBelowName: true },
    { id: "more", name: "Row actions", isRowActions: true },
  ],
};

const assumption = (confidence: Confidence) => ({
  state: "assumption" as const,
  confidence,
});
const unknown = { state: "unknown" as const, confidence: null, amount: "" };
const empty = { state: "empty" as const, confidence: null, amount: "" };

/** s17-costs.html's rows for Bacolod Health Bowl. */
const rowsOf: Record<CostKind, CostRow[]> = {
  startup: [
    {
      id: "equipment",
      name: "Equipment",
      amount: "60,000",
      state: "fact",
      confidence: null,
      note: "Blast chiller and prep tables",
      reduce: "Partly",
    },
    {
      id: "renovation",
      name: "Renovation",
      amount: "30,000",
      ...assumption("medium"),
      note: "Counter and signage",
      reduce: "Yes",
    },
    {
      id: "deposit",
      name: "Lease Deposit",
      amount: "30,000",
      ...assumption("high"),
      reduce: "No",
    },
    { id: "permits", name: "Permits", ...unknown },
    { id: "inventory", name: "Initial Inventory", ...unknown },
    {
      id: "branding",
      name: "Branding",
      amount: "10,000",
      ...assumption("low"),
      reduce: "Yes",
    },
    {
      id: "launch",
      name: "Launch Marketing",
      amount: "15,000",
      ...assumption("medium"),
      reduce: "Partly",
      isLumpSum: true,
    },
    { id: "tech", name: "Tech Setup", ...unknown },
    { id: "buffer", name: "Working Capital Buffer", ...empty },
    { id: "other", name: "Other", amount: "0", ...assumption("low") },
  ],
  monthly: [
    {
      id: "rent",
      name: "Rent",
      amount: "15,000",
      ...assumption("medium"),
      note: "Lacson St. ground floor, 30 m²",
    },
    {
      id: "salaries",
      name: "Salaries",
      amount: "24,000",
      ...assumption("medium"),
    },
    {
      id: "utilities",
      name: "Utilities",
      amount: "4,500",
      ...assumption("medium"),
    },
    {
      id: "internet",
      name: "Internet-Software",
      amount: "1,500",
      ...assumption("high"),
    },
    {
      id: "accounting",
      name: "Accounting",
      amount: "2,000",
      ...assumption("high"),
    },
    {
      id: "marketing",
      name: "Base Marketing",
      amount: "3,000",
      ...assumption("medium"),
    },
  ],
  variable: [
    {
      id: "materials",
      name: "Materials",
      amount: "77.00",
      percent: "35%",
      ...assumption("medium"),
    },
    {
      id: "packaging",
      name: "Packaging",
      amount: "12.00",
      ...assumption("medium"),
    },
    { id: "fee", name: "Payment Fee", ...empty },
    {
      id: "delivery",
      name: "Delivery",
      amount: "15.00",
      ...assumption("medium"),
    },
    { id: "labor", name: "Variable Labor", ...empty },
    { id: "other", name: "Other", ...empty },
  ],
};

const moonOf: Record<FauState, MoonState> = {
  fact: "fact",
  fact_no_evidence: "fact",
  assumption: "assumption",
  unknown: "unknown",
  unclassified: "unclassified",
  empty: "empty",
};

export interface CostTableProps {
  kind: CostKind;
  title: string;
  /** Beside the title, small ("one time"). */
  unit: string;
  /** The footer's figure: its label ("Subtotal"), value and what it leaves out. */
  total: { label: string; value: string; note?: string };
}

/**
 * One of s17's three tables, its title, rows and footer (+ Add row, the subtotal): the
 * rows edit in place as TableView's do; the subtotal is the figure s17 shows.
 */
export function CostTable({ kind, title, unit, total }: CostTableProps) {
  const { t } = useTranslation(["validation"]);
  const [rows, setRows] = useState(rowsOf[kind]);
  const edit = (id: string, change: Partial<CostRow>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...change } : row)),
    );
  return (
    <Stack gap="space-100">
      <Flex gap="space-200" alignItems="baseline">
        <Heading level={2} variant="heading-4">
          {title}
        </Heading>
        <Text variant="caption" tone="secondary">
          {unit}
        </Text>
      </Flex>
      <TableView
        aria-label={title}
        columns={columnsOf[kind]}
        items={rows}
        isRowEditable={() => true}
        onRowAction={() => {}}
        textValue={(row) => row.name}
        renderCell={(row, column, { isEditing, isCard }) => {
          switch (column) {
            case "mark":
              return <MoonGlyph state={moonOf[row.state]} size="S" />;
            case "name":
              if (isEditing) {
                return (
                  <TextField
                    aria-label={`Item ${row.name}`}
                    value={row.name}
                    onChange={(name) => edit(row.id, { name })}
                    width="full"
                  />
                );
              }
              return row.isLumpSum === true ? (
                <Flex gap="space-100" alignItems="center">
                  {row.name}
                  <Badge>Lump sum</Badge>
                </Flex>
              ) : (
                row.name
              );
            case "amount":
              if (isEditing && row.percent === undefined) {
                return (
                  <NumberField
                    aria-label={`Amount of ${row.name}`}
                    currency="PHP"
                    value={row.amount}
                    onChange={(amount) => edit(row.id, { amount })}
                    width="full"
                  />
                );
              }
              if (row.amount === "") {
                return (
                  <Text variant="number" tone="tertiary">
                    {row.state === "unknown" ? "Unknown" : "Empty"}
                  </Text>
                );
              }
              return row.percent === undefined ? (
                `₱${row.amount}`
              ) : (
                <>
                  {row.percent}{" "}
                  <Text variant="caption" tone="secondary">
                    {`· ₱${row.amount}`}
                  </Text>
                </>
              );
            case "fau":
              // A phone's Empty row says what pressing it is for, in the place of its
              // F/A/U (s17-costs.html, design-spec 6.3).
              if (isCard && row.state === "empty") {
                return (
                  <Text variant="caption" tone="tertiary">
                    {t("validation:costs.emptyRowHint")}
                  </Text>
                );
              }
              return (
                <FauPicker
                  aria-label={`F/A/U of ${row.name}`}
                  state={row.state}
                  confidence={row.confidence}
                  evidenceCount={row.state === "fact" ? 1 : 0}
                  hasValue={row.amount !== ""}
                  isReadOnly={isCard}
                  onChange={({ fau, confidence }) =>
                    edit(row.id, {
                      state:
                        fau === "unknown"
                          ? "unknown"
                          : fau === "assumption" && confidence !== null
                            ? "assumption"
                            : row.amount === ""
                              ? "empty"
                              : "unclassified",
                      confidence,
                      amount: fau === "unknown" ? "" : row.amount,
                    })
                  }
                  onFactPress={() =>
                    edit(row.id, { state: "fact", confidence: null })
                  }
                />
              );
            case "note":
              return (
                <Text variant="body-sm" tone="secondary">
                  {row.note ?? ""}
                </Text>
              );
            case "reduce":
              return row.reduce === undefined ? (
                <Text tone="tertiary">—</Text>
              ) : (
                row.reduce
              );
            default:
              return (
                <ActionMenu size="S" aria-label={`Row actions of ${row.name}`}>
                  <MenuItem id="rename">Rename</MenuItem>
                  <MenuItem id="lump">Lump sum</MenuItem>
                  <MenuItem id="delete">Delete</MenuItem>
                </ActionMenu>
              );
          }
        }}
      />
      <Flex justifyContent="space-between" alignItems="center" gap="space-200">
        <Button variant="secondary" isQuiet size="S">
          <Plus />
          Add row
        </Button>
        <Text variant="body-sm" tone="secondary">
          {`${total.label} `}
          <Text variant="number" tone="primary">
            {total.value}
          </Text>
          {total.note === undefined ? null : ` · ${total.note}`}
        </Text>
      </Flex>
    </Stack>
  );
}
