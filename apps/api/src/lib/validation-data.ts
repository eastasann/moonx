import { schema } from "@moonx/db";
import {
  buildKeyMetrics,
  type CheckRules,
  type CostRowInput,
  computeEconomics,
  computeNextSteps,
  DEFAULT_CHECK_RULES,
  deriveFauState,
  type EconomicsInputValues,
  evaluateChecks,
  type FauItem,
  SECTION_KEYS,
  type SectionKey,
  summarizeFau,
} from "@moonx/domain";
import type {
  CheckResult,
  Classification,
  Confidence,
  EconomicsField,
  EconomicsResult,
  Evidence,
  Fau,
  FauBreakdown,
  FauState,
  KeyMetrics,
  NextStep,
} from "@moonx/schemas";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Executor } from "./db";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

export type AnswerRow = Row<typeof schema.validationAnswers>;
export type ResearchLogRow = Row<typeof schema.researchLogEntries>;
export type CompetitorRow = Row<typeof schema.competitors>;
export type AssumptionRow = Row<typeof schema.assumptions>;
export type RiskRow = Row<typeof schema.risks>;
export type CostItemRow = Row<typeof schema.costItems>;
export type EconomicsInputRow = Row<typeof schema.economicsInputs>;
export type EvidenceRow = Row<typeof schema.evidenceLinks>;

/** A question of the validation's pinned template version, as the calculations need it. */
export interface QuestionDef {
  key: string;
  sectionKey: string;
  answerType: Row<typeof schema.templateQuestions>["answerType"];
  options: unknown;
  displayCondition: Record<string, string[]> | null;
  hasFau: boolean;
}

/** Every row of one validation that the calculations and the screens read. */
export interface ValidationData {
  validationId: string;
  templateVersionId: string;
  questions: QuestionDef[];
  rules: CheckRules;
  answers: AnswerRow[];
  /** Not deleted. */
  researchLogs: ResearchLogRow[];
  competitors: CompetitorRow[];
  assumptions: AssumptionRow[];
  risks: RiskRow[];
  costItems: CostItemRow[];
  economicsInputs: EconomicsInputRow[];
  /** Evidence links that have not been removed, including those that point at a deleted log. */
  evidence: EvidenceRow[];
  /** Research logs the evidence points at, deleted ones included. */
  evidenceLogs: Map<
    string,
    Pick<ResearchLogRow, "id" | "observedOn" | "topic" | "sourceType" | "deletedAt">
  >;
}

/** The seven economics inputs in screen order. */
export const ECONOMICS_FIELDS: EconomicsField[] = [
  "selling_price",
  "operating_days",
  "target_margin",
  "units_conservative",
  "units_expected",
  "units_strong",
  "units_capacity",
];

const COST_CATEGORY_ORDER = { initial: 0, monthly_fixed: 1, variable: 2 } as const;

const group = <T>(rows: T[], key: (row: T) => string) => {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
};

