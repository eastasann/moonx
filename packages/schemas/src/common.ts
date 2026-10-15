import { z } from "zod";

// The shared types of SDD 5.2. The enum values are the wire values; the UI labels live
// in the packages/i18n catalog (design-spec 1.4).

export const uuidSchema = z.uuid();
export type UUID = z.infer<typeof uuidSchema>;

/**
 * `"2026-10-01"`. Only calendar dates pass, 0001-01-01 to 9999-12-31 (design-spec 6.0.8).
 * The year 0000 fails like any other non-date, with `invalid_format`: PostgreSQL has no
 * year 0, so it would fail as a 500 instead of a 422.
 */
export const dateOnlySchema = z.iso.date().superRefine((value, ctx) => {
  if (value.startsWith("0000-"))
    ctx.addIssue({
      code: "invalid_format",
      format: "date",
      input: value,
      message: "Must be a calendar date",
    });
});
export type DateOnly = z.infer<typeof dateOnlySchema>;

/** UTC ISO 8601 with milliseconds, `"2026-10-01T02:00:00.000Z"` (SDD 5.1). */
export const dateTimeSchema = z.iso.datetime({ precision: 3 });
export type DateTime = z.infer<typeof dateTimeSchema>;

export const roleSchema = z.enum(["owner", "member", "viewer"]);
export type Role = z.infer<typeof roleSchema>;

export const fauSchema = z.enum(["fact", "assumption", "unknown"]);
export type Fau = z.infer<typeof fauSchema>;

/** design-spec 6.0.3. */
export const fauStateSchema = z.enum([
  "empty",
  "unclassified",
  "fact",
  "fact_no_evidence",
  "assumption",
  "unknown",
]);
export type FauState = z.infer<typeof fauStateSchema>;

export const confidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof confidenceSchema>;

export const decisionValueSchema = z.enum(["proceed", "hold", "drop"]);
export type DecisionValue = z.infer<typeof decisionValueSchema>;

export const goNoGoValueSchema = z.enum(["launch", "delay", "stop"]);
export type GoNoGoValue = z.infer<typeof goNoGoValueSchema>;

export const stageSchema = z.enum(["validation", "planning", "launch_prep"]);
export type Stage = z.infer<typeof stageSchema>;

/** In the order of design-spec 6.1 (check 1 to 6). */
export const checkKeySchema = z.enum([
  "competitors",
  "local_price",
  "costs",
  "break_even",
  "permits",
  "demand_signal",
]);
export type CheckKey = z.infer<typeof checkKeySchema>;

export const checkStateSchema = z.enum(["not_started", "partial", "done"]);
export type CheckState = z.infer<typeof checkStateSchema>;

export const supportsCheckSchema = z.enum([
  "local_price",
  "permits",
  "demand_signal",
]);
export type SupportsCheck = z.infer<typeof supportsCheckSchema>;

export const sourceTypeSchema = z.enum([
  "google_maps_reviews",
  "website",
  "social_media",
  "public_data",
  "news_report",
  "store_observation",
  "price_check",
  "other",
]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const costCategorySchema = z.enum([
  "initial",
  "monthly_fixed",
  "variable",
]);
export type CostCategory = z.infer<typeof costCategorySchema>;

export const economicsFieldSchema = z.enum([
  "selling_price",
  "operating_days",
  "target_margin",
  "units_conservative",
  "units_expected",
  "units_strong",
  "units_capacity",
]);
export type EconomicsField = z.infer<typeof economicsFieldSchema>;

export const executionTypeSchema = z.enum([
  "milestone",
  "launch",
  "kpi",
  "open_question",
  "next_action",
]);
export type ExecutionType = z.infer<typeof executionTypeSchema>;

export const executionStatusSchema = z.enum([
  "todo",
  "doing",
  "done",
  "open",
  "resolved",
]);
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;

export const launchTimingSchema = z.enum([
  "t_minus_30",
  "t_minus_7",
  "launch_day",
  "first_30",
  "days_31_90",
  "other",
]);
export type LaunchTiming = z.infer<typeof launchTimingSchema>;

export const templateKindSchema = z.enum([
  "self_analysis",
  "validation",
  "business_plan",
]);
export type TemplateKind = z.infer<typeof templateKindSchema>;

export const answerTypeSchema = z.enum([
  "long_text",
  "short_text",
  "choice",
  "amount_with_reason",
  "table",
  "linked_metric",
  "execution_view",
]);
export type AnswerType = z.infer<typeof answerTypeSchema>;

export const historySourceSchema = z.enum([
  "manual",
  "ai_import",
  "revert",
  "template_migration",
  "duplicate",
  "plan_draft",
]);
export type HistorySource = z.infer<typeof historySourceSchema>;

export const targetTypeSchema = z.enum([
  "self_analysis_answer",
  "validation_answer",
  "economics_input",
  "plan_answer",
  "pitch_slide",
  "idea",
  "research_log_entry",
  "competitor",
  "assumption",
  "risk",
  "cost_item",
  "execution_item",
  // The plan header (plan name, Business Name, Prepared By). History only.
  "business_plan",
  // The template version a container is pinned to. Template migration history only.
  "template_version",
]);
export type TargetType = z.infer<typeof targetTypeSchema>;

/** How comments, history and evidence point at an item (SDD 5.1 TargetRef). */
export const targetRefSchema = z.object({
  type: targetTypeSchema,
  id: uuidSchema,
  key: z.string().nullable().optional(),
});
export type TargetRef = z.infer<typeof targetRefSchema>;

/** A cursor-paged list (SDD 5.1 一覧). */
export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
export type Page<T> = { items: T[]; nextCursor: string | null };

/** The largest `cursor`, an offset into the sorted list (SDD 5.1 一覧). */
export const CURSOR_MAX = 1_000_000;
export const PAGE_LIMIT_DEFAULT = 50;
export const PAGE_LIMIT_MAX = 200;

/** A whole number written in a query string, without sign, spaces or leading zeros. */
export const queryIntSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]{0,15})$/)
  .transform(Number);

