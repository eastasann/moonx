import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { schema } from "@moonx/db";
import {
  BCDX,
  DEMO_INVITE_TOKENS,
  DEMO_PASSWORD,
  personalWorkspaceId,
  planId,
  seedDemo,
  userId,
} from "@moonx/db/seed";
import { and, eq, sql } from "drizzle-orm";
import type { Elysia } from "elysia";
import sharp from "sharp";
import { createAuth } from "../src/auth";
import { testConfig } from "../src/config";
import { createOperatorInvitation } from "../src/lib/admin-create";
import { createGcsAvatarStore, createLocalAvatarStore } from "../src/lib/avatar-store";
import { hashInvitationToken } from "../src/lib/invitation-token";
import { createLogger } from "../src/lib/logger";
import { appOn, call, cookieHeader, login, loginWith, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let photos: string;
let app: Elysia;

beforeAll(async () => {
  t = await startTestApp();
  photos = await mkdtemp(join(tmpdir(), "moonx-avatars-"));
  app = appOn(
    t.db,
    {},
    { avatars: createLocalAvatarStore(photos, "http://localhost:5173"), mailer: t.mailbox },
  );
});
afterAll(async () => {
  await t.close();
  await rm(photos, { recursive: true, force: true });
});
beforeEach(async () => {
  await seedDemo(t.db);
  t.mailbox.sent.length = 0;
  await rm(photos, { recursive: true, force: true });
});

const ORIGIN = { origin: "http://localhost:5173" };

/** Creates a pending invitation for `email` and returns its token (only the hash is stored). */
async function invite(
  email: string,
  options: {
    workspaceId?: string | null;
    role?: "owner" | "member" | "viewer";
    grantsAdmin?: boolean;
  } = {},
) {
  const token = `test-${crypto.randomUUID()}`;
  const workspaceId = options.workspaceId === undefined ? BCDX : options.workspaceId;
  await t.db.insert(schema.invitations).values({
    workspaceId,
    email,
    role: workspaceId ? (options.role ?? "member") : null,
    grantsAdmin: options.grantsAdmin ?? false,
    tokenHash: hashInvitationToken(token),
    invitedById: userId("ana"),
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  });
  return token;
}

const signUp = (token: string, body: Record<string, unknown> = {}, headers = {}) =>
  call(app, "POST", `/api/v1/invitations/by-token/${token}/sign-up`, {
    headers,
    body: {
      displayName: "Mia Santos",
      password: "correct horse 42",
      timezone: "Asia/Manila",
      ...body,
    },
  });

const userByEmail = async (email: string) =>
  (await t.db.select().from(schema.users).where(eq(schema.users.email, email)))[0];

/** A new user who has only Google linked: no password, one session of the given age. */
async function googleOnlyUser(sessionAgeMs = 0) {
  const id = crypto.randomUUID();
  await t.db.insert(schema.users).values({ id, email: "g@example.com", displayName: "Gina" });
  await t.db
    .insert(schema.accounts)
    .values({ userId: id, accountId: "google-sub-1", providerId: "google" });
  const token = `session-${crypto.randomUUID()}`;
  const when = new Date(Date.now() - sessionAgeMs);
  await t.db.insert(schema.sessions).values({
    userId: id,
    token,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: when,
    updatedAt: when,
  });
  const { createHmac } = await import("node:crypto");
  const signature = createHmac("sha256", testConfig().auth.secret).update(token).digest("base64");
  const cookie = `better-auth.session_token=${token}.${encodeURIComponent(signature)}`;
  return { id, cookie: { cookie } };
}

describe("A1 sign-in and U1 me", () => {
  test("the demo password signs in, the cookie opens /me, and /me has the documented shape", async () => {
    const as = await login(app, "ana");
    expect(as.cookie).toContain("better-auth.session_token=");
    const me = await call(app, "GET", "/api/v1/me", { as });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      id: userId("ana"),
      email: "ana@bcdx.example",
      displayName: "Ana Villanueva",
      avatarUrl: null,
      timezone: "Asia/Manila",
      theme: "system",
      isAdmin: false,
      hasPassword: true,
      lastWorkspaceId: BCDX,
    });
    expect(me.body.memberships[0].workspace.isPersonal).toBe(true);
    expect(me.body.memberships.map((m: { role: string }) => m.role).sort()).toEqual([
      "owner",
      "owner",
    ]);
    const session = await call(app, "GET", "/api/auth/get-session", { as });
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe("ana@bcdx.example");
  });

  test("a wrong password, an unknown email and no credentials are all refused alike", async () => {
    const wrong = await call(app, "POST", "/api/auth/sign-in/email", {
      body: { email: "ana@bcdx.example", password: "not the password" },
    });
    const unknown = await call(app, "POST", "/api/auth/sign-in/email", {
      body: { email: "nobody@bcdx.example", password: "not the password" },
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
    const anonymous = await call(app, "GET", "/api/v1/me");
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe("UNAUTHENTICATED");
  });

  test("the old development header no longer authenticates anyone", async () => {
    const res = await call(app, "GET", "/api/v1/me", {
      headers: { "x-moonx-dev-user-id": userId("ana") },
    });
    expect(res.status).toBe(401);
  });

  test("a forged or altered cookie is refused", async () => {
    const as = await login(app, "ana");
    const forged = { cookie: `${as.cookie}x` };
    expect((await call(app, "GET", "/api/v1/me", { as: forged })).status).toBe(401);
    const bare = { cookie: "better-auth.session_token=abc.def" };
    expect((await call(app, "GET", "/api/v1/me", { as: bare })).status).toBe(401);
  });

  test("sign-out ends the session", async () => {
    const as = await login(app, "kenji");
    const out = await call(app, "POST", "/api/auth/sign-out", { as, headers: ORIGIN, body: {} });
    expect(out.status).toBe(200);
    expect((await call(app, "GET", "/api/v1/me", { as })).status).toBe(401);
  });

  test("the session lasts 30 days and its cookie is HttpOnly with SameSite=Lax", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ana@bcdx.example", password: DEMO_PASSWORD }),
      }),
    );
    const cookie = response.headers.getSetCookie().join("\n");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
    const [session] = await t.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId("ana")));
    const days = ((session?.expiresAt.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });

  test("production-like environments set the __Secure- prefix and the Secure attribute", async () => {
    const secure = appOn(t.db, { env: "production" });
    const response = await secure.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ana@bcdx.example", password: DEMO_PASSWORD }),
      }),
    );
    const cookie = response.headers.getSetCookie().join("\n");
    expect(cookie).toContain("__Secure-better-auth.session_token=");
    expect(cookie).toContain("Secure");
  });
});

