import { z } from "zod";
import {
  dateTimeSchema,
  lockClaimShape,
  templateRefSchema,
  templateSectionSchema,
  userRefSchema,
  uuidSchema,
  versionedSchema,
} from "./common";
import { namedRefSchema } from "./decisions";
import { dashboardSelfAnalysesSchema, selfAnalysisStatusSchema } from "./ideas";
import {
  currencySchema,
  longTextSchema,
  moneySchema,
  ruleIssue,
} from "./input-rules";

// The self-analysis types of SDD 5.8 that S1–S7 carry.

/** S1, and what S1 PATCH, S4 and S5 answer with. */
export const selfAnalysisHomeSchema = z.object({
  id: uuidSchema,
  status: selfAnalysisStatusSchema,
  completedAt: dateTimeSchema.nullable(),
  currency: z.string(),
  template: templateRefSchema,
  answered: z.int().nonnegative(),
  total: z.int().nonnegative(),
  sections: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      answered: z.int().nonnegative(),
      total: z.int().nonnegative(),
    }),
  ),
  /** The first question in template order not answered yet; null when all are. */
  firstUnanswered: z
    .object({ sectionKey: z.string(), questionKey: z.string() })
    .nullable(),
  /** In the order they were shared. */
  shares: z.array(
    z.object({ workspace: namedRefSchema, sharedAt: dateTimeSchema }),
  ),
  /**
   * The workspaces the owner is an Owner or Member of, personal ones left out (theirs
   * and others'), in the order they joined: what M6 offers.
   */
  shareableWorkspaces: z.array(namedRefSchema),
});
export type SelfAnalysisHome = z.infer<typeof selfAnalysisHomeSchema>;

export const selfAnalysisAnswerSchema = versionedSchema.extend({
  questionKey: z.string(),
  text: z.string().nullable(),
  /** Amount-with-reason questions only, in the self-analysis currency. */
  amount: z.number().nullable(),
  /**
   * The comments on the answer in each workspace it is shared with now, replies included
   * and deleted ones left out, one entry per share in the order of `shares`. Comments in
   * a workspace it is no longer shared with stay hidden (design-spec 6.0.4).
   */
  commentCounts: z.array(
    z.object({
      workspaceId: uuidSchema,
      workspaceName: z.string(),
      count: z.int().nonnegative(),
    }),
  ),
});
export type SelfAnalysisAnswer = z.infer<typeof selfAnalysisAnswerSchema>;

/** The body of S1 PATCH `/api/v1/me/self-analysis`. */
export const selfAnalysisUpdateSchema = z.object({ currency: currencySchema });

/** The path of S2. */
export const selfAnalysisSectionParamsSchema = z.object({
  sectionKey: z.string(),
});

/** S2: one answer per question of the section, unanswered ones included. */
export const selfAnalysisSectionSchema = z.object({
  section: templateSectionSchema,
  answers: z.array(selfAnalysisAnswerSchema),
});

/** The path of S3. */
export const selfAnalysisAnswerParamsSchema = z.object({
  questionKey: z.string(),
});

/** The body of S3 `PUT /api/v1/me/self-analysis/answers/{questionKey}`. */
export const selfAnalysisAnswerSaveSchema = z.object({
  /**
   * The answer, or the reason of an amount-with-reason question. Checked against the
   * question's type afterwards. Blank is saved as null.
   */
  text: longTextSchema.optional(),
  /** Amount-with-reason questions only. */
  amount: moneySchema.nullable().optional(),
  ...lockClaimShape,
});
export type SelfAnalysisAnswerSave = z.infer<
  typeof selfAnalysisAnswerSaveSchema
>;

/**
 * The body of S4 complete. A request without a body, which the API reads as `null`
 * (`parseJsonBody`), asks the same as `{}`.
 */
export const selfAnalysisCompleteSchema = z
  .object({ confirmEmpty: z.boolean().optional() })
  .nullable();

/** The body of S5 `PUT /api/v1/me/self-analysis/shares`: every workspace to share with. */
export const selfAnalysisSharesUpdateSchema = z.object({
  /** Lowercased, as the database answers UUIDs, so one id in two cases is a repeat. */
  workspaceIds: z
    .array(uuidSchema.transform((id) => id.toLowerCase()))
    .superRefine((ids, ctx) => {
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          input: ids,
          message: "Repeats a workspace",
          ...ruleIssue("unique"),
        });
    }),
});

/** S6: the workspace's Owners and Members, as D2 lists them. */
export const memberSelfAnalysesSchema = dashboardSelfAnalysesSchema;

/** The path of S7. */
export const memberSelfAnalysisParamsSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
});

/** S7: a member's self-analysis as shared with the workspace, read only. */
export const sharedSelfAnalysisSchema = z.object({
  /** The self-analysis: the `targetId` of comments on its answers (C1). */
  id: uuidSchema,
  user: userRefSchema,
  status: selfAnalysisStatusSchema,
  currency: z.string(),
  sections: z.array(
    templateSectionSchema.extend({
      answers: z.array(
        z.object({
          questionKey: z.string(),
          text: z.string().nullable(),
          amount: z.number().nullable(),
          /** The comments on the answer in this workspace, replies included. */
          commentCount: z.int().nonnegative(),
        }),
      ),
    }),
  ),
});
export type SharedSelfAnalysis = z.infer<typeof sharedSelfAnalysisSchema>;
