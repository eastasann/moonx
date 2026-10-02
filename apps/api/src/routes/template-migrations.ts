import { templateMigrationBodySchema, templateMigrationQuerySchema } from "@moonx/schemas";
import { Elysia } from "elysia";
import { type AccessInput, accessPlugin } from "../access";
import type { AppContext } from "../context";
import { containerScopeRef } from "../lib/history-target";
import { migrateTemplate, previewTemplateMigration } from "../lib/template-migration";

/** T1 and T2 (SDD 5.12): moving a self analysis, validation or plan to a newer template version. */
export function templateMigrationRoutes(ctx: AppContext) {
  const { db } = ctx;
  return new Elysia({ name: "moonx-template-migrations" })
    .use(accessPlugin(ctx))
    .get(
      "/template-migrations/preview",
      ({ query, user, scope }) =>
        previewTemplateMigration(db, user, query.targetType, query.targetId, scope),
      {
        query: templateMigrationQuerySchema,
        located: {
          to: ({ query, user }: AccessInput) =>
            containerScopeRef(db, user, query.targetType, query.targetId),
          need: "editor",
        },
      },
    )
    .post(
      "/template-migrations",
      ({ body, user, scope, request }) =>
        migrateTemplate(db, { user, scope, request, now: ctx.now() }, body),
      {
        body: templateMigrationBodySchema,
        located: {
          to: ({ body, user }: AccessInput) =>
            containerScopeRef(db, user, body.targetType, body.targetId),
          need: "writable",
        },
      },
    );
}
