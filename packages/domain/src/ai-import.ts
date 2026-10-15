import { LOCALE } from "@moonx/i18n";
import {
  AI_EXPORT_FORMAT,
  AI_REPLY_FORMAT,
  type AnswerType,
  type QuestionOptions,
} from "@moonx/schemas";
import { type AiScope, aiLabels, isInScope } from "./ai-export";

// What 25 reads of a pasted reply (design-spec 6.7 ①②), on the client: the full text
// never goes to the server (SDD 5.10). X3 checks what the client sends again.

/** What a block of a reply holds, still to be read by its question's type. */
export type ReplyBody =
  /** The answer of a Markdown block: Current answer unquoted, when it has one. */
  | { kind: "markdown"; text: string }
  /** An item of a JSON reply, or of a `moonx-export` pasted back; `undefined` is a key it lacks. */
  | { kind: "json"; text?: unknown; amount?: unknown; reason?: unknown };

/** One block of a reply: an answer to the question ID it names, or text no ID claims. */
export interface ReplyBlock {
  /** The question ID, upper-cased; null when the block has none. */
  id: string | null;
  body: ReplyBody;
}

/** A reply split into blocks, and the format it was read as. */
export interface ParsedReply {
  format: "markdown" | "json";
  blocks: ReplyBlock[];
}

/** Upper case: IDs are capitals, digits and `_` only (design-spec 6.6), so this changes no ID. */
const normalizeId = (id: string) => {
  const trimmed = id.trim().toUpperCase();
  return trimmed === "" ? null : trimmed;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const jsonBody = (source: Record<string, unknown>): ReplyBody => ({
  kind: "json",
  ...("text" in source ? { text: source.text } : {}),
  ...("amount" in source ? { amount: source.amount } : {}),
  ...("reason" in source ? { reason: source.reason } : {}),
});

/** A `moonx-reply` or `moonx-export` JSON as blocks, or null when `text` is neither. */
function parseJson(text: string): ReplyBlock[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  const items = (list: unknown) => (Array.isArray(list) ? list : []);
  const idOf = (item: Record<string, unknown>) =>
    typeof item.id === "string" ? normalizeId(item.id) : null;
  if (data.format === AI_REPLY_FORMAT) {
    return items(data.answers)
      .filter(isRecord)
      .map((item) => ({ id: idOf(item), body: jsonBody(item) }));
  }
  if (data.format === AI_EXPORT_FORMAT) {
    // Each question's answer is the reply: text, or amount and reason (6.7 ①).
    return items(data.questions)
      .filter(isRecord)
      .map((item) => ({
        id: idOf(item),
        body: jsonBody(isRecord(item.answer) ? item.answer : {}),
      }));
  }
  return null;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/u;
const LEVEL_ONE = /^ {0,3}#(?:\s+(.*?))?\s*$/u;
const QUESTION_HEADING = /^ {0,3}##\s+\[([^\]]*)\]/u;
const EXPORT_HEADER = /^\s*<!--\s*moonx-export\b.*-->\s*$/u;

/** A heading's text as compared: lower case, without a closing "(…)" note. */
const headingName = (text: string) =>
  text
    .replace(/\s*\([^)]*\)\s*$/u, "")
    .trim()
    .toLowerCase();

/** One level of quoting off each line of `lines` (`> ` or `>`). */
const unquote = (lines: readonly string[]) =>
  lines.map((line) => line.replace(/^ {0,3}> ?/u, ""));

/** `text` without blank lines at its start and end. */
const trimLines = (text: string) =>
  text.replace(/^(?:[ \t]*\n)+/u, "").replace(/(?:\n[ \t]*)+$/u, "");

const isBlank = (line: string) => line.trim() === "";

/**
 * The answer in the lines of a Markdown block. In an export pasted back it is what is
 * under Current answer, up to the next `**…:**` field, unquoted once; otherwise the
 * whole block (design-spec 6.6 規則). Only the unquoted blank lines around the quote
 * are dropped, so a quoted answer reads back as it was exported, its blank first or
 * last lines included.
 */
function blockAnswer(lines: readonly string[]): string {
  const label = `**${aiLabels().currentAnswer}:**`;
  const start = lines.findIndex((line) => line.trim() === label);
  if (start === -1) return trimLines(lines.join("\n"));
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\s*\*\*[^*\n]+:\*\*/u.test(line));
  const quoted = end === -1 ? rest : rest.slice(0, end);
  const first = quoted.findIndex((line) => !isBlank(line));
  const last = quoted.findLastIndex((line) => !isBlank(line));
  return first === -1 ? "" : unquote(quoted.slice(first, last + 1)).join("\n");
}

