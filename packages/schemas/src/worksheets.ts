import { z } from "zod";
import {
  classificationInputSchema,
  classificationSchema,
  confidenceSchema,
  costCategorySchema,
  dateOnlySchema,
  economicsFieldSchema,
  economicsResultSchema,
  evidenceSchema,
  linkTargetSchema,
  lockClaimShape,
  pageQuerySchema,
  pageSchema,
  sourceTypeSchema,
  supportsCheckSchema,
  targetRefSchema,
  templateQuestionSchema,
  userRefSchema,
  uuidSchema,
  versionedSchema,
} from "./common";
import {
  canReduceSchema,
  competitorTypeSchema,
  costRowNameSchema,
  longTextSchema,
  moneySchema,
  plainText,
  requiredLongTextSchema,
  requiredShortTextSchema,
  shortTextSchema,
  TEXT_LIMITS,
} from "./input-rules";
import { researchLogInputSchema, validationAnswerSchema } from "./validation";

// The worksheets of a validation that V6–V17 carry (SDD 5.7): the research log (14),
// competitors (15), assumptions and risks (16), costs (17) and unit economics (18).

// ---- 14 Research log ----

export const researchLogEntrySchema = versionedSchema.extend({
  id: uuidSchema,
  observedOn: dateOnlySchema.nullable(),
  topic: z.string(),
  observation: z.string().nullable(),
  sourceType: sourceTypeSchema.nullable(),
  sourceUrl: z.string().nullable(),
  supportsChecks: z.array(supportsCheckSchema),
  supportsNote: z.string().nullable(),
  createdBy: userRefSchema,
  /** The items that cite it and are shown: rows not deleted, questions of the pinned version. */
  usedAsEvidenceCount: z.int().nonnegative(),
  commentCount: z.int().nonnegative(),
});
export type ResearchLogEntry = z.infer<typeof researchLogEntrySchema>;

/** The query of V6 GET. */
export const researchLogListQuerySchema = pageQuerySchema.extend({
  /** Entries tagged with this check. */
  supports: supportsCheckSchema.optional(),
  sourceType: sourceTypeSchema.optional(),
  /** Part of the topic or the observation, ignoring case. Blank matches everything. */
  q: plainText(TEXT_LIMITS.short).optional(),
});

/** V6 GET: the newest observation first, entries without a date last. */
export const researchLogPageSchema = pageSchema(researchLogEntrySchema);

/** An item that cites a research log entry as its evidence. */
export const evidenceUsageSchema = z.object({
  target: targetRefSchema,
  /** "01 WHO", "Costs · Rent", "Competitors · Bongbong's". */
  label: z.string(),
  link: linkTargetSchema,
  /** A Fact whose only counting evidence is this entry: deleting it leaves "Fact · No evidence". */
  isOnlyEvidenceOfFact: z.boolean(),
});
export type EvidenceUsage = z.infer<typeof evidenceUsageSchema>;

/** V7 GET. `usages` in the order the evidence was attached. */
export const researchLogDetailSchema = researchLogEntrySchema.extend({
  usages: z.array(evidenceUsageSchema),
  /**
   * The answers a template migration hid that cite the entry: not shown (design-spec
   * 6.0.7), so the deletion's confirmation gives only their number (6.0.3).
   */
  hiddenUsageCount: z.int().nonnegative(),
});

/** The body of V7 PATCH: only the fields sent change. */
export const researchLogUpdateSchema = researchLogInputSchema
  .partial()
  .extend(lockClaimShape);

/** V7 DELETE: the items that cited the entry, as they stood before it was deleted. */
export const researchLogDeletionSchema = z.object({
  affected: z.array(evidenceUsageSchema),
  /** The answers a template migration hid that cited it, by number. */
  hiddenAffectedCount: z.int().nonnegative(),
});

// ---- 15 Competitors ----

export const competitorSchema = versionedSchema.extend({
  id: uuidSchema,
  name: z.string(),
  type: competitorTypeSchema.nullable(),
  targetCustomer: z.string().nullable(),
  offering: z.string().nullable(),
  typicalPrice: z.number().nullable(),
  priceNote: z.string().nullable(),
  strength: z.string().nullable(),
  weakness: z.string().nullable(),
  whyChosen: z.string().nullable(),
  whySurvive: z.string().nullable(),
  /**
   * Oldest first, without the evidence citing deleted research logs: a row without
   * F/A/U has no "Fact · No evidence" to show them by (design-spec 6.0.3).
   */
  evidence: z.array(evidenceSchema),
  sortOrder: z.int(),
  commentCount: z.int().nonnegative(),
});
export type Competitor = z.infer<typeof competitorSchema>;

