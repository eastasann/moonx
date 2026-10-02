import { schema } from "@moonx/db";
import {
  historyBatchParamsSchema,
  historyEntryParamsSchema,
  historyQuerySchema,
} from "@moonx/schemas";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import type { z } from "zod";
import { type AccessInput, accessPlugin } from "../access";
import type { AppContext } from "../context";
import { toHistoryEntries } from "../lib/history-dto";
import { batchScopeRef, entryScopeRef, revertBatch, revertEntry } from "../lib/history-revert";
import { containerAccess, containerOfTarget, containerScopeRef } from "../lib/history-target";
import { decodeCursor, toPage } from "../lib/page";

type HistoryQuery = z.infer<typeof historyQuerySchema>;

/** H1-H3 (SDD 5.11): the change history of an item or a screen, and taking changes back. */
export function historyRoutes(ctx: AppContext) {
  const { db } = ctx;
  const c = schema.changeHistory;

  /** The container the query names, directly or through the item it asks about. */
  const containerOf = (query: HistoryQuery) =>
    query.targetType != null
      ? containerOfTarget(db, {
          type: query.targetType,
          id: query.targetId as string,
          key: query.targetKey,
        })
      : Promise.resolve({
          type: query.containerType as NonNullable<typeof query.containerType>,
          id: query.containerId as string,
        });

  return new Elysia({ name: "moonx-history" })
    .use(accessPlugin(ctx))
    .get(
      "/history",
      async ({ query, user, scope }) => {
        const item = query.targetType != null;
        const container = await containerOf(query as HistoryQuery);
        const access = containerAccess(user, container.type, container.id, scope);
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
      {
        query: historyQuerySchema,
        located: {
          to: async ({ query, user }: AccessInput) => {
            const container = await containerOf(query as HistoryQuery);
            return containerScopeRef(db, user, container.type, container.id);
          },
          need: "member",
        },
      },
    )
    .post(
      "/history/:entryId/revert",
      ({ params, user, scope, request }) =>
        revertEntry(db, { user, scope, request, now: ctx.now() }, params.entryId),
      {
        params: historyEntryParamsSchema,
        located: {
          to: ({ params, user }: AccessInput) => entryScopeRef(db, user, params.entryId),
          need: "writable",
        },
      },
    )
    .post(
      "/history/batches/:batchId/revert",
      ({ params, user, scope, request }) =>
        revertBatch(db, { user, scope, request, now: ctx.now() }, params.batchId),
      {
        params: historyBatchParamsSchema,
        located: {
          to: ({ params, user }: AccessInput) => batchScopeRef(db, user, params.batchId),
          need: "writable",
        },
      },
    );
}
