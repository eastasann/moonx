import { afterAll, describe, expect, test } from "bun:test";
import {
  accounts,
  hashInvitationToken,
  invitations,
  memberships,
  rateLimits,
  sessions,
  users,
  verifications,
  workspaces,
} from "@moonx/db";
import { hashPassword } from "better-auth/crypto";
import { eq, like, sql } from "drizzle-orm";
import { createApp } from "./app";
import { AUTH_IP_LIMIT, createAuth } from "./auth";
import { ApiError } from "./errors";
import { createLogger } from "./log";
import { createMailer } from "./mail";
import {
  accessLine,
  buildTestApp,
  connectTestDatabase,
  type LogLine,
  testConfig,
  uniqueIp,
  unreachableDatabase,
  waitForLine,
} from "./test-app";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const ORIGIN = testConfig.trustedOrigins[0] ?? "";
const PASSWORD = "correct horse battery";
const GOOGLE = { clientId: "test-client", clientSecret: "test-secret" };
const DAY_MS = 24 * 60 * 60 * 1000;

type App = ReturnType<typeof buildTestApp>["app"];

const uniqueEmail = (label = "user") =>
  `${label}-${crypto.randomUUID()}@example.com`;

/** A user who signs in with {@link PASSWORD}, as U5 and the seed create them. */
async function createUser(
  options: {
    email?: string;
    displayName?: string;
    status?: "active" | "suspended" | "deleted";
  } = {},
) {
  const [user] = await db
    .insert(users)
    .values({
      email: options.email ?? uniqueEmail(),
      emailVerified: true,
      displayName: options.displayName ?? "Test User",
      status: options.status ?? "active",
    })
    .returning();
  if (user === undefined) throw new Error("no user");
  await db.insert(accounts).values({
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: await hashPassword(PASSWORD),
  });
  return user;
}

/** An invitation and the token of its link, valid for 7 days unless `values` say otherwise. */
async function createInvitation(
  values: Partial<typeof invitations.$inferInsert> & { email: string },
) {
  const token = crypto.randomUUID();
  const [invitation] = await db
    .insert(invitations)
    .values({
      tokenHash: hashInvitationToken(token),
      expiresAt: new Date(Date.now() + 7 * DAY_MS),
      ...values,
    })
    .returning();
  if (invitation === undefined) throw new Error("no invitation");
  return { ...invitation, token };
}

/** A workspace and its owner, for invitations that name one. */
async function createWorkspace() {
  const owner = await createUser();
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: "Team", createdById: owner.id })
    .returning();
  if (workspace === undefined) throw new Error("no workspace");
  return workspace;
}