/** V8 GET. */
export const competitorListSchema = z.object({
  /** In their order on 15. */
  items: z.array(competitorSchema),
  /** V.04.SURVIVOR_PATTERNS and V.04.FAILURE_PATTERNS, those the pinned version has. */
  patterns: z.array(
    z.object({
      question: templateQuestionSchema,
      answer: validationAnswerSchema,
    }),
  ),
  /** "aim for 3–5": the template's threshold and the fixed upper guide (design-spec 6.1). */
  guidance: z.object({ min: z.int(), max: z.int() }),
});

const competitorFields = {
  type: competitorTypeSchema.nullable().optional(),
  targetCustomer: longTextSchema.optional(),
  offering: longTextSchema.optional(),
  typicalPrice: moneySchema.nullable().optional(),
  priceNote: shortTextSchema.optional(),
  strength: longTextSchema.optional(),
  weakness: longTextSchema.optional(),
  whyChosen: longTextSchema.optional(),
  whySurvive: longTextSchema.optional(),
};

/** The body of V8 POST. */
export const competitorCreateSchema = z.object({
  name: requiredShortTextSchema,
  ...competitorFields,
});

/** The body of V9 PATCH: only the fields sent change. */
export const competitorUpdateSchema = z.object({
  name: requiredShortTextSchema.optional(),
  ...competitorFields,
  ...lockClaimShape,
});

// ---- 16 Assumptions and risks ----

export const assumptionSchema = versionedSchema.extend({
  id: uuidSchema,
  statement: z.string(),
  whyBelieve: z.string().nullable(),
  /** As {@link competitorSchema}'s: links to deleted research logs left out. */
  evidence: z.array(evidenceSchema),
  evidenceNote: z.string().nullable(),
  confidence: confidenceSchema.nullable(),
  disproveCondition: z.string().nullable(),
  nextCheck: z.string().nullable(),
  sortOrder: z.int(),
  commentCount: z.int().nonnegative(),
});
export type Assumption = z.infer<typeof assumptionSchema>;

export const riskSchema = versionedSchema.extend({
  id: uuidSchema,
  statement: z.string(),
  probability: confidenceSchema.nullable(),
  impact: confidenceSchema.nullable(),
  whyMatters: z.string().nullable(),
  mitigation: z.string().nullable(),
  howToValidate: z.string().nullable(),
  /** Null: the automatic order, highest Impact then Probability first. */
  sortOrder: z.int().nullable(),
  commentCount: z.int().nonnegative(),
});
export type Risk = z.infer<typeof riskSchema>;

/** V10 GET assumptions. */
export const assumptionListSchema = z.object({
  items: z.array(assumptionSchema),
});

/** V10 GET risks, in the order 16 shows them. */
export const riskListSchema = z.object({ items: z.array(riskSchema) });

const assumptionFields = {
  whyBelieve: longTextSchema.optional(),
  evidenceNote: longTextSchema.optional(),
  confidence: confidenceSchema.nullable().optional(),
  disproveCondition: longTextSchema.optional(),
  nextCheck: longTextSchema.optional(),
};

/** The body of V10 POST assumptions. */
export const assumptionCreateSchema = z.object({
  statement: requiredLongTextSchema,
  ...assumptionFields,
});

/** The body of V11 PATCH assumptions: only the fields sent change. */
export const assumptionUpdateSchema = z.object({
  statement: requiredLongTextSchema.optional(),
  ...assumptionFields,
  ...lockClaimShape,
});

const riskFields = {
  probability: confidenceSchema.nullable().optional(),
  impact: confidenceSchema.nullable().optional(),
  whyMatters: longTextSchema.optional(),
  mitigation: longTextSchema.optional(),
  howToValidate: longTextSchema.optional(),
};

/** The body of V10 POST risks. */
export const riskCreateSchema = z.object({
  statement: requiredLongTextSchema,
  ...riskFields,
});

