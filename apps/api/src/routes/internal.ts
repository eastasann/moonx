import { dueNotificationsResultSchema } from "@moonx/schemas";
import { Elysia } from "elysia";
import type { AppContext } from "../context";
import { ApiError } from "../errors";
import { processDueNotifications } from "../lib/due-notifications";
import { googleKeySource, type OidcKeySource, verifyOidcToken } from "../lib/oidc";

/**
 * Z3 (SDD 5.14). Mounted at `/internal/cron`, outside `/api/v1` and outside the Worker's shared
 * secret: the caller is Cloud Scheduler, and the OIDC token is the only credential.
 */
export function internalRoutes(ctx: AppContext, keys: OidcKeySource = googleKeySource()) {
  const { oidcAudience, invokerEmail } = ctx.config.cron;
  return new Elysia({ name: "moonx-internal", prefix: "/internal/cron" }).post(
    "/due-notifications",
    async ({ request }) => {
      if (!oidcAudience || !invokerEmail) {
        ctx.logger.log(
          "error",
          "cron is not configured: CRON_OIDC_AUDIENCE and CRON_INVOKER_EMAIL",
        );
        throw new ApiError("FORBIDDEN", "The cron endpoint is not configured");
      }
      const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
      if (!token) throw new ApiError("UNAUTHENTICATED", "A bearer token is required");
      await verifyOidcToken(
        token,
        { audience: oidcAudience, email: invokerEmail },
        keys,
        ctx.now(),
      );
      return processDueNotifications(ctx);
    },
    { response: { 200: dueNotificationsResultSchema } },
  );
}
