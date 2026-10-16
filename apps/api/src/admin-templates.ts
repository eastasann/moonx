import {
  businessPlans,
  copyTemplateVersion,
  type Database,
  type DatabaseTransaction,
  ideas,
  importTemplateFile,
  lockTemplateDraft,
  publishTemplateVersion,
  selfAnalyses,
  TemplateError,
  templateCheckRules,
  templateCostDefaults,
  templateExecutionPresets,
  templateQuestions,
  templateSections,
  templates,
  templateVersions,
  validateTemplateVersion,
  validations,
} from "@moonx/db";
import {
  type AdminTemplateList,
  adminTemplateListSchema,
  errorBodySchema,
  isQuestionKey,
  type PlanReferenceSpec,
  type QuestionOptions,
  type TemplateKind,
  type TemplateQuestionCreate,
  type TemplateVersionDetail,
  THRESHOLD_CHECK_KEYS,
  templateCheckRulesSchema,
  templateCheckSchema,
  templateCostDefaultsSchema,
  templateDraftSchema,
  templateExecutionPresetsSchema,
  templateFileSchema,
  templateImportQuerySchema,
  templateImportResultSchema,
  templateKindSchema,
  templateNodeParamsSchema,
  templateOrderSchema,
  templatePublishResultSchema,
  templateQuestionCreateSchema,
  templateQuestionUpdateSchema,
  templateSectionCreateSchema,
  templateSectionUpdateSchema,
  templateVersionDetailSchema,
  templateVersionParamsSchema,
  templateVersionUpdateSchema,
  uuidSchema,
} from "@moonx/schemas";
import { and, asc, count, desc, eq, isNull, max, ne } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AccessPlugin } from "./access";
import { ApiError } from "./errors";
import { loadPitchFonts } from "./pitch-fonts";
import { loadUserRefs } from "./user-refs";
import { invalid } from "./validation-writes";

// AD1–AD6 and AD10 (SDD 5.13): the operator's screens 26 and 27. A template reaches users
// through a draft version, made from a file (AD10) or a copy (AD2), edited on 27 and
// checked and published (AD6); published versions never change. The import, the copy,
// the checks and publishing live in packages/db (templates.ts), which the seed shares.

type Executor = Database | DatabaseTransaction;

const noContent = z.undefined().meta({ description: "No content" });

/** Runs `work`, answering a refusal of packages/db's template functions in SDD 8.1's shape. */
async function answering<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof TemplateError) {
      throw new ApiError(
        error.code,
        error.message,
        error.details.length > 0 ? { details: error.details } : {},
        { cause: error },
      );
    }
    throw error;
  }
}

const noVersion = (id: string) =>
  new ApiError("NOT_FOUND", `No template version ${id}`);