/**
 * Splits a Markdown reply into blocks (design-spec 6.7 ①): a block starts at a
 * `## [ID]` heading and runs to the next one or to the next `# ` heading. Text outside
 * blocks, and blocks headed `## []`, have no ID. The Prompt, Reference and How to reply
 * of an export pasted back are skipped, and so is its header comment. Headings inside a
 * code fence are text.
 */
function parseMarkdown(text: string): ReplyBlock[] {
  const labels = aiLabels();
  const skipped = new Set(
    [labels.prompt, labels.reference, labels.howToReply].map(headingName),
  );
  const container = headingName(labels.questions);
  const blocks: ReplyBlock[] = [];
  let current: { id: string | null; lines: string[] } | null = null;
  let loose: string[] = [];
  let skipping = false;
  let fence: string | null = null;

  const flush = () => {
    if (current !== null) {
      blocks.push({
        id: current.id,
        body: { kind: "markdown", text: blockAnswer(current.lines) },
      });
      current = null;
    }
    const outside = trimLines(loose.join("\n"));
    if (outside.trim() !== "") {
      blocks.push({ id: null, body: { kind: "markdown", text: outside } });
    }
    loose = [];
  };
  const add = (line: string) => {
    if (skipping) return;
    if (current === null) loose.push(line);
    else current.lines.push(line);
  };

  for (const line of text.replace(/\r\n?/gu, "\n").split("\n")) {
    const fenceMark = FENCE.exec(line)?.[1];
    if (fence !== null) {
      if (
        fenceMark !== undefined &&
        fenceMark[0] === fence[0] &&
        fenceMark.length >= fence.length
      ) {
        fence = null;
      }
      add(line);
      continue;
    }
    if (fenceMark !== undefined) {
      fence = fenceMark;
      add(line);
      continue;
    }
    const levelOne = LEVEL_ONE.exec(line);
    if (levelOne !== null) {
      flush();
      const name = headingName(levelOne[1] ?? "");
      skipping = skipped.has(name);
      if (!skipping && name !== container) loose.push(line);
      continue;
    }
    if (skipping) continue;
    const question = QUESTION_HEADING.exec(line);
    if (question !== null) {
      flush();
      current = { id: normalizeId(question[1] ?? ""), lines: [] };
      continue;
    }
    if (
      current === null &&
      loose.every((before) => before.trim() === "") &&
      EXPORT_HEADER.test(line)
    ) {
      continue;
    }
    add(line);
  }
  flush();
  return blocks;
}

/**
 * Reads a pasted reply (design-spec 6.7 ①): JSON when it parses as JSON whose `format`
 * is `moonx-reply` or `moonx-export`, Markdown otherwise. Empty answers are still in the
 * blocks; {@link matchBlocks} leaves them out once their question's type is known.
 */
export function parseAiReply(text: string): ParsedReply {
  const json = parseJson(text.trim());
  return json === null
    ? { format: "markdown", blocks: parseMarkdown(text) }
    : { format: "json", blocks: json };
}

// ---- Reading answers ----

