import { z } from "zod";
import {
  classificationSchema,
  dateOnlySchema,
  evidenceSchema,
  linkTargetSchema,
  pageQuerySchema,
  targetRefSchema,
  userRefSchema,
  uuidSchema,
  versionedSchema,
} from "./common";
import { confidenceSchema, fauSchema, sourceTypeSchema, supportsCheckSchema } from "./enums";

/** Longest answer or research-log observation (design-spec 6.2). */
export const MAX_LONG_TEXT = 20_000;
/** Short text answers (`short_text` questions, names) hold at most this many characters (SDD 7.2). */
export const MAX_SHORT_TEXT = 200;

const httpUrlSchema = z.url({ protocol: /^https?$/ }).max(2000);

const lockFields = { lockVersion: z.number().int().min(0), force: z.boolean().optional() };

// ---- V3 ----

/** `classification` of V3. A missing confidence for Assumption is answered by the F/A/U rules, not here. */
export const putAnswerBodySchema = z.object({
  text: z.string().max(MAX_LONG_TEXT).nullish(),
  classification: z
    .object({ fau: fauSchema.nullable(), confidence: confidenceSchema.nullish() })
    .optional(),
  ...lockFields,
});

// ---- V6 / V7 ----

const researchLogFieldsSchema = z.object({
  observedOn: dateOnlySchema.nullish(),
  topic: z.string().trim().min(1).max(200),
  observation: z.string().max(MAX_LONG_TEXT).nullish(),
  sourceType: sourceTypeSchema.nullish(),
  sourceUrl: httpUrlSchema.nullish(),
  supportsChecks: z
    .array(supportsCheckSchema)
    .refine((list) => new Set(list).size === list.length, "Duplicate checks")
    .optional(),
  supportsNote: z.string().max(MAX_LONG_TEXT).nullish(),
});

/** `ResearchLogInput` (SDD 5.7). */
export const researchLogInputSchema = researchLogFieldsSchema;

/** V7 PATCH: any subset of the input, plus the lock. */
export const updateResearchLogBodySchema = researchLogFieldsSchema.partial().extend(lockFields);

export const researchLogQuerySchema = pageQuerySchema.extend({
  supports: supportsCheckSchema.optional(),
  sourceType: sourceTypeSchema.optional(),
  q: z.string().trim().min(1).max(200).optional(),
});

// ---- V4 / V5 ----

export const evidenceTargetTypeSchema = z.enum([
  "validation_answer",
  "economics_input",
  "cost_item",
  "competitor",
  "assumption",
]);

export const createEvidenceBodySchema = z
  .object({
    target: z.object({
      type: evidenceTargetTypeSchema,
      id: uuidSchema,
      key: z.string().max(100).nullish(),
    }),
    researchLogEntryId: uuidSchema.optional(),
    newResearchLog: researchLogInputSchema.optional(),
    url: httpUrlSchema.optional(),
    note: z.string().max(2000).nullish(),
    setFact: z.boolean().optional(),
    lockVersion: z.number().int().min(0),
  })
  .refine(
    (body) =>
      [body.researchLogEntryId, body.newResearchLog, body.url].filter((v) => v !== undefined)
        .length === 1,
    {
      path: ["researchLogEntryId"],
      message: "Send exactly one of researchLogEntryId, newResearchLog and url",
    },
  );

export const removeEvidenceQuerySchema = z.object({
  lockVersion: z.coerce.number().int().min(0),
  force: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

// ---- Responses (SDD 5.7) ----

export const validationAnswerSchema = versionedSchema.extend({
  questionKey: z.string(),
  text: z.string().nullable(),
  classification: classificationSchema,
  hidden: z.boolean(),
  commentCount: z.number().int().min(0),
});

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
  usedAsEvidenceCount: z.number().int().min(0),
  commentCount: z.number().int().min(0),
});

export const evidenceUsageSchema = z.object({
  target: targetRefSchema,
  label: z.string(),
  link: linkTargetSchema,
  isOnlyEvidenceOfFact: z.boolean(),
});

export const researchLogDetailSchema = researchLogEntrySchema.extend({
  usages: z.array(evidenceUsageSchema),
});

export const createEvidenceResponseSchema = z.object({
  evidence: evidenceSchema,
  classification: classificationSchema,
  lockVersion: z.number().int().min(0),
});

export type PutAnswerBody = z.infer<typeof putAnswerBodySchema>;
export type ResearchLogInput = z.infer<typeof researchLogInputSchema>;
export type UpdateResearchLogBody = z.infer<typeof updateResearchLogBodySchema>;
export type CreateEvidenceBody = z.infer<typeof createEvidenceBodySchema>;
export type ValidationAnswer = z.infer<typeof validationAnswerSchema>;
export type ResearchLogEntry = z.infer<typeof researchLogEntrySchema>;
export type EvidenceUsage = z.infer<typeof evidenceUsageSchema>;
