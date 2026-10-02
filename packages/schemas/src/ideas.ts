import { z } from "zod";
import type { LinkTarget, UserRef } from "./common";
import { decisionValueSchema, type ExecutionType, stageSchema } from "./enums";

const ideaNameSchema = z.string().trim().min(1).max(100);
const oneLineConceptSchema = z.string().trim().min(1).max(200);
const proposedSolutionSchema = z.string().trim().max(20000);

/** I1 POST */
export const createIdeaBodySchema = z.object({
  name: ideaNameSchema,
  oneLineConcept: oneLineConceptSchema,
  proposedSolution: proposedSolutionSchema.optional(),
});

/** I2 PATCH. `proposedSolution: null` clears it. */
export const updateIdeaBodySchema = z.object({
  name: ideaNameSchema.optional(),
  oneLineConcept: oneLineConceptSchema.optional(),
  proposedSolution: proposedSolutionSchema.nullable().optional(),
  lockVersion: z.number().int().min(0),
  force: z.boolean().optional(),
});

/** I3 */
export const duplicateIdeaBodySchema = z.object({ name: ideaNameSchema.optional() });

export const ideaDecisionFilterSchema = z.enum([
  "not_dropped",
  "all",
  "undecided",
  ...decisionValueSchema.options,
]);

/**
 * I1 GET query. Query-string values arrive as text, so the flag and the page size are checked
 * as text here and read by the handler.
 */
export const listIdeasQuerySchema = z.object({
  stage: stageSchema.optional(),
  decision: ideaDecisionFilterSchema.default("not_dropped"),
  proposerId: z.uuid().optional(),
  includeArchived: z.enum(["true", "false"]).optional(),
  sort: z.enum(["updated", "created", "name"]).default("updated"),
  q: z.string().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type IdeaDecisionFilter = z.infer<typeof ideaDecisionFilterSchema>;

/** SDD 5.6 DueItem (D3). */
export interface DueItem {
  id: string;
  type: ExecutionType;
  title: string;
  dueDate: string;
  overdue: boolean;
  assignee: { user: UserRef } | { name: string } | null;
  isMine: boolean;
  idea: { id: string; name: string };
  plan: { id: string; name: string };
}

/**
 * SDD 5.6 Activity (D4). `summary` is the label of what was touched (an answer's "01 WHO", a row's
 * name, an idea's name), the decision or Go / No-Go value, or the saved version's name; the client
 * builds the sentence from `kind`, `actor` and this text.
 */
export interface Activity {
  kind: "change" | "comment" | "decision" | "go_no_go" | "version_saved";
  actor: UserRef;
  at: string;
  summary: string;
  idea: { id: string; name: string } | null;
  plan: { id: string; name: string } | null;
  link: LinkTarget;
}