/** AD3 GET: the version `versionId` as 27 edits it. */
async function loadVersionDetail(
  db: Executor,
  versionId: string,
): Promise<TemplateVersionDetail> {
  if (!uuidSchema.safeParse(versionId).success) throw noVersion(versionId);
  const [version] = await db
    .select({
      id: templateVersions.id,
      kind: templates.kind,
      versionNumber: templateVersions.versionNumber,
      status: templateVersions.status,
      aiPrompt: templateVersions.aiPrompt,
    })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(eq(templateVersions.id, versionId));
  if (version === undefined) throw noVersion(versionId);
  const ofVersion = { templateVersionId: version.id };
  const sections = await db
    .select()
    .from(templateSections)
    .where(eq(templateSections.templateVersionId, ofVersion.templateVersionId))
    .orderBy(asc(templateSections.sortOrder), asc(templateSections.id));
  const questions = await db
    .select()
    .from(templateQuestions)
    .where(eq(templateQuestions.templateVersionId, ofVersion.templateVersionId))
    .orderBy(asc(templateQuestions.sortOrder), asc(templateQuestions.id));
  const costDefaults = await db
    .select()
    .from(templateCostDefaults)
    .where(
      eq(templateCostDefaults.templateVersionId, ofVersion.templateVersionId),
    )
    .orderBy(asc(templateCostDefaults.sortOrder), asc(templateCostDefaults.id));
  const checkRules = await db
    .select()
    .from(templateCheckRules)
    .where(
      eq(templateCheckRules.templateVersionId, ofVersion.templateVersionId),
    )
    .orderBy(asc(templateCheckRules.checkKey));
  const presets = await db
    .select()
    .from(templateExecutionPresets)
    .where(
      eq(
        templateExecutionPresets.templateVersionId,
        ofVersion.templateVersionId,
      ),
    )
    .orderBy(
      asc(templateExecutionPresets.sortOrder),
      asc(templateExecutionPresets.id),
    );
  return {
    ...version,
    sections: sections.map((section) => ({
      id: section.id,
      key: section.key,
      part: section.part,
      title: section.title,
      subtitle: section.subtitle,
      guidance: section.guidance,
      sortOrder: section.sortOrder,
      questions: questions
        .filter((question) => question.templateSectionId === section.id)
        .map((question) => ({
          id: question.id,
          key: question.questionKey,
          sectionKey: section.key,
          title: question.title,
          prompt: question.prompt,
          example: question.example,
          hint: question.hint,
          answerType: question.answerType,
          options: question.options as QuestionOptions | null,
          displayCondition: question.displayCondition as Record<
            string,
            string[]
          > | null,
          hasFau: question.hasFau,
          copyFrom: question.copyFrom as string[] | null,
          reference: question.reference as PlanReferenceSpec[] | null,
          sortOrder: question.sortOrder,
        })),
    })),
    costDefaults: costDefaults.map((row) => ({
      id: row.id,
      category: row.category,
      key: row.key,
      name: row.name,
      sortOrder: row.sortOrder,
    })),
    checkRules: checkRules.map((rule) => ({
      checkKey: rule.checkKey,
      params: rule.params as Record<string, number>,
    })),
    executionPresets: presets.map((preset) => ({
      id: preset.id,
      type: preset.type,
      title: preset.title,
      area: preset.area,
      launchTiming: preset.launchTiming,
      sortOrder: preset.sortOrder,
    })),
  };
}

/** AD1: the three templates with their versions, newest first, and how many use each. */
async function loadTemplateList(db: Database): Promise<AdminTemplateList> {
  const rows = await db
    .select({
      kind: templates.kind,
      name: templates.name,
      id: templateVersions.id,
      versionNumber: templateVersions.versionNumber,
      status: templateVersions.status,
      publishedAt: templateVersions.publishedAt,
      publishedById: templateVersions.publishedById,
    })
    .from(templates)
    .innerJoin(templateVersions, eq(templateVersions.templateId, templates.id))
    .orderBy(desc(templateVersions.versionNumber));
  const [named, usage] = await Promise.all([
    db.select({ kind: templates.kind, name: templates.name }).from(templates),
    usageCounts(db),
  ]);
  const publishers = await loadUserRefs(
    db,
    rows.flatMap((row) =>
      row.publishedById === null ? [] : [row.publishedById],
    ),
    null,
  );
  return {
    items: templateKindSchema.options.map((kind) => ({
      kind,
      name: named.find((template) => template.kind === kind)?.name ?? null,
      versions: rows
        .filter((row) => row.kind === kind)
        .map((row) => ({
          id: row.id,
          versionNumber: row.versionNumber,
          status: row.status,
          publishedAt: row.publishedAt?.toISOString() ?? null,
          publishedBy:
            row.publishedById === null
              ? null
              : (publishers.get(row.publishedById) ?? null),
          usageCount: usage.get(row.id) ?? 0,
        })),
    })),
  };
}

/**
 * How many self-analyses, validations and plans each version pins, by version id. Ideas
 * and plans whose creation was undone count nowhere (SDD 5.1).
 */
async function usageCounts(db: Database): Promise<Map<string, number>> {
  const counts = await Promise.all([
    db
      .select({ id: selfAnalyses.templateVersionId, n: count() })
      .from(selfAnalyses)
      .groupBy(selfAnalyses.templateVersionId),
    db
      .select({ id: validations.templateVersionId, n: count() })
      .from(validations)
      .innerJoin(ideas, eq(ideas.id, validations.ideaId))
      .where(isNull(ideas.deletedAt))
      .groupBy(validations.templateVersionId),
    db
      .select({ id: businessPlans.templateVersionId, n: count() })
      .from(businessPlans)
      .innerJoin(ideas, eq(ideas.id, businessPlans.ideaId))
      .where(and(isNull(businessPlans.deletedAt), isNull(ideas.deletedAt)))
      .groupBy(businessPlans.templateVersionId),
  ]);
  return new Map(counts.flat().map((row) => [row.id, row.n]));
}

