import { fauState, hasText } from "@moonx/domain";
import {
  type ClassificationInput,
  type FauState,
  longTextSchema,
  shortTextSchema,
  type TemplateQuestion,
  type ValidationAnswer,
} from "@moonx/schemas";
import {
  ContextualHelp,
  Disclosure,
  FauButtons,
  type FauChange,
  Flex,
  Link,
  type MoonState,
  Radio,
  RadioGroup,
  Stack,
  TagGroup,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, inPath, unwrap } from "../lib/api";
import type { SaveFields, SaveTarget } from "../lib/autosave";
import { useAutosave, useAutosaveState } from "../lib/autosave-react";
import { countingEvidence, evidenceLabel } from "../lib/evidence";
import { inputIssueMessage } from "../lib/input-issues";
import { researchHref } from "../lib/links";
import { useIsOnline } from "../lib/online";
import { EvidenceSheet } from "./EvidenceSheet";
import { SaveFailureNote } from "./SaveFeedback";
import { useWorkspace } from "./workspace";

// The answers of a validation's questions, wherever they are asked: 11 for the sections
// of questions, 15 for Survivor and Failure Patterns (design-spec 6.2・6.10・6.0.3).

/**
 * The page's save of a validation answer (design-spec 6.0.2's item "1つの回答"). Its prefix
 * per section (`validation_answer:<validationId>:V.01.`) is a screen's save scope.
 */
export const answerKey = (validationId: string, questionKey: string) =>
  `validation_answer:${validationId}:${questionKey}`;

/** The mark of each F/A/U state: a Fact without evidence is still a full moon (6.0.3). */
export const moonOf: Record<FauState, MoonState> = {
  fact: "fact",
  fact_no_evidence: "fact",
  assumption: "assumption",
  unknown: "unknown",
  unclassified: "unclassified",
  empty: "empty",
};

/** Where a screen holds its answers: V2's section on 11, V8's patterns on 15. */
export interface AnswersCache {
  /** The answer as the screen's data holds it now. */
  get: (questionKey: string) => ValidationAnswer | undefined;
  /**
   * Puts a saved answer in the screen's data. A read of the answers already on its way
   * holds an older version: it must not land over this one.
   */
  update: (
    questionKey: string,
    change: (answer: ValidationAnswer) => ValidationAnswer,
  ) => void;
  /** Reads the answers again. */
  reload: () => void;
}

/** The save of one answer (V3 PUT), putting the saved answer in the screen's data. */
function answerTarget(
  cache: AnswersCache,
  validationId: string,
  questionKey: string,
  noun: string,
): SaveTarget {
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
      cache.update(questionKey, () => answer);
      return answer.lockVersion;
    },
    // Their version carries its evidence by id only (the history's shape): the answers
    // are read again for the whole answer.
    loadTheirs: () => cache.reload(),
  };
}

