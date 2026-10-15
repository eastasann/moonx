import { AsyncLocalStorage } from "node:async_hooks";
import {
  accounts,
  type Database,
  rateLimits,
  sessions,
  users,
  verifications,
} from "@moonx/db";
import { i18n } from "@moonx/i18n";
import { PASSWORD_MAX, PASSWORD_MIN, passwordSchema } from "@moonx/schemas";
import { betterAuth, type User } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  APIError,
  createAuthMiddleware,
  getOAuthState,
  isAPIError,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { Elysia } from "elysia";
import type { AccessPlugin } from "./access";
import type { Config } from "./config";
import {
  CLIENT_IP_HEADER,
  type IpLimit,
  type RequestContext,
  requestContext,
} from "./entry";
import { ApiError, describeFailure } from "./errors";
import type { Logger } from "./log";
import type { Mailer } from "./mail";
import { createBetterAuthRateLimitStorage, type Limit } from "./rate-limit";
import {
  displayNameFromProvider,
  isValidInvitationFor,
  setUpNewUser,
} from "./registration";

const BASE_PATH = "/api/auth";

/**
 * The Better Auth paths that take a secret (SDD 5.4「回数制限」). The entry plugin counts
 * them per IP in one shared window (ADR-029 ②), so Better Auth's own count is off there.
 */
const SECRET_PATHS = [
  "/sign-in/email",
  "/sign-in/social",
  "/sign-up/email",
  "/request-password-reset",
  "/reset-password",
  "/change-password",
] as const;

/**
 * What `/api/auth/*` serves: A1–A8 (SDD 5.3), and sign-up, which Better Auth refuses
 * (ADR-010). Better Auth has more paths; they answer 404 (SDD 5.4「セッション」).
 */
const OPEN_PATHS = new Set([
  "POST /sign-in/email",
  "POST /sign-in/social",
  "GET /callback/google",
  "POST /sign-out",
  "GET /get-session",
  "POST /request-password-reset",
  "POST /reset-password",
  "POST /change-password",
  "POST /sign-up/email",
]);

/** The one window the secret paths and U5 share per IP (SDD 7.2「レート制限」). */
export const AUTH_IP_LIMIT: Limit = { name: "auth", max: 10, windowMs: 60_000 };

/** {@link AUTH_IP_LIMIT} on each secret path of Better Auth, for the entry plugin. */
export const AUTH_IP_LIMITS: readonly IpLimit[] = SECRET_PATHS.map((path) => ({
  method: "POST",
  path: `${BASE_PATH}${path}`,
  limit: AUTH_IP_LIMIT,
}));

/** Better Auth's own limit on its other paths, per IP and path (SDD 5.4「回数制限」). */
const OTHER_PATHS_LIMIT = { window: 60, max: 100 };

const DAY_SECONDS = 24 * 60 * 60;
/** design-spec 6.16. */
const RESET_LINK_SECONDS = 60 * 60;
/** SDD 5.13: `users.last_active_at` moves at most this often. */
const LAST_ACTIVE_INTERVAL_MS = 5 * 60 * 1000;
/**
 * How long A6 takes to answer, mail or no mail (SDD 5.4): an answer that came back
 * as soon as the mail left would tell an existing account by its time. Well above
 * Resend's usual time to take a mail.
 */
const RESET_ANSWER_MS = 2000;

const sleepUntil = async (deadline: number) => {
  const wait = deadline - performance.now();
  if (wait > 0) await Bun.sleep(wait);
};

/**
 * Puts `requestId` on a redirect of Better Auth's that carries an `error`, so the login
 * screen can show it as the Ref of an unexpected failure (SDD 5.4, 4章 `/login`).
 * Other answers pass unchanged.
 */
function withRequestIdOnError(
  response: Response,
  requestId: string,
  base: string,
): Response {
  const location = response.headers.get("location");
  if (location === null) return response;
  const target = new URL(location, base);
  if (!target.searchParams.has("error")) return response;
  target.searchParams.set("requestId", requestId);
  const headers = new Headers(response.headers);
  // A path stays a path: the browser resolves it against the page it is on.
  headers.set(
    "location",
    location.startsWith("/") && !location.startsWith("//")
      ? `${target.pathname}${target.search}${target.hash}`
      : target.href,
  );
  return new Response(response.body, { status: response.status, headers });
}

