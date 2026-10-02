import type { schema } from "@moonx/db";

/**
 * The JSON that `change_history.before` / `after` hold for each kind of item. The history panel
 * shows these as they are and "revert" (Step 8) writes them back, so the shape of a type changes
 * only together with a reader of old rows. `evidence` is the ids of the active evidence links.
 */

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

export interface AnswerSnapshot {
  text: string | null;
  fau: string | null;
  confidence: string | null;
  evidence: string[];
}

/** Snapshot of a validation answer; `evidence` are the ids of its active evidence links. */
export function answerSnapshot(
  row: Pick<Row<typeof schema.validationAnswers>, "text" | "fau" | "confidence"> | null,
  evidence: string[],
): AnswerSnapshot {
  return {
    text: row?.text ?? null,
    fau: row?.fau ?? null,
    confidence: row?.confidence ?? null,
    evidence: [...evidence].sort(),
  };
}

/** Snapshot of an economics input; a missing row reads as all null. */
export function economicsSnapshot(
  row: Pick<Row<typeof schema.economicsInputs>, "value" | "fau" | "confidence"> | null,
  evidence: string[],
) {
  return {
    value: row?.value ?? null,
    fau: row?.fau ?? null,
    confidence: row?.confidence ?? null,
    evidence: [...evidence].sort(),
  };
}

/** Snapshot of the editable summary of an idea. */
export function ideaSnapshot(
  row: Pick<Row<typeof schema.ideas>, "name" | "oneLineConcept" | "proposedSolution">,
) {
  return {
    name: row.name,
    oneLineConcept: row.oneLineConcept,
    proposedSolution: row.proposedSolution,
  };
}

/** Snapshot of a research log entry. */
export function researchLogSnapshot(
  row: Pick<
    Row<typeof schema.researchLogEntries>,
    | "observedOn"
    | "topic"
    | "observation"
    | "sourceType"
    | "sourceUrl"
    | "supportsChecks"
    | "supportsNote"
  >,
) {
  return {
    observedOn: row.observedOn,
    topic: row.topic,
    observation: row.observation,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    supportsChecks: [...row.supportsChecks].sort(),
    supportsNote: row.supportsNote,
  };
}

/** Snapshot of a competitor row with the ids of its active evidence links. */
export function competitorSnapshot(
  row: Pick<
    Row<typeof schema.competitors>,
    | "name"
    | "type"
    | "targetCustomer"
    | "offering"
    | "typicalPrice"
    | "priceNote"
    | "strength"
    | "weakness"
    | "whyChosen"
    | "whySurvive"
  >,
  evidence: string[],
) {
  return {
    name: row.name,
    type: row.type,
    targetCustomer: row.targetCustomer,
    offering: row.offering,
    typicalPrice: row.typicalPrice,
    priceNote: row.priceNote,
    strength: row.strength,
    weakness: row.weakness,
    whyChosen: row.whyChosen,
    whySurvive: row.whySurvive,
    evidence: [...evidence].sort(),
  };
}

/** Snapshot of an assumption row with the ids of its active evidence links. */
export function assumptionSnapshot(
  row: Pick<
    Row<typeof schema.assumptions>,
    "statement" | "whyBelieve" | "evidenceNote" | "confidence" | "disproveCondition" | "nextCheck"
  >,
  evidence: string[],
) {
  return {
    statement: row.statement,
    whyBelieve: row.whyBelieve,
    evidenceNote: row.evidenceNote,
    confidence: row.confidence,
    disproveCondition: row.disproveCondition,
    nextCheck: row.nextCheck,
    evidence: [...evidence].sort(),
  };
}

/** Snapshot of a risk row. */
export function riskSnapshot(
  row: Pick<
    Row<typeof schema.risks>,
    "statement" | "probability" | "impact" | "whyMatters" | "mitigation" | "howToValidate"
  >,
) {
  return {
    statement: row.statement,
    probability: row.probability,
    impact: row.impact,
    whyMatters: row.whyMatters,
    mitigation: row.mitigation,
    howToValidate: row.howToValidate,
  };
}

/** Snapshot of a cost row with the ids of its active evidence links. */
export function costItemSnapshot(
  row: Pick<
    Row<typeof schema.costItems>,
    | "category"
    | "name"
    | "inputMode"
    | "amount"
    | "percent"
    | "isLumpSum"
    | "whyNeeded"
    | "canReduce"
    | "notes"
    | "fau"
    | "confidence"
  >,
  evidence: string[],
) {
  return {
    category: row.category,
    name: row.name,
    inputMode: row.inputMode,
    amount: row.amount,
    percent: row.percent,
    isLumpSum: row.isLumpSum,
    whyNeeded: row.whyNeeded,
    canReduce: row.canReduce,
    notes: row.notes,
    fau: row.fau,
    confidence: row.confidence,
    evidence: [...evidence].sort(),
  };
}

/** Snapshot of an execution item (milestone, launch step, KPI, open question or next action). */
export function executionItemSnapshot(
  row: Pick<
    Row<typeof schema.executionItems>,
    | "type"
    | "title"
    | "assigneeUserId"
    | "assigneeName"
    | "dueDate"
    | "status"
    | "goal"
    | "exitCondition"
    | "launchTiming"
    | "actions"
    | "completionCriteria"
    | "kpiArea"
    | "kpiTarget"
    | "kpiReviewFrequency"
    | "kpiActual"
    | "whyItMatters"
    | "answer"
  >,
) {
  return {
    type: row.type,
    title: row.title,
    assigneeUserId: row.assigneeUserId,
    assigneeName: row.assigneeName,
    dueDate: row.dueDate,
    status: row.status,
    goal: row.goal,
    exitCondition: row.exitCondition,
    launchTiming: row.launchTiming,
    actions: row.actions,
    completionCriteria: row.completionCriteria,
    kpiArea: row.kpiArea,
    kpiTarget: row.kpiTarget,
    kpiReviewFrequency: row.kpiReviewFrequency,
    kpiActual: row.kpiActual,
    whyItMatters: row.whyItMatters,
    answer: row.answer,
  };
}

/** Snapshot of a self-analysis answer. */
export function selfAnalysisAnswerSnapshot(
  row: Pick<Row<typeof schema.selfAnalysisAnswers>, "text" | "amount"> | null,
) {
  return { text: row?.text ?? null, amount: row?.amount ?? null };
}

/** Snapshot of a plan answer: its text and the rows of a table sub-item. */
export function planAnswerSnapshot(
  row: Pick<Row<typeof schema.planAnswers>, "text" | "rows"> | null,
) {
  return { text: row?.text ?? null, rows: (row?.rows as unknown[] | null) ?? null };
}

/** Snapshot of the plan header (name, Business Name, Prepared By). */
export function planHeaderSnapshot(
  row: Pick<Row<typeof schema.businessPlans>, "name" | "businessName" | "preparedBy">,
) {
  return { name: row.name, businessName: row.businessName, preparedBy: row.preparedBy };
}
