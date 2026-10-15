import type { executionItems } from "./schema";

type ExecutionItemFields = Pick<
  typeof executionItems.$inferInsert,
  | "type"
  | "title"
  | "assigneeUserId"
  | "assigneeName"
  | "dueDate"
  | "status"
  | "goal"
  | "exitCondition"
  | "launchTiming"
  | "actions"
  | "completionCriteria"
  | "kpiArea"
  | "kpiTarget"
  | "kpiReviewFrequency"
  | "kpiActual"
  | "whyItMatters"
  | "answer"
>;

/**
 * What the change history's `before` and `after`, and a plan version's snapshot, hold of
 * an execution item (ADR-020): the fields a person edits, without ids, order, lock
 * version or timestamps. The seed and the API write it the same way, so the history
 * panel and H2 read one shape.
 */
export const executionItemContent = (item: ExecutionItemFields) => ({
  type: item.type,
  title: item.title,
  assigneeUserId: item.assigneeUserId ?? null,
  assigneeName: item.assigneeName ?? null,
  dueDate: item.dueDate ?? null,
  status: item.status ?? null,
  goal: item.goal ?? null,
  exitCondition: item.exitCondition ?? null,
  launchTiming: item.launchTiming ?? null,
  actions: item.actions ?? null,
  completionCriteria: item.completionCriteria ?? null,
  kpiArea: item.kpiArea ?? null,
  kpiTarget: item.kpiTarget ?? null,
  kpiReviewFrequency: item.kpiReviewFrequency ?? null,
  kpiActual: item.kpiActual ?? null,
  whyItMatters: item.whyItMatters ?? null,
  answer: item.answer ?? null,
});
