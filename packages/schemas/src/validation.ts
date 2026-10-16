import { z } from "zod";
import {
  checkResultSchema,
  classificationInputSchema,
  classificationSchema,
  decisionValueSchema,
  economicsWarningSchema,
  evidenceSchema,
  fauBreakdownSchema,
  lockClaimShape,
  metricValueSchema,
  nextStepSchema,
  queryBooleanSchema,
  queryIntSchema,
  sourceTypeSchema,
  supportsCheckSchema,
  templateRefSchema,
  templateSectionSchema,
  uuidSchema,
  versionedSchema,
} from "./common";
import { decisionLogEntrySchema, decisionLogSummarySchema } from "./decisions";
import { ideaDetailSchema, ideaKeyMetricsSchema } from "./ideas";
import {
  dateInputSchema,
  longTextSchema,
  reasonSchema,
  requiredShortTextSchema,
  ruleIssue,
  shortTextSchema,
  urlSchema,
} from "./input-rules";
import { planSummarySchema } from "./plans";

// The validation types of SDD 5.7 that V1–V5, V18 and V19 carry.

/** The sections of 13, in their order (design-spec 6.1). */
export const validationSectionKeySchema = z.enum([
  "01",
  "02",
  "03",
  "04",
  "05",
  "06-08",
  "09",
  "10",
]);

export const validationHomeSectionSchema = z.object({
  key: validationSectionKeySchema,
  /** With its number: "01 Customer & Problem", "06–08 Unit Economics". */
  title: z.string(),
  /** Null for 03, 04 and 09, which give a count instead. */
  answered: z.int().nonnegative().nullable(),
  total: z.int().nonnegative().nullable(),
  count: z.int().nonnegative().nullable(),
  /** 09 only: the risks, beside the assumptions in `count`. */
  countB: z.int().nonnegative().nullable().optional(),
  /** Not shown on 13 (design-spec 6.1). */
  fau: fauBreakdownSchema.nullable(),
});

/** V1. */
export const validationHomeSchema = z.object({
  validationId: uuidSchema,
  idea: ideaDetailSchema,
  template: templateRefSchema,
  summary: z.object({
    customer: z.string().nullable(),
    problem: z.string().nullable(),
    solution: z.string().nullable(),
    marketType: z.string().nullable(),
  }),
  keyMetrics: ideaKeyMetricsSchema,
  economicsWarnings: z.array(economicsWarningSchema),
  nextSteps: z.array(nextStepSchema),
  checks: z.array(checkResultSchema).length(6),
  fau: fauBreakdownSchema,
  sections: z.array(validationHomeSectionSchema),
  /** The idea's decisions, newest first, at most five (design-spec 6.1). */
  decisions: z.array(decisionLogSummarySchema),
  /** The plans not archived. */
  plans: z.array(planSummarySchema),
  archivedPlanCount: z.int().nonnegative(),
  /** The latest decision is Proceed and the idea is not archived. */
  canAddPlan: z.boolean(),
});
export type ValidationHome = z.infer<typeof validationHomeSchema>;

export const validationAnswerSchema = versionedSchema.extend({
  questionKey: z.string(),
  text: z.string().nullable(),
  classification: classificationSchema,
  /** Hidden by a display condition (02 OCEAN). */
  hidden: z.boolean(),
  commentCount: z.int().nonnegative(),
});
export type ValidationAnswer = z.infer<typeof validationAnswerSchema>;

/** The path of V2. */
export const validationQuestionsParamsSchema = z.object({
  validationId: z.string(),
  sectionKey: z.string(),
});

/** V2: one answer per question, unanswered ones included. */
export const validationQuestionsSchema = z.object({
  section: templateSectionSchema,
  answers: z.array(validationAnswerSchema),
});

/** The body of V3 `PUT /api/v1/validations/{validationId}/answers/{questionKey}`. */
export const validationAnswerSaveSchema = z.object({
  /**
   * Checked against the question's type afterwards: a short text has a shorter limit,
   * a choice must be one of its choices. Blank is saved as null.
   */
  text: longTextSchema.optional(),
  classification: classificationInputSchema.optional(),
  ...lockClaimShape,
});
export type ValidationAnswerSave = z.infer<typeof validationAnswerSaveSchema>;

/** The path of V3. */
export const validationAnswerParamsSchema = z.object({
  validationId: z.string(),
  questionKey: z.string(),
});

