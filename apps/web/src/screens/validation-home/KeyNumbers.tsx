import type { EconomicsWarning, MetricValue } from "@moonx/schemas";
import { Grid, Link, MetricTile, Stack } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { linkTargetPath } from "../../lib/link-target";
import {
  HOME_METRIC_KEYS,
  type HomeMetricKey,
  metricView,
  type ValidationHomeData,
} from "../../lib/validation-home";
import { BlockHeading } from "./BlockHeading";

/**
 * Key number tiles, two by two. Shared by the home and the decision screen, which differ in the
 * keys they show and in whether the negative-margin warning links to Unit Economics.
 */
export function MetricGrid({
  keys,
  metrics,
  currency,
  warnings,
  economicsPath,
}: {
  keys: readonly HomeMetricKey[];
  metrics: Partial<Record<HomeMetricKey, MetricValue>>;
  currency: string;
  warnings: readonly EconomicsWarning[];
  economicsPath: string | null;
}) {
  const { t } = useTranslation("validation");
  return (
    <Grid columns={2} gap="space-200">
      {keys.map((key) => {
        const view = metricView(t, key, metrics[key], {
          currency,
          marginNegative: warnings.includes("margin_not_positive"),
        });
        return (
          <MetricTile
            key={key}
            label={view.label}
            value={view.value}
            note={
              view.marginNegative && economicsPath ? (
                <Stack gap="space-50">
                  <span>{view.note}</span>
                  <Link href={economicsPath}>{t("home.fixMargin")}</Link>
                </Stack>
              ) : (
                view.note
              )
            }
          />
        );
      })}
    </Grid>
  );
}

/** The four key numbers (design-spec 6.1 "主要指標"), two by two. */
export function KeyNumbers({
  data,
  workspaceId,
  currency,
}: {
  data: ValidationHomeData;
  workspaceId: string;
  currency: string;
}) {
  const { t } = useTranslation("validation");
  return (
    <Stack gap="space-200">
      <BlockHeading>{t("home.blocks.keyNumbers")}</BlockHeading>
      <MetricGrid
        keys={HOME_METRIC_KEYS}
        metrics={data.keyMetrics}
        currency={currency}
        warnings={data.economicsWarnings}
        economicsPath={linkTargetPath({ screen: 18, workspaceId, ideaId: data.idea.id })}
      />
    </Stack>
  );
}
