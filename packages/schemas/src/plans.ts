import { z } from "zod";
import {
  confidenceSchema,
  costCategorySchema,
  dateOnlySchema,
  dateTimeSchema,
  decisionValueSchema,
  type ExecutionStatus,
  type ExecutionType,
  executionStatusSchema,
  executionTypeSchema,
  goNoGoValueSchema,
  keyMetricsSchema,
  launchTimingSchema,
  linkTargetSchema,
  lockClaimShape,
  metricValueSchema,
  queryBooleanSchema,
  queryIntSchema,
  scenarioColumnSchema,
  sourceTypeSchema,
  stageSchema,
  templateQuestionSchema,
  templateRefSchema,
  templateSectionSchema,
  userRefSchema,
  uuidSchema,
  versionedSchema,
} from "./common";
import { decisionLogEntrySchema, decisionLogSummarySchema } from "./decisions";
import { ideaKeyMetricsSchema } from "./ideas";
import {
  assigneeNameSchema,
  competitorTypeSchema,
  dateInputSchema,
  longTextSchema,
  planNameSchema,
  reasonSchema,
  requiredShortTextSchema,
  shortTextSchema,
  versionNameSchema,
} from "./input-rules";

// The plan types of SDD 5.9: the plans of an idea (20, M5), their items (21), versions
// (M3), Go / No-Go (M4) and execution items (22).

/** The plan items: §1 to §30 (design-spec 6.12). */
export const PLAN_ITEM_COUNT = 30;

/** The stored id of a UUID, lowercase: one id written in capitals is the same row. */
const storedUuidSchema = uuidSchema.transform((id) => id.toLowerCase());

/** A saved version as a plan names it. */
export const planVersionRefSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  savedAt: dateTimeSchema,
});

/** A plan as 13 and 20 list it. */
export const planSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  archived: z.boolean(),
  latestVersion: planVersionRefSchema.nullable(),
  /**
   * An answer, table, the header or an execution item was updated after the latest
   * version was saved ("+ changes"). False when no version is saved.
   */
  hasChangesSinceVersion: z.boolean(),
  latestGoNoGo: z
    .object({
      value: goNoGoValueSchema,
      recordedAt: dateTimeSchema,
      recordedBy: userRefSchema,
    })
    .nullable(),
});
export type PlanSummary = z.infer<typeof planSummarySchema>;

export const planVersionSummarySchema = z.object({
  id: uuidSchema,
  versionNumber: z.int().positive(),
  name: z.string(),
  savedBy: userRefSchema,
  savedAt: dateTimeSchema,
});
export type PlanVersionSummary = z.infer<typeof planVersionSummarySchema>;

/**
 * The mark of a plan item on 20 (design-spec 6.12): V when a sub-item is copied from the
 * validation by the draft or shows its numbers, S when one refers to the shared
 * self-analyses.
 */
export const planItemMarkSchema = z.enum(["V", "S"]);
export type PlanItemMark = z.infer<typeof planItemMarkSchema>;

export const planPartSchema = z.enum(["a", "b"]);

/** P2 GET: the plan home (20). `Versioned` is the header's. */
export const planHomeSchema = planSummarySchema.extend({
  ...versionedSchema.shape,
  ideaId: uuidSchema,
  workspaceId: uuidSchema,
  template: templateRefSchema,
  /** The saved version's when one is viewed. */
  businessName: z.string(),
  preparedBy: z.string(),
  /** The last change to the header, an answer or an execution item; a viewed version's save. */
  date: dateTimeSchema,
  latestDecision: decisionValueSchema.nullable(),
  /** The idea is archived: 20–23 are read only. */
  ideaArchived: z.boolean(),
  /**
   * Every answer is still the draft's copy and the starting execution rows are untouched
   * (20's "Start with…"). From the plan as it is now, also while a version is viewed.
   */
  draftOnly: z.boolean(),
  viewingVersion: planVersionRefSchema.nullable(),
  /** The validation's now, or the viewed version's. */
  keyMetrics: ideaKeyMetricsSchema,
  /** Newest first. */
  versions: z.array(planVersionSummarySchema),
  /**
   * The execution items not Done or Resolved due within 7 days (dueSoon) and before
   * today (overdue), in the caller's time zone. From the items as they are now.
   */
  execution: z.object({
    dueSoon: z.int().nonnegative(),
    overdue: z.int().nonnegative(),
  }),
  parts: z.array(
    z.object({
      part: planPartSchema,
      /** The items whose counted sub-items are all filled. */
      completeItems: z.int().nonnegative(),
      totalItems: z.int().nonnegative(),
      items: z.array(
        z.object({
          itemNo: z.int().min(1).max(PLAN_ITEM_COUNT),
          title: z.string(),
          marks: z.array(planItemMarkSchema),
          /**
           * The sub-items filled, of those counted: a text that is not blank, a table
           * with a row, an execution view with an item. Number sub-items are not counted.
           */
          filled: z.int().nonnegative(),
          total: z.int().nonnegative(),
          /** On its answers and on the execution items it shows, replies included. */
          commentCount: z.int().nonnegative(),
        }),
      ),
    }),
  ),
});
export type PlanHome = z.infer<typeof planHomeSchema>;