/** The body of V11 PATCH risks: only the fields sent change. */
export const riskUpdateSchema = z.object({
  statement: requiredLongTextSchema.optional(),
  ...riskFields,
  ...lockClaimShape,
});

// ---- 17 Costs and 18 Unit economics ----

export const costInputModeSchema = z.enum(["amount", "percent_of_price"]);
export type CostInputMode = z.infer<typeof costInputModeSchema>;

export const costItemSchema = versionedSchema.extend({
  id: uuidSchema,
  category: costCategorySchema,
  /** The template's key (`initial.permits`); null for a row added on 17. */
  templateKey: z.string().nullable(),
  name: z.string(),
  /** `percent_of_price` on variable rows only. */
  inputMode: costInputModeSchema,
  amount: z.number().nullable(),
  /** A 0 to 1 rate of the selling price. */
  percent: z.number().nullable(),
  isLumpSum: z.boolean(),
  whyNeeded: z.string().nullable(),
  canReduce: canReduceSchema.nullable(),
  notes: z.string().nullable(),
  classification: classificationSchema,
  /** The order within its table. */
  sortOrder: z.int(),
  commentCount: z.int().nonnegative(),
});
export type CostItem = z.infer<typeof costItemSchema>;

export const economicsInputSchema = versionedSchema.extend({
  fieldKey: economicsFieldSchema,
  value: z.number().nullable(),
  classification: classificationSchema,
  commentCount: z.int().nonnegative(),
});
export type EconomicsInput = z.infer<typeof economicsInputSchema>;

/** The seven numbers of 18, in the order of `economicsFieldSchema`, unsaved ones empty at version 0. */
const allEconomicsInputsSchema = z
  .array(economicsInputSchema)
  .length(economicsFieldSchema.options.length);

/** V12. Rows by table (startup, monthly fixed, variable), each in its order. */
export const costsSchema = z.object({
  items: z.array(costItemSchema),
  /** The Totals and 18's break-even beside them. */
  result: economicsResultSchema,
  /** For the client to calculate again while typing. */
  economicsInputs: allEconomicsInputsSchema,
});

/** The body of V13: an Empty row at the end of its table. */
export const costItemCreateSchema = z.object({
  category: costCategorySchema,
  name: costRowNameSchema,
});

/** The body of V14 PATCH: only the fields sent change. */
export const costItemUpdateSchema = z.object({
  name: costRowNameSchema.optional(),
  inputMode: costInputModeSchema.optional(),
  /** Its rule (design-spec 6.0.8) is checked by the API, which answers OUT_OF_RANGE. */
  amount: z.number().nullable().optional(),
  /** A 0 to 1 rate; checked like `amount`. */
  percent: z.number().nullable().optional(),
  isLumpSum: z.boolean().optional(),
  whyNeeded: longTextSchema.optional(),
  canReduce: canReduceSchema.nullable().optional(),
  notes: longTextSchema.optional(),
  classification: classificationInputSchema.optional(),
  ...lockClaimShape,
});
export type CostItemUpdate = z.infer<typeof costItemUpdateSchema>;

/** V15. */
export const economicsSchema = z.object({
  inputs: allEconomicsInputsSchema,
  /** V.08.WORTH, `hidden` when the pinned version lacks it. */
  worth: validationAnswerSchema,
  /** The question of V.08.WORTH (title, prompt, EXAMPLE, hint); null when the pinned version lacks it. */
  worthQuestion: templateQuestionSchema.nullable(),
  result: economicsResultSchema,
  costItems: z.array(costItemSchema),
});

/** The path of V16. */
export const economicsInputParamsSchema = z.object({
  validationId: z.string(),
  fieldKey: economicsFieldSchema,
});

/** The body of V16 `PUT /api/v1/validations/{validationId}/economics/{fieldKey}`. */
export const economicsInputSaveSchema = z.object({
  /** Its rule depends on the field (design-spec 6.0.8): the API answers OUT_OF_RANGE. */
  value: z.number().nullable(),
  classification: classificationInputSchema.optional(),
  ...lockClaimShape,
});
export type EconomicsInputSave = z.infer<typeof economicsInputSaveSchema>;

/** The body of V17: every row of the list (or of one cost table), in the new order. */
export const listOrderSchema = z.object({
  ids: z.array(uuidSchema),
  /** The table of the cost rows; required for them and refused for the other lists. */
  category: costCategorySchema.optional(),
});