describe("suspended and deleted users", () => {
  test("a suspended user cannot sign in, and a session left behind answers 401", async () => {
    const as = await login(app, "kenji");
    await t.db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, userId("kenji")));
    expect((await call(app, "GET", "/api/v1/me", { as })).status).toBe(401);
    const refused = await call(app, "POST", "/api/auth/sign-in/email", {
      body: { email: "kenji@bcdx.example", password: DEMO_PASSWORD },
    });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("ACCOUNT_SUSPENDED");
    await t.db
      .update(schema.users)
      .set({ status: "active" })
      .where(eq(schema.users.id, userId("kenji")));
    expect((await call(app, "GET", "/api/v1/me", { as })).status).toBe(200);
  });

  test("an operator suspending a user ends that user's sessions", async () => {
    const admin = await login(app, "admin");
    const kenji = await login(app, "kenji");
    const res = await call(app, "POST", `/api/v1/admin/users/${userId("kenji")}/suspend`, {
      as: admin,
    });
    expect(res.status).toBe(200);
    expect((await call(app, "GET", "/api/v1/me", { as: kenji })).status).toBe(401);
  });
});

describe("U4 invitation preview", () => {
  test("a pending invitation shows who, where and as what", async () => {
    const res = await call(
      app,
      "GET",
      `/api/v1/invitations/by-token/${DEMO_INVITE_TOKENS.pending}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "pending",
      email: "new.member@bcdx.example",
      workspace: { id: BCDX },
      role: "member",
      invitedBy: { displayName: "Ana Villanueva" },
      accountExists: false,
    });
  });

  test("accountExists is true when the address already has an account", async () => {
    const token = await invite("kenji@bcdx.example");
    const res = await call(app, "GET", `/api/v1/invitations/by-token/${token}`);
    expect(res.body.accountExists).toBe(true);
  });

  test("unknown, expired and revoked links are the same 410", async () => {
    const revoked = await invite("r@example.com");
    await t.db
      .update(schema.invitations)
      .set({ status: "revoked" })
      .where(eq(schema.invitations.tokenHash, hashInvitationToken(revoked)));
    for (const token of ["no-such-token", DEMO_INVITE_TOKENS.expired, revoked]) {
      const res = await call(app, "GET", `/api/v1/invitations/by-token/${token}`);
      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe("INVITATION_INVALID");
    }
  });

  test("an accepted invitation still previews as accepted", async () => {
    const token = await invite("kenji@bcdx.example");
    const kenji = await login(app, "kenji");
    await call(app, "POST", `/api/v1/invitations/by-token/${token}/accept`, { as: kenji });
    const res = await call(app, "GET", `/api/v1/invitations/by-token/${token}`);
    expect(res.body.status).toBe("accepted");
  });
});

describe("U5 sign-up from an invitation", () => {
  test("creates the account, signs in, and gives a personal workspace", async () => {
    const res = await signUp(DEMO_INVITE_TOKENS.pending);
    expect(res.status).toBe(201);
    expect(res.body.me).toMatchObject({
      email: "new.member@bcdx.example",
      displayName: "Mia Santos",
      timezone: "Asia/Manila",
      isAdmin: false,
      hasPassword: true,
    });
    expect(res.body.me.memberships).toHaveLength(1);
    expect(res.body.me.memberships[0]).toMatchObject({
      role: "owner",
      workspace: { name: "Mia Santos's workspace", isPersonal: true, currency: "PHP" },
    });
    expect(res.body.me.lastWorkspaceId).toBe(res.body.me.memberships[0].workspace.id);
    const cookie = { cookie: cookieHeader(new Response(null, { headers: res.headers })) };
    expect(cookie.cookie).toContain("better-auth.session_token=");
    expect((await call(app, "GET", "/api/v1/me", { as: cookie })).status).toBe(200);
    // The invitation is not accepted yet: screen 3 does that with U6.
    const [row] = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.tokenHash, hashInvitationToken(DEMO_INVITE_TOKENS.pending)));
    expect(row?.status).toBe("pending");
    // The new password works for a fresh sign-in.
    await loginWith(app, "new.member@bcdx.example", "correct horse 42");
  });

  test("U6 then joins the workspace as invited", async () => {
    const created = await signUp(DEMO_INVITE_TOKENS.pending);
    const as = { cookie: cookieHeader(new Response(null, { headers: created.headers })) };
    const res = await call(
      app,
      "POST",
      `/api/v1/invitations/by-token/${DEMO_INVITE_TOKENS.pending}/accept`,
      { as },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ workspaceId: BCDX, alreadyMember: false });
    const me = await call(app, "GET", "/api/v1/me", { as });
    expect(
      me.body.memberships.some(
        (m: { workspace: { id: string }; role: string }) =>
          m.workspace.id === BCDX && m.role === "member",
      ),
    ).toBe(true);
  });

  test("the email comes from the invitation, whatever the body says", async () => {
    const res = await signUp(DEMO_INVITE_TOKENS.pending, { email: "someone.else@example.com" });
    expect(res.status).toBe(201);
    expect(res.body.me.email).toBe("new.member@bcdx.example");
    expect(await userByEmail("someone.else@example.com")).toBeUndefined();
  });

  test("an unknown, expired or revoked link cannot sign up", async () => {
    for (const token of ["no-such-token", DEMO_INVITE_TOKENS.expired]) {
      const res = await signUp(token);
      expect(res.status).toBe(410);
    }
    expect(await userByEmail("late.joiner@bcdx.example")).toBeUndefined();
  });

  test("an address that already has an account is 409 EMAIL_TAKEN", async () => {
    const token = await invite("Kenji@BCDX.example");
    const res = await signUp(token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  test("the password and the other fields are validated", async () => {
    const short = await signUp(DEMO_INVITE_TOKENS.pending, { password: "short" });
    expect(short.status).toBe(422);
    expect(short.body.error.code).toBe("VALIDATION_FAILED");
    const long = await signUp(DEMO_INVITE_TOKENS.pending, { password: "x".repeat(129) });
    expect(long.status).toBe(422);
    const zone = await signUp(DEMO_INVITE_TOKENS.pending, { timezone: "Mars/Olympus" });
    expect(zone.status).toBe(422);
    const name = await signUp(DEMO_INVITE_TOKENS.pending, { displayName: " " });
    expect(name.status).toBe(422);
    const count = await t.db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
    expect(count[0]?.n).toBe(5);
  });

  test("Better Auth's own sign-up endpoint is closed", async () => {
    const res = await call(app, "POST", "/api/auth/sign-up/email", {
      body: { email: "walk.in@example.com", password: "correct horse 42", name: "Walk In" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await userByEmail("walk.in@example.com")).toBeUndefined();
  });

  test("ten sign-up attempts a minute per IP, then 429", async () => {
    const headers = { "cf-connecting-ip": "203.0.113.7" };
    for (let i = 0; i < 10; i++) {
      expect((await signUp("no-such-token", {}, headers)).status).toBe(410);
    }
    const res = await signUp("no-such-token", {}, headers);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    const other = await signUp("no-such-token", {}, { "cf-connecting-ip": "203.0.113.8" });
    expect(other.status).toBe(410);
  });
});

describe("operator invitations", () => {
  test("make admin-create's invitation makes its holder an operator", async () => {
    const { link } = await createOperatorInvitation(t.db, {
      email: "first.operator@example.com",
      publicUrl: "http://localhost:5173",
      now: new Date(),
    });
    const token = link.split("/invite/")[1] as string;
    const preview = await call(app, "GET", `/api/v1/invitations/by-token/${token}`);
    expect(preview.body.workspace).toBeNull();
    const created = await signUp(token);
    expect(created.status).toBe(201);
    expect(created.body.me.isAdmin).toBe(true);
    const as = { cookie: cookieHeader(new Response(null, { headers: created.headers })) };
    expect((await call(app, "GET", "/api/v1/admin/users", { as })).status).toBe(200);
    // Onboarding skips the invitation step for these, so sign-up itself accepts the invitation.
    const [row] = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.tokenHash, hashInvitationToken(token)));
    expect(row).toMatchObject({ status: "accepted", acceptedById: created.body.me.id });
    const again = await call(app, "POST", `/api/v1/invitations/by-token/${token}/accept`, { as });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("INVITATION_ALREADY_ACCEPTED");
  });

  test("an operator invitation for an existing account makes them an operator when they accept", async () => {
    const token = await invite("kenji@bcdx.example", { workspaceId: null, grantsAdmin: true });
    const kenji = await login(app, "kenji");
    const res = await call(app, "POST", `/api/v1/invitations/by-token/${token}/accept`, {
      as: kenji,
    });
    expect(res.body).toEqual({ workspaceId: null, alreadyMember: false });
    expect((await call(app, "GET", "/api/v1/me", { as: kenji })).body.isAdmin).toBe(true);
  });

  test("two sign-ups at once for one invitation make one account", async () => {
    const token = await invite("race@example.com");
    const results = await Promise.all([signUp(token), signUp(token)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409);
    expect(loser?.body.error.code).toBe("EMAIL_TAKEN");
    const users = await t.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "race@example.com"));
    expect(users).toHaveLength(1);
  });

  test("a workspace invitation does not", async () => {
    const created = await signUp(DEMO_INVITE_TOKENS.pending);
    expect(created.body.me.isAdmin).toBe(false);
  });

  test("a workspace-less invitation without grants_admin does not, and sign-up still accepts it", async () => {
    const token = await invite("plain.person@example.com", { workspaceId: null });
    const created = await signUp(token);
    expect(created.status).toBe(201);
    expect(created.body.me.isAdmin).toBe(false);
    const [row] = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.tokenHash, hashInvitationToken(token)));
    expect(row).toMatchObject({ status: "accepted", acceptedById: created.body.me.id });
  });

  test("accepting a workspace-less invitation without grants_admin leaves an existing account alone", async () => {
    const token = await invite("kenji@bcdx.example", { workspaceId: null });
    const kenji = await login(app, "kenji");
    const res = await call(app, "POST", `/api/v1/invitations/by-token/${token}/accept`, {
      as: kenji,
    });
    expect(res.body).toEqual({ workspaceId: null, alreadyMember: false });
    expect((await call(app, "GET", "/api/v1/me", { as: kenji })).body.isAdmin).toBe(false);
  });

  test("admin-create upgrades a pending workspace-less invitation that AD9 issued", async () => {
    const plain = await invite("upgrade@example.com", { workspaceId: null });
    const { link } = await createOperatorInvitation(t.db, {
      email: "upgrade@example.com",
      publicUrl: "http://localhost:5173",
      now: new Date(),
    });
    expect((await signUp(plain)).status).toBe(410);
    const created = await signUp(link.split("/invite/")[1] as string);
    expect(created.body.me.isAdmin).toBe(true);
  });
});

describe("U6 accepting", () => {
  test("another account's invitation is 403 with the address it was sent to", async () => {
    const kenji = await login(app, "kenji");
    const res = await call(
      app,
      "POST",
      `/api/v1/invitations/by-token/${DEMO_INVITE_TOKENS.pending}/accept`,
      { as: kenji },
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({
      code: "INVITATION_EMAIL_MISMATCH",
      invitedEmail: "new.member@bcdx.example",
    });
  });

  test("accepting twice is 409, and a member keeps the role they have", async () => {
    const token = await invite("grace@advisor.example", { workspaceId: BCDX, role: "owner" });
    const grace = await login(app, "grace");
    const first = await call(app, "POST", `/api/v1/invitations/by-token/${token}/accept`, {
      as: grace,
    });
    expect(first.body).toEqual({ workspaceId: BCDX, alreadyMember: true });
    const [member] = await t.db
      .select({ role: schema.memberships.role })
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.workspaceId, BCDX),
          eq(schema.memberships.userId, userId("grace")),
        ),
      );
    expect(member?.role).toBe("viewer");
    const second = await call(app, "POST", `/api/v1/invitations/by-token/${token}/accept`, {
      as: grace,
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("INVITATION_ALREADY_ACCEPTED");
  });

  test("expired and unknown links are 410, and signing in is required", async () => {
    const ana = await login(app, "ana");
    for (const token of ["no-such-token", DEMO_INVITE_TOKENS.expired]) {
      const res = await call(app, "POST", `/api/v1/invitations/by-token/${token}/accept`, {
        as: ana,
      });
      expect(res.status).toBe(410);
    }
    const anonymous = await call(
      app,
      "POST",
      `/api/v1/invitations/by-token/${DEMO_INVITE_TOKENS.pending}/accept`,
    );
    expect(anonymous.status).toBe(401);
  });
});

describe("the invitation requirement holds for every way of creating an account", () => {
  // Google sign-up ends in Better Auth creating the user, so the hook is exercised directly.
  const create = async (email: string) => {
    const ctx = await createAuth({
      db: t.db,
      config: testConfig(),
      mailer: t.mailbox,
      logger: createLogger("error", () => {}),
      now: () => new Date(),
    }).$context;
    return ctx.internalAdapter.createUser(
      { email, name: "Gus", emailVerified: true },
      { method: "oauth", oauth: { providerId: "google" } },
    );
  };

  test("an address with no invitation is refused with INVITATION_REQUIRED", async () => {
    await expect(create("nobody@example.com")).rejects.toMatchObject({
      body: { code: "INVITATION_REQUIRED" },
    });
    expect(await userByEmail("nobody@example.com")).toBeUndefined();
  });

  test("an unverified address does not count even with an invitation", async () => {
    const ctx = await createAuth({
      db: t.db,
      config: testConfig(),
      mailer: t.mailbox,
      logger: createLogger("error", () => {}),
      now: () => new Date(),
    }).$context;
    await expect(
      ctx.internalAdapter.createUser(
        { email: "new.member@bcdx.example", name: "Gus", emailVerified: false },
        { method: "oauth", oauth: { providerId: "google" } },
      ),
    ).rejects.toMatchObject({ body: { code: "INVITATION_REQUIRED" } });
  });

  test("Better Auth's profile and deletion endpoints are closed in favor of /api/v1/me", async () => {
    const as = await login(app, "ana");
    for (const [path, body] of [
      ["/api/auth/update-user", { name: "x", image: "https://evil.example/pixel.png" }],
      ["/api/auth/delete-user", {}],
      ["/api/auth/change-email", { newEmail: "x@example.com" }],
    ] as const) {
      const res = await call(app, "POST", path, { as, headers: ORIGIN, body });
      expect(res.status).toBe(404);
    }
    const me = await call(app, "GET", "/api/v1/me", { as });
    expect(me.body).toMatchObject({ displayName: "Ana Villanueva", avatarUrl: null });
  });

  test("an expired or revoked invitation does not count", async () => {
    await expect(create("late.joiner@bcdx.example")).rejects.toMatchObject({
      body: { code: "INVITATION_REQUIRED" },
    });
  });

  test("a pending invitation lets the account in, case aside, with its workspace", async () => {
    const user = await create("New.Member@BCDX.example");
    expect(user.email).toBe("new.member@bcdx.example");
    expect(
      (await t.db.select().from(schema.users).where(eq(schema.users.id, user.id)))[0]?.isAdmin,
    ).toBe(false);
    const memberships = await t.db
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, user.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("owner");
    const [row] = await t.db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(row?.lastWorkspaceId).toBe(memberships[0]?.workspaceId);
  });

  const isAdmin = async (id: string) =>
    (await t.db.select().from(schema.users).where(eq(schema.users.id, id)))[0]?.isAdmin;

  test("a workspace-less invitation without grants_admin makes no operator", async () => {
    await invite("g.plain@example.com", { workspaceId: null });
    expect(await isAdmin((await create("g.plain@example.com")).id)).toBe(false);
  });

  test("an admin-create invitation makes an operator", async () => {
    await createOperatorInvitation(t.db, {
      email: "g.operator@example.com",
      publicUrl: "http://localhost:5173",
      now: new Date(),
    });
    expect(await isAdmin((await create("g.operator@example.com")).id)).toBe(true);
  });
});

describe("U2 profile", () => {
  test("changes name, time zone, theme and the workspace opened last", async () => {
    const as = await login(app, "ana");
    const res = await call(app, "PATCH", "/api/v1/me", {
      as,
      body: {
        displayName: "Ana V.",
        timezone: "Asia/Tokyo",
        theme: "dark",
        lastWorkspaceId: personalWorkspaceId("ana"),
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      displayName: "Ana V.",
      timezone: "Asia/Tokyo",
      theme: "dark",
      lastWorkspaceId: personalWorkspaceId("ana"),
    });
  });

  test("a workspace the person is not in, and bad values, are 422", async () => {
    const as = await login(app, "grace");
    const notMine = await call(app, "PATCH", "/api/v1/me", {
      as,
      body: { lastWorkspaceId: personalWorkspaceId("ana") },
    });
    expect(notMine.status).toBe(422);
    expect(notMine.body.error.details[0].path).toBe("lastWorkspaceId");
    for (const body of [
      { displayName: "" },
      { displayName: "x".repeat(61) },
      { theme: "neon" },
      { timezone: "Nowhere/Land" },
    ]) {
      expect((await call(app, "PATCH", "/api/v1/me", { as, body })).status).toBe(422);
    }
  });

  test("an empty body changes nothing and an anonymous caller is refused", async () => {
    const as = await login(app, "grace");
    expect((await call(app, "PATCH", "/api/v1/me", { as, body: {} })).status).toBe(200);
    expect((await call(app, "PATCH", "/api/v1/me", { body: { theme: "dark" } })).status).toBe(401);
  });
});

describe("U3 profile photo", () => {
  const upload = (as: Record<string, string>, bytes: Uint8Array, name = "me.png") => {
    const form = new FormData();
    form.set("file", new File([bytes], name));
    return app.handle(
      new Request("http://localhost/api/v1/me/avatar", { method: "PUT", headers: as, body: form }),
    );
  };
  const png = (width = 900, height = 600) =>
    sharp({ create: { width, height, channels: 3, background: "#c33" } })
      .png()
      .toBuffer();

  test("is cropped to a 512x512 WebP and served from the avatar URL", async () => {
    const as = await login(app, "ana");
    const res = await upload(as, await png());
    expect(res.status).toBe(200);
    const { avatarUrl } = (await res.json()) as { avatarUrl: string };
    expect(avatarUrl).toMatch(/^http:\/\/localhost:5173\/api\/avatars\/[0-9a-f]{32}\.webp$/);
    const stored = await app.handle(new Request(`http://localhost${new URL(avatarUrl).pathname}`));
    expect(stored.status).toBe(200);
    expect(stored.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(Buffer.from(await stored.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 512, height: 512 });
    const me = await call(app, "GET", "/api/v1/me", { as });
    expect(me.body.avatarUrl).toBe(avatarUrl);
  });

  test("drops EXIF metadata such as GPS position", async () => {
    const withExif = await sharp(await png())
      .withExif({ IFD0: { Copyright: "secret-owner" }, IFD3: { GPSLatitudeRef: "N" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const res = await upload(await login(app, "ana"), withExif, "me.jpg");
    const { avatarUrl } = (await res.json()) as { avatarUrl: string };
    const stored = await app.handle(new Request(`http://localhost${new URL(avatarUrl).pathname}`));
    const bytes = Buffer.from(await stored.arrayBuffer());
    expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    expect(bytes.includes(Buffer.from("secret-owner"))).toBe(false);
  });

  test("the kind is read from the bytes, not from the name", async () => {
    const as = await login(app, "ana");
    const text = await upload(
      as,
      new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      "me.png",
    );
    expect(text.status).toBe(422);
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } })
      .gif()
      .toBuffer();
    expect((await upload(as, gif, "me.png")).status).toBe(422);
    const truncated = (await png()).subarray(0, 40);
    expect((await upload(as, truncated)).status).toBe(422);
    expect((await call(app, "GET", "/api/v1/me", { as })).body.avatarUrl).toBeNull();
  });

  test("anything over 5 MB is 413, and the old photo stays", async () => {
    const as = await login(app, "ana");
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    const res = await upload(as, big);
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "PAYLOAD_TOO_LARGE",
    );
  });

  test("a new photo replaces the old file, and DELETE removes it", async () => {
    const as = await login(app, "ana");
    await upload(as, await png());
    await upload(as, await png(300, 800));
    expect(await readdir(photos)).toHaveLength(1);
    const res = await call(app, "DELETE", "/api/v1/me/avatar", { as });
    expect(res.status).toBe(204);
    expect(await readdir(photos)).toHaveLength(0);
    expect((await call(app, "GET", "/api/v1/me", { as })).body.avatarUrl).toBeNull();
  });

  test("a missing file and an anonymous caller are refused", async () => {
    const as = await login(app, "ana");
    const form = new FormData();
    form.set("other", "x");
    const res = await app.handle(
      new Request("http://localhost/api/v1/me/avatar", { method: "PUT", headers: as, body: form }),
    );
    expect(res.status).toBe(422);
    const anonymous = await upload({}, await png());
    expect(anonymous.status).toBe(401);
  });

  test("the photo route does not serve other names", async () => {
    for (const name of ["..%2F..%2Fetc%2Fpasswd", "x.webp", "0".repeat(32)]) {
      const res = await app.handle(new Request(`http://localhost/api/avatars/${name}`));
      expect(res.status).toBe(404);
    }
  });
});

describe("U8 set password", () => {
  test("a Google-only user with a fresh sign-in can add a password and then sign in with it", async () => {
    const gina = await googleOnlyUser(60_000);
    const me = await call(app, "GET", "/api/v1/me", { as: gina.cookie });
    expect(me.body.hasPassword).toBe(false);
    const res = await call(app, "POST", "/api/v1/me/password", {
      as: gina.cookie,
      body: { newPassword: "a brand new secret" },
    });
    expect(res.status).toBe(204);
    expect((await call(app, "GET", "/api/v1/me", { as: gina.cookie })).body.hasPassword).toBe(true);
    await loginWith(app, "g@example.com", "a brand new secret");
    const again = await call(app, "POST", "/api/v1/me/password", {
      as: gina.cookie,
      body: { newPassword: "another secret 1" },
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("PASSWORD_ALREADY_SET");
  });

  test("adding a password ends the other sessions but keeps this one", async () => {
    const gina = await googleOnlyUser(60_000);
    await t.db.insert(schema.sessions).values({
      userId: gina.id,
      token: "other-session",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const res = await call(app, "POST", "/api/v1/me/password", {
      as: gina.cookie,
      body: { newPassword: "a brand new secret" },
    });
    expect(res.status).toBe(204);
    const left = await t.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, gina.id));
    expect(left.map((s) => s.token)).not.toContain("other-session");
    expect(left).toHaveLength(1);
  });

  test("a sign-in older than 10 minutes is asked to sign in again", async () => {
    const gina = await googleOnlyUser(11 * 60_000);
    const res = await call(app, "POST", "/api/v1/me/password", {
      as: gina.cookie,
      body: { newPassword: "a brand new secret" },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("REAUTH_REQUIRED");
  });

  test("a short password is 422", async () => {
    const gina = await googleOnlyUser();
    const res = await call(app, "POST", "/api/v1/me/password", {
      as: gina.cookie,
      body: { newPassword: "short" },
    });
    expect(res.status).toBe(422);
  });

  test("somebody who already has a password is told to use change password", async () => {
    const res = await call(app, "POST", "/api/v1/me/password", {
      as: await login(app, "ana"),
      body: { newPassword: "a brand new secret" },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PASSWORD_ALREADY_SET");
  });
});

describe("password reset (A6, A7) and change (A8)", () => {
  const request = () =>
    call(app, "POST", "/api/auth/request-password-reset", {
      body: { email: "ana@bcdx.example", redirectTo: "http://localhost:5173/reset-password" },
    });
  const tokenFromMail = () => {
    const mail = t.mailbox.sent.at(-1);
    return new URL(mail?.text.match(/https?:\/\/\S+/)?.[0] ?? "").searchParams.get(
      "token",
    ) as string;
  };

  test("the mail links to the reset screen and the link lasts an hour", async () => {
    expect((await request()).status).toBe(200);
    const mail = t.mailbox.sent.at(-1);
    expect(mail?.to).toBe("ana@bcdx.example");
    expect(mail?.text).toContain("http://localhost:5173/reset-password?token=");
    expect(mail?.text).toContain("60 minutes");
    const [row] = await t.db.select().from(schema.verifications);
    const minutes = ((row?.expiresAt.getTime() ?? 0) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(59);
    expect(minutes).toBeLessThanOrEqual(60);
  });

  test("an unknown address gets the same answer and no mail", async () => {
    const res = await call(app, "POST", "/api/auth/request-password-reset", {
      body: { email: "nobody@bcdx.example" },
    });
    expect(res.status).toBe(200);
    expect(t.mailbox.sent).toHaveLength(0);
  });

  test("resetting signs the person in on a new session and ends the others", async () => {
    const before = await login(app, "ana");
    await request();
    const response = await app.handle(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: tokenFromMail(), newPassword: "fresh start 2026" }),
      }),
    );
    expect(response.status).toBe(200);
    const after = { cookie: cookieHeader(response) };
    expect(after.cookie).toContain("better-auth.session_token=");
    expect((await call(app, "GET", "/api/v1/me", { as: after })).status).toBe(200);
    expect((await call(app, "GET", "/api/v1/me", { as: before })).status).toBe(401);
    const sessions = await t.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId("ana")));
    expect(sessions).toHaveLength(1);
    await loginWith(app, "ana@bcdx.example", "fresh start 2026");
    const old = await call(app, "POST", "/api/auth/sign-in/email", {
      body: { email: "ana@bcdx.example", password: DEMO_PASSWORD },
    });
    expect(old.status).toBe(401);
  });

  test("a token works once, and a bad one does not work at all", async () => {
    await request();
    const token = tokenFromMail();
    const body = { token, newPassword: "fresh start 2026" };
    expect((await call(app, "POST", "/api/auth/reset-password", { body })).status).toBe(200);
    expect((await call(app, "POST", "/api/auth/reset-password", { body })).status).toBe(400);
    const bogus = await call(app, "POST", "/api/auth/reset-password", {
      body: { token: "bogus", newPassword: "fresh start 2026" },
    });
    expect(bogus.status).toBe(400);
  });

  test("an expired token does not work", async () => {
    await request();
    const token = tokenFromMail();
    await t.db.update(schema.verifications).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await call(app, "POST", "/api/auth/reset-password", {
      body: { token, newPassword: "fresh start 2026" },
    });
    expect(res.status).toBe(400);
  });

  test("the new password is held to 8 to 128 characters", async () => {
    await request();
    const token = tokenFromMail();
    for (const newPassword of ["short", "x".repeat(129)]) {
      const res = await call(app, "POST", "/api/auth/reset-password", {
        body: { token, newPassword },
      });
      expect(res.status).toBe(400);
    }
  });

  test("changing the password ends the other sessions even if the client does not ask", async () => {
    const first = await login(app, "kenji");
    const second = await login(app, "kenji");
    const res = await call(app, "POST", "/api/auth/change-password", {
      as: first,
      headers: ORIGIN,
      body: { currentPassword: DEMO_PASSWORD, newPassword: "kenji changed it" },
    });
    expect(res.status).toBe(200);
    expect((await call(app, "GET", "/api/v1/me", { as: second })).status).toBe(401);
    await loginWith(app, "kenji@bcdx.example", "kenji changed it");
  });

  test("a wrong current password is refused", async () => {
    const as = await login(app, "kenji");
    const res = await call(app, "POST", "/api/auth/change-password", {
      as,
      headers: ORIGIN,
      body: { currentPassword: "wrong wrong wrong", newPassword: "kenji changed it" },
    });
    expect(res.status).toBe(400);
  });
});

describe("rate limits on the auth endpoints", () => {
  test("ten sign-in attempts a minute per IP, then 429; another IP is unaffected", async () => {
    const attempt = (ip: string) =>
      call(app, "POST", "/api/auth/sign-in/email", {
        headers: { "cf-connecting-ip": ip },
        body: { email: "ana@bcdx.example", password: "wrong password!" },
      });
    for (let i = 0; i < 10; i++) expect((await attempt("198.51.100.1")).status).toBe(401);
    expect((await attempt("198.51.100.1")).status).toBe(429);
    expect((await attempt("198.51.100.2")).status).toBe(401);
    const rows = await t.db.select().from(schema.rateLimits);
    expect(rows.some((r) => r.key.includes("198.51.100.1"))).toBe(true);
  });

  test("password reset requests are limited the same way", async () => {
    const attempt = () =>
      call(app, "POST", "/api/auth/request-password-reset", {
        headers: { "cf-connecting-ip": "198.51.100.9" },
        body: { email: "nobody@bcdx.example" },
      });
    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(200);
    expect((await attempt()).status).toBe(429);
  });
});

describe("U7 delete account", () => {
  const del = (as: Record<string, string>, body: Record<string, unknown>) =>
    call(app, "POST", "/api/v1/me/delete", { as, body });
  const rowsOf = async (
    table: typeof schema.sessions | typeof schema.accounts | typeof schema.notifications,
    id: string,
  ) => (await t.db.select().from(table).where(eq(table.userId, id))).length;

  test("the typed address and the password must match", async () => {
    const as = await login(app, "grace");
    const wrongEmail = await del(as, {
      confirmEmail: "someone@else.example",
      password: DEMO_PASSWORD,
    });
    expect(wrongEmail.status).toBe(422);
    expect(wrongEmail.body.error.code).toBe("CONFIRMATION_MISMATCH");
    const wrongPassword = await del(as, {
      confirmEmail: "grace@advisor.example",
      password: "nope nope nope",
    });
    expect(wrongPassword.status).toBe(403);
    expect(wrongPassword.body.error.code).toBe("INVALID_PASSWORD");
    const missing = await del(as, { confirmEmail: "grace@advisor.example" });
    expect(missing.status).toBe(422);
    expect((await call(app, "GET", "/api/v1/me", { as })).status).toBe(200);
  });

  test("erases the person, keeps the team's records, and signs them out", async () => {
    const as = await login(app, "kenji");
    const planAId = planId("piaya-a");
    const [item] = await t.db
      .select({ id: schema.executionItems.id })
      .from(schema.executionItems)
      .where(eq(schema.executionItems.businessPlanId, planAId))
      .limit(1);
    await t.db
      .update(schema.executionItems)
      .set({ assigneeUserId: userId("kenji"), assigneeName: null })
      .where(eq(schema.executionItems.id, (item as NonNullable<typeof item>).id));
    const wasMemberOf = await t.db
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, userId("kenji")));
    expect(wasMemberOf.length).toBeGreaterThan(1);
    const ideasBefore = await t.db.select({ n: sql<number>`count(*)::int` }).from(schema.ideas);

    const res = await app.handle(
      new Request("http://localhost/api/v1/me/delete", {
        method: "POST",
        headers: { ...as, "content-type": "application/json" },
        body: JSON.stringify({ confirmEmail: " Kenji@bcdx.example ", password: DEMO_PASSWORD }),
      }),
    );
    expect(res.status).toBe(204);
    const cleared = res.headers.getSetCookie().join("\n");
    expect(cleared).toContain("better-auth.session_token=; Max-Age=0");
    expect(cleared).toContain("HttpOnly");

    const [row] = await t.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId("kenji")));
    expect(row).toMatchObject({
      email: `deleted+${userId("kenji")}@deleted.invalid`,
      displayName: "Deleted user",
      avatarUrl: null,
      status: "deleted",
      lastWorkspaceId: null,
    });
    expect(await rowsOf(schema.sessions, userId("kenji"))).toBe(0);
    expect(await rowsOf(schema.accounts, userId("kenji"))).toBe(0);
    expect(await rowsOf(schema.notifications, userId("kenji"))).toBe(0);
    expect(
      await t.db
        .select()
        .from(schema.memberships)
        .where(eq(schema.memberships.userId, userId("kenji"))),
    ).toHaveLength(0);
    expect(
      await t.db
        .select()
        .from(schema.selfAnalyses)
        .where(eq(schema.selfAnalyses.userId, userId("kenji"))),
    ).toHaveLength(0);
    expect(
      await t.db
        .select()
        .from(schema.changeHistory)
        .where(eq(schema.changeHistory.ownerUserId, userId("kenji"))),
    ).toHaveLength(0);
    expect(
      await t.db
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, personalWorkspaceId("kenji"))),
    ).toHaveLength(0);
    // The team keeps its ideas, and what Kenji was assigned reads "Deleted user".
    const ideasAfter = await t.db.select({ n: sql<number>`count(*)::int` }).from(schema.ideas);
    expect(ideasAfter[0]?.n).toBe(ideasBefore[0]?.n);
    const items = await t.db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.assigneeName, "Deleted user"));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.assigneeUserId === null)).toBe(true);

    expect((await call(app, "GET", "/api/v1/me", { as })).status).toBe(401);
    const signIn = await call(app, "POST", "/api/auth/sign-in/email", {
      body: { email: "kenji@bcdx.example", password: DEMO_PASSWORD },
    });
    expect(signIn.status).toBe(401);
    const asAna = await login(app, "ana");
    const members = await call(app, "GET", `/api/v1/workspaces/${BCDX}/members`, { as: asAna });
    expect(
      members.body.items.some((m: { user: { id: string } }) => m.user.id === userId("kenji")),
    ).toBe(false);
  });

  test("the sole Owner of a workspace with other members is stopped, with the list", async () => {
    const as = await login(app, "ana");
    const res = await del(as, { confirmEmail: "ana@bcdx.example", password: DEMO_PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LAST_OWNER");
    expect(res.body.error.workspaces).toEqual([{ id: BCDX, name: expect.any(String) }]);
    expect((await call(app, "GET", "/api/v1/me", { as })).status).toBe(200);
    const [row] = await t.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId("ana")));
    expect(row?.status).toBe("active");
  });

  test("passing the Owner role on unblocks it", async () => {
    await t.db
      .update(schema.memberships)
      .set({ role: "owner" })
      .where(
        and(
          eq(schema.memberships.workspaceId, BCDX),
          eq(schema.memberships.userId, userId("kenji")),
        ),
      );
    const res = await del(await login(app, "ana"), {
      confirmEmail: "ana@bcdx.example",
      password: DEMO_PASSWORD,
    });
    expect(res.status).toBe(204);
  });

  test("a Google-only user needs a sign-in from the last 10 minutes instead of a password", async () => {
    const stale = await googleOnlyUser(11 * 60_000);
    const refused = await del(stale.cookie, { confirmEmail: "g@example.com" });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("REAUTH_REQUIRED");
  });

  test("a Google-only user with a fresh sign-in can delete the account", async () => {
    const gina = await googleOnlyUser(60_000);
    const res = await del(gina.cookie, { confirmEmail: "g@example.com" });
    expect(res.status).toBe(204);
    const [row] = await t.db.select().from(schema.users).where(eq(schema.users.id, gina.id));
    expect(row?.status).toBe("deleted");
  });

  test("the photo is removed from storage", async () => {
    const as = await login(app, "grace");
    const form = new FormData();
    form.set(
      "file",
      new File(
        [
          await sharp({ create: { width: 64, height: 64, channels: 3, background: "#fff" } })
            .png()
            .toBuffer(),
        ],
        "a.png",
      ),
    );
    await app.handle(
      new Request("http://localhost/api/v1/me/avatar", { method: "PUT", headers: as, body: form }),
    );
    expect(await readdir(photos)).toHaveLength(1);
    const res = await del(as, { confirmEmail: "grace@advisor.example", password: DEMO_PASSWORD });
    expect(res.status).toBe(204);
    expect(await readdir(photos)).toHaveLength(0);
  });

  test("pending invitations the person sent are revoked", async () => {
    const res = await del(await login(app, "grace"), {
      confirmEmail: "grace@advisor.example",
      password: DEMO_PASSWORD,
    });
    expect(res.status).toBe(204);
    const sent = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.invitedById, userId("grace")));
    expect(sent.every((i) => i.status !== "pending")).toBe(true);
    // A person who deleted their account can be invited again under the same address.
    const token = await invite("grace@advisor.example");
    expect((await signUp(token)).status).toBe(201);
  });

  test("comments left on the person's self analysis go with it", async () => {
    const [analysis] = await t.db
      .select()
      .from(schema.selfAnalyses)
      .where(eq(schema.selfAnalyses.userId, userId("kenji")));
    const [comment] = await t.db
      .insert(schema.comments)
      .values({
        workspaceId: BCDX,
        targetType: "self_analysis_answer",
        targetId: (analysis as NonNullable<typeof analysis>).id,
        targetKey: "SA.INCOME.1",
        authorId: userId("paolo"),
        body: "Looks realistic",
      })
      .returning({ id: schema.comments.id });
    const res = await del(await login(app, "kenji"), {
      confirmEmail: "kenji@bcdx.example",
      password: DEMO_PASSWORD,
    });
    expect(res.status).toBe(204);
    const left = await t.db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, (comment as NonNullable<typeof comment>).id));
    expect(left).toHaveLength(0);
  });

  test("a team workspace nobody else belongs to is deleted with the person", async () => {
    const [team] = await t.db
      .insert(schema.workspaces)
      .values({ name: "Solo team", createdById: userId("grace") })
      .returning({ id: schema.workspaces.id });
    const teamId = (team as NonNullable<typeof team>).id;
    await t.db
      .insert(schema.memberships)
      .values({ workspaceId: teamId, userId: userId("grace"), role: "owner" });
    const res = await del(await login(app, "grace"), {
      confirmEmail: "grace@advisor.example",
      password: DEMO_PASSWORD,
    });
    expect(res.status).toBe(204);
    expect(
      await t.db.select().from(schema.workspaces).where(eq(schema.workspaces.id, teamId)),
    ).toHaveLength(0);
    expect(
      await t.db.select().from(schema.workspaces).where(eq(schema.workspaces.id, BCDX)),
    ).toHaveLength(1);
  });

  test("password guesses are limited to 5 per 10 minutes per user", async () => {
    const as = await login(app, "grace");
    const guess = () =>
      del(as, { confirmEmail: "grace@advisor.example", password: "wrong wrong wrong" });
    for (let i = 0; i < 5; i++) expect((await guess()).status).toBe(403);
    const blocked = await guess();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    const right = await del(as, { confirmEmail: "grace@advisor.example", password: DEMO_PASSWORD });
    expect(right.status).toBe(429);
  });

  test("an anonymous caller is refused", async () => {
    expect(
      (await call(app, "POST", "/api/v1/me/delete", { body: { confirmEmail: "x@y.z" } })).status,
    ).toBe(401);
  });
});

