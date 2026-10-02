import { z } from "zod";
import { decisionValueSchema } from "./enums";

/** V19 request body (SDD 5.7). The reason is trimmed before the length check. */
export const recordDecisionBodySchema = z.object({
  value: decisionValueSchema,
  reason: z.string().trim().min(1).max(5000),
  basedOnDecisionId: z.uuid().nullable(),
  confirmNewer: z.boolean().optional(),
});

export type RecordDecisionBody = z.infer<typeof recordDecisionBodySchema>;
