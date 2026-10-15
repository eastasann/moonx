import { z } from "zod";
import {
  answerTypeSchema,
  classificationInputSchema,
  classificationSchema,
  confidenceSchema,
  dateOnlySchema,
  fauSchema,
  queryBooleanSchema,
  queryIntSchema,
  questionOptionsSchema,
  templateKindSchema,
  uuidSchema,
  versionedSchema,
} from "./common";
import { longTextSchema, moneySchema } from "./input-rules";
import { planPartSchema } from "./plans";

// The AI round trip of SDD 5.10 (X1–X3) and the formats of design-spec 6.6・6.7.

/** `format` of what X1 writes (design-spec 6.6). */
export const AI_EXPORT_FORMAT = "moonx-export";
/** `format` of the JSON reply an AI writes back, which 25 reads (design-spec 6.6). */
export const AI_REPLY_FORMAT = "moonx-reply";
/** `version` of both formats. */
export const AI_FORMAT_VERSION = 1;

/**
 * A comma-separated list in a query string ("01,02"); empty is the empty list. Elysia
 * hands over a parameter it reads as an array (repeated, or split at its commas) as
 * an array, which reads the same.
 */
const queryListSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : [value]).flatMap((part) =>
      part === "" ? [] : part.split(","),
    ),
  );

/**
 * The query of X1. Without `sections`, `items` or `part` the scope is the whole
 * self-analysis, every question section of the validation or the whole plan; a list
 * left empty (`sections=`) is a scope with nothing in it (422 EMPTY_SCOPE).
 */
export const aiExportQuerySchema = z
  .object({
    source: templateKindSchema,
    /** The validation or plan. A self-analysis is the caller's own and takes none. */
    id: z.string().optional(),
    /** Self-analysis and validation section keys. */
    sections: queryListSchema.optional(),
    /** Plan item numbers. One the template lacks is refused by X1 itself (`items`). */
    items: queryListSchema.pipe(z.array(queryIntSchema)).optional(),
    part: planPartSchema.optional(),
    includeEmpty: queryBooleanSchema.default(true),
    includeExamples: queryBooleanSchema.default(true),
    includeReference: queryBooleanSchema.default(true),
  })
  .superRefine((query, ctx) => {
    if (query.source !== "self_analysis" && query.id === undefined) {
      ctx.addIssue({
        code: "invalid_type",
        expected: "string",
        input: undefined,
        path: ["id"],
        message: "Required for a validation or plan",
      });
    }
    const plan = query.source === "business_plan";
    const extra = [
      query.source === "self_analysis" && query.id !== undefined ? "id" : null,
      plan && query.sections !== undefined ? "sections" : null,
      !plan && query.items !== undefined ? "items" : null,
      !plan && query.part !== undefined ? "part" : null,
      plan && query.items !== undefined && query.part !== undefined
        ? "part"
        : null,
    ].filter((key) => key !== null);
    if (extra.length > 0) {
      ctx.addIssue({
        code: "unrecognized_keys",
        keys: extra,
        input: query,
        message: `Not taken by ${query.source} with these: ${extra.join(", ")}`,
      });
    }
  });
export type AiExportQuery = z.infer<typeof aiExportQuerySchema>;

/** One piece of evidence of a validation answer, deleted research logs left out. */
export const aiEvidenceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("research_log"),
    date: dateOnlySchema.nullable(),
    topic: z.string(),
  }),
  z.object({
    type: z.literal("url"),
    url: z.string(),
    note: z.string().nullable(),
  }),
]);
export type AiEvidence = z.infer<typeof aiEvidenceSchema>;

/**
 * The answer of an exported question. Amount-with-reason questions have `amount` and
 * `reason`, the others `text`; validation answers add `fau`, `confidence` and
 * `evidence` (design-spec 6.6).
 */
export const aiExportAnswerSchema = z.object({
  text: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
  fau: fauSchema.nullable().optional(),
  confidence: confidenceSchema.nullable().optional(),
  evidence: z.array(aiEvidenceSchema).optional(),
});
export type AiExportAnswer = z.infer<typeof aiExportAnswerSchema>;

