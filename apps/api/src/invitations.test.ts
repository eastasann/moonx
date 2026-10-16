import { afterAll, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import {
  accounts,
  hashInvitationToken,
  INVITATION_VALID_MS,
  invitations,
  memberships,
  users,
  workspaces,
} from "@moonx/db";
import { errorBodySchema, meSchema } from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { DELETED_USER_NAME } from "./account-deletion";
import { AUTH_IP_LIMIT } from "./auth";
import { issueAdminInvitation } from "./invitations";
import { buildTestApp, connectTestDatabase, uniqueIp } from "./test-app";
import {
  cookiesOf,
  duringAccountDeletion,
  signIn,
  testFixtures,
  uniqueEmail,
} from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
const { app } = buildTestApp(database);
const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_PASSWORD = "a long new password";

const byToken = (token: string, rest = "") =>
  `http://localhost/api/v1/invitations/by-token/${token}${rest}`;

function preview(token: string, target = app) {
  return target.handle(
    new Request(byToken(token), { headers: { "x-forwarded-for": uniqueIp() } }),
  );
}

function signUp(
  token: string,
  body: unknown = {
    displayName: "New Person",
    password: NEW_PASSWORD,
    timezone: "Asia/Manila",
  },
  ip = uniqueIp(),
) {
  return app.handle(
    new Request(byToken(token, "/sign-up"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

function accept(token: string, cookie?: string) {
  return app.handle(
    new Request(byToken(token, "/accept"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": uniqueIp(),
        ...(cookie === undefined ? {} : { cookie }),
      },
    }),
  );
}

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

const invitationRow = async (id: string) =>
  (await db.select().from(invitations).where(eq(invitations.id, id)))[0];

/** A workspace with its owner as a member, and an invitation to it. */
async function workspaceInvitation(
  values: Partial<typeof invitations.$inferInsert> = {},
) {
  const owner = await fixtures.createUser({ displayName: "Inviter" });
  const workspace = await fixtures.createWorkspace({
    createdById: owner.id,
    name: "Invited Team",
  });
  await fixtures.addMember(workspace.id, owner.id, "owner");
  const invitation = await fixtures.createInvitation({
    email: uniqueEmail("invited"),
    workspaceId: workspace.id,
    role: "member",
    invitedById: owner.id,
    ...values,
  });
  return { owner, workspace, invitation };
}

describe("U4 GET /api/v1/invitations/by-token/{token}", () => {
  test("shows a pending invitation", async () => {
    const { owner, workspace, invitation } = await workspaceInvitation();

    const response = await preview(invitation.token);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "pending",
      email: invitation.email,
      workspace: { id: workspace.id, name: "Invited Team" },
      role: "member",
      invitedBy: { displayName: owner.displayName },
      expiresAt: invitation.expiresAt.toISOString(),
      accountExists: false,
    });
  });

  test("tells whether an account has the address, ignoring case", async () => {
    const { invitation } = await workspaceInvitation();
    await fixtures.createUser({ email: invitation.email.toUpperCase() });

    const body = (await (await preview(invitation.token)).json()) as {
      accountExists: boolean;
    };

    expect(body.accountExists).toBe(true);
  });

  test("shows an accepted invitation, even past its expiry", async () => {
    const { invitation } = await workspaceInvitation({
      status: "accepted",
      expiresAt: new Date(Date.now() - DAY_MS),
    });

    const response = await preview(invitation.token);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "accepted" });
  });

  test("shows an invitation from make admin-create without a workspace or inviter", async () => {
    const email = uniqueEmail("operator");
    const { token } = await issueAdminInvitation(db, email, new Date());

    expect(await (await preview(token)).json()).toMatchObject({
      status: "pending",
      email,
      workspace: null,
      role: null,
      invitedBy: null,
    });
  });

  test("names no inviter whose account was deleted, as the mail does", async () => {
    const { invitation, owner } = await workspaceInvitation();
    await db
      .update(users)
      .set({ status: "deleted", displayName: DELETED_USER_NAME })
      .where(eq(users.id, owner.id));

    expect(await (await preview(invitation.token)).json()).toMatchObject({
      invitedBy: null,
    });
  });

  test("answers 410 INVITATION_INVALID for an unknown, revoked or expired link", async () => {
    const { invitation: revoked } = await workspaceInvitation({
      status: "revoked",
    });
    const { invitation: expired } = await workspaceInvitation({
      expiresAt: new Date(Date.now() - 1),
    });

    for (const token of ["no-such-token", revoked.token, expired.token]) {
      const response = await preview(token);
      expect(response.status).toBe(410);
      expect((await errorOf(response)).code).toBe("INVITATION_INVALID");
    }
  });

  test("goes by the app's clock", async () => {
    const { invitation } = await workspaceInvitation();
    const { app: later } = buildTestApp(database, {
      now: () => invitation.expiresAt.getTime(),
    });

    expect((await preview(invitation.token, later)).status).toBe(410);
  });
});

