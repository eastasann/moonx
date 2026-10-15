import type {
  assumptions,
  businessPlans,
  competitors,
  costItems,
  economicsInputs,
  executionItems,
  ideas,
  planAnswers,
  researchLogEntries,
  risks,
  selfAnalysisAnswers,
  validationAnswers,
} from "./schema";

type ExecutionItemFields = Pick<
  typeof executionItems.$inferInsert,
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
>;

/**
 * What the change history's `before` and `after`, and a plan version's snapshot, hold of
 * an execution item (ADR-020): the fields a person edits, without ids, order, lock
 * version or timestamps. The seed and the API write it the same way, so the history
 * panel and H2 read one shape.
 */
export const executionItemContent = (item: ExecutionItemFields) => ({
  type: item.type,
  title: item.title,
  assigneeUserId: item.assigneeUserId ?? null,
  assigneeName: item.assigneeName ?? null,
  dueDate: item.dueDate ?? null,
  status: item.status ?? null,
  goal: item.goal ?? null,
  exitCondition: item.exitCondition ?? null,
  launchTiming: item.launchTiming ?? null,
  actions: item.actions ?? null,
  completionCriteria: item.completionCriteria ?? null,
  kpiArea: item.kpiArea ?? null,
  kpiTarget: item.kpiTarget ?? null,
  kpiReviewFrequency: item.kpiReviewFrequency ?? null,
  kpiActual: item.kpiActual ?? null,
  whyItMatters: item.whyItMatters ?? null,
  answer: item.answer ?? null,
});

/**
 * A plan's header, the item P2 PATCH saves (`business_plan`, history only), as a version
 * keeps it too. The plan's name is the option's name on 20, not the business's.
 */
export const businessPlanContent = (
  plan: Pick<
    typeof businessPlans.$inferInsert,
    "name" | "businessName" | "preparedBy"
  >,
) => ({
  name: plan.name,
  businessName: plan.businessName,
  preparedBy: plan.preparedBy,
});

/** A plan answer, the item P5 saves: a text, or the rows of a table sub-item. */
export const planAnswerContent = (
  answer: Pick<typeof planAnswers.$inferInsert, "text" | "rows">,
) => ({
  text: answer.text ?? null,
  rows: (answer.rows ?? null) as
    | Record<string, string | number | null>[]
    | null,
});

/**
 * The template version a self-analysis, validation or plan is pinned to (`template_version`,
 * written by a template migration): H3 pins `versionId` again to undo it.
 */
export const templateVersionContent = (version: {
  versionId: string;
  versionNumber: number;
}) => ({ versionId: version.versionId, versionNumber: version.versionNumber });

// The content the change history keeps of each validation item (ADR-020): what a person
// edits, without ids, order, lock version or timestamps. `evidenceIds` lists the evidence
// links attached (not detached), oldest first, for the items that take evidence. The
// seed writes the same shapes, and 409 CONFLICT shows the stored item in them.

type Row<T extends { $inferInsert: unknown }> = T["$inferInsert"];

/** An idea's overview, the item I2 PATCH saves; its history is filed under the idea (13). */
export const ideaContent = (
  idea: Pick<Row<typeof ideas>, "name" | "oneLineConcept" | "proposedSolution">,
) => ({
  name: idea.name,
  oneLineConcept: idea.oneLineConcept,
  proposedSolution: idea.proposedSolution ?? null,
});

/**
 * A self-analysis answer, the item S3 saves; its history is filed under the
 * self-analysis and only its owner sees it. `amount` is set on amount-with-reason
 * questions only.
 */
export const selfAnalysisAnswerContent = (
  answer: Pick<Row<typeof selfAnalysisAnswers>, "text" | "amount">,
) => ({
  text: answer.text ?? null,
  amount: answer.amount ?? null,
});

export const validationAnswerContent = (
  answer: Pick<Row<typeof validationAnswers>, "text" | "fau" | "confidence">,
  evidenceIds: readonly string[],
) => ({
  text: answer.text ?? null,
  fau: answer.fau ?? null,
  confidence: answer.confidence ?? null,
  evidenceIds: [...evidenceIds],
});

export const economicsInputContent = (
  input: Pick<Row<typeof economicsInputs>, "value" | "fau" | "confidence">,
  evidenceIds: readonly string[],
) => ({
  value: input.value ?? null,
  fau: input.fau ?? null,
  confidence: input.confidence ?? null,
  evidenceIds: [...evidenceIds],
});

export const researchLogContent = (
  entry: Pick<
    Row<typeof researchLogEntries>,
    | "observedOn"
    | "topic"
    | "observation"
    | "sourceType"
    | "sourceUrl"
    | "supportsChecks"
    | "supportsNote"
  >,
) => ({
  observedOn: entry.observedOn ?? null,
  topic: entry.topic,
  observation: entry.observation ?? null,
  sourceType: entry.sourceType ?? null,
  sourceUrl: entry.sourceUrl ?? null,
  supportsChecks: [...(entry.supportsChecks ?? [])],
  supportsNote: entry.supportsNote ?? null,
});

export const competitorContent = (
  competitor: Pick<
    Row<typeof competitors>,
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
  evidenceIds: readonly string[],
) => ({
  name: competitor.name,
  type: competitor.type ?? null,
  targetCustomer: competitor.targetCustomer ?? null,
  offering: competitor.offering ?? null,
  typicalPrice: competitor.typicalPrice ?? null,
  priceNote: competitor.priceNote ?? null,
  strength: competitor.strength ?? null,
  weakness: competitor.weakness ?? null,
  whyChosen: competitor.whyChosen ?? null,
  whySurvive: competitor.whySurvive ?? null,
  evidenceIds: [...evidenceIds],
});

export const assumptionContent = (
  assumption: Pick<
    Row<typeof assumptions>,
    | "statement"
    | "whyBelieve"
    | "evidenceNote"
    | "confidence"
    | "disproveCondition"
    | "nextCheck"
  >,
  evidenceIds: readonly string[],
) => ({
  statement: assumption.statement,
  whyBelieve: assumption.whyBelieve ?? null,
  evidenceNote: assumption.evidenceNote ?? null,
  confidence: assumption.confidence ?? null,
  disproveCondition: assumption.disproveCondition ?? null,
  nextCheck: assumption.nextCheck ?? null,
  evidenceIds: [...evidenceIds],
});

/** Risks take no evidence. */
export const riskContent = (
  risk: Pick<
    Row<typeof risks>,
    | "statement"
    | "probability"
    | "impact"
    | "whyMatters"
    | "mitigation"
    | "howToValidate"
  >,
) => ({
  statement: risk.statement,
  probability: risk.probability ?? null,
  impact: risk.impact ?? null,
  whyMatters: risk.whyMatters ?? null,
  mitigation: risk.mitigation ?? null,
  howToValidate: risk.howToValidate ?? null,
});

export const costItemContent = (
  item: Pick<
    Row<typeof costItems>,
    | "category"
    | "templateKey"
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
  evidenceIds: readonly string[],
) => ({
  category: item.category,
  templateKey: item.templateKey ?? null,
  name: item.name,
  inputMode: item.inputMode ?? "amount",
  amount: item.amount ?? null,
  percent: item.percent ?? null,
  isLumpSum: item.isLumpSum ?? false,
  whyNeeded: item.whyNeeded ?? null,
  canReduce: item.canReduce ?? null,
  notes: item.notes ?? null,
  fau: item.fau ?? null,
  confidence: item.confidence ?? null,
  evidenceIds: [...evidenceIds],
});