/** One question as the screen shows it: what was saved, under what is being typed. */
export interface AnswerView {
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

/** The schema of a question's text answer (6.0.8). */
const textSchemaOf = (question: TemplateQuestion) =>
  question.answerType === "short_text" ? shortTextSchema : longTextSchema;

/**
 * Answering a screen's questions: each answer's view under what waits to be saved, its
 * text saved as typed unless it breaks its rule (shown, never sent), a choice saved when
 * made (6.0.2), and the evidence sheet's way in.
 */
export function useAnswers(
  validationId: string,
  cache: AnswersCache,
  onOpenEvidence: (questionKey: string, isFact: boolean) => void,
) {
  const { t } = useTranslation(["validation"]);
  const autosave = useAutosave();
  const saves = useAutosaveState();
  // What was typed that breaks its rule (6.0.8): shown, never sent.
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const targetOf = (questionKey: string) =>
    answerTarget(
      cache,
      validationId,
      questionKey,
      t("validation:questions.noun"),
    );

  const viewOf = (
    question: TemplateQuestion,
    answer: ValidationAnswer,
  ): AnswerView => {
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

  const changeText = (view: AnswerView, value: string) => {
    const { question, answer } = view;
    if (textSchemaOf(question).safeParse(value).success) {
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
  /** Why the text typed breaks its rule, or undefined. */
  const typedError = (question: TemplateQuestion) => {
    const typed = invalid[question.key];
    if (typed === undefined) return undefined;
    const [issue] = textSchemaOf(question).safeParse(typed).error?.issues ?? [];
    return issue === undefined ? undefined : inputIssueMessage(issue);
  };
  return {
    viewOf,
    changeText,
    choose,
    typedError,
    openEvidence: (view: AnswerView, isFact: boolean) =>
      onOpenEvidence(view.question.key, isFact),
  };
}

export type Answers = ReturnType<typeof useAnswers>;

/**
 * An open question's content (design-spec 6.2・6.0.3): the answer, read only for a Viewer
 * and an archived idea; its save's failure; the F/A/U buttons; EXAMPLE and Hint; and the
 * research it is linked to, with the ways to add more.
 */
export function AnswerFields({
  view,
  answers,
  validationId,
  ideaId,
  canEdit,
  note,
}: {
  view: AnswerView;
  answers: Answers;
  validationId: string;
  ideaId: string;
  canEdit: boolean;
  /** Under the F/A/U buttons: 02 OCEAN's "Answer … to see the next questions". */
  note?: ReactNode;
}) {
  const { t } = useTranslation(["validation", "errors"]);
  const { me, workspace } = useWorkspace();
  const autosave = useAutosave();
  const isOnline = useIsOnline();
  const { question } = view;
  const key = answerKey(validationId, question.key);
  const saves = useAutosaveState();
  const item = saves?.items.get(key);
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
    onChange: (value: string) => answers.changeText(view, value),
    onBlur: () => autosave.flush(key),
    isReadOnly: !isOnline,
    errorMessage: answers.typedError(question) ?? refused,
    placeholder: t("validation:questions.placeholder"),
    width: "full" as const,
  };
  const linked = countingEvidence(view.answer.classification.evidence);
  const isFact = view.state === "fact" || view.state === "fact_no_evidence";
  const addEvidence = (
    <Flex>
      <Link onPress={() => answers.openEvidence(view, false)}>
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
          onChange={(value) => answers.choose(view, { text: value })}
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
            answers.choose(view, { classification: change })
          }
          onFactPress={() => answers.openEvidence(view, true)}
        />
      )}
      {note}
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
                  <Link href={researchHref(workspace.id, ideaId, { new: 1 })}>
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
}

/**
 * M2 for an answer (design-spec 6.0.3): its evidence, the answer's own save settled
 * first, the result put in the screen's data.
 */
export function AnswerEvidenceSheet({
  ideaId,
  validationId,
  view,
  label,
  cache,
  answers,
  forFact,
  onClose,
}: {
  ideaId: string;
  validationId: string;
  view: AnswerView & { state: FauState };
  /** What M2 heads it with: "01 WHO · Who is the primary paying customer?". */
  label: string;
  cache: AnswersCache;
  answers: Answers;
  forFact: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation(["validation"]);
  const { question } = view;
  return (
    <EvidenceSheet
      ideaId={ideaId}
      validationId={validationId}
      item={{
        target: {
          type: "validation_answer",
          id: validationId,
          key: question.key,
        },
        label,
        noun: t("validation:questions.noun"),
        evidence: view.answer.classification.evidence,
        state: view.state,
        hasValue: hasText(view.value),
      }}
      lockVersionNow={() =>
        cache.get(question.key)?.lockVersion ?? view.answer.lockVersion
      }
      saveKey={answerKey(validationId, question.key)}
      forFact={forFact}
      onChanged={(result) =>
        cache.update(question.key, (answer) => ({
          ...answer,
          classification: result.classification,
          lockVersion: result.lockVersion,
        }))
      }
      onMarkFact={() =>
        answers.choose(view, {
          classification: { fau: "fact", confidence: null },
        })
      }
      onReload={cache.reload}
      onClose={onClose}
    />
  );
}
