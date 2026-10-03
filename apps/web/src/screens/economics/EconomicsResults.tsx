import { DEFAULT_OPERATING_DAYS, DEFAULT_TARGET_MARGIN } from "@moonx/domain";
import { formatInputPercent } from "@moonx/i18n";
import type { EconomicsResult, EconomicsWarning, MetricValue } from "@moonx/schemas";
import { Grid, Heading, InlineAlert, MetricTile, Stack, Text } from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ECONOMICS_KEYS, formatMetric, type MetricKind } from "../../lib/economics";
import { HOME_KEYS } from "../../lib/validation-home";
import { ScenarioTable } from "./ScenarioTable";

/** The reason a metric has no value, in words; null when nothing needs saying (the warning above says it). */
export function reasonText(t: TFunction, metric: MetricValue): string | null {
  if (metric.value !== null || !metric.reason || metric.reason === "empty") return null;
  if (metric.reason === "margin_not_positive") return null;
  return t(HOME_KEYS.metricReason[metric.reason]);
}

/**
 * A metric as a tile's value and note. `wrap` puts the number in its unit ("6.9 / day"). A metric
 * without a value shows a dash and, under it, the name of what is missing.
 */
function parts(
  t: TFunction,
  metric: MetricValue,
  kind: MetricKind,
  currency: string,
  wrap?: (text: string) => string,
): { value: string; note: string | null } {
  const text = formatMetric(kind, metric, currency);
  if (text === null) return { value: t("validation:economics.dash"), note: reasonText(t, metric) };
  return { value: wrap ? wrap(text) : text, note: null };
}

const WARNING_ORDER: EconomicsWarning[] = [
  "costs_incomplete",
  "margin_not_positive",
  "break_even_above_capacity",
  "conservative_exceeds_capacity",
  "expected_exceeds_capacity",
  "strong_exceeds_capacity",
];

/** The text of the summary bar below desktop: "BE 6.9/day · Exp ₱18,490/mo". */
export function summaryBarText(t: TFunction, result: EconomicsResult, currency: string): string {
  const dash = t("validation:economics.dash");
  const day = formatMetric("units", result.breakEvenUnitsDay, currency);
  const expected = result.scenarios.find((s) => s.key === "expected");
  const profit = expected ? formatMetric("money", expected.operatingProfit, currency) : null;
  return t("economics:summaryBar", {
    breakEven: day === null ? dash : t("economics:short.perDay", { value: day }),
    expected: profit === null ? dash : t("economics:short.perMonth", { value: profit }),
  });
}

/**
 * The result pane of 18: warnings, unit economics, the scenario table and the investment return,
 * all from `result`, which the screen recomputes on every keystroke (design-spec 6.4).
 */
export function EconomicsResults({
  result,
  currency,
  targetMargin,
}: {
  result: EconomicsResult;
  currency: string;
  /** The margin the target-margin figures are for: the input, or the default while it is empty. */
  targetMargin: number;
}) {
  const { t } = useTranslation(["economics", "validation", "common"]);
  const perDay = (text: string) => t("common:format.perDay", { value: text });
  const perMonth = (text: string) => t("common:format.perMonth", { value: text });
  const warnings = WARNING_ORDER.filter((w) => result.warnings.includes(w));

  const variable = parts(t, result.variableCostPerUnit, "money2", currency);
  const contribution = parts(t, result.contributionMargin, "money2", currency);
  const rate = formatMetric("percent", result.contributionMarginRate, currency);
  const breakEven = parts(t, result.breakEvenUnitsDay, "units", currency, perDay);
  const beMonth = formatMetric("units", result.breakEvenUnitsMonth, currency);
  const beRevenue = formatMetric("money", result.breakEvenRevenue, currency);
  const target = parts(t, result.targetMarginUnitsDay, "units", currency, perDay);
  const targetMonth = formatMetric("units", result.targetMarginUnitsMonth, currency);
  const payback = parts(t, result.paybackMonths, "months", currency);
  const roi = parts(t, result.simpleRoi, "percent", currency, (text) =>
    t("economics:roiPerYear", { value: text }),
  );
  const defaults = [
    result.defaultsUsed.operatingDays
      ? t("validation:economics.defaultOperatingDays", { count: DEFAULT_OPERATING_DAYS })
      : null,
    result.defaultsUsed.targetMargin
      ? t("validation:economics.defaultTargetMargin", {
          value: formatInputPercent(DEFAULT_TARGET_MARGIN),
        })
      : null,
  ].filter((note): note is string => note !== null);

  return (
    <Stack gap="space-300">
      {warnings.length > 0 ? (
        <Stack gap="space-100">
          {warnings.map((warning) => (
            <InlineAlert
              key={warning}
              variant="notice"
              heading={t(ECONOMICS_KEYS.warning[warning])}
            />
          ))}
        </Stack>
      ) : null}
      <Heading level={2}>{t("economics:results.unitEconomics")}</Heading>
      <Grid columns={2} gap="space-200">
        <MetricTile
          label={t("economics:results.variable")}
          value={variable.value}
          note={variable.note}
        />
        <MetricTile
          label={t("economics:results.contribution")}
          value={contribution.value}
          note={contribution.note ?? (rate === null ? null : rate)}
        />
        <MetricTile
          label={t("economics:results.breakEven")}
          value={breakEven.value}
          note={
            breakEven.note ??
            (beMonth !== null && beRevenue !== null
              ? t("economics:results.breakEvenNote", {
                  month: perMonth(beMonth),
                  revenue: perMonth(beRevenue),
                })
              : null)
          }
        />
        <MetricTile
          label={t("economics:results.targetMargin", { rate: formatInputPercent(targetMargin) })}
          value={target.value}
          note={target.note ?? (targetMonth === null ? null : perMonth(targetMonth))}
        />
      </Grid>
      {defaults.length > 0 ? (
        <Stack gap="space-25">
          {defaults.map((note) => (
            <Text key={note} variant="caption" tone="secondary">
              {note}
            </Text>
          ))}
        </Stack>
      ) : null}
      <Heading level={2}>{t("economics:results.scenarios")}</Heading>
      <ScenarioTable result={result} currency={currency} />
      <Heading level={2}>{t("economics:results.investment")}</Heading>
      <Grid columns={2} gap="space-200">
        <MetricTile
          label={t("economics:results.payback")}
          value={
            formatMetric("months", result.paybackMonths, currency) === null
              ? payback.value
              : t("common:format.months", {
                  count: result.paybackMonths.value ?? 0,
                  value: payback.value,
                })
          }
          note={payback.note}
        />
        <MetricTile label={t("economics:results.roi")} value={roi.value} note={roi.note} />
      </Grid>
    </Stack>
  );
}
