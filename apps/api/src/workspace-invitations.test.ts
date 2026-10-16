import { afterAll, describe, expect, test } from "bun:test";
import {
  hashInvitationToken,
  INVITATION_VALID_MS,
  invitations,
  rateLimits,
  users,
} from "@moonx/db";
import { errorBodySchema, invitationListSchema } from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { DELETED_USER_NAME } from "./account-deletion";
import { ApiError } from "./errors";
import type { Mailer } from "./mail";
import {
  buildTestApp,
  connectTestDatabase,
  type LogLine,
  uniqueIp,
} from "./test-app";
import {
  apiRequest,
  duringAccountDeletion,
  signIn,
  testFixtures,
  uniqueEmail,
} from "./test-fixtures";
import { INVITATION_SEND_LIMIT } from "./workspace-invitations";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
const testApp = buildTestApp(database);
const { app } = testApp;
const DAY_MS = 24 * 60 * 60 * 1000;

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

const cookieOf = (user: { email: string }, target = app) =>
  signIn(target, user.email, uniqueIp());

const invitationRow = async (id: string) =>
  (await db.select().from(invitations).where(eq(invitations.id, id)))[0];

/** The mails the console transport wrote to `lines`, to `to`. */
const mailsTo = (lines: readonly LogLine[], to: string) =>
  lines.filter((line) => line.message === "mail" && line.to === to);

/** The token in the link of a mail. */
const tokenIn = (mail: LogLine | undefined) =>
  /\/invite\/([A-Za-z0-9_-]+)/.exec(String(mail?.text))?.[1];

const invite = async (
  workspaceId: string,
  caller: { email: string },
  body: { email: string; role: string },
  target = app,
) =>
  target.handle(
    apiRequest("POST", `/api/v1/workspaces/${workspaceId}/invitations`, {
      cookie: await cookieOf(caller, target),
      body,
    }),
  );

/** A mailer whose sends Resend never takes. */
const failingMailer: Mailer = {
  send: async () => {
    throw new ApiError(
      "UPSTREAM_UNAVAILABLE",
      "The mail service did not take the mail",
    );
  },
};