describe("U5 POST /api/v1/invitations/by-token/{token}/sign-up", () => {
  test("creates the account for the invitation's address and answers signed in", async () => {
    const { invitation } = await workspaceInvitation();

    const response = await signUp(invitation.token, {
      displayName: "New Person",
      password: NEW_PASSWORD,
      timezone: "Asia/Tokyo",
      // Not part of the body: the address is the invitation's.
      email: "someone.else@example.com",
    });

    expect(response.status).toBe(201);
    const { me } = (await response.json()) as { me: unknown };
    const parsed = meSchema.parse(me);
    expect(parsed).toMatchObject({
      email: invitation.email,
      displayName: "New Person",
      avatarUrl: null,
      timezone: "Asia/Tokyo",
      theme: "system",
      isAdmin: false,
      hasPassword: true,
    });
    // The invitation to a workspace waits for onboarding (U6).
    expect(parsed.memberships).toEqual([
      {
        workspace: {
          id: parsed.lastWorkspaceId ?? "",
          name: "New Person's workspace",
          isPersonal: true,
          currency: "PHP",
        },
        role: "owner",
      },
    ]);
    expect((await invitationRow(invitation.id))?.status).toBe("pending");
    const [user] = await db.select().from(users).where(eq(users.id, parsed.id));
    expect(user?.emailVerified).toBe(true);

    // The session works, and the password sits on a credential account as Better
    // Auth's own sign-up keeps it (signing in with it: the lower-case test below).
    const session = await app.handle(
      new Request("http://localhost/api/auth/get-session", {
        headers: { cookie: cookiesOf(response) },
      }),
    );
    expect(
      ((await session.json()) as { user: { id: string } } | null)?.user.id,
    ).toBe(parsed.id);
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, parsed.id));
    expect(account).toMatchObject({
      providerId: "credential",
      accountId: parsed.id,
    });
  });

  test("accepts an invitation without a workspace at sign-up, making an operator only when it grants it", async () => {
    for (const grantsAdmin of [false, true]) {
      const invitation = await fixtures.createInvitation({
        email: uniqueEmail("solo"),
        grantsAdmin,
      });

      const response = await signUp(invitation.token);

      expect(response.status).toBe(201);
      const { me } = (await response.json()) as {
        me: { id: string; isAdmin: boolean };
      };
      expect(me.isAdmin).toBe(grantsAdmin);
      expect(await invitationRow(invitation.id)).toMatchObject({
        status: "accepted",
        acceptedById: me.id,
      });
    }
  });

  test("stores the address in lower case, so its owner can sign in", async () => {
    const email = uniqueEmail("Capital");
    const { invitation } = await workspaceInvitation({
      email: email.toUpperCase(),
    });

    const response = await signUp(invitation.token);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      me: { email: email.toLowerCase() },
    });
    const signedIn = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({
          email: email.toUpperCase(),
          password: NEW_PASSWORD,
        }),
      }),
    );
    expect(signedIn.status).toBe(200);
  });

  test("answers 409 EMAIL_TAKEN when an account has the address", async () => {
    const { invitation } = await workspaceInvitation();
    await fixtures.createUser({ email: invitation.email.toUpperCase() });

    const response = await signUp(invitation.token);

    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("EMAIL_TAKEN");
  });

  test("lets one of two sign-ups through one link win", async () => {
    const { invitation } = await workspaceInvitation();

    const responses = await Promise.all([
      signUp(invitation.token),
      signUp(invitation.token),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const created = await db
      .select()
      .from(users)
      .where(eq(users.email, invitation.email));
    expect(created).toHaveLength(1);
  });

  test("lets one of two sign-ups for one address through two links win", async () => {
    const email = uniqueEmail("twice");
    const first = await workspaceInvitation({ email });
    const second = await workspaceInvitation({ email });

    const responses = await Promise.all([
      signUp(first.invitation.token),
      signUp(second.invitation.token),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
  });

  test("answers 410 INVITATION_INVALID for a link that cannot sign up", async () => {
    const { invitation: revoked } = await workspaceInvitation({
      status: "revoked",
    });
    const { invitation: expired } = await workspaceInvitation({
      expiresAt: new Date(Date.now() - 1),
    });
    const { invitation: accepted } = await workspaceInvitation({
      status: "accepted",
    });

    for (const token of [
      "no-such-token",
      revoked.token,
      expired.token,
      accepted.token,
    ]) {
      const response = await signUp(token);
      expect(response.status).toBe(410);
      expect((await errorOf(response)).code).toBe("INVITATION_INVALID");
    }
  });

  test("answers 422 VALIDATION_FAILED for values outside design-spec 6.0.8", async () => {
    const { invitation } = await workspaceInvitation();

    for (const [body, path] of [
      [
        { displayName: "  ", password: NEW_PASSWORD, timezone: "UTC" },
        "displayName",
      ],
      [{ displayName: "A", password: "short", timezone: "UTC" }, "password"],
      [
        { displayName: "A", password: NEW_PASSWORD, timezone: "Mars/Base" },
        "timezone",
      ],
      [{ displayName: "A", password: NEW_PASSWORD }, "timezone"],
    ] as const) {
      const response = await signUp(invitation.token, body);
      expect(response.status).toBe(422);
      const error = await errorOf(response);
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.details?.map((detail) => detail.path)).toContain(path);
    }
    expect(
      await db.select().from(users).where(eq(users.email, invitation.email)),
    ).toEqual([]);
  });

  test("shares the per-IP window of the sign-in paths (SDD 7.2)", async () => {
    const { invitation } = await workspaceInvitation();
    const ip = uniqueIp();
    for (let attempt = 1; attempt < AUTH_IP_LIMIT.max; attempt++) {
      const failed = await app.handle(
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": ip,
          },
          body: JSON.stringify({
            email: "nobody@example.com",
            password: "x".repeat(8),
          }),
        }),
      );
      expect(failed.status).toBe(401);
    }
    expect((await signUp("no-such-token", undefined, ip)).status).toBe(410);

    const limited = await signUp(invitation.token, undefined, ip);

    expect(limited.status).toBe(429);
    const error = await errorOf(limited);
    expect(error).toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: expect.any(Number),
    });
    const signInLimited = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({
          email: "nobody@example.com",
          password: "x".repeat(8),
        }),
      }),
    );
    expect(signInLimited.status).toBe(429);
  });
});

