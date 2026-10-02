import {
  type BuiltExport,
  buildExport,
  type ExportEvidence,
  type ExportQuestion,
  exportFileBaseName,
  formatKeyMetric,
} from "@moonx/domain";
import { type AiExportQuery, splitCsv } from "@moonx/schemas";
import { ApiError } from "../errors";
import { type AiTarget, IMPORTABLE_TYPES, type TargetAnswer } from "./ai-target";
import { i18n } from "./i18n";
import { hasText } from "./validation-data";
import { orderRisks } from "./validation-table-dto";

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

/** ISO 8601 with the UTC offset of `timeZone`, e.g. `2026-10-01T10:00:00+08:00` (design-spec 6.6). */
function isoWithOffset(date: Date, timeZone: string): string {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    zone = "UTC";
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMinutes = Math.round((local - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Sections of a validation that the question form and the AI exchange cover (design-spec 6.6). */
const VALIDATION_QUESTION_SECTIONS = new Set(["01", "02", "04", "08", "10"]);

/** The questions an export covers, in display order: the scope of the query, importable types only. */
function questionsInScope(target: AiTarget, query: AiExportQuery) {
  const wantedSections = query.sections ? new Set(splitCsv(query.sections)) : null;
  const wantedItems = query.items
    ? new Set(splitCsv(query.items)?.map((n) => n.padStart(2, "0")))
    : null;
  const out: {
    sectionKey: string;
    sectionTitle: string;
    question: AiTarget["sections"][number]["rows"][number];
  }[] = [];
  for (const { section, rows } of target.sections) {
    if (target.kind === "validation" && !VALIDATION_QUESTION_SECTIONS.has(section.key)) continue;
    if (wantedSections && !wantedSections.has(section.key)) continue;
    if (target.kind === "business_plan") {
      if (wantedItems && !wantedItems.has(section.key)) continue;
      if (query.part && section.part !== query.part) continue;
    }
    for (const question of rows) {
      if (!IMPORTABLE_TYPES.has(question.answerType)) continue;
      if (target.answers.get(question.key)?.hidden) continue;
      out.push({ sectionKey: section.key, sectionTitle: section.title, question });
    }
  }
  return out;
}

const answered = (a: TargetAnswer | undefined) =>
  a != null && (hasText(a.text) || a.amount != null);

function evidenceOf(answer: TargetAnswer): ExportEvidence[] {
  return (answer.classification?.evidence ?? []).flatMap((e): ExportEvidence[] => {
    if (e.kind === "research_log" && e.researchLog && !e.researchLog.deleted) {
      return [{ type: "research_log", date: e.researchLog.observedOn, topic: e.researchLog.topic }];
    }
    return e.url ? [{ type: "url", url: e.url }] : [];
  });
}

const KEY_NUMBERS = [
  "initial_cost_total",
  "monthly_fixed_total",
  "variable_cost_per_unit",
  "selling_price",
  "contribution_margin",
  "contribution_margin_rate",
  "break_even_units_month",
  "break_even_units_day",
  "expected_revenue",
  "expected_operating_profit",
  "payback_months",
  "simple_roi",
  "capacity_units_day",
] as const;

const RESEARCH_LOG_LINES = 10;

type Row = Record<string, string | number | null>;

const mdTable = (columns: string[], rows: (string | number | null)[][]) =>
  [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map(
      (r) =>
        `| ${r
          .map((c) =>
            String(c ?? "")
              .replaceAll("|", "\\|")
              .replace(/\s+/g, " "),
          )
          .join(" | ")} |`,
    ),
  ].join("\n");

/**
 * The "Reference (read-only)" part (design-spec 6.6): key numbers, check states, competitors, the
 * research log, assumptions and risks, and for a plan the table sub-items in scope. They help the
 * AI answer but are never imported. A self analysis has none.
 */
function buildReference(
  target: AiTarget,
  tables: { title: string; columns: string[]; rows: Row[]; keys: string[] }[],
): { markdown: string; json: unknown } | null {
  if (!target.validation) return null;
  const { data, state } = target.validation;
  const currency = target.currency ?? "PHP";
  const keyNumbers = KEY_NUMBERS.map((key) => ({
    key,
    label: t(`plan:metric.${key}`),
    value: formatKeyMetric(key, state.keyMetrics[key], currency),
  }));
  const checks = state.checks.map((c) => ({
    key: c.key,
    label: t(`validation:checks.${c.key}.label`, c.params),
    state: c.state,
    count: c.count,
  }));
  const competitors = data.competitors.map((c) => ({
    name: c.name,
    type: c.type ?? null,
    typicalPrice: c.typicalPrice ?? null,
    strength: c.strength ?? null,
    weakness: c.weakness ?? null,
  }));
  const research = [...data.researchLogs]
    .sort((a, b) => (b.observedOn ?? "").localeCompare(a.observedOn ?? ""))
    .slice(0, RESEARCH_LOG_LINES)
    .map((r) => ({
      observedOn: r.observedOn ?? null,
      topic: r.topic,
      sourceType: r.sourceType ?? null,
    }));
  const assumptions = data.assumptions.map((a) => ({
    statement: a.statement,
    confidence: a.confidence ?? null,
    whyBelieve: a.whyBelieve ?? null,
  }));
  const risks = orderRisks(data.risks).map((r) => ({
    statement: r.statement,
    probability: r.probability ?? null,
    impact: r.impact ?? null,
    mitigation: r.mitigation ?? null,
  }));
  const none = t("plan:export.none");
  const section = (title: string, body: string) => `## ${title}\n\n${body}`;
  const blocks = [
    section(
      t("plan:export.keyNumbers"),
      keyNumbers.map((k) => `- ${k.label}: ${k.value}`).join("\n"),
    ),
    section(
      t("plan:export.checks"),
      checks
        .map(
          (c) =>
            `- ${c.label}: ${t(`validation:checks.state.${c.state}`)}${c.count != null ? ` (${c.count})` : ""}`,
        )
        .join("\n"),
    ),
    section(
      t("plan:export.competitors"),
      competitors.length === 0
        ? none
        : mdTable(
            (["name", "type", "typicalPrice", "strength", "weakness"] as const).map((k) =>
              t(`plan:export.competitorColumns.${k}`),
            ),
            competitors.map((c) => [c.name, c.type, c.typicalPrice, c.strength, c.weakness]),
          ),
    ),
    section(
      t("plan:export.researchLog"),
      research.length === 0
        ? none
        : research.map((r) => `- ${[r.observedOn, r.topic].filter(Boolean).join(" ")}`).join("\n"),
    ),
    section(
      t("plan:export.assumptions"),
      assumptions.length === 0
        ? none
        : assumptions
            .map((a) => `- ${a.statement}${a.confidence ? ` (${a.confidence})` : ""}`)
            .join("\n"),
    ),
    section(
      t("plan:export.risks"),
      risks.length === 0
        ? none
        : risks
            .map(
              (r) =>
                `- ${r.statement} [impact: ${r.impact ?? "-"}, probability: ${r.probability ?? "-"}]`,
            )
            .join("\n"),
    ),
    ...tables.map((table) =>
      section(
        table.title,
        table.rows.length === 0
          ? none
          : mdTable(
              table.columns,
              table.rows.map((row) => table.keys.map((key) => row[key] ?? null)),
            ),
      ),
    ),
  ];
  return {
    markdown: blocks.join("\n\n"),
    json: {
      keyNumbers: Object.fromEntries(keyNumbers.map((k) => [k.key, k.value])),
      checks,
      competitors,
      researchLog: research,
      assumptions,
      risks,
      tables: tables.map((tb) => ({ title: tb.title, rows: tb.rows })),
    },
  };
}

/** Table sub-items of the plan items in scope, for the Reference of a plan export. */
function planTables(target: AiTarget, sectionKeys: Set<string>) {
  return target.sections
    .filter(({ section }) => sectionKeys.has(section.key))
    .flatMap(({ rows }) => rows)
    .filter((q) => q.options?.kind === "table")
    .map((q) => {
      const options = q.options as Extract<NonNullable<typeof q.options>, { kind: "table" }>;
      return {
        title: `${q.key} ${q.title}`,
        columns: options.columns.map((c) => c.label),
        keys: options.columns.map((c) => c.key),
        rows:
          (target.plan?.answers.find((a) => a.questionKey === q.key)?.rows as Row[] | null) ?? [],
      };
    });
}

/** The caller's context an export needs besides the target. */
export interface ExportEnv {
  now: Date;
  timeZone: string;
}

/**
 * X1. Builds the Markdown and JSON an AI can be given: the scope's questions with their current
 * answers (a validation's with F/A/U and evidence), the template's prompt, and optionally the
 * reference. Nothing is recorded (design-spec 6.6). 422 EMPTY_SCOPE when the scope has no question.
 */
export function exportForAi(
  target: AiTarget,
  query: AiExportQuery,
  env: ExportEnv,
): BuiltExport & { fileBaseName: string } {
  const scoped = questionsInScope(target, query);
  if (scoped.length === 0) throw new ApiError("EMPTY_SCOPE", "The scope has no questions");
  const kept =
    query.includeEmpty === "true"
      ? scoped
      : scoped.filter(({ question }) => answered(target.answers.get(question.key)));
  const questions: ExportQuestion[] = kept.map(({ sectionKey, sectionTitle, question }) => {
    const answer = target.answers.get(question.key) as TargetAnswer;
    const isValidation = target.kind === "validation";
    return {
      id: question.key,
      section: sectionKey,
      sectionTitle,
      title: question.title,
      question: question.prompt,
      example: question.example,
      hint: question.hint,
      answerType: question.answerType,
      options: question.options,
      answer: {
        text: answer.text,
        amount: answer.amount,
        ...(isValidation
          ? {
              fau: answer.classification?.fau ?? null,
              confidence: answer.classification?.confidence ?? null,
              evidence: evidenceOf(answer),
            }
          : {}),
      },
    };
  });

  const sectionKeys = [...new Set(scoped.map((s) => s.sectionKey))];
  const exportedAt = isoWithOffset(env.now, env.timeZone);
  const subjectName = target.plan
    ? `${target.plan.idea.name} / ${target.plan.plan.name}`
    : target.kind === "validation"
      ? target.name
      : null;
  const scopeJson =
    target.kind === "business_plan"
      ? { planName: target.name, items: sectionKeys.map(Number), part: query.part ?? null }
      : target.kind === "validation"
        ? { ideaName: target.name, sections: sectionKeys }
        : { sections: sectionKeys };
  const scopeLabel =
    target.kind === "business_plan" && query.part && !query.items
      ? `part:${query.part}`
      : sectionKeys.length === target.sections.length
        ? "all"
        : sectionKeys.join(",");
  const reference =
    query.includeReference === "true"
      ? buildReference(
          target,
          target.kind === "business_plan" ? planTables(target, new Set(sectionKeys)) : [],
        )
      : null;
  const built = buildExport({
    kind: target.kind,
    scopeLabel,
    scope: scopeJson,
    subjectName,
    exportedAt,
    templateVersion: target.templateVersionNumber,
    currency: target.currency,
    prompt: target.aiPrompt,
    questions,
    includeExamples: query.includeExamples === "true",
    reference,
  });
  return {
    ...built,
    allEmpty: scoped.every(({ question }) => !answered(target.answers.get(question.key))),
    fileBaseName: exportFileBaseName(target.kind, subjectName ?? target.name, exportedAt),
  };
}
