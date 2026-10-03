import { formatMoney, formatRelativeTime } from "@moonx/i18n";
import {
  Checkbox,
  DiffColumns,
  DiffText,
  Disclosure,
  Heading,
  InlineAlert,
  Radio,
  RadioGroup,
  Stack,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type EvidenceResult, EvidenceSheet } from "../../components/EvidenceSheet";
import { FauControl, FauStatus } from "../../components/FauControl";
import {
  choicesOf,
  importedClassification,
  isAmountQuestion,
  keptEvidence,
  type ReviewDraft,
  type ReviewEntry,
} from "../../lib/ai-review";
import { useMe } from "../../lib/session";
import { diffText } from "../../lib/text-diff";

export interface ReviewEntryCardProps {
  entry: ReviewEntry;
  currency: string | null;
  /** Someone saved this answer after the import was opened. */
  updatedAfterLoad: boolean;
  /** The validation the answer belongs to; M2 attaches evidence to it. */
  validationId: string;
  onDraft: (patch: Partial<ReviewDraft>) => void;
  /** M2 attached or removed evidence: the screen takes the new classification and version of the answer. */
  onEvidenceChanged: (result: EvidenceResult) => void;
  /** Someone saved the answer while M2 was open: the screen reads it again. */
  onEvidenceConflict: () => void;
}

/** "just now" for the first minute, then how long ago. */
function useWhen() {
  const { t } = useTranslation("ai");
  const me = useMe();
  return (updatedAt: string | null) => {
    const now = new Date();
    return updatedAt === null || now.getTime() - new Date(updatedAt).getTime() < 60_000
      ? t("import.review.justNow")
      : formatRelativeTime(updatedAt, now, me.timezone);
  };
}

/**
 * One question of the Review step (design-spec 6.7 ③): the answer now beside the imported one,
 * with the changed characters marked. The imported side is editable; in a validation it also
 * shows the F/A/U the answer will have, which the person can set again here.
 */
export function ReviewEntryCard({
  entry,
  currency,
  updatedAfterLoad,
  validationId,
  onDraft,
  onEvidenceChanged,
  onEvidenceConflict,
}: ReviewEntryCardProps) {
  const { t } = useTranslation(["ai", "form"]);
  const when = useWhen();
  const [factBlocked, setFactBlocked] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const { question, draft, evaluation } = entry;
  const amountQuestion = isAmountQuestion(question);
  const currentText = question.current.text ?? "";
  const segments = diffText(currentText, draft.text);
  const classification = importedClassification(question, draft, evaluation);
  const choices = choicesOf(question);
  const { updatedBy, updatedAt } = question.current;
  const empty = t("import.review.empty");

  const errorFor = (kind: "amount" | "choice" | "tooLong") =>
    evaluation.error === kind
      ? kind === "amount"
        ? t("import.review.amountError")
        : kind === "choice"
          ? t("import.review.choiceError", { choices: choices.join(", ") })
          : t("import.review.tooLong")
      : undefined;

  const label = amountQuestion ? t("import.review.reason") : question.title;
  const field =
    question.answerType === "choice" ? (
      <RadioGroup
        label={question.title}
        value={choices.includes(evaluation.text ?? "") ? evaluation.text : null}
        isInvalid={evaluation.error === "choice"}
        errorMessage={errorFor("choice")}
        onChange={(value) => onDraft({ text: value })}
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
        value={draft.text}
        isInvalid={evaluation.error === "tooLong"}
        errorMessage={errorFor("tooLong")}
        onChange={(text) => onDraft({ text })}
      />
    ) : (
      <TextArea
        label={label}
        value={draft.text}
        isInvalid={evaluation.error === "tooLong"}
        errorMessage={errorFor("tooLong")}
        onChange={(text) => onDraft({ text })}
      />
    );

  const before = (
    <Stack gap="space-100">
      <Heading level={4}>{t("import.review.current")}</Heading>
      {amountQuestion ? (
        <Text>
          {t("import.review.amount")}:{" "}
          {question.current.amount === null || currency === null
            ? empty
            : formatMoney(question.current.amount, currency)}
        </Text>
      ) : null}
      {currentText === "" && draft.text === "" ? (
        <Text tone="secondary">{empty}</Text>
      ) : (
        <DiffText segments={segments} side="before" />
      )}
      {question.current.classification ? (
        <FauStatus classification={question.current.classification} />
      ) : null}
      {updatedAfterLoad ? (
        <Text variant="caption" tone="secondary">
          {updatedBy
            ? t("import.review.updatedBy", { name: updatedBy.displayName, when: when(updatedAt) })
            : t("import.review.updatedByUnknown", { when: when(updatedAt) })}
        </Text>
      ) : null}
    </Stack>
  );

  const after = (
    <Stack gap="space-200">
      <Heading level={4}>{t("import.review.imported")}</Heading>
      {amountQuestion ? (
        <TextField
          label={t("import.review.amount")}
          inputMode="decimal"
          value={draft.amount}
          isInvalid={evaluation.error === "amount"}
          errorMessage={errorFor("amount")}
          onChange={(amount) => onDraft({ amount })}
        />
      ) : null}
      {field}
      {segments.some((s) => s.kind !== "same") ? (
        <Disclosure title={t("import.review.changes")} defaultExpanded headingLevel={4}>
          <DiffText segments={segments} side="after" />
        </Disclosure>
      ) : null}
      {classification ? (
        <Stack gap="space-100">
          <FauControl
            label={question.title}
            classification={classification}
            hasValue={evaluation.text !== null}
            onChange={(choice) => {
              setFactBlocked(false);
              onDraft({ fau: choice.fau === null ? null : choice });
            }}
            onOpenEvidence={() => {
              if (keptEvidence(question) > 0) {
                setFactBlocked(false);
                onDraft({ fau: { fau: "fact" } });
              } else if (currentText.trim() === "") {
                setFactBlocked(true);
              } else {
                setFactBlocked(false);
                setEvidenceOpen(true);
              }
            }}
          />
          {factBlocked ? (
            <InlineAlert variant="notice" heading={t("import.review.factNeedsEvidence")} />
          ) : null}
          {draft.fau === null && question.current.classification?.fau ? (
            <Text variant="caption" tone="secondary">
              {t("import.review.fauReset")}
            </Text>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );

  return (
    <Stack gap="space-200">
      <Checkbox
        isSelected={draft.include}
        description={question.questionKey}
        onChange={(include) => onDraft({ include })}
      >
        {question.title}
      </Checkbox>
      <DiffColumns before={before} after={after} />
      {question.current.classification ? (
        <EvidenceSheet
          isOpen={evidenceOpen}
          onClose={() => setEvidenceOpen(false)}
          validationId={validationId}
          target={{ type: "validation_answer", id: validationId, key: question.questionKey }}
          label={`${question.questionKey} ${question.title}`}
          classification={question.current.classification}
          getLockVersion={() => question.current.lockVersion}
          onConflict={onEvidenceConflict}
          onChanged={(result) => {
            onEvidenceChanged(result);
            // M2 makes the stored answer Fact; the import keeps that only if asked, so the choice follows.
            if (result.classification.evidence.some((e) => !e.researchLog?.deleted)) {
              onDraft({ fau: { fau: "fact" } });
            }
          }}
        />
      ) : null}
    </Stack>
  );
}
