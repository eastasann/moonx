import { schema } from "@moonx/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { assertSameIds } from "./cost-order";
import type { Tx } from "./db";

const tables = {
  competitors: schema.competitors,
  assumptions: schema.assumptions,
  risks: schema.risks,
} as const;

/**
 * Rewrites `sort_order` 0..n-1 of competitors, assumptions or risks (V17). For risks this is the
 * switch from the automatic order to a manual one: every risk gets a number. Like
 * `reorderCostItems`, it leaves `lockVersion` and `updated_at` alone and writes no history.
 */
export async function reorderListRows(
  tx: Tx,
  validationId: string,
  list: keyof typeof tables,
  ids: string[],
): Promise<void> {
  const table = tables[list];
  const rows = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.validationId, validationId), isNull(table.deletedAt)));
  assertSameIds(
    rows.map((r) => r.id),
    ids,
  );
  for (const [index, id] of ids.entries()) {
    await tx
      .update(table)
      .set({ sortOrder: index, updatedAt: sql`${table.updatedAt}` })
      .where(and(eq(table.id, id), eq(table.validationId, validationId)));
  }
}
