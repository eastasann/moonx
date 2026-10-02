import { formatDate } from "@moonx/i18n";
import { MAX_LONG_TEXT, MAX_SHORT_TEXT, type TemplateQuestion } from "@moonx/schemas";
import { QuestionCard, Radio, RadioGroup, Stack, Text, TextArea, TextField } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { ConflictDialog } from "../../components/ConflictDialog";
import { ItemPanelButtons } from "../../components/ItemPanelButtons";
import { formatItemTarget } from "../../lib/panel-target";
import type { PlanAnswer } from "../../lib/plans";
import { useMe } from "../../lib/session";
import { ExampleAndHint, SaveFailure } from "./SubItemParts";
import { usePlanAnswer } from "./usePlanAnswer";

export interface SubItemProps {
  planId: string;
  question: TemplateQuestion;
  answer: PlanAnswer;
  /** A Viewer, an archived plan or idea, or a saved version: the answer is shown, not edited. */
  isReadOnly: boolean;
  /** A saved version has no comments or history of its own to open. */
  hasPanels: boolean;
  isFocused: boolean;
  isOpenAll: boolean;
  onFocusRequest: () => void;
  onNavigate: (direction: "previous" | "next") => void;
  /** Writes the server's copy into the screen's caches and marks the plan's other screens stale. */
  onSaved: (saved: PlanAnswer) => void;
}

const draftOfText = (answer: PlanAnswer) => answer.text ?? "";

/**
 * A text sub-item (long text, short text or a choice): the answer with its Example, saved by
 * the autosave rules (1 second after typing, on leaving the field, on leaving the screen; a
 * choice saves when picked). Plans have no F/A/U. An answer drafted from the validation says so.
 */
export function TextSubItem({
  planId,
  question,
  answer,
  isReadOnly,
  hasPanels,
  isFocused,
  isOpenAll,
  onFocusRequest,
  onNavigate,
  onSaved,
}: SubItemProps) {
  const { t } = useTranslation(["planItem", "form"]);
  const me = useMe();
  const editor = usePlanAnswer<string>({
    planId,
    answer,
    isReadOnly,
    initial: draftOfText,
    body: (text) => ({ text }),
    // The server stores blank text as null.
    matches: (text, saved) => (saved.text ?? "") === (text.trim() === "" ? "" : text),
    restore: (patch) => (typeof patch.text === "string" ? patch.text : null),
    onSaved,
  });
  const { draft: text, item } = editor;
  const choices = question.options?.kind === "choice" ? question.options.choices : null;
  const label = question.prompt;

  const field =
    question.answerType === "choice" && choices ? (
      <RadioGroup
        label={label}
        value={text || null}
        isReadOnly={isReadOnly}
        onChange={(value) => editor.change(value, { delay: 0 })}
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
        onChange={(value) => editor.change(value)}
        onBlur={() => void editor.flush()}
      />
    ) : (
      <TextArea
        label={label}
        placeholder={t("form:placeholder")}
        value={text}
        maxLength={MAX_LONG_TEXT}
        isReadOnly={isReadOnly}
        onChange={(value) => editor.change(value)}
        onBlur={() => void editor.flush()}
      />
    );

  return (
    <>
      <QuestionCard
        title={question.title}
        isFocused={isFocused || isOpenAll}
        autoScroll={!isOpenAll}
        answer={text}
        emptyLabel={t("form:empty")}
        actions={
          hasPanels ? (
            <ItemPanelButtons
              target={formatItemTarget("plan_answer", planId, question.key)}
              commentCount={answer.commentCount}
            />
          ) : null
        }
        onFocusRequest={onFocusRequest}
        onNavigate={onNavigate}
      >
        <Stack gap="space-200">
          {field}
          <SaveFailure item={item} resend={() => ({ text })} />
          {answer.copiedFrom ? (
            <Text variant="caption" tone="secondary">
              {t("planItem:copiedFrom", {
                date: formatDate(answer.copiedFrom.copiedAt, me.timezone),
              })}
            </Text>
          ) : null}
          <ExampleAndHint question={question} />
        </Stack>
      </QuestionCard>
      <ConflictDialog
        current={item.conflict}
        itemName={t("form:conflict.answer")}
        theirText={(item.conflict?.value as { text?: string | null } | undefined)?.text ?? null}
        mineText={typeof item.mine?.text === "string" ? item.mine.text : null}
        onLoadTheirs={item.loadTheirs}
        onKeepMine={item.keepMine}
      />
    </>
  );
}
