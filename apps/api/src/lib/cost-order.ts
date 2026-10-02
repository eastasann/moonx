import { schema } from "@moonx/db";
import type { CostCategory } from "@moonx/schemas";
import { and, eq, isNull, sql } from "drizzle-orm";
import { validationFailed } from "../errors";
import type { Tx } from "./db";

/**
 * 422 unless `sent` is exactly the ids in `current`, each once. A list that was edited by
 * someone else in the meantime is refused, so a stale drag never drops or resurrects a row.
 */
export function assertSameIds(current: string[], sent: string[]): void {
  const known = new Set(current);
  const unique = new Set(sent);
  if (
    unique.size !== sent.length ||
    sent.length !== known.size ||
    sent.some((id) => !known.has(id))
  ) {
    throw validationFailed([
      { path: "ids", code: "invalid_value", message: "Must list every current row exactly once" },
    ]);
  }
}

/**
 * Rewrites `sort_order` of one cost table (V17). `lockVersion` and `updated_at` stay as they are:
 * a reorder is last-writer-wins and is not an edit of the rows, so nobody's open form conflicts
 * and the "last edited" line does not move. No history row is written (SDD 5.7 V17).
 */
export async function reorderCostItems(
  tx: Tx,
  validationId: string,
  category: CostCategory,
  ids: string[],
): Promise<void> {
  const rows = await tx
    .select({ id: schema.costItems.id })
    .from(schema.costItems)
    .where(
      and(
        eq(schema.costItems.validationId, validationId),
        eq(schema.costItems.category, category),
        isNull(schema.costItems.deletedAt),
      ),
    );
  assertSameIds(
    rows.map((r) => r.id),
    ids,
  );
  for (const [index, id] of ids.entries()) {
    await tx
      .update(schema.costItems)
      .set({ sortOrder: index, updatedAt: sql`${schema.costItems.updatedAt}` })
      .where(and(eq(schema.costItems.id, id), eq(schema.costItems.validationId, validationId)));
  }
}
