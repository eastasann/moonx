import {
  assumptions,
  businessPlans,
  competitors,
  costItems,
  type Database,
  type DatabaseTransaction,
  executionItems,
  ideas,
  researchLogEntries,
  risks,
  selfAnalyses,
  templateQuestions,
  validations,
} from "@moonx/db";
import { i18n } from "@moonx/i18n";
import { fitWithSuffix, type TargetRef } from "@moonx/schemas";
import { and, inArray } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { itemKey } from "./validation-items";

type Executor = Database | DatabaseTransaction;

/**
 * The longest row text a label quotes, in characters: a label names the item in one
 * line (a dashboard row, a history entry), and statements may run to 20,000.
 */
const LABEL_TEXT_MAX = 80;

const quote = (text: string) =>
  fitWithSuffix(text, "", LABEL_TEXT_MAX) === text
    ? text
    : fitWithSuffix(text, "…", LABEL_TEXT_MAX);

const rowLabel = (type: TargetRef["type"], text: string | null) =>
  i18n.t("common:itemLabel.row", {
    list: i18n.t(`common:itemLabel.list.${type as "competitor"}`),
    text:
      text === null || text.trim() === ""
        ? i18n.t("common:itemLabel.untitled")
        : quote(text),
  });

/** The section and title of a question: "01 WHO", "01 What is the business?". */
const questionLabel = (key: string, title: string | undefined) =>
  i18n.t("common:itemLabel.question", {
    section: key.split(".")[1] ?? "",
    // A question the pinned version no longer has (a migration hid it) by its ID.
    title: title ?? key.split(".").slice(2).join("."),
  });

async function namesOf(
  db: Executor,
  table: PgTable & { id: AnyPgColumn },
  column: AnyPgColumn,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: table.id, name: column })
    .from(table)
    .where(inArray(table.id, [...ids]));
  return new Map(rows.map((row) => [String(row.id), String(row.name)]));
}

/** The template version each question container pins, by the container's id. */
async function pinnedVersions(
  db: Executor,
  targets: readonly TargetRef[],
): Promise<Map<string, string>> {
  const idsOf = (type: TargetRef["type"]) => [
    ...new Set(targets.filter((t) => t.type === type).map((t) => t.id)),
  ];
  const pinned = new Map<string, string>();
  const read = async (
    table: typeof validations | typeof businessPlans | typeof selfAnalyses,
    ids: string[],
  ) => {
    if (ids.length === 0) return;
    const rows = await db
      .select({ id: table.id, versionId: table.templateVersionId })
      .from(table as typeof validations)
      .where(inArray(table.id, ids));
    for (const row of rows) pinned.set(row.id, row.versionId);
  };
  await read(validations, idsOf("validation_answer"));
  await read(businessPlans, idsOf("plan_answer"));
  await read(selfAnalyses, idsOf("self_analysis_answer"));
  return pinned;
}

/**
 * The label of each of `targets` (SDD 5.2 HistoryEntry `label`, 5.6 Activity
 * `summary`), in English from the catalog: a question by its section and title ("01
 * WHO"), a row by its list and text ("Costs · Rent"), a number by "Unit Economics" and
 * its field, an idea or plan by its name. Deleted rows keep their label.
 */
export async function loadItemLabels(
  db: Executor,
  targets: readonly TargetRef[],
): Promise<(target: TargetRef) => string> {
  const ids = (type: TargetRef["type"]) => [
    ...new Set(targets.filter((t) => t.type === type).map((t) => t.id)),
  ];
  const names = {
    research_log_entry: await namesOf(
      db,
      researchLogEntries,
      researchLogEntries.topic,
      ids("research_log_entry"),
    ),
    competitor: await namesOf(
      db,
      competitors,
      competitors.name,
      ids("competitor"),
    ),
    assumption: await namesOf(
      db,
      assumptions,
      assumptions.statement,
      ids("assumption"),
    ),
    risk: await namesOf(db, risks, risks.statement, ids("risk")),
    cost_item: await namesOf(db, costItems, costItems.name, ids("cost_item")),
    execution_item: await namesOf(
      db,
      executionItems,
      executionItems.title,
      ids("execution_item"),
    ),
    idea: await namesOf(db, ideas, ideas.name, ids("idea")),
    business_plan: await namesOf(
      db,
      businessPlans,
      businessPlans.name,
      ids("business_plan"),
    ),
  };

  const pinned = await pinnedVersions(db, targets);
  const questions = targets.filter(
    (t) =>
      t.type === "validation_answer" ||
      t.type === "plan_answer" ||
      t.type === "self_analysis_answer",
  );
  const titles = new Map<string, string>();
  const versionIds = [...new Set(pinned.values())];
  const keys = [...new Set(questions.map((t) => t.key ?? ""))];
  if (versionIds.length > 0 && keys.length > 0) {
    const rows = await db
      .select({
        versionId: templateQuestions.templateVersionId,
        key: templateQuestions.questionKey,
        title: templateQuestions.title,
      })
      .from(templateQuestions)
      .where(
        and(
          inArray(templateQuestions.templateVersionId, versionIds),
          inArray(templateQuestions.questionKey, keys),
        ),
      );
    for (const row of rows)
      titles.set(`${row.versionId}/${row.key}`, row.title);
  }

  const labels = new Map<string, string>();
  for (const target of targets) {
    labels.set(itemKey(target), labelOf(target));
  }
  return (target) => labels.get(itemKey(target)) ?? labelOf(target);

  function labelOf(target: TargetRef): string {
    switch (target.type) {
      case "validation_answer":
      case "plan_answer":
      case "self_analysis_answer": {
        const key = target.key ?? "";
        return questionLabel(
          key,
          titles.get(`${pinned.get(target.id) ?? ""}/${key}`),
        );
      }
      case "economics_input":
        return rowLabel(
          target.type,
          i18n.t(
            `common:economicsField.${(target.key ?? "") as "selling_price"}`,
          ),
        );
      case "pitch_slide":
        return i18n.t("common:itemLabel.list.pitch_slide");
      case "template_version":
        return i18n.t("common:itemLabel.templateVersion");
      case "idea":
      case "business_plan":
        return names[target.type].get(target.id) ?? "";
      default:
        return rowLabel(target.type, names[target.type].get(target.id) ?? null);
    }
  }
}