function call(
  method: "GET" | "POST",
  path: string,
  options: {
    body?: unknown;
    cookie?: string;
    ip?: string;
    origin?: string;
    headers?: Record<string, string>;
  } = {},
) {
  return new Request(`http://localhost/api/auth${path}`, {
    method,
    headers: {
      "x-forwarded-for": options.ip ?? uniqueIp(),
      origin: options.origin ?? ORIGIN,
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

/** The `Cookie` header a browser would send back after `response`. */
const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .filter((pair) => !pair?.endsWith("="))
    .join("; ");

const signIn = (
  app: App,
  email: string,
  password = PASSWORD,
  options: Parameters<typeof call>[2] = {},
) =>
  app.handle(
    call("POST", "/sign-in/email", { body: { email, password }, ...options }),
  );

async function sessionUserId(app: App, cookie: string) {
  const response = await app.handle(call("GET", "/get-session", { cookie }));
  expect(response.status).toBe(200);
  const body = (await response.json()) as { user: { id: string } } | null;
  return body?.user.id ?? null;
}

const userRow = async (id: string) =>
  (await db.select().from(users).where(eq(users.id, id)))[0];

const userByEmail = async (email: string) =>
  (
    await db.select().from(users).where(eq(users.email, email.toLowerCase()))
  )[0];

describe("sign-in with email and password (A1, A4, A5)", () => {
  test("signs in with a session cookie, reads the session and signs out", async () => {
    const user = await createUser();
    const { app } = buildTestApp(database);

    const signedIn = await signIn(app, user.email.toUpperCase());
    expect(signedIn.status).toBe(200);
    const [cookie] = signedIn.headers.getSetCookie();
    expect(cookie).toStartWith("moonx.session_token=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain(`Max-Age=${(30 * DAY_MS) / 1000}`);
    // Local runs over HTTP (SDD 5.4「セッション」).
    expect(cookie).not.toContain("Secure");
    const cookies = cookiesOf(signedIn);
    expect(await sessionUserId(app, cookies)).toBe(user.id);

    const signedOut = await app.handle(
      call("POST", "/sign-out", { cookie: cookies, body: {} }),
    );
    expect(signedOut.status).toBe(200);
    expect(await sessionUserId(app, cookies)).toBeNull();
  });

  test("answers a wrong password in Better Auth's shape", async () => {
    const user = await createUser();
    const { app } = buildTestApp(database);

    const response = await signIn(app, user.email, "wrong password");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: expect.any(String),
    });
  });

  for (const status of ["suspended", "deleted"] as const) {
    test(`refuses a ${status} user with ACCOUNT_SUSPENDED and makes no session`, async () => {
      const user = await createUser({ status });
      const { app } = buildTestApp(database);

      const response = await signIn(app, user.email);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        code: "ACCOUNT_SUSPENDED",
        message: expect.any(String),
      });
      expect(
        await db.select().from(sessions).where(eq(sessions.userId, user.id)),
      ).toEqual([]);
    });
  }

  test("uses a __Secure- Secure cookie on staging and production", async () => {
    const user = await createUser();
    const site = "https://stg.example.invalid";
    const { app } = buildTestApp(database, {
      config: {
        appEnv: "staging",
        betterAuthUrl: site,
        trustedOrigins: [site],
      },
    });

    const response = await signIn(app, user.email, PASSWORD, { origin: site });

    expect(response.status).toBe(200);
    const [cookie] = response.headers.getSetCookie();
    expect(cookie).toStartWith("__Secure-moonx.session_token=");
    expect(cookie).toContain("; Secure");
  });

  test("records the IP the entry plugin decided on the session, not one the client sent", async () => {
    const user = await createUser();
    const { app } = buildTestApp(database);

    const response = await signIn(app, user.email, PASSWORD, {
      ip: "198.51.100.23, 192.0.2.77",
      headers: { "x-moonx-client-ip": "203.0.113.5" },
    });

    expect(response.status).toBe(200);
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(session?.ipAddress).toBe("192.0.2.77");
  });

  test("records an IPv6 caller's /64 on the session, as Better Auth keys its limits", async () => {
    const user = await createUser();
    const { app } = buildTestApp(database);

    const response = await signIn(app, user.email, PASSWORD, {
      ip: "2001:db8:1:2:3:4:5:6",
    });

    expect(response.status).toBe(200);
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(session?.ipAddress).toBe("2001:0db8:0001:0002:0000:0000:0000:0000");
  });

  test("puts the user in the access log of signed-in calls", async () => {
    const user = await createUser();
    const { app, lines } = buildTestApp(database);

    const signedIn = await signIn(app, user.email);
    const session = await app.handle(
      call("GET", "/get-session", { cookie: cookiesOf(signedIn) }),
    );
    const anonymous = await app.handle(call("GET", "/get-session"));

    expect((await accessLine(lines, signedIn)).userId).toBe(user.id);
    expect((await accessLine(lines, session)).userId).toBe(user.id);
    expect((await accessLine(lines, anonymous)).userId).toBeNull();
  });

  test("logs Better Auth's own lines as JSON with the request ID", async () => {
    const { app, lines } = buildTestApp(database);

    const response = await signIn(app, uniqueEmail(), PASSWORD);

    expect(response.status).toBe(401);
    const requestId = response.headers.get("x-request-id");
    const line = await waitForLine(
      lines,
      (candidate) =>
        String(candidate.message).startsWith("better-auth:") &&
        candidate.requestId === requestId,
    );
    expect(line.severity).toBe("WARNING");
  });
});

describe("Better Auth's failures (SDD 8.3)", () => {
  test("logs and reports an error thrown inside Better Auth as a 500", async () => {
    const unreachable = unreachableDatabase();
    try {
      const { app, lines, reports } = buildTestApp(unreachable);

      const response = await app.handle(call("GET", "/get-session"));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        code: "INTERNAL",
        message: "Internal error",
      });
      const requestId = response.headers.get("x-request-id");
      await waitForLine(
        lines,
        (line) =>
          line.message === "request failed" && line.requestId === requestId,
      );
      expect(reports.map((report) => report.requestId)).toEqual([
        requestId ?? "",
      ]);
    } finally {
      await unreachable.close();
    }
  });

  test("logs and reports a 500 Better Auth answers itself, with its error as the cause", async () => {
    const user = await createUser();
    const { app, lines, reports } = buildTestApp(database);
    const cookie = cookiesOf(await signIn(app, user.email));
    // A session a day old, which get-session refreshes, and a refresh that fails.
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + 29 * DAY_MS - 1000) })
      .where(eq(sessions.userId, user.id));
    await db.execute(sql`
      create or replace function fail_test_session() returns trigger as $$
      begin raise exception 'refresh failed'; end $$ language plpgsql`);
    await db.execute(
      sql.raw(`create trigger fail_test_session before update on sessions
        for each row when (old.user_id = '${user.id}')
        execute function fail_test_session()`),
    );
    let response: Response;
    try {
      response = await app.handle(call("GET", "/get-session", { cookie }));
    } finally {
      await db.execute(sql`drop trigger fail_test_session on sessions`);
      await db.execute(sql`drop function fail_test_session`);
    }

    expect(response.status).toBe(500);
    expect(((await response.json()) as { code: string }).code).toBe("INTERNAL");
    const requestId = response.headers.get("x-request-id");
    const failure = await waitForLine(
      lines,
      (line) =>
        line.message === "request failed" && line.requestId === requestId,
    );
    expect(failure.errorName).toBe("APIError");
    expect(
      lines.find(
        (line) =>
          line.requestId === requestId &&
          String(line.message).startsWith("better-auth:"),
      ),
    ).toMatchObject({ severity: "ERROR", pgCode: "P0001" });
    expect(reports).toHaveLength(1);
    const reported = reports[0]?.error;
    expect(reported).toBeInstanceOf(ApiError);
    expect((reported as ApiError).cause).toBeInstanceOf(Error);
  });
});