describe("W4 POST /api/v1/workspaces/{workspaceId}/invitations", () => {
  test("invites by mail and never answers the link", async () => {
    const team = await fixtures.createTeam();
    const email = uniqueEmail("invitee");

    const response = await invite(team.workspace.id, team.owner, {
      email,
      role: "viewer",
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("/invite/");
    expect(body).toMatchObject({
      invitation: {
        email,
        role: "viewer",
        workspace: { id: team.workspace.id, name: team.workspace.name },
        status: "pending",
        invitedBy: { id: team.owner.id, displayName: "Owner", badge: null },
        acceptedAt: null,
      },
    });
    const [mail] = mailsTo(testApp.lines, email);
    expect(mail).toMatchObject({
      subject: `Join ${team.workspace.name} on moonx`,
    });
    const token = tokenIn(mail);
    expect(String(mail?.text)).toBe(
      `Owner invited you to join ${team.workspace.name} on moonx as Viewer.\n\nOpen this link within 7 days to accept:\nhttp://localhost:5173/invite/${token}\n\nIf you weren't expecting this, ignore this email.`,
    );
    const preview = await app.handle(
      new Request(`http://localhost/api/v1/invitations/by-token/${token}`),
    );
    expect(await preview.json()).toMatchObject({ email, role: "viewer" });
  });

  test("refuses a member's address and a second valid invitation, ignoring case", async () => {
    const team = await fixtures.createTeam();
    const member = await invite(team.workspace.id, team.owner, {
      email: team.member.email.toUpperCase(),
      role: "member",
    });
    expect(member.status).toBe(409);
    expect((await errorOf(member)).code).toBe("ALREADY_MEMBER");

    const email = uniqueEmail("twice");
    const first = await invite(team.workspace.id, team.owner, {
      email,
      role: "member",
    });
    const { invitation } = (await first.json()) as {
      invitation: { id: string };
    };
    const second = await invite(team.workspace.id, team.owner, {
      email: email.toUpperCase(),
      role: "viewer",
    });
    expect(second.status).toBe(409);
    const error = await errorOf(second);
    expect(error.code).toBe("INVITATION_PENDING");
    expect(error.invitationId).toBe(invitation.id);
  });

  test("lets an expired invitation be replaced by a new one", async () => {
    const team = await fixtures.createTeam();
    const email = uniqueEmail("late");
    await fixtures.createInvitation({
      email,
      workspaceId: team.workspace.id,
      role: "member",
      expiresAt: new Date(Date.now() - DAY_MS),
    });

    const response = await invite(team.workspace.id, team.owner, {
      email,
      role: "member",
    });

    expect(response.status).toBe(201);
  });

  test("makes no invitation when the mail cannot be sent", async () => {
    const built = buildTestApp(database, { mailer: failingMailer });
    const team = await fixtures.createTeam();
    const email = uniqueEmail("unreachable");

    const response = await invite(
      team.workspace.id,
      team.owner,
      { email, role: "member" },
      built.app,
    );

    expect(response.status).toBe(503);
    expect((await errorOf(response)).code).toBe("UPSTREAM_UNAVAILABLE");
    expect(
      await db.select().from(invitations).where(eq(invitations.email, email)),
    ).toEqual([]);
  });

  test("lets one of two invitations to the same address at once through", async () => {
    const team = await fixtures.createTeam();
    const email = uniqueEmail("race");
    const cookie = await cookieOf(team.owner);

    const statuses = await Promise.all(
      [0, 1].map(
        async () =>
          (
            await app.handle(
              apiRequest(
                "POST",
                `/api/v1/workspaces/${team.workspace.id}/invitations`,
                { cookie, body: { email, role: "member" } },
              ),
            )
          ).status,
      ),
    );

    expect(statuses.sort()).toEqual([201, 409]);
  });

  test("counts with W5 against 20 an hour per user", async () => {
    const team = await fixtures.createTeam();
    await db.insert(rateLimits).values({
      key: `app:user:${INVITATION_SEND_LIMIT.name}:${team.owner.id}`,
      count: INVITATION_SEND_LIMIT.max,
      lastRequest: Date.now(),
    });

    const response = await invite(team.workspace.id, team.owner, {
      email: uniqueEmail(),
      role: "member",
    });
    expect(response.status).toBe(429);
    expect((await errorOf(response)).retryAfterSeconds).toBeGreaterThan(0);

    const pending = await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "member",
    });
    const resent = await app.handle(
      apiRequest("POST", `/api/v1/invitations/${pending.id}/resend`, {
        cookie: await cookieOf(team.owner),
      }),
    );
    expect(resent.status).toBe(429);
  });

  test("counts only the requests that go on to mail, W5's included", async () => {
    const team = await fixtures.createTeam();
    const key = `app:user:${INVITATION_SEND_LIMIT.name}:${team.owner.id}`;
    await db.insert(rateLimits).values({
      key,
      count: INVITATION_SEND_LIMIT.max - 1,
      lastRequest: Date.now(),
    });
    const accepted = await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "member",
      status: "accepted",
    });

    const member = await invite(team.workspace.id, team.owner, {
      email: team.member.email,
      role: "member",
    });
    expect(member.status).toBe(409);
    const resent = await app.handle(
      apiRequest("POST", `/api/v1/invitations/${accepted.id}/resend`, {
        cookie: await cookieOf(team.owner),
      }),
    );
    expect(resent.status).toBe(409);
    const last = await invite(team.workspace.id, team.owner, {
      email: uniqueEmail(),
      role: "member",
    });
    expect(last.status).toBe(201);
    const over = await invite(team.workspace.id, team.owner, {
      email: uniqueEmail(),
      role: "member",
    });
    expect(over.status).toBe(429);
  });

  test("refuses an inviter whose account is deleted while the request waits", async () => {
    const team = await fixtures.createTeam();
    const email = uniqueEmail("late");
    const cookie = await cookieOf(team.owner);

    const response = await duringAccountDeletion(db, team.owner.id, () =>
      app.handle(
        apiRequest(
          "POST",
          `/api/v1/workspaces/${team.workspace.id}/invitations`,
          { cookie, body: { email, role: "member" } },
        ),
      ),
    );

    expect(response.status).toBe(401);
    expect(
      await db.select().from(invitations).where(eq(invitations.email, email)),
    ).toEqual([]);
  });

  test("holds the address to the rule of design-spec 6.0.8", async () => {
    const team = await fixtures.createTeam();
    for (const body of [
      { email: "not an address", role: "member" },
      { email: uniqueEmail(), role: "admin" },
    ]) {
      const response = await invite(team.workspace.id, team.owner, body);
      expect(response.status).toBe(422);
    }
  });
});