/**
 * 401 UNAUTHENTICATED in Better Auth's `{ code, message }` shape, keeping the headers of
 * Better Auth's answer, whose `Set-Cookie` may clear a stale session cookie.
 */
function unauthenticated(answered: Response): Response {
  const headers = new Headers(answered.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return new Response(
    JSON.stringify({ code: "UNAUTHENTICATED", message: "Not signed in" }),
    { status: 401, headers },
  );
}

/** Where `onPasswordReset` leaves the user for the after hook to sign in. */
const signedInAfterReset = Symbol("signedInAfterReset");

/** One request on `/api/auth/*`, for the callbacks Better Auth calls during it. */
interface AuthCall {
  readonly request: RequestContext;
  /** `performance.now()` when the call came in. */
  readonly startedAt: number;
  [signedInAfterReset]?: User;
  /** The 5xx error Better Auth answered with, for the failure log and Sentry. */
  failure?: unknown;
  /**
   * The invitation check of a Google sign-in that names one, made before Better Auth's
   * user transaction for `user.create.before` to read (SDD 5.4「新規登録の制限」).
   */
  googleInvitation?: { email: string; valid: boolean };
}

/** What {@link createAuth} needs from the app. */
export interface AuthOptions {
  config: Pick<
    Config,
    | "appEnv"
    | "betterAuthSecret"
    | "betterAuthUrl"
    | "trustedOrigins"
    | "google"
    | "logLevel"
  >;
  db: Database;
  log: Logger;
  mailer: Mailer;
  /**
   * The clock of Better Auth's rate limits, `users.last_active_at` and sign-up's
   * invitation checks and records.
   */
  now: () => number;
  /**
   * How long A6 takes to answer, and so how long its mail may take. Tests shorten it;
   * it defaults to 2 s.
   */
  resetAnswerMs?: number;
}

/**
 * Better Auth with moonx's settings (SDD 5.4, ADR-010) and the routes that serve it at
 * `/api/auth/*`. Install the routes after the entry plugin: Better Auth reads the
 * caller's IP from the header that plugin sets, and the routes need its request context.
 *
 * `users.last_active_at` (SDD 5.13) moves in Better Auth's after hook, whenever a call
 * reads or makes a session. Code that resolves the caller elsewhere must read the
 * session through `auth.api.getSession`, which runs that hook, for the date to keep up.
 */
export function createAuth({
  config,
  db,
  log,
  mailer,
  now,
  resetAnswerMs = RESET_ANSWER_MS,
}: AuthOptions) {
  const calls = new AsyncLocalStorage<AuthCall>();
  const requestId = () => calls.getStore()?.request.requestId ?? null;
  /**
   * The `/api/auth/*` request Better Auth is serving. The password reset needs one (its
   * answer time and the sign-in after it), so the before hook refuses a reset that has
   * none, such as a server-side `auth.api` call.
   */
  const currentCall = () => {
    const call = calls.getStore();
    if (call === undefined) {
      throw new Error("The password reset runs only through /api/auth/*");
    }
    return call;
  };

  const auth = betterAuth({
    appName: "moonx",
    baseURL: config.betterAuthUrl,
    basePath: BASE_PATH,
    secret: config.betterAuthSecret,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      // User creation and its account go in one transaction (and so do Better Auth's
      // other multi-row writes).
      transaction: true,
      schema: { users, sessions, accounts, verifications, rateLimits },
    }),
    user: { fields: { name: "displayName", image: "avatarUrl" } },
    session: { expiresIn: 30 * DAY_SECONDS, updateAge: DAY_SECONDS },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      // Better Auth counts UTF-16 units and design-spec 6.0.8 counts characters, so its
      // limits are set wide enough never to refuse a valid password; the before hook
      // applies the rule itself to new passwords.
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX * 2,
      resetPasswordTokenExpiresIn: RESET_LINK_SECONDS,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, token }) {
        const call = currentCall();
        const link = new URL("/reset-password", config.betterAuthUrl);
        link.searchParams.set("token", token);
        const { requestId } = call.request;
        // Cloud Run gives no CPU once the answer is out (ADR-007), so a send still
        // under way when A6 answers is stopped rather than left to stall (SDD 5.4).
        const stop = AbortSignal.timeout(
          Math.max(0, call.startedAt + resetAnswerMs - performance.now()),
        );
        await mailer
          .send(
            {
              to: user.email,
              subject: i18n.t("mail:passwordReset.subject"),
              text: i18n.t("mail:passwordReset.text", { link: link.href }),
            },
            requestId,
            { signal: stop },
          )
          .catch((error: unknown) => {
            // The answer must not tell whether the account exists (design-spec 6.16),
            // and only an existing account gets a mail, so a failed send cannot change
            // it: it goes to the log only (SDD 5.4).
            log.write("error", "password reset mail failed", {
              requestId,
              ...describeFailure(error),
            });
          });
      },
      async onPasswordReset({ user }) {
        currentCall()[signedInAfterReset] = user;
      },
    },
    socialProviders:
      config.google === undefined
        ? {}
        : {
            google: {
              clientId: config.google.clientId,
              clientSecret: config.google.clientSecret,
              // New accounts only from the invitation screen, with requestSignUp and
              // the invitation's token in additionalData.
              disableImplicitSignUp: true,
              // The invitation is checked here, once Google's profile is in and before
              // Better Auth opens the transaction that creates a new user. The hook
              // that refuses runs inside that transaction, where a query would need a
              // second connection of the pool: sign-ups at once could take every
              // connection and wait on each other (SDD 5.4「新規登録の制限」).
              async mapProfileToUser(profile) {
                const call = calls.getStore();
                // Client-supplied, so it counts only as a lookup key: the invitation
                // it names must be valid and sent to this Google address.
                const { invitationToken } = ((await getOAuthState()) ?? {}) as {
                  invitationToken?: unknown;
                };
                if (call !== undefined && typeof invitationToken === "string") {
                  call.googleInvitation = {
                    email: profile.email.toLowerCase(),
                    valid: await isValidInvitationFor(
                      db,
                      invitationToken,
                      profile.email,
                      new Date(now()),
                    ),
                  };
                }
                return {};
              },
            },
          },
    // Google's tokens serve sign-in only, so they are not kept (SDD 7.2「個人情報」).
    account: { updateAccountOnSignIn: false },
    rateLimit: {
      enabled: true,
      ...OTHER_PATHS_LIMIT,
      customRules: Object.fromEntries(
        SECRET_PATHS.map((path) => [path, false as const]),
      ),
      customStorage: createBetterAuthRateLimitStorage(
        db,
        OTHER_PATHS_LIMIT.window * 1000,
        now,
      ),
    },
    advanced: {
      // Other apps on localhost share its cookies across ports, and Better Auth's
      // default prefix is the same in every app that uses it.
      cookiePrefix: "moonx",
      // `__Secure-` and Secure wherever the site is HTTPS; local runs on HTTP.
      useSecureCookies:
        config.appEnv === "staging" || config.appEnv === "production",
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      database: { generateId: "uuid" },
      // Better Auth skips its callback URL checks under NODE_ENV=test unless told
      // otherwise; the tests must see what production does.
      disableOriginCheck: false,
    },
    logger: {
      level: config.logLevel,
      // Through the API's logger, so every line is one JSON object with the request's
      // ID. Arguments other than errors are dropped and errors give only what the
      // failure log gives (SDD 8.3): they can carry SQL, values and addresses.
      log(level, message, ...args) {
        const failure = args.find((arg) => arg instanceof Error);
        log.write(level, `better-auth: ${message}`, {
          requestId: requestId(),
          ...(failure === undefined ? {} : describeFailure(failure)),
        });
      },
    },
    onAPIError: {
      // Where a Google sign-in that cannot tell its own error page goes (an expired or
      // forged state), instead of Better Auth's page: the login screen shows the error.
      errorURL: new URL("/login", config.betterAuthUrl).href,
      // A thrown error that is not one of Better Auth's answers leaves the handler, so
      // the entry plugin logs and reports it as a 5xx (SDD 8.3) instead of Better Auth
      // printing it and answering an empty 500.
      onError(error) {
        if (!isAPIError(error)) throw error;
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/request-password-reset") currentCall();
        if (ctx.path !== "/reset-password" && ctx.path !== "/change-password") {
          return;
        }
        const newPassword: unknown = ctx.body?.newPassword;
        if (
          typeof newPassword === "string" &&
          !passwordSchema.safeParse(newPassword).success
        ) {
          throw new APIError("UNPROCESSABLE_ENTITY", {
            code: "VALIDATION_FAILED",
            message: "newPassword does not follow the password rule",
          });
        }
        if (ctx.path === "/change-password") {
          // Whatever the client asks, a changed password ends every other session.
          return {
            context: { body: { ...ctx.body, revokeOtherSessions: true } },
          };
        }
        currentCall();
        // A suspended account keeps its password, and the link, until it is resumed
        // (SDD 5.4「ログインの制限」). A link that is not valid is Better Auth's to refuse.
        // Where Better Auth takes the token from: the body, or else the query.
        const token: unknown = ctx.body?.token || ctx.query?.token;
        const verification =
          typeof token === "string"
            ? await ctx.context.internalAdapter.findVerificationValue(
                `reset-password:${token}`,
              )
            : null;
        if (verification == null || verification.expiresAt <= new Date()) {
          return;
        }
        const [owner] = await db
          .select({ status: users.status })
          .from(users)
          .where(eq(users.id, verification.value));
        if (owner !== undefined && owner.status !== "active") {
          throw new APIError("FORBIDDEN", {
            code: "ACCOUNT_SUSPENDED",
            message: "This account is suspended or deleted",
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const { returned } = ctx.context;
        const call = calls.getStore();
        // Redirects are APIErrors too: the Google callback signs in with one.
        if (isAPIError(returned) && returned.statusCode >= 400) {
          if (returned.statusCode >= 500 && call !== undefined) {
            call.failure = returned;
          }
          return;
        }
        if (ctx.path === "/request-password-reset") {
          await sleepUntil(currentCall().startedAt + resetAnswerMs);
        }
        const resetUser = call?.[signedInAfterReset];
        if (ctx.path === "/reset-password" && resetUser !== undefined) {
          // design-spec 6.16: a reset ends signed in. Better Auth has just deleted
          // every session, so this one is the only one left.
          const session = await ctx.context.internalAdapter.createSession(
            resetUser.id,
          );
          await setSessionCookie(ctx, { session, user: resetUser });
        }
        const userId =
          ctx.context.newSession?.user.id ??
          (ctx.path === "/get-session"
            ? (returned as { user?: { id?: unknown } } | null)?.user?.id
            : ctx.context.session?.user.id);
        if (typeof userId !== "string") return;
        if (call !== undefined) call.request.userId = userId;
        const at = now();
        await db
          .update(users)
          .set({ lastActiveAt: new Date(at) })
          .where(
            and(
              eq(users.id, userId),
              or(
                isNull(users.lastActiveAt),
                lte(users.lastActiveAt, new Date(at - LAST_ACTIVE_INTERVAL_MS)),
              ),
            ),
          );
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Only Google sign-up creates users through Better Auth: U5 writes its own.
          // A sign-up without the check of mapProfileToUser (an ID token, which has no
          // OAuth state to name an invitation) is refused.
          async before(user) {
            const checked = calls.getStore()?.googleInvitation;
            if (
              !user.emailVerified ||
              checked === undefined ||
              checked.email !== user.email.toLowerCase() ||
              !checked.valid
            ) {
              throw new APIError("FORBIDDEN", {
                code: "INVITATION_REQUIRED",
                message: "Signing up needs a valid invitation to this address",
              });
            }
            return {
              data: {
                ...user,
                name: displayNameFromProvider(user.name, user.email),
                // The photo is only ever one uploaded through U3 (ADR-024).
                image: null,
              },
            };
          },
          // Runs after the user's transaction commits. If it fails, or the instance
          // stops before it ends, the session hook below sets the user up at the
          // next sign-in instead (SDD 5.4「登録の後」).
          async after(user) {
            await db.transaction((tx) =>
              setUpNewUser(
                tx,
                { id: user.id, email: user.email, displayName: user.name },
                new Date(now()),
              ),
            );
          },
        },
      },
      account: {
        create: {
          async before(account) {
            return {
              data: {
                ...account,
                accessToken: null,
                refreshToken: null,
                idToken: null,
                accessTokenExpiresAt: null,
                refreshTokenExpiresAt: null,
              },
            };
          },
        },
      },
      session: {
        create: {
          async before(session) {
            const [user] = await db
              .select({
                status: users.status,
                email: users.email,
                displayName: users.displayName,
              })
              .from(users)
              .where(eq(users.id, session.userId));
            if (user?.status !== "active") {
              throw new APIError("FORBIDDEN", {
                code: "ACCOUNT_SUSPENDED",
                message: "This account is suspended or deleted",
              });
            }
            // Finishes a sign-up whose set-up did not complete; a no-op otherwise.
            await db.transaction((tx) =>
              setUpNewUser(
                tx,
                { id: session.userId, ...user },
                new Date(now()),
              ),
            );
          },
        },
      },
    },
  });

  const handle = async ({
    request,
    path,
  }: {
    request: Request;
    path: string;
  }) => {
    const route = `${request.method} ${path.slice(BASE_PATH.length)}`;
    if (!OPEN_PATHS.has(route)) {
      throw new ApiError("NOT_FOUND", "No route matches the request");
    }
    const call: AuthCall = {
      request: requestContext(request),
      startedAt: performance.now(),
    };
    const response = await calls.run(call, async () => {
      // The session is read first where Better Auth would not refuse its absence
      // first: it signs out without one too (200), and checks a password change's body
      // before the session (SDD 7.1: not signed in is 401 whatever the body).
      if (route !== "POST /sign-out" && route !== "POST /change-password") {
        return auth.handler(request);
      }
      const { headers, response: session } = await auth.api.getSession({
        headers: request.headers,
        query: { disableRefresh: true },
        returnHeaders: true,
      });
      if (session !== null) return auth.handler(request);
      if (route === "POST /change-password") {
        return unauthenticated(new Response(null, { headers }));
      }
      // The sign-out still runs, to clear a stale cookie.
      const answered = await auth.handler(request);
      return answered.status === 200 ? unauthenticated(answered) : answered;
    });
    // Better Auth answers its own failures (5xx APIErrors) itself. Handing them on with
    // the error the after hook kept makes the entry plugin log and report them like any
    // other 5xx (SDD 8.3).
    if (response.status >= 500) {
      throw new ApiError(
        "INTERNAL",
        "Internal error",
        {},
        {
          cause:
            call.failure ??
            new Error(`Better Auth answered ${response.status}`),
        },
      );
    }
    if (response.status >= 300 && response.status < 400) {
      return withRequestIdOnError(
        response,
        call.request.requestId,
        config.betterAuthUrl,
      );
    }
    // Without a session, A5 refuses like every other path that needs one (SDD 7.1),
    // where Better Auth answers 200 with null. Every 401 of A5 means no session, and
    // Better Auth's own refusals of a missing session elsewhere carry the code of SDD
    // 8.1 too.
    if (
      (route === "GET /get-session" &&
        (response.status === 401 ||
          (response.status === 200 &&
            (await response.clone().text()) === "null"))) ||
      (response.status === 401 &&
        (
          (await response
            .clone()
            .json()
            .catch(() => null)) as { code?: unknown } | null
        )?.code === "UNAUTHORIZED")
    ) {
      return unauthenticated(response);
    }
    if (response.status === 429) {
      // Better Auth's own limit answers with a message only; the entry plugin's
      // answers on these paths carry the code too (SDD 8.1).
      return new Response(
        JSON.stringify({ code: "RATE_LIMITED", message: "Too many requests" }),
        { status: 429, headers: response.headers },
      );
    }
    return response;
  };
  const description =
    "Better Auth decides the paths, bodies and answers (SDD 5.4). Errors come in its { code, message } shape (SDD 8.1).";
  // Better Auth serves GET and POST only. The routes are open: the paths that need a
  // session (A4, A5, A8; SDD 7.1) ask for it themselves.
  const routes = (access: AccessPlugin) =>
    new Elysia()
      .use(access)
      .get(`${BASE_PATH}/*`, handle, {
        open: true,
        detail: {
          summary: "A3, A5 (Better Auth)",
          description,
          operationId: "betterAuthGet",
        },
      })
      .post(`${BASE_PATH}/*`, handle, {
        open: true,
        detail: {
          summary: "A1, A2, A4, A6–A8 (Better Auth)",
          description,
          operationId: "betterAuthPost",
        },
      });

  return { auth, routes };
}

/** The Better Auth instance of {@link createAuth}. */
export type Auth = ReturnType<typeof createAuth>["auth"];