/**
 * `?cursor=&limit=` of a paged list (SDD 5.1 一覧). The cursor is the offset of the
 * next page; an unreadable one fails on the path `cursor`.
 */
export const pageQuerySchema = z.object({
  cursor: queryIntSchema.pipe(z.int().max(CURSOR_MAX)).optional(),
  limit: queryIntSchema
    .pipe(z.int().min(1).max(PAGE_LIMIT_MAX))
    .default(PAGE_LIMIT_DEFAULT),
});

/** `true` or `false` in a query string. */
export const queryBooleanSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

/** What a save under the optimistic lock sends about the version it read (ADR-019). */
export const lockClaimShape = {
  lockVersion: z.int().nonnegative(),
  /** "Overwrite with mine": saves over a newer version. */
  force: z.boolean().optional(),
};

export const userRefSchema = z.object({
  id: uuidSchema,
  /** `"Deleted user"` when `badge` is `deleted`. */
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  badge: z.enum(["former_member", "suspended", "deleted"]).nullable(),
});
export type UserRef = z.infer<typeof userRefSchema>;

export const versionedSchema = z.object({
  lockVersion: z.int().nonnegative(),
  updatedAt: dateTimeSchema.nullable(),
  updatedBy: userRefSchema.nullable(),
});
export type Versioned = z.infer<typeof versionedSchema>;

/** A screen to move to. The client turns it into a route of SDD 4章. */
export const linkTargetSchema = z.object({
  /** The screen number of design-spec 3章. */
  screen: z.int().positive(),
  workspaceId: uuidSchema.optional(),
  ideaId: uuidSchema.optional(),
  planId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  sectionKey: z.string().optional(),
  questionKey: z.string().optional(),
  rowId: uuidSchema.optional(),
  field: economicsFieldSchema.optional(),
  tab: z.string().optional(),
  itemNo: z.int().positive().optional(),
  panel: z.enum(["comments", "history"]).optional(),
  target: targetRefSchema.optional(),
  /** Opens a new research log entry on 14. */
  newEntry: z.boolean().optional(),
  /** The Supports check tags the new entry starts with. */
  presetSupports: z.array(supportsCheckSchema).optional(),
});
export type LinkTarget = z.infer<typeof linkTargetSchema>;

// ---- F/A/U and evidence ----

