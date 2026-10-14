import { z } from "zod";
import {
  answerTypeSchema,
  type CheckKey,
  costCategorySchema,
  executionTypeSchema,
  launchTimingSchema,
  supportsCheckSchema,
  type TemplateKind,
} from "./common";
import {
  checkThresholdSchema,
  costRowNameSchema,
  guidanceSchema,
  isQuestionKey,
  optionalText,
  plainText,
  requiredText,
  ruleIssue,
  TEXT_LIMITS,
  VALIDATION_QUESTION_SECTIONS,
} from "./input-rules";

// The template file of SDD 5.13 (AD10). AD10 and the seed check a file with this schema
// before anything is written: its shape, the values of the 27 rows of design-spec 6.0.8,
// what only one kind may hold, and the keys the database keeps unique per version. The
// content checks that only block publishing are AD6's, run on the stored draft.

export const TEMPLATE_FILE_FORMAT = "moonx-template";

const shortText = TEXT_LIMITS.short;
const longText = TEXT_LIMITS.long;

const keyText = requiredText(shortText);

const uniqueIssue = (path: PropertyKey[], message: string) => ({
  code: "custom" as const,
  path,
  message,
  ...ruleIssue("unique"),
});

const flagRepeats = (
  ctx: z.RefinementCtx,
  entries: readonly { value: string; path: PropertyKey[] }[],
  what: string,
) => {
  const seen = new Set<string>();
  for (const { value, path } of entries) {
    if (seen.has(value)) ctx.addIssue(uniqueIssue(path, `Repeats a ${what}`));
    seen.add(value);
  }
};

const tableColumnTypeSchema = z.enum(["text", "number", "percent", "money"]);

/**
 * QuestionOptions (SDD 5.2) as a file writes them: choices and column names are required
 * short texts (design-spec 6.0.8), and a table's column keys and a question's choices do
 * not repeat, since answers are stored by them.
 */
export const templateFileOptionsSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("choice"),
      choices: z.array(requiredText(shortText)),
    }),
    z.strictObject({
      kind: z.literal("table"),
      columns: z.array(
        z.strictObject({
          key: keyText,
          label: requiredText(shortText),
          type: tableColumnTypeSchema,
        }),
      ),
    }),
    z.strictObject({
      kind: z.literal("linked_metric"),
      /** Key metric keys of design-spec 6.4. */
      metricKeys: z.array(keyText),
    }),
    z.strictObject({
      kind: z.literal("execution_view"),
      executionType: executionTypeSchema,
    }),
  ])
  .superRefine((options, ctx) => {
    if (options.kind === "choice")
      flagRepeats(
        ctx,
        options.choices.map((value, i) => ({ value, path: ["choices", i] })),
        "choice",
      );
    if (options.kind === "table")
      flagRepeats(
        ctx,
        options.columns.map((column, i) => ({
          value: column.key,
          path: ["columns", i, "key"],
        })),
        "column key",
      );
  });

/**
 * The pseudo keys a plan sub-item may copy from besides validation question IDs
 * (design-spec 6.6).
 */
export const PLAN_COPY_PSEUDO_KEYS = [
  "IDEA.ONE_LINE_CONCEPT",
  "IDEA.PROPOSED_SOLUTION",
  "LIST.ASSUMPTIONS",
  "LIST.RISKS",
] as const;

const pseudoKeys = new Set<string>(PLAN_COPY_PSEUDO_KEYS);

const formatIssue = (format: string, input: string, message: string) => ({
  code: "invalid_format" as const,
  format,
  input,
  message,
});

const validationQuestionKeySchema = z.string().superRefine((key, ctx) => {
  if (!isQuestionKey(key, "validation"))
    ctx.addIssue(
      formatIssue("question_key", key, "Not a validation question ID"),
    );
});

/** One source of a plan sub-item's draft copy (SDD 6.3, `copy_from`). */
export const planCopySourceSchema = z.string().superRefine((source, ctx) => {
  if (!isQuestionKey(source, "validation") && !pseudoKeys.has(source))
    ctx.addIssue(
      formatIssue(
        "copy_source",
        source,
        "Not a validation question ID or a copy pseudo key",
      ),
    );
});

/**
 * One thing a plan sub-item shows beside it (SDD 6.3, `reference`). Validation answers
 * are named by `section` or by `keys`, never both.
 */
