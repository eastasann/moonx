import type { AnswerType, Confidence, Fau, QuestionOptions, TemplateKind } from "@moonx/schemas";

/*
 * AI export and import (design-spec 6.6 / 6.7, SDD 5.10). Everything here is pure: the API builds the
 * export (X1) and re-checks the import (X3), the clients parse and match the pasted text.
 */

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

/** One evidence link printed next to a validation answer. */
export type ExportEvidence =
  | { type: "research_log"; date: string | null; topic: string }
  | { type: "url"; url: string };

/** A question with its current answer, as the API hands it to {@link buildExport}. */
export interface ExportQuestion {
  id: string;
  section: string;
  sectionTitle: string;
  title: string;
  /** The prompt text of the question. */
  question: string;
  example: string | null;
  hint: string | null;
  answerType: AnswerType;
  options?: QuestionOptions | null;
  answer: {
    /** For `amount_with_reason` questions this is the reason. */
    text: string | null;
    amount?: number | null;
    /** Validation only. */
    fau?: Fau | null;
    /** Validation only. */
    confidence?: Confidence | null;
    /** Validation only. */
    evidence?: ExportEvidence[];
  };
}

/** Input of {@link buildExport}. */
export interface BuildExportInput {
  kind: TemplateKind;
  /** Printed after `scope:` in the header comment, e.g. `01,02`, `all`, `part:a`. */
  scopeLabel: string;
  /** Stored as `json.scope`. */
  scope: Record<string, unknown>;
  /** Idea or plan name, printed as `idea:` in the header comment. */
  subjectName: string | null;
  /** ISO 8601 with offset. Passed in so the function stays free of the clock. */
  exportedAt: string;
  templateVersion: number;
  currency: string | null;
  prompt: string;
  /** Already filtered by the API (scope, includeEmpty) and in display order. */
  questions: ExportQuestion[];
  includeExamples: boolean;
  /** Prebuilt by the API and embedded as is. */
  reference: { markdown: string; json: unknown } | null;
  /** Currency printed after amounts; falls back to `currency`. */
  amountCurrency?: string | null;
}

/** Result of {@link buildExport}. */
export interface BuiltExport {
  markdown: string;
  json: Record<string, unknown>;
  questionCount: number;
  /** True when no question has an answer (the UI shows "All questions are empty"). */
  allEmpty: boolean;
}

const FAU_LABEL: Record<Fau, string> = {
  fact: "Fact",
  assumption: "Assumption",
  unknown: "Unknown",
};
const CONFIDENCE_LABEL: Record<Confidence, string> = { low: "Low", medium: "Medium", high: "High" };

const REPLY_FORMAT = "moonx-reply";
const EXPORT_FORMAT = "moonx-export";

function isBlank(s: string | null | undefined): boolean {
  return s == null || s.trim() === "";
}

function hasAnswer(q: ExportQuestion): boolean {
  return !isBlank(q.answer.text) || q.answer.amount != null;
}

function isAmountQuestion(q: ExportQuestion): boolean {
  return q.answerType === "amount_with_reason";
}

/** Groups thousands without relying on the runtime locale. */
function formatAmountPlain(n: number): string {
  const [int = "0", frac] = String(n).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

function quote(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => (l === "" ? ">" : `> ${l}`))
    .join("\n");
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").replace(/-->/g, "->").trim();
}

function currentAnswerMarkdown(q: ExportQuestion, currency: string | null): string {
  if (!hasAnswer(q)) return quote("(empty)");
  if (!isAmountQuestion(q)) return quote((q.answer.text ?? "").trim());
  const amount =
    q.answer.amount == null
      ? "(empty)"
      : `${formatAmountPlain(q.answer.amount)}${currency ? ` ${currency}` : ""}`;
  const reason = isBlank(q.answer.text) ? "(empty)" : (q.answer.text ?? "").trim();
  return quote(`Amount: ${amount}\n\nReason: ${reason}`);
}

function evidenceMarkdown(evidence: ExportEvidence[]): string {
  if (evidence.length === 0) return "(none)";
  return evidence
    .map((e) =>
      e.type === "url"
        ? e.url
        : `Research log${e.date ? ` ${e.date}` : ""} "${e.topic.replace(/"/g, "'")}"`,
    )
    .join("; ");
}

