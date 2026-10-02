import { schema } from "@moonx/db";
import { isQuestionKeyOf, QUESTION_KEY_PREFIX } from "@moonx/domain";
import {
  adminTemplateQuestionSchema,
  adminTemplateSectionSchema,
  adminTemplatesSchema,
  checkRulesBodySchema,
  costDefaultsBodySchema,
  createdDraftSchema,
  createQuestionBodySchema,
  createSectionBodySchema,
  executionPresetsBodySchema,
  publishTemplateResultSchema,
  type TemplateKind,
  templateOrderBodySchema,
  templateValidationSchema,
  templateVersionDetailSchema,
  updateQuestionBodySchema,
  updateSectionBodySchema,
  updateTemplateVersionBodySchema,
} from "@moonx/schemas";
import { eq, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { operatorPlugin } from "../access";
import type { AppContext } from "../context";
import { ApiError, validationFailed } from "../errors";
import {
  createDraftFrom,
  loadVersionDetail,
  lockDraft,
  toQuestionNode,
  toSectionNode,
  touchVersion,
} from "../lib/admin-template";
import { validateVersion } from "../lib/admin-template-validate";
import type { Tx } from "../lib/db";
import { iso, isoOrNull } from "../lib/dto";
import { toUserRef } from "../lib/users";

const versionParams = z.object({ versionId: z.uuid() });
const sectionParams = z.object({ sectionId: z.uuid() });
const questionParams = z.object({ questionId: z.uuid() });

const isUniqueViolation = (error: unknown, constraintHint: string) => {
  const e = error as { code?: string; constraint_name?: string; cause?: unknown };
  if (e?.cause) return isUniqueViolation(e.cause, constraintHint);
  return e?.code === "23505" && (e.constraint_name ?? "").includes(constraintHint);
};

/** 422 INVALID_QUESTION_KEY unless `key` is a question ID of the template kind (design-spec 6.6). */
function requireQuestionKey(kind: TemplateKind, key: string): void {
  if (!isQuestionKeyOf(kind, key)) {
    throw new ApiError(
      "INVALID_QUESTION_KEY",
      `Question ID must look like ${QUESTION_KEY_PREFIX[kind]}.SECTION.KEY (capital letters, digits and _)`,
    );
  }
}

const duplicate = (path: string, message: string) =>
  validationFailed([{ path, code: "duplicate", message }]);

/** AD1-AD6 (SDD 5.13). */
export function adminTemplateRoutes(ctx: AppContext) {
  const { db } = ctx;

  /** A section of the draft, found by id. The version is locked first, then the row read again. */
  async function lockSection(tx: Tx, sectionId: string) {
    const [found] = await tx
      .select({ versionId: schema.templateSections.templateVersionId })
      .from(schema.templateSections)
      .where(eq(schema.templateSections.id, sectionId));
    if (!found) throw new ApiError("NOT_FOUND", "Section not found");
    const version = await lockDraft(tx, found.versionId);
    const [row] = await tx
      .select()
      .from(schema.templateSections)
      .where(eq(schema.templateSections.id, sectionId));
    if (!row) throw new ApiError("NOT_FOUND", "Section not found");
    return { version, row };
  }

  async function lockQuestion(tx: Tx, questionId: string) {
    const [found] = await tx
      .select({ versionId: schema.templateQuestions.templateVersionId })
      .from(schema.templateQuestions)
      .where(eq(schema.templateQuestions.id, questionId));
    if (!found) throw new ApiError("NOT_FOUND", "Question not found");
    const version = await lockDraft(tx, found.versionId);
    const [row] = await tx
      .select()
      .from(schema.templateQuestions)
      .where(eq(schema.templateQuestions.id, questionId));
    if (!row) throw new ApiError("NOT_FOUND", "Question not found");
    return { version, row };
  }

  return new Elysia({ name: "moonx-admin-templates" })
    .use(operatorPlugin(ctx))
    .guard({ operator: true })
    .get(
      "/admin/templates",
      async () => {
        const [templates, versions, users, selfCounts, validationCounts, planCounts] =
          await Promise.all([
            db.select().from(schema.templates),
            db.select().from(schema.templateVersions),
            db
              .select({
                id: schema.users.id,
                displayName: schema.users.displayName,
                avatarUrl: schema.users.avatarUrl,
                status: schema.users.status,
              })
              .from(schema.users),
            db
              .select({
                id: schema.selfAnalyses.templateVersionId,
                n: sql<number>`count(*)::int`,
              })
              .from(schema.selfAnalyses)
              .groupBy(schema.selfAnalyses.templateVersionId),
            db
              .select({
                id: schema.validations.templateVersionId,
                n: sql<number>`count(*)::int`,
              })
              .from(schema.validations)
              .groupBy(schema.validations.templateVersionId),
            db
              .select({
                id: schema.businessPlans.templateVersionId,
                n: sql<number>`count(*)::int`,
              })
              .from(schema.businessPlans)
              .groupBy(schema.businessPlans.templateVersionId),
          ]);
        const usage = new Map<string, number>();
        for (const row of [...selfCounts, ...validationCounts, ...planCounts]) {
          usage.set(row.id, (usage.get(row.id) ?? 0) + row.n);
        }
        const people = new Map(users.map((u) => [u.id, u]));
        const order: TemplateKind[] = ["self_analysis", "validation", "business_plan"];
        return {
          items: templates
            .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
            .map((template) => ({
              kind: template.kind,
              name: template.name,
              versions: versions
                .filter((v) => v.templateId === template.id)
                .sort((a, b) => b.versionNumber - a.versionNumber)
                .map((v) => {
                  const publisher = v.publishedById ? people.get(v.publishedById) : undefined;
                  return {
                    id: v.id,
                    versionNumber: v.versionNumber,
                    status: v.status,
                    publishedAt: isoOrNull(v.publishedAt),
                    publishedBy: publisher ? toUserRef(publisher) : null,
                    usageCount: usage.get(v.id) ?? 0,
                  };
                }),
            })),
        };
      },
      { response: { 200: adminTemplatesSchema } },
    )
    .post(
      "/admin/template-versions/:versionId/draft",
      async ({ params, set }) => {
        const id = await db.transaction(async (tx) => {
          try {
            return await createDraftFrom(tx, params.versionId);
          } catch (error) {
            if (isUniqueViolation(error, "template_versions_one_draft_uq")) {
              throw new ApiError("DRAFT_EXISTS", "A draft already exists for this template");
            }
            throw error;
          }
        });
        set.status = 201;
        return { id };
      },
      { params: versionParams, response: { 201: createdDraftSchema } },
    )
    .get(
      "/admin/template-versions/:versionId",
      ({ params }) => loadVersionDetail(db, params.versionId),
      { params: versionParams, response: { 200: templateVersionDetailSchema } },
    )
    .patch(
      "/admin/template-versions/:versionId",
      async ({ params, body }) => {
        await db.transaction(async (tx) => {
          await lockDraft(tx, params.versionId);
          await tx
            .update(schema.templateVersions)
            .set({ aiPrompt: body.aiPrompt })
            .where(eq(schema.templateVersions.id, params.versionId));
        });
        return loadVersionDetail(db, params.versionId);
      },
      {
        params: versionParams,
        body: updateTemplateVersionBodySchema,
        response: { 200: templateVersionDetailSchema },
      },
    )
    .post(
      "/admin/template-versions/:versionId/sections",
      async ({ params, body, set }) => {
        const row = await db.transaction(async (tx) => {
          const version = await lockDraft(tx, params.versionId);
          const [max] = await tx
            .select({
              n: sql<number>`coalesce(max(${schema.templateSections.sortOrder}), -1)::int`,
            })
            .from(schema.templateSections)
            .where(eq(schema.templateSections.templateVersionId, version.id));
          try {
            const [created] = await tx
              .insert(schema.templateSections)
              .values({
                templateVersionId: version.id,
                key: body.key,
                part: body.part ?? null,
                title: body.title,
                guidance: body.guidance ?? null,
                sortOrder: (max?.n ?? -1) + 1,
              })
              .returning();
            await touchVersion(tx, version.id, ctx.now());
            return created as NonNullable<typeof created>;
          } catch (error) {
            if (isUniqueViolation(error, "template_sections")) {
              throw duplicate("key", "A section with this key already exists");
            }
            throw error;
          }
        });
        set.status = 201;
        return toSectionNode(row);
      },
      {
        params: versionParams,
        body: createSectionBodySchema,
        response: { 201: adminTemplateSectionSchema },
      },
    )
    .patch(
      "/admin/template-sections/:sectionId",
      async ({ params, body }) =>
        db.transaction(async (tx) => {
          const { version, row } = await lockSection(tx, params.sectionId);
          const changes = {
            ...(body.key !== undefined && { key: body.key }),
            ...(body.title !== undefined && { title: body.title }),
            ...(body.guidance !== undefined && { guidance: body.guidance }),
            ...(body.part !== undefined && { part: body.part }),
          };
          if (Object.keys(changes).length === 0) return toSectionNode(row);
          try {
            const [updated] = await tx
              .update(schema.templateSections)
              .set(changes)
              .where(eq(schema.templateSections.id, row.id))
              .returning();
            await touchVersion(tx, version.id, ctx.now());
            return toSectionNode(updated as NonNullable<typeof updated>);
          } catch (error) {
            if (isUniqueViolation(error, "template_sections")) {
              throw duplicate("key", "A section with this key already exists");
            }
            throw error;
          }
        }),
      {
        params: sectionParams,
        body: updateSectionBodySchema,
        response: { 200: adminTemplateSectionSchema },
      },
    )
    .delete(
      "/admin/template-sections/:sectionId",
      async ({ params, set }) => {
        await db.transaction(async (tx) => {
          const { version, row } = await lockSection(tx, params.sectionId);
          await tx.delete(schema.templateSections).where(eq(schema.templateSections.id, row.id));
          await touchVersion(tx, version.id, ctx.now());
        });
        set.status = 204;
      },
      { params: sectionParams },
    )
    .post(
      "/admin/template-sections/:sectionId/questions",
      async ({ params, body, set }) => {
        const result = await db.transaction(async (tx) => {
          const { version, row: section } = await lockSection(tx, params.sectionId);
          requireQuestionKey(version.kind, body.key);
          const [max] = await tx
            .select({
              n: sql<number>`coalesce(max(${schema.templateQuestions.sortOrder}), -1)::int`,
            })
            .from(schema.templateQuestions)
            .where(eq(schema.templateQuestions.templateSectionId, section.id));
          try {
            const [created] = await tx
              .insert(schema.templateQuestions)
              .values({
                templateVersionId: version.id,
                templateSectionId: section.id,
                questionKey: body.key,
                title: body.title,
                prompt: body.prompt,
                example: body.example ?? null,
                hint: body.hint ?? null,
                answerType: body.answerType,
                options: body.options ?? null,
                displayCondition: body.displayCondition ?? null,
                hasFau: body.hasFau ?? false,
                copyFrom: body.copyFrom ?? null,
                reference: body.reference ?? null,
                sortOrder: (max?.n ?? -1) + 1,
              })
              .returning();
            await touchVersion(tx, version.id, ctx.now());
            return toQuestionNode(created as NonNullable<typeof created>, section.key);
          } catch (error) {
            if (isUniqueViolation(error, "template_questions")) {
              throw duplicate("key", "A question with this ID already exists");
            }
            throw error;
          }
        });
        set.status = 201;
        return result;
      },
      {
        params: sectionParams,
        body: createQuestionBodySchema,
        response: { 201: adminTemplateQuestionSchema },
      },
    )
    .patch(
      "/admin/template-questions/:questionId",
      async ({ params, body }) =>
        db.transaction(async (tx) => {
          const { version, row } = await lockQuestion(tx, params.questionId);
          const [section] = await tx
            .select({ key: schema.templateSections.key })
            .from(schema.templateSections)
            .where(eq(schema.templateSections.id, row.templateSectionId));
          const sectionKey = (section as { key: string }).key;
          if (body.key !== undefined) requireQuestionKey(version.kind, body.key);
          const changes = {
            ...(body.key !== undefined && { questionKey: body.key }),
            ...(body.title !== undefined && { title: body.title }),
            ...(body.prompt !== undefined && { prompt: body.prompt }),
            ...(body.example !== undefined && { example: body.example }),
            ...(body.hint !== undefined && { hint: body.hint }),
            ...(body.answerType !== undefined && { answerType: body.answerType }),
            ...(body.options !== undefined && { options: body.options }),
            ...(body.displayCondition !== undefined && {
              displayCondition: body.displayCondition,
            }),
            ...(body.hasFau !== undefined && { hasFau: body.hasFau }),
            ...(body.copyFrom !== undefined && { copyFrom: body.copyFrom }),
            ...(body.reference !== undefined && { reference: body.reference }),
          };
          if (Object.keys(changes).length === 0) return toQuestionNode(row, sectionKey);
          try {
            const [updated] = await tx
              .update(schema.templateQuestions)
              .set(changes)
              .where(eq(schema.templateQuestions.id, row.id))
              .returning();
            await touchVersion(tx, version.id, ctx.now());
            return toQuestionNode(updated as NonNullable<typeof updated>, sectionKey);
          } catch (error) {
            if (isUniqueViolation(error, "template_questions")) {
              throw duplicate("key", "A question with this ID already exists");
            }
            throw error;
          }
        }),
      {
        params: questionParams,
        body: updateQuestionBodySchema,
        response: { 200: adminTemplateQuestionSchema },
      },
    )
    .delete(
      "/admin/template-questions/:questionId",
      async ({ params, set }) => {
        await db.transaction(async (tx) => {
          const { version, row } = await lockQuestion(tx, params.questionId);
          await tx.delete(schema.templateQuestions).where(eq(schema.templateQuestions.id, row.id));
          await touchVersion(tx, version.id, ctx.now());
        });
        set.status = 204;
      },
      { params: questionParams },
    )
    .put(
      "/admin/template-versions/:versionId/order",
      async ({ params, body }) => {
        await db.transaction(async (tx) => {
          const version = await lockDraft(tx, params.versionId);
          const sections = await tx
            .select({ id: schema.templateSections.id })
            .from(schema.templateSections)
            .where(eq(schema.templateSections.templateVersionId, version.id));
          const questions = await tx
            .select({ id: schema.templateQuestions.id })
            .from(schema.templateQuestions)
            .where(eq(schema.templateQuestions.templateVersionId, version.id));
          const sectionIds = body.sections.map((s) => s.id);
          const questionIds = body.sections.flatMap((s) => s.questionIds);
          const sameSet = (given: string[], actual: { id: string }[]) =>
            given.length === actual.length &&
            new Set(given).size === given.length &&
            actual.every((a) => given.includes(a.id));
          if (!sameSet(sectionIds, sections)) {
            throw validationFailed([
              {
                path: "sections",
                code: "invalid_set",
                message: "List every section of the version exactly once",
              },
            ]);
          }
          if (!sameSet(questionIds, questions)) {
            throw validationFailed([
              {
                path: "sections.questionIds",
                code: "invalid_set",
                message: "List every question of the version exactly once",
              },
            ]);
          }
          for (const [sectionIndex, section] of body.sections.entries()) {
            await tx
              .update(schema.templateSections)
              .set({ sortOrder: sectionIndex })
              .where(eq(schema.templateSections.id, section.id));
            for (const [questionIndex, questionId] of section.questionIds.entries()) {
              await tx
                .update(schema.templateQuestions)
                .set({ templateSectionId: section.id, sortOrder: questionIndex })
                .where(eq(schema.templateQuestions.id, questionId));
            }
          }
          await touchVersion(tx, version.id, ctx.now());
        });
        return loadVersionDetail(db, params.versionId);
      },
      {
        params: versionParams,
        body: templateOrderBodySchema,
        response: { 200: templateVersionDetailSchema },
      },
    )
    .put(
      "/admin/template-versions/:versionId/cost-defaults",
      async ({ params, body }) => {
        await db.transaction(async (tx) => {
          const version = await lockDraft(tx, params.versionId);
          const keys = body.items.map((i) => i.key);
          if (new Set(keys).size !== keys.length) {
            throw duplicate("items", "Cost row keys must be unique");
          }
          await tx
            .delete(schema.templateCostDefaults)
            .where(eq(schema.templateCostDefaults.templateVersionId, version.id));
          if (body.items.length > 0) {
            await tx.insert(schema.templateCostDefaults).values(
              body.items.map((item, index) => ({
                templateVersionId: version.id,
                category: item.category,
                key: item.key,
                name: item.name,
                sortOrder: index,
              })),
            );
          }
          await touchVersion(tx, version.id, ctx.now());
        });
        return loadVersionDetail(db, params.versionId);
      },
      {
        params: versionParams,
        body: costDefaultsBodySchema,
        response: { 200: templateVersionDetailSchema },
      },
    )
    .put(
      "/admin/template-versions/:versionId/check-rules",
      async ({ params, body }) => {
        await db.transaction(async (tx) => {
          const version = await lockDraft(tx, params.versionId);
          const keys = body.items.map((i) => i.checkKey);
          if (new Set(keys).size !== keys.length) {
            throw duplicate("items", "Each check can have one rule");
          }
          await tx
            .delete(schema.templateCheckRules)
            .where(eq(schema.templateCheckRules.templateVersionId, version.id));
          if (body.items.length > 0) {
            await tx.insert(schema.templateCheckRules).values(
              body.items.map((item) => ({
                templateVersionId: version.id,
                checkKey: item.checkKey,
                params: item.params,
              })),
            );
          }
          await touchVersion(tx, version.id, ctx.now());
        });
        return loadVersionDetail(db, params.versionId);
      },
      {
        params: versionParams,
        body: checkRulesBodySchema,
        response: { 200: templateVersionDetailSchema },
      },
    )
    .put(
      "/admin/template-versions/:versionId/execution-presets",
      async ({ params, body }) => {
        await db.transaction(async (tx) => {
          const version = await lockDraft(tx, params.versionId);
          const details = body.items.flatMap((item, index) => [
            ...(item.area != null && item.type !== "kpi"
              ? [
                  {
                    path: `items.${index}.area`,
                    code: "invalid_value",
                    message: "Only KPI rows have an area",
                  },
                ]
              : []),
            ...(item.launchTiming != null && item.type !== "launch"
              ? [
                  {
                    path: `items.${index}.launchTiming`,
                    code: "invalid_value",
                    message: "Only launch rows have a timing",
                  },
                ]
              : []),
          ]);
          if (details.length > 0) throw validationFailed(details);
          await tx
            .delete(schema.templateExecutionPresets)
            .where(eq(schema.templateExecutionPresets.templateVersionId, version.id));
          if (body.items.length > 0) {
            await tx.insert(schema.templateExecutionPresets).values(
              body.items.map((item, index) => ({
                templateVersionId: version.id,
                type: item.type,
                title: item.title,
                area: item.area ?? null,
                launchTiming: item.launchTiming ?? null,
                sortOrder: index,
              })),
            );
          }
          await touchVersion(tx, version.id, ctx.now());
        });
        return loadVersionDetail(db, params.versionId);
      },
      {
        params: versionParams,
        body: executionPresetsBodySchema,
        response: { 200: templateVersionDetailSchema },
      },
    )
    .post(
      "/admin/template-versions/:versionId/validate",
      ({ params }) => validateVersion(db, params.versionId),
      { params: versionParams, response: { 200: templateValidationSchema } },
    )
    .post(
      "/admin/template-versions/:versionId/publish",
      async ({ params, user }) =>
        db.transaction(async (tx) => {
          const version = await lockDraft(tx, params.versionId);
          const result = await validateVersion(tx, version.id);
          if (result.errors.length > 0) {
            throw new ApiError("TEMPLATE_INVALID", "The template has errors", {
              errors: result.errors,
            });
          }
          const now = ctx.now();
          const [published] = await tx
            .update(schema.templateVersions)
            .set({ status: "published", publishedAt: now, publishedById: user.id })
            .where(eq(schema.templateVersions.id, version.id))
            .returning({ versionNumber: schema.templateVersions.versionNumber });
          return {
            versionNumber: (published as { versionNumber: number }).versionNumber,
            publishedAt: iso(now),
          };
        }),
      { params: versionParams, response: { 200: publishTemplateResultSchema } },
    );
}
