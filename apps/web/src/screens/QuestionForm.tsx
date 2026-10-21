import { fauState, hasText, isQuestionShown } from "@moonx/domain";
import { formatCount } from "@moonx/i18n";
import {
  type ClassificationInput,
  type FauState,
  longTextSchema,
  shortTextSchema,
  type TemplateQuestion,
  type TemplateSection,
  type ValidationAnswer,
  type ValidationHome,
} from "@moonx/schemas";
import {
  ActionButton,
  Breadcrumb,
  Breadcrumbs,
  Button,
  ContextualHelp,
  Disclosure,
  FauButtons,
  type FauChange,
  Flex,
  Heading,
  Link,
  Menu,
  MenuItem,
  MenuTrigger,
  MoonGlyph,
  type MoonState,
  QuestionCard,
  QuestionFormPattern,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  TagGroup,
  Text,
  TextArea,
  TextField,
  useFauLabel,
  Well,
} from "@moonx/ui-web";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArchivedIdeaAlert } from "../components/ArchivedIdeaAlert";
import { ModalBoundary } from "../components/ErrorBoundary";
import { EvidenceSheet } from "../components/EvidenceSheet";
import { SaveFailureNote } from "../components/SaveFeedback";
import {
  FailureState,
  NoAccessState,
  NotFoundState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, useModal, useWorkspace } from "../components/workspace";
import { api, inPath, unwrap } from "../lib/api";
import type { SaveFields, SaveTarget } from "../lib/autosave";
import { useAutosave, useAutosaveState } from "../lib/autosave-react";
import { countingEvidence, evidenceLabel } from "../lib/evidence";
import { inputIssueMessage } from "../lib/input-issues";
import {
  ideaHref,
  ideasHref,
  isQuestionSection,
  type QuestionSection,
  researchHref,
  sectionHref,
} from "../lib/links";
import { useIsOnline } from "../lib/online";
import { validationHomeQuery, validationQuestionsQuery } from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

/** `/w/$workspaceId/ideas/$ideaId/questions/$sectionKey`'s own search (SDD 4章). */
export interface QuestionFormSearch {
  /** The question to focus: its ID ("V.01.WHO"). */
  q?: string;
}

type HomeSection = ValidationHome["sections"][number];

/**
 * The page's save of a validation answer (design-spec 6.0.2's item "1つの回答"). Its prefix
 * per section (`validation_answer:<validationId>:V.01.`) is the screen's save scope.
 */
const answerKey = (validationId: string, questionKey: string) =>
  `validation_answer:${validationId}:${questionKey}`;

/** The mark of each F/A/U state: a Fact without evidence is still a full moon (6.0.3). */
const moonOf: Record<FauState, MoonState> = {
  fact: "fact",
  fact_no_evidence: "fact",
  assumption: "assumption",
  unknown: "unknown",
  unclassified: "unclassified",
  empty: "empty",
};

/** The order 11 moves through the sections in (design-spec 6.2「前後のセクション」). */
const SECTION_ORDER = ["01", "02", "03", "04", "05", "06-08", "09", "10"];

/** The save of one answer (V3 PUT), putting the saved answer in the section's data. */
function answerTarget(
  queryClient: QueryClient,
  questionsKey: readonly unknown[],
  validationId: string,
  questionKey: string,
  noun: string,
): SaveTarget {
  const put = (answer: ValidationAnswer) => {
    // A read of the section already on its way holds an older version: it must not
    // land over this one.
    void queryClient.cancelQueries({ queryKey: questionsKey });
    queryClient.setQueryData(
      questionsKey,
      (data: { answers: ValidationAnswer[] } | undefined) =>
        data === undefined
          ? undefined
          : {
              ...data,
              answers: data.answers.map((current) =>
                current.questionKey === answer.questionKey ? answer : current,
              ),
            },
    );
  };
  return {
    key: answerKey(validationId, questionKey),
    noun,
    send: async (fields: SaveFields, lockVersion, force) => {
      const answer = await unwrap(
        api()
          .api.v1.validations({ validationId: inPath(validationId) })
          .answers({ questionKey: inPath(questionKey) })
          .put({
            ...(fields as {
              text?: string;
              classification?: ClassificationInput;
            }),
            lockVersion,
            ...(force ? { force } : {}),
          }),
      );
      put(answer);
      return answer.lockVersion;
    },
    // Their version carries its evidence by id only (the history's shape): the section
    // is read again for the whole answer.
    loadTheirs: () =>
      void queryClient.invalidateQueries({ queryKey: questionsKey }),
  };
}

