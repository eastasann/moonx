import { expo } from "@better-auth/expo";
import { schema } from "@moonx/db";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@moonx/schemas";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import type { AppContext } from "./context";
import { findUsableInvitation } from "./lib/invitation-gate";
import { provisionNewUser } from "./lib/provision";
import { AUTH_SECRET_PATHS } from "./lib/rate-limit";
import { passwordResetMail } from "./mail/mailer";

/** SDD 5.4: the reset link lives one hour. */
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_REFRESH_SECONDS = 24 * 60 * 60;
const BLOCKED_AUTH_PATHS = new Set(["/update-user", "/delete-user", "/change-email"]);

/**
 * The Better Auth instance (ADR-010). The invitation-only rule lives in `databaseHooks`, so it
 * holds for every way an account can be created, Google included.
 */
export function createAuth(ctx: Omit<AppContext, "auth" | "avatars">) {
  const { db, config } = ctx;
  const local = config.env === "local" || config.env === "test";
  // The reset hook needs the person whose password was just changed; Better Auth consumes the
  // token before `hooks.after` runs, so `onPasswordReset` hands the person over per request.
  const resetUsers = new WeakMap<Request, string>();

  return betterAuth({
    baseURL: config.publicUrl,
    basePath: "/api/auth",
    secret: config.auth.secret,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
        rateLimits: schema.rateLimits,
      },
    }),
    user: {
      fields: { name: "displayName", image: "avatarUrl" },
      additionalFields: { timezone: { type: "string", required: false, input: false } },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_TTL_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const link = `${config.publicUrl}/reset-password?token=${encodeURIComponent(token)}`;
        await ctx.mailer.send(
          passwordResetMail({
            to: user.email,
            link,
            expiresInMinutes: PASSWORD_RESET_TTL_SECONDS / 60,
          }),
        );
      },
      onPasswordReset: async ({ user }, request) => {
        if (request) resetUsers.set(request, user.id);
      },
    },
    socialProviders: config.auth.googleClientId
      ? {
          google: {
            clientId: config.auth.googleClientId,
            clientSecret: config.auth.googleClientSecret,
            disableImplicitSignUp: true,
          },
        }
      : {},
    session: { expiresIn: SESSION_TTL_SECONDS, updateAge: SESSION_REFRESH_SECONDS },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      // Better Auth's built-in rules count per path (3 a 10 seconds on sign-in); the base plugin
      // already counts these paths in one bucket per IP address.
      customRules: Object.fromEntries(
        [...AUTH_SECRET_PATHS].map((path) => [path.replace("/api/auth", ""), false as const]),
      ),
    },
    advanced: {
      database: { generateId: "uuid" },
      // Only the Worker sets this header, and the base plugin has already checked the shared
      // secret by the time a request reaches Better Auth (SDD 7.2).
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies: !local,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // An unverified Google address proves nothing about who holds the invitation.
            const invitation = user.emailVerified
              ? await findUsableInvitation(db, user.email, ctx.now())
              : null;
            if (!invitation) {
              throw new APIError("FORBIDDEN", {
                message: "A valid invitation is required",
                code: "INVITATION_REQUIRED",
              });
            }
          },
          after: async (user) => {
            // Better Auth's field names are on `user`: `name` is our display name.
            await db.transaction((tx) =>
              provisionNewUser(
                tx,
                { id: user.id, email: user.email, displayName: user.name },
                ctx.now(),
              ),
            );
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const [owner] = await db
              .select({ status: schema.users.status })
              .from(schema.users)
              .where(eq(schema.users.id, session.userId));
            if (owner?.status !== "active") {
              throw new APIError("FORBIDDEN", {
                message: "This account is suspended",
                code: "ACCOUNT_SUSPENDED",
              });
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (hookCtx) => {
        // Profile and deletion go through /api/v1/me (U2, U3, U7): Better Auth's own endpoints
        // would skip the photo pipeline, the name rules and the erase rules.
        if (BLOCKED_AUTH_PATHS.has(hookCtx.path)) {
          throw new APIError("NOT_FOUND", { message: "Not found" });
        }
        // A password change always ends the other sessions (SDD 7.2), whatever the client asked.
        if (hookCtx.path === "/change-password") {
          return { context: { ...hookCtx, body: { ...hookCtx.body, revokeOtherSessions: true } } };
        }
      }),
      after: createAuthMiddleware(async (hookCtx) => {
        if (hookCtx.path !== "/reset-password" || !hookCtx.request) return;
        const userId = resetUsers.get(hookCtx.request);
        if (!userId) return;
        const user = await hookCtx.context.internalAdapter.findUserById(userId);
        if (!user) return;
        const session = await hookCtx.context.internalAdapter.createSession(user.id);
        await setSessionCookie(hookCtx, { session, user });
      }),
    },
    plugins: [expo()],
  });
}

/** The Better Auth instance `createAuth` returns. */
export type Auth = ReturnType<typeof createAuth>;