describe("W4 GET /api/v1/workspaces/{workspaceId}/invitations", () => {
  test("lists the ones that can be accepted, or all of them, newest first", async () => {
    const team = await fixtures.createTeam();
    const make = (
      values: Partial<typeof invitations.$inferInsert>,
      daysAgo: number,
    ) =>
      fixtures.createInvitation({
        email: uniqueEmail(),
        workspaceId: team.workspace.id,
        role: "member",
        invitedById: team.owner.id,
        createdAt: new Date(Date.now() - daysAgo * DAY_MS),
        ...values,
      });
    const pending = await make({}, 1);
    const expired = await make({ expiresAt: new Date(Date.now() - DAY_MS) }, 9);
    const accepted = await make(
      { status: "accepted", acceptedAt: new Date() },
      3,
    );
    const revoked = await make({ status: "revoked" }, 2);
    const cookie = await cookieOf(team.owner);
    const list = async (query: string) =>
      invitationListSchema.parse(
        await (
          await app.handle(
            apiRequest(
              "GET",
              `/api/v1/workspaces/${team.workspace.id}/invitations${query}`,
              { cookie },
            ),
          )
        ).json(),
      ).items;

    expect((await list("")).map((item) => item.id)).toEqual([pending.id]);
    expect(
      (await list("?status=all")).map((item) => [item.id, item.status]),
    ).toEqual([
      [pending.id, "pending"],
      [revoked.id, "revoked"],
      [accepted.id, "accepted"],
      [expired.id, "expired"],
    ]);
    const refused = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/workspaces/${team.workspace.id}/invitations?status=revoked`,
        { cookie },
      ),
    );
    expect(refused.status).toBe(422);
  });

  test("shows an inviter who left as a former member", async () => {
    const team = await fixtures.createTeam();
    const gone = await fixtures.createUser({ displayName: "Gone" });
    await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "member",
      invitedById: gone.id,
    });

    const response = await app.handle(
      apiRequest("GET", `/api/v1/workspaces/${team.workspace.id}/invitations`, {
        cookie: await cookieOf(team.owner),
      }),
    );

    const { items } = invitationListSchema.parse(await response.json());
    expect(items[0]?.invitedBy).toMatchObject({
      id: gone.id,
      badge: "former_member",
    });
  });
});

describe("W5 POST /api/v1/invitations/{invitationId}/resend", () => {
  const resend = async (id: string, caller: { email: string }, target = app) =>
    target.handle(
      apiRequest("POST", `/api/v1/invitations/${id}/resend`, {
        cookie: await cookieOf(caller, target),
      }),
    );

  test("mails a new link, ends the old one and counts the expiry from now", async () => {
    const team = await fixtures.createTeam();
    const old = await fixtures.createInvitation({
      email: uniqueEmail("again"),
      workspaceId: team.workspace.id,
      role: "member",
      invitedById: team.owner.id,
      expiresAt: new Date(Date.now() - DAY_MS),
    });
    const before = Date.now();

    const response = await resend(old.id, team.owner);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      invitation: { id: old.id, status: "pending" },
    });
    const row = await invitationRow(old.id);
    expect(row?.tokenHash).not.toBe(hashInvitationToken(old.token));
    expect(row?.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + INVITATION_VALID_MS,
    );
    const token = tokenIn(mailsTo(testApp.lines, old.email).at(-1));
    expect(row?.tokenHash).toBe(hashInvitationToken(token ?? ""));
    const stale = await app.handle(
      new Request(`http://localhost/api/v1/invitations/by-token/${old.token}`),
    );
    expect(stale.status).toBe(410);
  });

  test("refuses an accepted or revoked invitation", async () => {
    const team = await fixtures.createTeam();
    const accepted = await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "member",
      status: "accepted",
    });
    const revoked = await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "member",
      status: "revoked",
    });

    const first = await resend(accepted.id, team.owner);
    expect(first.status).toBe(409);
    expect((await errorOf(first)).code).toBe("INVITATION_ALREADY_ACCEPTED");
    const second = await resend(revoked.id, team.owner);
    expect(second.status).toBe(410);
    expect((await errorOf(second)).code).toBe("INVITATION_INVALID");
  });

  test("lets an operator resend any invitation, workspace or none, and nobody else one without a workspace", async () => {
    const team = await fixtures.createTeam();
    const email = uniqueEmail("anyone");
    const noWorkspace = await fixtures.createInvitation({ email });

    const byOperator = await resend(noWorkspace.id, team.admin);
    expect(byOperator.status).toBe(200);
    const [mail] = mailsTo(testApp.lines, email);
    expect(mail).toMatchObject({ subject: "Join moonx" });
    expect(String(mail?.text)).toStartWith(
      "You're invited to join moonx.\n\nOpen this link within 7 days to accept:",
    );

    const byOwner = await resend(noWorkspace.id, team.owner);
    expect(byOwner.status).toBe(403);
    expect((await errorOf(byOwner)).code).toBe("FORBIDDEN");
  });

  test("tells a non-member and a non-Owner apart, and answers 404 for no invitation", async () => {
    const team = await fixtures.createTeam();
    const invitation = await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "member",
    });
    const stranger = await fixtures.createUser();

    const outsider = await resend(invitation.id, stranger);
    expect((await errorOf(outsider)).code).toBe("NO_ACCESS");
    const member = await resend(invitation.id, team.member);
    expect((await errorOf(member)).code).toBe("FORBIDDEN");
    for (const id of [crypto.randomUUID(), "not-a-uuid"]) {
      const missing = await resend(id, team.owner);
      expect(missing.status).toBe(404);
    }
  });

  test("names no inviter whose account was deleted", async () => {
    const team = await fixtures.createTeam();
    const gone = await fixtures.createUser();
    await db
      .update(users)
      .set({ status: "deleted", displayName: DELETED_USER_NAME })
      .where(eq(users.id, gone.id));
    const email = uniqueEmail("orphan");
    const invitation = await fixtures.createInvitation({
      email,
      workspaceId: team.workspace.id,
      role: "owner",
      invitedById: gone.id,
    });

    const response = await resend(invitation.id, team.owner);

    expect(response.status).toBe(200);
    expect(String(mailsTo(testApp.lines, email)[0]?.text)).toStartWith(
      `You're invited to join ${team.workspace.name} on moonx as Owner.`,
    );
  });

  test("keeps the old link when the mail cannot be sent", async () => {
    const built = buildTestApp(database, { mailer: failingMailer });
    const team = await fixtures.createTeam();
    const invitation = await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "member",
    });

    const response = await resend(invitation.id, team.owner, built.app);

    expect(response.status).toBe(503);
    expect((await invitationRow(invitation.id))?.tokenHash).toBe(
      hashInvitationToken(invitation.token),
    );
  });

  test("refuses to mail a member, or beside another valid invitation, as W4 does", async () => {
    const team = await fixtures.createTeam();
    const email = uniqueEmail("twice");
    const expired = await fixtures.createInvitation({
      email,
      workspaceId: team.workspace.id,
      role: "member",
      expiresAt: new Date(Date.now() - DAY_MS),
    });
    const replaced = await invite(team.workspace.id, team.owner, {
      email: email.toUpperCase(),
      role: "viewer",
    });
    const { invitation } = (await replaced.json()) as {
      invitation: { id: string };
    };

    const pending = await resend(expired.id, team.owner);
    expect(pending.status).toBe(409);
    const error = await errorOf(pending);
    expect(error.code).toBe("INVITATION_PENDING");
    expect(error.invitationId).toBe(invitation.id);

    const joined = await fixtures.createInvitation({
      email: team.member.email,
      workspaceId: team.workspace.id,
      role: "viewer",
      expiresAt: new Date(Date.now() - DAY_MS),
    });
    const member = await resend(joined.id, team.owner);
    expect(member.status).toBe(409);
    expect((await errorOf(member)).code).toBe("ALREADY_MEMBER");
  });

  test("refuses an operator a second valid invitation without a workspace", async () => {
    const team = await fixtures.createTeam();
    const email = uniqueEmail("anyone");
    const expired = await fixtures.createInvitation({
      email,
      expiresAt: new Date(Date.now() - DAY_MS),
    });
    const valid = await fixtures.createInvitation({ email });

    const response = await resend(expired.id, team.admin);

    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({
      code: "INVITATION_PENDING",
      invitationId: valid.id,
    });
  });

  test("names the operator who invited to no workspace", async () => {
    const team = await fixtures.createTeam();
    await db
      .update(users)
      .set({ displayName: "Olivia Operator" })
      .where(eq(users.id, team.admin.id));
    const email = uniqueEmail("anyone");
    const invitation = await fixtures.createInvitation({
      email,
      invitedById: team.admin.id,
    });

    const response = await resend(invitation.id, team.admin);

    expect(response.status).toBe(200);
    expect(String(mailsTo(testApp.lines, email)[0]?.text)).toStartWith(
      "Olivia Operator invited you to join moonx.\n\nOpen this link within 7 days to accept:",
    );
  });

  test("leaves invitations without a workspace to operators", async () => {
    const team = await fixtures.createTeam();
    const invitation = await fixtures.createInvitation({
      email: uniqueEmail(),
    });

    for (const caller of [team.member, team.viewer]) {
      const response = await resend(invitation.id, caller);
      expect(response.status).toBe(403);
      expect((await errorOf(response)).code).toBe("FORBIDDEN");
    }
  });
});