/** Reads everything for the given validations in a fixed number of queries (SDD 7.3). */
export async function loadValidationData(
  db: Executor,
  validationIds: string[],
): Promise<Map<string, ValidationData>> {
  const result = new Map<string, ValidationData>();
  if (validationIds.length === 0) return result;
  const validations = await db
    .select({ id: schema.validations.id, templateVersionId: schema.validations.templateVersionId })
    .from(schema.validations)
    .where(inArray(schema.validations.id, validationIds));
  const versionIds = [...new Set(validations.map((v) => v.templateVersionId))];

  const [
    questionRows,
    ruleRows,
    answers,
    logs,
    competitors,
    assumptions,
    risks,
    costs,
    econ,
    evidence,
  ] = await Promise.all([
    db
      .select({
        versionId: schema.templateQuestions.templateVersionId,
        key: schema.templateQuestions.questionKey,
        sectionKey: schema.templateSections.key,
        answerType: schema.templateQuestions.answerType,
        options: schema.templateQuestions.options,
        displayCondition: schema.templateQuestions.displayCondition,
        hasFau: schema.templateQuestions.hasFau,
      })
      .from(schema.templateQuestions)
      .innerJoin(
        schema.templateSections,
        eq(schema.templateSections.id, schema.templateQuestions.templateSectionId),
      )
      .where(inArray(schema.templateQuestions.templateVersionId, versionIds))
      .orderBy(asc(schema.templateSections.sortOrder), asc(schema.templateQuestions.sortOrder)),
    db
      .select()
      .from(schema.templateCheckRules)
      .where(inArray(schema.templateCheckRules.templateVersionId, versionIds)),
    db
      .select()
      .from(schema.validationAnswers)
      .where(inArray(schema.validationAnswers.validationId, validationIds)),
    db
      .select()
      .from(schema.researchLogEntries)
      .where(
        and(
          inArray(schema.researchLogEntries.validationId, validationIds),
          isNull(schema.researchLogEntries.deletedAt),
        ),
      ),
    db
      .select()
      .from(schema.competitors)
      .where(
        and(
          inArray(schema.competitors.validationId, validationIds),
          isNull(schema.competitors.deletedAt),
        ),
      )
      .orderBy(asc(schema.competitors.sortOrder)),
    db
      .select()
      .from(schema.assumptions)
      .where(
        and(
          inArray(schema.assumptions.validationId, validationIds),
          isNull(schema.assumptions.deletedAt),
        ),
      )
      .orderBy(asc(schema.assumptions.sortOrder)),
    db
      .select()
      .from(schema.risks)
      .where(
        and(inArray(schema.risks.validationId, validationIds), isNull(schema.risks.deletedAt)),
      ),
    db
      .select()
      .from(schema.costItems)
      .where(
        and(
          inArray(schema.costItems.validationId, validationIds),
          isNull(schema.costItems.deletedAt),
        ),
      )
      .orderBy(asc(schema.costItems.sortOrder)),
    db
      .select()
      .from(schema.economicsInputs)
      .where(inArray(schema.economicsInputs.validationId, validationIds)),
    db
      .select()
      .from(schema.evidenceLinks)
      .where(
        and(
          inArray(schema.evidenceLinks.validationId, validationIds),
          isNull(schema.evidenceLinks.deletedAt),
        ),
      ),
  ]);

  const logIds = [...new Set(evidence.map((e) => e.researchLogEntryId).filter((id) => id != null))];
  const evidenceLogRows =
    logIds.length === 0
      ? []
      : await db
          .select({
            id: schema.researchLogEntries.id,
            observedOn: schema.researchLogEntries.observedOn,
            topic: schema.researchLogEntries.topic,
            sourceType: schema.researchLogEntries.sourceType,
            deletedAt: schema.researchLogEntries.deletedAt,
          })
          .from(schema.researchLogEntries)
          .where(inArray(schema.researchLogEntries.id, logIds));
  const evidenceLogs = new Map(evidenceLogRows.map((l) => [l.id, l]));

  const questionsByVersion = group(questionRows, (q) => q.versionId);
  const rulesByVersion = group(ruleRows, (r) => r.templateVersionId);
  const by = {
    answers: group(answers, (r) => r.validationId),
    logs: group(logs, (r) => r.validationId),
    competitors: group(competitors, (r) => r.validationId),
    assumptions: group(assumptions, (r) => r.validationId),
    risks: group(risks, (r) => r.validationId),
    costs: group(costs, (r) => r.validationId),
    econ: group(econ, (r) => r.validationId),
    evidence: group(evidence, (r) => r.validationId),
  };

  for (const v of validations) {
    result.set(v.id, {
      validationId: v.id,
      templateVersionId: v.templateVersionId,
      questions: (questionsByVersion.get(v.templateVersionId) ?? []).map((q) => ({
        key: q.key,
        sectionKey: q.sectionKey,
        answerType: q.answerType,
        options: q.options,
        displayCondition: (q.displayCondition as Record<string, string[]> | null) ?? null,
        hasFau: q.hasFau,
      })),
      rules: checkRulesOf(rulesByVersion.get(v.templateVersionId) ?? []),
      answers: by.answers.get(v.id) ?? [],
      researchLogs: by.logs.get(v.id) ?? [],
      competitors: by.competitors.get(v.id) ?? [],
      assumptions: by.assumptions.get(v.id) ?? [],
      risks: by.risks.get(v.id) ?? [],
      costItems: by.costs.get(v.id) ?? [],
      economicsInputs: by.econ.get(v.id) ?? [],
      evidence: by.evidence.get(v.id) ?? [],
      evidenceLogs,
    });
  }
  return result;
}