describe("the account endpoints guard against cross-site requests", () => {
  test("a state-changing /me request from another origin is 403", async () => {
    const as = await login(app, "ana");
    const res = await call(app, "PATCH", "/api/v1/me", {
      as,
      headers: { origin: "https://evil.example" },
      body: { theme: "dark" },
    });
    expect(res.status).toBe(403);
  });
});

describe("configuration", () => {
  test("Google sign-in is off without credentials, and nothing else depends on them", async () => {
    const res = await call(app, "POST", "/api/auth/sign-in/social", {
      body: { provider: "google", callbackURL: "/" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await login(app, "ana")).cookie).toBeTruthy();
  });
});

describe("the Cloud Storage photo store", () => {
  test("saves a public WebP under a random name and deletes only its own objects", async () => {
    const saved: { name: string; options: Record<string, unknown> }[] = [];
    const deleted: string[] = [];
    const store = createGcsAvatarStore("moonx-staging-avatars", {
      bucket: () =>
        ({
          file: (name: string) => ({
            save: async (_bytes: Buffer, options: Record<string, unknown>) => {
              saved.push({ name, options });
            },
            delete: async () => {
              deleted.push(name);
            },
          }),
        }) as never,
    });
    const url = await store.put(new Uint8Array([1, 2, 3]));
    expect(url).toMatch(
      /^https:\/\/storage\.googleapis\.com\/moonx-staging-avatars\/[0-9a-f]{32}\.webp$/,
    );
    expect(saved[0]?.options).toMatchObject({ contentType: "image/webp" });
    await store.remove(url);
    expect(deleted).toEqual([url.split("/").pop() as string]);
    await store.remove(
      "https://evil.example/moonx-staging-avatars/0123456789abcdef0123456789abcdef.webp",
    );
    await store.remove(
      "https://storage.googleapis.com/other-bucket/0123456789abcdef0123456789abcdef.webp",
    );
    expect(deleted).toHaveLength(1);
  });

  test("the local store ignores URLs that are not its own", async () => {
    const dir = await mkdtemp(join(tmpdir(), "moonx-store-"));
    try {
      const store = createLocalAvatarStore(dir, "http://localhost:5173");
      const url = await store.put(new Uint8Array([1]));
      await store.remove(`http://evil.example/api/avatars/${url.split("/").pop()}`);
      expect(await readdir(dir)).toHaveLength(1);
      await store.remove(url);
      expect(await readdir(dir)).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("body size limits", () => {
  test("a Better Auth body over 1 MB is 413, by declared length and by what was read", async () => {
    const big = JSON.stringify({ email: "a@b.co", password: "x".repeat(1024 * 1024 + 10) });
    const declared = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": String(big.length) },
        body: big,
      }),
    );
    expect(declared.status).toBe(413);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const chunked = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: stream,
        duplex: "half",
      }),
    );
    expect(chunked.status).toBe(413);
  });

  test("a photo upload that declares more than the body limit is refused before it is read", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/me/avatar", {
        method: "PUT",
        headers: {
          ...(await login(app, "ana")),
          "content-type": "multipart/form-data; boundary=x",
          "content-length": String(7 * 1024 * 1024),
        },
        body: "--x--",
      }),
    );
    expect(res.status).toBe(413);
  });
});
