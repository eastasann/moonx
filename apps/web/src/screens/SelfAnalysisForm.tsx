import {
  hasText,
  isQuestionShown,
  isSelfAnalysisAnswered,
} from "@moonx/domain";
import { formatCount, formatInputNumber, formatMoney, i18n } from "@moonx/i18n";
import {
  longTextSchema,
  moneySchema,
  numberTextSchema,
  type SelfAnalysisAnswer,
  type SelfAnalysisHome,
  shortTextSchema,
  type TemplateQuestion,
  type TemplateSection,
} from "@moonx/schemas";
import {
  Breadcrumb,
  Breadcrumbs,
  Button,
  ContextualHelp,
  Disclosure,
  Flex,
  Heading,
  MoonGlyph,
  NumberField,
  QuestionCard,
  QuestionFormPattern,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  Text,
  TextArea,
  TextField,
  Well,
} from "@moonx/ui-web";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AiMenu } from "../components/AiMenu";
import {
  ItemCommentsButton,
  type ScreenComments,
} from "../components/CommentsPanel";
import { ItemHistoryButton } from "../components/HistoryPanel";
import { SaveFailureNote } from "../components/SaveFeedback";
import { SectionSwitchTitle } from "../components/SectionTitle";
import { selfAnswerKey, useMovesToPersonal } from "../components/selfAnalysis";
import {
  FailureState,
  NotFoundState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, usePanel, useWorkspace } from "../components/workspace";
