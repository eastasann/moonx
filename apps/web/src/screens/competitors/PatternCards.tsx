import type { TemplateQuestion, ValidationAnswer } from "@moonx/schemas";
import { Stack } from "@moonx/ui-web";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { focusKeyedField } from "../../lib/focus";
import { FAILURE_PATTERNS_KEY, SURVIVOR_PATTERNS_KEY } from "../../lib/research";
import { AnswerCard } from "../questions/AnswerCard";

const noop = () => {};

/**
 * The two questions under the competitor cards (design-spec 6.10): Survivor Patterns and Failure
 * Patterns, long answers with F/A/U. They are the validation's answers `V.04.*`, saved through V3
 * like any answer of the question form; the competitors query holds them as `answers`.
 */
export function PatternCards({
  validationId,
  answers,
  queryKey,
  isReadOnly,
  focusKey,
}: {
  validationId: string;
  answers: readonly ValidationAnswer[];
  /** The query that holds `answers`, which a saved answer is written back into. */
  queryKey: readonly unknown[];
  isReadOnly: boolean;
  /** `?q=`: the question to put the cursor in. */
  focusKey?: string;
}) {
  const { t } = useTranslation("research");
  const questions: TemplateQuestion[] = [
    pattern(SURVIVOR_PATTERNS_KEY, t("research:competitors.patterns.survivor")),
    pattern(FAILURE_PATTERNS_KEY, t("research:competitors.patterns.failure")),
  ];

  useEffect(() => {
    if (focusKey) focusKeyedField(focusKey);
  }, [focusKey]);

  return (
    <Stack gap="space-300">
      {questions.map((question) => {
        const answer = answers.find((a) => a.questionKey === question.key);
        if (!answer) return null;
        return (
          <div key={question.key} data-focus-key={question.key}>
            <AnswerCard
              validationId={validationId}
              question={question}
              answer={answer}
              sectionQueryKey={queryKey}
              isReadOnly={isReadOnly}
              isFocused
              isOpenAll
              onFocusRequest={noop}
              onNavigate={noop}
              onTextChange={noop}
            />
          </div>
        );
      })}
    </Stack>
  );
}

function pattern(key: string, title: string): TemplateQuestion {
  return {
    key,
    sectionKey: "04",
    title,
    prompt: title,
    example: null,
    hint: null,
    answerType: "long_text",
    options: null,
    displayCondition: null,
    hasFau: true,
  };
}
