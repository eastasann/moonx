import {
  type Classification,
  type ConflictCurrent,
  MAX_LONG_TEXT,
  type ValidationAnswer,
} from "@moonx/schemas";
import { Button, Flex, Stack, Text, TextArea, Well } from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConflictDialog } from "../../components/ConflictDialog";
import { EvidenceSheet } from "../../components/EvidenceSheet";
import { type FauChange, FauControl, FauStatus } from "../../components/FauControl";
import { ItemPanelButtons } from "../../components/ItemPanelButtons";
import { autosave } from "../../lib/autosave";
import { type EconomicsData, economicsKey } from "../../lib/economics";
import { errorText } from "../../lib/error-text";
import { useOverlay } from "../../lib/overlay";
import { formatItemTarget } from "../../lib/panel-target";
import { hasText, withChoice, withText } from "../../lib/questions";
import { useSavedItem } from "../../lib/use-saved-item";

/** The long-text question of 18 (design-spec 6.4): answered through V3 like any validation answer. */
export const WORTH_QUESTION_KEY = "V.08.WORTH";

const textOfCurrent = (current: ConflictCurrent | null): string | null =>
  (current?.value as { text?: string | null } | undefined)?.text ?? null;

/**
 * `V.08.WORTH`, "Is the return worth the capital and effort?", with its F/A/U and evidence. It
 * saves as `answer:<validationId>:V.08.WORTH`, the same item the question form would use.
 */