export const planReferenceSpecSchema = z.union([
  z.strictObject({
    kind: z.literal("validation_answers"),
    section: z.enum(VALIDATION_QUESTION_SECTIONS),
  }),
  z.strictObject({
    kind: z.literal("validation_answers"),
    keys: z.array(validationQuestionKeySchema).min(1),
  }),
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("competitors"),
      limit: z.int().positive(),
    }),
    z.strictObject({
      kind: z.literal("cost_rows"),
      /** Template cost row keys (`initial.permits`). */
      keys: z.array(keyText).min(1),
    }),
    z.strictObject({
      kind: z.literal("research_log"),
      tag: supportsCheckSchema,
    }),
    z.strictObject({
      kind: z.literal("self_analysis"),
      /** Self-analysis section keys (`WHY`). */
      sections: z.array(keyText).min(1),
    }),
    z.strictObject({
      kind: z.literal("metrics"),
      /** Key metric keys of design-spec 6.4. */
      keys: z.array(keyText).min(1),
    }),
    z.strictObject({
      kind: z.enum([
        "decision_log",
        "go_no_go_history",
        "assumptions",
        "risks",
        "totals",
      ]),
    }),
  ]),
]);
export type PlanReferenceSpec = z.infer<typeof planReferenceSpecSchema>;

/**
 * The answers a question shows on, by question ID. The keys are checked before the
 * values and reported at the condition itself, so a detail's path never repeats a key
 * that is not an ID.
 */
const displayConditionSchema = (kind: TemplateKind) =>
  z
    .record(z.string(), z.unknown())
    .superRefine((condition, ctx) => {
      if (Object.keys(condition).some((key) => !isQuestionKey(key, kind)))
        ctx.addIssue({
          code: "invalid_format",
          format: "question_key",
          message: "Shows on a key that is not a question ID of this template",
        });
    })
    .pipe(z.record(z.string(), z.array(requiredText(shortText))));

const questionSchema = (kind: TemplateKind) =>
  z.strictObject({
    key: z.string().superRefine((key, ctx) => {
      if (!isQuestionKey(key, kind))
        ctx.addIssue(
          formatIssue(
            "question_key",
            key,
            "Not a question ID of this template (design-spec 6.6)",
          ),
        );
    }),
    title: requiredText(shortText),
    prompt: requiredText(longText),
    example: optionalText(longText),
    hint: guidanceSchema,
    answerType: answerTypeSchema,
    options: templateFileOptionsSchema.nullable(),
    /** Example: `{ "V.02.OCEAN": ["Red", "Mixed"] }`. */
    displayCondition: displayConditionSchema(kind).nullable(),
    // F/A/U belongs to validation answers only (design-spec 6.0.3).
    hasFau: kind === "validation" ? z.boolean() : z.literal(false),
    copyFrom:
      kind === "business_plan"
        ? z.array(planCopySourceSchema).nullable()
        : z.null(),
    reference:
      kind === "business_plan"
        ? z.array(planReferenceSpecSchema).nullable()
        : z.null(),
  });

const sectionSchema = (kind: TemplateKind) =>
  z.strictObject({
    key: keyText,
    part: z.enum(["a", "b"]).nullable(),
    title: requiredText(shortText),
    subtitle: optionalText(shortText),
    guidance: guidanceSchema,
    questions: z.array(questionSchema(kind)),
  });

const costDefaultSchema = z.strictObject({
  category: costCategorySchema,
  key: keyText,
  name: costRowNameSchema,
});

/**
 * A check threshold of design-spec 6.1 under the names `packages/domain` reads
 * (`CheckThresholds`). costs and break_even have no threshold.
 */
export const checkRuleSchema = z.discriminatedUnion("checkKey", [
  z.strictObject({
    checkKey: z.literal("competitors"),
    params: z.strictObject({ min: checkThresholdSchema }),
  }),
  z.strictObject({
    checkKey: z.literal("local_price"),
    params: z.strictObject({
      pricedCompetitors: checkThresholdSchema,
      researchLogs: checkThresholdSchema,
    }),
  }),
  z.strictObject({
    checkKey: z.literal("costs"),
    params: z.strictObject({}),
  }),
  z.strictObject({
    checkKey: z.literal("break_even"),
    params: z.strictObject({}),
  }),
  z.strictObject({
    checkKey: z.literal("permits"),
    params: z.strictObject({ researchLogs: checkThresholdSchema }),
  }),
  z.strictObject({
    checkKey: z.literal("demand_signal"),
    params: z.strictObject({ researchLogs: checkThresholdSchema }),
  }),
]);
export type CheckRule = z.infer<typeof checkRuleSchema>;

