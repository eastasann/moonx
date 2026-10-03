import { formatDate } from "@moonx/i18n";
import {
  type Classification,
  type ConflictCurrent,
  MAX_LONG_TEXT,
  MAX_SHORT_TEXT,
  type TemplateQuestion,
  type ValidationAnswer,
} from "@moonx/schemas";
import {
  ContextualHelp,
  Disclosure,
  QuestionCard,
  Radio,
  RadioGroup,
  Stack,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConflictDialog } from "../../components/ConflictDialog";
import { EvidenceSheet } from "../../components/EvidenceSheet";
import { type FauChange, FauControl, FauStatus } from "../../components/FauControl";
import { CommentCountBadge, ItemPanelButtons } from "../../components/ItemPanelButtons";
import { SaveFailureNotice } from "../../components/SaveFailureNotice";
import { autosave } from "../../lib/autosave";
import { IDEAS_KEY } from "../../lib/idea-actions";
import { useOverlay } from "../../lib/overlay";
import { formatItemTarget } from "../../lib/panel-target";
import { withChoice, withText } from "../../lib/questions";
import { ME_KEY, useMe } from "../../lib/session";
import { useSavedItem } from "../../lib/use-saved-item";

export interface AnswerCardProps {
  validationId: string;
  question: TemplateQuestion;
  answer: ValidationAnswer;
  /** Query key of the section, so a saved answer is written back into the screen's copy. */
  sectionQueryKey: readonly unknown[];
  /** A Viewer, or an idea that is archived: the answer is shown, not edited. */
  isReadOnly: boolean;
  isFocused: boolean;
  /** Every card is open and none scrolls (the Focus switch is off, or the person is read-only). */
  isOpenAll: boolean;
  onFocusRequest: () => void;
  onNavigate: (direction: "previous" | "next") => void;
  /** Reports the text as it is typed, so questions that depend on this answer show at once. */
  onTextChange: (questionKey: string, text: string) => void;
}

const answerUrl = (validationId: string, questionKey: string) =>
  `/api/v1/validations/${validationId}/answers/${encodeURIComponent(questionKey)}`;

/** The answer as plain text for the conflict dialog, whatever the type. */
const textOfCurrent = (current: ConflictCurrent | null): string | null =>
  (current?.value as { text?: string | null } | undefined)?.text ?? null;

/**
 * One question of the form with its answer, F/A/U and evidence (design-spec 6.2). The field is
 * saved by the autosave rules (1 second after typing, on leaving the field, on leaving the
 * screen); a choice or a F/A/U button saves when pressed.
 */