/** A research log entry as written on 14 and M2 (SDD 5.7 ResearchLogInput). */
export const researchLogInputSchema = z.object({
  observedOn: dateInputSchema.nullable().optional(),
  topic: requiredShortTextSchema,
  observation: longTextSchema.optional(),
  sourceType: sourceTypeSchema.nullable().optional(),
  sourceUrl: urlSchema.nullable().optional(),
  /** Each check at most once. */
  supportsChecks: z
    .array(supportsCheckSchema)
    .superRefine((checks, ctx) => {
      if (new Set(checks).size !== checks.length)
        ctx.addIssue({
          code: "custom",
          input: checks,
          message: "Repeats a check",
          ...ruleIssue("unique"),
        });
    })
    .optional(),
  supportsNote: longTextSchema.optional(),
});
export type ResearchLogInput = z.infer<typeof researchLogInputSchema>;

/** The items evidence may be attached to (M2). */
export const evidenceTargetTypeSchema = z.enum([
  "validation_answer",
  "economics_input",
  "cost_item",
  "competitor",
  "assumption",
]);

/** The body of V4 `POST /api/v1/validations/{validationId}/evidence`. */
export const evidenceCreateSchema = z
  .object({
    target: z.object({
      type: evidenceTargetTypeSchema,
      id: uuidSchema,
      /** The question ID of an answer, the field of a number. */
      key: z.string().nullable().optional(),
    }),
    researchLogEntryId: uuidSchema.optional(),
    newResearchLog: researchLogInputSchema.optional(),
    url: urlSchema.optional(),
    note: shortTextSchema.optional(),
    /** Makes the item a Fact: M2 closed with evidence from the Fact button. */
    setFact: z.boolean().optional(),
    ...lockClaimShape,
  })
  .superRefine((body, ctx) => {
    const sources = [
      body.researchLogEntryId,
      body.newResearchLog,
      body.url,
    ].filter((source) => source !== undefined);
    if (sources.length !== 1)
      ctx.addIssue({
        code: "custom",
        input: body,
        path: ["researchLogEntryId"],
        message:
          "Send exactly one of researchLogEntryId, newResearchLog or url",
        ...ruleIssue("required"),
      });
  });
export type EvidenceCreate = z.infer<typeof evidenceCreateSchema>;

/** V4. `lockVersion` is the item's version after the change. */
export const evidenceResultSchema = z.object({
  evidence: evidenceSchema,
  classification: classificationSchema,
  lockVersion: z.int().nonnegative(),
});

/** The query of V5 `DELETE /api/v1/evidence/{evidenceId}`. */
export const evidenceRemoveQuerySchema = z.object({
  /** The version of the item the evidence is attached to. */
  lockVersion: queryIntSchema,
  force: queryBooleanSchema.optional(),
});

/** V5. */
export const evidenceRemovalSchema = z.object({
  classification: classificationSchema,
  lockVersion: z.int().nonnegative(),
});

/** V18: what 19 shows before a decision is recorded. */
export const decisionContextSchema = z.object({
  summary: z.object({
    oneLineConcept: z.string(),
    customer: z.string().nullable(),
    problem: z.string().nullable(),
    solution: z.string().nullable(),
    marketType: z.string().nullable(),
    biggestOpportunity: z.string().nullable(),
    biggestRisk: z.string().nullable(),
    biggestUnknown: z.string().nullable(),
  }),
  keyMetrics: ideaKeyMetricsSchema.extend({ simple_roi: metricValueSchema }),
  /** The checks not done. */
  missingChecks: z.array(checkResultSchema),
  fau: fauBreakdownSchema,
  lastDecision: decisionLogSummarySchema.nullable(),
});
export type DecisionContext = z.infer<typeof decisionContextSchema>;

/** The body of V19 `POST /api/v1/ideas/{ideaId}/decisions`. */
export const decisionCreateSchema = z.object({
  value: decisionValueSchema,
  reason: reasonSchema,
  /** The latest decision 19 showed (V18 `lastDecision`), null when there was none. */
  basedOnDecisionId: uuidSchema.nullable(),
  /** Records it even though someone recorded another decision since. */
  confirmNewer: z.boolean().optional(),
});
export type DecisionCreate = z.infer<typeof decisionCreateSchema>;

/** V19. */
export const decisionResultSchema = z.object({
  entry: decisionLogEntrySchema,
  latestDecision: decisionValueSchema,
  canCreatePlan: z.boolean(),
});
