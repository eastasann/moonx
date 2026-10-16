import {
  formatCheckName,
  formatInputNumber,
  formatInputPercent,
  formatIsoDate,
  formatIsoDateTime,
  formatMoney,
  i18n,
} from "@moonx/i18n";
import {
  AI_EXPORT_FORMAT,
  AI_FORMAT_VERSION,
  AI_REPLY_FORMAT,
  type AiEvidence,
  type AiExportAnswer,
  type AiExportJson,
  type AiExportQuestion,
  type AiExportScope,
  type AiReference,
  type AiReply,
  type CheckResult,
  type CompetitorType,
  type Confidence,
  type Fau,
  type FauState,
  type KeyMetrics,
  type PlanTableRow,
  type SourceType,
  type SupportsCheck,
  type TemplateKind,
  type TemplateQuestion,
  type TemplateSection,
} from "@moonx/schemas";
import { KEY_METRIC_KEYS, keyMetricOf } from "./economics";
import { hasText } from "./fau";
import { formatMetric } from "./pitch";
import { isQuestionShown } from "./validation";

// The export of 24 (design-spec 6.6): the questions of a scope with their answers, as
// Markdown and as the `moonx-export` JSON, for the user to hand to an AI. What 25 reads
// back is in ai-import.ts, which shares the headings and labels below.

/** The answer types an import can write (design-spec 6.7 ②). */
const IMPORTABLE_TYPES = new Set<TemplateQuestion["answerType"]>([
  "long_text",
  "short_text",
  "choice",
  "amount_with_reason",
]);

/**
 * Whether an import can write the answer of `question` in a template of `kind`: not
 * tables, numbers or execution items, and amounts only in a self-analysis, the one
 * whose answers hold an amount (V3 and P5 take none).
 */
export const isImportable = (
  question: Pick<TemplateQuestion, "answerType">,
  kind: TemplateKind,
) =>
  IMPORTABLE_TYPES.has(question.answerType) &&
  (question.answerType !== "amount_with_reason" || kind === "self_analysis");

/** What an export or import covers: the whole, sections, plan items or a plan part. */
export type AiScope =
  | { kind: "all" }
  | { kind: "sections"; keys: readonly string[] }
  | { kind: "items"; itemNos: readonly number[] }
  | { kind: "part"; part: "a" | "b" };

/** Whether `sectionKey` of a template of `sections` lies in `scope`. */
export const isInScope = (
  scope: AiScope,
  sectionKey: string,
  sections: readonly Pick<TemplateSection, "key" | "part">[],
) => {
  switch (scope.kind) {
    case "all":
      return true;
    case "sections":
      return scope.keys.includes(sectionKey);
    case "items":
      return scope.itemNos.includes(Number(sectionKey));
    case "part":
      return sections.find((s) => s.key === sectionKey)?.part === scope.part;
  }
};

/** Why a scope cannot be exported: a key the template lacks, or no question to write. */
export type AiScopeProblem =
  | { kind: "unknown"; key: string }
  | { kind: "empty" };

/**
 * The sections of `sections` that `scope` covers, in template order, or why it covers
 * none an export can hold: a section key or item number the template lacks, or no
 * question an import can write (SDD 5.10 X1 422 EMPTY_SCOPE).
 */
export function scopeSections(
  kind: TemplateKind,
  sections: readonly TemplateSection[],
  scope: AiScope,
): { sections: TemplateSection[] } | { problem: AiScopeProblem } {
  const wanted =
    scope.kind === "sections"
      ? scope.keys
      : scope.kind === "items"
        ? scope.itemNos.map((itemNo) => String(itemNo).padStart(2, "0"))
        : [];
  const missing = wanted.find((key) => !sections.some((s) => s.key === key));
  if (missing !== undefined) {
    return {
      problem: {
        kind: "unknown",
        key: scope.kind === "items" ? String(Number(missing)) : missing,
      },
    };
  }
  const covered = sections.filter((section) =>
    isInScope(scope, section.key, sections),
  );
  if (
    !covered.some((section) =>
      section.questions.some((question) => isImportable(question, kind)),
    )
  ) {
    return { problem: { kind: "empty" } };
  }
  return { sections: covered };
}

/** One answer as the export reads it. */
export interface AiAnswerInput {
  /** The answer, or the reason of an amount-with-reason question. */
  text: string | null;
  amount: number | null;
  /** Validation answers only, as 11 shows them. */
  fau?: { fau: Fau | null; confidence: Confidence | null; state: FauState };
  /** Validation answers only: the evidence attached, deleted research logs left out. */
  evidence?: readonly AiEvidence[];
}