/** A cell of a table sub-item: text, or a number for number, % (0–1) and money columns. */
export const planTableCellSchema = z.union([z.string(), z.number()]).nullable();
export const planTableRowSchema = z.record(z.string(), planTableCellSchema);
export type PlanTableRow = z.infer<typeof planTableRowSchema>;

export const planAnswerSchema = versionedSchema.extend({
  questionKey: z.string(),
  text: z.string().nullable(),
  /**
   * The rows of a table sub-item (§11, §13, §21, §22), keyed by the template's column
   * keys, plus the values of columns a template migration removed: send those back as
   * they are.
   */
  rows: z.array(planTableRowSchema).nullable(),
  /** Set when the draft copied the answer from the validation (`source`: what it copied). */
  copiedFrom: z
    .object({ source: z.string(), copiedAt: dateTimeSchema })
    .nullable(),
  commentCount: z.int().nonnegative(),
});
export type PlanAnswer = z.infer<typeof planAnswerSchema>;

// ---- References beside a plan item (SDD 5.9 PlanReference, 6.3 `reference`) ----

export const planReferenceKindSchema = z.enum([
  "validation_answers",
  "competitors",
  "cost_rows",
  "research_log",
  "decision_log",
  "self_analysis",
  "metrics",
  "assumptions",
  "risks",
  "go_no_go_history",
  "totals",
]);
export type PlanReferenceKind = z.infer<typeof planReferenceKindSchema>;

const reference = <K extends PlanReferenceKind, D extends z.ZodType>(
  kind: K,
  data: D,
) =>
  z.object({
    kind: z.literal(kind),
    /** English, as the screen shows it. */
    title: z.string(),
    data,
    /** The screen with the whole of it; null when there is none. */
    link: linkTargetSchema.nullable(),
  });

/**
 * What a plan item shows beside its sub-items, always the validation's latest (design-
 * spec 6.12). `data` has a shape per `kind`.
 */
export const planReferenceSchema = z.discriminatedUnion("kind", [
  reference(
    "validation_answers",
    z.array(
      z.object({
        questionKey: z.string(),
        title: z.string(),
        /** Null when blank. Questions hidden by their display condition are left out. */
        text: z.string().nullable(),
      }),
    ),
  ),
  reference(
    "competitors",
    z.array(
      z.object({
        id: uuidSchema,
        name: z.string(),
        type: competitorTypeSchema.nullable(),
        typicalPrice: z.number().nullable(),
        strength: z.string().nullable(),
        weakness: z.string().nullable(),
      }),
    ),
  ),
  reference(
    "cost_rows",
    z.array(
      z.object({
        /**
         * Null for a key the validation has no row of (design-spec 6.0.7「Not in
         * validation」): its row deleted, or a key its template lacks. Such an entry has
         * the template's name and category for the key (null when no published
         * validation template has it) and no input.
         */
        id: uuidSchema.nullable(),
        category: costCategorySchema.nullable(),
        templateKey: z.string(),
        name: z.string().nullable(),
        inputMode: z.enum(["amount", "percent_of_price"]).nullable(),
        amount: z.number().nullable(),
        /** A 0–1 rate of the price, on a variable row entered as a %. */
        percent: z.number().nullable(),
        /** The row's amount, a % of the price worked out (design-spec 6.4). */
        value: metricValueSchema,
      }),
    ),
  ),
  reference(
    "research_log",
    z.array(
      z.object({
        id: uuidSchema,
        observedOn: dateOnlySchema.nullable(),
        topic: z.string(),
        observation: z.string().nullable(),
        sourceType: sourceTypeSchema.nullable(),
        sourceUrl: z.string().nullable(),
      }),
    ),
  ),
  reference("decision_log", z.array(decisionLogSummarySchema)),
  reference(
    "self_analysis",
    z.array(
      z.object({
        /** The `targetId` of comments on its answers. */
        selfAnalysisId: uuidSchema,
        user: userRefSchema,
        currency: z.string(),
        sections: z.array(
          templateSectionSchema.omit({ questions: true }).extend({
            answers: z.array(
              z.object({
                questionKey: z.string(),
                title: z.string(),
                text: z.string().nullable(),
                amount: z.number().nullable(),
              }),
            ),
          }),
        ),
      }),
    ),
  ),
  reference(
    "metrics",
    z.array(z.object({ key: z.string(), value: metricValueSchema })),
  ),
  reference(
    "assumptions",
    z.array(
      z.object({
        id: uuidSchema,
        statement: z.string(),
        whyBelieve: z.string().nullable(),
        /** The evidence as the draft writes it into §21's Evidence column. */
        evidence: z.string().nullable(),
        confidence: confidenceSchema.nullable(),
        disproveCondition: z.string().nullable(),
      }),
    ),
  ),
  reference(
    "risks",
    z.array(
      z.object({
        id: uuidSchema,
        statement: z.string(),
        probability: confidenceSchema.nullable(),
        impact: confidenceSchema.nullable(),
        mitigation: z.string().nullable(),
      }),
    ),
  ),
  reference("go_no_go_history", z.array(decisionLogSummarySchema)),
  reference(
    "totals",
    z.object({
      /** The sum of the % column, a 0–1 rate (no warning when it is not 1). */
      ownership: z.number(),
      /** The sum of the money column. */
      capital: z.number(),
    }),
  ),
]);
export type PlanReference = z.infer<typeof planReferenceSchema>;

