import type { TemplateSection } from "@moonx/schemas";
import { Button, Menu, MenuItem, Skeleton, Stack } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { QuestionFormFrame } from "../components/QuestionFormFrame";
import { QueryBoundary } from "../components/states";
import { formatContainerTarget, usePanelTarget } from "../lib/panel-target";
import {
  isAnswered,
  type SelfAnalysisAnswer,
  type SelfAnalysisHome,
  sectionPath,
  selfAnalysisHomeQuery,
  selfAnalysisSectionQuery,
  useSelfAnalysisRefresh,
} from "../lib/self-analysis";
import { SelfAnswerCard } from "./self-analysis/SelfAnswerCard";

function FormSkeleton() {
  return (
    <Stack gap="space-300">
      <Skeleton width="space-1000" />
      <Skeleton shape="block" height="space-1000" />
      <Skeleton shape="block" height="space-1000" />
    </Stack>
  );
}

export interface SelfAnalysisFormProps {
  workspaceId: string;
  sectionKey: string;
  /** `?q=`: the question to open on. */
  focusQuestion?: string;
}

/**
 * Screen 11 for a self analysis: the questions of one section as a form that saves while it is
 * filled in (design-spec 6.2). The owner is the only one who opens it; the members it is shared
 * with read it on screen 12.
 */
export function SelfAnalysisForm(props: SelfAnalysisFormProps) {
  useSelfAnalysisRefresh();
  const home = useQuery(selfAnalysisHomeQuery);
  const section = useQuery(selfAnalysisSectionQuery(props.sectionKey));
  return (
    <QueryBoundary query={home} skeleton={<FormSkeleton />}>
      {(homeData) => (
        <QueryBoundary query={section} skeleton={<FormSkeleton />}>
          {(data) => (
            <Form
              key={props.sectionKey}
              {...props}
              home={homeData}
              section={data.section}
              answers={data.answers}
            />
          )}
        </QueryBoundary>
      )}
    </QueryBoundary>
  );
}

function Form({
  workspaceId,
  sectionKey,
  focusQuestion,
  home,
  section,
  answers,
}: SelfAnalysisFormProps & {
  home: SelfAnalysisHome;
  section: TemplateSection;
  answers: SelfAnswerList;
}) {
  const { t } = useTranslation(["selfAnalysis", "form"]);
  usePanelTarget(formatContainerTarget("self_analysis", home.id, sectionKey));
  const answerOf = new Map(answers.map((answer) => [answer.questionKey, answer]));
  const sections = home.sections.map((entry) => ({
    key: entry.key,
    title: entry.title,
    href: sectionPath(workspaceId, entry.key),
  }));

  return (
    <QuestionFormFrame
      section={{
        key: sectionKey,
        title: section.title,
        href: sectionPath(workspaceId, sectionKey),
      }}
      sections={sections}
      guidance={section.guidance}
      questions={section.questions.map((question) => ({
        key: question.key,
        answered: isAnswered(answerOf.get(question.key)),
      }))}
      initialQuestionKey={focusQuestion}
      home={{ href: `/w/${workspaceId}/self-analysis`, label: t("selfAnalysis:form.home") }}
      canEdit
      aiMenu={
        <Menu trigger={<Button variant="secondary">{t("form:ai")}</Button>}>
          <MenuItem
            id="export"
            href={`/w/${workspaceId}/ai/export?source=self_analysis&scope=${sectionKey}`}
          >
            {t("form:aiExport")}
          </MenuItem>
          <MenuItem
            id="import"
            href={`/w/${workspaceId}/ai/import?target=self_analysis&scope=${sectionKey}`}
          >
            {t("form:aiImport")}
          </MenuItem>
        </Menu>
      }
    >
      {(state) =>
        section.questions.map((question) => {
          const answer = answerOf.get(question.key);
          if (!answer) return null;
          return (
            <SelfAnswerCard
              key={question.key}
              analysisId={home.id}
              sectionKey={sectionKey}
              currency={home.currency}
              question={question}
              answer={answer}
              isFocused={state.isFocused(question.key)}
              isOpenAll={state.isOpenAll}
              onFocusRequest={() => state.onFocusRequest(question.key)}
              onNavigate={state.onNavigate}
            />
          );
        })
      }
    </QuestionFormFrame>
  );
}

type SelfAnswerList = SelfAnalysisAnswer[];
