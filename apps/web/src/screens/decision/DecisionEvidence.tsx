import { formatDate } from "@moonx/i18n";
import { Skeleton, Stack, Text } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { QueryBoundary } from "../../components/states";
import {
  DECISION_METRIC_KEYS,
  type DecisionContext,
  decisionContextQuery,
} from "../../lib/decision";
import { HOME_KEYS } from "../../lib/validation-home";
import { BlockHeading } from "../validation-home/BlockHeading";
import { CheckRows } from "../validation-home/Checks";
import { decisionText } from "../validation-home/decision-text";
import { FauBreakdownBand } from "../validation-home/FauBreakdownBand";
import { MetricGrid } from "../validation-home/KeyNumbers";
import { SummaryList } from "../validation-home/Summary";

type DecisionValue = Parameters<typeof decisionText>[1];

/** The shape of the materials while they load; the decision inputs are already on screen. */
function EvidenceSkeleton() {
  return (
    <Stack gap="space-300">
      <Skeleton shape="block" height="space-1000" />
      <Skeleton shape="block" height="space-700" />
      <Skeleton shape="block" height="space-500" />
      <Skeleton width="space-1000" />
    </Stack>
  );
}

function Materials({
  context,
  workspaceId,
  ideaId,
  currency,
  timeZone,
}: {
  context: DecisionContext;
  workspaceId: string;
  ideaId: string;
  currency: string;
  timeZone: string;
}) {
  const { t } = useTranslation(["decision", "validation"]);
  const { summary, missingChecks, fau, lastDecision } = context;
  const total = Object.keys(HOME_KEYS.checkLabel).length;
  return (
    <Stack gap="space-300">
      <Stack gap="space-100">
        <BlockHeading>{t("validation:home.blocks.summary")}</BlockHeading>
        <SummaryList
          label={t("validation:home.blocks.summary")}
          rows={[
            { key: "concept", label: t("decision:concept"), value: summary.oneLineConcept },
            {
              key: "customer",
              label: t("validation:home.summary.customer"),
              value: summary.customer,
            },
            {
              key: "problem",
              label: t("validation:home.summary.problem"),
              value: summary.problem,
            },
            {
              key: "solution",
              label: t("validation:home.summary.solution"),
              value: summary.solution,
            },
            {
              key: "marketType",
              label: t("validation:home.summary.marketType"),
              value: summary.marketType,
            },
            {
              key: "opportunity",
              label: t("decision:biggestOpportunity"),
              value: summary.biggestOpportunity,
            },
            { key: "risk", label: t("decision:biggestRisk"), value: summary.biggestRisk },
            { key: "unknown", label: t("decision:biggestUnknown"), value: summary.biggestUnknown },
          ]}
        />
      </Stack>
      <Stack gap="space-100">
        <BlockHeading>{t("validation:home.blocks.keyNumbers")}</BlockHeading>
        <MetricGrid
          keys={DECISION_METRIC_KEYS}
          metrics={context.keyMetrics}
          currency={currency}
          warnings={[]}
          economicsPath={null}
        />
      </Stack>
      <Stack gap="space-100">
        <BlockHeading>
          {missingChecks.length > 0
            ? t("decision:checksMissing", { count: missingChecks.length })
            : t("validation:home.blocks.checks")}
        </BlockHeading>
        {missingChecks.length > 0 ? (
          <CheckRows
            checks={missingChecks}
            workspaceId={workspaceId}
            ideaId={ideaId}
            label={t("validation:home.blocks.checks")}
          />
        ) : (
          <Text tone="secondary">{t("decision:checksDone", { count: total })}</Text>
        )}
      </Stack>
      <FauBreakdownBand fau={fau} />
      {fau.unclassified + fau.unknown > 0 ? (
        <Text variant="label">
          {t("decision:fauFocus", { unclassified: fau.unclassified, unknown: fau.unknown })}
        </Text>
      ) : null}
      {lastDecision?.value ? (
        <Text tone="secondary">
          {t("decision:last", {
            decision: decisionText(t, lastDecision.value as DecisionValue),
            date: formatDate(lastDecision.recordedAt, timeZone),
            who: lastDecision.recordedBy.displayName,
          })}
        </Text>
      ) : null}
    </Stack>
  );
}

/**
 * What the decision rests on (design-spec 6.5), collected from the other sections. It loads
 * behind a skeleton while the inputs below it are already usable.
 */
export function DecisionEvidence({
  ideaId,
  workspaceId,
  currency,
  timeZone,
}: {
  ideaId: string;
  workspaceId: string;
  currency: string;
  timeZone: string;
}) {
  const query = useQuery(decisionContextQuery(ideaId));
  return (
    <QueryBoundary query={query} skeleton={<EvidenceSkeleton />}>
      {(context) => (
        <Materials
          context={context}
          workspaceId={workspaceId}
          ideaId={ideaId}
          currency={currency}
          timeZone={timeZone}
        />
      )}
    </QueryBoundary>
  );
}
