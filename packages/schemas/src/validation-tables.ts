import { z } from "zod";
import { classificationSchema, economicsResultSchema, uuidSchema, versionedSchema } from "./common";
import { confidenceSchema, costCategorySchema, economicsFieldSchema, fauSchema } from "./enums";
import { amountSchema } from "./inputs";

// ---- shared pieces ----

/** A blank text is stored as no text, like every other text field of the API. */
const longText = z
  .string()
  .max(20_000)
  .transform((value) => (value.trim() === "" ? null : value));
const rowName = z.string().trim().min(1).max(200);
/** A cost row may have no name: "+ Add row" creates it empty and the name is typed afterwards. */
const costRowName = z.string().trim().max(200);
/** Same shape as `classificationInputSchema` but a missing confidence answers 422 CONFIDENCE_REQUIRED. */
const classificationBodySchema = z.object({
  fau: fauSchema.nullable(),
  confidence: confidenceSchema.nullish(),
});
const lockFields = { lockVersion: z.number().int().min(0), force: z.boolean().optional() };

export const competitorTypeSchema = z.enum(["direct", "indirect", "substitute"]);
export const costInputModeSchema = z.enum(["amount", "percent_of_price"]);
export const canReduceSchema = z.enum(["yes", "partly", "no"]);
/** The four lists V17 can reorder. */
export const orderListSchema = z.enum(["competitors", "assumptions", "risks", "cost-items"]);

// ---- V8 / V9 competitors ----

const competitorFields = {
  name: rowName,
  type: competitorTypeSchema.nullish(),
  targetCustomer: longText.nullish(),
  offering: longText.nullish(),
  typicalPrice: amountSchema.nullish(),
  priceNote: longText.nullish(),
  strength: longText.nullish(),
  weakness: longText.nullish(),
  whyChosen: longText.nullish(),
  whySurvive: longText.nullish(),
};

export const createCompetitorBodySchema = z.object(competitorFields);
export const updateCompetitorBodySchema = z.object(competitorFields).partial().extend(lockFields);

// ---- V10 / V11 assumptions and risks ----

const assumptionFields = {
  statement: rowName,
  whyBelieve: longText.nullish(),
  evidenceNote: longText.nullish(),
  confidence: confidenceSchema.nullish(),
  disproveCondition: longText.nullish(),
  nextCheck: longText.nullish(),
};

export const createAssumptionBodySchema = z.object(assumptionFields);
export const updateAssumptionBodySchema = z.object(assumptionFields).partial().extend(lockFields);

const riskFields = {
  statement: rowName,
  probability: confidenceSchema.nullish(),
  impact: confidenceSchema.nullish(),
  whyMatters: longText.nullish(),
  mitigation: longText.nullish(),
  howToValidate: longText.nullish(),
};

export const createRiskBodySchema = z.object(riskFields);
export const updateRiskBodySchema = z.object(riskFields).partial().extend(lockFields);

// ---- V13 / V14 cost items ----

export const createCostItemBodySchema = z.object({
  category: costCategorySchema,
  name: costRowName,
});

/**
 * `amount` and `percent` are only checked for being numbers here: their ranges answer
 * 422 OUT_OF_RANGE (SDD 5.7 V14), which a schema failure (VALIDATION_FAILED) would pre-empt.
 */
export const updateCostItemBodySchema = z
  .object({
    name: costRowName,
    inputMode: costInputModeSchema,
    amount: z.number().nullable(),
    percent: z.number().nullable(),
    isLumpSum: z.boolean(),
    whyNeeded: longText.nullable(),
    canReduce: canReduceSchema.nullable(),
    notes: longText.nullable(),
    classification: classificationBodySchema.optional(),
  })
  .partial()
  .extend(lockFields);

// ---- V16 economics ----

export const economicsFieldParamsSchema = z.object({
  validationId: uuidSchema,
  fieldKey: economicsFieldSchema,
});

/** The range per field answers 422 OUT_OF_RANGE (SDD 5.7 V16), so only the type is checked here. */
export const putEconomicsInputBodySchema = z.object({
  value: z.number().nullable(),
  classification: classificationBodySchema.optional(),
  ...lockFields,
});

// ---- V17 ordering ----

export const reorderBodySchema = z.object({
  ids: z.array(uuidSchema).max(1000),
  category: costCategorySchema.optional(),
});

// ---- responses (SDD 5.7) ----

const evidenceList = classificationSchema.shape.evidence;

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
  evidence: evidenceList,
  sortOrder: z.number().int(),
  commentCount: z.number().int(),
});

export const assumptionSchema = versionedSchema.extend({
  id: uuidSchema,
  statement: z.string(),
  whyBelieve: z.string().nullable(),
  evidence: evidenceList,
  evidenceNote: z.string().nullable(),
  confidence: confidenceSchema.nullable(),
  disproveCondition: z.string().nullable(),
  nextCheck: z.string().nullable(),
  sortOrder: z.number().int(),
  commentCount: z.number().int(),
});

export const riskSchema = versionedSchema.extend({
  id: uuidSchema,
  statement: z.string(),
  probability: confidenceSchema.nullable(),
  impact: confidenceSchema.nullable(),
  whyMatters: z.string().nullable(),
  mitigation: z.string().nullable(),
  howToValidate: z.string().nullable(),
  /** null = automatic order (Impact, then Probability, high first). */
  sortOrder: z.number().int().nullable(),
  commentCount: z.number().int(),
});

export const costItemSchema = versionedSchema.extend({
  id: uuidSchema,
  category: costCategorySchema,
  templateKey: z.string().nullable(),
  name: z.string(),
  inputMode: costInputModeSchema,
  amount: z.number().nullable(),
  percent: z.number().nullable(),
  isLumpSum: z.boolean(),
  whyNeeded: z.string().nullable(),
  canReduce: canReduceSchema.nullable(),
  notes: z.string().nullable(),
  classification: classificationSchema,
  sortOrder: z.number().int(),
  commentCount: z.number().int(),
});

export const economicsInputSchema = versionedSchema.extend({
  fieldKey: economicsFieldSchema,
  value: z.number().nullable(),
  classification: classificationSchema,
  commentCount: z.number().int(),
});

export const costsResponseSchema = z.object({
  items: z.array(costItemSchema),
  result: economicsResultSchema,
  economicsInputs: z.array(economicsInputSchema),
});

export type Competitor = z.infer<typeof competitorSchema>;
export type Assumption = z.infer<typeof assumptionSchema>;
export type Risk = z.infer<typeof riskSchema>;
export type CostItem = z.infer<typeof costItemSchema>;
export type EconomicsInput = z.infer<typeof economicsInputSchema>;
export type CostsResponse = z.infer<typeof costsResponseSchema>;
export type OrderList = z.infer<typeof orderListSchema>;
export type CreateCompetitorBody = z.infer<typeof createCompetitorBodySchema>;
export type UpdateCompetitorBody = z.infer<typeof updateCompetitorBodySchema>;
export type CreateAssumptionBody = z.infer<typeof createAssumptionBodySchema>;
export type UpdateAssumptionBody = z.infer<typeof updateAssumptionBodySchema>;
export type CreateRiskBody = z.infer<typeof createRiskBodySchema>;
export type UpdateRiskBody = z.infer<typeof updateRiskBodySchema>;
export type UpdateCostItemBody = z.infer<typeof updateCostItemBodySchema>;
export type PutEconomicsInputBody = z.infer<typeof putEconomicsInputBodySchema>;
