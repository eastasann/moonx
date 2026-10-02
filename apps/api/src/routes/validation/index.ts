import { Elysia } from "elysia";
import type { AppContext } from "../../context";
import { validationAnswerRoutes } from "./answers";
import { costRoutes } from "./costs";
import { decisionRoutes } from "./decisions";
import { validationHomeRoutes } from "./home";
import { researchLogRoutes } from "./research-log";
import { validationTableRoutes } from "./tables";

/** V1-V19 (SDD 5.7). */
export function validationRoutes(ctx: AppContext) {
  return new Elysia({ name: "moonx-validation" })
    .use(validationHomeRoutes(ctx))
    .use(validationAnswerRoutes(ctx))
    .use(researchLogRoutes(ctx))
    .use(validationTableRoutes(ctx))
    .use(costRoutes(ctx))
    .use(decisionRoutes(ctx));
}