/** The rows of the Reference of a validation (design-spec 6.6), in their screens' order. */
export interface ValidationReferenceInput {
  kind: "validation";
  keyMetrics: KeyMetrics;
  checks: readonly CheckResult[];
  competitors: readonly {
    name: string;
    type: CompetitorType | null;
    typicalPrice: number | null;
    priceNote: string | null;
    strength: string | null;
    weakness: string | null;
  }[];
  researchLog: readonly {
    observedOn: string | null;
    topic: string;
    sourceType: SourceType | null;
    supportsChecks: readonly SupportsCheck[];
  }[];
  assumptions: readonly { statement: string; confidence: Confidence | null }[];
  risks: readonly {
    statement: string;
    probability: Confidence | null;
    impact: Confidence | null;
  }[];
}

/** What the Reference of a plan reads: the validation's numbers and its tables. */
export interface PlanReferenceInput {
  kind: "business_plan";
  keyMetrics: KeyMetrics;
  /** The saved rows of each table sub-item, by question ID. */
  tables: ReadonlyMap<string, readonly PlanTableRow[] | null>;
}

/** What {@link buildAiExport} writes: a target's template, answers and Reference. */
export interface AiExportInput {
  kind: TemplateKind;
  /** Every section of the pinned template version, in order. */
  sections: readonly TemplateSection[];
  scope: AiScope;
  /** By question ID; a question without one is unanswered. */
  answers: ReadonlyMap<string, AiAnswerInput>;
  /** The template version's prompt for an AI; only self-analysis templates have one. */
  prompt: string;
  templateVersion: number;
  /** The workspace's, or the self-analysis's. */
  currency: string;
  /** The idea of a validation or plan. */
  ideaName: string | null;
  planName: string | null;
  /** The owner of a self-analysis, named in its file. */
  ownerName: string | null;
  exportedAt: Date;
  /** The caller's (`users.timezone`), which the times and the file's date are in. */
  timeZone: string;
  includeEmpty: boolean;
  includeExamples: boolean;
  /** Null to leave the Reference out. */
  reference: ValidationReferenceInput | PlanReferenceInput | null;
}

/** What X1 answers (SDD 5.10). */
export interface AiExportResult {
  markdown: string;
  json: AiExportJson;
  fileBaseName: string;
  questionCount: number;
  allEmpty: boolean;
}

/** The labels the export writes and the import reads back (packages/i18n `ai`). */
export const aiLabels = () => ({
  prompt: i18n.t("ai:heading.prompt"),
  questions: i18n.t("ai:heading.questions"),
  reference: i18n.t("ai:heading.reference"),
  howToReply: i18n.t("ai:heading.howToReply"),
  question: i18n.t("ai:field.question"),
  example: i18n.t("ai:field.example"),
  choices: i18n.t("ai:field.choices"),
  currentAnswer: i18n.t("ai:field.currentAnswer"),
  fau: i18n.t("ai:field.fau"),
  evidence: i18n.t("ai:field.evidence"),
  amount: i18n.t("ai:amount.amount"),
  reason: i18n.t("ai:amount.reason"),
  empty: i18n.t("ai:empty"),
});

/** `**Label:**`, the line a field of a question starts with. */
const field = (label: string, value = "") =>
  value === "" ? `**${label}:**` : `**${label}:** ${value}`;

/**
 * Text written outside a quote, a heading or a list: a template's prompt, question or
 * example. A line that would read as a heading the import splits blocks at (`#`, `##`)
 * or as a code fence is escaped, so the export pasted back parses as it was written.
 */
