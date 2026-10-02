import type { Assumption, Risk } from "@moonx/schemas";
import { Badge, Flex, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { levelLabel } from "../../lib/research";

/** What one assumption of 16's list shows: the statement, its confidence and its evidence. */
export function AssumptionRowContent({ assumption }: { assumption: Assumption }) {
  const { t } = useTranslation("research");
  const { confidence } = assumption;
  return (
    <Flex direction="column" gap="space-50" grow>
      <Text variant="label" as="span">
        {assumption.statement}
      </Text>
      <Flex gap="space-100" align="center" wrap>
        <Badge size="S" variant="informative">
          {confidence
            ? t("research:assumptions.confidenceBadge", {
                level: levelLabel(t, confidence),
              })
            : t("research:assumptions.noConfidence")}
        </Badge>
        {assumption.evidence.length > 0 ? (
          <Badge size="S">
            {t("research:assumptions.evidenceBadge", { count: assumption.evidence.length })}
          </Badge>
        ) : null}
      </Flex>
    </Flex>
  );
}

/** What one risk of 16's list shows: the statement with its Impact and Probability. */
export function RiskRowContent({ risk }: { risk: Risk }) {
  const { t } = useTranslation("research");
  const { impact, probability } = risk;
  return (
    <Flex direction="column" gap="space-50" grow>
      <Text variant="label" as="span">
        {risk.statement}
      </Text>
      <Flex gap="space-100" align="center" wrap>
        <Badge size="S" variant="informative">
          {impact
            ? t("research:risks.impactBadge", { level: levelLabel(t, impact) })
            : t("research:risks.noImpact")}
        </Badge>
        <Badge size="S">
          {probability
            ? t("research:risks.probabilityBadge", {
                level: levelLabel(t, probability),
              })
            : t("research:risks.noProbability")}
        </Badge>
      </Flex>
    </Flex>
  );
}
