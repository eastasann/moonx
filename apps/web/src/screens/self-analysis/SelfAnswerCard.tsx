import { formatMoney, moneyInputFormat } from "@moonx/i18n";
import {
  type ConflictCurrent,
  MAX_LONG_TEXT,
  MAX_SHORT_TEXT,
  type TemplateQuestion,
} from "@moonx/schemas";
import {
  Button,
  ContextualHelp,
  Disclosure,
  Flex,
  NumberField,
  QuestionCard,
  Radio,
  RadioGroup,
  Stack,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConflictDialog } from "../../components/ConflictDialog";
import { ItemPanelButtons } from "../../components/ItemPanelButtons";
import { errorText } from "../../lib/error-text";
import { readNumberText } from "../../lib/number-input";
import { formatItemTarget } from "../../lib/panel-target";
import { hasText } from "../../lib/questions";
import { type SelfAnalysisAnswer, sectionKey as sectionQueryKey } from "../../lib/self-analysis";
import { useSavedItem } from "../../lib/use-saved-item";

const MAX_AMOUNT = 1e12;

export interface SelfAnswerCardProps {
  analysisId: string;
  sectionKey: string;
  currency: string;
  question: TemplateQuestion;
  answer: SelfAnalysisAnswer;
  isFocused: boolean;
  isOpenAll: boolean;
  onFocusRequest: () => void;
  onNavigate: (direction: "previous" | "next") => void;
}

const answerUrl = (questionKey: string) =>
  `/api/v1/me/self-analysis/answers/${encodeURIComponent(questionKey)}`;

/** An amount and its reason as one line; whichever of the two is missing is left out. */
function amountLine(t: TFunction, amount: string | null, reason: string | null): string | null {
  if (amount !== null && hasText(reason)) {
    return t("selfAnalysis:form.preview", { amount, reason });
  }
  return amount ?? (hasText(reason) ? reason : null);
}

/** The other copy as text for the conflict dialog. */
function textOfCurrent(t: TFunction, current: ConflictCurrent | null): string | null {
  const value = current?.value as Pick<SelfAnalysisAnswer, "text" | "amount"> | undefined;
  if (!value) return null;
  return amountLine(t, value.amount === null ? null : String(value.amount), value.text);
}

/**
 * One question of the self analysis form (design-spec 6.2): no F/A/U, and an amount with a
 * reason for the money questions. The answer is saved by the autosave rules; a choice saves when
 * pressed. Only the owner opens this, so there is no read-only form.
 */