/** Where the section or question `id` of AD4 sits: its version and itself. */
async function findNode(
  db: Executor,
  table: typeof templateSections | typeof templateQuestions,
  id: string,
  what: string,
): Promise<{ id: string; templateVersionId: string }> {
  const t = table as typeof templateSections;
  const [node] = uuidSchema.safeParse(id).success
    ? await db
        .select({ id: t.id, templateVersionId: t.templateVersionId })
        .from(t)
        .where(eq(t.id, id))
    : [];
  if (node === undefined) throw new ApiError("NOT_FOUND", `No ${what} ${id}`);
  return node;
}

/**
 * Runs `work` on the draft `versionId` under its lock (packages/db templates.ts), and
 * marks the version as changed. A section or question found before the lock may be gone
 * by then: `work` finds it again under the lock, and answers 404 when it is not there.
 *
 * @throws {ApiError} NOT_FOUND, PUBLISHED_READ_ONLY
 */
function editDraft<T>(
  db: Database,
  versionId: string,
  at: Date,
  work: (
    tx: DatabaseTransaction,
    draft: { id: string; templateId: string; kind: TemplateKind },
  ) => Promise<T>,
): Promise<T> {
  return answering(() =>
    db.transaction(async (tx) => {
      const draft = await lockTemplateDraft(tx, versionId);
      const result = await work(tx, draft);
      await tx
        .update(templateVersions)
        .set({ updatedAt: at })
        .where(eq(templateVersions.id, draft.id));
      return result;
    }),
  );
}

/** Whether another section of the version already has `key` (unique per version). */
async function sectionKeyTaken(
  tx: DatabaseTransaction,
  versionId: string,
  key: string,
  except: string | null,
) {
  const [taken] = await tx
    .select({ id: templateSections.id })
    .from(templateSections)
    .where(
      and(
        eq(templateSections.templateVersionId, versionId),
        eq(templateSections.key, key),
        except === null ? undefined : ne(templateSections.id, except),
      ),
    );
  return taken !== undefined;
}

/** Whether another question of the version already has the question ID `key`. */
async function questionKeyTaken(
  tx: DatabaseTransaction,
  versionId: string,
  key: string,
  except: string | null,
) {
  const [taken] = await tx
    .select({ id: templateQuestions.id })
    .from(templateQuestions)
    .where(
      and(
        eq(templateQuestions.templateVersionId, versionId),
        eq(templateQuestions.questionKey, key),
        except === null ? undefined : ne(templateQuestions.id, except),
      ),
    );
  return taken !== undefined;
}

/**
 * Whether a published version of the template `templateId` has the question ID `key`:
 * then the ID names the same question in every later version, and a draft copied from
 * it cannot change it (design-spec 6.6, 6.0.8 for 27). Removing the question stays
 * possible, which AD6 warns of.
 */
async function keyPublished(
  tx: DatabaseTransaction,
  templateId: string,
  key: string,
) {
  const [found] = await tx
    .select({ id: templateQuestions.id })
    .from(templateQuestions)
    .innerJoin(
      templateVersions,
      eq(templateVersions.id, templateQuestions.templateVersionId),
    )
    .where(
      and(
        eq(templateVersions.templateId, templateId),
        eq(templateVersions.status, "published"),
        eq(templateQuestions.questionKey, key),
      ),
    )
    .limit(1);
  return found !== undefined;
}

/** A question's fields once a create or an update is applied. */
type QuestionValues = Required<
  Pick<
    TemplateQuestionCreate,
    | "key"
    | "title"
    | "prompt"
    | "answerType"
    | "example"
    | "hint"
    | "options"
    | "displayCondition"
    | "hasFau"
    | "copyFrom"
    | "reference"
  >
>;

/**
 * Checks what a question may hold in a template of `kind` (design-spec 6.6, 6.0.8 for
 * 27, and 6.0.3: F/A/U is for validations), as a template file is checked: the question
 * ID's form first, with its own code.
 *
 * @throws {ApiError} INVALID_QUESTION_KEY, VALIDATION_FAILED
 */
