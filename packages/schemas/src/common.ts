import { z } from "zod";
import {
  answerTypeSchema,
  checkKeySchema,
  checkStateSchema,
  confidenceSchema,
  economicsFieldSchema,
  executionTypeSchema,
  fauSchema,
  fauStateSchema,
  sourceTypeSchema,
  targetTypeSchema,
} from "./enums";

export const uuidSchema = z.uuid();
/** `"2026-10-01"` */
export const dateOnlySchema = z.iso.date();
/** UTC ISO 8601, `"2026-10-01T02:00:00.000Z"` */
export const dateTimeSchema = z.iso.datetime();

export const targetRefSchema = z.object({
  type: targetTypeSchema,
  id: uuidSchema,
  key: z.string().nullish(),
});

export const userRefSchema = z.object({
  id: uuidSchema,
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  badge: z.enum(["former_member", "suspended", "deleted"]).nullable(),
});

export const versionedSchema = z.object({
  lockVersion: z.number().int().min(0),
  updatedAt: dateTimeSchema.nullable(),
  updatedBy: userRefSchema.nullable(),
});

export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const pageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const linkTargetSchema = z.object({
  screen: z.number().int(),
  workspaceId: uuidSchema.optional(),
  ideaId: uuidSchema.optional(),
  planId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  sectionKey: z.string().optional(),
  questionKey: z.string().optional(),
  rowId: uuidSchema.optional(),
  field: economicsFieldSchema.optional(),
  tab: z.string().optional(),
  itemNo: z.number().int().optional(),
  panel: z.enum(["comments", "history"]).optional(),
  target: targetRefSchema.optional(),
});

// ---- F/A/U and evidence ----

export const evidenceSchema = z.object({
  id: uuidSchema,
  kind: z.enum(["research_log", "url"]),
  researchLog: z
    .object({
      id: uuidSchema,
      observedOn: dateOnlySchema.nullable(),
      topic: z.string(),
      sourceType: sourceTypeSchema.nullable(),
      deleted: z.boolean(),
    })
    .nullable(),
  url: z.string().nullable(),
  note: z.string().nullable(),
});

export const classificationSchema = z.object({
  fau: fauSchema.nullable(),
  confidence: confidenceSchema.nullable(),
  state: fauStateSchema,
  evidence: z.array(evidenceSchema),
});

/** `confidence` is required for assumption and forbidden for the others (design-spec 6.0.3). */
export const classificationInputSchema = z
  .object({
    fau: fauSchema.nullable(),
    confidence: confidenceSchema.nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.fau === "assumption" && v.confidence == null) {
      ctx.addIssue({ code: "custom", path: ["confidence"], message: "Confidence is required" });
    }
    if (v.fau !== "assumption" && v.confidence != null) {
      ctx.addIssue({
        code: "custom",
        path: ["confidence"],
        message: "Confidence applies to Assumption only",
      });
    }
  });

const count = z.number().int().min(0);
export const fauBreakdownSchema = z.object({
  fact: count,
  factNoEvidence: count,
  assumption: z.object({ total: count, low: count, medium: count, high: count }),
  unknown: count,
  unclassified: count,
  empty: count,
});

// ---- Template ----

export const questionOptionsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), choices: z.array(z.string()).min(1) }),
  z.object({
    kind: z.literal("table"),
    columns: z
      .array(
        z.object({
          key: z.string(),
          label: z.string(),
          type: z.enum(["text", "number", "percent", "money"]),
        }),
      )
      .min(1),
  }),
  z.object({ kind: z.literal("linked_metric"), metricKeys: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("execution_view"), executionType: executionTypeSchema }),
]);

export const templateQuestionSchema = z.object({
  key: z.string(),
  sectionKey: z.string(),
  title: z.string(),
  prompt: z.string(),
  example: z.string().nullable(),
  hint: z.string().nullable(),
  answerType: answerTypeSchema,
  options: questionOptionsSchema.nullable(),
  displayCondition: z.record(z.string(), z.array(z.string())).nullable(),
  hasFau: z.boolean(),
});

export const templateSectionSchema = z.object({
  key: z.string(),
  part: z.enum(["a", "b"]).nullable(),
  title: z.string(),
  guidance: z.string().nullable(),
  questions: z.array(templateQuestionSchema),
});

const versionRefSchema = z.object({ versionId: uuidSchema, versionNumber: z.number().int() });
export const templateRefSchema = versionRefSchema.extend({
  newerVersion: versionRefSchema.nullable(),
});

// ---- Calculation results (design-spec 6.4) ----

export const metricReasonSchema = z.enum([
  "needs_price",
  "needs_monthly_costs",
  "needs_expected_sales",
  "needs_startup_costs",
  "margin_not_positive",
  "target_margin_unreachable",
  "not_recovered",
  "empty",
]);

