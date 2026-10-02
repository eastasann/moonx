import { formatMoney } from "@moonx/i18n";
import {
  ActionButton,
  Flex,
  Heading,
  IllustratedMessage,
  Skeleton,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ItemPanelButtons } from "../../components/ItemPanelButtons";
import { QueryBoundary } from "../../components/states";
import { isApiError } from "../../lib/api-error";
import { formatItemTarget } from "../../lib/panel-target";
import { hasText } from "../../lib/questions";
import { type SharedSelfAnalysis, sharedSelfAnalysisQuery } from "../../lib/self-analysis";
import { proposerName } from "../ideas/ideaText";

function AnalysisSkeleton() {
  return (
    <Stack gap="space-300">
      <Skeleton width="space-1000" />
      <Skeleton shape="block" height="space-1000" />
      <Skeleton shape="block" height="space-1000" />
    </Stack>
  );
}

/**
 * Sections of a shared self analysis as a reading: each question with the answer, and the amount
 * with its reason for the money questions. Each answer takes comments; the history is the
 * owner's alone, so no history button shows (design-spec 6.0.5, 6.11).
 */
function Reading({ analysis }: { analysis: SharedSelfAnalysis }) {
  const { t } = useTranslation(["selfAnalysis", "ideas", "common"]);
  return (
    <Stack gap="space-400">
      <Stack gap="space-50">
        <Heading level={2}>{proposerName(t, analysis.user)}</Heading>
        <Text tone="secondary">
          {t("selfAnalysis:team.readOnly", {
            name: proposerName(t, analysis.user),
            status: t(`selfAnalysis:status.${analysis.status}`),
          })}
        </Text>
      </Stack>
      {analysis.sections.map((section) => (
        <Stack key={section.key} gap="space-200" as="section">
          <Heading level={3}>{section.title}</Heading>
          {section.questions.map((question) => {
            const answer = section.answers.find((entry) => entry.questionKey === question.key);
            const withAmount = question.answerType === "amount_with_reason";
            const hasAmount = answer?.amount !== null && answer?.amount !== undefined;
            return (
              <Stack key={question.key} gap="space-50">
                <Flex gap="space-100" align="center" justify="between">
                  <Text variant="label">{question.title}</Text>
                  <ItemPanelButtons
                    target={formatItemTarget("self_analysis_answer", analysis.id, question.key)}
                    commentCount={answer?.commentCount ?? 0}
                    showHistory={false}
                  />
                </Flex>
                <Text tone="secondary">{question.prompt}</Text>
                {withAmount && hasAmount ? (
                  <Text>
                    {t("selfAnalysis:team.amount", {
                      value: formatMoney(answer.amount as number, analysis.currency),
                    })}
                  </Text>
                ) : null}
                {hasText(answer?.text) ? (
                  <Text variant="body-long">{answer?.text}</Text>
                ) : !hasAmount ? (
                  <Text tone="secondary">{t("selfAnalysis:team.noAnswer")}</Text>
                ) : null}
              </Stack>
            );
          })}
        </Stack>
      ))}
    </Stack>
  );
}

/** The right pane of 12: one shared self analysis, read only. */
export function SharedAnalysis({
  workspaceId,
  userId,
  onBack,
}: {
  workspaceId: string;
  userId: string;
  onBack?: () => void;
}) {
  const { t } = useTranslation("selfAnalysis");
  const query = useQuery(sharedSelfAnalysisQuery(workspaceId, userId));
  return (
    <Stack gap="space-200">
      {onBack ? (
        <Flex>
          <ActionButton icon={<ArrowLeft />} onPress={onBack}>
            {t("team.back")}
          </ActionButton>
        </Flex>
      ) : null}
      {isApiError(query.error) && query.error.code === "NOT_SHARED" ? (
        <IllustratedMessage icon={Lock} heading={t("team.noAccess")} />
      ) : (
        <QueryBoundary query={query} skeleton={<AnalysisSkeleton />}>
          {(analysis) => <Reading analysis={analysis} />}
        </QueryBoundary>
      )}
    </Stack>
  );
}