describe("Better Auth paths outside A1–A8 (SDD 5.4「セッション」)", () => {
  const OPEN = new Set([
    "POST /sign-in/email",
    "POST /sign-in/social",
    "GET /callback/:id",
    "POST /sign-out",
    "GET /get-session",
    "POST /request-password-reset",
    "POST /reset-password",
    "POST /change-password",
    "POST /sign-up/email",
  ]);
  // Every path Better Auth 1.7.7 routes, so a path a new version adds is closed too.
  const routed = Object.values(
    createAuth({
      config: { ...testConfig, google: GOOGLE },
      db,
      log: createLogger("error", () => {}),
      mailer: { send: async () => {} },
      now: Date.now,
    }).auth.api,
  ).flatMap((endpoint) => {
    const { path, options } = endpoint as {
      path?: string;
      options?: {
        method?: string | string[];
        metadata?: { SERVER_ONLY?: boolean };
      };
    };
    if (path === undefined || options?.metadata?.SERVER_ONLY) return [];
    return [options?.method ?? []].flat().map((method) => `${method} ${path}`);
  });

  test("Better Auth still routes every path moonx serves", () => {
    expect(routed).toEqual(expect.arrayContaining([...OPEN]));
  });

  for (const route of routed.filter((route) => !OPEN.has(route))) {
    test(`answers ${route} with 404 in Better Auth's shape`, async () => {
      const user = await createUser();
      const { app } = buildTestApp(database, { config: { google: GOOGLE } });
      const cookie = cookiesOf(await signIn(app, user.email));
      const [method, path = ""] = route.split(" ");

      const response = await app.handle(
        call(method === "GET" ? "GET" : "POST", path.replace(/:\w+/g, "x"), {
          cookie,
          ...(method === "GET"
            ? {}
            : {
                body: {
                  name: "Changed",
                  newEmail: uniqueEmail(),
                  password: PASSWORD,
                  providerId: "credential",
                },
              }),
        }),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        code: "NOT_FOUND",
        message: expect.any(String),
      });
      expect(await userRow(user.id)).toMatchObject({
        displayName: "Test User",
        status: "active",
      });
    });
  }
});