/** One question of the export, with its answer (design-spec 6.6). */
export const aiExportQuestionSchema = z.object({
  /** The question ID of design-spec 6.6. */
  id: z.string(),
  section: z.string(),
  title: z.string(),
  question: z.string(),
  /** Null when the template has none or the export leaves examples out. */
  example: z.string().nullable(),
  hint: z.string().nullable(),
  answerType: answerTypeSchema,
  /** Choice questions only. */
  choices: z.array(z.string()).optional(),
  answer: aiExportAnswerSchema,
});
export type AiExportQuestion = z.infer<typeof aiExportQuestionSchema>;

/**
 * What the export covers. A null list is the whole self-analysis or every question
 * section of the validation; a plan's `items` and `part` are both null for the whole
 * plan.
 */
export const aiExportScopeSchema = z.union([
  z.object({
    ideaName: z.string(),
    sections: z.array(z.string()).nullable(),
  }),
  z.object({
    planName: z.string(),
    items: z.array(z.int()).nullable(),
    part: planPartSchema.nullable(),
  }),
  z.object({ sections: z.array(z.string()).nullable() }),
]);
export type AiExportScope = z.infer<typeof aiExportScopeSchema>;

/** A key number as 13 shows it, its bound and the reason it has none included. */
const shownValueSchema = z.object({ label: z.string(), value: z.string() });

/**
 * The read-only Reference (design-spec 6.6): values as the screens show them. A
 * validation has every part but `tables`, a plan `keyNumbers` and `tables`.
 */
export const aiReferenceSchema = z.object({
  /** By key metric key (design-spec 6.4). */
  keyNumbers: z.record(z.string(), shownValueSchema),
  checks: z.array(z.object({ name: z.string(), state: z.string() })).optional(),
  competitors: z
    .array(
      z.object({
        name: z.string(),
        type: z.string().nullable(),
        typicalPrice: z.string().nullable(),
        strength: z.string().nullable(),
        weakness: z.string().nullable(),
      }),
    )
    .optional(),
  researchLog: z
    .array(
      z.object({
        date: dateOnlySchema.nullable(),
        topic: z.string(),
        sourceType: z.string().nullable(),
        supports: z.array(z.string()),
      }),
    )
    .optional(),
  assumptions: z
    .array(
      z.object({ assumption: z.string(), confidence: z.string().nullable() }),
    )
    .optional(),
  risks: z
    .array(
      z.object({
        risk: z.string(),
        probability: z.string().nullable(),
        impact: z.string().nullable(),
      }),
    )
    .optional(),
  /** The plan's table sub-items in the scope, cells as 21 shows them. */
  tables: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        columns: z.array(z.string()),
        rows: z.array(z.array(z.string().nullable())),
      }),
    )
    .optional(),
});
export type AiReference = z.infer<typeof aiReferenceSchema>;

/** One answer of a reply (design-spec 6.6). Amount questions take `amount` and `reason`. */
export const aiReplyAnswerSchema = z.object({
  id: z.string(),
  text: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
});

/** The reply an AI writes back in JSON, which 25 reads (design-spec 6.6). */
export const aiReplySchema = z.object({
  format: z.literal(AI_REPLY_FORMAT),
  version: z.literal(AI_FORMAT_VERSION),
  answers: z.array(aiReplyAnswerSchema),
});
export type AiReply = z.infer<typeof aiReplySchema>;

/** `json` of X1: the `moonx-export` of design-spec 6.6. */
export const aiExportJsonSchema = z.object({
  format: z.literal(AI_EXPORT_FORMAT),
  version: z.literal(AI_FORMAT_VERSION),
  /** Local time in the caller's time zone with its offset. */
  exportedAt: z.string(),
  kind: templateKindSchema,
  scope: aiExportScopeSchema,
  templateVersion: z.int().positive(),
  currency: z.string(),
  /** The self-analysis template's prompt; left out when blank. */
  prompt: z.string().optional(),
  questions: z.array(aiExportQuestionSchema),
  /** Left out unless the export includes the Reference. */
  reference: aiReferenceSchema.optional(),
  reply: z.object({ instructions: z.string(), example: aiReplySchema }),
});
export type AiExportJson = z.infer<typeof aiExportJsonSchema>;

/** X1's answer. */
export const aiExportSchema = z.object({
  markdown: z.string(),
  json: aiExportJsonSchema,
  /** `moonx-export-{kind}-{name}-{date}`, without the extension. */
  fileBaseName: z.string(),
  questionCount: z.int().nonnegative(),
  /** Every question in the scope is unanswered: 24 warns "All questions are empty". */
  allEmpty: z.boolean(),
});
export type AiExport = z.infer<typeof aiExportSchema>;

