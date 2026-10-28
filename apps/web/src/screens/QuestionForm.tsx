import { hasText, isQuestionShown } from "@moonx/domain";
import { formatCount } from "@moonx/i18n";
import type {
  TemplateQuestion,
  TemplateSection,
  ValidationAnswer,
  ValidationHome,
} from "@moonx/schemas";
import {
  Breadcrumb,
  Breadcrumbs,
  Button,
  Flex,
  Heading,
  MoonGlyph,
  QuestionCard,
  QuestionFormPattern,
  Skeleton,
  Stack,
  Text,
  useFauLabel,
  Well,
} from "@moonx/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AiMenu } from "../components/AiMenu";
import {
  AnswerEvidenceSheet,
  AnswerFields,
  type AnswersCache,
  type AnswerView,
  answerKey,
  moonOf,
  useAnswers,
} from "../components/AnswerFields";
import { ArchivedIdeaAlert } from "../components/ArchivedIdeaAlert";
import {
  ItemCommentsButton,
  type ScreenComments,
} from "../components/CommentsPanel";
import { ModalBoundary } from "../components/ErrorBoundary";
import { ItemHistoryButton } from "../components/HistoryPanel";
import { SectionTitle } from "../components/SectionTitle";
import {
  FailureState,
  NoAccessState,
  NotFoundState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import {
  dashboardHref,
  useModal,
  usePanel,
  useWorkspace,
} from "../components/workspace";
import { useAutosave } from "../lib/autosave-react";
import { questionLabel } from "../lib/item-labels";
import {
  ideaHref,
  ideasHref,
  isQuestionSection,
  type QuestionSection,
  questionsHref,
  sectionHref,
} from "../lib/links";
import {
  ideaKey,
  putSaved,
  validationHomeQuery,
  validationQuestionsQuery,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

/** `/w/$workspaceId/ideas/$ideaId/questions/$sectionKey`'s own search (SDD 4章). */
export interface QuestionFormSearch {
  /** The question to focus: its ID ("V.01.WHO"). */
  q?: string;
}

/** The order 11 moves through the sections in (design-spec 6.2「前後のセクション」). */
const SECTION_ORDER = ["01", "02", "03", "04", "05", "06-08", "09", "10"];

/**
 * The questions of one section and their answers, ready (design-spec 6.2): pattern C,
 * autosave per answer (6.0.2), F/A/U and M2 (6.0.3).
 */
function SectionForm({
  home,
  section,
  answers,
  sectionKey,
  focusKey,
  modal,
  about,
}: {
  home: ValidationHome;
  section: TemplateSection;
  answers: readonly ValidationAnswer[];
  sectionKey: QuestionSection;
  focusKey: string | undefined;
  modal: string | undefined;
  about: string | undefined;
}) {
  const { t } = useTranslation(["validation", "common", "app"]);
  const { workspace, role } = useWorkspace();
  const queryClient = useQueryClient();
  const autosave = useAutosave();
  const modals = useModal();
  const panel = usePanel();
  const navigate = useNavigate();
  const fauLabel = useFauLabel();
  const forFact = useRouterState({
    select: (state) => state.location.state.evidenceForFact === true,
  });
  const { idea, validationId } = home;
  const canEdit = role !== "viewer" && !idea.archived;
  const answerItem = (questionKey: string) =>
    ({
      kind: "item",
      item: { type: "validation_answer", id: validationId, key: questionKey },
    }) as const;
  const questionsKey = validationQuestionsQuery(
    idea.id,
    validationId,
    sectionKey,
  ).queryKey;
  const cache: AnswersCache = {
    get: (questionKey) =>
      queryClient
        .getQueryData(questionsKey)
        ?.answers.find((answer) => answer.questionKey === questionKey),
    update: (questionKey, change) =>
      putSaved<{ section: TemplateSection; answers: ValidationAnswer[] }>(
        queryClient,
        questionsKey,
        (data) =>
          data === undefined
            ? undefined
            : {
                ...data,
                answers: data.answers.map((answer) =>
                  answer.questionKey === questionKey ? change(answer) : answer,
                ),
              },
      ),
    reload: () =>
      void queryClient.invalidateQueries({ queryKey: questionsKey }),
  };
  const editing = useAnswers(validationId, cache, (questionKey, isFact) =>
    modals.open("evidence", {
      about: `validation_answer:${validationId}:${questionKey}`,
      forFact: isFact,
    }),
  );

  const byKey = new Map(answers.map((answer) => [answer.questionKey, answer]));
  const viewOf = (question: TemplateQuestion): AnswerView => {
    const answer = byKey.get(question.key);
    // V2 returns one answer for every question (SDD 5.7): a missing one is the API's
    // fault, shown as unexpected rather than saved on a version made up here.
    if (answer === undefined) {
      throw new Error(`V2 returned no answer to ${question.key}`);
    }
    return editing.viewOf(question, answer);
  };
  const views = section.questions.map(viewOf);
  const texts = new Map(views.map((view) => [view.question.key, view]));
  // 02 OCEAN's answer decides which questions show, as it is typed (6.2).
  const shown = views.filter((view) => isQuestionShown(view.question, texts));
  const shownIds = shown.map((view) => view.question.key);
  const answered = shown.filter((view) => view.isAnswered).length;
  const firstOpen =
    shown.find((view) => !view.isAnswered)?.question.key ?? shownIds[0] ?? null;

  const [chosen, setChosen] = useState<string | null>(() =>
    focusKey !== undefined && shownIds.includes(focusKey)
      ? focusKey
      : firstOpen,
  );
  const currentId =
    chosen !== null && shownIds.includes(chosen) ? chosen : firstOpen;
  const [isAtEnd, setAtEnd] = useState(false);

  // Opening, and a `?q=` given later, focus the question (6.2「開いたとき」): its answer's
  // field, which moves it to the middle from a tablet's width up (4.1 C). A Viewer's form
  // has no focus to move.
  const latest = useRef({ shownIds, currentId, canEdit });
  latest.current = { shownIds, currentId, canEdit };
  const hasOpened = useRef(false);
  // Runs on opening and when `?q=` changes; the rest is read from `latest`.
  useEffect(() => {
    const {
      shownIds: ids,
      currentId: current,
      canEdit: editable,
    } = latest.current;
    const target =
      focusKey !== undefined && ids.includes(focusKey)
        ? focusKey
        : hasOpened.current
          ? null
          : current;
    hasOpened.current = true;
    if (target === null) return;
    setChosen(target);
    setAtEnd(false);
    if (!editable) return;
    // After the card opened: the field is in it from the next frame.
    requestAnimationFrame(() => {
      // Question IDs are the template's ([A-Z0-9._]): safe inside the selector.
      document
        .querySelector<HTMLElement>(
          `[data-question="${target}"] textarea:not([readonly]), [data-question="${target}"] input:not([type="hidden"]):not([readonly])`,
        )
        ?.focus();
    });
  }, [focusKey]);

  // Leaving the screen sends what waits (design-spec 6.0.2「画面を離れるとき」).
  const keysRef = useRef<string[]>([]);
  keysRef.current = section.questions.map((question) =>
    answerKey(validationId, question.key),
  );
  useEffect(
    () => () => {
      for (const key of keysRef.current) autosave.flush(key);
    },
    [autosave],
  );

  const titleOf = (key: string) =>
    home.sections.find((candidate) => candidate.key === key)?.title ?? key;
  const neighbour = (step: -1 | 1) => {
    const key = SECTION_ORDER[SECTION_ORDER.indexOf(sectionKey) + step];
    if (key === undefined) return undefined;
    const href = sectionHref(workspace.id, idea.id, key);
    return href === undefined ? undefined : { href, title: titleOf(key) };
  };
  const previous = neighbour(-1);
  const next = neighbour(1);

  /** The questions whose answer decides others (02 OCEAN), while unanswered (6.2). */
  const decidesOthers = (view: AnswerView) =>
    !hasText(view.text) &&
    section.questions.some(
      (other) => other.displayCondition?.[view.question.key] !== undefined,
    );

  const renderAnswer = (view: AnswerView) => (
    <AnswerFields
      view={view}
      answers={editing}
      validationId={validationId}
      ideaId={idea.id}
      canEdit={canEdit}
      note={
        decidesOthers(view) && (
          <Text variant="body-sm" tone="secondary" elementType="p">
            {t("validation:questions.revealHint", {
              title: view.question.title,
            })}
          </Text>
        )
      }
    />
  );

  const header = (
    <Stack gap="space-100">
      {idea.archived && <ArchivedIdeaAlert ideaId={idea.id} />}
      <Flex
        alignItems="end"
        justifyContent="space-between"
        gap="space-300"
        wrap
      >
        <SectionTitle
          ideaId={idea.id}
          sections={home.sections}
          title={titleOf(sectionKey)}
        />
        <Flex gap="space-100" alignItems="center">
          <MoonGlyph value={shown.length === 0 ? 0 : answered / shown.length} />
          <Text tone="secondary">
            <Text variant="number" tone="secondary">
              {t("validation:questions.progress", {
                answered: formatCount(answered),
                total: formatCount(shown.length),
              })}
            </Text>
            {t("validation:questions.progressSuffix")}
          </Text>
        </Flex>
      </Flex>
      {section.subtitle !== null && (
        <Text tone="secondary" elementType="p">
          {section.subtitle}
        </Text>
      )}
      {section.guidance !== null && (
        <Text tone="secondary" elementType="p">
          {section.guidance}
        </Text>
      )}
    </Stack>
  );

  const toHome = () => void navigate({ href: ideaHref(workspace.id, idea.id) });
  const go = (href: string) => void navigate({ href });

  const evidenceView = (() => {
    if (modal !== "evidence" || !canEdit || about === undefined) return null;
    const prefix = `validation_answer:${validationId}:`;
    if (!about.startsWith(prefix)) return null;
    const questionKey = about.slice(prefix.length);
    const view = shown.find(
      (candidate) => candidate.question.key === questionKey,
    );
    return view === undefined || view.state === null
      ? null
      : { ...view, state: view.state };
  })();

  return (
    <>
      <QuestionFormPattern
        header={header}
        questionIds={shownIds}
        currentId={currentId}
        onCurrentChange={(id) => {
          setAtEnd(false);
          setChosen(id);
        }}
        isReadOnly={!canEdit}
        isAnswered={(id) => texts.get(id)?.isAnswered === true}
        onEnd={() => setAtEnd(true)}
        end={
          isAtEnd ? (
            <Well>
              <Stack gap="space-300">
                <Heading level={2}>
                  {t("validation:questions.complete", {
                    section: sectionKey,
                    answered: formatCount(answered),
                    total: formatCount(shown.length),
                  })}
                </Heading>
                <Flex gap="space-200" wrap>
                  {next !== undefined && (
                    <Button variant="primary" onPress={() => go(next.href)}>
                      {t("validation:questions.next", { section: next.title })}
                      <ArrowRight />
                    </Button>
                  )}
                  <Button variant="secondary" onPress={toHome}>
                    {t("validation:questions.toHome")}
                  </Button>
                </Flex>
              </Stack>
            </Well>
          ) : null
        }
        footer={
          canEdit ? (
            <AiMenu
              kind="validation"
              id={validationId}
              scope={sectionKey}
              returnTo={questionsHref(workspace.id, idea.id, sectionKey)}
            />
          ) : undefined
        }
        previousSection={
          previous === undefined ? undefined : (
            <Button
              variant="secondary"
              isQuiet
              onPress={() => go(previous.href)}
            >
              <ArrowLeft />
              {t("validation:questions.previousSection")}
            </Button>
          )
        }
        nextSection={
          next === undefined ? undefined : (
            <Button variant="secondary" onPress={() => go(next.href)}>
              {t("validation:questions.next", { section: next.title })}
              <ArrowRight />
            </Button>
          )
        }
        renderQuestion={(id, mode) => {
          const view = texts.get(id);
          if (view === undefined) return null;
          const { question } = view;
          return (
            <QuestionCard
              title={question.title}
              question={question.prompt}
              mode={mode}
              status={
                view.state === null
                  ? undefined
                  : {
                      state: moonOf[view.state],
                      label: fauLabel(view.state, {
                        confidence: view.confidence,
                        evidenceCount: view.counted,
                      }),
                      isWarning: view.state === "fact_no_evidence",
                    }
              }
              excerpt={hasText(view.text) ? view.text : null}
              commentCount={view.answer.commentCount}
              actions={
                <>
                  <ItemCommentsButton
                    label={questionLabel(question.key, question.title)}
                    count={view.answer.commentCount}
                    onPress={() =>
                      panel.show("comments", answerItem(question.key))
                    }
                  />
                  <ItemHistoryButton
                    label={questionLabel(question.key, question.title)}
                    onPress={() =>
                      panel.show("history", answerItem(question.key))
                    }
                  />
                </>
              }
              onFocusRequest={() => {
                setAtEnd(false);
                setChosen(id);
              }}
            >
              {mode === "quiet" ? undefined : renderAnswer(view)}
            </QuestionCard>
          );
        }}
      />
      {evidenceView !== null && (
        <ModalBoundary key="evidence" onClose={modals.close}>
          <AnswerEvidenceSheet
            ideaId={idea.id}
            validationId={validationId}
            view={evidenceView}
            label={[
              t("common:itemLabel.question", {
                section: sectionKey,
                title: evidenceView.question.title,
              }),
              evidenceView.question.prompt,
            ].join(t("app:separator"))}
            cache={cache}
            answers={editing}
            forFact={forFact}
            onClose={modals.close}
          />
        </ModalBoundary>
      )}
    </>
  );
}

/**
 * 11's shape while it loads (design-spec 6.2「ローディング」): the title and the questions'
 * rows. Drawn inside a `Skeleton`, its words are bars.
 */
export function QuestionFormSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <QuestionFormPattern
      header={<Heading level={1}>{t("validation:questions.empty")}</Heading>}
      questionIds={["a", "b", "c", "d"]}
      currentId={null}
      onCurrentChange={() => {}}
      isReadOnly
      renderQuestion={() => (
        <Stack gap="space-100">
          <Text variant="caption">{t("validation:questions.empty")}</Text>
          <Text>{t("validation:questions.placeholder")}</Text>
        </Stack>
      )}
    />
  );
}