function checkQuestion(kind: TemplateKind, values: QuestionValues) {
  if (!isQuestionKey(values.key, kind)) {
    throw new ApiError(
      "INVALID_QUESTION_KEY",
      `${values.key} is not a question ID of a ${kind} template`,
    );
  }
  if (
    Object.keys(values.displayCondition ?? {}).some(
      (key) => !isQuestionKey(key, kind),
    )
  ) {
    throw invalid(
      "displayCondition",
      "invalid_format",
      "Shows on a key that is not a question ID of this template",
    );
  }
  if (values.hasFau && kind !== "validation") {
    throw invalid("hasFau", "invalid_value", "Only validations take F/A/U");
  }
  if (values.copyFrom !== null && kind !== "business_plan") {
    throw invalid("copyFrom", "invalid_value", "Only plans copy on a draft");
  }
  if (values.reference !== null && kind !== "business_plan") {
    throw invalid("reference", "invalid_value", "Only plans show references");
  }
}

const questionColumns = (values: QuestionValues) => ({
  questionKey: values.key,
  title: values.title,
  prompt: values.prompt,
  example: values.example,
  hint: values.hint,
  answerType: values.answerType,
  options: values.options,
  displayCondition: values.displayCondition,
  hasFau: values.hasFau,
  copyFrom: values.copyFrom,
  reference: values.reference,
});

/** Refuses a list AD5 replaces for any kind of template but `owner`, unless it is empty. */
const onlyFor = (
  kind: TemplateKind,
  owner: TemplateKind,
  items: readonly unknown[],
  what: string,
) => {
  if (kind !== owner && items.length > 0) {
    throw invalid("items", "too_big", `Only a ${owner} template has ${what}`);
  }
};

/** What the operator's template routes need from the app. */
export interface AdminTemplateRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

const errors = {
  401: errorBodySchema,
  403: errorBodySchema,
  404: errorBodySchema,
} as const;

/** Errors of the routes that edit a draft: published versions answer 409. */
const editErrors = {
  ...errors,
  409: errorBodySchema,
  422: errorBodySchema,
} as const;