export function AnswerCard({
  validationId,
  question,
  answer,
  sectionQueryKey,
  isReadOnly,
  isFocused,
  isOpenAll,
  onFocusRequest,
  onNavigate,
  onTextChange,
}: AnswerCardProps) {
  const { t } = useTranslation(["form", "validation", "app"]);
  const queryClient = useQueryClient();
  const { modal, about, openModal, closeModal } = useOverlay();
  const me = useMe();
  const [text, setText] = useState(answer.text ?? "");
  const [classification, setClassification] = useState<Classification>(answer.classification);
  const known = useRef({ lockVersion: answer.lockVersion, text: answer.text ?? "" });
  const serverClassification = useRef<Classification>(answer.classification);
  const dirty = useRef(false);
  const target = formatItemTarget("validation_answer", validationId, question.key);

  const writeBack = (patch: Partial<ValidationAnswer>) =>
    queryClient.setQueryData<{ answers: ValidationAnswer[] }>(sectionQueryKey, (old) =>
      old
        ? {
            ...old,
            answers: old.answers.map((a) =>
              a.questionKey === question.key ? { ...a, ...patch } : a,
            ),
          }
        : old,
    );

  const adopt = (source: ValidationAnswer) => {
    known.current = { lockVersion: source.lockVersion, text: source.text ?? "" };
    serverClassification.current = source.classification;
    dirty.current = false;
    setText(source.text ?? "");
    setClassification(source.classification);
    onTextChange(question.key, source.text ?? "");
  };

  const item = useSavedItem({
    itemKey: `answer:${validationId}:${question.key}`,
    method: "PUT",
    url: answerUrl(validationId, question.key),
    lockVersion: answer.lockVersion,
    isReadOnly,
    onSentElsewhere: () => {
      dirty.current = false;
      void queryClient.invalidateQueries({ queryKey: sectionQueryKey });
    },
    onSaved: (data) => {
      const saved = data as ValidationAnswer;
      known.current = { lockVersion: saved.lockVersion, text: saved.text ?? "" };
      serverClassification.current = saved.classification;
      // The server stores blank text as null.
      if ((saved.text ?? "") === (text.trim() === "" ? "" : text)) dirty.current = false;
      setClassification(saved.classification);
      writeBack({
        text: saved.text,
        classification: saved.classification,
        lockVersion: saved.lockVersion,
        updatedAt: saved.updatedAt,
      });
    },
    onAdopt: (current) => adopt({ ...(current.value as ValidationAnswer) }),
    onRestore: (patch) => {
      if (typeof patch.text === "string") {
        dirty.current = true;
        setText(patch.text);
        setClassification((prev) => withText(prev, patch.text as string));
        onTextChange(question.key, patch.text);
      }
      const choice = patch.classification as FauChange | undefined;
      if (choice) {
        setClassification((prev) => withChoice(prev, true, choice.fau, choice.confidence ?? null));
      }
    },
  });

  // A newer copy from a refetch replaces the field unless the person has unsent input in it. With
  // unsent input the old version stays, so the save reports the conflict instead of hiding it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: adopt and acknowledge only touch refs and setters
  useEffect(() => {
    if (answer.lockVersion <= known.current.lockVersion || dirty.current) return;
    adopt(answer);
    item.acknowledge(answer.lockVersion);
  }, [answer]);

  // A refused save is not queued any more: the screen goes back to what the server holds, and an
  // answer that lost its right to be saved (archived idea, changed role) is read again (SDD 8.2).
  const failure = item.failure;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to a new failure only
  useEffect(() => {
    if (!failure || failure.willRetry) return;
    setClassification(withText(serverClassification.current, text));
    const { code } = failure.error;
    if (code === "ARCHIVED" || code === "FORBIDDEN" || code === "NO_ACCESS") {
      void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
    }
  }, [failure]);

  const change = (next: string, delay?: number) => {
    dirty.current = true;
    setText(next);
    setClassification((prev) => withText(prev, next));
    onTextChange(question.key, next);
    item.save({ text: next }, { delay });
  };

  const choose = (choice: FauChange) => {
    setClassification((prev) =>
      withChoice(prev, text.trim() !== "", choice.fau, choice.confidence ?? null),
    );
    item.save(
      {
        classification:
          choice.fau === "assumption"
            ? { fau: "assumption", confidence: choice.confidence }
            : { fau: choice.fau },
      },
      { delay: 0 },
    );
  };

  const openEvidence = async () => {
    await item.flush();
    await autosave.idle();
    openModal("evidence", target);
  };

  const evidenceOpen = modal === "evidence" && about === target;
  const hasValue = text.trim() !== "";
  const choices = question.options?.kind === "choice" ? question.options.choices : null;
  const label = question.prompt;

  const field =
    question.answerType === "choice" && choices ? (
      <RadioGroup
        label={label}
        value={text || null}
        isReadOnly={isReadOnly}
        onChange={(value) => change(value, 0)}
      >
        {choices.map((choice) => (
          <Radio key={choice} value={choice}>
            {choice}
          </Radio>
        ))}
      </RadioGroup>
    ) : question.answerType === "short_text" ? (
      <TextField
        label={label}
        placeholder={t("form:placeholder")}
        value={text}
        maxLength={MAX_SHORT_TEXT}
        isReadOnly={isReadOnly}
        onChange={(value) => change(value)}
        onBlur={() => void item.flush()}
      />
    ) : (
      <TextArea
        label={label}
        placeholder={t("form:placeholder")}
        value={text}
        maxLength={MAX_LONG_TEXT}
        isReadOnly={isReadOnly}
        onChange={(value) => change(value)}
        onBlur={() => void item.flush()}
      />
    );

  const relatedResearch = classification.evidence.flatMap((evidence) =>
    evidence.researchLog && !evidence.researchLog.deleted ? [evidence.researchLog] : [],
  );

  return (
    <>
      <QuestionCard
        title={question.title}
        isFocused={isFocused || isOpenAll}
        autoScroll={!isOpenAll}
        answer={text}
        emptyLabel={t("form:empty")}
        status={question.hasFau ? <FauStatus classification={classification} /> : undefined}
        // The open card carries the count beside its Comments button; a compact one shows it alone.
        meta={
          isFocused || isOpenAll ? undefined : <CommentCountBadge count={answer.commentCount} />
        }
        actions={<ItemPanelButtons target={target} commentCount={answer.commentCount} />}
        onFocusRequest={onFocusRequest}
        onNavigate={onNavigate}
      >
        <Stack gap="space-200">
          {field}
          {failure ? (
            <SaveFailureNotice
              failure={failure}
              onRetry={() =>
                item.retry({
                  text,
                  ...(classification.fau
                    ? {
                        classification:
                          classification.fau === "assumption"
                            ? { fau: "assumption", confidence: classification.confidence }
                            : { fau: classification.fau },
                      }
                    : {}),
                })
              }
            />
          ) : null}
          {question.hasFau && !isReadOnly ? (
            <FauControl
              label={question.title}
              classification={classification}
              hasValue={hasValue}
              onChange={choose}
              onOpenEvidence={() => void openEvidence()}
            />
          ) : null}
          {question.example ? (
            <Disclosure title={t("form:example")} defaultExpanded headingLevel={2}>
              <Text variant="body-long">{question.example}</Text>
            </Disclosure>
          ) : null}
          {question.hint ? (
            <ContextualHelp label={t("form:hint")} title={t("form:hint")}>
              <Text>{question.hint}</Text>
            </ContextualHelp>
          ) : null}
          {question.hasFau && relatedResearch.length > 0 ? (
            <Disclosure
              title={t("form:relatedResearch", { count: relatedResearch.length })}
              headingLevel={2}
            >
              <Stack gap="space-50">
                {relatedResearch.map((log) => (
                  <Text key={log.id} variant="body-sm">
                    {log.observedOn ? `${formatDate(log.observedOn, me.timezone)} ` : ""}
                    {log.topic}
                  </Text>
                ))}
              </Stack>
            </Disclosure>
          ) : null}
        </Stack>
      </QuestionCard>
      {question.hasFau && !isReadOnly ? (
        <EvidenceSheet
          isOpen={evidenceOpen}
          onClose={closeModal}
          validationId={validationId}
          target={{ type: "validation_answer", id: validationId, key: question.key }}
          label={`${question.title} — ${question.prompt}`}
          classification={classification}
          getLockVersion={() => known.current.lockVersion}
          onConflict={() => void queryClient.invalidateQueries({ queryKey: sectionQueryKey })}
          onChanged={(result) => {
            known.current.lockVersion = result.lockVersion;
            serverClassification.current = result.classification;
            item.acknowledge(result.lockVersion);
            setClassification(result.classification);
            writeBack({ classification: result.classification, lockVersion: result.lockVersion });
          }}
        />
      ) : null}
      <ConflictDialog
        current={item.conflict}
        itemName={t("form:conflict.answer")}
        theirText={textOfCurrent(item.conflict)}
        mineText={typeof item.mine?.text === "string" ? item.mine.text : null}
        onLoadTheirs={item.loadTheirs}
        onKeepMine={item.keepMine}
      />
    </>
  );
}
