import { z } from "zod";
import {
  pageQuerySchema,
  pageSchema,
  questionOptionsSchema,
  templateQuestionSchema,
  templateSectionSchema,
  userRefSchema,
  uuidSchema,
} from "./common";
import {
  answerTypeSchema,
  checkKeySchema,
  costCategorySchema,
  launchTimingSchema,
  roleSchema,
  templateKindSchema,
} from "./enums";
import { invitationSchema } from "./workspaces";

// ---- AD1 ----

export const adminTemplateVersionSummarySchema = z.object({
  id: uuidSchema,
  versionNumber: z.number().int(),
  status: z.enum(["draft", "published"]),
  publishedAt: z.iso.datetime().nullable(),
  publishedBy: userRefSchema.nullable(),
  /** Self analyses, validations and plans pinned to this version. */
  usageCount: z.number().int().min(0),
});

export const adminTemplatesSchema = z.object({
  items: z.array(
    z.object({
      kind: templateKindSchema,
      name: z.string(),
      versions: z.array(adminTemplateVersionSummarySchema),
    }),
  ),
});

// ---- AD3 ----

const nodeQuestionSchema = templateQuestionSchema.extend({
  id: uuidSchema,
  sortOrder: z.number().int(),
  copyFrom: z.unknown().nullable(),
  reference: z.unknown().nullable(),
});

export const adminTemplateSectionSchema = templateSectionSchema
  .omit({ questions: true })
  .extend({ id: uuidSchema, sortOrder: z.number().int() });

export const adminTemplateQuestionSchema = nodeQuestionSchema;

export const templateVersionDetailSchema = z.object({
  id: uuidSchema,
  kind: templateKindSchema,
  versionNumber: z.number().int(),
  status: z.enum(["draft", "published"]),
  aiPrompt: z.string(),
  sections: z.array(adminTemplateSectionSchema.extend({ questions: z.array(nodeQuestionSchema) })),
  costDefaults: z.array(
    z.object({
      id: uuidSchema,
      category: costCategorySchema,
      key: z.string(),
      name: z.string(),
      sortOrder: z.number().int(),
    }),
  ),
  checkRules: z.array(
    z.object({ checkKey: checkKeySchema, params: z.record(z.string(), z.number()) }),
  ),
  executionPresets: z.array(
    z.object({
      id: uuidSchema,
      type: z.enum(["milestone", "launch", "kpi"]),
      title: z.string(),
      area: z.string().nullable(),
      launchTiming: launchTimingSchema.nullable(),
      sortOrder: z.number().int(),
    }),
  ),
});

export type TemplateVersionDetail = z.infer<typeof templateVersionDetailSchema>;

/** The longest AI prompt (SDD 7.2: long text). */
export const AI_PROMPT_MAX = 20_000;
export const updateTemplateVersionBodySchema = z.object({
  aiPrompt: z.string().max(AI_PROMPT_MAX),
});

// ---- AD4 ----

const text = (max: number) => z.string().trim().min(1).max(max);
const longText = z.string().max(20_000);
const copyFromSchema = z.array(z.string().min(1).max(100)).max(50);
const referenceSchema = z.array(z.object({ kind: z.string() }).loose()).max(50);
const displayConditionSchema = z.record(z.string(), z.array(z.string()));

export const createSectionBodySchema = z.object({
  key: z.string().regex(/^[A-Z0-9_]{1,40}$/, "Capital letters, digits and _ only"),
  title: text(200),
  guidance: longText.nullish(),
  part: z.enum(["a", "b"]).nullish(),
});
export const updateSectionBodySchema = createSectionBodySchema.partial();

