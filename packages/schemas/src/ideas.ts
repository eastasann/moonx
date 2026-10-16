import { z } from "zod";
import {
  checkKeySchema,
  checkStateSchema,
  dateOnlySchema,
  dateTimeSchema,
  decisionValueSchema,
  executionTypeSchema,
  goNoGoValueSchema,
  linkTargetSchema,
  lockClaimShape,
  metricValueSchema,
  pageQuerySchema,
  pageSchema,
  queryBooleanSchema,
  stageSchema,
  userRefSchema,
  uuidSchema,
  versionedSchema,
} from "./common";
import { namedRefSchema } from "./decisions";
import {
  ideaNameSchema,
  longTextSchema,
  oneLineConceptSchema,
  plainText,
  TEXT_LIMITS,
} from "./input-rules";

// The dashboard and idea types of SDD 5.6.

/** The four key metrics a list of ideas and 13 show (design-spec 6.4). */
export const ideaKeyMetricsSchema = z.object({
  initial_cost_total: metricValueSchema,
  break_even_units_day: metricValueSchema,
  expected_operating_profit: metricValueSchema,
  payback_months: metricValueSchema,
});
export type IdeaKeyMetrics = z.infer<typeof ideaKeyMetricsSchema>;

export const ideaSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  oneLineConcept: z.string(),
  proposer: userRefSchema,
  stage: stageSchema,
  latestDecision: decisionValueSchema.nullable(),
  archived: z.boolean(),
  /**
   * The six checks, in their order. No total or score. `params` are the thresholds of
   * CheckResult, so a list can name "Competitors (3–5)".
   */
  checks: z
    .array(
      z.object({
        key: checkKeySchema,
        state: checkStateSchema,
        params: z.record(z.string(), z.number()),
      }),
    )
    .length(6),
  keyMetrics: ideaKeyMetricsSchema,
  /** The plans not archived, in the order they were made. */
  plans: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      latestVersionName: z.string().nullable(),
      latestGoNoGo: goNoGoValueSchema.nullable(),
    }),
  ),
  lastActivityAt: dateTimeSchema,
  createdAt: dateTimeSchema,
});
export type IdeaSummary = z.infer<typeof ideaSummarySchema>;

export const ideaDetailSchema = ideaSummarySchema.extend({
  ...versionedSchema.shape,
  workspaceId: uuidSchema,
  validationId: uuidSchema,
  proposedSolution: z.string().nullable(),
  /** Null when the idea is not a copy, or its source is gone. */
  duplicatedFrom: namedRefSchema.nullable(),
});
export type IdeaDetail = z.infer<typeof ideaDetailSchema>;

export const ideaDecisionFilterSchema = z.enum([
  "not_dropped",
  "all",
  "undecided",
  "proceed",
  "hold",
  "drop",
]);
export type IdeaDecisionFilter = z.infer<typeof ideaDecisionFilterSchema>;

export const ideaSortSchema = z.enum(["updated", "created", "name"]);
export type IdeaSort = z.infer<typeof ideaSortSchema>;

/** The query of I1 GET `/api/v1/workspaces/{workspaceId}/ideas`. */
export const ideaListQuerySchema = pageQuerySchema.extend({
  stage: stageSchema.optional(),
  decision: ideaDecisionFilterSchema.default("not_dropped"),
  proposerId: uuidSchema.optional(),
  includeArchived: queryBooleanSchema.default(false),
  sort: ideaSortSchema.default("updated"),
  /** Part of the name or the one-line concept, ignoring case. Blank matches everything. */
  q: plainText(TEXT_LIMITS.short).optional(),
});

/** I1 GET. */
export const ideaPageSchema = pageSchema(ideaSummarySchema).extend({
  /** The Drop ideas the default filter hid; 0 under any other decision filter. */
  hiddenDroppedCount: z.int().nonnegative(),
});

/** The body of I1 POST (M1). */
export const ideaCreateSchema = z.object({
  name: ideaNameSchema,
  oneLineConcept: oneLineConceptSchema,
  /** Blank is saved as null. */
  proposedSolution: longTextSchema.optional(),
});
export type IdeaCreate = z.infer<typeof ideaCreateSchema>;

/** The body of I2 PATCH: only the fields sent change. */
export const ideaUpdateSchema = z.object({
  name: ideaNameSchema.optional(),
  oneLineConcept: oneLineConceptSchema.optional(),
  proposedSolution: longTextSchema.optional(),
  ...lockClaimShape,
});
export type IdeaUpdate = z.infer<typeof ideaUpdateSchema>;

/** The body of I3: the name defaults to "{name} (copy)". */
export const ideaDuplicateSchema = z.object({
  name: ideaNameSchema.optional(),
});

/** I3: `batchId` is what the toast's Undo hands to H3. */
export const ideaDuplicateResultSchema = ideaDetailSchema.extend({
  batchId: uuidSchema,
});

/** D1. */
export const dashboardIdeasSchema = z.object({
  items: z.array(ideaSummarySchema),
  /** The Drop ideas not archived, which the list leaves out. */
  droppedCount: z.int().nonnegative(),
});

export const selfAnalysisStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "done",
]);
export type SelfAnalysisStatus = z.infer<typeof selfAnalysisStatusSchema>;

/** D2. */
export const dashboardSelfAnalysesSchema = z.object({
  items: z.array(
    z.object({
      user: userRefSchema,
      shared: z.boolean(),
      /** Null when not shared with this workspace: nobody sees how far it is. */
      status: selfAnalysisStatusSchema.nullable(),
    }),
  ),
});

export const dueItemSchema = z.object({
  id: uuidSchema,
  type: executionTypeSchema,
  title: z.string(),
  dueDate: dateOnlySchema,
  overdue: z.boolean(),
  assignee: z
    .union([z.object({ user: userRefSchema }), z.object({ name: z.string() })])
    .nullable(),
  isMine: z.boolean(),
  idea: namedRefSchema,
  plan: namedRefSchema,
});
export type DueItem = z.infer<typeof dueItemSchema>;

/** D3. */
export const dashboardDueSoonSchema = z.object({
  items: z.array(dueItemSchema),
});

export const activityKindSchema = z.enum([
  "change",
  "comment",
  "decision",
  "go_no_go",
  "version_saved",
]);

export const activitySchema = z.object({
  kind: activityKindSchema,
  actor: userRefSchema,
  at: dateTimeSchema,
  /**
   * What it was about. For a change or comment the item's label ("01 WHO", "Costs ·
   * Rent") or, for an operation over many items, the idea's or plan's name; for a
   * decision or Go / No-Go the value recorded; for a saved version its name. The client
   * builds the sentence from `kind`, `actor` and this.
   */
  summary: z.string(),
  idea: namedRefSchema.nullable(),
  plan: namedRefSchema.nullable(),
  link: linkTargetSchema,
});
export type Activity = z.infer<typeof activitySchema>;

/** D4. */
export const dashboardActivitySchema = z.object({
  items: z.array(activitySchema),
});
