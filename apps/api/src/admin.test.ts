import { afterAll, describe, expect, test } from "bun:test";
import {
  invitations,
  memberships,
  notifications,
  rateLimits,
  sessions,
  users,
  workspaces,
} from "@moonx/db";
import {
  adminInvitationPageSchema,
  adminInvitationResultSchema,
  adminUserPageSchema,
  adminUserSchema,
  adminWorkspacePageSchema,
  errorBodySchema,
  invitationListSchema,
  invitationSignUpResultSchema,
  memberListSchema,
} from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { ApiError } from "./errors";
import { lockActiveCaller } from "./lock";
import type { Mailer } from "./mail";
import {
  buildTestApp,
  connectTestDatabase,
  type LogLine,
  uniqueIp,
} from "./test-app";
import {
  apiRequest,
  signIn,
  TEST_PASSWORD,
  testFixtures,
  uniqueEmail,
  untilBlockedBy,
} from "./test-fixtures";
import { INVITATION_SEND_LIMIT } from "./workspace-invitations";

// AD7–AD9 (SDD 5.13): 28. The database is shared with the other tests, so each test
// finds its own rows by a word only they carry.

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
const testApp = buildTestApp(database);
const { app } = testApp;

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

/** A word no other row holds. */
const word = () => `w${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;

async function operator() {
  const user = await fixtures.createUser({
    displayName: "Moonx Admin",
    isAdmin: true,
  });
  return { ...user, cookie: await signIn(app, user.email, uniqueIp()) };
}

const call = (
  method: "GET" | "POST",
  path: string,
  cookie: string,
  body?: unknown,
  target = app,
) =>
  target.handle(apiRequest(method, `/api/v1/admin${path}`, { cookie, body }));

describe("AD7 GET /api/v1/admin/users", () => {
  test("lists users by name with deleted ones last, and finds them by name or address", async () => {
    const admin = await operator();
    const tag = word();
    const bee = await fixtures.createUser({
      displayName: `Bee ${tag}`,
      email: `bee-${tag}@example.com`,
    });
    const ann = await fixtures.createUser({ displayName: `ann ${tag}` });
    const gone = await fixtures.createUser({
      displayName: `Aaron ${tag}`,
      status: "deleted",
    });
    const one = await fixtures.createWorkspace();
    const two = await fixtures.createWorkspace();
    await fixtures.addMember(one.id, ann.id, "owner");
    await fixtures.addMember(two.id, ann.id, "viewer");
    // Signing in moves the last activity (SDD 5.13).
    await signIn(app, bee.email, uniqueIp());

    const response = await call(
      "GET",
      `/users?q=${tag.toUpperCase()}`,
      admin.cookie,
    );
    expect(response.status).toBe(200);
    const page = adminUserPageSchema.parse(await response.json());
    expect(page.items.map((user) => user.id)).toEqual([
      ann.id,
      bee.id,
      gone.id,
    ]);
    expect(page.nextCursor).toBeNull();
    expect(page.items[0]).toEqual({
      id: ann.id,
      displayName: `ann ${tag}`,
      email: ann.email,
      createdAt: ann.createdAt.toISOString(),
      lastActiveAt: null,
      workspaceCount: 2,
      status: "active",
      isAdmin: false,
    });
    expect(page.items[1]?.lastActiveAt).not.toBeNull();
    expect(page.items[2]?.status).toBe("deleted");

    const byAddress = adminUserPageSchema.parse(
      await (await call("GET", `/users?q=bee-${tag}@`, admin.cookie)).json(),
    );
    expect(byAddress.items.map((user) => user.id)).toEqual([bee.id]);
    const deleted = adminUserPageSchema.parse(
      await (
        await call("GET", `/users?q=${tag}&status=deleted`, admin.cookie)
      ).json(),
    );
    expect(deleted.items.map((user) => user.id)).toEqual([gone.id]);

    const first = adminUserPageSchema.parse(
      await (await call("GET", `/users?q=${tag}&limit=2`, admin.cookie)).json(),
    );
    expect(first).toMatchObject({ nextCursor: "2" });
    const rest = adminUserPageSchema.parse(
      await (
        await call("GET", `/users?q=${tag}&limit=2&cursor=2`, admin.cookie)
      ).json(),
    );
    expect(rest.items.map((user) => user.id)).toEqual([gone.id]);
    expect(rest.nextCursor).toBeNull();
  });

  test("refuses a status it does not know and a NUL in the search", async () => {
    const admin = await operator();
    for (const query of ["status=away", "q=%00", "cursor=x"]) {
      const response = await call("GET", `/users?${query}`, admin.cookie);
      expect(response.status).toBe(422);
    }
  });
});

describe("AD7 GET /api/v1/admin/workspaces", () => {
  test("lists workspaces with their owners and how much they hold", async () => {
    const admin = await operator();
    const tag = word();
    const team = await fixtures.createTeam();
    await db
      .update(workspaces)
      .set({ name: `Team ${tag}` })
      .where(eq(workspaces.id, team.workspace.id));
    const personal = await fixtures.createWorkspace({
      name: `${tag}'s workspace`,
      isPersonal: true,
    });
    await fixtures.createIdea(team.workspace.id, team.owner.id);
    await fixtures.createIdea(team.workspace.id, team.owner.id, {
      archivedAt: new Date(),
    });
    // Undoing a creation removes an idea (SDD 5.11): it counts nowhere.
    await fixtures.createIdea(team.workspace.id, team.owner.id, {
      deletedAt: new Date(),
    });
    await db
      .update(users)
      .set({ status: "suspended" })
      .where(eq(users.id, team.owner.id));
    await db
      .update(memberships)
      .set({ role: "owner" })
      .where(eq(memberships.userId, team.member.id));

    const response = await call("GET", `/workspaces?q=${tag}`, admin.cookie);
    expect(response.status).toBe(200);
    const page = adminWorkspacePageSchema.parse(await response.json());
    expect(page.items).toEqual([
      {
        id: team.workspace.id,
        name: `Team ${tag}`,
        isPersonal: false,
        // By name: "Member", then "Owner".
        owners: [
          {
            id: team.member.id,
            displayName: "Member",
            avatarUrl: null,
            badge: null,
          },
          {
            id: team.owner.id,
            displayName: "Owner",
            avatarUrl: null,
            badge: "suspended",
          },
        ],
        memberCount: 3,
        ideaCount: 2,
        lastActiveAt: null,
      },
      {
        id: personal.id,
        name: `${tag}'s workspace`,
        isPersonal: true,
        owners: [],
        memberCount: 0,
        ideaCount: 0,
        lastActiveAt: null,
      },
    ]);
  });
});

