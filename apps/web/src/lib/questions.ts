import { deriveFauState } from "@moonx/domain";
import type { Classification, TemplateQuestion } from "@moonx/schemas";

/** The sections of a validation in the order of the Next / Previous buttons (design-spec 6.2). */
export const VALIDATION_SECTION_ORDER = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06-08",
  "09",
  "10",
] as const;
export type ValidationSectionKey = (typeof VALIDATION_SECTION_ORDER)[number];

/** The sections the question form shows; the others have their own screens. */
export const QUESTION_FORM_SECTIONS: readonly string[] = ["01", "02", "10"];

/** Where a section opens on the Web (SDD 4), relative to the idea's path. */
export function sectionPath(section: string): string {
  switch (section) {
    case "03":
      return "/research";
    case "04":
      return "/competitors";
    case "05":
      return "/costs";
    case "06-08":
      return "/economics";
    case "09":
      return "/assumptions";
    default:
      return `/questions/${section}`;
  }
}

/** The neighbours of a section in the validation's order, or null at either end. */
export function neighbourSections(section: string): {
  previous: string | null;
  next: string | null;
} {
  const index = VALIDATION_SECTION_ORDER.indexOf(section as ValidationSectionKey);
  return {
    previous: VALIDATION_SECTION_ORDER[index - 1] ?? null,
    next: VALIDATION_SECTION_ORDER[index + 1] ?? null,
  };
}

/** What the form knows about one question's answer while it is edited. */
export interface AnswerDraft {
  text: string | null;
  /** The server's `hidden`: a template migration or the OCEAN choice hid the question. */
  hidden: boolean;
}

/**
 * Whether the question shows. A question with a display condition follows the current answers
 * (so answering OCEAN opens its questions before the save returns); one without follows the
 * server's `hidden`, which also covers questions a template migration hid (design-spec 6.2).
 */
export function isQuestionVisible(
  question: Pick<TemplateQuestion, "displayCondition">,
  serverHidden: boolean,
  textOf: (questionKey: string) => string | null,
): boolean {
  const condition = question.displayCondition;
  if (!condition) return !serverHidden;
  return Object.entries(condition).every(([key, allowed]) => {
    const text = textOf(key);
    return text !== null && allowed.includes(text);
  });
}

export const hasText = (text: string | null | undefined): text is string =>
  text !== null && text !== undefined && text.trim() !== "";

/** A question counts as answered with a text or with Unknown (design-spec 6.1 "進み具合"). */
export function isAnswered(text: string | null, classification: Classification): boolean {
  return hasText(text) || classification.fau === "unknown";
}

const activeEvidence = (classification: Classification) =>
  classification.evidence.filter((evidence) => !evidence.researchLog?.deleted).length;

/**
 * The classification the screen shows before the server's answer arrives. It follows the rules
 * the API applies (design-spec 6.0.3): no value clears Fact and Assumption, Unknown stays, and the
 * state comes from the same `deriveFauState` the API uses.
 */
export function withText(prev: Classification, text: string): Classification {
  const hasValue = hasText(text);
  const keep = hasValue || prev.fau === "unknown";
  const fau = keep ? prev.fau : null;
  const confidence = keep ? prev.confidence : null;
  return {
    ...prev,
    fau,
    confidence,
    state: deriveFauState({ hasValue, fau, confidence, activeEvidenceCount: activeEvidence(prev) }),
  };
}

/** The classification after the person picked a F/A/U button or a confidence. */
export function withChoice(
  prev: Classification,
  hasValue: boolean,
  fau: Classification["fau"],
  confidence: Classification["confidence"],
): Classification {
  return {
    ...prev,
    fau,
    confidence: fau === "assumption" ? confidence : null,
    state: deriveFauState({
      hasValue,
      fau,
      confidence: fau === "assumption" ? confidence : null,
      activeEvidenceCount: activeEvidence(prev),
    }),
  };
}
