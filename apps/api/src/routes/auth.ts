import { Elysia } from "elysia";
import type { AppContext } from "../context";
import { ApiError } from "../errors";

/**
 * A1-A8 (SDD 5.3): Better Auth answers everything under `/api/auth` in its own response format.
 * The photo route exists only where photos are on disk (local, tests); elsewhere they are public
 * objects in Cloud Storage and `readLocal` is absent.
 * The base plugin reads the body as text on this path and the handler hands it on unchanged.
 */
export function authRoutes(ctx: AppContext) {
  return new Elysia({ name: "moonx-auth-routes" })
    .all("/api/auth/*", ({ request, body }) => {
      // The base plugin already read the stream, so the request Better Auth sees is rebuilt.
      const text = typeof body === "string" && body !== "" ? body : undefined;
      return ctx.auth.handler(
        new Request(request.url, { method: request.method, headers: request.headers, body: text }),
      );
    })
    .get("/api/avatars/:name", async ({ params }) => {
      const photo = await ctx.avatars.readLocal?.(params.name);
      if (!photo) throw new ApiError("NOT_FOUND", "No such photo");
      return new Response(photo, {
        headers: {
          "content-type": "image/webp",
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    });
}
