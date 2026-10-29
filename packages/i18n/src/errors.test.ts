import { expect, test } from "bun:test";
import { type ErrorCode, errorCodeSchema } from "@moonx/schemas";
import { resources } from "./i18n";

// The words of an API error come from `errors:<CODE>` (SDD 8.2「業務の決まり」・9章), one
// screen's own words under `errors:<CODE>_<context>`. The codes below are the ones SDD
// 8.2「`errors:` に文言を持たないコード」 names, in its three groups.

/**
 * Shown by another row of SDD 8.2, with that row's words: an input check (`errors:input.*`),
 * the conflict question (design-spec 6.0.2), M9 or the sign-in screen, "You don't have
 * access to this" (NOT_SHARED too: design-spec 6.11), "Not found", the archived display,
 * and the network's or the unexpected failure's states. A screen that design-spec gives
 * its own words for one of them still puts them under a context.
 */
const shownByAnotherRow = [
  "VALIDATION_FAILED",
  "OUT_OF_RANGE",
  "CONFLICT",
  "CONFLICT_MULTI",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NO_ACCESS",
  "NOT_SHARED",
  "NOT_FOUND",
  "ARCHIVED",
  "BAD_REQUEST",
  "INTERNAL",
  "UPSTREAM_UNAVAILABLE",
] as const satisfies readonly ErrorCode[];

/** Answered by changing the screen, without words (design-spec 6.16 2・4). */
const answeredWithoutWords = [
  "EMAIL_TAKEN",
  "PASSWORD_ALREADY_SET",
] as const satisfies readonly ErrorCode[];

/**
 * Kept from being sent by the screens, so that one coming back is unexpected (SDD 8.2
 * 「ふつうは返らないコード」): Leave is not offered on the own personal workspace, Fact
 * only with evidence (M2), a confidence before an Assumption is sent, choices, statuses,
 * assignees and percent rows only from what the screen offers, no field for what is not
 * editable, Reply only under a thread's first comment, and 27's question ID checked by
 * its input rule.
 */
const keptFromBeingSent = [
  "CANNOT_LEAVE_PERSONAL",
  "FACT_REQUIRES_EVIDENCE",
  "CONFIDENCE_REQUIRED",
  "INVALID_CHOICE",
  "PERCENT_ONLY_FOR_VARIABLE",
  "NOT_EDITABLE",
  "INVALID_ASSIGNEE",
  "INVALID_STATUS",
  "REPLY_DEPTH",
  "INVALID_QUESTION_KEY",
] as const satisfies readonly ErrorCode[];

const errors: Record<string, unknown> = resources.en.errors;

/**
 * Whether `errors:` holds words for the code, as itself or under a context: a context is
 * camelCase, so CONFLICT does not take the words of a CONFLICT_MULTI.
 */
const hasWords = (code: string) =>
  Object.entries(errors).some(
    ([key, value]) =>
      typeof value === "string" &&
      value !== "" &&
      (key === code || new RegExp(`^${code}_[a-z]`).test(key)),
  );

test("every code of SDD 8.1 has its words under errors:, but those 8.2 names", () => {
  const without = new Set<string>([
    ...shownByAnotherRow,
    ...answeredWithoutWords,
    ...keptFromBeingSent,
  ]);
  const missing = errorCodeSchema.options.filter(
    (code) => !without.has(code) && !hasWords(code),
  );
  expect(missing).toEqual([]);
});

test("a code with no words of its own has none under errors: either", () => {
  const worded = [...answeredWithoutWords, ...keptFromBeingSent].filter(
    hasWords,
  );
  expect(worded).toEqual([]);
});

test("a code shown by another row has no words of its own: only a screen's, under a context", () => {
  const bare = shownByAnotherRow.filter((code) => code in errors);
  expect(bare).toEqual([]);
});

test("each code is in one group at most", () => {
  const listed = [
    ...shownByAnotherRow,
    ...answeredWithoutWords,
    ...keptFromBeingSent,
  ];
  expect(new Set(listed).size).toBe(listed.length);
});
