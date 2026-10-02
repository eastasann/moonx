import { formatDate } from "@moonx/i18n";
import { Badge, Flex, Link, RowList, RowListItem, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { linkTargetPath } from "../../lib/link-target";
import { type PlanHome, planPaths } from "../../lib/plans";
import { HOME_METRIC_KEYS } from "../../lib/validation-home";
import { BlockHeading } from "../validation-home/BlockHeading";
import { decisionText } from "../validation-home/decision-text";
import { MetricGrid } from "../validation-home/KeyNumbers";
import type { PlanAccess } from "./access";

interface BlockProps {
  plan: PlanHome;
  workspaceId: string;
  ideaId: string;
  access: PlanAccess;
}

/** The four key numbers, read from validation, with the way back to where they are edited. */
export function PlanKeyNumbers({ plan, workspaceId, ideaId, access }: BlockProps) {
  const { t } = useTranslation("planHome");
  const validationPath = linkTargetPath({ screen: 18, workspaceId, ideaId });
  return (
    <Stack gap="space-200">
      <BlockHeading>{t("home.blocks.keyNumbers")}</BlockHeading>
      <MetricGrid
        keys={HOME_METRIC_KEYS}
        metrics={plan.keyMetrics}
        currency={access.currency}
        warnings={[]}
        economicsPath={null}
      />
      {validationPath && access.isEditor ? (
        <Link href={validationPath}>{t("home.editInValidation")}</Link>
      ) : null}
    </Stack>
  );
}

/** The latest Go / No-Go of this plan: the value, the day and who recorded it. */
export function PlanGoNoGo({ plan, access }: BlockProps) {
  const { t } = useTranslation(["planHome", "validation"]);
  const latest = plan.latestGoNoGo;
  return (
    <Stack gap="space-100">
      <BlockHeading>{t("planHome:home.blocks.goNoGo")}</BlockHeading>
      {latest ? (
        <Flex gap="space-100" align="center" wrap>
          <Badge size="S">{decisionText(t, latest.value)}</Badge>
          <Text variant="caption" tone="secondary" as="span">
            {t("planHome:home.goNoGo.line", {
              date: formatDate(latest.recordedAt, access.timeZone),
              who: latest.recordedBy.displayName,
            })}
          </Text>
        </Flex>
      ) : (
        <Text tone="secondary">{t("planHome:home.goNoGo.none")}</Text>
      )}
    </Stack>
  );
}

/** The saved versions, newest first; one opens the plan as it was, read only. */
export function PlanVersions({ plan, workspaceId, ideaId, access }: BlockProps) {
  const { t } = useTranslation("planHome");
  const home = planPaths(workspaceId, ideaId, plan.id).home;
  const versions = [...plan.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  return (
    <Stack gap="space-100">
      <BlockHeading>{t("home.blocks.versions")}</BlockHeading>
      {versions.length === 0 ? (
        <Text tone="secondary">{t("home.versions.none")}</Text>
      ) : (
        <RowList aria-label={t("home.blocks.versions")}>
          {versions.map((version) => (
            <RowListItem key={version.id}>
              <Stack gap="space-50">
                <Flex gap="space-100" align="center" wrap>
                  <Link
                    href={`${home}?${new URLSearchParams({ version: version.id })}`}
                    aria-current={plan.viewingVersion?.id === version.id ? "page" : undefined}
                  >
                    {version.name}
                  </Link>
                  {plan.viewingVersion?.id === version.id ? (
                    <Badge size="S">{t("home.versions.viewing")}</Badge>
                  ) : null}
                </Flex>
                <Text variant="caption" tone="secondary">
                  {t("home.versions.line", {
                    date: formatDate(version.savedAt, access.timeZone),
                    who: version.savedBy.displayName,
                  })}
                </Text>
              </Stack>
            </RowListItem>
          ))}
        </RowList>
      )}
    </Stack>
  );
}

/** Due soon and overdue counts of the current execution plan, with the way into screen 22. */
export function PlanExecution({ plan, workspaceId, ideaId }: BlockProps) {
  const { t } = useTranslation("planHome");
  const { dueSoon, overdue } = plan.execution;
  return (
    <Stack gap="space-100">
      <BlockHeading>{t("home.blocks.execution")}</BlockHeading>
      {dueSoon === 0 && overdue === 0 ? (
        <Text tone="secondary">{t("home.execution.none")}</Text>
      ) : (
        <Stack gap="space-50">
          {dueSoon > 0 ? <Text>{t("home.execution.dueSoon", { count: dueSoon })}</Text> : null}
          {overdue > 0 ? <Text>{t("home.execution.overdue", { count: overdue })}</Text> : null}
        </Stack>
      )}
      <Link href={planPaths(workspaceId, ideaId, plan.id).execution}>
        {t("home.execution.open")}
      </Link>
    </Stack>
  );
}