function QuestionFormBody({
  ideaId,
  sectionKey,
  focusKey,
  modal,
  about,
}: {
  ideaId: string;
  sectionKey: string;
  focusKey: string | undefined;
  modal: string | undefined;
  about: string | undefined;
}) {
  const { me, workspace } = useWorkspace();
  const home = useQuery(validationHomeQuery(ideaId));
  const isSection = isQuestionSection(sectionKey);
  const ready =
    home.data !== undefined &&
    home.data.idea.workspaceId === workspace.id &&
    isSection;
  const questions = useQuery({
    ...validationQuestionsQuery(
      ideaId,
      home.data?.validationId ?? "",
      sectionKey,
    ),
    enabled: ready,
  });
  const isSlow = useIsSlow(home.isPending || (ready && questions.isPending));
  const failure = home.error ?? questions.error;
  if (!isSection) return <NotFoundState dashboardHref={dashboardHref(me)} />;
  if (home.data !== undefined && home.data.idea.workspaceId !== workspace.id) {
    // Another workspace's idea under this one's URL (SDD 4章).
    return <NoAccessState dashboardHref={dashboardHref(me)} />;
  }
  if (home.data !== undefined && questions.data !== undefined) {
    return (
      <SectionForm
        // Another section is another form: its questions, focus and end card.
        key={sectionKey}
        home={home.data}
        section={questions.data.section}
        answers={questions.data.answers}
        sectionKey={sectionKey}
        focusKey={focusKey}
        modal={modal}
        about={about}
      />
    );
  }
  if (failure !== null) {
    return (
      <FailureState
        error={failure}
        onRetry={() => {
          void home.refetch();
          if (ready) void questions.refetch();
        }}
        dashboardHref={dashboardHref(me)}
      />
    );
  }
  if (isSlow) {
    return (
      <SlowLoadingState
        onRetry={() => {
          void home.refetch();
          if (ready) void questions.refetch();
        }}
      />
    );
  }
  return (
    <Skeleton isLoading>
      <QuestionFormSkeleton />
    </Skeleton>
  );
}

