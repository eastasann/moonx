import { createContext } from "react";

/**
 * Inside a focused or open QuestionCard: a TextArea there is the answer and takes the
 * answer's look (s11-form.html .answer, design-spec 6.2).
 */
export const AnswerFieldContext = createContext(false);
