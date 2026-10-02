import { formatDate } from "@moonx/i18n";
import type { ResearchLogEntry } from "@moonx/schemas";
import { Badge, Flex, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { sourceTypeLabel, supportsLabel } from "../../lib/research";

/**
 * What one row of 14's list shows: the topic and date, the source type, the checks the entry
 * supports and how many items use it as evidence (design-spec 6.10).
 */
export function ResearchRowContent({
  entry,
  timeZone,
}: {
  entry: ResearchLogEntry;
  timeZone: string;
}) {
  const { t } = useTranslation("research");
  return (
    <Flex direction="column" gap="space-50" grow>
      <Flex gap="space-200" justify="between" align="baseline">
        <Text variant="label" as="span">
          {entry.topic}
        </Text>
        <Text variant="caption" tone="secondary" as="span">
          {entry.observedOn ? formatDate(entry.observedOn, timeZone) : t("research:log.noDate")}
        </Text>
      </Flex>
      <Flex gap="space-100" align="center" wrap>
        {entry.sourceType ? (
          <Text variant="caption" tone="secondary" as="span">
            {sourceTypeLabel(t, entry.sourceType)}
          </Text>
        ) : null}
        {entry.supportsChecks.map((check) => (
          <Badge key={check} size="S" variant="informative">
            {supportsLabel(t, check)}
          </Badge>
        ))}
        {entry.usedAsEvidenceCount > 0 ? (
          <Badge size="S">
            {t("research:log.usedCount", { count: entry.usedAsEvidenceCount })}
          </Badge>
        ) : null}
      </Flex>
    </Flex>
  );
}