/**
 * 11 Question form for a validation section, 01, 02 or 10 (design-spec 6.2,
 * s11-form.html): pattern C. The section's title with ▼ to switch sections and how many
 * are answered; each question with its answer, F/A/U (6.0.3), Example, Hint and Related
 * research; the previous and next sections and AI ▼ in the bottom bar, or on a phone
 * ← → between the questions, the section's completion card and AI ▼ under the card.
 * Viewers and archived ideas read it with every question open, without AI ▼.
 */
export function QuestionFormScreen({
  ideaId,
  sectionKey,
  search,
  modal,
  about,
}: {
  ideaId: string;
  sectionKey: string;
  search: QuestionFormSearch;
  modal: string | undefined;
  about: string | undefined;
}) {
  const { t } = useTranslation(["ideas", "validation"]);
  const { workspace } = useWorkspace();
  const { data } = useQuery(validationHomeQuery(ideaId));
  const home = data?.idea.workspaceId === workspace.id ? data : undefined;
  const isSection = isQuestionSection(sectionKey);
  const title = isSection
    ? home?.sections.find((section) => section.key === sectionKey)?.title
    : undefined;
  // The body reads the same questions: the panel names the answers by their titles.
  const questions = useQuery({
    ...validationQuestionsQuery(ideaId, home?.validationId ?? "", sectionKey),
    enabled: home !== undefined && isSection,
  });
  const comments: ScreenComments | undefined =
    home === undefined || !isSection
      ? undefined
      : {
          screen: {
            containerType: "validation",
            containerId: home.validationId,
            sectionKeys: [sectionKey],
          },
          idea: {
            id: ideaId,
            name: home.idea.name,
            archived: home.idea.archived,
          },
          dataKey: ideaKey(ideaId),
          shows: (item) =>
            item.type === "validation_answer" &&
            item.id === home.validationId &&
            (item.key ?? "").startsWith(`V.${sectionKey}.`) &&
            (questions.data === undefined ||
              questions.data.section.questions.some(
                ({ key }) => key === item.key,
              )),
          labelOf: (target) =>
            target.type === "idea"
              ? home.idea.name
              : target.type === "validation_answer" && target.key != null
                ? questionLabel(
                    target.key,
                    questions.data?.section.questions.find(
                      ({ key }) => key === target.key,
                    )?.title,
                  )
                : undefined,
        };
  useDocumentTitle(
    ...(home === undefined || title === undefined
      ? []
      : [title, workspace.name]),
  );
  return (
    <WorkspaceFrame
      current="ideas"
      saveScope={
        home === undefined
          ? undefined
          : `${answerKey(home.validationId, `V.${sectionKey}.`)}`
      }
      comments={comments}
      history={
        comments && {
          ...comments,
          hasFau: (key) =>
            questions.data?.section.questions.find(
              (question) => question.key === key,
            )?.hasFau ?? true,
        }
      }
      back={{
        label: t("validation:questions.back"),
        href: ideaHref(workspace.id, ideaId),
      }}
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb href={ideasHref(workspace.id)}>
            {t("ideas:title")}
          </Breadcrumb>
          {home !== undefined && (
            <Breadcrumb href={ideaHref(workspace.id, ideaId)}>
              {home.idea.name}
            </Breadcrumb>
          )}
          {title !== undefined && <Breadcrumb>{title}</Breadcrumb>}
        </Breadcrumbs>
      }
    >
      <QuestionFormBody
        ideaId={ideaId}
        sectionKey={sectionKey}
        focusKey={search.q}
        modal={modal}
        about={about}
      />
    </WorkspaceFrame>
  );
}
