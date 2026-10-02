import { formatKeyMetric } from "@moonx/domain";
import type { MetricValue } from "@moonx/schemas";
import { Badge, Divider, Flex, Heading, Link, Stack, StatusLight, Text } from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { IdeaSummary } from "../../lib/ideas";
import { checkLabel } from "../../lib/validation-home";
import { checkVariant, proposerName } from "./ideaText";

/** A key metric as text: the formatted number with its unit, or the reason it has none. */
function metricText(t: TFunction, key: string, metric: MetricValue, currency: string): string {
  const value = formatKeyMetric(key, metric, currency);
  const { reason } = metric;
  if (metric.value == null) {
    return reason ? t(`validation:economics.reason.${reason}`) : value;
  }
  if (key === "payback_months") return t("common:format.months", { count: metric.value, value });
  if (key === "break_even_units_day") return t("common:format.perDay", { value });
  return value;
}

function goNoGoText(t: TFunction, value: IdeaSummary["plans"][number]["latestGoNoGo"]): string {
  if (!value) return t("ideas:detail.noGoNoGo");
  return t("ideas:detail.goNoGo", { value: t(`ideas:goNoGo.${value}`) });
}

/**
 * The summary of the selected idea (design-spec 6.8): concept, key numbers, checks, plans and
 * the latest decision, with a link into its validation home. It reads what the list already
 * holds, so choosing a row opens it without another request.
 */
export function IdeaDetailPane({
  idea,
  workspaceId,
  currency,
}: {
  idea: IdeaSummary;
  workspaceId: string;
  currency: string;
}) {
  const { t } = useTranslation(["ideas", "validation", "plan", "common"]);
  const { stage } = idea;
  const decision = idea.latestDecision ?? "undecided";
  return (
    <Stack gap="space-300">
      <Stack gap="space-100">
        <Heading level={2}>{idea.name}</Heading>
        <Flex gap="space-100" align="center" wrap>
          <Badge variant={decision}>{t(`ideas:decision.${decision}`)}</Badge>
          <Badge>{t(`validation:stage.${stage}`)}</Badge>
          {idea.archived ? <Badge>{t("ideas:row.archived")}</Badge> : null}
        </Flex>
        <Text>{idea.oneLineConcept}</Text>
        <Text variant="caption" tone="secondary">
          {t("ideas:detail.proposer")}: {proposerName(t, idea.proposer)}
        </Text>
      </Stack>
      <Divider />
      <Stack gap="space-100">
        <Heading level={3}>{t("ideas:detail.metrics")}</Heading>
        {Object.entries(idea.keyMetrics).map(([key, metric]) => (
          <Flex key={key} gap="space-200" justify="between" align="baseline">
            <Text tone="secondary" as="span">
              {t(`plan:metric.${key}`)}
            </Text>
            <Text variant="label" as="span">
              {metricText(t, key, metric, currency)}
            </Text>
          </Flex>
        ))}
      </Stack>
      <Divider />
      <Stack gap="space-100">
        <Heading level={3}>{t("ideas:detail.checks")}</Heading>
        {idea.checks.map(({ key, state, params }) => (
          <StatusLight key={key} variant={checkVariant(state)}>
            {checkLabel(t, { key, params })} · {t(`validation:checks.state.${state}`)}
          </StatusLight>
        ))}
      </Stack>
      <Divider />
      <Stack gap="space-100">
        <Heading level={3}>{t("ideas:detail.plans")}</Heading>
        {idea.plans.length === 0 ? (
          <Text tone="secondary">{t("ideas:detail.noPlans")}</Text>
        ) : (
          idea.plans.map((plan) => (
            <Stack key={plan.id} gap="space-50">
              <Text variant="label">{plan.name}</Text>
              <Text variant="caption" tone="secondary">
                {plan.latestVersionName
                  ? t("ideas:detail.planVersion", { name: plan.latestVersionName })
                  : t("ideas:detail.noVersion")}
                {" · "}
                {goNoGoText(t, plan.latestGoNoGo)}
              </Text>
            </Stack>
          ))
        )}
      </Stack>
      <Link href={`/w/${workspaceId}/ideas/${idea.id}`}>{t("ideas:detail.openValidation")}</Link>
    </Stack>
  );
}
