import { z } from "zod";
import { dateOnlySchema, uuidSchema } from "./common";
import {
  executionStatusSchema,
  executionTypeSchema,
  goNoGoValueSchema,
  launchTimingSchema,
} from "./enums";
import { MAX_LONG_TEXT } from "./validation";

const lockFields = { lockVersion: z.number().int().min(0), force: z.boolean().optional() };

const MAX_PLAN_NAME = 80;
export const MAX_HEADER_FIELD = 200;
export const MAX_EXECUTION_TITLE = 200;

const planNameSchema = z.string().trim().min(1).max(MAX_PLAN_NAME);

/** P1 POST. */
export const createPlanBodySchema = z.object({ name: planNameSchema });

/** P2 GET / P4 / P12 / P13 `?versionId=`. */
export const planVersionQuerySchema = z.object({ versionId: uuidSchema.optional() });

/** P1 GET. */
export const listPlansQuerySchema = z.object({
  includeArchived: z.enum(["true", "false"]).optional(),
});

/** P2 PATCH. */
export const updatePlanBodySchema = z
  .object({
    name: planNameSchema.optional(),
    businessName: z.string().trim().min(1).max(MAX_HEADER_FIELD).optional(),
    preparedBy: z.string().trim().min(1).max(MAX_HEADER_FIELD).optional(),
    ...lockFields,
  })
  .strict();

const rowSchema = z.record(
  z.string().max(100),
  z.union([z.string().max(MAX_LONG_TEXT), z.number(), z.null()]),
);

/** P5. `rows` is checked against the question's table columns in the handler. */
export const putPlanAnswerBodySchema = z.object({
  text: z.string().max(MAX_LONG_TEXT).nullish(),
  rows: z.array(rowSchema).max(200).nullish(),
  ...lockFields,
});

/** P6 POST. */
export const savePlanVersionBodySchema = z.object({ name: z.string().trim().min(1).max(80) });

/** P8. */
export const goNoGoBodySchema = z.object({
  value: goNoGoValueSchema,
  reason: z.string().trim().min(1).max(5000),
});

const optionalText = z.string().max(MAX_LONG_TEXT).nullish();

const executionFields = {
  title: z.string().trim().min(1).max(MAX_EXECUTION_TITLE).optional(),
  assigneeUserId: uuidSchema.nullish(),
  assigneeName: z.string().trim().min(1).max(MAX_HEADER_FIELD).nullish(),
  dueDate: dateOnlySchema.nullish(),
  status: executionStatusSchema.nullish(),
  goal: optionalText,
  exitCondition: optionalText,
  launchTiming: launchTimingSchema.optional(),
  actions: optionalText,
  completionCriteria: optionalText,
  kpiArea: z.string().max(MAX_HEADER_FIELD).nullish(),
  kpiTarget: optionalText,
  kpiReviewFrequency: z.string().max(MAX_HEADER_FIELD).nullish(),
  kpiActual: optionalText,
  whyItMatters: optionalText,
  answer: optionalText,
};

/** P9 POST. */
export const createExecutionItemBodySchema = z.object({
  ...executionFields,
  type: executionTypeSchema,
  title: z.string().trim().min(1).max(MAX_EXECUTION_TITLE),
});

/** P10 PATCH. */
export const updateExecutionItemBodySchema = z.object({ ...executionFields, ...lockFields });

/** P9 GET. */
export const listExecutionItemsQuerySchema = z.object({
  type: executionTypeSchema.optional(),
  assignee: z.union([z.literal("me"), uuidSchema]).optional(),
  status: executionStatusSchema.optional(),
});

/** P11. */
export const orderExecutionItemsBodySchema = z.object({
  type: executionTypeSchema,
  ids: z.array(uuidSchema).max(500),
});

/** P12 / P13. */
export const pitchDeckQuerySchema = z.object({
  variant: z.enum(["one", "five"]),
  versionId: uuidSchema.optional(),
});

export type CreatePlanBody = z.infer<typeof createPlanBodySchema>;
export type UpdatePlanBody = z.infer<typeof updatePlanBodySchema>;
export type PutPlanAnswerBody = z.infer<typeof putPlanAnswerBodySchema>;
export type GoNoGoBody = z.infer<typeof goNoGoBodySchema>;
export type CreateExecutionItemBody = z.infer<typeof createExecutionItemBodySchema>;
export type UpdateExecutionItemBody = z.infer<typeof updateExecutionItemBodySchema>;
