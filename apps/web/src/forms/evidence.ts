import { researchLogInputSchema } from "@moonx/schemas";
import { z } from "zod";

/** M2, "Record new": a research log entry written on the spot (design-spec 6.0.3). */
export const newResearchLogSchema = researchLogInputSchema;

/** M2, "URL": a link and a note, with no research log entry. */
export const evidenceUrlSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2000),
  note: z.string().max(2000),
});
