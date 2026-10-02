import { Elysia } from "elysia";
import { z } from "zod";
import { accessPlugin } from "../../access";
import type { AppContext } from "../../context";

import { loadValidationHome } from "../../lib/validation-home";

/** V1 (SDD 5.7). */
export function validationHomeRoutes(ctx: AppContext) {
  const { db } = ctx;
  return new Elysia({ name: "moonx-validation-home" }).use(accessPlugin(ctx)).get(
    "/ideas/:ideaId/validation",
    async ({ params, scope }) => {
      return loadValidationHome(db, {
        workspaceId: scope.workspaceId,
        ideaId: params.ideaId,
      });
    },
    {
      params: z.object({ ideaId: z.uuid() }),
      scoped: { to: { ideaId: "ideaId" }, need: "member" },
    },
  );
}