/** AD1–AD6 and AD10 (SDD 5.13): 26 and 27. Operators only. */
export function adminTemplateRoutes({
  access,
  db,
  now,
}: AdminTemplateRoutesOptions) {
  // AD6 sets a plan template's Pitch Deck in the PDF's fonts (design-spec 6.14).
  const measured = loadPitchFonts();
  return new Elysia()
    .use(access)
    .get("/api/v1/admin/templates", () => loadTemplateList(db), {
      operator: true,
      response: { 200: adminTemplateListSchema, ...errors },
      detail: {
        summary: "AD1 The templates and their versions (26)",
        description:
          "Always the three kinds, in the order self-analysis, validation, plan; one never imported has no name and no versions. Versions newest first, with how many self-analyses, validations or plans pin each.",
      },
    })
    .post(
      "/api/v1/admin/template-versions/:versionId/draft",
      async ({ params, status }) => {
        const draft = await answering(() =>
          copyTemplateVersion(db, params.versionId),
        );
        return status(201, { id: draft.versionId });
      },
      {
        operator: true,
        params: templateVersionParamsSchema,
        response: {
          201: templateDraftSchema,
          ...errors,
          409: errorBodySchema,
        },
        detail: {
          summary: "AD2 New draft from a version (26)",
          description:
            "Copies the version into a draft of the next number. 409 DRAFT_EXISTS when the template has one: a template has one draft at most.",
        },
      },
    )
    .get(
      "/api/v1/admin/template-versions/:versionId",
      ({ params }) => loadVersionDetail(db, params.versionId),
      {
        operator: true,
        params: templateVersionParamsSchema,
        response: { 200: templateVersionDetailSchema, ...errors },
        detail: { summary: "AD3 A template version (27)" },
      },
    )
    .patch(
      "/api/v1/admin/template-versions/:versionId",
      async ({ params, body }) => {
        const id = await editDraft(
          db,
          params.versionId,
          new Date(now()),
          async (tx, draft) => {
            // Only a self-analysis template has an AI prompt (2026-10-02 user decision).
            if (draft.kind !== "self_analysis" && body.aiPrompt !== "") {
              throw invalid(
                "aiPrompt",
                "too_big",
                "Only a self-analysis template has an AI prompt",
              );
            }
            await tx
              .update(templateVersions)
              .set({ aiPrompt: body.aiPrompt })
              .where(eq(templateVersions.id, draft.id));
            return draft.id;
          },
        );
        return loadVersionDetail(db, id);
      },
      {
        operator: true,
        params: templateVersionParamsSchema,
        body: templateVersionUpdateSchema,
        parse: "json",
        response: { 200: templateVersionDetailSchema, ...editErrors },
        detail: {
          summary: "AD3 Edit a draft's AI prompt (27)",
          description:
            "Self-analysis templates only; another kind takes only the empty text (422 VALIDATION_FAILED otherwise). 409 PUBLISHED_READ_ONLY for a published version.",
        },
      },
    )
    .post(
      "/api/v1/admin/template-versions/:versionId/sections",
      async ({ params, body, status }) => {
        const id = await editDraft(
          db,
          params.versionId,
          new Date(now()),
          async (tx, draft) => {
            if (await sectionKeyTaken(tx, draft.id, body.key, null)) {
              throw invalid("key", "custom", "Repeats a section key");
            }
            const [last] = await tx
              .select({ order: max(templateSections.sortOrder) })
              .from(templateSections)
              .where(eq(templateSections.templateVersionId, draft.id));
            await tx.insert(templateSections).values({
              templateVersionId: draft.id,
              key: body.key,
              title: body.title,
              subtitle: body.subtitle ?? null,
              guidance: body.guidance ?? null,
              part: body.part ?? null,
              sortOrder: (last?.order ?? -1) + 1,
            });
            return draft.id;
          },
        );
        return status(201, await loadVersionDetail(db, id));
      },
      {
        operator: true,
        params: templateVersionParamsSchema,
        body: templateSectionCreateSchema,
        parse: "json",
        response: { 201: templateVersionDetailSchema, ...editErrors },
        detail: {
          summary: "AD4 Add a section (27)",
          description:
            "Last in the version. The key is unique in the version (422 VALIDATION_FAILED). Answers with the whole version.",
        },
      },
    )
    .patch(
      "/api/v1/admin/template-sections/:id",
      async ({ params, body }) => {
        const node = await findNode(db, templateSections, params.id, "section");
        await editDraft(
          db,
          node.templateVersionId,
          new Date(now()),
          async (tx, draft) => {
            if (
              body.key !== undefined &&
              (await sectionKeyTaken(tx, draft.id, body.key, node.id))
            ) {
              throw invalid("key", "custom", "Repeats a section key");
            }
            const changed = await tx
              .update(templateSections)
              .set({
                key: body.key,
                title: body.title,
                subtitle: body.subtitle,
                guidance: body.guidance,
                part: body.part,
                updatedAt: new Date(now()),
              })
              .where(eq(templateSections.id, node.id))
              .returning({ id: templateSections.id });
            if (changed.length === 0) {
              throw new ApiError("NOT_FOUND", `No section ${params.id}`);
            }
          },
        );
        return loadVersionDetail(db, node.templateVersionId);
      },
      {
        operator: true,
        params: templateNodeParamsSchema,
        body: templateSectionUpdateSchema,
        parse: "json",
        response: { 200: templateVersionDetailSchema, ...editErrors },
        detail: {
          summary: "AD4 Edit a section (27)",
          description:
            "Changes the fields sent. Answers with the whole version.",
        },
      },
    )
    .delete(
      "/api/v1/admin/template-sections/:id",
      async ({ params, set }) => {
        const node = await findNode(db, templateSections, params.id, "section");
        await editDraft(
          db,
          node.templateVersionId,
          new Date(now()),
          async (tx) => {
            // Its questions cascade.
            const deleted = await tx
              .delete(templateSections)
              .where(eq(templateSections.id, node.id))
              .returning({ id: templateSections.id });
            if (deleted.length === 0) {
              throw new ApiError("NOT_FOUND", `No section ${params.id}`);
            }
          },
        );
        set.status = 204;
      },
      {
        operator: true,
        params: templateNodeParamsSchema,
        response: { 204: noContent, ...errors, 409: errorBodySchema },
        detail: {
          summary: "AD4 Delete a section (27)",
          description: "Deletes its questions with it.",
        },
      },
    )
    .post(
      "/api/v1/admin/template-sections/:id/questions",
      async ({ params, body, status }) => {
        const node = await findNode(db, templateSections, params.id, "section");
        await editDraft(
          db,
          node.templateVersionId,
          new Date(now()),
          async (tx, draft) => {
            const [section] = await tx
              .select({ id: templateSections.id })
              .from(templateSections)
              .where(eq(templateSections.id, node.id));
            if (section === undefined) {
              throw new ApiError("NOT_FOUND", `No section ${params.id}`);
            }
            const values: QuestionValues = {
              key: body.key,
              title: body.title,
              prompt: body.prompt,
              answerType: body.answerType,
              example: body.example ?? null,
              hint: body.hint ?? null,
              options: body.options ?? null,
              displayCondition: body.displayCondition ?? null,
              hasFau: body.hasFau ?? false,
              copyFrom: body.copyFrom ?? null,
              reference: body.reference ?? null,
            };
            checkQuestion(draft.kind, values);
            if (await questionKeyTaken(tx, draft.id, values.key, null)) {
              throw invalid("key", "custom", "Repeats a question ID");
            }
            const [last] = await tx
              .select({ order: max(templateQuestions.sortOrder) })
              .from(templateQuestions)
              .where(eq(templateQuestions.templateSectionId, node.id));
            await tx.insert(templateQuestions).values({
              templateVersionId: draft.id,
              templateSectionId: node.id,
              ...questionColumns(values),
              sortOrder: (last?.order ?? -1) + 1,
            });
          },
        );
        return status(201, await loadVersionDetail(db, node.templateVersionId));
      },
      {
        operator: true,
        params: templateNodeParamsSchema,
        body: templateQuestionCreateSchema,
        parse: "json",
        response: { 201: templateVersionDetailSchema, ...editErrors },
        detail: {
          summary: "AD4 Add a question (27)",
          description:
            "Last in the section. 422 INVALID_QUESTION_KEY for a key not of design-spec 6.6's form for the template; the key is unique in the version (422 VALIDATION_FAILED). F/A/U is for validations, copyFrom and reference for plans. Answers with the whole version.",
        },
      },
    )
    .patch(
      "/api/v1/admin/template-questions/:id",
      async ({ params, body }) => {
        const node = await findNode(
          db,
          templateQuestions,
          params.id,
          "question",
        );
        await editDraft(
          db,
          node.templateVersionId,
          new Date(now()),
          async (tx, draft) => {
            const [stored] = await tx
              .select()
              .from(templateQuestions)
              .where(eq(templateQuestions.id, node.id));
            if (stored === undefined) {
              throw new ApiError("NOT_FOUND", `No question ${params.id}`);
            }
            const answerType = body.answerType ?? stored.answerType;
            const values: QuestionValues = {
              key: body.key ?? stored.questionKey,
              title: body.title ?? stored.title,
              prompt: body.prompt ?? stored.prompt,
              answerType,
              example:
                body.example === undefined ? stored.example : body.example,
              hint: body.hint === undefined ? stored.hint : body.hint,
              // A new answer type drops the options of the old one (design-spec 6.17).
              options:
                body.options !== undefined
                  ? body.options
                  : answerType === stored.answerType
                    ? (stored.options as QuestionOptions | null)
                    : null,
              displayCondition:
                body.displayCondition === undefined
                  ? (stored.displayCondition as Record<string, string[]> | null)
                  : body.displayCondition,
              hasFau: body.hasFau ?? stored.hasFau,
              copyFrom:
                body.copyFrom === undefined
                  ? (stored.copyFrom as string[] | null)
                  : body.copyFrom,
              reference:
                body.reference === undefined
                  ? (stored.reference as PlanReferenceSpec[] | null)
                  : body.reference,
            };
            checkQuestion(draft.kind, values);
            if (
              values.key !== stored.questionKey &&
              (await keyPublished(tx, draft.templateId, stored.questionKey))
            ) {
              throw invalid(
                "key",
                "custom",
                "A question ID cannot change once a version with it is published",
              );
            }
            if (await questionKeyTaken(tx, draft.id, values.key, node.id)) {
              throw invalid("key", "custom", "Repeats a question ID");
            }
            await tx
              .update(templateQuestions)
              .set({ ...questionColumns(values), updatedAt: new Date(now()) })
              .where(eq(templateQuestions.id, node.id));
          },
        );
        return loadVersionDetail(db, node.templateVersionId);
      },
      {
        operator: true,
        params: templateNodeParamsSchema,
        body: templateQuestionUpdateSchema,
        parse: "json",
        response: { 200: templateVersionDetailSchema, ...editErrors },
        detail: {
          summary: "AD4 Edit a question (27)",
          description:
            "Changes the fields sent, checked as AD4 POST checks them. A new answerType without options clears the options. Answers with the whole version.",
        },
      },
    )
    .delete(
      "/api/v1/admin/template-questions/:id",
      async ({ params, set }) => {
        const node = await findNode(
          db,
          templateQuestions,
          params.id,
          "question",
        );
        await editDraft(
          db,
          node.templateVersionId,
          new Date(now()),
          async (tx) => {
            const deleted = await tx
              .delete(templateQuestions)
              .where(eq(templateQuestions.id, node.id))
              .returning({ id: templateQuestions.id });
            if (deleted.length === 0) {
              throw new ApiError("NOT_FOUND", `No question ${params.id}`);
            }
          },
        );
        set.status = 204;
      },
      {
        operator: true,
        params: templateNodeParamsSchema,
        response: { 204: noContent, ...errors, 409: errorBodySchema },
        detail: { summary: "AD4 Delete a question (27)" },
      },
    )
    .put(
      "/api/v1/admin/template-versions/:versionId/order",
      async ({ params, body }) => {
        const id = await editDraft(
          db,
          params.versionId,
          new Date(now()),
          async (tx, draft) => {
            const sections = await tx
              .select({ id: templateSections.id })
              .from(templateSections)
              .where(eq(templateSections.templateVersionId, draft.id));
            const questions = await tx
              .select({ id: templateQuestions.id })
              .from(templateQuestions)
              .where(eq(templateQuestions.templateVersionId, draft.id));
            const same = (stored: { id: string }[], sent: string[]) =>
              sent.length === stored.length &&
              new Set(sent.map((id) => id.toLowerCase())).size ===
                stored.length &&
              sent.every((id) =>
                stored.some((row) => row.id === id.toLowerCase()),
              );
            if (
              !same(
                sections,
                body.sections.map((section) => section.id),
              ) ||
              !same(
                questions,
                body.sections.flatMap((section) => section.questionIds),
              )
            ) {
              throw invalid(
                "sections",
                "custom",
                "Must list every section and question of the version once",
              );
            }
            for (const [sortOrder, section] of body.sections.entries()) {
              await tx
                .update(templateSections)
                .set({ sortOrder })
                .where(eq(templateSections.id, section.id));
              for (const [order, questionId] of section.questionIds.entries()) {
                await tx
                  .update(templateQuestions)
                  .set({ templateSectionId: section.id, sortOrder: order })
                  .where(eq(templateQuestions.id, questionId));
              }
            }
            return draft.id;
          },
        );
        return loadVersionDetail(db, id);
      },
      {
        operator: true,
        params: templateVersionParamsSchema,
        body: templateOrderSchema,
        parse: "json",
        response: { 200: templateVersionDetailSchema, ...editErrors },
        detail: {
          summary: "AD5 Order the sections and questions (27)",
          description:
            "Every section of the version once, each with the questions it holds, in order: a question may move to another section. Anything else is 422 VALIDATION_FAILED.",
        },
      },
    )
    .put(
      "/api/v1/admin/template-versions/:versionId/cost-defaults",
      async ({ params, body }) => {
        const id = await editDraft(
          db,
          params.versionId,
          new Date(now()),
          async (tx, draft) => {
            onlyFor(draft.kind, "validation", body.items, "starting cost rows");
            await tx
              .delete(templateCostDefaults)
              .where(eq(templateCostDefaults.templateVersionId, draft.id));
            if (body.items.length > 0) {
              await tx.insert(templateCostDefaults).values(
                body.items.map((item, sortOrder) => ({
                  templateVersionId: draft.id,
                  ...item,
                  sortOrder,
                })),
              );
            }
            return draft.id;
          },
        );
        return loadVersionDetail(db, id);
      },
      {
        operator: true,
        params: templateVersionParamsSchema,
        body: templateCostDefaultsSchema,
        parse: "json",
        response: { 200: templateVersionDetailSchema, ...editErrors },
        detail: {
          summary: "AD5 Replace the starting cost rows (27)",
          description:
            "Validation templates only (another kind takes only the empty list). Keys are unique in the version.",
        },
      },
    )
    .put(
      "/api/v1/admin/template-versions/:versionId/check-rules",
      async ({ params, body }) => {
        const id = await editDraft(
          db,
          params.versionId,
          new Date(now()),
          async (tx, draft) => {
            onlyFor(draft.kind, "validation", body.items, "check thresholds");
            const keys = new Set(body.items.map((rule) => rule.checkKey));
            const missing = THRESHOLD_CHECK_KEYS.find((key) => !keys.has(key));
            if (draft.kind === "validation" && missing !== undefined) {
              throw invalid(
                "items",
                "custom",
                `Needs the thresholds of the check ${missing}`,
              );
            }
            await tx
              .delete(templateCheckRules)
              .where(eq(templateCheckRules.templateVersionId, draft.id));
            if (body.items.length > 0) {
              await tx.insert(templateCheckRules).values(
                body.items.map((rule) => ({
                  templateVersionId: draft.id,
                  checkKey: rule.checkKey,
                  params: rule.params,
                })),
              );
            }
            return draft.id;
          },
        );
        return loadVersionDetail(db, id);
      },
      {
        operator: true,
        params: templateVersionParamsSchema,
        body: templateCheckRulesSchema,
        parse: "json",
        response: { 200: templateVersionDetailSchema, ...editErrors },
        detail: {
          summary: "AD5 Replace the check thresholds (27)",
          description:
            "Validation templates only, which keep the thresholds of competitors, local_price, permits and demand_signal (design-spec 6.0.8). Another kind takes only the empty list.",
        },
      },
    )
    .put(
      "/api/v1/admin/template-versions/:versionId/execution-presets",
      async ({ params, body }) => {
        const id = await editDraft(
          db,
          params.versionId,
          new Date(now()),
          async (tx, draft) => {
            onlyFor(
              draft.kind,
              "business_plan",
              body.items,
              "starting execution rows",
            );
            await tx
              .delete(templateExecutionPresets)
              .where(eq(templateExecutionPresets.templateVersionId, draft.id));
            if (body.items.length > 0) {
              await tx.insert(templateExecutionPresets).values(
                body.items.map((item, sortOrder) => ({
                  templateVersionId: draft.id,
                  type: item.type,
                  title: item.title,
                  area: item.area ?? null,
                  launchTiming: item.launchTiming ?? null,
                  sortOrder,
                })),
              );
            }
            return draft.id;
          },
        );
        return loadVersionDetail(db, id);
      },
      {
        operator: true,
        params: templateVersionParamsSchema,
        body: templateExecutionPresetsSchema,
        parse: "json",
        response: { 200: templateVersionDetailSchema, ...editErrors },
        detail: {
          summary: "AD5 Replace the starting execution rows (27)",
          description:
            "Plan templates only (another kind takes only the empty list). area is for KPIs, launchTiming for launch rows, which need one.",
        },
      },
    )
    .post(
      "/api/v1/admin/template-versions/:versionId/validate",
      ({ params }) =>
        answering(async () =>
          validateTemplateVersion(db, params.versionId, await measured),
        ),
      {
        operator: true,
        params: templateVersionParamsSchema,
        response: { 200: templateCheckSchema, ...errors },
        detail: {
          summary: "AD6 Check a version before publishing (27)",
          description:
            "Writes nothing, so a published version may be checked too. Errors block publishing; warnings (question IDs the previous version had) do not.",
        },
      },
    )
    .post(
      "/api/v1/admin/template-versions/:versionId/publish",
      async ({ params, caller }) => {
        const published = await answering(async () =>
          publishTemplateVersion(
            db,
            params.versionId,
            caller.id,
            await measured,
          ),
        );
        return {
          versionNumber: published.versionNumber,
          publishedAt: published.publishedAt.toISOString(),
        };
      },
      {
        operator: true,
        params: templateVersionParamsSchema,
        response: {
          200: templatePublishResultSchema,
          ...errors,
          409: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "AD6 Publish a draft (27)",
          description:
            "422 TEMPLATE_INVALID when the check finds errors; 409 PUBLISHED_READ_ONLY when it is published already. Existing self-analyses, validations and plans keep their version (M8 moves them).",
        },
      },
    )
    .post(
      "/api/v1/admin/templates/import",
      async ({ query, body, status }) =>
        status(
          201,
          await answering(() => importTemplateFile(db, query.kind, body)),
        ),
      {
        operator: true,
        query: templateImportQuerySchema,
        parse: "json",
        response: {
          201: templateImportResultSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          409: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "AD10 Import a template file (26)",
          description:
            "The body is a template file of SDD 5.13 for the kind chosen; it becomes the template's draft (v1, or the next number), made from the file alone. 422 VALIDATION_FAILED with details when it is of another kind or breaks the format; 409 DRAFT_EXISTS when the template has a draft.",
          // Documented here rather than declared as `body`: importTemplateFile checks the
          // kind before the format, so 26 can tell a file of another kind from a broken
          // one, which a body schema checked first would blur.
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: z.toJSONSchema(templateFileSchema, {
                  io: "input",
                }) as never,
              },
            },
          },
        },
      },
    );
}