/** The checks a validation template must give thresholds for: the checks judge by them. */
export const THRESHOLD_CHECK_KEYS = [
  "competitors",
  "local_price",
  "permits",
  "demand_signal",
] as const satisfies readonly CheckKey[];

const presetTitle = requiredText(shortText);

/** An initial execution row of a plan template (design-spec 6.13). */
export const executionPresetSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("milestone"),
    title: presetTitle,
    area: z.null(),
    launchTiming: z.null(),
  }),
  z.strictObject({
    type: z.literal("launch"),
    title: presetTitle,
    area: z.null(),
    // 22 groups launch rows by their timing, so a launch row always has one.
    launchTiming: launchTimingSchema,
  }),
  z.strictObject({
    type: z.literal("kpi"),
    title: presetTitle,
    area: optionalText(shortText),
    launchTiming: z.null(),
  }),
]);

const fileFields = {
  format: z.literal(TEMPLATE_FILE_FORMAT),
  formatVersion: z.literal(1),
  name: requiredText(shortText),
};

/** A list only another kind of template holds: it must be empty. */
const noneOf = <T extends z.ZodType>(item: T) => z.array(item).max(0);

// Only a self-analysis template has an AI prompt (2026-10-02 user decision, SDD 5.13).
// Blank counts as empty, as for any optional text.
const noAiPrompt = plainText(longText).pipe(z.string().max(0));

/** The template file of SDD 5.13 (AD10), checked as design-spec 6.0.8 and 6.17 ask. */
export const templateFileSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      ...fileFields,
      kind: z.literal("self_analysis"),
      aiPrompt: plainText(longText),
      sections: z.array(sectionSchema("self_analysis")),
      costDefaults: noneOf(costDefaultSchema),
      checkRules: noneOf(checkRuleSchema),
      executionPresets: noneOf(executionPresetSchema),
    }),
    z.strictObject({
      ...fileFields,
      kind: z.literal("validation"),
      aiPrompt: noAiPrompt,
      sections: z.array(sectionSchema("validation")),
      costDefaults: z.array(costDefaultSchema),
      checkRules: z.array(checkRuleSchema),
      executionPresets: noneOf(executionPresetSchema),
    }),
    z.strictObject({
      ...fileFields,
      kind: z.literal("business_plan"),
      aiPrompt: noAiPrompt,
      sections: z.array(sectionSchema("business_plan")),
      costDefaults: noneOf(costDefaultSchema),
      checkRules: noneOf(checkRuleSchema),
      executionPresets: z.array(executionPresetSchema),
    }),
  ])
  .superRefine((file, ctx) => {
    flagRepeats(
      ctx,
      file.sections.map((section, s) => ({
        value: section.key,
        path: ["sections", s, "key"],
      })),
      "section key",
    );
    flagRepeats(
      ctx,
      file.sections.flatMap((section, s) =>
        section.questions.map((question, q) => ({
          value: question.key,
          path: ["sections", s, "questions", q, "key"],
        })),
      ),
      "question ID",
    );
    flagRepeats(
      ctx,
      file.costDefaults.map((row, i) => ({
        value: row.key,
        path: ["costDefaults", i, "key"],
      })),
      "cost row key",
    );
    const checkKeys = file.checkRules.map((rule) => rule.checkKey);
    flagRepeats(
      ctx,
      checkKeys.map((value, i) => ({
        value,
        path: ["checkRules", i, "checkKey"],
      })),
      "check",
    );
    if (file.kind !== "validation") return;
    for (const key of THRESHOLD_CHECK_KEYS) {
      if (!checkKeys.includes(key))
        ctx.addIssue({
          code: "custom",
          path: ["checkRules"],
          message: `Needs the thresholds of the check ${key}`,
          ...ruleIssue("required"),
        });
    }
  });
export type TemplateFile = z.output<typeof templateFileSchema>;
