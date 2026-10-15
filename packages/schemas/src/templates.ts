import { z } from "zod";
import {
  answerTypeSchema,
  checkKeySchema,
  costCategorySchema,
  dateTimeSchema,
  launchTimingSchema,
  templateKindSchema,
  templateQuestionSchema,
  templateRefSchema,
  templateSectionSchema,
  userRefSchema,
  uuidSchema,
} from "./common";
import {
  guidanceSchema,
  optionalText,
  plainText,
  requiredText,
  TEXT_LIMITS,
} from "./input-rules";
import {
  checkRuleSchema,
  flagRepeats,
  planCopySourceSchema,
  planReferenceSpecSchema,
  templateCostDefaultSchema,
  templateFileOptionsSchema,
} from "./template-file";

// Template migration (SDD 5.12 T1・T2) and the operator's template API (5.13 AD1–AD6,
// AD10). The values follow the 27 rows of design-spec 6.0.8, as a template file does.

const shortText = TEXT_LIMITS.short;
const longText = TEXT_LIMITS.long;

// ---- T1・T2 ----

/** The query of T1: the self-analysis, validation or plan to migrate. */
export const templateMigrationPreviewQuerySchema = z.object({
  targetType: templateKindSchema,
  targetId: z.string(),
});
export type TemplateMigrationPreviewQuery = z.infer<
  typeof templateMigrationPreviewQuerySchema
>;

/** T1 `GET /api/v1/template-migrations/preview`: what M8 shows before migrating. */
export const templateMigrationPreviewSchema = z.object({
  from: z.object({ versionNumber: z.int().positive() }),
  /** The newest published version. */
  to: z.object({ versionId: uuidSchema, versionNumber: z.int().positive() }),
  /** Answered questions of the pinned version the new one keeps. */
  carried: z.int().nonnegative(),
  /** Questions of the pinned version the new one drops: their answers stay, hidden. */
  hiddenQuestions: z.array(
    z.object({
      questionKey: z.string(),
      title: z.string(),
      hasAnswer: z.boolean(),
    }),
  ),
  /** Questions only the new version has. */
  addedQuestions: z.int().nonnegative(),
  /** The names of the starting cost rows T2 adds (validations only). */
  addedCostRows: z.array(z.string()),
});
export type TemplateMigrationPreview = z.infer<
  typeof templateMigrationPreviewSchema
>;

/** The body of T2. */
export const templateMigrationCreateSchema = z.object({
  targetType: templateKindSchema,
  targetId: z.string(),
  /** A published version of the same template, newer than the pinned one. */
  toVersionId: uuidSchema,
});
export type TemplateMigrationCreate = z.infer<
  typeof templateMigrationCreateSchema
>;

/** T2 `POST /api/v1/template-migrations`. H3 undoes the operation `batchId`. */
export const templateMigrationResultSchema = z.object({
  batchId: uuidSchema,
  template: templateRefSchema,
});
export type TemplateMigrationResult = z.infer<
  typeof templateMigrationResultSchema
>;

// ---- AD1–AD6, AD10 ----

export const templateVersionStatusSchema = z.enum(["draft", "published"]);
export type TemplateVersionStatus = z.infer<typeof templateVersionStatusSchema>;

/** AD1 `GET /api/v1/admin/templates`: the three kinds, always (26). */
export const adminTemplateListSchema = z.object({
  items: z.array(
    z.object({
      kind: templateKindSchema,
      /** Null before a file of the kind was imported. */
      name: z.string().nullable(),
      /** Newest first. */
      versions: z.array(
        z.object({
          id: uuidSchema,
          versionNumber: z.int().positive(),
          status: templateVersionStatusSchema,
          publishedAt: dateTimeSchema.nullable(),
          publishedBy: userRefSchema.nullable(),
          /** Self-analyses, validations or plans pinned to it. */
          usageCount: z.int().nonnegative(),
        }),
      ),
    }),
  ),
});
export type AdminTemplateList = z.infer<typeof adminTemplateListSchema>;

/** The `{versionId}` of AD2, AD3, AD5, AD6 and AD4's new section. */
export const templateVersionParamsSchema = z.object({ versionId: z.string() });

