import type { EconomicsWarning } from "@moonx/schemas";
import { Grid, Link, MetricTile, Stack } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { linkTargetPath } from "../../lib/link-target";
import { HOME_METRIC_KEYS, metricView, type ValidationHomeData } from "../../lib/validation-home";
import { BlockHeading } from "./BlockHeading";

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
  const warnings: EconomicsWarning[] = data.economicsWarnings;
  const economicsPath = linkTargetPath({ screen: 18, workspaceId, ideaId: data.idea.id });
  return (
    <Stack gap="space-200">
      <BlockHeading>{t("home.blocks.keyNumbers")}</BlockHeading>
      <Grid columns={2} gap="space-200">
        {HOME_METRIC_KEYS.map((key) => {
          const view = metricView(t, key, data.keyMetrics[key], {
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
    </Stack>
  );
}
