import {
  createPlanBodySchema,
  goNoGoBodySchema,
  goNoGoValueSchema,
  savePlanVersionBodySchema,
  updatePlanBodySchema,
} from "@moonx/schemas";
import { z } from "zod";

/** M5 and the rename sheet: P1 POST and P2 PATCH take the same name (trimmed, 1 to 80). */
export const planNameFormSchema = createPlanBodySchema;

/** M3: P6 POST's name (trimmed, 1 to 80). */
export const saveVersionFormSchema = savePlanVersionBodySchema;

/** The two header fields edited in place; P2 PATCH limits them to 1 to 200 characters. */
export const planHeaderFormSchema = z.object({
  businessName: z.string().pipe(updatePlanBodySchema.shape.businessName.unwrap()),
  preparedBy: z.string().pipe(updatePlanBodySchema.shape.preparedBy.unwrap()),
});

/**
 * M4: the value is chosen from three radios, so an unchosen one is "" and reads as required. The
 * reason follows P8's limits (trimmed, 1 to 5000 characters).
 */
export const goNoGoFormSchema = z.object({
  value: z.string().min(1).pipe(goNoGoValueSchema),
  reason: goNoGoBodySchema.shape.reason,
});