describe("sign-up only by invitation (ADR-010)", () => {
  test("refuses sign-up with email and password", async () => {
    const email = uniqueEmail();
    await createInvitation({ email });
    const { app } = buildTestApp(database);

    const response = await app.handle(
      call("POST", "/sign-up/email", {
        body: { email, password: PASSWORD, name: "New Person" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
      message: expect.any(String),
    });
    expect(await userByEmail(email)).toBeUndefined();
  });
});

interface GoogleProfile {
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  sub?: string;
}

const base64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/**
 * Goes through Google sign-in (A2, then the callback A3) with Google's token endpoint
 * replaced: it answers an ID token for `profile`, which Better Auth decodes as Google's
 * own. Everything else runs as it does for real. A sign-up passes the invitation's
 * token in `additionalData`, as the invitation screen does (SDD 5.4).
 */
async function googleSignIn(
  app: App,
  profile: GoogleProfile,
  options: { invitationToken?: string; requestSignUp?: boolean } = {},
) {
  const ip = uniqueIp();
  const started = await app.handle(
    call("POST", "/sign-in/social", {
      ip,
      body: {
        provider: "google",
        callbackURL: "/welcome?step=invite&new=1",
        errorCallbackURL: "/login",
        requestSignUp:
          options.requestSignUp ?? options.invitationToken !== undefined,
        ...(options.invitationToken === undefined
          ? {}
          : { additionalData: { invitationToken: options.invitationToken } }),
      },
    }),
  );
  expect(started.status).toBe(200);
  const { url } = (await started.json()) as { url: string };
  const state = new URL(url).searchParams.get("state") ?? "";

  const idToken = [
    base64url({ alg: "RS256", kid: "test" }),
    base64url({
      iss: "https://accounts.google.com",
      aud: GOOGLE.clientId,
      sub: profile.sub ?? crypto.randomUUID(),
      email: profile.email,
      email_verified: profile.email_verified ?? true,
      name: profile.name ?? "Google Person",
      picture: profile.picture,
    }),
    "signature",
  ].join(".");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const target = input instanceof Request ? input.url : String(input);
    if (target.startsWith("https://oauth2.googleapis.com/token")) {
      return Response.json({
        access_token: "access",
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: idToken,
      });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  try {
    return await app.handle(
      call("GET", `/callback/google?code=code&state=${state}`, {
        ip,
        cookie: cookiesOf(started),
      }),
    );
  } finally {
    globalThis.fetch = realFetch;
  }
}

describe("Google sign-up (ADR-010, SDD 5.4「新規登録の制限」「登録の後」)", () => {
  const googleApp = () =>
    buildTestApp(database, { config: { google: GOOGLE } });

  const refusedWith = (response: Response, code: string) => {
    expect(response.status).toBe(302);
    const location = new URL(
      response.headers.get("location") ?? "",
      "http://localhost",
    );
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe(code);
    // The Ref of the login screen (SDD 5.4, 4章 /login).
    expect(location.searchParams.get("requestId")).toBe(
      response.headers.get("x-request-id"),
    );
  };

  test("refuses an address without an invitation", async () => {
    const email = uniqueEmail();
    const { app } = googleApp();

    refusedWith(
      await googleSignIn(app, { email }, { invitationToken: "no-such-token" }),
      "INVITATION_REQUIRED",
    );
    expect(await userByEmail(email)).toBeUndefined();
  });

  for (const [label, values] of [
    ["an expired invitation", { expiresAt: new Date(Date.now() - 1000) }],
    ["a revoked invitation", { status: "revoked" as const }],
    ["an accepted invitation", { status: "accepted" as const }],
  ] as const) {
    test(`refuses ${label}`, async () => {
      const email = uniqueEmail();
      const { token } = await createInvitation({ email, ...values });
      const { app } = googleApp();

      refusedWith(
        await googleSignIn(app, { email }, { invitationToken: token }),
        "INVITATION_REQUIRED",
      );
      expect(await userByEmail(email)).toBeUndefined();
    });
  }

  test("refuses a Google account whose address is not the invitation's, even one invited elsewhere", async () => {
    const invited = uniqueEmail("invited");
    const other = uniqueEmail("other");
    const { token } = await createInvitation({ email: invited });
    await createInvitation({ email: other });
    const { app } = googleApp();

    refusedWith(
      await googleSignIn(app, { email: other }, { invitationToken: token }),
      "INVITATION_REQUIRED",
    );
    expect(await userByEmail(other)).toBeUndefined();
  });

  test("refuses a sign-up that names no invitation", async () => {
    const email = uniqueEmail();
    await createInvitation({ email });
    const { app } = googleApp();

    refusedWith(
      await googleSignIn(app, { email }, { requestSignUp: true }),
      "INVITATION_REQUIRED",
    );
    expect(await userByEmail(email)).toBeUndefined();
  });

  test("refuses an address Google has not verified", async () => {
    const email = uniqueEmail();
    const { token } = await createInvitation({ email });
    const { app } = googleApp();

    refusedWith(
      await googleSignIn(
        app,
        { email, email_verified: false },
        { invitationToken: token },
      ),
      "INVITATION_REQUIRED",
    );
    expect(await userByEmail(email)).toBeUndefined();
  });

  test("makes no account without requestSignUp, invitation or not", async () => {
    const email = uniqueEmail();
    const { token } = await createInvitation({ email });
    const { app } = googleApp();

    refusedWith(
      await googleSignIn(
        app,
        { email },
        { invitationToken: token, requestSignUp: false },
      ),
      "signup_disabled",
    );
    expect(await userByEmail(email)).toBeUndefined();
  });

  test("signs up with a workspace invitation, which stays for onboarding to accept", async () => {
    const email = uniqueEmail();
    const workspace = await createWorkspace();
    const invitation = await createInvitation({
      email: email.toUpperCase(),
      workspaceId: workspace.id,
      role: "member",
    });
    const { app } = googleApp();

    const response = await googleSignIn(
      app,
      {
        email,
        name: "Gina Gomez",
        picture: "https://lh3.googleusercontent.com/a/photo",
      },
      { invitationToken: invitation.token },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/welcome?step=invite&new=1");
    const cookie = cookiesOf(response);
    const user = await userByEmail(email);
    if (user === undefined) throw new Error("no user");
    expect(await sessionUserId(app, cookie)).toBe(user.id);
    expect(user.displayName).toBe("Gina Gomez");
    expect(user.isAdmin).toBe(false);
    // Only a photo uploaded through U3 is ever shown (ADR-024).
    expect(user.avatarUrl).toBeNull();

    const owned = await db
      .select({ workspace: workspaces, role: memberships.role })
      .from(memberships)
      .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      .where(eq(memberships.userId, user.id));
    expect(owned).toHaveLength(1);
    expect(owned[0]?.role).toBe("owner");
    expect(owned[0]?.workspace).toMatchObject({
      name: "Gina Gomez's workspace",
      currency: "PHP",
      isPersonal: true,
      createdById: user.id,
    });
    expect(user.lastWorkspaceId).toBe(owned[0]?.workspace.id ?? "");
    const [after] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitation.id));
    expect(after?.status).toBe("pending");
    // Google's tokens serve sign-in only (SDD 7.2「個人情報」).
    expect(
      await db
        .select({
          accessToken: accounts.accessToken,
          refreshToken: accounts.refreshToken,
          idToken: accounts.idToken,
        })
        .from(accounts)
        .where(eq(accounts.userId, user.id)),
    ).toEqual([{ accessToken: null, refreshToken: null, idToken: null }]);
  });

  for (const grantsAdmin of [false, true]) {
    test(`accepts an invitation without a workspace at sign-up${grantsAdmin ? ", making an operator when it grants that" : ""}`, async () => {
      const email = uniqueEmail();
      const invitation = await createInvitation({ email, grantsAdmin });
      const { app } = googleApp();

      const response = await googleSignIn(
        app,
        { email },
        { invitationToken: invitation.token },
      );

      expect(response.status).toBe(302);
      const user = await userByEmail(email);
      expect(user?.isAdmin).toBe(grantsAdmin);
      const [after] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.id, invitation.id));
      expect(after?.status).toBe("accepted");
      expect(after?.acceptedById).toBe(user?.id ?? "");
      expect(after?.acceptedAt).toBeInstanceOf(Date);
    });
  }

  test("keeps a long Google name within 60 characters, and the workspace name too", async () => {
    const email = uniqueEmail();
    const { token } = await createInvitation({ email });
    const { app } = googleApp();
    const name = `${"Ñ".repeat(30)}${"🌙".repeat(40)}`;

    await googleSignIn(app, { email, name }, { invitationToken: token });

    const user = await userByEmail(email);
    expect(Array.from(user?.displayName ?? "")).toHaveLength(60);
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.createdById, user?.id ?? ""));
    expect(Array.from(workspace?.name ?? "")).toHaveLength(60);
    expect(workspace?.name).toEndWith("'s workspace");
  });

  test("names the user after the address when Google gives no name", async () => {
    const email = uniqueEmail("nameless");
    const { token } = await createInvitation({ email });
    const { app } = googleApp();

    await googleSignIn(app, { email, name: " " }, { invitationToken: token });

    expect((await userByEmail(email))?.displayName).toBe(
      email.split("@")[0] ?? "",
    );
  });

  test("finishes a sign-up whose set-up failed at the next sign-in", async () => {
    const email = uniqueEmail();
    const invitation = await createInvitation({ email, grantsAdmin: true });
    const { app, lines } = googleApp();
    // Makes the personal workspace insert fail, once.
    await db.execute(sql`
      create or replace function fail_test_workspace() returns trigger as $$
      begin
        if new.name like 'Failing Setup%' then raise exception 'set-up failed'; end if;
        return new;
      end $$ language plpgsql`);
    await db.execute(sql`
      create trigger fail_test_workspace before insert on workspaces
      for each row execute function fail_test_workspace()`);
    let response: Response;
    try {
      response = await googleSignIn(
        app,
        { email, name: "Failing Setup" },
        { invitationToken: invitation.token },
      );
    } finally {
      await db.execute(sql`drop trigger fail_test_workspace on workspaces`);
      await db.execute(sql`drop function fail_test_workspace`);
    }

    refusedWith(response, "unable_to_create_user");
    expect(cookiesOf(response)).not.toContain("session_token");
    // Better Auth answers with a redirect, so the failure lives in its log line.
    expect(
      await waitForLine(
        lines,
        (line) => line.message === "better-auth: Unable to create OAuth user",
      ),
    ).toMatchObject({
      severity: "ERROR",
      requestId: response.headers.get("x-request-id"),
      pgCode: "P0001",
    });
    const halfMade = await userByEmail(email);
    expect(halfMade?.lastWorkspaceId).toBeNull();

    const retried = await googleSignIn(
      app,
      { email },
      { invitationToken: invitation.token },
    );

    expect(retried.status).toBe(302);
    expect(await sessionUserId(app, cookiesOf(retried))).toBe(
      halfMade?.id ?? "",
    );
    const user = await userByEmail(email);
    expect(user?.isAdmin).toBe(true);
    expect(user?.lastWorkspaceId).not.toBeNull();
    const [after] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitation.id));
    expect(after?.status).toBe("accepted");
  });

  test("sets up one personal workspace however many sessions start at once", async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: uniqueEmail(),
        emailVerified: true,
        displayName: "Racer",
      })
      .returning();
    if (user === undefined) throw new Error("no user");
    await db.insert(accounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await hashPassword(PASSWORD),
    });
    const { app } = buildTestApp(database);

    const results = await Promise.all(
      Array.from({ length: 4 }, () => signIn(app, user.email)),
    );

    expect(results.map((response) => response.status)).toEqual([
      200, 200, 200, 200,
    ]);
    expect(
      await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.createdById, user.id)),
    ).toHaveLength(1);
  });

  test("signs in an existing user, linking Google to the account", async () => {
    const user = await createUser();
    const { app } = googleApp();

    const response = await googleSignIn(app, { email: user.email });

    expect(response.status).toBe(302);
    expect(await sessionUserId(app, cookiesOf(response))).toBe(user.id);
    const linked = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, user.id));
    expect(linked.map((account) => account.providerId).sort()).toEqual([
      "credential",
      "google",
    ]);
  });

  test("refuses a suspended user with ACCOUNT_SUSPENDED", async () => {
    const user = await createUser({ status: "suspended" });
    const { app } = googleApp();

    refusedWith(
      await googleSignIn(app, { email: user.email }),
      "ACCOUNT_SUSPENDED",
    );
  });

  test("sends a callback it cannot trace back to the login screen", async () => {
    const { app } = googleApp();

    const response = await app.handle(
      call("GET", "/callback/google?code=code&state=forged"),
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(`${location.origin}${location.pathname}`).toBe(
      `${testConfig.betterAuthUrl}/login`,
    );
    expect(location.searchParams.get("error")).not.toBeNull();
    expect(location.searchParams.get("requestId")).toBe(
      response.headers.get("x-request-id"),
    );
  });

  test("signs up while every other connection of the pool is held", async () => {
    // Better Auth runs user.create.before inside the transaction that creates the
    // user, so a query of the hook's own would wait for a connection that never frees
    // (SDD 5.4「新規登録の制限」).
    const pool = connectTestDatabase();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holding: Promise<void>[] = [];
    const holders = Array.from({ length: 4 }, () => {
      let hold = () => {};
      holding.push(
        new Promise<void>((resolve) => {
          hold = resolve;
        }),
      );
      return pool.db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        hold();
        await held;
      });
    });
    try {
      await Promise.all(holding);
      const email = uniqueEmail();
      const invitation = await createInvitation({ email });
      const { app } = buildTestApp(pool, { config: { google: GOOGLE } });

      const response = await googleSignIn(
        app,
        { email },
        { invitationToken: invitation.token },
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "/welcome?step=invite&new=1",
      );
      expect(await userByEmail(email)).toBeDefined();
    } finally {
      release();
      await Promise.all(holders);
      await pool.close();
    }
  });

  test("refuses a sign-up with a Google ID token, which names no invitation", async () => {
    const email = uniqueEmail();
    const invitation = await createInvitation({ email });
    const { app } = googleApp();
    const keys = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const jwk = {
      ...(await crypto.subtle.exportKey("jwk", keys.publicKey)),
      kid: "test-key",
      alg: "RS256",
      use: "sig",
    };
    const issuedAt = Math.floor(Date.now() / 1000);
    const unsigned = [
      base64url({ alg: "RS256", kid: "test-key", typ: "JWT" }),
      base64url({
        iss: "https://accounts.google.com",
        aud: GOOGLE.clientId,
        sub: crypto.randomUUID(),
        email,
        email_verified: true,
        name: "Google Person",
        iat: issuedAt,
        exp: issuedAt + 600,
      }),
    ].join(".");
    const signature = Buffer.from(
      await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        keys.privateKey,
        new TextEncoder().encode(unsigned),
      ),
    ).toString("base64url");
    // Better Auth verifies the token against Google's keys, here this test's own.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const target = input instanceof Request ? input.url : String(input);
      if (target.startsWith("https://www.googleapis.com/oauth2/v3/certs")) {
        return Response.json({ keys: [jwk] });
      }
      return realFetch(input, init);
    }) as typeof fetch;
    let response: Response;
    try {
      response = await app.handle(
        call("POST", "/sign-in/social", {
          body: {
            provider: "google",
            requestSignUp: true,
            additionalData: { invitationToken: invitation.token },
            idToken: { token: `${unsigned}.${signature}` },
          },
        }),
      );
    } finally {
      globalThis.fetch = realFetch;
    }

    // 403, not 401: the token was accepted, and the sign-up refused.
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe(
      "INVITATION_REQUIRED",
    );
    expect(await userByEmail(email)).toBeUndefined();
  });

  test("is unavailable while GOOGLE_CLIENT_ID is unset, which only local allows", async () => {
    const { app } = buildTestApp(database);

    const response = await app.handle(
      call("POST", "/sign-in/social", {
        body: { provider: "google", callbackURL: "/" },
      }),
    );

    expect(response.status).toBe(404);
  });
});