export const evidenceSchema = z.object({
  /** `evidence_links.id`. */
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
export type Evidence = z.infer<typeof evidenceSchema>;

export const classificationSchema = z.object({
  fau: fauSchema.nullable(),
  /** Only with `fau = "assumption"`. */
  confidence: confidenceSchema.nullable(),
  state: fauStateSchema,
  /** Includes links to deleted research logs (`deleted: true`). */
  evidence: z.array(evidenceSchema),
});
export type Classification = z.infer<typeof classificationSchema>;

/**
 * Assumption without a confidence is not refused here: the API answers it with its own
 * code, 422 CONFIDENCE_REQUIRED (SDD 5.7 V3), not VALIDATION_FAILED.
 */
export const classificationInputSchema = z.object({
  fau: fauSchema.nullable(),
  confidence: confidenceSchema.nullable().optional(),
});
export type ClassificationInput = z.infer<typeof classificationInputSchema>;

export const fauBreakdownSchema = z.object({
  fact: z.int().nonnegative(),
  /** Included in `fact`. */
  factNoEvidence: z.int().nonnegative(),
  assumption: z.object({
    total: z.int().nonnegative(),
    low: z.int().nonnegative(),
    medium: z.int().nonnegative(),
    high: z.int().nonnegative(),
  }),
  unknown: z.int().nonnegative(),
  unclassified: z.int().nonnegative(),
  empty: z.int().nonnegative(),
});
export type FauBreakdown = z.infer<typeof fauBreakdownSchema>;

// ---- Templates ----

export const questionOptionsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), choices: z.array(z.string()) }),
  z.object({
    kind: z.literal("table"),
    columns: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        // percent holds a 0..1 rate (SDD 5.1); money is in the workspace currency.
        type: z.enum(["text", "number", "percent", "money"]),
      }),
    ),
  }),
  z.object({
    kind: z.literal("linked_metric"),
    /** Key metric keys of design-spec 6.4. */
    metricKeys: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("execution_view"),
    executionType: executionTypeSchema,
  }),
]);
export type QuestionOptions = z.infer<typeof questionOptionsSchema>;

export const templateQuestionSchema = z.object({
  /** The question ID of design-spec 6.6. */
  key: z.string(),
  sectionKey: z.string(),
  title: z.string(),
  prompt: z.string(),
  example: z.string().nullable(),
  hint: z.string().nullable(),
  answerType: answerTypeSchema,
  options: questionOptionsSchema.nullable(),
  /** Example: `{ "V.02.OCEAN": ["Red", "Mixed"] }`. */
  displayCondition: z.record(z.string(), z.array(z.string())).nullable(),
  hasFau: z.boolean(),
});
export type TemplateQuestion = z.infer<typeof templateQuestionSchema>;

export const templateSectionSchema = z.object({
  key: z.string(),
  part: z.enum(["a", "b"]).nullable(),
  title: z.string(),
  /** The short paraphrase beside the heading (design-spec 6.2・9.3). */
  subtitle: z.string().nullable(),
  guidance: z.string().nullable(),
  questions: z.array(templateQuestionSchema),
});
export type TemplateSection = z.infer<typeof templateSectionSchema>;

const templateVersionRefSchema = z.object({
  versionId: uuidSchema,
  versionNumber: z.int().positive(),
});

export const templateRefSchema = templateVersionRefSchema.extend({
  newerVersion: templateVersionRefSchema.nullable(),
});
export type TemplateRef = z.infer<typeof templateRefSchema>;

// ---- Calculation results (packages/domain. design-spec 6.4) ----

export const metricReasonSchema = z.enum([
  "needs_price",
  "needs_monthly_costs",
  "needs_expected_sales",
  "needs_startup_costs",
  "margin_not_positive",
  "target_margin_unreachable",
  "not_recovered",
  "empty",
  "unknown",
]);
export type MetricReason = z.infer<typeof metricReasonSchema>;

/**
 * lower shows as "+" and upper as "≤" (cost rows that are Empty or Unknown). approximate
 * shows as "≈": the true value may lie either way (design-spec 6.4, the ROI of a loss).
 */
export const metricBoundSchema = z.enum([
  "exact",
  "lower",
  "upper",
  "approximate",
]);
export type MetricBound = z.infer<typeof metricBoundSchema>;

export const metricValueSchema = z.object({
  /** Unrounded. Null when it cannot be calculated. */
  value: z.number().nullable(),
  bound: metricBoundSchema,
  /** Why `value` is null. Both null: the operating margin of zero revenue, shown as a dash. */
  reason: metricReasonSchema.nullable(),
});
export type MetricValue = z.infer<typeof metricValueSchema>;

export const costTotalSchema = z.object({
  amount: z.number().nullable(),
  isLowerBound: z.boolean(),
  unknownRows: z.int().nonnegative(),
  emptyRows: z.int().nonnegative(),
});
export type CostTotal = z.infer<typeof costTotalSchema>;

export const scenarioKeySchema = z.enum([
  "break_even",
  "conservative",
  "expected",
  "strong",
  "capacity",
]);
export type ScenarioKey = z.infer<typeof scenarioKeySchema>;

