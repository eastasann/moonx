import { executionItems } from "@moonx/db";
import { type ExecutionType, executionTypeOfSectionKey } from "@moonx/schemas";
import { and, type Column, eq, inArray, or, type SQL, sql } from "drizzle-orm";

/** The columns of `comments` and `change_history` a screen's sections pick rows by. */
interface SectionColumns {
  sectionKey: Column;
  targetType: Column;
  targetId: Column;
}

/**
 * The rows of a screen in `sectionKeys` (SDD 6.3「画面と節の対応」): a key is the rows'
 * `section_key`; on a plan's screen, `execution:{type}` is the plan's execution items of
 * that type, whose rows keep 22's key `execution` (21 lists the items of its execution
 * sub-items). Deleted items count: their changes are undone from the list.
 */
export function inSections(
  columns: SectionColumns,
  container: { type: string; id: string },
  sectionKeys: readonly string[],
): SQL {
  const keys: string[] = [];
  const types: ExecutionType[] = [];
  for (const key of sectionKeys) {
    const type =
      container.type === "business_plan"
        ? executionTypeOfSectionKey(key)
        : undefined;
    if (type === undefined) keys.push(key);
    else types.push(type);
  }
  const conditions = [
    ...(keys.length > 0 ? [inArray(columns.sectionKey, keys)] : []),
    ...(types.length > 0
      ? [
          and(
            eq(columns.sectionKey, "execution"),
            eq(columns.targetType, "execution_item"),
            inArray(
              columns.targetId,
              sql`(select ${executionItems.id} from ${executionItems} where ${executionItems.businessPlanId} = ${container.id} and ${inArray(executionItems.type, types)})`,
            ),
          ) as SQL,
        ]
      : []),
  ];
  return conditions.length === 0 ? sql`false` : (or(...conditions) as SQL);
}