/** The reset link of the last mail to `email` in the console transport's log lines. */
async function resetLink(lines: readonly LogLine[], email: string) {
  const mail = await waitForLine(
    lines,
    (line) => line.message === "mail" && line.to === email,
  );
  expect(mail.subject).toBe("Reset your moonx password");
  const link = String(mail.text).match(/https?:\/\/\S+/)?.[0];
  if (link === undefined) throw new Error("no link in the mail");
  return new URL(link);
}

describe("password reset (A6, A7)", () => {
  test("mails a link that sets a new password, ends every session and signs in", async () => {
    const user = await createUser();
    const { app, lines } = buildTestApp(database);
    const before = cookiesOf(await signIn(app, user.email));

    const requested = await app.handle(
      call("POST", "/request-password-reset", { body: { email: user.email } }),
    );
    expect(requested.status).toBe(200);
    const link = await resetLink(lines, user.email);
    expect(`${link.origin}${link.pathname}`).toBe(
      `${testConfig.betterAuthUrl}/reset-password`,
    );
    const token = link.searchParams.get("token") ?? "";

    const reset = await app.handle(
      call("POST", "/reset-password", {
        body: { token, newPassword: "a brand new password" },
      }),
    );

    expect(reset.status).toBe(200);
    expect(await sessionUserId(app, cookiesOf(reset))).toBe(user.id);
    expect(await sessionUserId(app, before)).toBeNull();
    expect((await signIn(app, user.email)).status).toBe(401);
    expect((await signIn(app, user.email, "a brand new password")).status).toBe(
      200,
    );

    const again = await app.handle(
      call("POST", "/reset-password", {
        body: { token, newPassword: "yet another password" },
      }),
    );
    expect(again.status).toBe(400);
    expect(((await again.json()) as { code: string }).code).toBe(
      "INVALID_TOKEN",
    );
  });

  test("lets a user who signed up with Google create a password", async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: uniqueEmail(),
        emailVerified: true,
        displayName: "Google Only",
      })
      .returning();
    if (user === undefined) throw new Error("no user");
    await db.insert(accounts).values({
      userId: user.id,
      accountId: crypto.randomUUID(),
      providerId: "google",
    });
    const { app, lines } = buildTestApp(database);
    await app.handle(
      call("POST", "/request-password-reset", { body: { email: user.email } }),
    );
    const token = (await resetLink(lines, user.email)).searchParams.get(
      "token",
    );

    const reset = await app.handle(
      call("POST", "/reset-password", {
        body: { token, newPassword: "a brand new password" },
      }),
    );

    expect(reset.status).toBe(200);
    expect((await signIn(app, user.email, "a brand new password")).status).toBe(
      200,
    );
    const linked = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, user.id));
    expect(linked.map((account) => account.providerId).sort()).toEqual([
      "credential",
      "google",
    ]);
  });

  test("answers an unknown address the same, and mails nothing", async () => {
    const user = await createUser();
    const email = uniqueEmail();
    const { app, lines } = buildTestApp(database);

    const unknown = await app.handle(
      call("POST", "/request-password-reset", { body: { email } }),
    );
    const known = await app.handle(
      call("POST", "/request-password-reset", { body: { email: user.email } }),
    );

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    await resetLink(lines, user.email);
    expect(lines.some((line) => line.to === email)).toBe(false);
  });

  test("refuses an expired link", async () => {
    const user = await createUser();
    const { app, lines } = buildTestApp(database);
    await app.handle(
      call("POST", "/request-password-reset", { body: { email: user.email } }),
    );
    const token = (await resetLink(lines, user.email)).searchParams.get(
      "token",
    );
    const [stored] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, `reset-password:${token}`));
    // design-spec 6.16: the link lasts one hour.
    expect(
      Math.abs(
        (stored?.expiresAt.getTime() ?? 0) - Date.now() - 60 * 60 * 1000,
      ),
    ).toBeLessThan(10_000);
    await db
      .update(verifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verifications.identifier, `reset-password:${token}`));

    const response = await app.handle(
      call("POST", "/reset-password", {
        body: { token, newPassword: "a brand new password" },
      }),
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe(
      "INVALID_TOKEN",
    );
  });

  test("answers the same when the mail cannot be sent, and logs the failure without the address", async () => {
    const user = await createUser();
    const { app, lines } = buildTestApp(database, {
      mailer: {
        send: async () => {
          throw new ApiError(
            "UPSTREAM_UNAVAILABLE",
            "The mail service did not take the mail",
            {},
            { cause: new Error("Resend answered 503 (unknown)") },
          );
        },
      },
    });

    const response = await app.handle(
      call("POST", "/request-password-reset", { body: { email: user.email } }),
    );

    expect(response.status).toBe(200);
    const requestId = response.headers.get("x-request-id");
    const failure = await waitForLine(
      lines,
      (line) =>
        line.message === "password reset mail failed" &&
        line.requestId === requestId,
    );
    expect(failure.severity).toBe("ERROR");
    expect(JSON.stringify(lines)).not.toContain(user.email);
  });
});