/** An amount as read from a reply. */
export type AmountReading =
  | { kind: "value"; value: number }
  | { kind: "empty" }
  /** Not a number: 25 ③ shows "Couldn't read the amount" until it is fixed. */
  | { kind: "unreadable"; text: string };

/**
 * What a block writes to its question. A field left `undefined` keeps what the answer
 * holds: an amount-with-reason block with only one of its headings (design-spec 6.7 ①).
 */
export interface ImportedAnswer {
  /** The answer, or the reason of an amount-with-reason question; null clears it. */
  text?: string | null;
  /** Amount-with-reason questions only. */
  amount?: AmountReading;
}

const GROUPED = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/u;

/** The narrow symbol of `currency` as `formatMoney` writes it ("₱"), if Intl knows it. */
const currencySymbol = (currency: string) => {
  try {
    return (
      new Intl.NumberFormat(LOCALE, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
      })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? null
    );
  } catch {
    return null;
  }
};

/**
 * An amount typed by a person or an AI ("₱30,000", "PHP 30,000.50", "30000"): the
 * currency's symbol and code and any currency sign are dropped, then thousands
 * separators where they group by three (design-spec 6.0.8). Anything else is
 * unreadable rather than guessed, so "30k" is not read as 30.
 */
export function readAmount(
  text: string,
  currency: string | null,
): AmountReading {
  const symbol = currency === null ? null : currencySymbol(currency);
  const code =
    currency !== null && /^[A-Z]{3}$/u.test(currency) ? currency : null;
  // Marks are taken off the ends only: in the middle, or a letter symbol after the
  // number ("30K" with the kyat's "K"), they could stand for something else.
  const strip = (value: string) => {
    let rest = value.trim();
    for (;;) {
      const before = rest;
      if (symbol !== null && rest.startsWith(symbol)) {
        rest = rest.slice(symbol.length).trim();
      }
      if (code !== null && rest.toUpperCase().startsWith(code)) {
        rest = rest.slice(code.length).trim();
      }
      if (code !== null && rest.toUpperCase().endsWith(code)) {
        rest = rest.slice(0, -code.length).trim();
      }
      rest = rest.replace(/^\p{Sc}+|\p{Sc}+$/gu, "").trim();
      if (rest === before) return rest;
    }
  };
  let rest = strip(text.replaceAll("−", "-"));
  const negative = rest.startsWith("-");
  if (negative) rest = strip(rest.slice(1));
  if (!GROUPED.test(rest)) return { kind: "unreadable", text: text.trim() };
  const value = Number(rest.replaceAll(",", ""));
  return { kind: "value", value: negative ? -value : value };
}

/** The choice of `choices` that `text` names in any case, or null (design-spec 6.7 ③). */
export const readChoice = (text: string, choices: readonly string[]) => {
  const wanted = text.trim().toLocaleLowerCase(LOCALE);
  return (
    choices.find((choice) => choice.toLocaleLowerCase(LOCALE) === wanted) ??
    null
  );
};

/** A part of an answer that says nothing: blank, or the export's "(empty)". */
const isEmptyPart = (text: string) =>
  text.trim() === "" || text.trim() === aiLabels().empty;

const AMOUNT_HEADING = /^ {0,3}#{3,6}\s+(.*?)\s*#*\s*$/u;

/**
 * The `### Amount` and `### Why this amount?` parts of a Markdown answer, if it has them.
 * The reason keeps its lines as written but for the one blank line the export puts
 * after its heading, and, when the amount comes after it, the blank lines before that.
 */