describe("AD7 GET /api/v1/admin/invitations", () => {
  test("lists the valid invitations of every workspace and of none, newest first", async () => {
    const admin = await operator();
    const team = await fixtures.createTeam();
    const revoked = await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "member",
      invitedById: team.owner.id,
      status: "revoked",
    });
    const toWorkspace = await fixtures.createInvitation({
      email: uniqueEmail(),
      workspaceId: team.workspace.id,
      role: "viewer",
      invitedById: team.owner.id,
    });
    const toNone = await fixtures.createInvitation({
      email: uniqueEmail(),
      invitedById: admin.id,
    });
    // An inviter who left shows as they are, not as a former member (SDD 5.2).
    await db.delete(memberships).where(eq(memberships.userId, team.owner.id));

    const pending = adminInvitationPageSchema.parse(
      await (await call("GET", "/invitations?limit=200", admin.cookie)).json(),
    );
    const ids = pending.items.map((invitation) => invitation.id);
    expect(ids.indexOf(toNone.id)).toBeLessThan(ids.indexOf(toWorkspace.id));
    expect(ids).not.toContain(revoked.id);
    expect(pending.items.find((i) => i.id === toWorkspace.id)).toMatchObject({
      workspace: { id: team.workspace.id },
      role: "viewer",
      status: "pending",
      invitedBy: { id: team.owner.id, badge: null },
    });
    expect(pending.items.find((i) => i.id === toNone.id)).toMatchObject({
      workspace: null,
      role: null,
    });
    const all = adminInvitationPageSchema.parse(
      await (
        await call("GET", "/invitations?status=all&limit=200", admin.cookie)
      ).json(),
    );
    expect(all.items.find((i) => i.id === revoked.id)?.status).toBe("revoked");
  });
});

