import type { TemplateSection, ValidationAnswer } from "@moonx/schemas";
import {
  ActionButton,
  Button,
  Flex,
  Heading,
  InlineAlert,
  Menu,
  MenuItem,
  QuestionFormPattern,
  Skeleton,
  Stack,
  Switch,
  Text,
  useIsNarrow,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NoAccessState, QueryBoundary } from "../components/states";
import { ideaDetailQuery, sectionQuery } from "../lib/idea-detail";
import { canEditIdeas, useWorkspaceRole } from "../lib/ideas";
import { useGoTo } from "../lib/navigate";
import { formatContainerTarget, usePanelTarget } from "../lib/panel-target";
import {
  hasText,
  isAnswered,
  isQuestionVisible,
  neighbourSections,
  sectionPath,
  VALIDATION_SECTION_ORDER,
} from "../lib/questions";
import { useValidationRefresh } from "../lib/use-validation-refresh";
import { sectionKey as sectionQueryKeyOf } from "../lib/validation-keys";
import { AnswerCard } from "./questions/AnswerCard";

const FOCUS_STORAGE_KEY = "moonx.questions.focus";

/** The Focus switch is remembered on this device (design-spec 4.1). */
function useFocusMode(): [boolean, (value: boolean) => void] {
  const [focus, setFocus] = useState(() => {
    try {
      return window.localStorage.getItem(FOCUS_STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const update = (value: boolean) => {
    setFocus(value);
    try {
      window.localStorage.setItem(FOCUS_STORAGE_KEY, value ? "on" : "off");
    } catch {
      // The choice then lasts until the page is closed, which is all a browser that refuses storage can do.
    }
  };
  return [focus, update];
}

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
  const narrow = useIsNarrow();
  const goTo = useGoTo();
  const role = useWorkspaceRole(workspaceId);
  const canEdit = canEditIdeas(role) && !isArchived;
  const [focusMode, setFocusMode] = useFocusMode();
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
  const answered = visible.filter((question) => {
    const answer = answerOf.get(question.key);
    return answer ? isAnswered(textOf(question.key), answer.classification) : false;
  }).length;

  const firstOpen = () => {
    const wanted = visible.find((question) => question.key === focusQuestion);
    if (wanted) return wanted.key;
    const unanswered = visible.find((question) => {
      const answer = answerOf.get(question.key);
      return !answer || !isAnswered(textOf(question.key), answer.classification);
    });
    return (unanswered ?? visible[0])?.key ?? null;
  };
  const [focusedKey, setFocusedKey] = useState<string | null>(firstOpen);
  const [complete, setComplete] = useState(false);
  const keyBoxed = useRef(focusedKey);
  keyBoxed.current = focusedKey;

  // The Focus switch and a read-only form open every question and scroll nowhere.
  const openAll = !canEdit || (!narrow && !focusMode);
  const index = visible.findIndex((question) => question.key === focusedKey);
  const move = (direction: "previous" | "next") => {
    const target = visible[index + (direction === "next" ? 1 : -1)];
    if (target) {
      setComplete(false);
      setFocusedKey(target.key);
    } else if (direction === "next" && narrow) {
      setComplete(true);
    }
  };

  const { previous, next } = neighbourSections(sectionKey);
  const ideaBase = `/w/${workspaceId}/ideas/${ideaId}`;
  const sectionTitle = (key: string) => t(`validation:sections.${key}`);
  const oceanMissing =
    sectionKey === "02" &&
    section.questions.some((question) => question.displayCondition !== null) &&
    !hasText(textOf("V.02.OCEAN"));

  const header = (
    <Stack gap="space-200">
      {isArchived ? <InlineAlert variant="notice" heading={t("form:archived")} /> : null}
      <Flex gap="space-200" align="center" justify="between" wrap>
        <Flex gap="space-100" align="center" wrap>
          <Heading level={1}>{sectionTitle(sectionKey)}</Heading>
          <Menu
            trigger={
              <ActionButton isQuiet icon={<ChevronDown />} aria-label={t("form:switchSection")} />
            }
          >
            {VALIDATION_SECTION_ORDER.map((key) => (
              <MenuItem key={key} id={key} href={`${ideaBase}${sectionPath(key)}`}>
                {sectionTitle(key)}
              </MenuItem>
            ))}
          </Menu>
        </Flex>
        <Flex gap="space-200" align="center" wrap>
          <Text variant="label" as="span">
            {t("form:answered", { answered, total: visible.length })}
          </Text>
          {narrow || !canEdit ? null : (
            <Switch isSelected={focusMode} onChange={setFocusMode}>
              {t("form:focus")}
            </Switch>
          )}
        </Flex>
      </Flex>
      {section.guidance ? <Text tone="secondary">{section.guidance}</Text> : null}
      {oceanMissing ? <Text tone="secondary">{t("form:oceanHint")}</Text> : null}
    </Stack>
  );

  const sectionButtons = (
    <Flex gap="space-200" align="center" justify="between" wrap>
      <Button
        variant="secondary"
        isDisabled={!previous}
        onPress={() => previous && goTo(`${ideaBase}${sectionPath(previous)}`)}
      >
        {t("form:previousSection")}
      </Button>
      {canEdit ? (
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
      ) : null}
      <Button
        variant="secondary"
        isDisabled={!next}
        onPress={() => next && goTo(`${ideaBase}${sectionPath(next)}`)}
      >
        {t("form:nextSection")}
      </Button>
    </Flex>
  );

  const phoneControls = (
    <Flex gap="space-200" align="center" justify="between">
      <Button
        variant="secondary"
        isDisabled={index <= 0 && !complete}
        onPress={() => (complete ? setComplete(false) : move("previous"))}
      >
        {t("form:previous")}
      </Button>
      <Flex gap="space-100" align="center" as="ol">
        {visible.map((question, position) => {
          const answer = answerOf.get(question.key);
          const done = answer ? isAnswered(textOf(question.key), answer.classification) : false;
          const current = question.key === focusedKey && !complete;
          return (
            <li key={question.key}>
              <ActionButton
                isQuiet
                aria-label={t("form:dot", { position: position + 1, total: visible.length })}
                aria-current={current ? "step" : undefined}
                onPress={() => {
                  setComplete(false);
                  setFocusedKey(question.key);
                }}
              >
                {current ? "◉" : done ? "●" : "○"}
              </ActionButton>
            </li>
          );
        })}
      </Flex>
      <Button variant="secondary" isDisabled={complete} onPress={() => move("next")}>
        {t("form:nextQuestion")}
      </Button>
    </Flex>
  );

  return (
    <QuestionFormPattern
      header={header}
      hasTabBar
      actions={narrow ? phoneControls : sectionButtons}
    >
      {narrow && complete ? (
        <Stack gap="space-200">
          <Heading level={2}>{t("form:complete.title")}</Heading>
          <Text>
            {t("form:complete.summary", {
              section: sectionTitle(sectionKey),
              answered,
              total: visible.length,
            })}
          </Text>
          <Flex gap="space-200" wrap>
            {next ? (
              <Button onPress={() => goTo(`${ideaBase}${sectionPath(next)}`)}>
                {t("form:complete.next", { section: sectionTitle(next) })}
              </Button>
            ) : null}
            <Button variant="secondary" onPress={() => goTo(ideaBase)}>
              {t("form:complete.home")}
            </Button>
          </Flex>
        </Stack>
      ) : (
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
              isFocused={question.key === focusedKey}
              isOpenAll={openAll}
              onFocusRequest={() => setFocusedKey(question.key)}
              onNavigate={move}
              onTextChange={(key, text) => setLive((prev) => ({ ...prev, [key]: text }))}
            />
          );
        })
      )}
    </QuestionFormPattern>
  );
}