function questionMarkdown(
  q: ExportQuestion,
  kind: TemplateKind,
  includeExamples: boolean,
  currency: string | null,
): string {
  const parts = [`## [${q.id}] ${q.title}`, `**Question:** ${q.question}`];
  if (includeExamples && !isBlank(q.example)) parts.push(`**Example:** ${q.example}`);
  if (q.options?.kind === "choice") parts.push(`**Choices:** ${q.options.choices.join(" / ")}`);
  parts.push(`**Current answer:**\n\n${currentAnswerMarkdown(q, currency)}`);
  if (kind === "validation") {
    const fau = q.answer.fau
      ? q.answer.fau === "assumption" && q.answer.confidence
        ? `${FAU_LABEL.assumption} (${CONFIDENCE_LABEL[q.answer.confidence]})`
        : FAU_LABEL[q.answer.fau]
      : "Unclassified";
    parts.push(`**F/A/U:** ${fau}`);
    parts.push(`**Evidence:** ${evidenceMarkdown(q.answer.evidence ?? [])}`);
  }
  return parts.join("\n\n");
}

function replyInstructionsMarkdown(questions: ExportQuestion[]): string {
  const first = questions[0]?.id ?? "V.01.WHO";
  const amountIds = questions.filter(isAmountQuestion).map((q) => q.id);
  const hasChoice = questions.some((q) => q.options?.kind === "choice");
  const lines = [
    "# How to reply",
    "",
    "Reply in Markdown. For each question you want to update, write one block:",
    "",
    `## [${first}]`,
    "<the final answer, in the same language I used>",
    "",
    "- Use the exact IDs in square brackets.",
    "- Only include questions you are updating.",
    "- Do not translate my answers. Do not add F/A/U labels.",
  ];
  if (amountIds.length > 0) {
    lines.push(
      `- For amount questions (${amountIds.join(", ")}), use "### Amount" and "### Why this amount?" under the heading.`,
    );
  }
  if (hasChoice)
    lines.push("- For choice questions, answer with exactly one of the listed choices.");
  return lines.join("\n");
}

function replyInstructionsText(questions: ExportQuestion[]): string {
  const amountIds = questions.filter(isAmountQuestion).map((q) => q.id);
  const hasChoice = questions.some((q) => q.options?.kind === "choice");
  const lines = [
    `Reply with JSON in the "${REPLY_FORMAT}" format. For each question you want to update, add one entry to "answers".`,
    "Use the exact question IDs. Only include questions you are updating.",
    "Do not translate my answers. Do not add F/A/U labels.",
  ];
  if (amountIds.length > 0) {
    lines.push(
      `For amount questions (${amountIds.join(", ")}), send "amount" as a number and put the explanation in "reason".`,
    );
  }
  if (hasChoice) lines.push("For choice questions, answer with exactly one of the listed choices.");
  return lines.join(" ");
}

function questionJson(q: ExportQuestion, kind: TemplateKind, includeExamples: boolean) {
  const answer: Record<string, unknown> = { text: q.answer.text ?? null };
  if (isAmountQuestion(q) || q.answer.amount != null) answer.amount = q.answer.amount ?? null;
  if (kind === "validation") {
    answer.fau = q.answer.fau ?? null;
    answer.confidence = q.answer.confidence ?? null;
    answer.evidence = q.answer.evidence ?? [];
  }
  const out: Record<string, unknown> = {
    id: q.id,
    section: q.section,
    sectionTitle: q.sectionTitle,
    title: q.title,
    question: q.question,
    example: includeExamples ? q.example : null,
    hint: q.hint,
    answerType: q.answerType,
  };
  if (q.options) out.options = q.options;
  out.answer = answer;
  return out;
}

/**
 * Builds the Markdown and JSON export of design-spec 6.6. Questions must already be filtered and
 * ordered. The Markdown quotes every answer line with `>`, so an answer can never be mistaken for a
 * heading when the file is pasted back.
 */
