import { formatCheckName, formatCount, formatMonths, i18n } from "@moonx/i18n";
import type { CheckResult, FauBreakdown, MetricValue } from "@moonx/schemas";
import {
  Flex,
  MetricGroup,
  MetricTile,
  MoonGlyph,
  RowList,
  RowListItem,
  Text,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { metricText } from "../lib/metrics";
import { checkReason, dotState } from "./ideaParts";

/** The key numbers of a decision (design-spec 6.5「表示内容」), with how each reads. */
const KEY_NUMBERS = [
  ["initial_cost_total", "startup"],
  ["break_even_units_day", "breakEven"],
  ["expected_operating_profit", "expectedProfit"],
  ["payback_months", "payback"],
  ["simple_roi", "roi"],
] as const;

type KeyNumber = (typeof KEY_NUMBERS)[number][0];

/** A key number's value with its unit in one ("14.4+ / day", s19-decision.html .kn). */
function keyNumberText(
  key: KeyNumber,
  metric: MetricValue,
  currency: string,
): string {
  const t = i18n.t.bind(i18n);
  switch (key) {
    case "initial_cost_total":
      return metricText(metric, "money", currency);
    case "break_even_units_day":
      return metric.value === null
        ? metricText(metric, "units", currency)
        : t("validation:decision.perDay", {
            value: metricText(metric, "units", currency),
          });
    case "expected_operating_profit":
      return metric.value === null
        ? metricText(metric, "money", currency)
        : t("validation:decision.perMonth", {
            value: metricText(metric, "money", currency),
          });
    case "payback_months":
      return metric.value === null
        ? metricText(metric, "months", currency)
        : t("validation:decision.months", {
            value: formatMonths(metric.value, {
              bound: metric.bound,
              withUnit: false,
            }),
          });
    case "simple_roi":
      return metricText(metric, "percent", currency);
  }
}

/**
 * The five key numbers 19 decides on and 7 shows as recorded (design-spec 6.5・6.15):
 * startup, break-even per day, Expected profit, payback and ROI, compact. A record that
 * kept fewer leaves the others out.
 */
export function DecisionKeyNumbers({
  keyMetrics,
  currency,
  "aria-label": label,
}: {
  keyMetrics: Partial<Record<string, MetricValue>>;
  currency: string;
  "aria-label": string;
}) {
  const { t } = useTranslation(["validation"]);
  return (
    <MetricGroup aria-label={label} variant="compact">
      {KEY_NUMBERS.flatMap(([key, name]) => {
        const metric = keyMetrics[key];
        return metric === undefined
          ? []
          : [
              <MetricTile
                key={key}
                label={t(`validation:decision.metric.${name}`)}
                value={keyNumberText(key, metric, currency)}
                isPlaceholder={metric.value === null}
              />,
            ];
      })}
    </MetricGroup>
  );
}

/** The checks not done (design-spec 6.5): each one's moon, name, state and why. */
export function MissingCheckRows({
  checks,
  "aria-label": label,
}: {
  checks: readonly CheckResult[];
  "aria-label": string;
}) {
  const { t } = useTranslation(["common"]);
  return (
    <RowList aria-label={label}>
      {checks.map((check) => (
        <RowListItem
          key={check.key}
          start={<MoonGlyph state={dotState[check.state]} />}
          end={t(`common:checkState.${check.state}`)}
          description={checkReason(check) ?? undefined}
        >
          {formatCheckName(check.key, check.params)}
        </RowListItem>
      ))}
    </RowList>
  );
}

/**
 * The F/A/U of every item in one line (design-spec 6.5, s19-decision.html): each kind's
 * moon, name and count, Unknown and Unclassified in amber, Empty too.
 */
export function FauCounts({ fau }: { fau: FauBreakdown }) {
  const { t } = useTranslation(["common"]);
  const counts = [
    { state: "fact", label: "fact", value: fau.fact, notice: false },
    {
      state: "assumption",
      label: "assumption",
      value: fau.assumption.total,
      notice: false,
    },
    { state: "unknown", label: "unknown", value: fau.unknown, notice: true },
    {
      state: null,
      label: "unclassified",
      value: fau.unclassified,
      notice: true,
    },
    { state: null, label: "empty", value: fau.empty, notice: false },
  ] as const;
  return (
    <Flex gap="space-200" alignItems="center" wrap>
      {counts.map((count) => (
        <Flex key={count.label} gap="space-75" alignItems="center">
          {count.state !== null && <MoonGlyph state={count.state} size="S" />}
          <Text variant="body-sm" tone={count.notice ? "notice" : "secondary"}>
            {`${t(`common:fauState.${count.label}`)} `}
            <Text variant="number" tone={count.notice ? "notice" : "primary"}>
              {formatCount(count.value)}
            </Text>
          </Text>
        </Flex>
      ))}
    </Flex>
  );
}