// ---- Execution items (22) ----

export const executionAssigneeSchema = z
  .union([z.object({ user: userRefSchema }), z.object({ name: z.string() })])
  .nullable();

export const executionItemSchema = versionedSchema.extend({
  id: uuidSchema,
  type: executionTypeSchema,
  title: z.string(),
  assignee: executionAssigneeSchema,
  dueDate: dateOnlySchema.nullable(),
  status: executionStatusSchema.nullable(),
  /** Due before today in the caller's time zone, and not Done or Resolved. */
  overdue: z.boolean(),
  goal: z.string().nullable(),
  exitCondition: z.string().nullable(),
  launchTiming: launchTimingSchema.nullable(),
  actions: z.string().nullable(),
  completionCriteria: z.string().nullable(),
  kpiArea: z.string().nullable(),
  kpiTarget: z.string().nullable(),
  kpiReviewFrequency: z.string().nullable(),
  kpiActual: z.string().nullable(),
  kpiActualUpdatedAt: dateTimeSchema.nullable(),
  whyItMatters: z.string().nullable(),
  answer: z.string().nullable(),
  /** One of the template's starting rows. */
  fromPreset: z.boolean(),
  completedAt: dateTimeSchema.nullable(),
  sortOrder: z.int(),
  commentCount: z.int().nonnegative(),
});
export type ExecutionItem = z.infer<typeof executionItemSchema>;

/** The columns of 22 beyond the title, the assignee and the status (design-spec 6.13). */
export type ExecutionColumn =
  | "dueDate"
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
  | "answer";

/** The columns each type has (design-spec 6.13, SDD 5.9 P9 / P10). */
export const EXECUTION_COLUMNS: Record<
  ExecutionType,
  readonly ExecutionColumn[]
> = {
  milestone: ["dueDate", "goal", "exitCondition"],
  launch: ["dueDate", "launchTiming", "actions", "completionCriteria"],
  kpi: ["kpiArea", "kpiTarget", "kpiReviewFrequency", "kpiActual"],
  open_question: ["dueDate", "whyItMatters", "answer"],
  next_action: ["dueDate"],
};

/** The statuses each type takes, the first being a new item's. KPIs have none (null). */
export const EXECUTION_STATUSES: Record<
  ExecutionType,
  readonly ExecutionStatus[]
> = {
  milestone: ["todo", "doing", "done"],
  launch: ["todo", "doing", "done"],
  kpi: [],
  open_question: ["open", "resolved"],
  next_action: ["todo", "doing", "done"],
};

/** What starts a plan screen's section key for the execution items of one type. */
const EXECUTION_SECTION_PREFIX = "execution:";

/**
 * The section key (C1's and H1's `sectionKeys`) of a plan's execution items of `type`, as
 * 21 lists them beside its item's own section (SDD 6.3「画面と節の対応」): their comments
 * and changes keep 22's key, `execution`.
 */
