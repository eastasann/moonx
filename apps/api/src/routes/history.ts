import { schema } from "@moonx/db";
import {
  historyBatchParamsSchema,
  historyEntryParamsSchema,
  historyQuerySchema,
} from "@moonx/schemas";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import type { AppContext } from "../context";
import { toHistoryEntries } from "../lib/history-dto";
import { revertBatch, revertEntry } from "../lib/history-revert";
import { containerOfTarget, resolveContainer } from "../lib/history-target";
import { decodeCursor, toPage } from "../lib/page";
import { authPlugin } from "../plugins";

/** H1-H3 (SDD 5.11): the change history of an item or a screen, and taking changes back. */
export function historyRoutes(ctx: AppContext) {
  const { db } = ctx;
  const c = schema.changeHistory;
  return new Elysia({ name: "moonx-history" })
    .use(authPlugin(ctx))
    .get(
      "/history",
      async ({ query, user }) => {
        const item = query.targetType != null;
        const container = item
          ? await containerOfTarget(db, {
              type: query.targetType as NonNullable<typeof query.targetType>,
              id: query.targetId as string,
              key: query.targetKey,
            })
          : {
              type: query.containerType as NonNullable<typeof query.containerType>,
              id: query.containerId as string,
            };
        const access = await resolveContainer(db, user, container.type, container.id);
        const offset = decodeCursor(query.cursor);
        const rows = await db
          .select()
          .from(c)
          .where(
            and(
              eq(c.containerType, container.type),
              eq(c.containerId, container.id),
              item
                ? eq(c.targetType, query.targetType as NonNullable<typeof query.targetType>)
                : undefined,
              item ? eq(c.targetId, query.targetId as string) : undefined,
              item
                ? query.targetKey
                  ? eq(c.targetKey, query.targetKey)
                  : isNull(c.targetKey)
                : undefined,
              !item && query.sectionKey ? eq(c.sectionKey, query.sectionKey) : undefined,
            ),
          )
          .orderBy(desc(c.changedAt), desc(c.id))
          .limit(query.limit + 1)
          .offset(offset);
        const page = toPage(rows, offset, query.limit);
        return {
          items: await toHistoryEntries(db, access, page.items),
          nextCursor: page.nextCursor,
        };
      },
      { query: historyQuerySchema },
    )
    .post(
      "/history/:entryId/revert",
      ({ params, user, request }) =>
        revertEntry(db, { user, request, now: ctx.now() }, params.entryId),
      { params: historyEntryParamsSchema },
    )
    .post(
      "/history/batches/:batchId/revert",
      ({ params, user, request }) =>
        revertBatch(db, { user, request, now: ctx.now() }, params.batchId),
      { params: historyBatchParamsSchema },
    );
}
