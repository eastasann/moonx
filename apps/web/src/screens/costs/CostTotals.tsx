import type { CostCategory, EconomicsResult, MetricValue } from "@moonx/schemas";
import { Grid, Heading, Link, MetricTile, Stack, Text } from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { breakdownText, totalView } from "../../lib/costs";
import { formatMetric } from "../../lib/economics";
import { HOME_KEYS } from "../../lib/validation-home";

/** One total of the pane as text: the value, the "3 Unknown, 1 Empty" breakdown, and whether it waits for a price. */
export interface TotalLine {
  value: string;
  breakdown: string | null;
  needsPrice: boolean;
}

/**
 * The total of a table. The variable table is per sale: it needs the price for its percent rows,
 * and has no total while no row holds a value.
 */
export function totalLine(
  t: TFunction,
  result: EconomicsResult,
  category: CostCategory,
  currency: string,
): TotalLine {
  if (category !== "variable") {
    const total = category === "initial" ? result.totals.initial : result.totals.monthlyFixed;
    return { ...totalView(t, total, currency), needsPrice: false };
  }
  const { variablePerUnit } = result.totals;
  const breakdown = breakdownText(t, variablePerUnit);
  if (result.variableCostPerUnit.reason === "needs_price") {
    return { value: t("validation:economics.dash"), breakdown, needsPrice: true };
  }
  if (variablePerUnit.amount === null) {
    return { value: t("costs:totals.empty"), breakdown, needsPrice: false };
  }
  const text = formatMetric("money2", result.variableCostPerUnit, currency) ?? "";
  return { value: t("costs:perSale", { value: text }), breakdown, needsPrice: false };
}

/** The break-even per day, or the reason it cannot be computed yet. */
export function breakEvenText(t: TFunction, metric: MetricValue): string {
  const text = formatMetric("units", metric, "");
  return text === null
    ? t("validation:economics.dash")
    : t("common:format.perDay", { value: text });
}

/** "Subtotal ₱450,000+" with the breakdown under it. */
export function Subtotal({ line, economicsPath }: { line: TotalLine; economicsPath: string }) {
  const { t } = useTranslation("costs");
  return (
    <Stack gap="space-25">
      <Text>{t("subtotal", { value: line.value })}</Text>
      {line.breakdown ? (
        <Text variant="caption" tone="secondary">
          {line.breakdown}
        </Text>
      ) : null}
      {line.needsPrice ? <Link href={economicsPath}>{t("needsPrice")}</Link> : null}
    </Stack>
  );
}

/**
 * The result pane of 17: the three totals and the break-even, computed from the rows as they are
 * edited (design-spec 6.3 "合計の出し方"). It is fixed at the right on desktop and opens in a tray
 * from the summary bar below it.
 */
export function CostTotals({
  result,
  currency,
  economicsPath,
}: {
  result: EconomicsResult;
  currency: string;
  economicsPath: string;
}) {
  const { t } = useTranslation(["costs", "validation", "common"]);
  const initial = totalLine(t, result, "initial", currency);
  const monthly = totalLine(t, result, "monthly_fixed", currency);
  const variable = totalLine(t, result, "variable", currency);
  const breakEven = result.breakEvenUnitsDay;
  const breakEvenReason =
    breakEven.value === null && breakEven.reason && breakEven.reason !== "empty"
      ? t(HOME_KEYS.metricReason[breakEven.reason])
      : null;
  const note = (line: TotalLine) =>
    line.needsPrice ? <Link href={economicsPath}>{t("costs:needsPrice")}</Link> : line.breakdown;
  return (
    <Stack gap="space-300">
      <Heading level={2}>{t("costs:totals.title")}</Heading>
      <Grid columns={1} gap="space-200">
        <MetricTile label={t("costs:totals.startup")} value={initial.value} note={note(initial)} />
        <MetricTile label={t("costs:totals.monthly")} value={monthly.value} note={note(monthly)} />
        <MetricTile
          label={t("costs:totals.variable")}
          value={variable.value}
          note={note(variable)}
        />
        <MetricTile
          label={t("costs:totals.breakEven")}
          value={breakEvenText(t, breakEven)}
          note={breakEvenReason}
        />
      </Grid>
      <Link href={economicsPath}>{t("costs:totals.toEconomics")}</Link>
    </Stack>
  );
}

/** The text of the summary bar below desktop: "Startup ₱450,000+ · Monthly ₱49,000 · BE 13+/day". */
export function summaryBarText(t: TFunction, result: EconomicsResult, currency: string): string {
  const startup = totalView(t, result.totals.initial, currency).value;
  const monthly = totalView(t, result.totals.monthlyFixed, currency).value;
  const text = formatMetric("units", result.breakEvenUnitsDay, currency);
  return t("costs:summaryBar", {
    startup,
    monthly,
    breakEven:
      text === null ? t("validation:economics.dash") : t("costs:perDayShort", { value: text }),
  });
}
