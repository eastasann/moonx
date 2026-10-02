import { z } from "zod";
import {
  dateTimeSchema,
  pageQuerySchema,
  targetRefSchema,
  userRefSchema,
  uuidSchema,
} from "./common";
import { historySourceSchema, targetTypeSchema, templateKindSchema } from "./enums";

const containerTypeSchema = z.enum(["self_analysis", "validation", "business_plan", "idea"]);

/**
 * H1 query (SDD 5.11): the history of one item (`targetType` + `targetId` + `targetKey`) or of a
 * whole screen (`containerType` + `containerId` + `sectionKey`). Exactly one of the two forms.
 */
export const historyQuerySchema = pageQuerySchema
  .extend({
    targetType: targetTypeSchema.optional(),
    targetId: uuidSchema.optional(),
    targetKey: z.string().max(100).optional(),
    containerType: containerTypeSchema.optional(),
    containerId: uuidSchema.optional(),
    sectionKey: z.string().max(40).optional(),
  })
  .superRefine((q, ctx) => {
    const item = q.targetType != null || q.targetId != null || q.targetKey != null;
    const screen = q.containerType != null || q.containerId != null || q.sectionKey != null;
    if (item === screen) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: "Give either targetType and targetId, or containerType and containerId",
      });
      return;
    }
    if (item && (q.targetType == null || q.targetId == null)) {
      ctx.addIssue({
        code: "custom",
        path: ["targetId"],
        message: "targetType and targetId go together",
      });
    }
    if (screen && (q.containerType == null || q.containerId == null)) {
      ctx.addIssue({
        code: "custom",
        path: ["containerId"],
        message: "containerType and containerId go together",
      });
    }
  });

/** H2 and H3 path parameters. */
export const historyEntryParamsSchema = z.object({ entryId: uuidSchema });
export const historyBatchParamsSchema = z.object({ batchId: uuidSchema });

/** SDD 5.11 HistoryEntry. */
export const historyEntrySchema = z.object({
  id: uuidSchema,
  batchId: uuidSchema.nullable(),
  target: targetRefSchema,
  label: z.string(),
  action: z.enum(["create", "update", "delete", "restore"]),
  source: historySourceSchema,
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  changedBy: userRefSchema,
  changedAt: dateTimeSchema,
  revertible: z.boolean(),
});

/** T1 query (SDD 5.12). `targetId` is the id of the self analysis, validation or plan. */
export const templateMigrationQuerySchema = z.object({
  targetType: templateKindSchema,
  targetId: uuidSchema,
});

/** T2 body. */
export const templateMigrationBodySchema = z.object({
  targetType: templateKindSchema,
  targetId: uuidSchema,
  toVersionId: uuidSchema,
});

export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type TemplateMigrationQuery = z.infer<typeof templateMigrationQuerySchema>;
export type TemplateMigrationBody = z.infer<typeof templateMigrationBodySchema>;

/** T1 response (SDD 5.12). */
export interface TemplateMigrationPreview {
  from: { versionNumber: number };
  to: { versionId: string; versionNumber: number };
  carried: number;
  hiddenQuestions: { questionKey: string; title: string; hasAnswer: boolean }[];
  addedQuestions: number;
  addedCostRows: string[];
}