export const executionSectionKey = (type: ExecutionType) =>
  `${EXECUTION_SECTION_PREFIX}${type}`;

/** The type an {@link executionSectionKey} names; undefined for any other key. */
export function executionTypeOfSectionKey(
  key: string,
): ExecutionType | undefined {
  if (!key.startsWith(EXECUTION_SECTION_PREFIX)) return undefined;
  const parsed = executionTypeSchema.safeParse(
    key.slice(EXECUTION_SECTION_PREFIX.length),
  );
  return parsed.success ? parsed.data : undefined;
}

/** The types 22 reorders by hand: Next Actions go by their due date (design-spec 6.13). */
export const ORDERED_EXECUTION_TYPES = [
  "milestone",
  "launch",
  "kpi",
  "open_question",
] as const satisfies readonly ExecutionType[];

const executionFields = {
  /** An Owner or Member of the workspace; one of this and `assigneeName`. */
  assigneeUserId: storedUuidSchema.nullable().optional(),
  /** Blank is saved as null. */
  assigneeName: assigneeNameSchema.optional(),
  dueDate: dateInputSchema.nullable().optional(),
  status: executionStatusSchema.nullable().optional(),
  goal: longTextSchema.optional(),
  exitCondition: longTextSchema.optional(),
  launchTiming: launchTimingSchema.optional(),
  actions: longTextSchema.optional(),
  completionCriteria: longTextSchema.optional(),
  kpiArea: shortTextSchema.optional(),
  kpiTarget: shortTextSchema.optional(),
  kpiReviewFrequency: shortTextSchema.optional(),
  kpiActual: shortTextSchema.optional(),
  whyItMatters: longTextSchema.optional(),
  answer: longTextSchema.optional(),
};

/**
 * The body of P9 POST. A column the type lacks is refused, not dropped. A launch item
 * goes to Other unless `launchTiming` says otherwise; the status starts at the type's
 * first.
 */
export const executionItemCreateSchema = z.object({
  type: executionTypeSchema,
  title: requiredShortTextSchema,
  ...executionFields,
});
export type ExecutionItemCreate = z.infer<typeof executionItemCreateSchema>;

/** The body of P10 PATCH: only the fields sent change. */
export const executionItemUpdateSchema = z.object({
  title: requiredShortTextSchema.optional(),
  ...executionFields,
  ...lockClaimShape,
});
export type ExecutionItemUpdate = z.infer<typeof executionItemUpdateSchema>;

/** The query of P9 GET. */
export const executionListQuerySchema = z.object({
  type: executionTypeSchema.optional(),
  /** `me`, or a user's id. */
  assignee: z.union([z.literal("me"), storedUuidSchema]).optional(),
  status: executionStatusSchema.optional(),
});

/**
 * P9 GET: by type in the order of {@link executionTypeSchema}; Next Actions by due date
 * (none last), the others in their order on 22 (P11).
 */
export const executionListSchema = z.object({
  items: z.array(executionItemSchema),
});

/** The body of P11: every item of the type not deleted, in the new order. */
export const executionOrderSchema = z.object({
  type: executionTypeSchema,
  ids: z.array(storedUuidSchema),
});

// ---- Plans, items and versions ----

/** The query of P1 GET. */
export const planListQuerySchema = z.object({
  includeArchived: queryBooleanSchema.default(false),
});

/** P1 GET: in the order the plans were made. */
export const planListSchema = z.object({ items: z.array(planSummarySchema) });

/** The body of P1 POST (M5). */
export const planCreateSchema = z.object({ name: planNameSchema });

/** The body of P2 PATCH: only the fields sent change. Blank names the business "". */
export const planUpdateSchema = z.object({
  name: planNameSchema.optional(),
  businessName: shortTextSchema.optional(),
  preparedBy: shortTextSchema.optional(),
  ...lockClaimShape,
});
export type PlanUpdate = z.infer<typeof planUpdateSchema>;

/** The query of P2 GET and P4: a saved version of the plan to view. */
export const planVersionQuerySchema = z.object({
  versionId: uuidSchema.optional(),
});

/** The path of P4. */
export const planItemParamsSchema = z.object({
  planId: z.string(),
  itemNo: queryIntSchema.pipe(z.int().min(1).max(PLAN_ITEM_COUNT)),
});

