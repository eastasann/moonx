import { schema } from "@moonx/db";
import type { QuestionOptions, TemplateKind, TemplateVersionDetail } from "@moonx/schemas";
import { and, asc, eq, sql } from "drizzle-orm";
import { ApiError } from "../errors";
import type { Executor, Tx } from "./db";

type QuestionRow = typeof schema.templateQuestions.$inferSelect;
type SectionRow = typeof schema.templateSections.$inferSelect;

/** An AD3 section node. */
export function toSectionNode(row: SectionRow) {
  return {
    id: row.id,
    key: row.key,
    part: row.part,
    title: row.title,
    guidance: row.guidance,
    sortOrder: row.sortOrder,
  };
}

/** An AD3 question node. */
export function toQuestionNode(row: QuestionRow, sectionKey: string) {
  return {
    id: row.id,
    key: row.questionKey,
    sectionKey,
    title: row.title,
    prompt: row.prompt,
    example: row.example,
    hint: row.hint,
    answerType: row.answerType,
    options: row.options as QuestionOptions | null,
    displayCondition: row.displayCondition as Record<string, string[]> | null,
    hasFau: row.hasFau,
    copyFrom: row.copyFrom,
    reference: row.reference,
    sortOrder: row.sortOrder,
  };
}

/** The version row and the kind of its template. 404 when there is none. */
export async function loadVersionHead(db: Executor, versionId: string) {
  const [row] = await db
    .select({
      id: schema.templateVersions.id,
      templateId: schema.templateVersions.templateId,
      kind: schema.templates.kind,
      versionNumber: schema.templateVersions.versionNumber,
      status: schema.templateVersions.status,
      aiPrompt: schema.templateVersions.aiPrompt,
    })
    .from(schema.templateVersions)
    .innerJoin(schema.templates, eq(schema.templates.id, schema.templateVersions.templateId))
    .where(eq(schema.templateVersions.id, versionId));
  if (!row) throw new ApiError("NOT_FOUND", "Template version not found");
  return row;
}

/**
 * Locks the version row and returns its kind when it is a draft. Every AD3 PATCH to AD6 publish
 * goes through here, so edits and a publish of the same draft run one after the other, and a
 * published version is read-only (409).
 */
export async function lockDraft(
  tx: Tx,
  versionId: string,
): Promise<{ id: string; kind: TemplateKind }> {
  const [row] = await tx
    .select({
      id: schema.templateVersions.id,
      status: schema.templateVersions.status,
      kind: schema.templates.kind,
    })
    .from(schema.templateVersions)
    .innerJoin(schema.templates, eq(schema.templates.id, schema.templateVersions.templateId))
    .where(eq(schema.templateVersions.id, versionId))
    .for("update", { of: schema.templateVersions });
  if (!row) throw new ApiError("NOT_FOUND", "Template version not found");
  if (row.status === "published") {
    throw new ApiError("PUBLISHED_READ_ONLY", "A published version cannot be changed");
  }
  return { id: row.id, kind: row.kind };
}

/** Sets `updated_at` of the version after an edit of anything under it. */
export async function touchVersion(tx: Executor, versionId: string, at: Date): Promise<void> {
  await tx
    .update(schema.templateVersions)
    .set({ updatedAt: at })
    .where(eq(schema.templateVersions.id, versionId));
}

/** AD3: the whole version with every list under it, in order. */
export async function loadVersionDetail(
  db: Executor,
  versionId: string,
): Promise<TemplateVersionDetail> {
  const head = await loadVersionHead(db, versionId);
  const [sections, questions, costDefaults, checkRules, executionPresets] = await Promise.all([
    db
      .select()
      .from(schema.templateSections)
      .where(eq(schema.templateSections.templateVersionId, versionId))
      .orderBy(asc(schema.templateSections.sortOrder)),
    db
      .select()
      .from(schema.templateQuestions)
      .where(eq(schema.templateQuestions.templateVersionId, versionId))
      .orderBy(asc(schema.templateQuestions.sortOrder)),
    db
      .select()
      .from(schema.templateCostDefaults)
      .where(eq(schema.templateCostDefaults.templateVersionId, versionId))
      .orderBy(asc(schema.templateCostDefaults.sortOrder)),
    db
      .select()
      .from(schema.templateCheckRules)
      .where(eq(schema.templateCheckRules.templateVersionId, versionId))
      .orderBy(asc(schema.templateCheckRules.checkKey)),
    db
      .select()
      .from(schema.templateExecutionPresets)
      .where(eq(schema.templateExecutionPresets.templateVersionId, versionId))
      .orderBy(asc(schema.templateExecutionPresets.sortOrder)),
  ]);
  return {
    id: head.id,
    kind: head.kind,
    versionNumber: head.versionNumber,
    status: head.status,
    aiPrompt: head.aiPrompt,
    sections: sections.map((section) => ({
      ...toSectionNode(section),
      questions: questions
        .filter((q) => q.templateSectionId === section.id)
        .map((q) => toQuestionNode(q, section.key)),
    })),
    costDefaults: costDefaults.map((r) => ({
      id: r.id,
      category: r.category,
      key: r.key,
      name: r.name,
      sortOrder: r.sortOrder,
    })),
    checkRules: checkRules.map((r) => ({
      checkKey: r.checkKey,
      params: r.params as Record<string, number>,
    })),
    executionPresets: executionPresets.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      area: r.area,
      launchTiming: r.launchTiming,
      sortOrder: r.sortOrder,
    })),
  };
}