export function buildExport(input: BuildExportInput): BuiltExport {
  const { kind, questions } = input;
  const currency = input.amountCurrency ?? input.currency;

  const header = [
    "moonx-export v1",
    `kind: ${kind}`,
    `scope: ${oneLine(input.scopeLabel)}`,
    ...(input.subjectName ? [`idea: ${oneLine(input.subjectName)}`] : []),
    `exported: ${input.exportedAt}`,
  ].join(" | ");

  const sections = [
    `<!-- ${header} -->`,
    `# Prompt\n\n${input.prompt}`,
    `# Questions\n\n${questions
      .map((q) => questionMarkdown(q, kind, input.includeExamples, currency))
      .join("\n\n")}`,
  ];
  if (input.reference)
    sections.push(`# Reference (read-only)\n\n${input.reference.markdown.trim()}`);
  sections.push(replyInstructionsMarkdown(questions));
  const markdown = `${sections.join("\n\n")}\n`;

  const first = questions[0]?.id ?? "V.01.WHO";
  const exampleAnswers: Record<string, unknown>[] = [
    { id: first, text: "<the final answer, in the same language I used>" },
  ];
  const amountQ = questions.find(isAmountQuestion);
  if (amountQ) exampleAnswers.push({ id: amountQ.id, amount: 30000, reason: "<why this amount>" });

  const json: Record<string, unknown> = {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: input.exportedAt,
    kind,
    scope: input.scope,
    templateVersion: input.templateVersion,
    currency: input.currency,
    prompt: input.prompt,
    questions: questions.map((q) => questionJson(q, kind, input.includeExamples)),
  };
  if (input.reference) json.reference = input.reference.json;
  json.reply = {
    instructions: replyInstructionsText(questions),
    example: { format: REPLY_FORMAT, version: 1, answers: exampleAnswers },
  };

  return {
    markdown,
    json,
    questionCount: questions.length,
    allEmpty: questions.length > 0 && questions.every((q) => !hasAnswer(q)),
  };
}

function slug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/**
 * File base name without extension, e.g. `moonx-export-validation-piaya-gift-box-2026-10-01`. The
 * subject is reduced to an ASCII slug and left out when nothing remains (e.g. a Japanese name). The
 * date is the calendar date written in `exportedAt`, not converted to UTC.
 */
export function exportFileBaseName(
  kind: TemplateKind,
  subject: string | null,
  exportedAt: string,
): string {
  const parts = ["moonx-export", kind.replace(/_/g, "-")];
  const s = subject ? slug(subject) : "";
  if (s) parts.push(s);
  const date = /^\d{4}-\d{2}-\d{2}/.exec(exportedAt)?.[0];
  if (date) parts.push(date);
  return parts.join("-");
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

/**
 * Upper bound of a paste (design-spec 6.7). {@link parseAiReply} does not enforce it: the caller
 * rejects longer input ("This is too long") before parsing.
 */
export const MAX_REPLY_CHARS = 200_000;

/** One piece of a pasted reply. */
export interface ReplyBlock {
  /** Position in the paste, 0-based. */
  index: number;
  /** Question ID as written (case is kept); null for unlabeled blocks. */
  id: string | null;
  heading: string | null;
  /** Answer text, trimmed; null when empty. For amount questions, the text outside the amount sections. */
  text: string | null;
  /** As written: a string from Markdown (read it with {@link parseAmount}), a number from JSON. */
  amount: string | number | null;
  reason: string | null;
}

/** Result of {@link parseAiReply}. */
export interface ParsedReply {
  format: "markdown" | "json";
  blocks: ReplyBlock[];
}

function cleanText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\r\n?/g, "\n").trim();
  return t === "" ? null : t;
}