const escapeStructure = (text: string) =>
  text.replace(/^( {0,3})(#{1,2}(?=\s|$)|```|~~~)/gmu, "$1\\$2");

/**
 * Every line of `text` as a quote, an empty line as a bare `>`. Spaces are kept, so the
 * import reads back the text as it was.
 */
const quote = (text: string) =>
  text
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");

/** One line: a value written in a heading, a list item or a table cell. */
const oneLine = (text: string) => text.replace(/\s+/gu, " ").trim();

/** An amount as typed: whole units, or with its cents when it has them. */
export const formatAmount = (amount: number, currency: string) =>
  formatMoney(amount, currency, { cents: !Number.isInteger(amount) });

const isEmptyAnswer = (
  question: TemplateQuestion,
  answer: AiAnswerInput | undefined,
) =>
  question.answerType === "amount_with_reason"
    ? answer?.amount == null && !hasText(answer?.text ?? null)
    : !hasText(answer?.text ?? null);

/** The `> …` lines under Current answer (design-spec 6.6 規則). */
function currentAnswerLines(
  question: TemplateQuestion,
  answer: AiAnswerInput | undefined,
  currency: string,
): string {
  const labels = aiLabels();
  if (isEmptyAnswer(question, answer)) return quote(labels.empty);
  if (question.answerType !== "amount_with_reason") {
    return quote(answer?.text ?? "");
  }
  const amount =
    answer?.amount == null
      ? labels.empty
      : formatAmount(answer.amount, currency);
  const reason = hasText(answer?.text ?? null)
    ? (answer?.text as string)
    : labels.empty;
  return quote(
    [
      `### ${labels.amount}`,
      "",
      amount,
      "",
      `### ${labels.reason}`,
      "",
      reason,
    ].join("\n"),
  );
}

/** The F/A/U line's value: the state as 11 shows it, an Assumption with its confidence. */
const fauText = (fau: NonNullable<AiAnswerInput["fau"]>) => {
  const state = i18n.t(`common:fauState.${fau.state}`);
  return fau.state === "assumption" && fau.confidence !== null
    ? i18n.t("ai:fauWithConfidence", {
        fau: state,
        confidence: i18n.t(`common:confidence.${fau.confidence}`),
      })
    : state;
};

const evidenceText = (evidence: readonly AiEvidence[]) =>
  evidence
    .map((piece) => {
      if (piece.type === "url") {
        return piece.note === null
          ? oneLine(piece.url)
          : i18n.t("ai:evidence.urlWithNote", {
              url: oneLine(piece.url),
              note: oneLine(piece.note),
            });
      }
      const topic = oneLine(piece.topic);
      return piece.date === null
        ? i18n.t("ai:evidence.researchLogUndated", { topic })
        : i18n.t("ai:evidence.researchLog", { date: piece.date, topic });
    })
    .join(i18n.t("ai:evidence.separator"));

function questionMarkdown(
  question: TemplateQuestion,
  answer: AiAnswerInput | undefined,
  input: AiExportInput,
): string {
  const labels = aiLabels();
  const parts = [
    `## [${question.key}] ${oneLine(question.title)}`,
    field(labels.question, escapeStructure(question.prompt)),
  ];
  if (input.includeExamples && hasText(question.example)) {
    parts.push(field(labels.example, escapeStructure(question.example ?? "")));
  }
  if (question.options?.kind === "choice") {
    parts.push(
      field(
        labels.choices,
        question.options.choices
          .map(oneLine)
          .join(i18n.t("ai:choiceSeparator")),
      ),
    );
  }
  parts.push(
    field(labels.currentAnswer),
    currentAnswerLines(question, answer, input.currency),
  );
  if (
    input.kind === "validation" &&
    question.hasFau &&
    answer?.fau !== undefined &&
    answer.fau.state !== "empty"
  ) {
    parts.push(field(labels.fau, fauText(answer.fau)));
  }
  const evidence = answer?.evidence ?? [];
  if (input.kind === "validation" && evidence.length > 0) {
    parts.push(field(labels.evidence, evidenceText(evidence)));
  }
  return parts.join("\n\n");
}

function questionJson(
  question: TemplateQuestion,
  answer: AiAnswerInput | undefined,
  input: AiExportInput,
): AiExportQuestion {
  const text = hasText(answer?.text ?? null) ? (answer?.text as string) : null;
  let shown: AiExportAnswer;
  if (question.answerType === "amount_with_reason") {
    shown = { amount: answer?.amount ?? null, reason: text };
  } else if (input.kind === "validation") {
    shown = {
      text,
      fau: answer?.fau?.fau ?? null,
      confidence: answer?.fau?.confidence ?? null,
      evidence: [...(answer?.evidence ?? [])],
    };
  } else {
    shown = { text };
  }
  return {
    id: question.key,
    section: question.sectionKey,
    title: question.title,
    question: question.prompt,
    example:
      input.includeExamples && hasText(question.example)
        ? question.example
        : null,
    hint: question.hint,
    answerType: question.answerType,
    ...(question.options?.kind === "choice"
      ? { choices: [...question.options.choices] }
      : {}),
    answer: shown,
  };
}

// ---- Reference ----

const label = (
  group: "competitorType" | "confidence" | "sourceType",
  value: string | null,
): string | null =>
  value === null ? null : i18n.t(`common:${group}.${value}` as never);

const keyNumbers = (metrics: KeyMetrics, currency: string) =>
  Object.fromEntries(
    KEY_METRIC_KEYS.map((key) => [
      key,
      {
        label: i18n.t(`common:metric.${key}`),
        value: formatMetric(key, keyMetricOf(metrics, key), currency),
      },
    ]),
  );

/** A table cell as 21 shows it. */
const cellText = (
  value: string | number | null | undefined,
  type: "text" | "number" | "percent" | "money",
  currency: string,
) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  switch (type) {
    case "money":
      return formatAmount(value, currency);
    case "percent":
      return formatInputPercent(value);
    default:
      return formatInputNumber(value);
  }
};

function buildReference(
  reference: ValidationReferenceInput | PlanReferenceInput,
  sections: readonly TemplateSection[],
  currency: string,
): AiReference {
  if (reference.kind === "business_plan") {
    return {
      keyNumbers: keyNumbers(reference.keyMetrics, currency),
      tables: sections.flatMap((section) =>
        section.questions.flatMap((question) => {
          if (question.options?.kind !== "table") return [];
          const { columns } = question.options;
          const rows = reference.tables.get(question.key) ?? [];
          return [
            {
              id: question.key,
              title: question.title,
              columns: columns.map((column) => column.label),
              rows: rows.map((row) =>
                columns.map((column) =>
                  cellText(row[column.key], column.type, currency),
                ),
              ),
            },
          ];
        }),
      ),
    };
  }
  return {
    keyNumbers: keyNumbers(reference.keyMetrics, currency),
    checks: reference.checks.map((check) => ({
      name: formatCheckName(check.key, check.params),
      state: i18n.t(`common:checkState.${check.state}`),
    })),
    competitors: reference.competitors.map((row) => ({
      name: row.name,
      type: label("competitorType", row.type),
      typicalPrice:
        [
          row.typicalPrice === null
            ? null
            : formatAmount(row.typicalPrice, currency),
          row.priceNote,
        ]
          .filter((part) => hasText(part))
          .join(" ") || null,
      strength: row.strength,
      weakness: row.weakness,
    })),
    researchLog: reference.researchLog.map((row) => ({
      date: row.observedOn,
      topic: row.topic,
      sourceType: label("sourceType", row.sourceType),
      supports: row.supportsChecks.map((check) =>
        i18n.t(`common:supportsCheck.${check}`),
      ),
    })),
    assumptions: reference.assumptions.map((row) => ({
      assumption: row.statement,
      confidence: label("confidence", row.confidence),
    })),
    risks: reference.risks.map((row) => ({
      risk: row.statement,
      probability: label("confidence", row.probability),
      impact: label("confidence", row.impact),
    })),
  };
}

/** One list item of the Reference: the parts that have a value, on one line. */
const item = (...parts: (string | null | undefined)[]) =>
  `- ${parts
    .filter((part): part is string => hasText(part ?? null))
    .map(oneLine)
    .join(i18n.t("ai:reference.separator"))}`;

const labelled = (key: string, value: string | null) =>
  value === null ? null : i18n.t(key as never, { value });

const tableCell = (value: string | null) =>
  value === null ? "" : oneLine(value).replaceAll("|", "\\|");

function referenceMarkdown(reference: AiReference): string {
  const parts: string[] = [];
  const list = (heading: string, items: string[]) => {
    if (items.length > 0) parts.push(`## ${heading}`, items.join("\n"));
  };
  list(
    i18n.t("ai:reference.keyNumbers"),
    Object.values(reference.keyNumbers).map(
      ({ label, value }) => `- ${label}: ${value}`,
    ),
  );
  list(
    i18n.t("ai:reference.checks"),
    (reference.checks ?? []).map(({ name, state }) => `- ${name}: ${state}`),
  );
  list(
    i18n.t("ai:reference.competitors"),
    (reference.competitors ?? []).map((row) =>
      item(
        row.name,
        row.type,
        row.typicalPrice,
        labelled("ai:reference.strength", row.strength),
        labelled("ai:reference.weakness", row.weakness),
      ),
    ),
  );
  list(
    i18n.t("ai:reference.researchLog"),
    (reference.researchLog ?? []).map((row) =>
      item(row.date, row.sourceType, row.topic, row.supports.join(", ")),
    ),
  );
  list(
    i18n.t("ai:reference.assumptions"),
    (reference.assumptions ?? []).map((row) =>
      item(row.assumption, labelled("ai:reference.confidence", row.confidence)),
    ),
  );
  list(
    i18n.t("ai:reference.risks"),
    (reference.risks ?? []).map((row) =>
      item(
        row.risk,
        labelled("ai:reference.probability", row.probability),
        labelled("ai:reference.impact", row.impact),
      ),
    ),
  );
  for (const table of reference.tables ?? []) {
    if (table.rows.length === 0) continue;
    parts.push(
      `## ${table.id} ${oneLine(table.title)}`,
      [
        `| ${table.columns.map(tableCell).join(" | ")} |`,
        `| ${table.columns.map(() => "---").join(" | ")} |`,
        ...table.rows.map((row) => `| ${row.map(tableCell).join(" | ")} |`),
      ].join("\n"),
    );
  }
  return parts.join("\n\n");
}

// ---- How to reply ----

/** `SA.INCOME.*` for each section of the amount questions among `questions`. */
const amountKeys = (questions: readonly TemplateQuestion[]) =>
  [
    ...new Set(
      questions
        .filter((question) => question.answerType === "amount_with_reason")
        .map((question) => `${question.key.replace(/\.[^.]*$/u, "")}.*`),
    ),
  ].join(", ");

function replyExample(
  questions: readonly TemplateQuestion[],
  answers: ReadonlyMap<string, AiAnswerInput>,
): AiReply {
  const text = questions.find(
    (question) => question.answerType !== "amount_with_reason",
  );
  const amount = questions.find(
    (question) => question.answerType === "amount_with_reason",
  );
  return {
    format: AI_REPLY_FORMAT,
    version: AI_FORMAT_VERSION,
    answers: [
      ...(text === undefined
        ? []
        : [{ id: text.key, text: i18n.t("ai:reply.placeholder") }]),
      ...(amount === undefined
        ? []
        : [
            {
              id: amount.key,
              amount: answers.get(amount.key)?.amount ?? 0,
              reason: i18n.t("ai:reply.reasonPlaceholder"),
            },
          ]),
    ],
  };
}

function howToReplyMarkdown(questions: readonly TemplateQuestion[]): string {
  const labels = aiLabels();
  const example =
    questions.find(
      (question) => question.answerType !== "amount_with_reason",
    ) ?? questions[0];
  const keys = amountKeys(questions);
  return [
    i18n.t("ai:reply.markdown"),
    ...(example === undefined
      ? []
      : [`## [${example.key}]\n${i18n.t("ai:reply.placeholder")}`]),
    [
      `- ${i18n.t("ai:reply.exactIds")}`,
      `- ${i18n.t("ai:reply.onlyUpdated")}`,
      `- ${i18n.t("ai:reply.noTranslation")}`,
      ...(keys === ""
        ? []
        : [
            `- ${i18n.t("ai:reply.amounts", { keys, amount: labels.amount, reason: labels.reason })}`,
          ]),
    ].join("\n"),
  ].join("\n\n");
}

const replyInstructions = (questions: readonly TemplateQuestion[]) => {
  const keys = amountKeys(questions);
  return [
    i18n.t("ai:reply.json"),
    ...(keys === "" ? [] : [i18n.t("ai:reply.jsonAmounts", { keys })]),
  ].join(" ");
};

// ---- The export ----

/** The section keys a scope names, in template order. */
const scopeKeys = (scope: AiScope, covered: readonly TemplateSection[]) =>
  scope.kind === "all" ? null : covered.map((section) => section.key);

/** `scope:` of the header comment (design-spec 6.6 規則). */
const scopeHeader = (scope: AiScope, covered: readonly TemplateSection[]) =>
  scope.kind === "all"
    ? "all"
    : scope.kind === "part"
      ? `part:${scope.part}`
      : covered.map((section) => section.key).join(",");

const jsonScope = (
  input: AiExportInput,
  covered: readonly TemplateSection[],
): AiExportScope => {
  if (input.kind === "business_plan") {
    return {
      planName: input.planName ?? "",
      items:
        input.scope.kind === "items"
          ? covered.map((section) => Number(section.key))
          : null,
      part: input.scope.kind === "part" ? input.scope.part : null,
    };
  }
  const sections = scopeKeys(input.scope, covered);
  return input.kind === "validation"
    ? { ideaName: input.ideaName ?? "", sections }
    : { sections };
};

/** The idea a validation or plan export names, "{idea} / {plan}" for a plan. */
const subjectName = (input: AiExportInput) =>
  input.kind === "business_plan"
    ? `${input.ideaName ?? ""} / ${input.planName ?? ""}`
    : input.kind === "validation"
      ? (input.ideaName ?? "")
      : (input.ownerName ?? "");

const UNSAFE_IN_FILE_NAME = /[\\/:*?"<>|\p{Cc}]/gu;

/** A name safe in a file name: the characters files cannot have become "-". */
const fileNamePart = (text: string) =>
  text.replace(UNSAFE_IN_FILE_NAME, "-").replace(/\s+/gu, " ").trim();

/** A value in the header comment, which must stay one comment on one line. */
const headerValue = (text: string) => oneLine(text).replaceAll("-->", "->");

/**
 * The export of 24 (design-spec 6.6, SDD 5.10 X1) for a scope `scopeSections` accepted:
 * its importable questions not hidden, in template order, each with its answer, and
 * the Markdown and JSON around them. Empty answers are left out unless
 * `includeEmpty`; nothing is recorded.
 */
export function buildAiExport(
  input: AiExportInput,
  covered: readonly TemplateSection[],
): AiExportResult {
  const labels = aiLabels();
  const texts = new Map(
    [...input.answers].map(([key, answer]) => [key, { text: answer.text }]),
  );
  const shown = covered.flatMap((section) =>
    section.questions.filter(
      (question) =>
        isImportable(question, input.kind) && isQuestionShown(question, texts),
    ),
  );
  const allEmpty = shown.every((question) =>
    isEmptyAnswer(question, input.answers.get(question.key)),
  );
  const questions = input.includeEmpty
    ? shown
    : shown.filter(
        (question) => !isEmptyAnswer(question, input.answers.get(question.key)),
      );
  const replyQuestions = questions.length > 0 ? questions : shown;
  const prompt = hasText(input.prompt) ? input.prompt : null;
  const reference =
    input.reference === null
      ? null
      : buildReference(input.reference, covered, input.currency);

  const header = [
    `moonx-export v${AI_FORMAT_VERSION}`,
    `kind: ${input.kind}`,
    `scope: ${scopeHeader(input.scope, covered)}`,
    ...(input.kind === "self_analysis"
      ? []
      : [`idea: ${headerValue(subjectName(input))}`]),
    `exported: ${formatIsoDateTime(input.exportedAt, { timeZone: input.timeZone })}`,
  ].join(" | ");
  const sections = [
    `<!-- ${header} -->`,
    ...(prompt === null
      ? []
      : [`# ${labels.prompt}`, escapeStructure(prompt.trim())]),
    `# ${labels.questions}`,
    ...questions.map((question) =>
      questionMarkdown(question, input.answers.get(question.key), input),
    ),
    ...(reference === null
      ? []
      : [`# ${labels.reference}`, referenceMarkdown(reference)].filter(
          (part) => part !== "",
        )),
    `# ${labels.howToReply}`,
    howToReplyMarkdown(replyQuestions),
  ];

  const json: AiExportJson = {
    format: AI_EXPORT_FORMAT,
    version: AI_FORMAT_VERSION,
    exportedAt: formatIsoDateTime(
      input.exportedAt,
      { timeZone: input.timeZone },
      { seconds: true },
    ),
    kind: input.kind,
    scope: jsonScope(input, covered),
    templateVersion: input.templateVersion,
    currency: input.currency,
    ...(prompt === null ? {} : { prompt }),
    questions: questions.map((question) =>
      questionJson(question, input.answers.get(question.key), input),
    ),
    ...(reference === null ? {} : { reference }),
    reply: {
      instructions: replyInstructions(replyQuestions),
      example: replyExample(replyQuestions, input.answers),
    },
  };

  return {
    markdown: `${sections.join("\n\n")}\n`,
    json,
    fileBaseName: fileNamePart(
      `moonx-export-${input.kind}-${subjectName(input)}-${formatIsoDate(
        input.exportedAt,
        { timeZone: input.timeZone },
      )}`,
    ),
    questionCount: questions.length,
    allEmpty,
  };
}
