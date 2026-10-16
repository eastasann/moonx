import {
  accounts,
  type Database,
  type DatabaseTransaction,
  memberships,
  sessions,
  users,
} from "@moonx/db";
import {
  accountDeletionSchema,
  avatarResultSchema,
  avatarUploadSchema,
  errorBodySchema,
  meSchema,
  meUpdateSchema,
  passwordSetSchema,
  sameEmail,
} from "@moonx/schemas";
import { and, eq, ne } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AccessPlugin, Caller } from "./access";
import { deleteAccount } from "./account-deletion";
import type { Auth } from "./auth";
import {
  type AvatarStore,
  newAvatarName,
  readAvatarUpload,
  toAvatar,
} from "./avatars";
import { requestContext } from "./entry";
import { ApiError, describeFailure, isUniqueViolation } from "./errors";
import { lockActiveCaller } from "./lock";
import type { Logger } from "./log";
import { loadMe } from "./me";
import type { Limit, RateLimiter } from "./rate-limit";

/**
 * How recent a sign-in must be for U7 and U8 without a password to confirm (design-spec
 * 6.16: "直近10分以内にログインし直していること").
 */
const REAUTH_WINDOW_MS = 10 * 60 * 1000;

/** The password check of U7, per user (SDD 7.2「レート制限」). */
export const DELETION_PASSWORD_LIMIT: Limit = {
  name: "account-deletion-password",
  max: 5,
  windowMs: 10 * 60 * 1000,
};

/**
 * An empty answer. The schema keeps the status in the OpenAPI document; Elysia sends
 * no body for a handler that returns nothing.
 */
const noContent = z.undefined().meta({ description: "No content" });

/**
 * `userId`'s credential account, if any. Its password is null for one that never got a
 * password, as Better Auth allows; such an account has no password either.
 */
async function credentialAccountOf(
  db: Database | DatabaseTransaction,
  userId: string,
): Promise<{ id: string; password: string | null } | undefined> {
  const [account] = await db
    .select({ id: accounts.id, password: accounts.password })
    .from(accounts)
    .where(
      and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")),
    );
  return account;
}

/** The password hash of `userId`, or null when the account has no password. */
const passwordHashOf = async (
  db: Database | DatabaseTransaction,
  userId: string,
): Promise<string | null> =>
  (await credentialAccountOf(db, userId))?.password ?? null;

/** What the account routes need from the app. */
export interface AccountRoutesOptions {
  access: AccessPlugin;
  auth: Auth;
  db: Database;
  avatars: AvatarStore;
  limiter: RateLimiter;
  log: Logger;
  now: () => number;
}

