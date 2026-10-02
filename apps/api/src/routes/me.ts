import { schema } from "@moonx/db";
import {
  avatarResponseSchema,
  deleteAccountBodySchema,
  meSchema,
  setPasswordBodySchema,
  updateMeBodySchema,
} from "@moonx/schemas";
import { and, eq, ne } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { accessPlugin } from "../access";
import type { AppContext } from "../context";
import { ApiError, validationFailed } from "../errors";
import {
  credentialHash,
  eraseAccount,
  expiredSessionCookies,
  loadMe,
  requireRecentSignIn,
} from "../lib/account";
import { AVATAR_MAX_BYTES, toAvatarWebp } from "../lib/avatar-image";
import { historyActor } from "../lib/dto";
import { reportable } from "../lib/error-report";
import { enforceRateLimit } from "../lib/rate-limit";

/** U1-U3, U7 and U8 (SDD 5.4): the signed-in user's own account. */
export function meRoutes(ctx: AppContext) {
  const { db, auth } = ctx;

  /**
   * Removes a photo that no row points at any more. By then the request's real work is committed,
   * so a storage failure is logged and the request still succeeds; the object keeps a random,
   * unreferenced name.
   */
  async function discardPhoto(url: string): Promise<void> {
    try {
      await ctx.avatars.remove(url);
    } catch (error) {
      ctx.logger.log("error", "photo cleanup failed", { errorMessage: reportable(error).message });
    }
  }

  async function passwordMatches(hash: string, password: string): Promise<boolean> {
    return (await auth.$context).password.verify({ hash, password });
  }

  return new Elysia({ name: "moonx-me" })
    .use(accessPlugin(ctx))
    .guard({ signedIn: true })
    .get("/me", ({ user }) => loadMe(db, user.id), { response: { 200: meSchema } })
    .patch(
      "/me",
      async ({ user, body }) => {
        if (body.lastWorkspaceId !== undefined) {
          const [member] = await db
            .select({ id: schema.memberships.id })
            .from(schema.memberships)
            .where(
              and(
                eq(schema.memberships.userId, user.id),
                eq(schema.memberships.workspaceId, body.lastWorkspaceId),
              ),
            );
          if (!member) {
            throw validationFailed([
              {
                path: "lastWorkspaceId",
                code: "invalid_value",
                message: "Must be a workspace you belong to",
              },
            ]);
          }
        }
        if (Object.keys(body).length > 0) {
          await db.update(schema.users).set(body).where(eq(schema.users.id, user.id));
        }
        return loadMe(db, user.id);
      },
      { body: updateMeBodySchema, response: { 200: meSchema } },
    )
    .put(
      "/me/avatar",
      async ({ user, body }) => {
        const { file } = body;
        if (file.size > AVATAR_MAX_BYTES) {
          throw new ApiError("PAYLOAD_TOO_LARGE", "The photo is larger than 5 MB");
        }
        const image = await toAvatarWebp(new Uint8Array(await file.arrayBuffer()));
        const url = await ctx.avatars.put(image);
        // The row is locked so two uploads at once cannot both delete the same previous photo.
        const previous = await db
          .transaction(async (tx) => {
            const [row] = await tx
              .select({ avatarUrl: schema.users.avatarUrl })
              .from(schema.users)
              .where(eq(schema.users.id, user.id))
              .for("update");
            await tx
              .update(schema.users)
              .set({ avatarUrl: url })
              .where(eq(schema.users.id, user.id));
            return row?.avatarUrl ?? null;
          })
          .catch(async (error: unknown) => {
            await ctx.avatars.remove(url);
            throw error;
          });
        if (previous) await discardPhoto(previous);
        return { avatarUrl: url };
      },
      { body: z.object({ file: z.instanceof(File) }), response: { 200: avatarResponseSchema } },
    )
    .delete("/me/avatar", async ({ user, set }) => {
      const previous = await db.transaction(async (tx) => {
        const [row] = await tx
          .select({ avatarUrl: schema.users.avatarUrl })
          .from(schema.users)
          .where(eq(schema.users.id, user.id))
          .for("update");
        await tx.update(schema.users).set({ avatarUrl: null }).where(eq(schema.users.id, user.id));
        return row?.avatarUrl ?? null;
      });
      if (previous) await discardPhoto(previous);
      set.status = 204;
    })
    .post(
      "/me/password",
      async ({ user, body, request, set }) => {
        if ((await credentialHash(db, user.id)) !== null) {
          throw new ApiError("PASSWORD_ALREADY_SET", "This account already has a password");
        }
        requireRecentSignIn(user.sessionCreatedAt, ctx.now());
        await auth.api.setPassword({ body, headers: request.headers });
        // Like any password change, this ends every session but the one making it.
        await db
          .delete(schema.sessions)
          .where(and(eq(schema.sessions.userId, user.id), ne(schema.sessions.id, user.sessionId)));
        set.status = 204;
      },
      { body: setPasswordBodySchema },
    )
    .post(
      "/me/delete",
      async ({ user, body, request, set }) => {
        if (body.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
          throw new ApiError("CONFIRMATION_MISMATCH", "The email address does not match");
        }
        const hash = await credentialHash(db, user.id);
        if (hash !== null) {
          await enforceRateLimit(db, "passwordCheck", user.id, ctx.now().getTime());
          if (body.password === undefined) {
            throw validationFailed([
              { path: "password", code: "invalid_type", message: "Password is required" },
            ]);
          }
          if (!(await passwordMatches(hash, body.password))) {
            throw new ApiError("INVALID_PASSWORD", "The password is incorrect");
          }
        } else {
          requireRecentSignIn(user.sessionCreatedAt, ctx.now());
        }
        const { avatarUrl } = await db.transaction((tx) =>
          eraseAccount(tx, user, historyActor(request, user)),
        );
        if (avatarUrl) await discardPhoto(avatarUrl);
        set.headers["set-cookie"] = await expiredSessionCookies(auth);
        set.status = 204;
      },
      { body: deleteAccountBodySchema },
    );
}