describe("the time A6 takes to answer (SDD 5.4)", () => {
  test("is the same with or without an account, and stops a mail still under way then", async () => {
    const user = await createUser();
    const stopped: string[] = [];
    const { app, lines } = buildTestApp(database, {
      resetAnswerMs: 400,
      mailer: {
        // A mail Resend never answers: only the stop ends it.
        send: (mail, _requestId, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () => {
              stopped.push(mail.to);
              reject(new ApiError("UPSTREAM_UNAVAILABLE", "Stopped"));
            });
          }),
      },
    });
    const timed = async (email: string) => {
      const started = performance.now();
      const response = await app.handle(
        call("POST", "/request-password-reset", { body: { email } }),
      );
      expect(response.status).toBe(200);
      return performance.now() - started;
    };

    const known = await timed(user.email);
    const unknown = await timed(uniqueEmail());

    for (const elapsed of [known, unknown]) {
      expect(elapsed).toBeGreaterThanOrEqual(395);
      expect(elapsed).toBeLessThan(800);
    }
    expect(stopped).toEqual([user.email]);
    const failure = await waitForLine(
      lines,
      (line) => line.message === "password reset mail failed",
    );
    expect(failure.severity).toBe("ERROR");
  });

  test("is 2 seconds unless the app is given another", async () => {
    const log = createLogger("error", () => {});
    const app = createApp(testConfig, {
      db,
      log,
      reporter: { report: async () => {} },
      mailer: createMailer(testConfig, log),
    });

    const started = performance.now();
    const response = await app.handle(
      call("POST", "/request-password-reset", {
        body: { email: uniqueEmail() },
      }),
    );

    expect(response.status).toBe(200);
    expect(performance.now() - started).toBeGreaterThanOrEqual(1995);
  });
});

