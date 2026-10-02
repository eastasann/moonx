import { schema } from "@moonx/db";
import { isQuestionKeyOf, parseQuestionKey, QUESTION_KEY_PREFIX } from "@moonx/domain";
import type { TemplateValidation } from "@moonx/schemas";
import { and, desc, eq, lt } from "drizzle-orm";
import { loadVersionDetail, loadVersionHead } from "./admin-template";
import type { Executor } from "./db";

type Issue = TemplateValidation["errors"][number];

/** Options the answer type needs: `kind` of QuestionOptions per answer type (SDD 5.2). */
const OPTIONS_KIND: Partial<Record<string, string>> = {
  choice: "choice",
  table: "table",
  linked_metric: "linked_metric",
  execution_view: "execution_view",
};

/**
 * AD6 validate: what blocks a publish (errors) and what the operator should know first
 * (`removed_keys`: question IDs of the previous published version that this one no longer has,
 * whose answers a migration cannot carry over). Reads only; also usable on a published version.
 */
export async function validateVersion(
  db: Executor,
  versionId: string,
): Promise<TemplateValidation> {
  const detail = await loadVersionDetail(db, versionId);
  const errors: Issue[] = [];
  const questions = detail.sections.flatMap((s) => s.questions.map((q) => ({ section: s, q })));
  const allKeys = new Set(questions.map(({ q }) => q.key));
  const seen = new Map<string, string>();

  if (questions.length === 0) {
    errors.push({ code: "no_questions", message: "The template has no questions", nodeId: null });
  }
  for (const section of detail.sections) {
    const isPlan = detail.kind === "business_plan";
    if (isPlan !== (section.part !== null)) {
      errors.push({
        code: "invalid_part",
        message: isPlan
          ? `Section ${section.key} needs Part A or B`
          : `Section ${section.key} must not have a part`,
        nodeId: section.id,
      });
    }
  }
  for (const { section, q } of questions) {
    if (!isQuestionKeyOf(detail.kind, q.key)) {
      errors.push({
        code: "invalid_question_key",
        message: `Question ID ${q.key} must look like ${QUESTION_KEY_PREFIX[detail.kind]}.SECTION.KEY`,
        nodeId: q.id,
      });
    } else if (parseQuestionKey(q.key)?.section !== section.key) {
      errors.push({
        code: "question_key_section_mismatch",
        message: `Question ID ${q.key} does not belong to section ${section.key}`,
        nodeId: q.id,
      });
    }
    if (seen.has(q.key)) {
      errors.push({
        code: "duplicate_question_key",
        message: `Question ID ${q.key} is used twice`,
        nodeId: q.id,
      });
    }
    seen.set(q.key, q.id);
    const needed = OPTIONS_KIND[q.answerType] ?? null;
    if ((q.options?.kind ?? null) !== needed) {
      errors.push({
        code: "options_mismatch",
        message: needed
          ? `Question ${q.key} (${q.answerType}) needs ${needed} options`
          : `Question ${q.key} (${q.answerType}) takes no options`,
        nodeId: q.id,
      });
    }
    for (const referenced of Object.keys(q.displayCondition ?? {})) {
      if (!allKeys.has(referenced)) {
        errors.push({
          code: "unknown_condition_key",
          message: `Question ${q.key} shows only for ${referenced}, which does not exist`,
          nodeId: q.id,
        });
      }
    }
  }

  const head = await loadVersionHead(db, versionId);
  const [previous] = await db
    .select({ id: schema.templateVersions.id })
    .from(schema.templateVersions)
    .where(
      and(
        eq(schema.templateVersions.templateId, head.templateId),
        eq(schema.templateVersions.status, "published"),
        lt(schema.templateVersions.versionNumber, head.versionNumber),
      ),
    )
    .orderBy(desc(schema.templateVersions.versionNumber))
    .limit(1);
  const removed: string[] = [];
  if (previous) {
    const before = await db
      .select({ key: schema.templateQuestions.questionKey })
      .from(schema.templateQuestions)
      .where(eq(schema.templateQuestions.templateVersionId, previous.id));
    for (const { key } of before) if (!allKeys.has(key)) removed.push(key);
  }
  removed.sort();
  return {
    errors,
    warnings: removed.length > 0 ? [{ code: "removed_keys", keys: removed }] : [],
  };
}