function amountParts(text: string) {
  const labels = aiLabels();
  const names = {
    amount: labels.amount.toLocaleLowerCase(LOCALE),
    reason: labels.reason.toLocaleLowerCase(LOCALE),
  };
  const parts: { amount?: string[]; reason?: string[] } = {};
  let into: string[] | null = null;
  let reasonLast = false;
  for (const line of text.split("\n")) {
    const heading = AMOUNT_HEADING.exec(line)?.[1]?.toLocaleLowerCase(LOCALE);
    if (heading === names.amount) {
      parts.amount = [];
      into = parts.amount;
      reasonLast = false;
    } else if (heading === names.reason) {
      parts.reason = [];
      into = parts.reason;
      reasonLast = true;
    } else {
      into?.push(line);
    }
  }
  let reason = parts.reason;
  if (reason !== undefined) {
    if (reason[0] !== undefined && isBlank(reason[0])) reason = reason.slice(1);
    if (!reasonLast) {
      reason = reason.slice(
        0,
        reason.findLastIndex((line) => !isBlank(line)) + 1,
      );
    }
  }
  return {
    amount: parts.amount?.join("\n").trim(),
    reason: reason?.join("\n"),
  };
}

const readAmountPart = (
  text: string,
  currency: string | null,
): AmountReading =>
  isEmptyPart(text) ? { kind: "empty" } : readAmount(text, currency);

const textPart = (text: string): string | null =>
  isEmptyPart(text) ? null : text;

/** A JSON value meant as a text: a string, or nothing. */
/**
 * A JSON value meant as a text: null or a blank string is no text (design-spec 6.7 ①);
 * a number or anything else an AI put there is kept as written.
 */
const jsonText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};

function readJsonAmount(
  value: unknown,
  currency: string | null,
): AmountReading {
  if (value === null) return { kind: "empty" };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { kind: "value", value };
  }
  if (typeof value === "string") {
    return value.trim() === ""
      ? { kind: "empty" }
      : readAmount(value, currency);
  }
  return { kind: "unreadable", text: JSON.stringify(value) ?? "" };
}

/**
 * What `body` writes to a question of `answerType`, or null when it is empty and so
 * left out (design-spec 6.7 ①). An amount-with-reason block without its two headings
 * has the amount on its first line and the reason below. A choice is spelt as the
 * template spells it when it names one in any case; anything else stays as written for
 * 25 ③ to flag.
 */
export function readImportedAnswer(
  body: ReplyBody,
  question: { answerType: AnswerType; options: QuestionOptions | null },
  currency: string | null,
): ImportedAnswer | null {
  if (question.answerType === "amount_with_reason") {
    let answer: ImportedAnswer;
    if (body.kind === "json") {
      answer = {
        ...(body.amount === undefined
          ? {}
          : { amount: readJsonAmount(body.amount, currency) }),
        ...(body.reason === undefined ? {} : { text: jsonText(body.reason) }),
      };
    } else {
      if (isEmptyPart(body.text)) return null;
      const parts = amountParts(body.text);
      if (parts.amount === undefined && parts.reason === undefined) {
        const [first = "", ...rest] = body.text.split("\n");
        answer = {
          amount: readAmountPart(first, currency),
          text: textPart(trimLines(rest.join("\n"))),
        };
      } else {
        answer = {
          ...(parts.amount === undefined
            ? {}
            : { amount: readAmountPart(parts.amount, currency) }),
          ...(parts.reason === undefined
            ? {}
            : { text: textPart(parts.reason) }),
        };
      }
    }
    // Empty when it holds no part, or both parts and neither says anything. A single
    // empty part clears that part and keeps the other (6.7 ①).
    const parts = [
      answer.amount === undefined ? null : answer.amount.kind !== "empty",
      answer.text === undefined ? null : answer.text !== null,
    ].filter((part) => part !== null);
    return parts.length === 0 || (parts.length === 2 && !parts.some(Boolean))
      ? null
      : answer;
  }
  const text = body.kind === "json" ? jsonText(body.text) : textPart(body.text);
  if (text === null) return null;
  if (question.options?.kind === "choice") {
    return { text: readChoice(text, question.options.choices) ?? text };
  }
  return { text };
}