describe("U6 POST /api/v1/invitations/by-token/{token}/accept", () => {
  /** An account, signed in, with an invitation to its address written in capitals. */
  async function invitee(
    invitationValues: Partial<typeof invitations.$inferInsert> = {},
  ) {
    const email = uniqueEmail("invited");
    const setup = await workspaceInvitation({
      email: email.toUpperCase(),
      ...invitationValues,
    });
    const user = await fixtures.createUser({ email });
    const cookie = await signIn(app, user.email, uniqueIp());
    return { ...setup, user, cookie };
  }

  test("joins the workspace with the invitation's role", async () => {
    const { workspace, invitation, user, cookie } = await invitee({
      role: "viewer",
    });

    const response = await accept(invitation.token, cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workspaceId: workspace.id,
      alreadyMember: false,
    });
    const [membership] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspace.id),
          eq(memberships.userId, user.id),
        ),
      );
    expect(membership?.role).toBe("viewer");
    expect(await invitationRow(invitation.id)).toMatchObject({
      status: "accepted",
      acceptedById: user.id,
      acceptedAt: expect.any(Date),
    });
    const [touched] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspace.id));
    expect(touched?.lastActiveAt).not.toBeNull();
  });

  test("makes no member of an account deleted while the request waits", async () => {
    const { workspace, invitation, user, cookie } = await invitee();

    const response = await duringAccountDeletion(db, user.id, () =>
      accept(invitation.token, cookie),
    );

    expect(response.status).toBe(401);
    expect(
      await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, workspace.id),
            eq(memberships.userId, user.id),
          ),
        ),
    ).toEqual([]);
    expect((await invitationRow(invitation.id))?.status).toBe("pending");
  });

  test("keeps the role of someone already in the workspace", async () => {
    const { workspace, invitation, user, cookie } = await invitee({
      role: "viewer",
    });
    await fixtures.addMember(workspace.id, user.id, "owner");

    const response = await accept(invitation.token, cookie);

    expect(await response.json()).toEqual({
      workspaceId: workspace.id,
      alreadyMember: true,
    });
    const [membership] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspace.id),
          eq(memberships.userId, user.id),
        ),
      );
    expect(membership?.role).toBe("owner");
    expect((await invitationRow(invitation.id))?.status).toBe("accepted");
  });

  test("answers 403 INVITATION_EMAIL_MISMATCH to another account, naming the address", async () => {
    const { invitation } = await workspaceInvitation();
    const stranger = await fixtures.createUser();

    const response = await accept(
      invitation.token,
      await signIn(app, stranger.email, uniqueIp()),
    );

    expect(response.status).toBe(403);
    expect(await errorOf(response)).toMatchObject({
      code: "INVITATION_EMAIL_MISMATCH",
      invitedEmail: invitation.email,
    });
    expect((await invitationRow(invitation.id))?.status).toBe("pending");
  });

  test("checks the link before the address, and the address before the state (SDD 5.4 U6)", async () => {
    const stranger = await fixtures.createUser();
    const cookie = await signIn(app, stranger.email, uniqueIp());
    const { invitation: accepted } = await workspaceInvitation({
      status: "accepted",
    });
    const { invitation: expired } = await workspaceInvitation({
      expiresAt: new Date(Date.now() - 1),
    });

    expect((await errorOf(await accept(accepted.token, cookie))).code).toBe(
      "INVITATION_EMAIL_MISMATCH",
    );
    expect((await errorOf(await accept(expired.token, cookie))).code).toBe(
      "INVITATION_INVALID",
    );
  });

  test("answers 409 INVITATION_ALREADY_ACCEPTED to a used link, even past its expiry", async () => {
    const { invitation, cookie } = await invitee();
    expect((await accept(invitation.token, cookie)).status).toBe(200);

    const again = await accept(invitation.token, cookie);

    expect(again.status).toBe(409);
    expect((await errorOf(again)).code).toBe("INVITATION_ALREADY_ACCEPTED");
    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(invitations.id, invitation.id));
    expect((await errorOf(await accept(invitation.token, cookie))).code).toBe(
      "INVITATION_ALREADY_ACCEPTED",
    );
  });

  test("accepts once when the same link is accepted twice at once", async () => {
    const { invitation, cookie } = await invitee();

    const responses = await Promise.all([
      accept(invitation.token, cookie),
      accept(invitation.token, cookie),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
  });

  test("answers 410 INVITATION_INVALID for an expired, revoked or unknown link", async () => {
    for (const values of [
      { expiresAt: new Date(Date.now() - 1) },
      { status: "revoked" as const },
    ]) {
      const { invitation, cookie } = await invitee(values);
      const response = await accept(invitation.token, cookie);
      expect(response.status).toBe(410);
      expect((await errorOf(response)).code).toBe("INVITATION_INVALID");
    }
    const user = await fixtures.createUser();
    const unknown = await accept(
      "no-such-token",
      await signIn(app, user.email, uniqueIp()),
    );
    expect(unknown.status).toBe(410);
  });

  test("makes an operator only through an invitation that grants it", async () => {
    for (const grantsAdmin of [false, true]) {
      const user = await fixtures.createUser();
      // Signed in first: the first sign-in of a user without a personal workspace
      // accepts such invitations itself (SDD 5.4「登録の後」).
      const cookie = await signIn(app, user.email, uniqueIp());
      const invitation = await fixtures.createInvitation({
        email: user.email,
        grantsAdmin,
      });

      const response = await accept(invitation.token, cookie);

      expect(await response.json()).toEqual({
        workspaceId: null,
        alreadyMember: false,
      });
      const [row] = await db.select().from(users).where(eq(users.id, user.id));
      expect(row?.isAdmin).toBe(grantsAdmin);
    }
  });

  test("answers 401 without a session", async () => {
    const { invitation } = await workspaceInvitation();

    const response = await accept(invitation.token);

    expect(response.status).toBe(401);
    expect((await invitationRow(invitation.id))?.status).toBe("pending");
  });
});

