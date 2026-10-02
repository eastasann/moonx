import { z } from "zod";
import { uuidSchema } from "./common";
import { MAX_LONG_TEXT } from "./validation";

/** Currency codes are three uppercase letters (ISO 4217). */
const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

/** S1 PATCH. */
export const updateSelfAnalysisBodySchema = z.object({ currency: currencyCodeSchema }).strict();

/** S3. `amount` is for the amount-and-reason questions only; the handler checks that. */
export const putSelfAnalysisAnswerBodySchema = z.object({
  text: z.string().max(MAX_LONG_TEXT).nullish(),
  amount: z.number().min(0).max(1e12).nullish(),
  lockVersion: z.number().int().min(0),
  force: z.boolean().optional(),
});

/** S4 complete. */
export const completeSelfAnalysisBodySchema = z.object({ confirmEmpty: z.boolean().optional() });

/** S5. */
export const putSelfAnalysisSharesBodySchema = z.object({
  workspaceIds: z.array(uuidSchema).max(200),
});

export type PutSelfAnalysisAnswerBody = z.infer<typeof putSelfAnalysisAnswerBodySchema>;
