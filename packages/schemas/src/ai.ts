import { z } from "zod";
import { classificationInputSchema, uuidSchema } from "./common";
import { templateKindSchema } from "./enums";
import { MAX_LONG_TEXT } from "./validation";

/**
 * A comma-separated list in a query string. Elysia splits `a,b` into an array before the schema
 * sees it, so both forms are accepted; each entry must match `pattern`.
 */
const csv = (pattern: RegExp) =>
  z
    .union([z.string(), z.array(z.string())])
    .refine(
      (v) => (typeof v === "string" ? v.split(",") : v).every((s) => pattern.test(s.trim())),
      "Invalid list",
    )
    .optional();

const flag = z.enum(["true", "false"]).optional();

/** The entries of a {@link csv} query value. */
export const splitCsv = (value: string | string[] | undefined): string[] | undefined => {
  if (value === undefined) return undefined;
  const parts = typeof value === "string" ? value.split(",") : value.flatMap((v) => v.split(","));
  return parts.map((s) => s.trim()).filter(Boolean);
};

/** X1 query (SDD 5.10). */
export const aiExportQuerySchema = z.object({
  source: templateKindSchema,
  id: uuidSchema.optional(),
  sections: csv(/^[A-Z0-9_]{1,20}$/),
  items: csv(/^\d{1,2}$/),
  part: z.enum(["a", "b"]).optional(),
  includeEmpty: flag,
  includeExamples: flag,
  includeReference: flag,
});

/** X2 query. */
export const aiImportContextQuerySchema = z.object({
  target: templateKindSchema,
  id: uuidSchema.optional(),
});

/** One change of X3 (SDD 5.10 ImportChange). */
export const importChangeSchema = z.object({
  questionKey: z.string().min(1).max(100),
  text: z.string().max(MAX_LONG_TEXT).nullish(),
  amount: z.number().min(0).max(1e12).nullish(),
  classification: classificationInputSchema.optional(),
  baseLockVersion: z.number().int().min(0),
});

/** X3 body. The changes are applied together or not at all. */
export const aiImportApplyBodySchema = z.object({
  target: z.object({ type: templateKindSchema, id: uuidSchema.optional() }),
  changes: z.array(importChangeSchema).min(1).max(200),
});

export type AiExportQuery = z.infer<typeof aiExportQuerySchema>;
export type ImportChange = z.infer<typeof importChangeSchema>;
export type AiImportApplyBody = z.infer<typeof aiImportApplyBodySchema>;
