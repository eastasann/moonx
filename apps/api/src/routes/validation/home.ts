import { Elysia } from "elysia";
import { z } from "zod";
import type { AppContext } from "../../context";
import { resolveScope } from "../../lib/scope";
import { loadValidationHome } from "../../lib/validation-home";
import { authPlugin } from "../../plugins";

/** V1 (SDD 5.7). */
export function validationHomeRoutes(ctx: AppContext) {
  const { db } = ctx;
  return new Elysia({ name: "moonx-validation-home" }).use(authPlugin(ctx)).get(
    "/ideas/:ideaId/validation",
    async ({ params, user }) => {
      const scope = await resolveScope(db, user, { ideaId: params.ideaId });
      return loadValidationHome(db, {
        workspaceId: scope.workspaceId,
        ideaId: params.ideaId,
      });
    },
    { params: z.object({ ideaId: z.uuid() }) },
  );
}