function checkRulesOf(rows: { checkKey: string; params: unknown }[]): CheckRules {
  const rules: CheckRules = structuredClone(DEFAULT_CHECK_RULES);
  for (const row of rows) {
    const params = row.params as Record<string, number>;
    if (row.checkKey === "competitors") rules.competitors = { ...rules.competitors, ...params };
    if (row.checkKey === "local_price") rules.local_price = { ...rules.local_price, ...params };
    if (row.checkKey === "permits") rules.permits = { ...rules.permits, ...params };
    if (row.checkKey === "demand_signal")
      rules.demand_signal = { ...rules.demand_signal, ...params };
  }
  return rules;
}

/** An evidence link counts unless it points at a deleted research log (design-spec 6.0.3). */
export function isActiveEvidence(data: ValidationData, link: EvidenceRow): boolean {
  if (link.researchLogEntryId == null) return true;
  return data.evidenceLogs.get(link.researchLogEntryId)?.deletedAt == null;
}

/** The evidence links attached to one answer, number or row. */
export function evidenceFor(
  data: ValidationData,
  target: { type: EvidenceRow["targetType"]; id: string; key: string | null },
): EvidenceRow[] {
  return data.evidence.filter(
    (e) =>
      e.targetType === target.type &&
      e.targetId === target.id &&
      (e.targetKey ?? null) === target.key,
  );
}

/** Maps an evidence link to the Evidence of SDD 5.2, flagging a deleted research log. */
export function toEvidence(data: ValidationData, link: EvidenceRow): Evidence {
  const log = link.researchLogEntryId ? data.evidenceLogs.get(link.researchLogEntryId) : null;
  return {
    id: link.id,
    kind: link.researchLogEntryId ? "research_log" : "url",
    researchLog: log
      ? {
          id: log.id,
          observedOn: log.observedOn,
          topic: log.topic,
          sourceType: log.sourceType,
          deleted: log.deletedAt != null,
        }
      : null,
    url: link.url,
    note: link.note,
  };
}

/** The F/A/U block of an answer or number (SDD 5.2 Classification). */
export function buildClassification(
  data: ValidationData,
  input: {
    hasValue: boolean;
    fau: Fau | null;
    confidence: Confidence | null;
    links: EvidenceRow[];
  },
): Classification {
  const state = deriveFauState({
    hasValue: input.hasValue,
    fau: input.fau,
    confidence: input.confidence,
    activeEvidenceCount: input.links.filter((l) => isActiveEvidence(data, l)).length,
  });
  return {
    fau: input.fau,
    confidence: input.fau === "assumption" ? input.confidence : null,
    state,
    evidence: input.links.map((l) => toEvidence(data, l)),
  };
}

/** Whether an answer has text: blank text counts as no answer. */
export const hasText = (text: string | null | undefined) => text != null && text.trim() !== "";

/** A question is shown when every condition's answer is one of the allowed values. */
export function isQuestionVisible(
  question: Pick<QuestionDef, "displayCondition">,
  textOf: (questionKey: string) => string | null,
): boolean {
  if (!question.displayCondition) return true;
  return Object.entries(question.displayCondition).every(([key, allowed]) => {
    const text = textOf(key);
    return text != null && allowed.includes(text);
  });
}

/** Progress of one home section (design-spec 6.1 "セクションの進み具合"). */
export interface SectionSummary {
  key: SectionKey;
  answered: number | null;
  total: number | null;
  count: number | null;
  countB?: number | null;
  fau: FauBreakdown | null;
}