describe("W7 DELETE /api/v1/invitations/{invitationId}", () => {
  const revoke = async (id: string, caller: { email: string }) =>
    app.handle(
      apiRequest("DELETE", `/api/v1/invitations/${id}`, {
        cookie: await cookieOf(caller),
      }),
    );

  test("revokes a pending invitation, expired or not, so its link stops working", async () => {
    const team = await fixtures.createTeam();
    for (const expiresAt of [
      new Date(Date.now() + DAY_MS),
      new Date(Date.now() - DAY_MS),
    ]) {
      const invitation = await fixtures.createInvitation({
        email: uniqueEmail(),
        workspaceId: team.workspace.id,
        role: "member",
        expiresAt,
      });

      const response = await revoke(invitation.id, team.owner);

      expect(response.status).toBe(204);
      expect((await invitationRow(invitation.id))?.status).toBe("revoked");
      const link = await app.handle(
        new Request(
          `http://localhost/api/v1/invitations/by-token/${invitation.token}`,
        ),
      );
      expect(link.status).toBe(410);
    }
  });

  test("refuses an accepted or revoked invitation", async () => {
    const team = await fixtures.createTeam();
    const accepted = await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "member",
      status: "accepted",
    });
    const revoked = await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "member",
      status: "revoked",
    });

    expect((await revoke(accepted.id, team.owner)).status).toBe(409);
    expect((await revoke(revoked.id, team.owner)).status).toBe(410);
  });

  test("lets only an operator revoke an invitation without a workspace", async () => {
    const team = await fixtures.createTeam();
    const invitation = await fixtures.createInvitation({
      email: uniqueEmail(),
    });

    for (const caller of [team.owner, team.member, team.viewer]) {
      const response = await revoke(invitation.id, caller);
      expect(response.status).toBe(403);
      expect((await errorOf(response)).code).toBe("FORBIDDEN");
    }
    expect((await revoke(invitation.id, team.admin)).status).toBe(204);
  });
});