/** P4: one plan item (21). */
export const planItemSchema = z.object({
  itemNo: z.int().min(1).max(PLAN_ITEM_COUNT),
  title: z.string(),
  guidance: z.string().nullable(),
  /** A version is viewed, the plan or idea is archived, or the caller is a Viewer. */
  readOnly: z.boolean(),
  prompts: z.array(templateQuestionSchema),
  /** One per prompt that takes an answer (text, choice, table), unanswered ones included. */
  answers: z.array(planAnswerSchema),
  /** The single-value key metrics the number sub-items show (a viewed version's). */
  metrics: keyMetricsSchema,
  /** The scenario columns the `scenario:*` sub-items show (a viewed version's). */
  scenarios: z.array(scenarioColumnSchema),
  /** The items of its execution views, in P9's order (a viewed version's). */
  execution: z.array(executionItemSchema),
  /** The self-analyses only for Owners and Members. */
  references: z.array(planReferenceSchema),
});
export type PlanItem = z.infer<typeof planItemSchema>;

/** The path of P5. */
export const planAnswerParamsSchema = z.object({
  planId: z.string(),
  questionKey: z.string(),
});

/** The body of P5. `text` for a text or choice sub-item, `rows` for a table. */
export const planAnswerSaveSchema = z.object({
  /** Checked against the question afterwards: a short text has a shorter limit. */
  text: longTextSchema.optional(),
  rows: z.array(planTableRowSchema).nullable().optional(),
  ...lockClaimShape,
});
export type PlanAnswerSave = z.infer<typeof planAnswerSaveSchema>;

/** P6 GET: newest first. */
export const planVersionListSchema = z.object({
  items: z.array(planVersionSummarySchema),
});

/** The body of P6 POST (M3). */
export const planVersionCreateSchema = z.object({ name: versionNameSchema });

/** §24, the conditions a Go / No-Go is recorded against. */
export const goNoGoConditionsSchema = z.object({
  launchIf: z.string().nullable(),
  delayIf: z.string().nullable(),
  stopIf: z.string().nullable(),
});

/** P7: what M4 shows. */
export const goNoGoContextSchema = z.object({
  conditions: goNoGoConditionsSchema,
  keyMetrics: keyMetricsSchema,
  currentVersion: planVersionSummarySchema.nullable(),
  hasChangesSinceVersion: z.boolean(),
  /** The plan's Go / No-Go entries, newest first. */
  history: z.array(decisionLogSummarySchema),
});

/** The body of P8 (M4). */
export const goNoGoCreateSchema = z.object({
  value: goNoGoValueSchema,
  reason: reasonSchema,
});

/** P8: the entry recorded and the idea's stage after it. */
export const goNoGoResultSchema = z.object({
  entry: decisionLogEntrySchema,
  stage: stageSchema,
});

/**
 * What a saved version keeps (SDD 6.3 末尾, `plan_versions.snapshot`). Execution items
 * keep their id, so comments on them still count while a version is viewed.
 */
export const planVersionSnapshotSchema = z.object({
  header: z.object({
    name: z.string(),
    businessName: z.string(),
    preparedBy: z.string(),
  }),
  answers: z.array(
    z.object({
      questionKey: z.string(),
      text: z.string().nullable(),
      rows: z.array(planTableRowSchema).nullable(),
    }),
  ),
  keyMetrics: keyMetricsSchema,
  scenarios: z.array(scenarioColumnSchema),
  execution: z.array(
    z.object({
      id: uuidSchema,
      type: executionTypeSchema,
      title: z.string(),
      assigneeUserId: uuidSchema.nullable(),
      assigneeName: z.string().nullable(),
      dueDate: dateOnlySchema.nullable(),
      status: executionStatusSchema.nullable(),
      goal: z.string().nullable(),
      exitCondition: z.string().nullable(),
      launchTiming: launchTimingSchema.nullable(),
      actions: z.string().nullable(),
      completionCriteria: z.string().nullable(),
      kpiArea: z.string().nullable(),
      kpiTarget: z.string().nullable(),
      kpiReviewFrequency: z.string().nullable(),
      kpiActual: z.string().nullable(),
      kpiActualUpdatedAt: dateTimeSchema.nullable(),
      whyItMatters: z.string().nullable(),
      answer: z.string().nullable(),
      fromPreset: z.boolean(),
      completedAt: dateTimeSchema.nullable(),
      sortOrder: z.int(),
    }),
  ),
  competitors: z.array(
    z.object({
      name: z.string(),
      type: competitorTypeSchema.nullable(),
      typicalPrice: z.number().nullable(),
      strength: z.string().nullable(),
      weakness: z.string().nullable(),
    }),
  ),
});
export type PlanVersionSnapshot = z.infer<typeof planVersionSnapshotSchema>;