/**
 * AD2: copies a version into a new draft and returns the draft's id. The template row is locked
 * while the number is allocated (max + 1), so two requests cannot take the same number; the
 * partial unique index on drafts is the last guard and also reads as DRAFT_EXISTS.
 */
export async function createDraftFrom(tx: Tx, sourceId: string): Promise<string> {
  const source = await loadVersionHead(tx, sourceId);
  await tx
    .select({ id: schema.templates.id })
    .from(schema.templates)
    .where(eq(schema.templates.id, source.templateId))
    .for("update");
  const [draft] = await tx
    .select({ id: schema.templateVersions.id })
    .from(schema.templateVersions)
    .where(
      and(
        eq(schema.templateVersions.templateId, source.templateId),
        eq(schema.templateVersions.status, "draft"),
      ),
    );
  if (draft) throw new ApiError("DRAFT_EXISTS", "A draft already exists for this template");
  const [max] = await tx
    .select({ n: sql<number>`coalesce(max(${schema.templateVersions.versionNumber}), 0)::int` })
    .from(schema.templateVersions)
    .where(eq(schema.templateVersions.templateId, source.templateId));
  const [created] = await tx
    .insert(schema.templateVersions)
    .values({
      templateId: source.templateId,
      versionNumber: (max?.n ?? 0) + 1,
      status: "draft",
      aiPrompt: source.aiPrompt,
    })
    .returning({ id: schema.templateVersions.id });
  const draftId = (created as { id: string }).id;

  const sections = await tx
    .select()
    .from(schema.templateSections)
    .where(eq(schema.templateSections.templateVersionId, sourceId));
  const sectionIds = new Map<string, string>();
  if (sections.length > 0) {
    const inserted = await tx
      .insert(schema.templateSections)
      .values(
        sections.map((s) => ({
          templateVersionId: draftId,
          key: s.key,
          part: s.part,
          title: s.title,
          guidance: s.guidance,
          sortOrder: s.sortOrder,
        })),
      )
      .returning({ id: schema.templateSections.id, key: schema.templateSections.key });
    const byKey = new Map(inserted.map((r) => [r.key, r.id]));
    for (const s of sections) sectionIds.set(s.id, byKey.get(s.key) as string);
  }
  const questions = await tx
    .select()
    .from(schema.templateQuestions)
    .where(eq(schema.templateQuestions.templateVersionId, sourceId));
  if (questions.length > 0) {
    await tx.insert(schema.templateQuestions).values(
      questions.map((q) => ({
        templateVersionId: draftId,
        templateSectionId: sectionIds.get(q.templateSectionId) as string,
        questionKey: q.questionKey,
        title: q.title,
        prompt: q.prompt,
        example: q.example,
        hint: q.hint,
        answerType: q.answerType,
        options: q.options,
        displayCondition: q.displayCondition,
        hasFau: q.hasFau,
        copyFrom: q.copyFrom,
        reference: q.reference,
        sortOrder: q.sortOrder,
      })),
    );
  }
  const costDefaults = await tx
    .select()
    .from(schema.templateCostDefaults)
    .where(eq(schema.templateCostDefaults.templateVersionId, sourceId));
  if (costDefaults.length > 0) {
    await tx.insert(schema.templateCostDefaults).values(
      costDefaults.map((r) => ({
        templateVersionId: draftId,
        category: r.category,
        key: r.key,
        name: r.name,
        sortOrder: r.sortOrder,
      })),
    );
  }
  const checkRules = await tx
    .select()
    .from(schema.templateCheckRules)
    .where(eq(schema.templateCheckRules.templateVersionId, sourceId));
  if (checkRules.length > 0) {
    await tx.insert(schema.templateCheckRules).values(
      checkRules.map((r) => ({
        templateVersionId: draftId,
        checkKey: r.checkKey,
        params: r.params,
      })),
    );
  }
  const presets = await tx
    .select()
    .from(schema.templateExecutionPresets)
    .where(eq(schema.templateExecutionPresets.templateVersionId, sourceId));
  if (presets.length > 0) {
    await tx.insert(schema.templateExecutionPresets).values(
      presets.map((r) => ({
        templateVersionId: draftId,
        type: r.type,
        title: r.title,
        area: r.area,
        launchTiming: r.launchTiming,
        sortOrder: r.sortOrder,
      })),
    );
  }
  return draftId;
}