/** The `{id}` of AD4's sections and questions. */
export const templateNodeParamsSchema = z.object({ id: z.string() });

/** AD2: the draft made. */
export const templateDraftSchema = z.object({ id: uuidSchema });

const presetTypeSchema = z.enum(["milestone", "launch", "kpi"]);

/** AD3 GET, and the answer of AD3 PATCH, AD4 and AD5: a version as 27 edits it. */
export const templateVersionDetailSchema = z.object({
  id: uuidSchema,
  kind: templateKindSchema,
  versionNumber: z.int().positive(),
  status: templateVersionStatusSchema,
  aiPrompt: z.string(),
  sections: z.array(
    templateSectionSchema.omit({ questions: true }).extend({
      id: uuidSchema,
      sortOrder: z.int(),
      questions: z.array(
        templateQuestionSchema.extend({
          id: uuidSchema,
          sortOrder: z.int(),
          /** Plans: what the draft copies (SDD 6.3 `copy_from`). */
          copyFrom: z.array(z.string()).nullable(),
          /** Plans: what the sub-item shows beside it (SDD 6.3 `reference`). */
          reference: z.array(planReferenceSpecSchema).nullable(),
        }),
      ),
    }),
  ),
  costDefaults: z.array(
    z.object({
      id: uuidSchema,
      category: costCategorySchema,
      key: z.string(),
      name: z.string(),
      sortOrder: z.int(),
    }),
  ),
  checkRules: z.array(
    z.object({
      checkKey: checkKeySchema,
      params: z.record(z.string(), z.number()),
    }),
  ),
  executionPresets: z.array(
    z.object({
      id: uuidSchema,
      type: presetTypeSchema,
      title: z.string(),
      area: z.string().nullable(),
      launchTiming: launchTimingSchema.nullable(),
      sortOrder: z.int(),
    }),
  ),
});
export type TemplateVersionDetail = z.infer<typeof templateVersionDetailSchema>;

/**
 * The body of AD3 PATCH. Only a self-analysis template has an AI prompt: the API refuses
 * any other text for the other kinds (2026-10-02 user decision).
 */
export const templateVersionUpdateSchema = z.object({
  aiPrompt: plainText(longText),
});

const sectionFields = {
  key: requiredText(shortText),
  title: requiredText(shortText),
  /** The self-analysis's short rewording beside the heading (11). */
  subtitle: optionalText(shortText).optional(),
  /** A plan item's one-line description. */
  guidance: guidanceSchema.optional(),
  /** Plans: part A or B (AD6 checks). */
  part: z.enum(["a", "b"]).nullable().optional(),
};

/** The body of AD4 POST `.../sections`. Left-out texts are empty. */
export const templateSectionCreateSchema = z.object(sectionFields);
export type TemplateSectionCreate = z.infer<typeof templateSectionCreateSchema>;

/** The body of AD4 PATCH `/api/v1/admin/template-sections/{id}`: the fields to change. */
export const templateSectionUpdateSchema = z.object({
  ...sectionFields,
  key: sectionFields.key.optional(),
  title: sectionFields.title.optional(),
});
export type TemplateSectionUpdate = z.infer<typeof templateSectionUpdateSchema>;

/**
 * The fields of a question 27 sends. What depends on the template's kind is the API's to
 * check once it knows the version: the question ID's form (422 INVALID_QUESTION_KEY),
 * the IDs a display condition names, F/A/U (validations only), and what a draft copies
 * and shows (plans only).
 */
const questionFields = {
  /** The question ID of design-spec 6.6. */
  key: z.string(),
  title: requiredText(shortText),
  prompt: requiredText(longText),
  example: optionalText(longText).optional(),
  hint: guidanceSchema.optional(),
  answerType: answerTypeSchema,
  options: templateFileOptionsSchema.nullable().optional(),
  /** Example: `{ "V.02.OCEAN": ["Red", "Mixed"] }`. */
  displayCondition: z
    .record(z.string(), z.array(requiredText(shortText)))
    .nullable()
    .optional(),
  hasFau: z.boolean().optional(),
  copyFrom: z.array(planCopySourceSchema).nullable().optional(),
  /** 27 never sends it: a file import (AD10) changes it (design-spec 6.17). */
  reference: z.array(planReferenceSpecSchema).nullable().optional(),
};