describe("new passwords follow design-spec 6.0.8 (A7, A8)", () => {
  async function resetWith(newPassword: string) {
    const user = await createUser();
    const { app, lines } = buildTestApp(database);
    await app.handle(
      call("POST", "/request-password-reset", { body: { email: user.email } }),
    );
    const token = (await resetLink(lines, user.email)).searchParams.get(
      "token",
    );
    const response = await app.handle(
      call("POST", "/reset-password", { body: { token, newPassword } }),
    );
    return { app, user, response };
  }

  for (const [label, password] of [
    ["7 characters", "1234567"],
    ["only spaces", " ".repeat(8)],
    ["129 characters", "a".repeat(129)],
    ["4 emoji, 8 UTF-16 units", "🌙".repeat(4)],
  ] as const) {
    test(`refuses ${label} with VALIDATION_FAILED`, async () => {
      const { response } = await resetWith(password);

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        code: "VALIDATION_FAILED",
        message: expect.any(String),
      });
    });
  }

  test("accepts 128 emoji, which Better Auth counts as 256, and signs in with them", async () => {
    const password = "🌙".repeat(128);
    const { app, user, response } = await resetWith(password);

    expect(response.status).toBe(200);
    expect((await signIn(app, user.email, password)).status).toBe(200);
  });
});

describe("password reset outside /api/auth/*", () => {
  test("is refused before anything is mailed or changed", async () => {
    const user = await createUser();
    const sent: string[] = [];
    const { auth } = createAuth({
      config: testConfig,
      db,
      log: createLogger("error", () => {}),
      mailer: {
        send: async (mail) => {
          sent.push(mail.to);
        },
      },
      now: Date.now,
    });
    const { app, lines } = buildTestApp(database);
    await app.handle(
      call("POST", "/request-password-reset", { body: { email: user.email } }),
    );
    const token = (await resetLink(lines, user.email)).searchParams.get(
      "token",
    );
    const resetTokens = () =>
      db.select().from(verifications).where(eq(verifications.value, user.id));
    const before = await resetTokens();

    await expect(
      auth.api.requestPasswordReset({ body: { email: user.email } }),
    ).rejects.toThrow("The password reset runs only through /api/auth/*");
    await expect(
      auth.api.resetPassword({
        body: { token: token ?? "", newPassword: "a brand new password" },
      }),
    ).rejects.toThrow("The password reset runs only through /api/auth/*");

    expect(sent).toEqual([]);
    expect(await resetTokens()).toEqual(before);
    expect((await signIn(app, user.email)).status).toBe(200);
  });
});

describe("password reset of a suspended user", () => {
  test("is refused, keeping the password and the link until the account is resumed", async () => {
    const user = await createUser();
    const { app, lines } = buildTestApp(database);
    await app.handle(
      call("POST", "/request-password-reset", { body: { email: user.email } }),
    );
    const token = (await resetLink(lines, user.email)).searchParams.get(
      "token",
    );
    await db
      .update(users)
      .set({ status: "suspended" })
      .where(eq(users.id, user.id));

    const response = await app.handle(
      call("POST", "/reset-password", {
        body: { token, newPassword: "a brand new password" },
      }),
    );

    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe(
      "ACCOUNT_SUSPENDED",
    );
    // Better Auth also takes the token from the query.
    const inQuery = await app.handle(
      call("POST", `/reset-password?token=${token}`, {
        body: { newPassword: "a brand new password" },
      }),
    );
    expect(inQuery.status).toBe(403);
    expect(((await inQuery.json()) as { code: string }).code).toBe(
      "ACCOUNT_SUSPENDED",
    );
    expect(
      await db.select().from(sessions).where(eq(sessions.userId, user.id)),
    ).toEqual([]);

    await db
      .update(users)
      .set({ status: "active" })
      .where(eq(users.id, user.id));
    expect((await signIn(app, user.email)).status).toBe(200);
    const resumed = await app.handle(
      call("POST", "/reset-password", {
        body: { token, newPassword: "a brand new password" },
      }),
    );
    expect(resumed.status).toBe(200);
  });
});

