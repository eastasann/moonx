import { schema } from "@moonx/db";
import {
  researchLogInputSchema,
  researchLogQuerySchema,
  updateResearchLogBodySchema,
} from "@moonx/schemas";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AppContext } from "../../context";
import { ApiError } from "../../errors";
import { historyActor } from "../../lib/dto";
import { decodeCursor, toPage } from "../../lib/page";
import { requireWritable, resolveScope } from "../../lib/scope";
import { loadValidationData } from "../../lib/validation-data";
import {
  deleteResearchLog,
  insertResearchLog,
  loadEvidenceUsages,
  toResearchLogEntries,
  updateResearchLog,
} from "../../lib/validation-research-log";
import { touchValidationActivity } from "../../lib/validation-write";
import { authPlugin } from "../../plugins";

const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

/** V6 and V7 (SDD 5.7). */
export function researchLogRoutes(ctx: AppContext) {
  const { db } = ctx;
  const entryParams = z.object({ entryId: z.uuid() });
  const writeContext = (
    scope: { workspaceId: string; ideaId: string | null; validationId: string | null },
    request: Request,
    user: { id: string },
  ) => ({
    workspaceId: scope.workspaceId,
    ideaId: scope.ideaId as string,
    validationId: scope.validationId as string,
    actor: historyActor(request, user),
    now: ctx.now(),
  });

  return new Elysia({ name: "moonx-validation-research-log" })
    .use(authPlugin(ctx))
    .get(
      "/validations/:validationId/research-log",
      async ({ params, query, user }) => {
        const scope = await resolveScope(db, user, { validationId: params.validationId });
        const offset = decodeCursor(query.cursor);
        const pattern = query.q ? `%${escapeLike(query.q)}%` : null;
        const rows = await db
          .select()
          .from(schema.researchLogEntries)
          .where(
            and(
              eq(schema.researchLogEntries.validationId, params.validationId),
              isNull(schema.researchLogEntries.deletedAt),
              query.supports
                ? sql`${query.supports} = any(${schema.researchLogEntries.supportsChecks})`
                : undefined,
              query.sourceType
                ? eq(schema.researchLogEntries.sourceType, query.sourceType)
                : undefined,
              pattern
                ? or(
                    ilike(schema.researchLogEntries.topic, pattern),
                    ilike(schema.researchLogEntries.observation, pattern),
                  )
                : undefined,
            ),
          )
          .orderBy(
            sql`${schema.researchLogEntries.observedOn} desc nulls last`,
            desc(schema.researchLogEntries.createdAt),
            desc(schema.researchLogEntries.id),
          )
          .limit(query.limit + 1)
          .offset(offset);
        const page = toPage(rows, offset, query.limit);
        return {
          items: await toResearchLogEntries(db, scope.workspaceId, page.items),
          nextCursor: page.nextCursor,
        };
      },
      { params: z.object({ validationId: z.uuid() }), query: researchLogQuerySchema },
    )
    .post(
      "/validations/:validationId/research-log",
      async ({ params, body, user, request, set }) => {
        const scope = await resolveScope(db, user, { validationId: params.validationId });
        requireWritable(scope);
        const write = writeContext(scope, request, user);
        const row = await db.transaction(async (tx) => {
          const created = await insertResearchLog(tx, { ...write, input: body });
          await touchValidationActivity(tx, write, write.now);
          return created;
        });
        set.status = 201;
        return (await toResearchLogEntries(db, scope.workspaceId, [row]))[0];
      },
      { params: z.object({ validationId: z.uuid() }), body: researchLogInputSchema },
    )
    .get(
      "/research-log/:entryId",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { researchLogId: params.entryId });
        const validationId = scope.validationId as string;
        const [row] = await db
          .select()
          .from(schema.researchLogEntries)
          .where(
            and(
              eq(schema.researchLogEntries.id, params.entryId),
              eq(schema.researchLogEntries.validationId, validationId),
              isNull(schema.researchLogEntries.deletedAt),
            ),
          );
        const data = (await loadValidationData(db, [validationId])).get(validationId);
        if (!row || !data) throw new ApiError("NOT_FOUND", "Resource not found");
        const [entry] = await toResearchLogEntries(db, scope.workspaceId, [row]);
        const usages = await loadEvidenceUsages(
          db,
          data,
          { workspaceId: scope.workspaceId, ideaId: scope.ideaId as string },
          row.id,
        );
        return { ...entry, usages };
      },
      { params: entryParams },
    )
    .patch(
      "/research-log/:entryId",
      async ({ params, body, user, request }) => {
        const scope = await resolveScope(db, user, { researchLogId: params.entryId });
        requireWritable(scope);
        return db.transaction((tx) =>
          updateResearchLog(tx, writeContext(scope, request, user), params.entryId, body),
        );
      },
      { params: entryParams, body: updateResearchLogBodySchema },
    )
    .delete(
      "/research-log/:entryId",
      async ({ params, user, request }) => {
        const scope = await resolveScope(db, user, { researchLogId: params.entryId });
        requireWritable(scope);
        const affected = await db.transaction((tx) =>
          deleteResearchLog(tx, writeContext(scope, request, user), params.entryId),
        );
        return { affected };
      },
      { params: entryParams },
    );
}