/** Whether a block says nothing whatever question it is put on. */
const isEmptyBody = (body: ReplyBody) =>
  body.kind === "markdown"
    ? isEmptyPart(body.text)
    : jsonText(body.text) === null &&
      jsonText(body.reason) === null &&
      jsonText(body.amount) === null;

// ---- Matching ----

/** What {@link matchBlocks} knows of where the import goes: X2's ImportContext. */
export interface ImportTarget {
  sections: readonly { key: string; part: "a" | "b" | null }[];
  questions: readonly {
    questionKey: string;
    sectionKey: string;
    answerType: AnswerType;
    options: QuestionOptions | null;
    importable: boolean;
    hidden: boolean;
  }[];
  /** For reading amounts. */
  currency: string | null;
}

/**
 * Where a block goes (design-spec 6.7 ②): `matched` to its question; `unmatched` without
 * an ID, with one the target lacks, outside the scope, or a JSON item whose text is in
 * a field its question does not read; `not_importable` for a table,
 * number or execution item; `hidden` for a question 02 OCEAN or a migration hides;
 * `duplicate` when blocks name the same question.
 */
export type MatchStatus =
  | "matched"
  | "unmatched"
  | "not_importable"
  | "hidden"
  | "duplicate";

/** A block of a reply put on its question (or on none), as 25 ② lists it. */
export interface MatchedBlock {
  /** Its place among the reply's blocks. */
  index: number;
  id: string | null;
  status: MatchStatus;
  /** The question the ID names, for every status but `unmatched`. */
  questionKey: string | null;
  /** What it writes to that question, for `matched`, `duplicate` and `hidden`. */
  answer: ImportedAnswer | null;
  /** To read again when 25 puts it on another question (`readImportedAnswer`). */
  body: ReplyBody;
}

/**
 * Puts each block of `reply` on its question of `target` within `scope` (design-spec
 * 6.7 ②). Blocks with nothing to write are left out: their questions keep their
 * answers (6.7 ①).
 */
export function matchBlocks(
  reply: ParsedReply,
  target: ImportTarget,
  scope: AiScope,
): MatchedBlock[] {
  const questions = new Map(
    target.questions.map((question) => [question.questionKey, question]),
  );
  const matched = reply.blocks.flatMap((block, index): MatchedBlock[] => {
    const question = block.id === null ? undefined : questions.get(block.id);
    const base = { index, id: block.id, body: block.body };
    if (question === undefined) {
      return isEmptyBody(block.body)
        ? []
        : [{ ...base, status: "unmatched", questionKey: null, answer: null }];
    }
    if (!question.importable) {
      return isEmptyBody(block.body)
        ? []
        : [
            {
              ...base,
              status: "not_importable",
              questionKey: question.questionKey,
              answer: null,
            },
          ];
    }
    const answer = readImportedAnswer(block.body, question, target.currency);
    if (answer === null) {
      // An empty answer is left out, but a JSON item that holds its text in a field
      // its question does not read ("text" for an amount) is shown, not lost.
      return block.body.kind === "markdown" || isEmptyBody(block.body)
        ? []
        : [{ ...base, status: "unmatched", questionKey: null, answer: null }];
    }
    if (question.hidden) {
      return [
        {
          ...base,
          status: "hidden",
          questionKey: question.questionKey,
          answer,
        },
      ];
    }
    if (!isInScope(scope, question.sectionKey, target.sections)) {
      return [
        { ...base, status: "unmatched", questionKey: null, answer: null },
      ];
    }
    return [
      { ...base, status: "matched", questionKey: question.questionKey, answer },
    ];
  });
  const counts = new Map<string, number>();
  for (const block of matched) {
    if (block.status === "matched" && block.questionKey !== null) {
      counts.set(block.questionKey, (counts.get(block.questionKey) ?? 0) + 1);
    }
  }
  return matched.map((block) =>
    block.status === "matched" && (counts.get(block.questionKey ?? "") ?? 0) > 1
      ? { ...block, status: "duplicate" }
      : block,
  );
}
