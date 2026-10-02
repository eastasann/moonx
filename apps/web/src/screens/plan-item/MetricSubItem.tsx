import type { KeyMetrics, ScenarioColumn } from "@moonx/schemas";
import { Grid, Heading, Link, MetricTile, QuestionCard, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { linkTargetPath } from "../../lib/link-target";
import { metricEditScreen, metricGroups } from "../../lib/plan-item";
import type { SubItemProps } from "./TextSubItem";

export interface MetricSubItemProps extends Pick<SubItemProps, "question"> {
  workspaceId: string;
  ideaId: string;
  metrics: KeyMetrics;
  scenarios: readonly ScenarioColumn[];
  currency: string;
  /** Owners and Members get the link that goes to where the numbers are entered. */
  canEditValidation: boolean;
}

/**
 * A sub-item that shows numbers read from the validation (design-spec 6.12): no input, and a link
 * to the validation screen that has them. The card is always open, since there is nothing to
 * answer and nothing to move through.
 */
export function MetricSubItem({
  question,
  workspaceId,
  ideaId,
  metrics,
  scenarios,
  currency,
  canEditValidation,
}: MetricSubItemProps) {
  const { t } = useTranslation(["planItem", "form"]);
  const groups = metricGroups(t, question, metrics, scenarios, currency);
  const href = linkTargetPath({ screen: metricEditScreen(question), workspaceId, ideaId });
  return (
    <QuestionCard title={question.title} isFocused emptyLabel={t("form:empty")}>
      <Stack gap="space-200">
        <Text variant="label">{question.prompt}</Text>
        {groups.map((group) => (
          <Stack key={group.key} gap="space-100">
            {group.heading ? <Heading level={3}>{group.heading}</Heading> : null}
            <Grid columns={group.tiles.length >= 3 ? 3 : 2} gap="space-200">
              {group.tiles.map((tile) => (
                <MetricTile key={tile.key} label={tile.label} value={tile.value} note={tile.note} />
              ))}
            </Grid>
          </Stack>
        ))}
        <Text variant="caption" tone="secondary">
          {t("planItem:metricsNote")}
        </Text>
        {canEditValidation && href ? (
          <Link href={href}>{t("planItem:editInValidation")}</Link>
        ) : null}
      </Stack>
    </QuestionCard>
  );
}