import { api, inPath, unwrap } from "../lib/api";
import type { SaveFields, SaveTarget } from "../lib/autosave";
import { useAutosave, useAutosaveState } from "../lib/autosave-react";
import { inputIssueMessage } from "../lib/input-issues";
import { questionLabel } from "../lib/item-labels";
import { selfAnalysisHref, selfAnalysisSectionHref } from "../lib/links";
import { useIsOnline } from "../lib/online";
import {
  putSaved,
  selfAnalysisHomeQuery,
  selfAnalysisKey,
  selfAnalysisSectionQuery,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";
import { QuestionFormSkeleton } from "./QuestionForm";
import { SelfAnalysisBody } from "./SelfAnalysisHome";

/** `/w/$workspaceId/self-analysis/$sectionKey`'s own search (SDD 4章). */
export interface SelfAnalysisFormSearch {
  /** The question to focus: its ID ("SA.WHY.1"). */
  q?: string;
}

type SectionData = { section: TemplateSection; answers: SelfAnalysisAnswer[] };

const isAmountQuestion = (question: TemplateQuestion) =>
  question.answerType === "amount_with_reason";

/** The rule of a question's text: its reason on Q15–17 is a long text (6.0.8). */
const textSchemaOf = (question: TemplateQuestion) =>
  question.answerType === "short_text" ? shortTextSchema : longTextSchema;

const amountSchema = numberTextSchema(moneySchema);

/** An amount as typed: blank is none, anything else is read as an amount (6.0.8). */
const parseAmount = (typed: string) =>
  typed.trim() === ""
    ? { success: true as const, data: null }
    : amountSchema.safeParse(typed);

/** One question as 11 shows it: what was saved, under what waits to be saved. */
interface AnswerView {
  question: TemplateQuestion;
  answer: SelfAnalysisAnswer;
  /** What the answer's field shows, typed text that breaks its rule included. */
  text: string;
  /** What the amount's field shows: as typed while it has focus. */
  amount: string;
  /** What is saved or on its way: what breaks its rule is never sent. */
  value: { text: string | null; amount: number | null };
  /** Text or an amount (design-spec 6.11「回答済み」). */
  isAnswered: boolean;
  /** Its comments in every workspace it is shared with (SDD 5.8 `commentCounts`). */
  commentCount: number;
}

/** The save of one answer (S3 PUT), putting the saved answer in the section's data. */
function answerTarget(
  queryClient: QueryClient,
  selfAnalysisId: string,
  sectionKey: string,
  questionKey: string,
  noun: string,
): SaveTarget {
  const queryKey = selfAnalysisSectionQuery(sectionKey).queryKey;
  return {
    key: selfAnswerKey(selfAnalysisId, questionKey),
    noun,
    send: async (fields: SaveFields, lockVersion, force) => {
      const saved = await unwrap(
        api()
          .api.v1.me["self-analysis"].answers({
            questionKey: inPath(questionKey),
          })
          .put({
            ...(fields as { text?: string; amount?: number | null }),
            lockVersion,
            ...(force ? { force } : {}),
          }),
      );
      putSaved<SectionData>(queryClient, queryKey, (data) =>
        data === undefined
          ? undefined
          : {
              ...data,
              answers: data.answers.map((answer) =>
                answer.questionKey === questionKey ? saved : answer,
              ),
            },
      );
      return saved.lockVersion;
    },
    loadTheirs: () => void queryClient.invalidateQueries({ queryKey }),
  };
}

/**
 * Answering a section's questions (design-spec 6.2・6.0.2): each answer's view under what
 * waits to be saved, its text and amount saved as typed unless they break their rule
 * (shown, never sent), a choice saved when made. What breaks a rule is kept here, not in
 * the card, so it stays while the card is quiet.
 */
function useSelfAnswers(selfAnalysisId: string, sectionKey: string) {
  const { t } = useTranslation(["validation"]);
  const queryClient = useQueryClient();
  const autosave = useAutosave();
  const saves = useAutosaveState();
  const [invalid, setInvalid] = useState<
    Record<string, { text?: string; amount?: string }>
  >({});
  // An amount shows as typed while its field has focus: it is regrouped on leaving.
  const [typedAmount, setTypedAmount] = useState<Record<string, string>>({});
  const targetOf = (questionKey: string) =>
    answerTarget(
      queryClient,
      selfAnalysisId,
      sectionKey,
      questionKey,
      t("validation:questions.noun"),
    );
  const keyOf = (questionKey: string) =>
    selfAnswerKey(selfAnalysisId, questionKey);

  const viewOf = (
    question: TemplateQuestion,
    answer: SelfAnalysisAnswer,
  ): AnswerView => {
    const unsaved = saves?.items.get(keyOf(question.key))?.unsaved ?? {};
    const value = {
      text: Object.hasOwn(unsaved, "text")
        ? ((unsaved.text as string | null) ?? null)
        : answer.text,
      amount: Object.hasOwn(unsaved, "amount")
        ? ((unsaved.amount as number | null) ?? null)
        : answer.amount,
    };
    const typed = invalid[question.key] ?? {};
    return {
      question,
      answer,
      text: typed.text ?? value.text ?? "",
      amount:
        typed.amount ??
        typedAmount[question.key] ??
        (value.amount === null ? "" : formatInputNumber(value.amount)),
      value,
      isAnswered: isSelfAnalysisAnswered(value),
      commentCount: answer.commentCounts.reduce(
        (sum, { count }) => sum + count,
        0,
      ),
    };
  };

  const keep = (
    questionKey: string,
    field: "text" | "amount",
    typed?: string,
  ) =>
    setInvalid(({ [questionKey]: fields = {}, ...rest }) => {
      const { [field]: _, ...others } = fields;
      const next = typed === undefined ? others : { ...others, [field]: typed };
      return Object.keys(next).length === 0
        ? rest
        : { ...rest, [questionKey]: next };
    });

  const changeText = (view: AnswerView, typed: string) => {
    const { question, answer } = view;
    if (textSchemaOf(question).safeParse(typed).success) {
      keep(question.key, "text");
      autosave.change(targetOf(question.key), answer.lockVersion, {
        text: typed,
      });
    } else {
      keep(question.key, "text", typed);
      autosave.discard(keyOf(question.key), ["text"]);
    }
  };
  const changeAmount = (view: AnswerView, typed: string) => {
    const { question, answer } = view;
    const parsed = parseAmount(typed);
    if (parsed.success) {
      keep(question.key, "amount");
      setTypedAmount((current) => ({ ...current, [question.key]: typed }));
      autosave.change(targetOf(question.key), answer.lockVersion, {
        amount: parsed.data,
      });
    } else {
      keep(question.key, "amount", typed);
      autosave.discard(keyOf(question.key), ["amount"]);
    }
  };
  /** A choice is saved when made (6.0.2). */
  const choose = (view: AnswerView, text: string) => {
    autosave.change(targetOf(view.question.key), view.answer.lockVersion, {
      text,
    });
    autosave.flush(keyOf(view.question.key));
  };
  const blur = (view: AnswerView) => {
    setTypedAmount(({ [view.question.key]: _, ...rest }) => rest);
    autosave.flush(keyOf(view.question.key));
  };
  /** Why the typed text or amount breaks its rule, or undefined. */
  const typedError = (question: TemplateQuestion, field: "text" | "amount") => {
    const typed = invalid[question.key]?.[field];
    if (typed === undefined) return undefined;
    const result =
      field === "text"
        ? textSchemaOf(question).safeParse(typed)
        : parseAmount(typed);
    const [issue] = result.success ? [] : result.error.issues;
    return issue === undefined ? undefined : inputIssueMessage(issue);
  };
  return { viewOf, changeText, changeAmount, choose, blur, typedError, keyOf };
}

type Answers = ReturnType<typeof useSelfAnswers>;

/**
 * An open question's content (design-spec 6.2): its answer's fields (the amount with the
 * currency's symbol and "Why this amount?" on Q15–17), read only while offline; its save's
 * failure; EXAMPLE and Hint. A self-analysis has no F/A/U (6.2「表示内容」).
 */
function SelfAnswerFields({
  view,
  answers,
  currency,
  note,
}: {
  view: AnswerView;
  answers: Answers;
  currency: string;
  /** Under the fields: "Answer … to see the next questions". */
  note?: ReactNode;
}) {
  const { t } = useTranslation(["validation", "selfAnalysis", "errors"]);
  const autosave = useAutosave();
  const isOnline = useIsOnline();
  const saves = useAutosaveState();
  const { question } = view;
  const key = answers.keyOf(question.key);
  const item = saves?.items.get(key);
  // The API's last guard (SDD 8.2): a 422 naming a field puts its reason under it.
  const details =
    item?.status === "rejected" ? item.failure?.detail.details : undefined;
  const refused = (path: string) =>
    item?.failure?.code === "VALIDATION_FAILED" &&
    Array.isArray(details) &&
    details.some((detail) => (detail as { path?: unknown }).path === path)
      ? t("errors:input.format")
      : undefined;
  const textProps = {
    value: view.text,
    onChange: (value: string) => answers.changeText(view, value),
    onBlur: () => autosave.flush(key),
    isReadOnly: !isOnline,
    errorMessage: answers.typedError(question, "text") ?? refused("text"),
    placeholder: t("validation:questions.placeholder"),
    width: "full" as const,
  };
  let fields: ReactNode;
  if (isAmountQuestion(question)) {
    fields = (
      <>
        <NumberField
          label={t("selfAnalysis:form.amount")}
          value={view.amount}
          onChange={(value) => answers.changeAmount(view, value)}
          onBlur={() => answers.blur(view)}
          currency={currency}
          isReadOnly={!isOnline}
          errorMessage={
            answers.typedError(question, "amount") ?? refused("amount")
          }
        />
        <TextArea {...textProps} label={t("selfAnalysis:form.reason")} />
      </>
    );
  } else if (
    question.answerType === "choice" &&
    question.options?.kind === "choice"
  ) {
    fields = (
      <RadioGroup
        aria-label={t("validation:questions.answerLabel", {
          title: question.title,
        })}
        orientation="horizontal"
        value={view.text}
        onChange={(value) => answers.choose(view, value)}
        isReadOnly={!isOnline}
      >
        {question.options.choices.map((choice) => (
          <Radio key={choice} value={choice}>
            {choice}
          </Radio>
        ))}
      </RadioGroup>
    );
  } else {
    const Field = question.answerType === "short_text" ? TextField : TextArea;
    fields = (
      <Field
        {...textProps}
        aria-label={t("validation:questions.answerLabel", {
          title: question.title,
        })}
      />
    );
  }
  return (
    <>
      {fields}
      <SaveFailureNote itemKey={key} />
      {note}
      {(question.example !== null || question.hint !== null) && (
        // Side by side ("▸ EXAMPLE  ▸ Hint"), as 11 of a validation.
        <Flex wrap columnGap="space-200" alignItems="center">
          {question.example !== null && (
            <Disclosure
              title={t("validation:questions.example")}
              isQuiet
              defaultExpanded
            >
              <Text variant="body-long" elementType="p">
                {question.example}
              </Text>
            </Disclosure>
          )}
          {question.hint !== null && (
            <ContextualHelp
              label={t("validation:questions.hint")}
              aria-label={t("validation:questions.hintFor", {
                title: question.title,
              })}
              title={t("validation:questions.hint")}
              size="S"
            >
              {question.hint}
            </ContextualHelp>
          )}
        </Flex>
      )}
    </>
  );
}

/** The excerpt of a quiet card: the amount and its reason on Q15–17, else the text. */
function excerptOf(view: AnswerView, currency: string): string | null {
  const { text, amount } = view.value;
  const words = hasText(text) ? (text ?? "") : null;
  if (!isAmountQuestion(view.question) || amount === null) return words;
  const money = formatMoney(amount, currency, {
    cents: !Number.isInteger(amount),
  });
  return words === null ? money : [money, words].join(i18n.t("app:separator"));
}

/**
 * The questions of one section and their answers, ready (design-spec 6.2): pattern C,
 * autosave per answer (6.0.2). No F/A/U, M2 or Related research: a self-analysis has none.
 */
function SectionForm({
  home,
  section,
  answers,
  focusKey,
}: {
  home: SelfAnalysisHome;
  section: TemplateSection;
  answers: readonly SelfAnalysisAnswer[];
  focusKey: string | undefined;
}) {
  const { t } = useTranslation(["validation", "selfAnalysis"]);
  const { workspace } = useWorkspace();
  const autosave = useAutosave();
  const panel = usePanel();
  const navigate = useNavigate();
  const editing = useSelfAnswers(home.id, section.key);
  const answerItem = (questionKey: string) =>
    ({
      kind: "item",
      item: { type: "self_analysis_answer", id: home.id, key: questionKey },
    }) as const;

  const byKey = new Map(answers.map((answer) => [answer.questionKey, answer]));
  const views = section.questions.map((question) => {
    const answer = byKey.get(question.key);
    // S2 returns one answer for every question (SDD 5.8): a missing one is the API's
    // fault, shown as unexpected rather than saved on a version made up here.
    if (answer === undefined) {
      throw new Error(`S2 returned no answer to ${question.key}`);
    }
    return editing.viewOf(question, answer);
  });
  const byQuestion = new Map(views.map((view) => [view.question.key, view]));
  const shownValues = new Map(
    views.map((view) => [view.question.key, { text: view.value.text }]),
  );
  // A question its display condition hides is neither asked nor counted (6.2).
  const shown = views.filter((view) =>
    isQuestionShown(view.question, shownValues),
  );
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

  // Opening, and a `?q=` given later, focus the question (6.2「開いたとき」, 10's
  // Continue): its first field, which moves it to the middle (4.1 C).
  const latest = useRef({ shownIds, currentId });
  latest.current = { shownIds, currentId };
  const hasOpened = useRef(false);
  // Runs on opening and when `?q=` changes; the rest is read from `latest`.
  useEffect(() => {
    const { shownIds: ids, currentId: current } = latest.current;
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
    editing.keyOf(question.key),
  );
  useEffect(
    () => () => {
      for (const key of keysRef.current) autosave.flush(key);
    },
    [autosave],
  );

  // The template's order: WHY → … → ONE-SENTENCE (6.2「前後のセクション」).
  const index = home.sections.findIndex(({ key }) => key === section.key);
  const neighbour = (step: -1 | 1) => {
    const other = home.sections[index + step];
    return other === undefined
      ? undefined
      : {
          href: selfAnalysisSectionHref(workspace.id, other.key),
          title: other.title,
        };
  };
  const previous = neighbour(-1);
  const next = neighbour(1);
  const here = selfAnalysisSectionHref(workspace.id, section.key);
  const go = (href: string) => void navigate({ href });

  /** The questions whose answer decides others, while unanswered (6.2). */
  const decidesOthers = (view: AnswerView) =>
    !hasText(view.value.text) &&
    section.questions.some(
      (other) => other.displayCondition?.[view.question.key] !== undefined,
    );

  const header = (
    <Stack gap="space-100">
      <Flex
        alignItems="end"
        justifyContent="space-between"
        gap="space-300"
        wrap
      >
        <SectionSwitchTitle
          sections={home.sections.map((candidate) => ({
            key: candidate.key,
            title: candidate.title,
            href: selfAnalysisSectionHref(workspace.id, candidate.key),
          }))}
          title={section.title}
          menuLabel={t("selfAnalysis:home.sections.title")}
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

  return (
    <QuestionFormPattern
      header={header}
      questionIds={shownIds}
      currentId={currentId}
      onCurrentChange={(id) => {
        setAtEnd(false);
        setChosen(id);
      }}
      isAnswered={(id) => byQuestion.get(id)?.isAnswered === true}
      onEnd={() => setAtEnd(true)}
      end={
        isAtEnd ? (
          <Well>
            <Stack gap="space-300">
              <Heading level={2}>
                {t("validation:questions.complete", {
                  // Its name: a self-analysis's keys are not shown anywhere else.
                  section: section.title,
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
                <Button
                  variant="secondary"
                  onPress={() => go(selfAnalysisHref(workspace.id))}
                >
                  {t("selfAnalysis:form.toHome")}
                </Button>
              </Flex>
            </Stack>
          </Well>
        ) : null
      }
      footer={
        <AiMenu kind="self_analysis" scope={section.key} returnTo={here} />
      }
      previousSection={
        previous === undefined ? undefined : (
          <Button variant="secondary" isQuiet onPress={() => go(previous.href)}>
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
        const view = byQuestion.get(id);
        if (view === undefined) return null;
        const { question } = view;
        const label = questionLabel(question.key, question.title);
        return (
          <QuestionCard
            title={question.title}
            question={question.prompt}
            mode={mode}
            excerpt={excerptOf(view, home.currency)}
            commentCount={view.commentCount}
            actions={
              <>
                <ItemCommentsButton
                  label={label}
                  count={view.commentCount}
                  onPress={() =>
                    panel.show("comments", answerItem(question.key))
                  }
                />
                <ItemHistoryButton
                  label={label}
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
            {mode === "quiet" ? undefined : (
              <SelfAnswerFields
                view={view}
                answers={editing}
                currency={home.currency}
                note={
                  decidesOthers(view) && (
                    <Text variant="body-sm" tone="secondary" elementType="p">
                      {t("validation:questions.revealHint", {
                        title: question.title,
                      })}
                    </Text>
                  )
                }
              />
            )}
          </QuestionCard>
        );
      }}
    />
  );
}

function SectionBody({
  home,
  sectionKey,
  focusKey,
}: {
  home: SelfAnalysisHome;
  sectionKey: string;
  focusKey: string | undefined;
}) {
  const { me } = useWorkspace();
  const isSection = home.sections.some(({ key }) => key === sectionKey);
  const query = useQuery({
    ...selfAnalysisSectionQuery(sectionKey),
    enabled: isSection,
  });
  const isSlow = useIsSlow(isSection && query.isPending);
  if (!isSection) return <NotFoundState dashboardHref={dashboardHref(me)} />;
  if (query.data !== undefined) {
    return (
      <SectionForm
        // Another section is another form: its questions, focus and end card.
        key={sectionKey}
        home={home}
        section={query.data.section}
        answers={query.data.answers}
        focusKey={focusKey}
      />
    );
  }
  if (query.isError) {
    return (
      <FailureState
        error={query.error}
        onRetry={() => void query.refetch()}
        dashboardHref={dashboardHref(me)}
      />
    );
  }
  if (isSlow) return <SlowLoadingState onRetry={() => void query.refetch()} />;
  return (
    <Skeleton isLoading>
      <QuestionFormSkeleton />
    </Skeleton>
  );
}

/**
 * 11 Question form for a self-analysis section (design-spec 6.2・6.11, s11-form.html):
 * pattern C, the user's own. The section's title with ▼ to switch sections and how many
 * are answered; each question with its answer (an amount and "Why this amount?" on
 * Q15–17), Example and Hint; the previous and next sections and AI ▼ in the bottom bar,
 * or on a phone ← → between the questions, the section's completion card and AI ▼ under
 * the card. A Viewer of this workspace is taken to their personal workspace's 11.
 */
export function SelfAnalysisFormScreen({
  sectionKey,
  search,
}: {
  sectionKey: string;
  search: SelfAnalysisFormSearch;
}) {
  const { t } = useTranslation(["app", "selfAnalysis"]);
  const { workspace } = useWorkspace();
  const moves = useMovesToPersonal();
  const { data: home } = useQuery({
    ...selfAnalysisHomeQuery(),
    enabled: !moves,
  });
  const isSection =
    home?.sections.some(({ key }) => key === sectionKey) === true;
  const title = home?.sections.find(({ key }) => key === sectionKey)?.title;
  // The body reads the same questions: the panel names the answers by their titles.
  const questions = useQuery({
    ...selfAnalysisSectionQuery(sectionKey),
    enabled: isSection && !moves,
  });
  useDocumentTitle(...(title === undefined ? [] : [title, workspace.name]));
  const titleOf = (key: string) =>
    questions.data?.section.questions.find((question) => question.key === key)
      ?.title;
  const comments: ScreenComments | undefined =
    home === undefined || !isSection
      ? undefined
      : {
          screen: {
            containerType: "self_analysis",
            containerId: home.id,
            sectionKeys: [sectionKey],
          },
          dataKey: selfAnalysisKey,
          fromWorkspaces: {
            shares: home.shares.map((share) => share.workspace),
          },
          shows: (item) =>
            item.type === "self_analysis_answer" &&
            item.id === home.id &&
            (item.key ?? "").split(".")[1] === sectionKey &&
            (questions.data === undefined ||
              questions.data.section.questions.some(
                ({ key }) => key === item.key,
              )),
          labelOf: (target) =>
            target.type === "self_analysis_answer" && target.key != null
              ? questionLabel(target.key, titleOf(target.key))
              : undefined,
        };
  return (
    <WorkspaceFrame
      current="selfAnalysis"
      saveScope={
        home === undefined
          ? undefined
          : selfAnswerKey(home.id, `SA.${sectionKey}.`)
      }
      comments={comments}
      history={
        comments && {
          ...comments,
          hasFau: () => false,
          currency: home?.currency,
          answerTypeOf: (key) =>
            questions.data?.section.questions.find(
              (question) => question.key === key,
            )?.answerType,
        }
      }
      back={{
        label: t("app:nav.selfAnalysis"),
        href: selfAnalysisHref(workspace.id),
      }}
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb href={selfAnalysisHref(workspace.id)}>
            {t("app:nav.selfAnalysis")}
          </Breadcrumb>
          {title !== undefined && <Breadcrumb>{title}</Breadcrumb>}
        </Breadcrumbs>
      }
    >
      {moves ? null : (
        <SelfAnalysisBody skeleton={<QuestionFormSkeleton />}>
          {(loaded) => (
            <SectionBody
              home={loaded}
              sectionKey={sectionKey}
              focusKey={search.q}
            />
          )}
        </SelfAnalysisBody>
      )}
    </WorkspaceFrame>
  );
}