export const metricValueSchema = z.object({
  value: z.number().nullable(),
  bound: z.enum(["exact", "lower", "upper"]),
  reason: metricReasonSchema.nullable(),
});

export const costTotalSchema = z.object({
  amount: z.number().nullable(),
  isLowerBound: z.boolean(),
  unknownRows: count,
  emptyRows: count,
});

export const scenarioColumnSchema = z.object({
  key: z.enum(["break_even", "conservative", "expected", "strong", "capacity"]),
  unitsPerDay: metricValueSchema,
  unitsPerMonth: metricValueSchema,
  revenue: metricValueSchema,
  variableCostTotal: metricValueSchema,
  operatingProfit: metricValueSchema,
  operatingMargin: metricValueSchema,
  exceedsCapacity: z.boolean(),
});

export const economicsWarningSchema = z.enum([
  "margin_not_positive",
  "target_margin_unreachable",
  "break_even_above_capacity",
  "conservative_exceeds_capacity",
  "expected_exceeds_capacity",
  "strong_exceeds_capacity",
  "costs_incomplete",
]);

export const economicsResultSchema = z.object({
  variableCostPerUnit: metricValueSchema,
  contributionMargin: metricValueSchema,
  contributionMarginRate: metricValueSchema,
  breakEvenUnitsMonth: metricValueSchema,
  breakEvenUnitsDay: metricValueSchema,
  breakEvenRevenue: metricValueSchema,
  targetMarginUnitsMonth: metricValueSchema,
  targetMarginUnitsDay: metricValueSchema,
  scenarios: z.array(scenarioColumnSchema).length(5),
  paybackMonths: metricValueSchema,
  simpleRoi: metricValueSchema,
  totals: z.object({
    initial: costTotalSchema,
    monthlyFixed: costTotalSchema,
    variablePerUnit: costTotalSchema,
  }),
  defaultsUsed: z.object({ operatingDays: z.boolean(), targetMargin: z.boolean() }),
  warnings: z.array(economicsWarningSchema),
});

export const keyMetricsSchema = z.record(z.string(), metricValueSchema);

// ---- Checks and next steps (design-spec 6.1) ----

export const checkResultSchema = z.object({
  key: checkKeySchema,
  state: checkStateSchema,
  count: z.number().int().nullable(),
  params: z.record(z.string(), z.number()),
  detail: z
    .object({
      emptyRows: z.number().int().optional(),
      missing: z
        .array(z.enum(["price", "monthly_costs", "initial_amount", "monthly_amount"]))
        .optional(),
    })
    .nullable(),
  link: linkTargetSchema,
});

export const nextStepSchema = z.object({
  kind: z.enum([
    "add_evidence",
    "classify",
    "start_customer_problem",
    "check",
    "start_section",
    "check_unknowns",
    "ready_to_decide",
  ]),
  count: z.number().int().nullable(),
  checkKey: checkKeySchema.nullable(),
  sectionKey: z.string().nullable(),
  link: linkTargetSchema,
});

export const conflictCurrentSchema = z.object({
  value: z.unknown(),
  lockVersion: z.number().int(),
  updatedAt: dateTimeSchema,
  updatedBy: userRefSchema.nullable(),
});

export type TargetRef = z.infer<typeof targetRefSchema>;
export type UserRef = z.infer<typeof userRefSchema>;
export type Versioned = z.infer<typeof versionedSchema>;
export type Page<T> = { items: T[]; nextCursor: string | null };
export type LinkTarget = z.infer<typeof linkTargetSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Classification = z.infer<typeof classificationSchema>;
export type ClassificationInput = z.infer<typeof classificationInputSchema>;
export type FauBreakdown = z.infer<typeof fauBreakdownSchema>;
export type QuestionOptions = z.infer<typeof questionOptionsSchema>;
export type TemplateQuestion = z.infer<typeof templateQuestionSchema>;
export type TemplateSection = z.infer<typeof templateSectionSchema>;
export type TemplateRef = z.infer<typeof templateRefSchema>;
export type MetricReason = z.infer<typeof metricReasonSchema>;
export type MetricValue = z.infer<typeof metricValueSchema>;
export type CostTotal = z.infer<typeof costTotalSchema>;
export type ScenarioColumn = z.infer<typeof scenarioColumnSchema>;
export type EconomicsWarning = z.infer<typeof economicsWarningSchema>;
export type EconomicsResult = z.infer<typeof economicsResultSchema>;
export type KeyMetrics = z.infer<typeof keyMetricsSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;
export type NextStep = z.infer<typeof nextStepSchema>;
export type ConflictCurrent = z.infer<typeof conflictCurrentSchema>;
