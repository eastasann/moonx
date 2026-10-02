import { schema } from "@moonx/db";
import { eq } from "drizzle-orm";
import type { Executor } from "./db";
import type { TemplateQuestionRow } from "./template";
import { loadTemplateSections } from "./template";

/** The question of the plan's pinned template version, or null. */
export async function findPlanQuestion(
  db: Executor,
  planId: string,
  questionKey: string,
): Promise<TemplateQuestionRow | null> {
  const [plan] = await db
    .select({ versionId: schema.businessPlans.templateVersionId })
    .from(schema.businessPlans)
    .where(eq(schema.businessPlans.id, planId));
  if (!plan) return null;
  const sectionKey = questionKey.split(".")[1];
  if (!sectionKey) return null;
  const [found] = await loadTemplateSections(db, plan.versionId, [sectionKey]);
  return found?.rows.find((q) => q.key === questionKey) ?? null;
}
