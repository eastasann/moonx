import { formatDate, formatTime } from "@moonx/i18n";
import { Badge, Flex, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import type { DecisionLogSummary } from "../../lib/decision-log";
import { proposerName } from "../ideas/ideaText";
import { decisionBadge, decisionText } from "../validation-home/decision-text";

type Value = Parameters<typeof decisionText>[1];

/** The value of an entry: a decision with its color, a Go / No-Go, or the name of a saved version. */
export function DecisionValueBadge({
  entry,
}: {
  entry: Pick<DecisionLogSummary, "kind" | "value" | "versionName">;
}) {
  const { t } = useTranslation(["validation", "decisionLog"]);
  if (entry.kind === "version_saved") return <Badge size="S">{entry.versionName ?? ""}</Badge>;
  if (!entry.value) return null;
  const value = entry.value as Value;
  return entry.kind === "go_no_go" ? (
    <Badge size="S">{decisionText(t, value)}</Badge>
  ) : (
    <Badge size="S" variant={decisionBadge(value)}>
      {decisionText(t, value)}
    </Badge>
  );
}

/**
 * What one row of 7's list shows (design-spec 6.15): when, which idea and plan, the kind and
 * value, the start of the reason and who recorded it.
 */
export function DecisionRowContent({
  entry,
  timeZone,
}: {
  entry: DecisionLogSummary;
  timeZone: string;
}) {
  const { t } = useTranslation(["decisionLog", "ideas", "common"]);
  const place = entry.plan
    ? t("decisionLog:row.place", { idea: entry.idea.name, plan: entry.plan.name })
    : entry.idea.name;
  return (
    <Flex direction="column" gap="space-50" grow>
      <Flex gap="space-200" justify="between" align="baseline">
        <Text variant="label" as="span">
          {place}
        </Text>
        <Text variant="caption" tone="secondary" as="span">
          {t("decisionLog:row.when", {
            date: formatDate(entry.recordedAt, timeZone),
            time: formatTime(entry.recordedAt, timeZone),
          })}
        </Text>
      </Flex>
      <Flex gap="space-100" align="center" wrap>
        <Text variant="caption" tone="secondary" as="span">
          {t(`decisionLog:kind.${entry.kind}`)}
        </Text>
        <DecisionValueBadge entry={entry} />
        <Text variant="caption" tone="secondary" as="span">
          {t("decisionLog:row.recordedBy", { name: proposerName(t, entry.recordedBy) })}
        </Text>
      </Flex>
      {entry.reasonExcerpt ? <Text variant="body-sm">{entry.reasonExcerpt}</Text> : null}
    </Flex>
  );
}