/** The question ID form is checked by the handler (422 INVALID_QUESTION_KEY), not here. */
export const createQuestionBodySchema = z.object({
  key: z.string().min(1).max(100),
  title: text(200),
  prompt: longText.min(1),
  example: longText.nullish(),
  hint: longText.nullish(),
  answerType: answerTypeSchema,
  options: questionOptionsSchema.nullish(),
  displayCondition: displayConditionSchema.nullish(),
  hasFau: z.boolean().optional(),
  copyFrom: copyFromSchema.nullish(),
  reference: referenceSchema.nullish(),
});
export const updateQuestionBodySchema = createQuestionBodySchema.partial();

// ---- AD5 ----

export const templateOrderBodySchema = z.object({
  sections: z.array(z.object({ id: uuidSchema, questionIds: z.array(uuidSchema) })),
});

export const costDefaultsBodySchema = z.object({
  items: z
    .array(
      z.object({
        category: costCategorySchema,
        key: z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/, "Lower-case dotted key"),
        name: text(200),
      }),
    )
    .max(200),
});

export const checkRulesBodySchema = z.object({
  items: z
    .array(z.object({ checkKey: checkKeySchema, params: z.record(z.string(), z.number()) }))
    .max(20),
});

export const executionPresetsBodySchema = z.object({
  items: z
    .array(
      z.object({
        type: z.enum(["milestone", "launch", "kpi"]),
        title: text(200),
        area: text(100).nullish(),
        launchTiming: launchTimingSchema.nullish(),
      }),
    )
    .max(200),
});

// ---- AD6 ----

export const templateValidationSchema = z.object({
  errors: z.array(
    z.object({ code: z.string(), message: z.string(), nodeId: uuidSchema.nullable() }),
  ),
  warnings: z.array(z.object({ code: z.literal("removed_keys"), keys: z.array(z.string()) })),
});
export type TemplateValidation = z.infer<typeof templateValidationSchema>;

export const publishTemplateResultSchema = z.object({
  versionNumber: z.number().int(),
  publishedAt: z.iso.datetime(),
});

export const createdDraftSchema = z.object({ id: uuidSchema });

// ---- AD7 ----

export const adminUserSchema = z.object({
  id: uuidSchema,
  displayName: z.string(),
  email: z.string(),
  createdAt: z.iso.datetime(),
  lastActiveAt: z.iso.datetime().nullable(),
  workspaceCount: z.number().int().min(0),
  status: z.enum(["active", "suspended", "deleted"]),
  isAdmin: z.boolean(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminWorkspaceSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  isPersonal: z.boolean(),
  owners: z.array(userRefSchema),
  memberCount: z.number().int().min(0),
  ideaCount: z.number().int().min(0),
  lastActiveAt: z.iso.datetime().nullable(),
});
export type AdminWorkspace = z.infer<typeof adminWorkspaceSchema>;

const searchSchema = z.string().trim().max(100).optional();

export const adminUsersQuerySchema = pageQuerySchema.extend({
  q: searchSchema,
  status: z.enum(["active", "suspended", "deleted"]).optional(),
});
export const adminWorkspacesQuerySchema = pageQuerySchema.extend({ q: searchSchema });
export const adminInvitationsQuerySchema = pageQuerySchema.extend({
  status: z.enum(["pending", "accepted", "revoked", "expired"]).optional(),
});

export const adminUsersPageSchema = pageSchema(adminUserSchema);
export const adminWorkspacesPageSchema = pageSchema(adminWorkspaceSchema);
export const adminInvitationsPageSchema = pageSchema(invitationSchema);

// ---- AD9 ----

/** `role` is required exactly when `workspaceId` is given (SDD 5.13). */
export const createAdminInvitationBodySchema = z
  .object({
    email: z.string().trim().max(254).pipe(z.email()),
    workspaceId: uuidSchema.optional(),
    role: roleSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.workspaceId !== undefined && v.role === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["role"],
        message: "role is required with workspaceId",
      });
    }
    if (v.workspaceId === undefined && v.role !== undefined) {
      ctx.addIssue({ code: "custom", path: ["role"], message: "role needs a workspaceId" });
    }
  });