describe("password change (A8)", () => {
  test("ends every other session even when the client asks to keep them", async () => {
    const user = await createUser();
    const { app } = buildTestApp(database);
    const here = cookiesOf(await signIn(app, user.email));
    const elsewhere = cookiesOf(await signIn(app, user.email));

    const response = await app.handle(
      call("POST", "/change-password", {
        cookie: here,
        body: {
          currentPassword: PASSWORD,
          newPassword: "a brand new password",
          revokeOtherSessions: false,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await sessionUserId(app, elsewhere)).toBeNull();
    expect(await sessionUserId(app, cookiesOf(response))).toBe(user.id);
    expect((await signIn(app, user.email, "a brand new password")).status).toBe(
      200,
    );
  });

  test("refuses a new password against the rule", async () => {
    const user = await createUser();
    const { app } = buildTestApp(database);
    const cookie = cookiesOf(await signIn(app, user.email));

    const response = await app.handle(
      call("POST", "/change-password", {
        cookie,
        body: { currentPassword: PASSWORD, newPassword: "short" },
      }),
    );

    expect(response.status).toBe(422);
    expect((await signIn(app, user.email)).status).toBe(200);
  });
});

describe("rate limits (ADR-029, SDD 7.2「レート制限」)", () => {
  test("counts the six secret paths per IP in one window of 10 a minute", async () => {
    const { app } = buildTestApp(database);
    const ip = uniqueIp();
    const email = uniqueEmail();
    const paths = [
      ["/sign-in/email", { email, password: PASSWORD }],
      ["/sign-in/email", { email, password: PASSWORD }],
      ["/sign-in/social", { provider: "google", callbackURL: "/" }],
      ["/sign-up/email", { email, password: PASSWORD, name: "X" }],
      ["/request-password-reset", { email }],
      ["/request-password-reset", { email }],
      ["/reset-password", { token: "nope", newPassword: PASSWORD }],
      ["/reset-password", { token: "nope", newPassword: PASSWORD }],
      [
        "/change-password",
        { currentPassword: PASSWORD, newPassword: PASSWORD },
      ],
      [
        "/change-password",
        { currentPassword: PASSWORD, newPassword: PASSWORD },
      ],
    ] as const;
    expect(paths).toHaveLength(AUTH_IP_LIMIT.max);

    for (const [path, body] of paths) {
      const response = await app.handle(call("POST", path, { ip, body }));
      expect(response.status).not.toBe(429);
    }
    const over = await signIn(app, email, PASSWORD, { ip });
    const otherIp = await signIn(app, email, PASSWORD);

    expect(over.status).toBe(429);
    expect(Number(over.headers.get("x-retry-after"))).toBeGreaterThan(0);
    expect(await over.json()).toEqual({
      code: "RATE_LIMITED",
      message: expect.any(String),
    });
    expect(otherIp.status).toBe(401);
  });

  test("leaves the other paths to Better Auth: 100 a minute per IP and path", async () => {
    const { app } = buildTestApp(database);
    // IPv4, which Better Auth keys as written (it expands IPv6).
    const [a = 0, b = 0] = crypto.getRandomValues(new Uint8Array(2));
    const ip = `198.18.${a}.${b}`;

    for (let i = 0; i < 100; i++) {
      const response = await app.handle(call("GET", "/get-session", { ip }));
      expect(response.status).toBe(200);
    }
    const over = await app.handle(call("GET", "/get-session", { ip }));

    expect(over.status).toBe(429);
    expect(Number(over.headers.get("x-retry-after"))).toBeGreaterThan(0);
    // Better Auth's own answer has no code; every 429 here carries one (SDD 8.1).
    expect(await over.json()).toEqual({
      code: "RATE_LIMITED",
      message: expect.any(String),
    });
    const keys = await db
      .select({ key: rateLimits.key })
      .from(rateLimits)
      .where(like(rateLimits.key, `%${ip}%`));
    expect(keys).toEqual([{ key: `${ip}|/get-session` }]);
  });

  test("never deletes the app: rows, whose windows can be an hour", async () => {
    const at = Date.now();
    const appKey = `app:user:hourly-${crypto.randomUUID()}:user`;
    const authKey = `192.0.2.${Math.floor(Math.random() * 250)}|/stale-${crypto.randomUUID()}`;
    await db.insert(rateLimits).values([
      { key: appKey, count: 5, lastRequest: at - 2 * 60_000 },
      { key: authKey, count: 5, lastRequest: at - 2 * 60_000 },
    ]);
    // A new app has a new store, which cleans up on its first count.
    const { app } = buildTestApp(database, { now: () => at });

    await app.handle(call("GET", "/get-session"));

    const left = await db
      .select({ key: rateLimits.key })
      .from(rateLimits)
      .where(sql`${rateLimits.key} in (${appKey}, ${authKey})`);
    expect(left).toEqual([{ key: appKey }]);
  });
});

describe("users.last_active_at (SDD 5.13)", () => {
  test("is written on use at most every 5 minutes", async () => {
    const user = await createUser();
    let clock = Date.now();
    const { app } = buildTestApp(database, { now: () => clock });
    const lastActive = async () =>
      (await userRow(user.id))?.lastActiveAt?.getTime();

    const failed = await signIn(app, user.email, "wrong password");
    expect(failed.status).toBe(401);
    expect(await lastActive()).toBeUndefined();

    const signedInAt = clock;
    const cookie = cookiesOf(await signIn(app, user.email));
    expect(await lastActive()).toBe(signedInAt);

    clock += 5 * 60_000 - 1;
    await sessionUserId(app, cookie);
    expect(await lastActive()).toBe(signedInAt);

    clock += 1;
    await sessionUserId(app, cookie);
    expect(await lastActive()).toBe(clock);
  });

  test("is written when /api/v1 reads the session through auth.api.getSession", async () => {
    const user = await createUser();
    const at = Date.now();
    const { app } = buildTestApp(database, { now: () => at - 10 * 60_000 });
    const cookie = cookiesOf(await signIn(app, user.email));
    const { auth } = createAuth({
      config: testConfig,
      db,
      log: createLogger("error", () => {}),
      mailer: { send: async () => {} },
      now: () => at,
    });

    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });

    expect(session?.user.id).toBe(user.id);
    expect((await userRow(user.id))?.lastActiveAt?.getTime()).toBe(at);
  });
});
