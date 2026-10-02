import { templateMigrationBodySchema, templateMigrationQuerySchema } from "@moonx/schemas";
import { Elysia } from "elysia";
import type { AppContext } from "../context";
import { migrateTemplate, previewTemplateMigration } from "../lib/template-migration";
import { authPlugin } from "../plugins";

/** T1 and T2 (SDD 5.12): moving a self analysis, validation or plan to a newer template version. */
export function templateMigrationRoutes(ctx: AppContext) {
  const { db } = ctx;
  return new Elysia({ name: "moonx-template-migrations" })
    .use(authPlugin(ctx))
    .get(
      "/template-migrations/preview",
      ({ query, user }) => previewTemplateMigration(db, user, query.targetType, query.targetId),
      { query: templateMigrationQuerySchema },
    )
    .post(
      "/template-migrations",
      ({ body, user, request }) => migrateTemplate(db, { user, request, now: ctx.now() }, body),
      { body: templateMigrationBodySchema },
    );
}