describe("make admin-create (ADR-010)", () => {
  test("issues an invitation without a workspace that grants operator rights", async () => {
    const email = uniqueEmail("first-operator");
    const at = new Date("2026-10-15T08:00:00.000Z");

    const { token, invitation } = await issueAdminInvitation(db, email, at);

    expect(invitation).toMatchObject({
      email,
      workspaceId: null,
      role: null,
      grantsAdmin: true,
      invitedById: null,
      status: "pending",
      tokenHash: hashInvitationToken(token),
      expiresAt: new Date(at.getTime() + INVITATION_VALID_MS),
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("reissues a valid invitation without a workspace to the address, with a new link", async () => {
    const operator = await fixtures.createUser({ isAdmin: true });
    const email = uniqueEmail("promoted");
    const issued = await fixtures.createInvitation({
      email,
      invitedById: operator.id,
    });
    const { invitation: toWorkspace } = await workspaceInvitation({ email });
    const expired = await fixtures.createInvitation({
      email,
      expiresAt: new Date(Date.now() - 1),
    });

    const { token, invitation } = await issueAdminInvitation(
      db,
      email.toUpperCase(),
      new Date(),
    );

    expect(invitation.id).toBe(issued.id);
    expect(invitation.grantsAdmin).toBe(true);
    // It is make admin-create's invitation now, which names no inviter (U4).
    expect(invitation.invitedById).toBeNull();
    expect((await preview(issued.token)).status).toBe(410);
    expect((await preview(token)).status).toBe(200);
    expect((await invitationRow(toWorkspace.id))?.grantsAdmin).toBe(false);
    expect((await invitationRow(expired.id))?.grantsAdmin).toBe(false);
  });

  test("prints a link to the site that signs up an operator", async () => {
    const email = uniqueEmail("cli");
    const child = Bun.spawn(
      ["bun", `${import.meta.dir}/../scripts/admin-create.ts`, email],
      {
        // Outside the repository, so Bun cannot pick up the root .env.
        cwd: tmpdir(),
        env: {
          PATH: process.env.PATH ?? "",
          DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
          BETTER_AUTH_URL: "https://stg.example.com",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    expect(await child.exited).toBe(0);
    const output = await new Response(child.stdout).text();
    const link = output.match(/https:\/\/stg\.example\.com\/invite\/(\S+)/);
    expect(link).not.toBeNull();
    const token = link?.[1] ?? "";

    const response = await signUp(token);
    expect(response.status).toBe(201);
    const { me } = (await response.json()) as {
      me: { email: string; isAdmin: boolean };
    };
    expect(me).toMatchObject({ email, isAdmin: true });
  }, 15_000);

  test("refuses to run without a valid address or the site's URL", async () => {
    for (const [args, env] of [
      [["not-an-address"], { BETTER_AUTH_URL: "https://stg.example.com" }],
      [[uniqueEmail()], { BETTER_AUTH_URL: "" }],
    ] as const) {
      const child = Bun.spawn(
        ["bun", `${import.meta.dir}/../scripts/admin-create.ts`, ...args],
        {
          cwd: tmpdir(),
          env: {
            PATH: process.env.PATH ?? "",
            DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
            ...env,
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      expect(await child.exited).toBe(1);
    }
  }, 15_000);
});