/** One question as the screen shows it: what was saved, under what is being typed. */
interface AnswerView {
  question: TemplateQuestion;
  answer: ValidationAnswer;
  /** What the field shows, text that breaks its rule (6.0.8) included. */
  text: string | null;
  /** What is saved or on its way: text that breaks its rule is never sent. */
  value: string | null;
  fau: ClassificationInput["fau"];
  confidence: ValidationAnswer["classification"]["confidence"];
  /** Null for a question without F/A/U. */
  state: FauState | null;
  /** The evidence that counts (6.0.3). */
  counted: number;
  /** Answered or Unknown (design-spec 6.1「セクションの進み具合の数え方」). */
  isAnswered: boolean;
}

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
  const { t } = useTranslation(["validation", "common", "app", "errors"]);
  const { me, workspace, role } = useWorkspace();
  const queryClient = useQueryClient();
  const autosave = useAutosave();
  const saves = useAutosaveState();
  const isOnline = useIsOnline();
  const modals = useModal();
  const navigate = useNavigate();
  const fauLabel = useFauLabel();
  const forFact = useRouterState({
    select: (state) => state.location.state.evidenceForFact === true,
  });
  const { idea, validationId } = home;
  const canEdit = role !== "viewer" && !idea.archived;
  const questionsKey = validationQuestionsQuery(
    idea.id,
    validationId,
    sectionKey,
  ).queryKey;
  // What was typed that breaks its rule (6.0.8): shown, never sent.
  const [invalid, setInvalid] = useState<Record<string, string>>({});

  const targetOf = (questionKey: string) =>
    answerTarget(
      queryClient,
      questionsKey,
      validationId,
      questionKey,
      t("validation:questions.noun"),
    );

  const byKey = new Map(answers.map((answer) => [answer.questionKey, answer]));
  const viewOf = (question: TemplateQuestion): AnswerView => {
    const answer = byKey.get(question.key);
    // V2 returns one answer for every question (SDD 5.7): a missing one is the API's
    // fault, shown as unexpected rather than saved on a version made up here.
    if (answer === undefined) {
      throw new Error(`V2 returned no answer to ${question.key}`);
    }
    const unsaved =
      saves?.items.get(answerKey(validationId, question.key))?.unsaved ?? {};
    const value = Object.hasOwn(unsaved, "text")
      ? ((unsaved.text as string | null) ?? null)
      : answer.text;
    const text = invalid[question.key] ?? value;
    const typed = Object.hasOwn(unsaved, "classification")
      ? (unsaved.classification as ClassificationInput)
      : null;
    const fau = typed === null ? answer.classification.fau : typed.fau;
    const confidence =
      typed === null
        ? answer.classification.confidence
        : (typed.confidence ?? null);
    const counted = countingEvidence(answer.classification.evidence).length;
    return {
      question,
      answer,
      text,
      value,
      fau,
      confidence,
      state: question.hasFau
        ? fauState({
            hasValue: hasText(value),
            fau,
            confidence,
            activeEvidenceCount: counted,
          })
        : null,
      counted,
      isAnswered: hasText(value) || fau === "unknown",
    };
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
  // field, which moves it to the middle (4.1 C). A Viewer's form has no focus to move.
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

  const changeText = (view: AnswerView, value: string) => {
    const { question, answer } = view;
    const schema =
      question.answerType === "short_text" ? shortTextSchema : longTextSchema;
    if (schema.safeParse(value).success) {
      setInvalid(({ [question.key]: _, ...rest }) => rest);
      autosave.change(targetOf(question.key), answer.lockVersion, {
        text: value,
      });
    } else {
      setInvalid((fields) => ({ ...fields, [question.key]: value }));
      autosave.discard(answerKey(validationId, question.key), ["text"]);
    }
  };
  /** A choice is saved when made (6.0.2). */
  const choose = (view: AnswerView, fields: SaveFields) => {
    autosave.change(
      targetOf(view.question.key),
      view.answer.lockVersion,
      fields,
    );
    autosave.flush(answerKey(validationId, view.question.key));
  };
  const openEvidence = (view: AnswerView, isFact: boolean) =>
    modals.open("evidence", {
      about: `validation_answer:${validationId}:${view.question.key}`,
      forFact: isFact,
    });

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
  const switchable = home.sections.flatMap((candidate: HomeSection) => {
    const href = sectionHref(workspace.id, idea.id, candidate.key);
    return href === undefined
      ? []
      : [{ key: candidate.key, href, title: candidate.title }];
  });

  /** The questions whose answer decides others (02 OCEAN), while unanswered (6.2). */
  const decidesOthers = (view: AnswerView) =>
    !hasText(view.text) &&
    section.questions.some(
      (other) => other.displayCondition?.[view.question.key] !== undefined,
    );

  const renderAnswer = (view: AnswerView) => {
    const { question } = view;
    const key = answerKey(validationId, question.key);
    const item = saves?.items.get(key);
    const typedError =
      invalid[question.key] === undefined
        ? undefined
        : (() => {
            const schema =
              question.answerType === "short_text"
                ? shortTextSchema
                : longTextSchema;
            const [issue] =
              schema.safeParse(invalid[question.key]).error?.issues ?? [];
            return issue === undefined ? undefined : inputIssueMessage(issue);
          })();
    // The API's last guard (SDD 8.2): a 422 naming the text puts its reason under it.
    const details =
      item?.status === "rejected" ? item.failure?.detail.details : undefined;
    const refused =
      item?.failure?.code === "VALIDATION_FAILED" &&
      Array.isArray(details) &&
      details.some((detail) => (detail as { path?: unknown }).path === "text")
        ? t("errors:input.format")
        : undefined;
    const fieldProps = {
      "aria-label": t("validation:questions.answerLabel", {
        title: question.title,
      }),
      value: view.text ?? "",
      onChange: (value: string) => changeText(view, value),
      onBlur: () => autosave.flush(key),
      isReadOnly: !isOnline,
      errorMessage: typedError ?? refused,
      placeholder: t("validation:questions.placeholder"),
      width: "full" as const,
    };
    const linked = countingEvidence(view.answer.classification.evidence);
    const isFact = view.state === "fact" || view.state === "fact_no_evidence";
    const addEvidence = (
      <Flex>
        <Link onPress={() => openEvidence(view, false)}>
          {t("validation:questions.addEvidence")}
        </Link>
      </Flex>
    );
    return (
      <>
        {!canEdit ? (
          hasText(view.text) ? (
            <Text variant="body-long" elementType="p">
              {view.text}
            </Text>
          ) : (
            <Text tone="tertiary" elementType="p">
              {t("validation:questions.empty")}
            </Text>
          )
        ) : question.answerType === "choice" &&
          question.options?.kind === "choice" ? (
          <RadioGroup
            aria-label={fieldProps["aria-label"]}
            orientation="horizontal"
            value={view.text ?? ""}
            onChange={(value) => choose(view, { text: value })}
            isReadOnly={!isOnline}
          >
            {question.options.choices.map((choice) => (
              <Radio key={choice} value={choice}>
                {choice}
              </Radio>
            ))}
          </RadioGroup>
        ) : question.answerType === "short_text" ? (
          <TextField {...fieldProps} />
        ) : (
          <TextArea {...fieldProps} />
        )}
        {canEdit && <SaveFailureNote itemKey={key} />}
        {canEdit && view.state !== null && (
          <FauButtons
            aria-label={t("validation:questions.fau", {
              title: question.title,
            })}
            state={view.state}
            confidence={view.confidence}
            hasValue={hasText(view.value)}
            isDisabled={!isOnline}
            onChange={(change: FauChange) =>
              choose(view, { classification: change })
            }
            onFactPress={() => openEvidence(view, true)}
          />
        )}
        {decidesOthers(view) && (
          <Text variant="body-sm" tone="secondary" elementType="p">
            {t("validation:questions.revealHint", { title: question.title })}
          </Text>
        )}
        {(question.example !== null || question.hint !== null) && (
          // Side by side ("▸ EXAMPLE  ▸ Hint"); EXAMPLE open takes the row, and Hint
          // follows on the next.
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
        {view.state !== null && (
          <Disclosure
            title={
              linked.length === 0
                ? t("validation:questions.related")
                : t("validation:questions.relatedCount", {
                    count: linked.length,
                  })
            }
            defaultExpanded
          >
            {linked.length === 0 ? (
              <Stack gap="space-100">
                {/* A Fact whose research log was deleted is a Fact already (6.0.3
                    「Fact（根拠なし）」): it is not told to become one. */}
                <Text variant="body-sm" tone="secondary" elementType="p">
                  {canEdit && !isFact
                    ? t("validation:questions.noResearch")
                    : t("validation:questions.noResearchReadOnly")}
                </Text>
                {canEdit && (
                  <Flex>
                    <Link
                      href={researchHref(workspace.id, idea.id, { new: 1 })}
                    >
                      {t("validation:questions.logResearch")}
                    </Link>
                  </Flex>
                )}
                {/* Pressing Fact again would clear it, so M2 is reached from here. */}
                {canEdit && isFact && addEvidence}
              </Stack>
            ) : (
              <Stack gap="space-100">
                <TagGroup
                  aria-label={t("validation:questions.related")}
                  items={linked.map((evidence) => ({
                    id: evidence.id,
                    label: evidenceLabel(evidence, me.timezone),
                  }))}
                />
                {canEdit && addEvidence}
              </Stack>
            )}
          </Disclosure>
        )}
      </>
    );
  };

  const header = (
    <Stack gap="space-100">
      {idea.archived && <ArchivedIdeaAlert ideaId={idea.id} />}
      <Flex
        alignItems="end"
        justifyContent="space-between"
        gap="space-300"
        wrap
      >
        <Flex gap="space-50" alignItems="center">
          <Heading level={1}>{titleOf(sectionKey)}</Heading>
          <MenuTrigger>
            <ActionButton
              isQuiet
              aria-label={t("validation:questions.switchSection")}
            >
              <ChevronDown />
            </ActionButton>
            <Menu aria-label={t("validation:home.sections.title")}>
              {switchable.map((candidate) => (
                <MenuItem
                  key={candidate.key}
                  id={candidate.key}
                  href={candidate.href}
                >
                  {candidate.title}
                </MenuItem>
              ))}
            </Menu>
          </MenuTrigger>
        </Flex>
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
          <EvidenceSheet
            ideaId={idea.id}
            validationId={validationId}
            item={{
              target: {
                type: "validation_answer",
                id: validationId,
                key: evidenceView.question.key,
              },
              label: [
                t("common:itemLabel.question", {
                  section: sectionKey,
                  title: evidenceView.question.title,
                }),
                evidenceView.question.prompt,
              ].join(t("app:separator")),
              noun: t("validation:questions.noun"),
              evidence: evidenceView.answer.classification.evidence,
              state: evidenceView.state,
              hasValue: hasText(evidenceView.value),
            }}
            lockVersionNow={() =>
              queryClient
                .getQueryData(questionsKey)
                ?.answers.find(
                  (answer) => answer.questionKey === evidenceView.question.key,
                )?.lockVersion ?? evidenceView.answer.lockVersion
            }
            saveKey={answerKey(validationId, evidenceView.question.key)}
            forFact={forFact}
            onChanged={(result) => {
              // As the autosave's put: an older read on its way must not land over it.
              void queryClient.cancelQueries({ queryKey: questionsKey });
              queryClient.setQueryData(questionsKey, (data) =>
                data === undefined
                  ? undefined
                  : {
                      ...data,
                      answers: data.answers.map((answer) =>
                        answer.questionKey === evidenceView.question.key
                          ? {
                              ...answer,
                              classification: result.classification,
                              lockVersion: result.lockVersion,
                            }
                          : answer,
                      ),
                    },
              );
            }}
            onMarkFact={() =>
              choose(evidenceView, {
                classification: { fau: "fact", confidence: null },
              })
            }
            onReload={() =>
              void queryClient.invalidateQueries({ queryKey: questionsKey })
            }
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
 * research; the previous and next sections in the bottom bar, or on a phone ← → between
 * the questions and the section's completion card. Viewers and archived ideas read it
 * with every question open.
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
  const title = isQuestionSection(sectionKey)
    ? home?.sections.find((section) => section.key === sectionKey)?.title
    : undefined;
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
