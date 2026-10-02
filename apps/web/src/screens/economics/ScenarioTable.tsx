import type { EconomicsResult, MetricValue, ScenarioColumn } from "@moonx/schemas";
import {
  Flex,
  RowList,
  RowListItem,
  Tab,
  TabList,
  TableView,
  type TableViewColumn,
  TabPanel,
  Tabs,
  Text,
  useIsNarrow,
} from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ECONOMICS_KEYS, formatMetric, type MetricKind } from "../../lib/economics";

const ROW_LABEL_KEYS = {
  unitsPerDay: "economics:scenarios.unitsPerDay",
  unitsPerMonth: "economics:scenarios.unitsPerMonth",
  revenue: "economics:scenarios.revenue",
  variableCostTotal: "economics:scenarios.variableCostTotal",
  operatingProfit: "economics:scenarios.operatingProfit",
  operatingMargin: "economics:scenarios.operatingMargin",
} as const;

/** The rows of the scenario table: what each column shows, and how. */
const ROWS: {
  id: keyof typeof ROW_LABEL_KEYS;
  kind: MetricKind;
  of: (column: ScenarioColumn) => MetricValue;
}[] = [
  { id: "unitsPerDay", kind: "units", of: (c) => c.unitsPerDay },
  { id: "unitsPerMonth", kind: "units", of: (c) => c.unitsPerMonth },
  { id: "revenue", kind: "money", of: (c) => c.revenue },
  { id: "variableCostTotal", kind: "money", of: (c) => c.variableCostTotal },
  { id: "operatingProfit", kind: "money", of: (c) => c.operatingProfit },
  { id: "operatingMargin", kind: "percent", of: (c) => c.operatingMargin },
];

/** A scenario that has no value reads "Empty" when its units are empty, and a dash for any other gap. */
function cellText(t: TFunction, metric: MetricValue, kind: MetricKind, currency: string): string {
  const text = formatMetric(kind, metric, currency);
  if (text !== null) return text;
  return metric.reason === "empty"
    ? t("validation:economics.reason.empty")
    : t("validation:economics.dash");
}

/**
 * The five scenario columns, Break-even to Capacity limit (design-spec 6.4). Desktop and tablet
 * show the table; a phone shows one column at a time under a tab for each.
 */
export function ScenarioTable({ result, currency }: { result: EconomicsResult; currency: string }) {
  const { t } = useTranslation(["economics", "validation", "common"]);
  const isNarrow = useIsNarrow();
  const { scenarios } = result;

  if (isNarrow) {
    return (
      <Tabs defaultSelectedKey="break_even">
        <TabList aria-label={t("economics:scenarios.label")}>
          {scenarios.map((column) => (
            <Tab
              key={column.key}
              id={column.key}
              aria-label={t(ECONOMICS_KEYS.scenarioFull[column.key])}
            >
              {t(ECONOMICS_KEYS.scenario[column.key])}
            </Tab>
          ))}
        </TabList>
        {scenarios.map((column) => (
          <TabPanel key={column.key} id={column.key}>
            <RowList aria-label={t(ECONOMICS_KEYS.scenarioFull[column.key])}>
              {ROWS.map((row) => (
                <RowListItem key={row.id}>
                  <Flex gap="space-200" justify="between" align="baseline">
                    <Text as="span" tone="secondary">
                      {t(ROW_LABEL_KEYS[row.id])}
                    </Text>
                    <Text as="span">{cellText(t, row.of(column), row.kind, currency)}</Text>
                  </Flex>
                </RowListItem>
              ))}
            </RowList>
          </TabPanel>
        ))}
      </Tabs>
    );
  }

  const columns: TableViewColumn[] = [
    { id: "metric", label: t("economics:scenarios.metric"), isRowHeader: true },
    ...scenarios.map((column) => ({
      id: column.key,
      label: t(ECONOMICS_KEYS.scenario[column.key]),
      isNumeric: true,
    })),
  ];
  const rows = ROWS.map((row) => ({
    id: row.id,
    textValue: t(ROW_LABEL_KEYS[row.id]),
    cells: {
      metric: t(ROW_LABEL_KEYS[row.id]),
      ...Object.fromEntries(
        scenarios.map((column) => [column.key, cellText(t, row.of(column), row.kind, currency)]),
      ),
    },
  }));
  return (
    <TableView
      aria-label={t("economics:scenarios.label")}
      columns={columns}
      rows={rows}
      density="compact"
      layout="table"
    />
  );
}
