import { schema } from "@moonx/db";
import type { QuestionOptions, TemplateKind, TemplateRef, TemplateSection } from "@moonx/schemas";
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { ApiError } from "../errors";
import type { Executor } from "./db";

/** The newest published version of a template: what a new self analysis or plan is pinned to. */
export async function latestPublishedVersion(
  db: Executor,
  kind: TemplateKind,
): Promise<{ id: string; versionNumber: number }> {
  const [row] = await db
    .select({
      id: schema.templateVersions.id,
      versionNumber: schema.templateVersions.versionNumber,
    })
    .from(schema.templateVersions)
    .innerJoin(schema.templates, eq(schema.templates.id, schema.templateVersions.templateId))
    .where(and(eq(schema.templates.kind, kind), eq(schema.templateVersions.status, "published")))
    .orderBy(desc(schema.templateVersions.versionNumber))
    .limit(1);
  if (!row) throw new ApiError("INTERNAL", `No published ${kind} template`);
  return row;
}

/** SDD 5.2 TemplateRef of a pinned version, with the newer published version if there is one. */
export async function loadTemplateRef(db: Executor, versionId: string): Promise<TemplateRef> {
  const [pinned] = await db
    .select({
      versionNumber: schema.templateVersions.versionNumber,
      templateId: schema.templateVersions.templateId,
    })
    .from(schema.templateVersions)
    .where(eq(schema.templateVersions.id, versionId));
  if (!pinned) throw new ApiError("NOT_FOUND", "Resource not found");
  const [newer] = await db
    .select({
      versionId: schema.templateVersions.id,
      versionNumber: schema.templateVersions.versionNumber,
    })
    .from(schema.templateVersions)
    .where(
      and(
        eq(schema.templateVersions.templateId, pinned.templateId),
        eq(schema.templateVersions.status, "published"),
        gt(schema.templateVersions.versionNumber, pinned.versionNumber),
      ),
    )
    .orderBy(desc(schema.templateVersions.versionNumber))
    .limit(1);
  return { versionId, versionNumber: pinned.versionNumber, newerVersion: newer ?? null };
}

/** A question of a template version with the columns the screens and the checks read. */
export interface TemplateQuestionRow {
  id: string;
  key: string;
  sectionKey: string;
  title: string;
  prompt: string;
  example: string | null;
  hint: string | null;
  answerType: (typeof schema.templateQuestions.$inferSelect)["answerType"];
  options: QuestionOptions | null;
  displayCondition: Record<string, string[]> | null;
  hasFau: boolean;
  copyFrom: string[] | null;
  reference: unknown[] | null;
}

/** The sections of a version in order, each with its questions in order. `keys` limits the sections. */
export async function loadTemplateSections(
  db: Executor,
  templateVersionId: string,
  keys?: string[],
): Promise<{ section: TemplateSection; rows: TemplateQuestionRow[] }[]> {
  const sections = await db
    .select()
    .from(schema.templateSections)
    .where(
      and(
        eq(schema.templateSections.templateVersionId, templateVersionId),
        keys ? inArray(schema.templateSections.key, keys) : undefined,
      ),
    )
    .orderBy(asc(schema.templateSections.sortOrder));
  if (sections.length === 0) return [];
  const questions = await db
    .select()
    .from(schema.templateQuestions)
    .where(
      inArray(
        schema.templateQuestions.templateSectionId,
        sections.map((s) => s.id),
      ),
    )
    .orderBy(asc(schema.templateQuestions.sortOrder));
  return sections.map((section) => {
    const rows = questions
      .filter((q) => q.templateSectionId === section.id)
      .map(
        (q): TemplateQuestionRow => ({
          id: q.id,
          key: q.questionKey,
          sectionKey: section.key,
          title: q.title,
          prompt: q.prompt,
          example: q.example,
          hint: q.hint,
          answerType: q.answerType,
          options: q.options as QuestionOptions | null,
          displayCondition: q.displayCondition as Record<string, string[]> | null,
          hasFau: q.hasFau,
          copyFrom: q.copyFrom as string[] | null,
          reference: q.reference as unknown[] | null,
        }),
      );
    return {
      section: {
        key: section.key,
        part: section.part,
        title: section.title,
        guidance: section.guidance,
        questions: rows.map((r) => ({
          key: r.key,
          sectionKey: r.sectionKey,
          title: r.title,
          prompt: r.prompt,
          example: r.example,
          hint: r.hint,
          answerType: r.answerType,
          options: r.options,
          displayCondition: r.displayCondition,
          hasFau: r.hasFau,
        })),
      },
      rows,
    };
  });
}

/** The number and the AI conversation prompt of a template version (exported with every AI export). */
export async function loadTemplateVersionInfo(
  db: Executor,
  versionId: string,
): Promise<{ versionNumber: number; aiPrompt: string }> {
  const [row] = await db
    .select({
      versionNumber: schema.templateVersions.versionNumber,
      aiPrompt: schema.templateVersions.aiPrompt,
    })
    .from(schema.templateVersions)
    .where(eq(schema.templateVersions.id, versionId));
  if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
  return row;
}