describe("AD8 POST /api/v1/admin/users/{userId}/suspend・/reactivate", () => {
  test("signs the user out and keeps them out until resumed, everything kept", async () => {
    const admin = await operator();
    const team = await fixtures.createTeam();
    const cookie = await signIn(app, team.member.email, uniqueIp());

    const suspended = await call(
      "POST",
      `/users/${team.member.id}/suspend`,
      admin.cookie,
    );
    expect(suspended.status).toBe(200);
    expect(adminUserSchema.parse(await suspended.json())).toMatchObject({
      id: team.member.id,
      status: "suspended",
      // The team, and the personal workspace signing in set up (SDD 5.4).
      workspaceCount: 2,
    });
    expect(
      await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, team.member.id)),
    ).toEqual([]);
    const me = await app.handle(apiRequest("GET", "/api/v1/me", { cookie }));
    expect(me.status).toBe(401);
    const signInAgain = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({
          email: team.member.email,
          password: TEST_PASSWORD,
        }),
      }),
    );
    expect(signInAgain.status).toBe(403);
    expect(await signInAgain.json()).toMatchObject({
      code: "ACCOUNT_SUSPENDED",
    });
    // The membership stays, under a "(suspended)" name (design-spec 6.17).
    const members = memberListSchema.parse(
      await (
        await app.handle(
          apiRequest("GET", `/api/v1/workspaces/${team.workspace.id}/members`, {
            cookie: await signIn(app, team.owner.email, uniqueIp()),
          }),
        )
      ).json(),
    );
    expect(
      members.items.find((m) => m.user.id === team.member.id)?.user.badge,
    ).toBe("suspended");
    const twice = await call(
      "POST",
      `/users/${team.member.id}/suspend`,
      admin.cookie,
    );
    expect(twice.status).toBe(200);

    const resumed = await call(
      "POST",
      `/users/${team.member.id}/reactivate`,
      admin.cookie,
    );
    expect(resumed.status).toBe(200);
    expect(adminUserSchema.parse(await resumed.json()).status).toBe("active");
    const back = await signIn(app, team.member.email, uniqueIp());
    expect(
      (await app.handle(apiRequest("GET", "/api/v1/me", { cookie: back })))
        .status,
    ).toBe(200);
    expect(
      (await call("POST", `/users/${team.member.id}/reactivate`, admin.cookie))
        .status,
    ).toBe(200);
  });

  test("waits for the user's own write in progress, and notifies nobody", async () => {
    const admin = await operator();
    const team = await fixtures.createTeam();
    const notices = () =>
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, team.member.id));
    const started: { response?: Promise<Response> } = {};
    await db.transaction(async (tx) => {
      // As a write of the member's own holds it (lockActiveCaller).
      await lockActiveCaller(tx, team.member.id);
      started.response = call(
        "POST",
        `/users/${team.member.id}/suspend`,
        admin.cookie,
      );
      await untilBlockedBy(db, tx);
    });
    expect((await started.response)?.status).toBe(200);
    expect(await notices()).toEqual([]);
  });

  test("refuses the operator themselves, deleted accounts and unknown ids", async () => {
    const admin = await operator();
    const self = await call("POST", `/users/${admin.id}/suspend`, admin.cookie);
    expect(self.status).toBe(422);
    expect((await errorOf(self)).code).toBe("CANNOT_SUSPEND_SELF");
    const gone = await fixtures.createUser({ status: "deleted" });
    for (const path of [
      `/users/${gone.id}/suspend`,
      `/users/${gone.id}/reactivate`,
      `/users/${crypto.randomUUID()}/suspend`,
      "/users/nobody/reactivate",
    ]) {
      const response = await call("POST", path, admin.cookie);
      expect(response.status).toBe(404);
    }
  });
});

/** How many invitation mails `userId` has sent in the current window (SDD 7.2). */
const sendCount = async (userId: string) =>
  (
    await db
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(
        eq(rateLimits.key, `app:user:${INVITATION_SEND_LIMIT.name}:${userId}`),
      )
  )[0]?.count ?? 0;

/** The mails the console transport wrote to `lines`, to `to`. */
const mailsTo = (lines: readonly LogLine[], to: string) =>
  lines.filter((line) => line.message === "mail" && line.to === to);