/** The body of AD4 POST `.../questions`. Left out, a field is empty (F/A/U off). */
export const templateQuestionCreateSchema = z.object(questionFields);
export type TemplateQuestionCreate = z.infer<
  typeof templateQuestionCreateSchema
>;

/** The body of AD4 PATCH `/api/v1/admin/template-questions/{id}`: the fields to change. */
export const templateQuestionUpdateSchema = z.object({
  ...questionFields,
  key: questionFields.key.optional(),
  title: questionFields.title.optional(),
  prompt: questionFields.prompt.optional(),
  answerType: questionFields.answerType.optional(),
});
export type TemplateQuestionUpdate = z.infer<
  typeof templateQuestionUpdateSchema
>;

/** The body of AD5 PUT `.../order`: every section, each with every question it holds. */
export const templateOrderSchema = z.object({
  sections: z.array(
    z.object({ id: uuidSchema, questionIds: z.array(uuidSchema) }),
  ),
});
export type TemplateOrder = z.infer<typeof templateOrderSchema>;

/** The body of AD5 PUT `.../cost-defaults` (validations only). */
export const templateCostDefaultsSchema = z
  .object({ items: z.array(templateCostDefaultSchema) })
  .superRefine((body, ctx) =>
    flagRepeats(
      ctx,
      body.items.map((row, i) => ({
        value: row.key,
        path: ["items", i, "key"],
      })),
      "cost row key",
    ),
  );

/** The body of AD5 PUT `.../check-rules` (validations only). */
export const templateCheckRulesSchema = z
  .object({ items: z.array(checkRuleSchema) })
  .superRefine((body, ctx) =>
    flagRepeats(
      ctx,
      body.items.map((rule, i) => ({
        value: rule.checkKey,
        path: ["items", i, "checkKey"],
      })),
      "check",
    ),
  );

const presetTitle = requiredText(shortText);

/** The body of AD5 PUT `.../execution-presets` (plans only, design-spec 6.13). */
export const templateExecutionPresetsSchema = z.object({
  items: z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("milestone"),
        title: presetTitle,
        area: z.null().optional(),
        launchTiming: z.null().optional(),
      }),
      z.object({
        type: z.literal("launch"),
        title: presetTitle,
        area: z.null().optional(),
        // 22 groups launch rows by their timing, so a launch row always has one.
        launchTiming: launchTimingSchema,
      }),
      z.object({
        type: z.literal("kpi"),
        title: presetTitle,
        area: optionalText(shortText).optional(),
        launchTiming: z.null().optional(),
      }),
    ]),
  ),
});
export type TemplateExecutionPresets = z.infer<
  typeof templateExecutionPresetsSchema
>;

/** AD6 validate: what blocks publishing, and what only warns. */
export const templateCheckSchema = z.object({
  errors: z.array(
    z.object({
      code: z.enum([
        "no_questions",
        "invalid_part",
        "invalid_question_key",
        "question_key_section_mismatch",
        "duplicate_question_key",
        "answer_type_mismatch",
        "options_mismatch",
        "unknown_condition_key",
        "copy_from_mismatch",
      ]),
      message: z.string(),
      /** The section or question 27 moves to; null for the version as a whole. */
      nodeId: uuidSchema.nullable(),
    }),
  ),
  warnings: z.array(
    z.object({ code: z.literal("removed_keys"), keys: z.array(z.string()) }),
  ),
});
export type TemplateCheckResult = z.infer<typeof templateCheckSchema>;

/** AD6 publish. */
export const templatePublishResultSchema = z.object({
  versionNumber: z.int().positive(),
  publishedAt: dateTimeSchema,
});

/** The query of AD10: the template chosen on 26. */
export const templateImportQuerySchema = z.object({
  kind: templateKindSchema,
});

/** AD10: the draft made from the file. */
export const templateImportResultSchema = z.object({
  versionId: uuidSchema,
  kind: templateKindSchema,
  versionNumber: z.int().positive(),
});
