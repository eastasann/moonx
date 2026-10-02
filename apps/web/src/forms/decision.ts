import { decisionValueSchema, recordDecisionBodySchema } from "@moonx/schemas";
import { z } from "zod";

/**
 * Screen 19: the value is chosen from three radios, so an unchosen one is "" and reads as
 * required. The reason follows V19's limits (trimmed, 1 to 5000 characters).
 */
export const decisionFormSchema = z.object({
  value: z.string().min(1).pipe(decisionValueSchema),
  reason: recordDecisionBodySchema.shape.reason,
});