export const scenarioColumnSchema = z.object({
  key: scenarioKeySchema,
  unitsPerDay: metricValueSchema,
  unitsPerMonth: metricValueSchema,
  revenue: metricValueSchema,
  variableCostTotal: metricValueSchema,
  operatingProfit: metricValueSchema,
  operatingMargin: metricValueSchema,
  exceedsCapacity: z.boolean(),
});
export type ScenarioColumn = z.infer<typeof scenarioColumnSchema>;

export const economicsWarningSchema = z.enum([
  "margin_not_positive",
  "target_margin_unreachable",
  "break_even_above_capacity",
  "conservative_exceeds_capacity",
  "expected_exceeds_capacity",
  "strong_exceeds_capacity",
  "costs_incomplete",
]);
export type EconomicsWarning = z.infer<typeof economicsWarningSchema>;

export const economicsResultSchema = z.object({
  variableCostPerUnit: metricValueSchema,
  contributionMargin: metricValueSchema,
  contributionMarginRate: metricValueSchema,
  breakEvenUnitsMonth: metricValueSchema,
  breakEvenUnitsDay: metricValueSchema,
  breakEvenRevenue: metricValueSchema,
  targetMarginUnitsMonth: metricValueSchema,
  targetMarginUnitsDay: metricValueSchema,
  /** Five columns, in the order of `scenarioKeySchema`. */
  scenarios: z.array(scenarioColumnSchema).length(5),
  paybackMonths: metricValueSchema,
  simpleRoi: metricValueSchema,
  totals: z.object({
    initial: costTotalSchema,
    monthlyFixed: costTotalSchema,
    variablePerUnit: costTotalSchema,
  }),
  defaultsUsed: z.object({
    operatingDays: z.boolean(),
    targetMargin: z.boolean(),
  }),
  warnings: z.array(economicsWarningSchema),
});
export type EconomicsResult = z.infer<typeof economicsResultSchema>;

/**
 * Keyed by the single-value key metrics of design-spec 6.4 (`initial_cost_total`, ...,
 * `cost_row:{template key}`). The table-shaped `scenario_table` and `scenario:*` are read
 * from `EconomicsResult.scenarios` instead.
 */
export const keyMetricsSchema = z.record(z.string(), metricValueSchema);
export type KeyMetrics = z.infer<typeof keyMetricsSchema>;

// ---- Checks and Next steps (design-spec 6.1) ----

export const checkMissingSchema = z.enum([
  "price",
  "monthly_costs",
  "initial_amount",
  "monthly_amount",
]);
export type CheckMissing = z.infer<typeof checkMissingSchema>;

export const checkResultSchema = z.object({
  key: checkKeySchema,
  state: checkStateSchema,
  /** The competitor count and the demand signal count. Null for the other checks. */
  count: z.int().nonnegative().nullable(),
  /**
   * The template's thresholds. competitors is `{ min, max }`, where max is the fixed
   * guide of 5 that the template does not hold. local_price is
   * `{ pricedCompetitors, researchLogs }`, permits and demand_signal `{ researchLogs }`,
   * costs and break_even `{}`.
   */
  params: z.record(z.string(), z.number()),
  detail: z
    .object({
      emptyRows: z.int().nonnegative().optional(),
      missing: z.array(checkMissingSchema).optional(),
    })
    .nullable(),
  /** Null when the caller cannot enter the destination, like NextStep.link. */
  link: linkTargetSchema.nullable(),
});
export type CheckResult = z.infer<typeof checkResultSchema>;

export const nextStepKindSchema = z.enum([
  "add_evidence",
  "classify",
  "start_customer_problem",
  "check",
  "start_section",
  "check_unknowns",
  "ready_to_decide",
]);
export type NextStepKind = z.infer<typeof nextStepKindSchema>;

export const nextStepSchema = z.object({
  kind: nextStepKindSchema,
  /**
   * The item count for add_evidence, classify and check_unknowns. For check: the empty
   * cost rows of costs (null when 0) and the threshold min of competitors. Null otherwise.
   */
  count: z.int().nonnegative().nullable(),
  checkKey: checkKeySchema.nullable(),
  sectionKey: z.string().nullable(),
  /** Null when the caller cannot enter the destination: shown as text, not a link. */
  link: linkTargetSchema.nullable(),
});
export type NextStep = z.infer<typeof nextStepSchema>;

// ---- Conflicts (error.current of 409 CONFLICT) ----

export const conflictCurrentSchema = z.object({
  value: z.unknown(),
  lockVersion: z.int().nonnegative(),
  updatedAt: dateTimeSchema,
  updatedBy: userRefSchema.nullable(),
});
export type ConflictCurrent = z.infer<typeof conflictCurrentSchema>;