/** The query of X2. */
export const importContextQuerySchema = z
  .object({ target: templateKindSchema, id: z.string().optional() })
  .superRefine((query, ctx) => {
    if (query.target === "self_analysis" && query.id !== undefined) {
      ctx.addIssue({
        code: "unrecognized_keys",
        keys: ["id"],
        input: query,
        message: "A self-analysis is the caller's own and takes no id",
      });
    }
    if (query.target !== "self_analysis" && query.id === undefined) {
      ctx.addIssue({
        code: "invalid_type",
        expected: "string",
        input: undefined,
        path: ["id"],
        message: "Required for a validation or plan",
      });
    }
  });

/** X2: what 24 and 25 need to know of where an import goes (SDD 5.10). */
export const importContextSchema = z.object({
  target: z.object({
    type: templateKindSchema,
    id: uuidSchema,
    /** The idea of a validation, the plan, or the owner of a self-analysis. */
    name: z.string(),
    /** The workspace of a validation or plan; null for a self-analysis. */
    workspaceId: uuidSchema.nullable(),
    /** The idea of a validation or plan, where the import returns to. */
    ideaId: uuidSchema.nullable(),
    /** For showing amounts. */
    currency: z.string().nullable(),
    /** The idea or plan is archived: 24 and 25 offer no export or import. */
    archived: z.boolean(),
  }),
  /** Every section of the template, in order. */
  sections: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      part: planPartSchema.nullable(),
      /** Has a question of a type an import can write. */
      importable: z.boolean(),
    }),
  ),
  questions: z.array(
    z.object({
      questionKey: z.string(),
      title: z.string(),
      sectionKey: z.string(),
      answerType: answerTypeSchema,
      options: questionOptionsSchema.nullable(),
      /** False for tables, numbers and execution items. */
      importable: z.boolean(),
      /**
       * Hidden by 02 OCEAN or by a template migration. A question a migration hid is
       * here only when it has a saved answer of a type an import can write, as the
       * version that had it defines it.
       */
      hidden: z.boolean(),
      current: versionedSchema.extend({
        text: z.string().nullable(),
        amount: z.number().nullable(),
        /** Validation answers only. */
        classification: classificationSchema.nullable(),
      }),
    }),
  ),
});
export type ImportContext = z.infer<typeof importContextSchema>;

/**
 * One answer an import writes. An amount-with-reason question takes `amount` and
 * `text` (its reason), each left out to keep what it holds. Checked against the
 * question afterwards: a short text has a shorter limit, a choice must be one of its
 * choices (in any case).
 */
export const importChangeSchema = z.object({
  questionKey: z.string(),
  text: longTextSchema.optional(),
  amount: moneySchema.nullable().optional(),
  /** Validation answers only: the F/A/U chosen again on 25 ③. */
  classification: classificationInputSchema.optional(),
  /** The version 25 read the answer at; 0 when it was not saved yet. */
  baseLockVersion: z.int().nonnegative(),
});
export type ImportChange = z.infer<typeof importChangeSchema>;

/** The body of X3. */
export const importApplySchema = z
  .object({
    target: z.object({
      type: templateKindSchema,
      /** The validation or plan; none for the caller's self-analysis. */
      id: z.string().optional(),
    }),
    changes: z.array(importChangeSchema).min(1),
  })
  .superRefine((body, ctx) => {
    const { type, id } = body.target;
    if (type === "self_analysis" && id !== undefined) {
      ctx.addIssue({
        code: "unrecognized_keys",
        keys: ["id"],
        input: body.target,
        path: ["target"],
        message: "A self-analysis is the caller's own and takes no id",
      });
    }
    if (type !== "self_analysis" && id === undefined) {
      ctx.addIssue({
        code: "invalid_type",
        expected: "string",
        input: undefined,
        path: ["target", "id"],
        message: "Required for a validation or plan",
      });
    }
  });
export type ImportApply = z.infer<typeof importApplySchema>;

/** X3's answer. */
export const importApplyResultSchema = z.object({
  /** Answers whose content changed; unchanged ones are not counted. */
  applied: z.int().nonnegative(),
  /** Validation answers the import left Unclassified, which need F/A/U. */
  needsClassification: z.int().nonnegative(),
  /** The one operation H3 undoes as a whole. */
  batchId: uuidSchema,
});
export type ImportApplyResult = z.infer<typeof importApplyResultSchema>;
