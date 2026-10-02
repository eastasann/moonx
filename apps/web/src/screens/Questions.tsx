import type { TemplateSection, ValidationAnswer } from "@moonx/schemas";
import { Button, InlineAlert, Menu, MenuItem, Skeleton, Stack, Text } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { QuestionFormFrame } from "../components/QuestionFormFrame";
import { NoAccessState, QueryBoundary } from "../components/states";
import { ideaDetailQuery, sectionQuery } from "../lib/idea-detail";
import { canEditIdeas, useWorkspaceRole } from "../lib/ideas";
import { formatContainerTarget, usePanelTarget } from "../lib/panel-target";
import {
  hasText,
  isAnswered,
  isQuestionVisible,
  sectionPath,
  VALIDATION_SECTION_ORDER,
} from "../lib/questions";
import { useValidationRefresh } from "../lib/use-validation-refresh";
import { sectionKey as sectionQueryKeyOf } from "../lib/validation-keys";
import { AnswerCard } from "./questions/AnswerCard";

function QuestionsSkeleton() {
  return (
    <Stack gap="space-300">
      <Skeleton width="space-1000" />
      <Skeleton shape="block" height="space-1000" />
      <Skeleton shape="block" height="space-1000" />
      <Skeleton shape="block" height="space-1000" />
    </Stack>
  );
}

export interface QuestionsProps {
  workspaceId: string;
  ideaId: string;
  sectionKey: string;
  /** `?q=`: the question to open on. */
  focusQuestion?: string;
}

/**
 * Screen 11 for a validation: the questions of section 01, 02 or 10 as a form that saves while
 * it is filled in (design-spec 6.2, 6.0.2, 6.0.3).
 */
export function Questions({ workspaceId, ideaId, sectionKey, focusQuestion }: QuestionsProps) {
  const idea = useQuery(ideaDetailQuery(ideaId));
  return (
    <QueryBoundary query={idea} skeleton={<QuestionsSkeleton />}>
      {(detail) =>
        detail.workspaceId !== workspaceId ? (
          <NoAccessState />
        ) : (
          <SectionLoader
            key={`${detail.validationId}:${sectionKey}`}
            workspaceId={workspaceId}
            ideaId={ideaId}
            validationId={detail.validationId}
            isArchived={detail.archived}
            sectionKey={sectionKey}
            focusQuestion={focusQuestion}
          />
        )
      }
    </QueryBoundary>
  );
}

interface LoaderProps extends QuestionsProps {
  validationId: string;
  isArchived: boolean;
}

function SectionLoader(props: LoaderProps) {
  const { validationId, sectionKey } = props;
  const queryKey = sectionQueryKeyOf(validationId, sectionKey);
  const section = useQuery(sectionQuery(validationId, sectionKey, queryKey));

  // Saves still on their way when the screen closes must reach every screen that shows them, the home included.
  useValidationRefresh(validationId);

  return (
    <QueryBoundary query={section} skeleton={<QuestionsSkeleton />}>
      {(data) => (
        <QuestionForm
          {...props}
          queryKey={queryKey}
          section={data.section}
          answers={data.answers}
        />
      )}
    </QueryBoundary>
  );
}

interface FormProps extends LoaderProps {
  queryKey: readonly unknown[];
  section: TemplateSection;
  answers: ValidationAnswer[];
}

function QuestionForm({
  workspaceId,
  ideaId,
  validationId,
  isArchived,
  sectionKey,
  focusQuestion,
  queryKey,
  section,
  answers,
}: FormProps) {
  const { t } = useTranslation(["form", "validation", "app"]);
  const role = useWorkspaceRole(workspaceId);
  const canEdit = canEditIdeas(role) && !isArchived;
  usePanelTarget(formatContainerTarget("validation", validationId, sectionKey));

  const answerOf = useMemo(
    () => new Map(answers.map((answer) => [answer.questionKey, answer])),
    [answers],
  );
  // What was typed since the page loaded, for the questions whose display depends on an answer.
  const [live, setLive] = useState<Record<string, string>>({});
  const textOf = (key: string) =>
    key in live ? (live[key] ?? null) : (answerOf.get(key)?.text ?? null);

  const visible = section.questions.filter((question) =>
    isQuestionVisible(question, answerOf.get(question.key)?.hidden ?? false, textOf),
  );
  const isDone = (key: string) => {
    const answer = answerOf.get(key);
    return answer ? isAnswered(textOf(key), answer.classification) : false;
  };

  const ideaBase = `/w/${workspaceId}/ideas/${ideaId}`;
  const sectionTitle = (key: string) => t(`validation:sections.${key}`);
  const sections = VALIDATION_SECTION_ORDER.map((key) => ({
    key,
    title: sectionTitle(key),
    href: `${ideaBase}${sectionPath(key)}`,
  }));
  const oceanMissing =
    sectionKey === "02" &&
    section.questions.some((question) => question.displayCondition !== null) &&
    !hasText(textOf("V.02.OCEAN"));

  return (
    <QuestionFormFrame
      section={{
        key: sectionKey,
        title: sectionTitle(sectionKey),
        href: `${ideaBase}${sectionPath(sectionKey)}`,
      }}
      sections={sections}
      guidance={section.guidance}
      alert={isArchived ? <InlineAlert variant="notice" heading={t("form:archived")} /> : null}
      notices={oceanMissing ? <Text tone="secondary">{t("form:oceanHint")}</Text> : null}
      questions={visible.map((question) => ({ key: question.key, answered: isDone(question.key) }))}
      initialQuestionKey={focusQuestion}
      home={{ href: ideaBase, label: t("form:complete.home") }}
      canEdit={canEdit}
      aiMenu={
        canEdit ? (
          <Menu trigger={<Button variant="secondary">{t("form:ai")}</Button>}>
            <MenuItem
              id="export"
              href={`/w/${workspaceId}/ai/export?source=validation&id=${validationId}&scope=${sectionKey}`}
            >
              {t("form:aiExport")}
            </MenuItem>
            <MenuItem
              id="import"
              href={`/w/${workspaceId}/ai/import?target=validation&id=${validationId}&scope=${sectionKey}`}
            >
              {t("form:aiImport")}
            </MenuItem>
          </Menu>
        ) : null
      }
    >
      {(state) =>
        visible.map((question) => {
          const answer = answerOf.get(question.key);
          if (!answer) return null;
          return (
            <AnswerCard
              key={question.key}
              validationId={validationId}
              question={question}
              answer={answer}
              sectionQueryKey={queryKey}
              isReadOnly={!canEdit}
              isFocused={state.isFocused(question.key)}
              isOpenAll={state.isOpenAll}
              onFocusRequest={() => state.onFocusRequest(question.key)}
              onNavigate={state.onNavigate}
              onTextChange={(key, text) => setLive((prev) => ({ ...prev, [key]: text }))}
            />
          );
        })
      }
    </QuestionFormFrame>
  );
}
