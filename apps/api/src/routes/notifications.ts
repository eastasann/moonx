import { schema } from "@moonx/db";
import { listNotificationsQuerySchema } from "@moonx/schemas";
import { and, count, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AppContext } from "../context";
import { ApiError } from "../errors";
import { listNotifications } from "../lib/notification-dto";
import { authPlugin } from "../plugins";

/** N1-N3 (SDD 5.11). A person only ever reaches their own notifications, in every workspace. */
export function notificationRoutes(ctx: AppContext) {
  const { db } = ctx;
  const table = schema.notifications;
  return new Elysia({ name: "moonx-notifications" })
    .use(authPlugin(ctx))
    .get(
      "/notifications",
      ({ query, user }) =>
        listNotifications(db, user.id, {
          filter: query.filter,
          cursor: query.cursor,
          limit: query.limit,
        }),
      { query: listNotificationsQuerySchema },
    )
    .get("/notifications/unread-count", async ({ user }) => {
      const [row] = await db
        .select({ total: count() })
        .from(table)
        .where(and(eq(table.userId, user.id), isNull(table.readAt)));
      return { total: row?.total ?? 0 };
    })
    .post("/notifications/read-all", async ({ user, set }) => {
      await db
        .update(table)
        .set({ readAt: ctx.now() })
        .where(and(eq(table.userId, user.id), isNull(table.readAt)));
      set.status = 204;
    })
    .post(
      "/notifications/:id/read",
      async ({ params, user, set }) => {
        const [row] = await db
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.id, params.id), eq(table.userId, user.id)));
        if (!row) throw new ApiError("NOT_FOUND", "Notification not found");
        await db
          .update(table)
          .set({ readAt: ctx.now() })
          .where(and(eq(table.id, params.id), isNull(table.readAt)));
        set.status = 204;
      },
      { params: z.object({ id: z.uuid() }) },
    );
}