function cleanAmount(v: unknown): string | number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return cleanText(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function tryParseJson(input: string): Record<string, unknown> | null {
  let s = input.trim();
  // AI chats usually wrap JSON in a ```json fence.
  const fenced = /^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n\1[`~]*\s*$/.exec(s);
  if (fenced) s = (fenced[2] ?? "").trim();
  if (!s.startsWith("{")) return null;
  try {
    const v: unknown = JSON.parse(s);
    return isRecord(v) ? v : null;
  } catch {
    return null;
  }
}

function jsonBlocks(doc: Record<string, unknown>): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  const push = (b: Omit<ReplyBlock, "index">) => blocks.push({ index: blocks.length, ...b });
  if (doc.format === REPLY_FORMAT) {
    const answers = Array.isArray(doc.answers) ? doc.answers : [];
    for (const a of answers) {
      if (!isRecord(a)) continue;
      push({
        id: cleanText(a.id),
        heading: cleanText(a.title),
        text: cleanText(a.text),
        amount: cleanAmount(a.amount),
        reason: cleanText(a.reason),
      });
    }
  } else {
    const questions = Array.isArray(doc.questions) ? doc.questions : [];
    for (const q of questions) {
      if (!isRecord(q)) continue;
      const answer = isRecord(q.answer) ? q.answer : {};
      const text = cleanText(answer.text);
      const amount = cleanAmount(answer.amount);
      // Unanswered questions carry nothing to import.
      if (text === null && amount === null) continue;
      const isAmount = q.answerType === "amount_with_reason" || amount !== null;
      push({
        id: cleanText(q.id),
        heading: cleanText(q.title),
        text: isAmount ? null : text,
        amount: isAmount ? amount : null,
        reason: isAmount ? text : null,
      });
    }
  }
  return blocks;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const IGNORED_H1 = /^(prompt|reference|how to reply)\b/i;
const ID_HEADING = /^##[ \t]+\[([^\]\n]*)\][ \t]*(.*)$/;
/** Any `## [` line ends a block, well-formed or not; other `##` headings are answer text. */
const BLOCK_START = /^##[ \t]+\[/;
const H1_HEADING = /^#[ \t]+(\S.*)$/;
const AMOUNT_HEADING = /^###[ \t]+amount[ \t]*:?[ \t]*$/i;
const REASON_HEADING = /^###[ \t]+(why this amount\??|reason)[ \t]*:?[ \t]*$/i;
const EXPORT_HEADER = /^<!-- moonx-export /;
const EXPORT_FIELD = /^\*\*(Question|Example|Hint|Choices|F\/A\/U|Evidence):\*\*/;

interface Fenced {
  line: string;
  fenced: boolean;
}

/** Marks lines that sit inside a fenced code block (fence lines included). */
function markFences(lines: string[]): Fenced[] {
  const out: Fenced[] = [];
  let open: { ch: string; len: number } | null = null;
  for (const line of lines) {
    const m = FENCE_OPEN.exec(line);
    if (open) {
      out.push({ line, fenced: true });
      const closing = m?.[1];
      if (
        closing &&
        closing[0] === open.ch &&
        closing.length >= open.len &&
        line.trim() === closing
      ) {
        open = null;
      }
    } else if (m?.[1]) {
      open = { ch: m[1][0] as string, len: m[1].length };
      out.push({ line, fenced: true });
    } else {
      out.push({ line, fenced: false });
    }
  }
  return out;
}

function trimLines(lines: string[]): string {
  return lines.join("\n").trim();
}

function unquote(line: string): string {
  return line.replace(/^ {0,3}> ?/, "");
}

function emptyMarker(s: string | null): string | null {
  return s === null || /^\(empty\)$/i.test(s) ? null : s;
}

interface Body {
  text: string | null;
  amount: string | null;
  reason: string | null;
}

/** Reads the body of a block that is a copy of the export format (it has `**Current answer:**`). */
function exportCopyBody(lines: Fenced[], at: number): Body {
  const answer: string[] = [];
  for (const { line, fenced } of lines.slice(at + 1)) {
    if (!fenced && EXPORT_FIELD.test(line.trim())) break;
    answer.push(unquote(line));
  }
  const joined = trimLines(answer);
  const amountMatch = /^Amount:[ \t]*(.*)(?:\n|$)/i.exec(joined);
  if (amountMatch) {
    const rest = joined.slice(amountMatch[0].length);
    const reasonMatch = /^\s*Reason:[ \t]*([\s\S]*)$/i.exec(rest);
    return {
      text: null,
      amount: emptyMarker(cleanText(amountMatch[1])),
      reason: emptyMarker(cleanText(reasonMatch ? reasonMatch[1] : rest)),
    };
  }
  return { text: emptyMarker(cleanText(joined)), amount: null, reason: null };
}

function readBody(lines: Fenced[]): Body {
  const copyAt = lines.findIndex((l) => !l.fenced && /^\*\*Current answer:\*\*\s*$/.test(l.line));
  if (copyAt >= 0) return exportCopyBody(lines, copyAt);

  const amountAt = lines.findIndex((l) => !l.fenced && AMOUNT_HEADING.test(l.line.trim()));
  const reasonAt = lines.findIndex((l) => !l.fenced && REASON_HEADING.test(l.line.trim()));
  if (amountAt < 0 && reasonAt < 0) {
    return { text: cleanText(trimLines(lines.map((l) => l.line))), amount: null, reason: null };
  }
  const marks = [amountAt, reasonAt].filter((i) => i >= 0).sort((a, b) => a - b);
  const section = (at: number): string | null => {
    if (at < 0) return null;
    const end = marks.find((m) => m > at) ?? lines.length;
    return cleanText(trimLines(lines.slice(at + 1, end).map((l) => l.line)));
  };
  return {
    text: cleanText(trimLines(lines.slice(0, marks[0]).map((l) => l.line))),
    amount: section(amountAt),
    reason: section(reasonAt),
  };
}

function markdownBlocks(input: string): ReplyBlock[] {
  const lines = markFences(input.replace(/^﻿/, "").split(/\r\n?|\n/));
  const blocks: ReplyBlock[] = [];
  let id: string | null = null;
  let heading: string | null = null;
  let body: Fenced[] = [];
  let skipping = false;

  const flush = () => {
    const b = readBody(body);
    const empty = b.text === null && b.amount === null && b.reason === null;
    if (!skipping && (id !== null || !empty)) {
      blocks.push({ index: blocks.length, id, heading, ...b });
    }
    id = null;
    heading = null;
    body = [];
  };

  for (const l of lines) {
    if (!l.fenced && EXPORT_HEADER.test(l.line)) continue;
    if (!l.fenced) {
      const idM = ID_HEADING.exec(l.line);
      const h1 = H1_HEADING.exec(l.line);
      if (h1) {
        flush();
        const title = (h1[1] as string).trim();
        // The exported prompt, reference and reply instructions are not answers, and the
        // instructions contain an example `## [ID]` heading.
        skipping = IGNORED_H1.test(title);
        if (!skipping && !/^questions\b/i.test(title)) heading = title;
        continue;
      }
      if (!skipping && BLOCK_START.test(l.line)) {
        flush();
        if (idM) {
          id = (idM[1] as string).trim() || null;
          heading = cleanText(idM[2]);
        }
        continue;
      }
    }
    body.push(l);
  }
  flush();
  return blocks;
}

/**
 * Parses a pasted AI reply. Never throws; returns no blocks when nothing is readable.
 *
 * JSON is detected first (optionally inside a code fence): `moonx-reply` blocks come from `answers`,
 * `moonx-export` blocks from each answered question (unanswered ones are skipped; an amount question
 * yields `amount` plus `reason`). Anything else is read as Markdown.
 *
 * Markdown rules:
 * - A block starts at `## [ID] heading` and ends at the next `## [` heading or the next `# `
 *   heading (design-spec 6.6). A `##` heading without `[` inside an answer is part of its text.
 *   Lowercase IDs are kept as written; {@link matchBlocks} compares case-insensitively.
 * - Text before the first heading and `# ` headings start unlabeled blocks (`id: null`); empty
 *   ones are dropped.
 * - The `<!-- moonx-export ... -->` header line is dropped.
 * - The `# Prompt`, `# Reference ...` and `# How to reply` sections of a pasted export are ignored.
 * - Headings inside fenced code blocks (``` or ~~~) are text, so an answer may show Markdown. An
 *   unclosed fence runs to the end of the paste.
 * - Plain bodies are kept verbatim (including `>` quote marks). Only when the body is a copy of the
 *   export format (it has a `**Current answer:**` line) are the quote marks removed, the text taken
 *   up to the next `**Field:**` line, and `(empty)` read as no answer; `Amount:` / `Reason:` lines
 *   become `amount` / `reason`.
 * - `### Amount` and `### Why this amount?` under a heading fill `amount` and `reason`; text above
 *   them stays in `text`.
 *
 * The 200,000-character limit ({@link MAX_REPLY_CHARS}) is the caller's job.
 */
export function parseAiReply(input: string): ParsedReply {
  const doc = tryParseJson(input);
  if (doc && (doc.format === REPLY_FORMAT || doc.format === EXPORT_FORMAT)) {
    return { format: "json", blocks: jsonBlocks(doc) };
  }
  return { format: "markdown", blocks: markdownBlocks(input) };
}

// ---------------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------------

/** A question of the import target, as the client knows it from `ImportContext` and the scope. */
export interface MatchTarget {
  key: string;
  title: string;
  sectionKey: string;
  answerType: AnswerType;
  importable: boolean;
  hidden: boolean;
  inScope: boolean;
}

export type MatchState = "matched" | "unmatched" | "not_importable" | "hidden" | "duplicate";

export interface MatchedBlock {
  block: ReplyBlock;
  state: MatchState;
  /** The target's own key (not the case as pasted); null when unmatched. */
  questionKey: string | null;
  /** Indexes of the other blocks with the same ID. */
  duplicateOf?: number[];
}

/**
 * Sorts blocks into the states of design-spec 6.7 "② 振り分け". IDs are compared case-insensitively.
 * A block without an ID, or whose ID is not an in-scope target, is unmatched. Otherwise the state is
 * duplicate, then not_importable, then hidden, then matched.
 */
export function matchBlocks(blocks: ReplyBlock[], targets: MatchTarget[]): MatchedBlock[] {
  const byKey = new Map<string, MatchTarget>();
  for (const t of targets) byKey.set(t.key.toUpperCase(), t);

  const resolve = (b: ReplyBlock): MatchTarget | null => {
    if (b.id === null) return null;
    const t = byKey.get(b.id.trim().toUpperCase());
    return t?.inScope ? t : null;
  };

  const byId = new Map<string, number[]>();
  for (const b of blocks) {
    const t = resolve(b);
    if (!t) continue;
    const k = t.key.toUpperCase();
    byId.set(k, [...(byId.get(k) ?? []), b.index]);
  }

  return blocks.map((block): MatchedBlock => {
    const t = resolve(block);
    if (!t) return { block, state: "unmatched", questionKey: null };
    const same = (byId.get(t.key.toUpperCase()) ?? []).filter((i) => i !== block.index);
    if (same.length > 0) {
      return { block, state: "duplicate", questionKey: t.key, duplicateOf: same };
    }
    if (!t.importable) return { block, state: "not_importable", questionKey: t.key };
    if (t.hidden) return { block, state: "hidden", questionKey: t.key };
    return { block, state: "matched", questionKey: t.key };
  });
}

// ---------------------------------------------------------------------------------------------
// Value normalization
// ---------------------------------------------------------------------------------------------

const AMOUNT_PATTERN = /^[^\d.]*?(\d[\d,]*(?:\.\d+)?|\.\d+)[^\d.,]*$/;

/**
 * Reads an amount such as `₱30,000`, `PHP 30000`, `30,000.50` or `¥ 1,200`. Returns null when the
 * text has no single number, is negative, or uses a decimal comma (`1.200,50`).
 */
export function parseAmount(text: string | number | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  if (typeof text === "number") return Number.isFinite(text) && text >= 0 ? text : null;
  const s = text.trim();
  if (s === "" || /[-−]|^\(/.test(s)) return null;
  const m = AMOUNT_PATTERN.exec(s);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Case-insensitive match against the choices; returns the canonical choice or null. Surrounding
 * whitespace, `*` / quote marks and a trailing period are ignored because chat AIs add them.
 */
export function parseChoice(text: string | null | undefined, choices: string[]): string | null {
  if (!text) return null;
  const norm = (s: string) =>
    s
      .trim()
      .replace(/^[*_"'`“”‘’\s]+|[*_"'`“”‘’\s.]+$/g, "")
      .toLowerCase();
  const wanted = norm(text);
  if (wanted === "") return null;
  return choices.find((c) => norm(c) === wanted) ?? null;
}