export function WorthCard({
  validationId,
  answer,
  isReadOnly,
}: {
  validationId: string;
  answer: ValidationAnswer;
  isReadOnly: boolean;
}) {
  const { t } = useTranslation(["economics", "form", "validation", "app"]);
  const queryClient = useQueryClient();
  const { modal, about, openModal, closeModal } = useOverlay();
  const [text, setText] = useState(answer.text ?? "");
  const [classification, setClassification] = useState<Classification>(answer.classification);
  const known = useRef({ lockVersion: answer.lockVersion });
  const serverClassification = useRef<Classification>(answer.classification);
  const dirty = useRef(false);
  const queryKey = economicsKey(validationId);
  const target = formatItemTarget("validation_answer", validationId, WORTH_QUESTION_KEY);
  const question = t("economics:worth.question");

  const writeBack = (patch: Partial<ValidationAnswer>) =>
    queryClient.setQueryData<EconomicsData>(queryKey, (old) =>
      old ? { ...old, worth: { ...old.worth, ...patch } } : old,
    );

  const adopt = (source: ValidationAnswer) => {
    known.current = { lockVersion: source.lockVersion };
    serverClassification.current = source.classification;
    dirty.current = false;
    setText(source.text ?? "");
    setClassification(source.classification);
  };

  const saved = useSavedItem({
    itemKey: `answer:${validationId}:${WORTH_QUESTION_KEY}`,
    method: "PUT",
    url: `/api/v1/validations/${validationId}/answers/${encodeURIComponent(WORTH_QUESTION_KEY)}`,
    lockVersion: answer.lockVersion,
    isReadOnly,
    onSentElsewhere: () => {
      dirty.current = false;
      void queryClient.invalidateQueries({ queryKey });
    },
    onSaved: (data) => {
      const result = data as ValidationAnswer;
      known.current = { lockVersion: result.lockVersion };
      serverClassification.current = result.classification;
      // The server stores blank text as null.
      if ((result.text ?? "") === (text.trim() === "" ? "" : text)) dirty.current = false;
      setClassification(result.classification);
      writeBack({
        text: result.text,
        classification: result.classification,
        lockVersion: result.lockVersion,
        updatedAt: result.updatedAt,
      });
    },
    onAdopt: (current) => adopt(current.value as ValidationAnswer),
    onRestore: (patch) => {
      if (typeof patch.text === "string") {
        dirty.current = true;
        setText(patch.text);
        setClassification((prev) => withText(prev, patch.text as string));
      }
      const choice = patch.classification as FauChange | undefined;
      if (choice) {
        setClassification((prev) => withChoice(prev, true, choice.fau, choice.confidence ?? null));
      }
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: adopt and acknowledge only touch refs and setters
  useEffect(() => {
    if (answer.lockVersion <= known.current.lockVersion || dirty.current) return;
    adopt(answer);
    saved.acknowledge(answer.lockVersion);
  }, [answer]);

  const failure = saved.failure;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to a new failure only
  useEffect(() => {
    if (!failure || failure.willRetry) return;
    setClassification(withText(serverClassification.current, text));
  }, [failure]);

  const change = (next: string) => {
    dirty.current = true;
    setText(next);
    setClassification((prev) => withText(prev, next));
    saved.save({ text: next });
  };

  const choose = (choice: FauChange) => {
    setClassification((prev) =>
      withChoice(prev, hasText(text), choice.fau, choice.confidence ?? null),
    );
    saved.save(
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
    await saved.flush();
    await autosave.idle();
    openModal("evidence", target);
  };

  const evidenceOpen = modal === "evidence" && about === target;

  if (isReadOnly) {
    return (
      <Well aria-label={question}>
        <Stack gap="space-100">
          <Text variant="label">{question}</Text>
          {hasText(text) ? (
            <Text variant="body-long">{text}</Text>
          ) : (
            <Text tone="secondary">{t("form:empty")}</Text>
          )}
          <FauStatus classification={classification} />
          <ItemPanelButtons target={target} commentCount={answer.commentCount} />
        </Stack>
      </Well>
    );
  }

  return (
    <Well aria-label={question}>
      <Stack gap="space-200">
        <TextArea
          label={question}
          placeholder={t("form:placeholder")}
          value={text}
          maxLength={MAX_LONG_TEXT}
          onChange={change}
          onBlur={() => void saved.flush()}
        />
        {failure ? (
          <Flex gap="space-100" align="center" wrap>
            <Text tone="negative" as="span">
              {failure.willRetry ? t("form:saveFailed") : errorText(t, failure.error)}
            </Text>
            <Button
              variant="secondary"
              size="S"
              onPress={() =>
                saved.retry({
                  text,
                  ...(classification.fau && classification.fau !== "fact"
                    ? {
                        classification:
                          classification.fau === "assumption"
                            ? { fau: "assumption", confidence: classification.confidence }
                            : { fau: classification.fau },
                      }
                    : {}),
                })
              }
            >
              {t("form:retry")}
            </Button>
          </Flex>
        ) : null}
        <FauStatus classification={classification} />
        <FauControl
          label={question}
          classification={classification}
          hasValue={hasText(text)}
          onChange={choose}
          onOpenEvidence={() => void openEvidence()}
        />
        <ItemPanelButtons target={target} commentCount={answer.commentCount} />
      </Stack>
      {evidenceOpen ? (
        <EvidenceSheet
          isOpen
          onClose={closeModal}
          validationId={validationId}
          target={{ type: "validation_answer", id: validationId, key: WORTH_QUESTION_KEY }}
          label={question}
          classification={classification}
          getLockVersion={() => known.current.lockVersion}
          onConflict={() => void queryClient.invalidateQueries({ queryKey })}
          onChanged={(result) => {
            known.current = { lockVersion: result.lockVersion };
            serverClassification.current = result.classification;
            saved.acknowledge(result.lockVersion);
            setClassification(result.classification);
            writeBack({ classification: result.classification, lockVersion: result.lockVersion });
          }}
        />
      ) : null}
      <ConflictDialog
        current={saved.conflict}
        itemName={t("form:conflict.answer")}
        theirText={textOfCurrent(saved.conflict)}
        mineText={typeof saved.mine?.text === "string" ? saved.mine.text : null}
        onLoadTheirs={saved.loadTheirs}
        onKeepMine={saved.keepMine}
      />
    </Well>
  );
}
