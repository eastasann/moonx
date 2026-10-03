import type { TemplateQuestion, ValidationAnswer } from "@moonx/schemas";
import { Skeleton, Stack } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { QueryBoundary } from "../../components/states";
import { focusKeyedField } from "../../lib/focus";
import { sectionQuery } from "../../lib/idea-detail";
import { FAILURE_PATTERNS_KEY, SURVIVOR_PATTERNS_KEY } from "../../lib/research";
import { sectionKey } from "../../lib/validation-keys";
import { AnswerCard } from "../questions/AnswerCard";

const noop = () => {};

/**
 * The two questions under the competitor cards (design-spec 6.10): Survivor Patterns and Failure
 * Patterns, long answers with F/A/U. They are the validation's answers `V.04.*`, saved through V3
 * like any answer of the question form; the competitors query holds them as `answers`. Their
 * headings are the titles the template of the validation gives them (read with V2 for section 04),
 * so a title edited on screen 27 shows here.
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
  const template = useQuery(sectionQuery(validationId, "04", sectionKey(validationId, "04")));

  return (
    <QueryBoundary query={template} skeleton={<Skeleton shape="block" height="space-1000" />}>
      {({ section }) => (
        <PatternList focusKey={focusKey}>
          {[SURVIVOR_PATTERNS_KEY, FAILURE_PATTERNS_KEY].map((key) => {
            const answer = answers.find((a) => a.questionKey === key);
            const templateQuestion = section.questions.find((q) => q.key === key);
            if (!answer || !templateQuestion) return null;
            return (
              <div key={key} data-focus-key={key}>
                <AnswerCard
                  validationId={validationId}
                  question={heading(templateQuestion)}
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
        </PatternList>
      )}
    </QueryBoundary>
  );
}

/** Puts the cursor in the question `?q=` names once the fields exist. */
function PatternList({ focusKey, children }: { focusKey?: string; children: ReactNode }) {
  useEffect(() => {
    if (focusKey) focusKeyedField(focusKey);
  }, [focusKey]);
  return <Stack gap="space-300">{children}</Stack>;
}

/** The template's title for both the heading and the field; its prompt, EXAMPLE and hint stay off this screen. */
function heading(question: TemplateQuestion): TemplateQuestion {
  return { ...question, prompt: question.title, example: null, hint: null };
}
