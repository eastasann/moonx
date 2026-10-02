import { formatDate, formatTime } from "@moonx/i18n";
import { ActionButton, Flex, Heading, Link, Skeleton, Stack, Text } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NoAccessState, QueryBoundary } from "../../components/states";
import { DECISION_METRIC_KEYS } from "../../lib/decision";
import { type DecisionLogEntry, decisionEntryQuery } from "../../lib/decision-log";
import { ideaDetailQuery } from "../../lib/idea-detail";
import { useWorkspaceCurrency } from "../../lib/ideas";
import { linkTargetPath } from "../../lib/link-target";
import { HOME_METRIC_KEYS } from "../../lib/validation-home";
import { proposerName } from "../ideas/ideaText";
import { BlockHeading } from "../validation-home/BlockHeading";
import { CheckRows } from "../validation-home/Checks";
import { FauBreakdownBand } from "../validation-home/FauBreakdownBand";
import { MetricGrid } from "../validation-home/KeyNumbers";
import { DecisionValueBadge } from "./Row";

function DetailSkeleton() {
  return (
    <Stack gap="space-300">
      <Skeleton width="space-1000" />
      <Skeleton shape="block" height="space-800" />
      <Skeleton shape="block" height="space-1000" />
    </Stack>
  );
}

function Conditions({
  conditions,
}: {
  conditions: NonNullable<DecisionLogEntry["snapshot"]["conditions"]>;
}) {
  const { t } = useTranslation("decisionLog");
  const rows = [
    { key: "launchIf", text: conditions.launchIf },
    { key: "delayIf", text: conditions.delayIf },
    { key: "stopIf", text: conditions.stopIf },
  ] as const;
  return (
    <Stack gap="space-100">
      <BlockHeading>{t("detail.conditions")}</BlockHeading>
      {rows.map((row) => (
        <Stack key={row.key} gap="space-50">
          <Text variant="label">{t(`detail.${row.key}`)}</Text>
          <Text tone={row.text ? "primary" : "secondary"}>{row.text ?? t("detail.notSet")}</Text>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * L2 is addressed by the entry alone, so an id copied from another workspace of the person would
 * open here with this workspace's currency and links. The entry's idea says where it belongs.
 */
function EntryInWorkspace(props: {
  entry: DecisionLogEntry;
  workspaceId: string;
  timeZone: string;
}) {
  const idea = useQuery(ideaDetailQuery(props.entry.idea.id));
  return (
    <QueryBoundary query={idea} skeleton={<DetailSkeleton />}>
      {(detail) =>
        detail.workspaceId === props.workspaceId ? <Entry {...props} /> : <NoAccessState />
      }
    </QueryBoundary>
  );
}

function Entry({
  entry,
  workspaceId,
  timeZone,
}: {
  entry: DecisionLogEntry;
  workspaceId: string;
  timeZone: string;
}) {
  const { t } = useTranslation(["decisionLog", "validation", "ideas", "common"]);
  const currency = useWorkspaceCurrency(workspaceId);
  const { snapshot } = entry;
  const metricKeys = DECISION_METRIC_KEYS.filter((key) => key in snapshot.keyMetrics);
  const validationPath = linkTargetPath({ screen: 13, workspaceId, ideaId: entry.idea.id });
  const planPath = entry.plan
    ? linkTargetPath({ screen: 20, workspaceId, ideaId: entry.idea.id, planId: entry.plan.id })
    : null;
  return (
    <Stack gap="space-300">
      <Stack gap="space-100">
        <Heading level={2}>
          {entry.plan
            ? t("decisionLog:row.place", { idea: entry.idea.name, plan: entry.plan.name })
            : entry.idea.name}
        </Heading>
        <Flex gap="space-100" align="center" wrap>
          <Text tone="secondary" as="span">
            {t(`decisionLog:kind.${entry.kind}`)}
          </Text>
          <DecisionValueBadge entry={entry} />
        </Flex>
        <Text variant="caption" tone="secondary">
          {t("decisionLog:detail.recorded", {
            name: proposerName(t, entry.recordedBy),
            date: formatDate(entry.recordedAt, timeZone),
            time: formatTime(entry.recordedAt, timeZone),
          })}
        </Text>
        <Flex gap="space-200" wrap>
          {validationPath ? (
            <Link href={validationPath}>{t("decisionLog:detail.openValidation")}</Link>
          ) : null}
          {planPath ? <Link href={planPath}>{t("decisionLog:detail.openPlan")}</Link> : null}
        </Flex>
      </Stack>
      <Stack gap="space-100">
        <BlockHeading>{t("decisionLog:detail.reason")}</BlockHeading>
        {entry.reason ? (
          <Text variant="body-long">{entry.reason}</Text>
        ) : (
          <Text tone="secondary">{t("decisionLog:detail.noReason")}</Text>
        )}
      </Stack>
      <Stack gap="space-300">
        <Stack gap="space-50">
          <Heading level={3}>{t("decisionLog:detail.snapshot")}</Heading>
          <Text variant="caption" tone="secondary">
            {t("decisionLog:detail.snapshotNote")}
          </Text>
          {snapshot.planVersion ? (
            <Text variant="caption" tone="secondary">
              {t("decisionLog:detail.planVersion", { name: snapshot.planVersion.name })}
            </Text>
          ) : null}
        </Stack>
        {snapshot.conditions ? <Conditions conditions={snapshot.conditions} /> : null}
        <Stack gap="space-100">
          <BlockHeading>{t("decisionLog:detail.keyNumbers")}</BlockHeading>
          {/* A snapshot is a record of the past: it has no live warnings and no Unit Economics link. */}
          <MetricGrid
            keys={metricKeys.length > 0 ? metricKeys : HOME_METRIC_KEYS}
            metrics={snapshot.keyMetrics}
            currency={currency}
            warnings={[]}
            economicsPath={null}
          />
        </Stack>
        <Stack gap="space-100">
          <BlockHeading>
            {snapshot.missingChecks.length > 0
              ? t("decisionLog:detail.checksMissing", { count: snapshot.missingChecks.length })
              : t("validation:home.blocks.checks")}
          </BlockHeading>
          {snapshot.missingChecks.length > 0 ? (
            <CheckRows
              checks={snapshot.missingChecks}
              workspaceId={workspaceId}
              ideaId={entry.idea.id}
              label={t("validation:home.blocks.checks")}
            />
          ) : (
            <Text tone="secondary">{t("decisionLog:detail.checksDone")}</Text>
          )}
        </Stack>
        <FauBreakdownBand fau={snapshot.fau} />
      </Stack>
    </Stack>
  );
}

/** The right pane of 7: the chosen entry's reason in full and the snapshot of what it rested on. */
export function DecisionDetailPane({
  entryId,
  workspaceId,
  timeZone,
  onBack,
}: {
  entryId: string;
  workspaceId: string;
  timeZone: string;
  onBack?: () => void;
}) {
  const { t } = useTranslation(["decisionLog", "app"]);
  const query = useQuery(decisionEntryQuery(entryId));
  return (
    <Stack gap="space-200">
      {onBack ? (
        <Flex>
          <ActionButton icon={<ArrowLeft />} onPress={onBack}>
            {t("decisionLog:detail.back")}
          </ActionButton>
        </Flex>
      ) : null}
      <QueryBoundary query={query} skeleton={<DetailSkeleton />}>
        {(entry) => (
          <EntryInWorkspace entry={entry} workspaceId={workspaceId} timeZone={timeZone} />
        )}
      </QueryBoundary>
    </Stack>
  );
}