/** U1–U3, U7 and U8 (SDD 5.4): the caller's own account. */
export function accountRoutes({
  access,
  auth,
  db,
  avatars,
  limiter,
  log,
  now,
}: AccountRoutesOptions) {
  /**
   * Refuses a caller whose session is older than the window of design-spec 6.16, for
   * the steps that ask a user without a password to sign in again.
   *
   * @throws {ApiError} REAUTH_REQUIRED
   */
  const requireRecentSignIn = (caller: Caller) => {
    if (caller.session.createdAt.getTime() < now() - REAUTH_WINDOW_MS) {
      throw new ApiError(
        "REAUTH_REQUIRED",
        "Sign in again to confirm this change",
      );
    }
  };

  /**
   * Removes a photo file no row points to any more. The change the caller asked for is
   * already committed, so a failure here is logged, not answered.
   */
  const discardPhoto = async (url: string, request: Request) => {
    await avatars.remove(url).catch((error: unknown) => {
      log.write("error", "photo removal failed", {
        requestId: requestContext(request).requestId,
        ...describeFailure(error),
      });
    });
  };

  /**
   * Points `users.avatar_url` at `url`, and returns the URL it held before.
   *
   * @throws {ApiError} UNAUTHENTICATED when the account was deleted meanwhile
   */
  const replacePhoto = (userId: string, url: string | null, at: Date) =>
    db.transaction(async (tx) => {
      await lockActiveCaller(tx, userId);
      const [user] = await tx
        .select({ avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, userId))
        .for("no key update");
      await tx
        .update(users)
        .set({ avatarUrl: url, updatedAt: at })
        .where(eq(users.id, userId));
      return user?.avatarUrl ?? null;
    });

  return new Elysia()
    .use(access)
    .get("/api/v1/me", ({ caller }) => loadMe(db, caller.id), {
      signedIn: true,
      response: { 200: meSchema, 401: errorBodySchema },
      detail: { summary: "U1 The signed-in user" },
    })
    .patch(
      "/api/v1/me",
      async ({ caller, body }) => {
        const at = new Date(now());
        await db.transaction(async (tx) => {
          await lockActiveCaller(tx, caller.id);
          if (body.lastWorkspaceId !== undefined) {
            // Shared, so a removal (W3 DELETE) waits, then sends the user home.
            const [membership] = await tx
              .select({ id: memberships.id })
              .from(memberships)
              .where(
                and(
                  eq(memberships.workspaceId, body.lastWorkspaceId),
                  eq(memberships.userId, caller.id),
                ),
              )
              .for("share");
            if (membership === undefined) {
              throw new ApiError(
                "VALIDATION_FAILED",
                "lastWorkspaceId is not one of the caller's workspaces",
                {
                  details: [
                    {
                      path: "lastWorkspaceId",
                      code: "custom",
                      message: "Not one of your workspaces",
                    },
                  ],
                },
              );
            }
          }
          const [current] = await tx
            .select({
              displayName: users.displayName,
              timezone: users.timezone,
              theme: users.theme,
              lastWorkspaceId: users.lastWorkspaceId,
            })
            .from(users)
            .where(eq(users.id, caller.id))
            .for("no key update");
          if (current === undefined) throw new Error("The caller has no row");
          const profile = Object.fromEntries(
            (["displayName", "timezone", "theme"] as const)
              .filter(
                (field) =>
                  body[field] !== undefined && body[field] !== current[field],
              )
              .map((field) => [field, body[field]]),
          );
          const moved =
            body.lastWorkspaceId !== undefined &&
            body.lastWorkspaceId !== current.lastWorkspaceId;
          if (Object.keys(profile).length === 0 && !moved) return;
          await tx
            .update(users)
            .set({
              ...profile,
              ...(moved ? { lastWorkspaceId: body.lastWorkspaceId } : {}),
              // The last workspace is where the user is, not what their profile says.
              ...(Object.keys(profile).length > 0 ? { updatedAt: at } : {}),
            })
            .where(eq(users.id, caller.id));
        });
        return loadMe(db, caller.id);
      },
      {
        signedIn: true,
        body: meUpdateSchema,
        parse: "json",
        response: { 200: meSchema, 401: errorBodySchema, 422: errorBodySchema },
        detail: {
          summary: "U2 Update the signed-in user",
          description:
            "Changes only the fields sent. lastWorkspaceId must be one of the caller's workspaces.",
        },
      },
    )
    .put(
      "/api/v1/me/avatar",
      async ({ caller, body, request }) => {
        if (!(body.file instanceof File)) throw new Error("No file was parsed");
        const photo = await toAvatar(
          new Uint8Array(await body.file.arrayBuffer()),
        );
        const url = await avatars.save(newAvatarName(), photo);
        let previous: string | null;
        try {
          previous = await replacePhoto(caller.id, url, new Date(now()));
        } catch (error) {
          await discardPhoto(url, request);
          throw error;
        }
        // The old file goes only once the new photo is in place (SDD 5.4 U3).
        if (previous !== null) await discardPhoto(previous, request);
        return { avatarUrl: url };
      },
      {
        signedIn: true,
        parse: [readAvatarUpload, "multipart/form-data"],
        body: avatarUploadSchema,
        response: {
          200: avatarResultSchema,
          401: errorBodySchema,
          413: errorBodySchema,
          422: errorBodySchema,
          503: errorBodySchema,
        },
        detail: {
          summary: "U3 Upload a profile photo",
          description:
            "multipart/form-data with the photo as file: a JPEG, PNG or WebP image of at most 5 MB, told by its content. Stored as a 512×512 WebP.",
        },
      },
    )
    .delete(
      "/api/v1/me/avatar",
      async ({ caller, request, set }) => {
        const previous = await replacePhoto(caller.id, null, new Date(now()));
        if (previous !== null) await discardPhoto(previous, request);
        set.status = 204;
      },
      {
        signedIn: true,
        response: { 204: noContent, 401: errorBodySchema },
        detail: { summary: "U3 Remove the profile photo" },
      },
    )
    .post(
      "/api/v1/me/delete",
      async ({ caller, body, request, set }) => {
        if (!sameEmail(body.confirmEmail, caller.email)) {
          throw new ApiError(
            "CONFIRMATION_MISMATCH",
            "confirmEmail is not the account's address",
          );
        }
        const hash = await passwordHashOf(db, caller.id);
        if (hash === null) {
          requireRecentSignIn(caller);
        } else {
          if (body.password === undefined) {
            throw new ApiError(
              "VALIDATION_FAILED",
              "password is required for an account with a password",
              {
                details: [
                  {
                    path: "password",
                    code: "invalid_type",
                    message: "Required",
                  },
                ],
              },
            );
          }
          const counted = await limiter.consume(
            "user",
            DELETION_PASSWORD_LIMIT,
            caller.id,
          );
          if (!counted.allowed) {
            throw new ApiError("RATE_LIMITED", "Too many password attempts", {
              retryAfterSeconds: counted.retryAfterSeconds,
            });
          }
          const context = await auth.$context;
          if (
            !(await context.password.verify({ hash, password: body.password }))
          ) {
            throw new ApiError("INVALID_PASSWORD", "The password is incorrect");
          }
        }
        const { client } = requestContext(request);
        const { avatarUrl } = await db.transaction((tx) =>
          deleteAccount(tx, caller.id, client, new Date(now())),
        );
        if (avatarUrl !== null) await discardPhoto(avatarUrl, request);
        // The sessions are gone; signing out clears the browser's cookies.
        const { headers } = await auth.api.signOut({
          headers: request.headers,
          returnHeaders: true,
        });
        set.headers["set-cookie"] = headers.getSetCookie();
        set.status = 204;
      },
      {
        signedIn: true,
        body: accountDeletionSchema,
        parse: "json",
        response: {
          204: noContent,
          401: errorBodySchema,
          403: errorBodySchema,
          409: errorBodySchema,
          422: errorBodySchema,
          429: errorBodySchema,
        },
        detail: {
          summary: "U7 Delete the signed-in account",
          description:
            "Confirms with the address, and the password or a sign-in within the last 10 minutes. Refuses with LAST_OWNER while the caller is the only Owner of a workspace with other members.",
        },
      },
    )
    .post(
      "/api/v1/me/password",
      async ({ caller, body, set }) => {
        if ((await passwordHashOf(db, caller.id)) !== null) {
          throw passwordAlreadySet();
        }
        requireRecentSignIn(caller);
        // Hashed as Better Auth's own setPassword does, before the lock: hashing is slow.
        const hash = await (await auth.$context).password.hash(
          body.newPassword,
        );
        const at = new Date(now());
        // Better Auth's setPassword writes outside any transaction of ours, so two U8 at
        // once could both pass its check. Under the caller's lock the second one sees
        // the first one's password, and no other session outlives the change.
        await db.transaction(async (tx) => {
          await lockActiveCaller(tx, caller.id, "exclusive");
          const account = await credentialAccountOf(tx, caller.id);
          if (account?.password != null) throw passwordAlreadySet();
          if (account === undefined) {
            await tx
              .insert(accounts)
              .values({
                userId: caller.id,
                // What Better Auth's setPassword stores for a password account.
                accountId: caller.id,
                providerId: "credential",
                password: hash,
                createdAt: at,
                updatedAt: at,
              })
              .catch((error: unknown) => {
                // A password reset (A7) made the account meanwhile, outside this lock.
                if (
                  isUniqueViolation(
                    error,
                    "accounts_provider_id_account_id_index",
                  )
                ) {
                  throw passwordAlreadySet();
                }
                throw error;
              });
          } else {
            await tx
              .update(accounts)
              .set({ password: hash, updatedAt: at })
              .where(eq(accounts.id, account.id));
          }
          await tx
            .delete(sessions)
            .where(
              and(
                eq(sessions.userId, caller.id),
                ne(sessions.id, caller.session.id),
              ),
            );
        });
        set.status = 204;
      },
      {
        signedIn: true,
        body: passwordSetSchema,
        parse: "json",
        response: {
          204: noContent,
          401: errorBodySchema,
          403: errorBodySchema,
          409: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "U8 Set a password",
          description:
            "For an account that signed up with Google only, within 10 minutes of signing in. Ends every other session.",
        },
      },
    );
}

const passwordAlreadySet = () =>
  new ApiError(
    "PASSWORD_ALREADY_SET",
    "The account has a password; change it with A8",
  );