export function SelfAnswerCard({
  analysisId,
  sectionKey,
  currency,
  question,
  answer,
  isFocused,
  isOpenAll,
  onFocusRequest,
  onNavigate,
}: SelfAnswerCardProps) {
  const { t } = useTranslation(["selfAnalysis", "form"]);
  const queryClient = useQueryClient();
  const [text, setText] = useState(answer.text ?? "");
  const [amount, setAmount] = useState<number | null>(answer.amount);
  const [amountProblem, setAmountProblem] = useState(false);
  const [revision, setRevision] = useState(0);
  const known = useRef({ lockVersion: answer.lockVersion });
  const dirty = useRef(false);
  const queryKey = sectionQueryKey(sectionKey);
  const target = formatItemTarget("self_analysis_answer", analysisId, question.key);
  const withAmount = question.answerType === "amount_with_reason";

  const writeBack = (patch: Partial<SelfAnalysisAnswer>) =>
    queryClient.setQueryData<{ answers: SelfAnalysisAnswer[] }>(queryKey, (old) =>
      old
        ? {
            ...old,
            answers: old.answers.map((a) =>
              a.questionKey === question.key ? { ...a, ...patch } : a,
            ),
          }
        : old,
    );

  const adopt = (source: Pick<SelfAnalysisAnswer, "text" | "amount" | "lockVersion">) => {
    known.current = { lockVersion: source.lockVersion };
    dirty.current = false;
    setText(source.text ?? "");
    setAmount(source.amount);
    setAmountProblem(false);
    setRevision((n) => n + 1);
  };

  const item = useSavedItem({
    itemKey: `self-answer:${question.key}`,
    method: "PUT",
    url: answerUrl(question.key),
    lockVersion: answer.lockVersion,
    onSentElsewhere: () => {
      dirty.current = false;
      void queryClient.invalidateQueries({ queryKey });
    },
    onSaved: (data) => {
      const saved = data as SelfAnalysisAnswer;
      known.current = { lockVersion: saved.lockVersion };
      // The server stores blank text as null.
      if ((saved.text ?? "") === (text.trim() === "" ? "" : text) && saved.amount === amount) {
        dirty.current = false;
      }
      writeBack({
        text: saved.text,
        amount: saved.amount,
        lockVersion: saved.lockVersion,
        updatedAt: saved.updatedAt,
        updatedBy: saved.updatedBy,
      });
    },
    onAdopt: (current) => adopt({ ...(current.value as SelfAnalysisAnswer) }),
    onRestore: (patch) => {
      dirty.current = true;
      if (typeof patch.text === "string") setText(patch.text);
      if (typeof patch.amount === "number" || patch.amount === null) {
        setAmount(patch.amount as number | null);
        setRevision((n) => n + 1);
      }
    },
  });

  // A newer copy from a refetch replaces the field unless the person has unsent input in it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: adopt and acknowledge only touch refs and setters
  useEffect(() => {
    if (answer.lockVersion <= known.current.lockVersion || dirty.current) return;
    adopt(answer);
    item.acknowledge(answer.lockVersion);
  }, [answer]);

  const change = (next: string, delay?: number) => {
    dirty.current = true;
    setText(next);
    item.save({ text: next }, { delay });
  };

  const changeAmount = (input: string) => {
    const reading = readNumberText(input);
    if (reading.kind === "partial") return;
    if (reading.kind === "empty") {
      dirty.current = true;
      setAmount(null);
      setAmountProblem(false);
      item.save({ amount: null });
      return;
    }
    if (reading.value < 0 || reading.value > MAX_AMOUNT) {
      setAmountProblem(true);
      return;
    }
    dirty.current = true;
    setAmount(reading.value);
    setAmountProblem(false);
    item.save({ amount: reading.value });
  };

  const choices = question.options?.kind === "choice" ? question.options.choices : null;
  const failure = item.failure;
  const preview = withAmount
    ? amountLine(t, amount === null ? null : formatMoney(amount, currency), text)
    : text;
  const commentTotal = answer.commentCounts.reduce((sum, entry) => sum + entry.count, 0);

  const reasonField = (
    <TextArea
      label={withAmount ? t("selfAnalysis:form.reason") : question.prompt}
      placeholder={t("form:placeholder")}
      value={text}
      maxLength={MAX_LONG_TEXT}
      onChange={(value) => change(value)}
      onBlur={() => void item.flush()}
    />
  );

  const field = withAmount ? (
    <Stack gap="space-200">
      <Text>{question.prompt}</Text>
      <NumberField
        key={`${question.key}:${revision}`}
        label={t("selfAnalysis:form.amount")}
        defaultValue={amount ?? Number.NaN}
        formatOptions={moneyInputFormat(currency)}
        isInvalid={amountProblem}
        errorMessage={t("selfAnalysis:form.amountRange")}
        onInputChange={changeAmount}
        onBlur={() => void item.flush()}
      />
      {reasonField}
    </Stack>
  ) : question.answerType === "choice" && choices ? (
    <RadioGroup label={question.prompt} value={text || null} onChange={(value) => change(value, 0)}>
      {choices.map((choice) => (
        <Radio key={choice} value={choice}>
          {choice}
        </Radio>
      ))}
    </RadioGroup>
  ) : question.answerType === "short_text" ? (
    <TextField
      label={question.prompt}
      placeholder={t("form:placeholder")}
      value={text}
      maxLength={MAX_SHORT_TEXT}
      onChange={(value) => change(value)}
      onBlur={() => void item.flush()}
    />
  ) : (
    reasonField
  );

  return (
    <>
      <QuestionCard
        title={question.title}
        isFocused={isFocused || isOpenAll}
        autoScroll={!isOpenAll}
        answer={preview ?? undefined}
        emptyLabel={t("form:empty")}
        actions={<ItemPanelButtons target={target} commentCount={commentTotal} />}
        onFocusRequest={onFocusRequest}
        onNavigate={onNavigate}
      >
        <Stack gap="space-200">
          {field}
          {failure ? (
            <Flex gap="space-100" align="center" wrap>
              <Text tone="negative" as="span">
                {failure.willRetry
                  ? t("selfAnalysis:form.answerFailed")
                  : errorText(t, failure.error)}
              </Text>
              <Button
                variant="secondary"
                size="S"
                onPress={() => item.retry({ text, ...(withAmount ? { amount } : {}) })}
              >
                {t("form:retry")}
              </Button>
            </Flex>
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
        </Stack>
      </QuestionCard>
      <ConflictDialog
        current={item.conflict}
        itemName={t("selfAnalysis:form.conflictItem")}
        theirText={textOfCurrent(t, item.conflict)}
        mineText={typeof item.mine?.text === "string" ? item.mine.text : null}
        onLoadTheirs={item.loadTheirs}
        onKeepMine={item.keepMine}
      />
    </>
  );
}