/** Everything the home, lists and decisions calculate from the stored rows. */
export interface ValidationState {
  costRows: CostRowInput[];
  economicsValues: EconomicsInputValues;
  economics: EconomicsResult;
  keyMetrics: KeyMetrics;
  checks: CheckResult[];
  /** Items in screen order: 01, 02, 04, 05, 06-08, 10. */
  fauItems: FauItem[];
  fau: FauBreakdown;
  nextSteps: NextStep[];
  sections: SectionSummary[];
}

const ECON_VALUE_KEY: Record<EconomicsField, keyof EconomicsInputValues> = {
  selling_price: "sellingPrice",
  operating_days: "operatingDays",
  target_margin: "targetMargin",
  units_conservative: "unitsConservative",
  units_expected: "unitsExpected",
  units_strong: "unitsStrong",
  units_capacity: "unitsCapacity",
};

/** Screen the question of a section opens (design-spec 6.1 "操作"). */
export const QUESTION_SCREEN: Record<string, number> = { "04": 15, "08": 18 };

/**
 * Computes checks, F/A/U, key metrics, next steps and section progress from the stored rows with
 * the pure functions of `packages/domain`. Nothing here is saved (SDD 6.4).
 */
export function computeValidationState(
  data: ValidationData,
  ids: { workspaceId: string; ideaId: string },
): ValidationState {
  const answerOf = new Map(data.answers.map((a) => [a.questionKey, a]));
  const textOf = (key: string) => {
    const t = answerOf.get(key)?.text;
    return hasText(t) ? (t as string) : null;
  };
  const linksOf = (type: EvidenceRow["targetType"], id: string, key: string | null) =>
    evidenceFor(data, { type, id, key });
  const stateOf = (
    hasValue: boolean,
    fau: Fau | null,
    confidence: Confidence | null,
    links: EvidenceRow[],
  ): FauState =>
    deriveFauState({
      hasValue,
      fau,
      confidence,
      activeEvidenceCount: links.filter((l) => isActiveEvidence(data, l)).length,
    });

  const questionItem = (q: QuestionDef): FauItem => {
    const a = answerOf.get(q.key);
    const state = stateOf(
      hasText(a?.text),
      a?.fau ?? null,
      a?.confidence ?? null,
      linksOf("validation_answer", data.validationId, q.key),
    );
    return {
      state,
      confidence: a?.confidence ?? null,
      link: {
        screen: QUESTION_SCREEN[q.sectionKey] ?? 11,
        workspaceId: ids.workspaceId,
        ideaId: ids.ideaId,
        sectionKey: q.sectionKey,
        questionKey: q.key,
      },
    };
  };
  const visibleQuestions = (sectionKey: string) =>
    data.questions.filter(
      (q) => q.sectionKey === sectionKey && q.hasFau && isQuestionVisible(q, textOf),
    );

  const costRows: CostRowInput[] = [];
  const costItems = [...data.costItems].sort(
    (a, b) =>
      COST_CATEGORY_ORDER[a.category] - COST_CATEGORY_ORDER[b.category] ||
      a.sortOrder - b.sortOrder,
  );
  const costFau: FauItem[] = costItems.map((row) => {
    const hasValue =
      row.inputMode === "percent_of_price" ? row.percent != null : row.amount != null;
    const state = stateOf(hasValue, row.fau, row.confidence, linksOf("cost_item", row.id, null));
    costRows.push({
      id: row.id,
      category: row.category,
      templateKey: row.templateKey,
      inputMode: row.inputMode,
      amount: row.amount,
      percent: row.percent,
      fauState: state,
    });
    return {
      state,
      confidence: row.confidence,
      link: { screen: 17, workspaceId: ids.workspaceId, ideaId: ids.ideaId, rowId: row.id },
    };
  });

  const economicsValues: EconomicsInputValues = {
    sellingPrice: null,
    operatingDays: null,
    targetMargin: null,
    unitsConservative: null,
    unitsExpected: null,
    unitsStrong: null,
    unitsCapacity: null,
  };
  const econFau: FauItem[] = ECONOMICS_FIELDS.map((field) => {
    const row = data.economicsInputs.find((r) => r.fieldKey === field);
    if (row?.value != null) economicsValues[ECON_VALUE_KEY[field]] = row.value;
    const state = stateOf(
      row?.value != null,
      row?.fau ?? null,
      row?.confidence ?? null,
      linksOf("economics_input", data.validationId, field),
    );
    return {
      state,
      confidence: row?.confidence ?? null,
      link: { screen: 18, workspaceId: ids.workspaceId, ideaId: ids.ideaId, field },
    };
  });

  const q01 = visibleQuestions("01").map(questionItem);
  const q02 = visibleQuestions("02").map(questionItem);
  const q04 = visibleQuestions("04").map(questionItem);
  const q08 = visibleQuestions("08").map(questionItem);
  const q10 = visibleQuestions("10").map(questionItem);
  const fauItems = [...q01, ...q02, ...q04, ...costFau, ...econFau, ...q08, ...q10];

  const economics = computeEconomics(costRows, economicsValues);
  const checks = evaluateChecks({
    workspaceId: ids.workspaceId,
    ideaId: ids.ideaId,
    competitors: data.competitors,
    researchLogs: data.researchLogs,
    costRows,
    economics: economicsValues,
    rules: data.rules,
  });

  const progress = (items: FauItem[]) => ({
    answered: items.filter((i) => i.state !== "empty").length,
    total: items.length,
    fau: summarizeFau(items),
  });
  const sectionOf = (key: SectionKey): SectionSummary => {
    switch (key) {
      case "01":
        return { key, ...progress(q01), count: null };
      case "02":
        return { key, ...progress(q02), count: null };
      case "10":
        return { key, ...progress(q10), count: null };
      case "03":
        return { key, answered: null, total: null, count: data.researchLogs.length, fau: null };
      case "04":
        return {
          key,
          answered: null,
          total: null,
          count: data.competitors.length,
          fau: summarizeFau(q04),
        };
      case "05":
        return { key, ...progress(costFau), count: null };
      case "06-08":
        return {
          key,
          answered: econFau.filter((i) => i.state !== "empty").length,
          total: econFau.length,
          count: null,
          fau: summarizeFau([...econFau, ...q08]),
        };
      case "09":
        return {
          key,
          answered: null,
          total: null,
          count: data.assumptions.length,
          countB: data.risks.length,
          fau: null,
        };
    }
  };
  const sections = SECTION_KEYS.map(sectionOf);
  const hasInput = (key: SectionKey): boolean => {
    const s = sections.find((x) => x.key === key);
    if (!s) return false;
    if (key === "09") return (s.count ?? 0) + (s.countB ?? 0) > 0;
    if (key === "03" || key === "04") {
      return (s.count ?? 0) > 0 || (key === "04" && s.fau != null && s.fau.empty < q04.length);
    }
    return (s.answered ?? 0) > 0;
  };

  return {
    costRows,
    economicsValues,
    economics,
    keyMetrics: buildKeyMetrics(economics, economicsValues, costRows),
    checks,
    fauItems,
    fau: summarizeFau(fauItems),
    nextSteps: computeNextSteps({
      workspaceId: ids.workspaceId,
      ideaId: ids.ideaId,
      fauItems,
      sections: SECTION_KEYS.map((key) => ({ key, hasInput: hasInput(key) })),
      checks,
    }),
    sections,
  };
}

/** The four scalar metrics lists and the home show (SDD 5.6 IdeaSummary). */
export function pickMetrics<K extends string>(metrics: KeyMetrics, keys: readonly K[]) {
  const out = {} as Record<K, KeyMetrics[string]>;
  for (const key of keys) {
    out[key] = metrics[key] ?? { value: null, bound: "exact", reason: "empty" };
  }
  return out;
}

/** The four metrics lists and the home show (SDD 5.6). */
export const LIST_METRIC_KEYS = [
  "initial_cost_total",
  "break_even_units_day",
  "expected_operating_profit",
  "payback_months",
] as const;