describe("AD9 POST /api/v1/admin/invitations", () => {
  test("invites to a workspace, mails the link and answers with it", async () => {
    const admin = await operator();
    const team = await fixtures.createTeam();
    const email = uniqueEmail("invited");
    const response = await call("POST", "/invitations", admin.cookie, {
      email,
      workspaceId: team.workspace.id,
      role: "member",
    });
    expect(response.status).toBe(201);
    const result = adminInvitationResultSchema.parse(await response.json());
    expect(result.invitation).toMatchObject({
      email,
      role: "member",
      workspace: { id: team.workspace.id, name: "Team" },
      status: "pending",
      invitedBy: { id: admin.id, displayName: "Moonx Admin" },
    });
    expect(result.link).toMatch(
      /^http:\/\/localhost:5173\/invite\/[A-Za-z0-9_-]{43}$/,
    );
    const [mail] = mailsTo(testApp.lines, email);
    expect(String(mail?.text)).toContain(result.link);
    const [row] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, result.invitation.id));
    expect(row).toMatchObject({ grantsAdmin: false, invitedById: admin.id });
    // Valid for 7 days, as W4's (design-spec 6.16).
    expect(
      new Date(result.invitation.expiresAt).getTime() -
        new Date(result.invitation.createdAt).getTime(),
    ).toBe(7 * 24 * 60 * 60 * 1000);
    // On 9, the operator, never a member, is not a former member (SDD 5.5).
    const listed = invitationListSchema.parse(
      await (
        await app.handle(
          apiRequest(
            "GET",
            `/api/v1/workspaces/${team.workspace.id}/invitations`,
            { cookie: await signIn(app, team.owner.email, uniqueIp()) },
          ),
        )
      ).json(),
    );
    expect(
      listed.items.find((i) => i.id === result.invitation.id)?.invitedBy,
    ).toMatchObject({ id: admin.id, badge: null });

    const member = await call("POST", "/invitations", admin.cookie, {
      email: team.viewer.email.toUpperCase(),
      workspaceId: team.workspace.id,
      role: "owner",
    });
    expect(member.status).toBe(409);
    expect((await errorOf(member)).code).toBe("ALREADY_MEMBER");
    const pending = await call("POST", "/invitations", admin.cookie, {
      email,
      workspaceId: team.workspace.id,
      role: "viewer",
    });
    expect(pending.status).toBe(409);
    expect(await errorOf(pending)).toMatchObject({
      code: "INVITATION_PENDING",
      invitationId: result.invitation.id,
    });
    // Only the invitation that was mailed counts (SDD 7.2).
    expect(await sendCount(admin.id)).toBe(1);
  });

  test("invites to no workspace, which makes no operator", async () => {
    const admin = await operator();
    const email = uniqueEmail("solo");
    const response = await call("POST", "/invitations", admin.cookie, {
      email,
    });
    expect(response.status).toBe(201);
    const result = adminInvitationResultSchema.parse(await response.json());
    expect(result.invitation).toMatchObject({ workspace: null, role: null });
    const again = await call("POST", "/invitations", admin.cookie, { email });
    expect((await errorOf(again)).code).toBe("INVITATION_PENDING");

    const token = result.link.split("/").at(-1);
    const signedUp = await app.handle(
      apiRequest("POST", `/api/v1/invitations/by-token/${token}/sign-up`, {
        body: {
          displayName: "Solo",
          password: TEST_PASSWORD,
          timezone: "Asia/Manila",
        },
      }),
    );
    expect(signedUp.status).toBe(201);
    const { me } = invitationSignUpResultSchema.parse(await signedUp.json());
    expect(me.isAdmin).toBe(false);
  });

  test("checks the role against the workspace, and the workspace", async () => {
    const admin = await operator();
    const team = await fixtures.createTeam();
    for (const body of [
      { email: uniqueEmail(), workspaceId: team.workspace.id },
      { email: uniqueEmail(), role: "member" },
    ]) {
      const response = await call("POST", "/invitations", admin.cookie, body);
      expect(response.status).toBe(422);
      expect((await errorOf(response)).details?.[0]?.path).toBe("role");
    }
    const missing = await call("POST", "/invitations", admin.cookie, {
      email: uniqueEmail(),
      workspaceId: crypto.randomUUID(),
      role: "member",
    });
    expect(missing.status).toBe(404);
  });

  test("counts with W4 and W5 against 20 an hour, and makes nothing Resend does not take", async () => {
    const admin = await operator();
    await db.insert(rateLimits).values({
      key: `app:user:${INVITATION_SEND_LIMIT.name}:${admin.id}`,
      count: INVITATION_SEND_LIMIT.max,
      lastRequest: Date.now(),
    });
    const limited = await call("POST", "/invitations", admin.cookie, {
      email: uniqueEmail(),
    });
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).retryAfterSeconds).toBeGreaterThan(0);

    const other = await operator();
    const failing: Mailer = {
      send: async () => {
        throw new ApiError(
          "UPSTREAM_UNAVAILABLE",
          "The mail service did not take the mail",
        );
      },
    };
    const built = buildTestApp(database, { mailer: failing });
    const email = uniqueEmail();
    const response = await call(
      "POST",
      "/invitations",
      other.cookie,
      { email },
      built.app,
    );
    expect(response.status).toBe(503);
    expect((await errorOf(response)).code).toBe("UPSTREAM_UNAVAILABLE");
    expect(
      await db.select().from(invitations).where(eq(invitations.email, email)),
    ).toEqual([]);
    expect(await sendCount(other.id)).toBe(0);
  });
});

describe("the operator's screens", () => {
  test("refuse everyone but operators", async () => {
    const team = await fixtures.createTeam();
    const cookie = await signIn(app, team.owner.email, uniqueIp());
    for (const response of [
      await call("GET", "/users", cookie),
      await call("GET", "/workspaces", cookie),
      await call("GET", "/invitations", cookie),
      await call("POST", `/users/${team.member.id}/suspend`, cookie),
      await call("POST", "/invitations", cookie, { email: uniqueEmail() }),
    ]) {
      expect(response.status).toBe(403);
    }
  });
});
