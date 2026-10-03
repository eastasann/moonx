import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, personalWorkspaceId, seedDemo, userId } from "@moonx/db/seed";
import { and, eq } from "drizzle-orm";
import { hashInvitationToken } from "../src/lib/invitation-token";
import { RATE_LIMITS } from "../src/lib/rate-limit";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let as: Record<"admin" | "ana" | "kenji" | "paolo" | "grace", Record<string, string>>;

beforeAll(async () => {
  t = await startTestApp();
  as = {
    admin: await login(t.app, "admin"),
    ana: await login(t.app, "ana"),
    kenji: await login(t.app, "kenji"),
    paolo: await login(t.app, "paolo"),
    grace: await login(t.app, "grace"),
  };
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await seedDemo(t.db);
  t.mailbox.sent.length = 0;
});

const ws = `/api/v1/workspaces/${BCDX}`;
const OTHER = "00000000-0000-4000-8000-000000000001";

const tokenOf = (link: string) => link.split("/invite/")[1] as string;

async function invite(email = "new.person@example.com", role = "member", who = as.ana) {
  return call(t.app, "POST", `${ws}/invitations`, { as: who, body: { email, role } });
}

describe("W0 POST /workspaces", () => {
  test("creates a workspace owned by the caller and opens it", async () => {
    const res = await call(t.app, "POST", "/api/v1/workspaces", {
      as: as.kenji,
      body: { name: "  Cafe  ", currency: "USD" },
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: "Cafe",
      currency: "USD",
      isPersonal: false,
      myRole: "owner",
      memberCount: 1,
    });
    const [user] = await t.db
      .select({ last: schema.users.lastWorkspaceId })
      .from(schema.users)
      .where(eq(schema.users.id, userId("kenji")));
    expect(user?.last).toBe(res.body.id);
  });

  test("currency defaults to PHP; any signed-in role may create, a visitor may not", async () => {
    const res = await call(t.app, "POST", "/api/v1/workspaces", {
      as: as.grace,
      body: { name: "Mine" },
    });
    expect(res.status).toBe(201);
    expect(res.body.currency).toBe("PHP");
    const anon = await call(t.app, "POST", "/api/v1/workspaces", { body: { name: "x" } });
    expect(anon.status).toBe(401);
  });

  test("422 on a blank or long name and a bad currency", async () => {
    for (const body of [{ name: "  " }, { name: "x".repeat(61) }, { name: "a", currency: "usd" }]) {
      const res = await call(t.app, "POST", "/api/v1/workspaces", { as: as.ana, body });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
  });
});

describe("W1 GET / PATCH /workspaces/{id}", () => {
  test("every member role reads it", async () => {
    for (const [who, role] of [
      ["ana", "owner"],
      ["kenji", "member"],
      ["grace", "viewer"],
    ] as const) {
      const res = await call(t.app, "GET", ws, { as: as[who] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: BCDX,
        name: "BCDX",
        currency: "PHP",
        isPersonal: false,
        myRole: role,
        memberCount: 4,
      });
    }
  });

  test("401 / 403 NO_ACCESS for a non-member and for the Admin / 404 unknown", async () => {
    expect((await call(t.app, "GET", ws)).status).toBe(401);
    const admin = await call(t.app, "GET", ws, { as: as.admin });
    expect(admin.status).toBe(403);
    expect(admin.body.error.code).toBe("NO_ACCESS");
    const outsider = await call(t.app, "GET", `/api/v1/workspaces/${personalWorkspaceId("ana")}`, {
      as: as.kenji,
    });
    expect(outsider.body.error.code).toBe("NO_ACCESS");
    expect((await call(t.app, "GET", `/api/v1/workspaces/${OTHER}`, { as: as.ana })).status).toBe(
      404,
    );
    expect((await call(t.app, "GET", "/api/v1/workspaces/nope", { as: as.ana })).status).toBe(422);
  });

  test("PATCH by the Owner changes name and currency, not the activity time", async () => {
    const [before] = await t.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, BCDX));
    const res = await call(t.app, "PATCH", ws, {
      as: as.ana,
      body: { name: "BCDX Labs", currency: "USD" },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "BCDX Labs", currency: "USD", myRole: "owner" });
    const [after] = await t.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, BCDX));
    expect(after?.lastActiveAt?.getTime()).toBe(before?.lastActiveAt?.getTime());
    const partial = await call(t.app, "PATCH", ws, { as: as.ana, body: { name: "Only name" } });
    expect(partial.body).toMatchObject({ name: "Only name", currency: "USD" });
  });

  test("PATCH is Owner only and validated", async () => {
    for (const who of ["kenji", "grace", "admin"] as const) {
      const res = await call(t.app, "PATCH", ws, { as: as[who], body: { name: "x" } });
      expect(res.status).toBe(403);
    }
    expect(
      (await call(t.app, "PATCH", ws, { as: as.kenji, body: { name: "x" } })).body.error.code,
    ).toBe("FORBIDDEN");
    expect((await call(t.app, "PATCH", ws, { as: as.ana, body: { name: "" } })).status).toBe(422);
    expect(
      (await call(t.app, "PATCH", ws, { as: as.ana, body: { currency: "peso" } })).status,
    ).toBe(422);
    const [row] = await t.db.select().from(schema.workspaces).where(eq(schema.workspaces.id, BCDX));
    expect(row?.name).toBe("BCDX");
  });
});

describe("W2 GET members", () => {
  test("Owner sees emails, others do not; Owners come first", async () => {
    const owner = await call(t.app, "GET", `${ws}/members`, { as: as.ana });
    expect(owner.status).toBe(200);
    expect(owner.body.items.map((m: { role: string }) => m.role)).toEqual([
      "owner",
      "member",
      "member",
      "viewer",
    ]);
    expect(owner.body.items[0]).toEqual({
      user: { id: userId("ana"), displayName: "Ana Villanueva", avatarUrl: null, badge: null },
      email: "ana@bcdx.example",
      role: "owner",
      joinedAt: expect.any(String),
    });
    for (const who of ["kenji", "grace"] as const) {
      const res = await call(t.app, "GET", `${ws}/members`, { as: as[who] });
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(4);
      expect(res.body.items.every((m: { email: unknown }) => m.email === null)).toBe(true);
    }
  });

  test("401, a non-member and the Admin get nothing, unknown workspace is 404", async () => {
    expect((await call(t.app, "GET", `${ws}/members`)).status).toBe(401);
    expect((await call(t.app, "GET", `${ws}/members`, { as: as.admin })).status).toBe(403);
    expect(
      (
        await call(t.app, "GET", `/api/v1/workspaces/${personalWorkspaceId("kenji")}/members`, {
          as: as.ana,
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(t.app, "GET", `/api/v1/workspaces/${OTHER}/members`, { as: as.ana })).status,
    ).toBe(404);
  });
});

describe("W3 PATCH member role", () => {
  const path = (who: "kenji" | "ana" | "grace" | "paolo") => `${ws}/members/${userId(who)}`;

  test("Owner changes a role and gets the Member back", async () => {
    const res = await call(t.app, "PATCH", path("grace"), { as: as.ana, body: { role: "member" } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: userId("grace"), displayName: "Grace Tan", avatarUrl: null, badge: null },
      email: "grace@advisor.example",
      role: "member",
      joinedAt: expect.any(String),
    });
    const [row] = await t.db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.workspaceId, BCDX),
          eq(schema.memberships.userId, userId("grace")),
        ),
      );
    expect(row?.role).toBe("member");
  });

  test("403 for Member, Viewer and the Admin; 404 for a non-member target", async () => {
    for (const who of ["kenji", "grace", "admin"] as const) {
      const res = await call(t.app, "PATCH", path("paolo"), {
        as: as[who],
        body: { role: "owner" },
      });
      expect(res.status).toBe(403);
    }
    const missing = await call(t.app, "PATCH", `${ws}/members/${userId("admin")}`, {
      as: as.ana,
      body: { role: "member" },
    });
    expect(missing.status).toBe(404);
    expect(
      (await call(t.app, "PATCH", path("kenji"), { as: as.ana, body: { role: "boss" } })).status,
    ).toBe(422);
    expect(
      (await call(t.app, "PATCH", `${ws}/members/me`, { as: as.ana, body: { role: "member" } }))
        .status,
    ).toBe(422);
  });

  test("the last Owner cannot be demoted; with a second Owner it can", async () => {
    const res = await call(t.app, "PATCH", path("ana"), { as: as.ana, body: { role: "member" } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LAST_OWNER");
    await call(t.app, "PATCH", path("kenji"), { as: as.ana, body: { role: "owner" } });
    const ok = await call(t.app, "PATCH", path("ana"), { as: as.ana, body: { role: "member" } });
    expect(ok.status).toBe(200);
    expect(ok.body.role).toBe("member");
    const now = await call(t.app, "PATCH", path("kenji"), {
      as: as.kenji,
      body: { role: "viewer" },
    });
    expect(now.body.error.code).toBe("LAST_OWNER");
  });

  test("demoting to Viewer unshares the self analysis and turns assignments into names", async () => {
    const analysis = await t.db
      .select({ id: schema.selfAnalyses.id })
      .from(schema.selfAnalyses)
      .where(eq(schema.selfAnalyses.userId, userId("paolo")));
    const shares = () =>
      t.db
        .select()
        .from(schema.selfAnalysisShares)
        .where(eq(schema.selfAnalysisShares.selfAnalysisId, analysis[0]?.id as string));
    expect((await shares()).some((s) => s.workspaceId === BCDX)).toBe(true);
    const before = await t.db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.assigneeUserId, userId("paolo")));
    expect(before.length).toBeGreaterThan(0);

    const res = await call(t.app, "PATCH", path("paolo"), { as: as.ana, body: { role: "viewer" } });
    expect(res.status).toBe(200);

    expect((await shares()).some((s) => s.workspaceId === BCDX)).toBe(false);
    const stillAssigned = await t.db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.assigneeUserId, userId("paolo")));
    expect(stillAssigned).toHaveLength(0);
    for (const item of before) {
      const [after] = await t.db
        .select()
        .from(schema.executionItems)
        .where(eq(schema.executionItems.id, item.id));
      expect(after).toMatchObject({
        assigneeUserId: null,
        assigneeName: "Paolo Gonzaga",
        lockVersion: item.lockVersion + 1,
        updatedById: userId("ana"),
      });
    }
    const answers = await t.db.select().from(schema.selfAnalysisAnswers);
    expect(answers.length).toBeGreaterThan(0);

    const history = await t.db
      .select()
      .from(schema.changeHistory)
      .where(
        and(
          eq(schema.changeHistory.targetType, "execution_item"),
          eq(schema.changeHistory.changedById, userId("ana")),
          eq(schema.changeHistory.sectionKey, "execution"),
          eq(schema.changeHistory.source, "manual"),
        ),
      );
    expect(history).toHaveLength(before.length);
    expect(history[0]?.before).toMatchObject({
      assigneeUserId: userId("paolo"),
      assigneeName: null,
    });
    expect(history[0]?.after).toMatchObject({
      assigneeUserId: null,
      assigneeName: "Paolo Gonzaga",
    });
  });

  test("demoting between Owner and Member leaves shares and assignments alone", async () => {
    await call(t.app, "PATCH", path("paolo"), { as: as.ana, body: { role: "owner" } });
    const assigned = await t.db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.assigneeUserId, userId("paolo")));
    expect(assigned.length).toBeGreaterThan(0);
    const same = await call(t.app, "PATCH", path("paolo"), { as: as.ana, body: { role: "owner" } });
    expect(same.status).toBe(200);
  });
});

describe("W3 DELETE member", () => {
  test("Owner removes someone: membership gone, duties released, last workspace reset", async () => {
    await t.db
      .update(schema.users)
      .set({ lastWorkspaceId: BCDX })
      .where(eq(schema.users.id, userId("paolo")));
    const res = await call(t.app, "DELETE", `${ws}/members/${userId("paolo")}`, { as: as.ana });
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const members = await call(t.app, "GET", `${ws}/members`, { as: as.ana });
    expect(members.body.items).toHaveLength(3);
    const [user] = await t.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId("paolo")));
    expect(user?.lastWorkspaceId).toBe(personalWorkspaceId("paolo"));
    const assigned = await t.db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.assigneeUserId, userId("paolo")));
    expect(assigned).toHaveLength(0);
    const named = await t.db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.assigneeName, "Paolo Gonzaga"));
    expect(named.length).toBeGreaterThan(0);
    const [analysis] = await t.db
      .select({ id: schema.selfAnalyses.id })
      .from(schema.selfAnalyses)
      .where(eq(schema.selfAnalyses.userId, userId("paolo")));
    const shares = await t.db
      .select()
      .from(schema.selfAnalysisShares)
      .where(eq(schema.selfAnalysisShares.selfAnalysisId, analysis?.id as string));
    expect(shares.some((s) => s.workspaceId === BCDX)).toBe(false);
    const gone = await call(t.app, "GET", ws, { as: as.paolo });
    expect(gone.status).toBe(403);
  });

  test("a removed person's name on records reads former member", async () => {
    await call(t.app, "DELETE", `${ws}/members/${userId("kenji")}`, { as: as.ana });
    const { loadUserRefs } = await import("../src/lib/users");
    const refs = await loadUserRefs(t.db, [userId("kenji")], BCDX);
    expect(refs.get(userId("kenji"))?.badge).toBe("former_member");
  });

  test("a member leaves with `me`; last workspace is kept when it points elsewhere", async () => {
    await t.db
      .update(schema.users)
      .set({ lastWorkspaceId: personalWorkspaceId("kenji") })
      .where(eq(schema.users.id, userId("kenji")));
    const res = await call(t.app, "DELETE", `${ws}/members/me`, { as: as.kenji });
    expect(res.status).toBe(204);
    const [user] = await t.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId("kenji")));
    expect(user?.lastWorkspaceId).toBe(personalWorkspaceId("kenji"));
    const viewer = await call(t.app, "DELETE", `${ws}/members/${userId("grace")}`, {
      as: as.grace,
    });
    expect(viewer.status).toBe(204);
  });

  test("only an Owner removes others; non-members and the Admin are refused", async () => {
    for (const who of ["kenji", "grace"] as const) {
      const res = await call(t.app, "DELETE", `${ws}/members/${userId("paolo")}`, { as: as[who] });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    const admin = await call(t.app, "DELETE", `${ws}/members/${userId("paolo")}`, { as: as.admin });
    expect(admin.body.error.code).toBe("NO_ACCESS");
    expect((await call(t.app, "DELETE", `${ws}/members/me`, { as: as.admin })).status).toBe(403);
    expect((await call(t.app, "DELETE", `${ws}/members/${userId("paolo")}`)).status).toBe(401);
    expect(
      (await call(t.app, "DELETE", `${ws}/members/${userId("admin")}`, { as: as.ana })).status,
    ).toBe(404);
    expect((await call(t.app, "DELETE", `${ws}/members/not-a-uuid`, { as: as.ana })).status).toBe(
      422,
    );
  });

  test("the last Owner cannot leave or be removed", async () => {
    for (const target of ["me", userId("ana")]) {
      const res = await call(t.app, "DELETE", `${ws}/members/${target}`, { as: as.ana });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("LAST_OWNER");
    }
    const [row] = await t.db
      .select()
      .from(schema.memberships)
      .where(
        and(eq(schema.memberships.workspaceId, BCDX), eq(schema.memberships.userId, userId("ana"))),
      );
    expect(row).toBeDefined();
  });

  test("a personal workspace cannot be left", async () => {
    const res = await call(
      t.app,
      "DELETE",
      `/api/v1/workspaces/${personalWorkspaceId("kenji")}/members/me`,
      { as: as.kenji },
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CANNOT_LEAVE_PERSONAL");
  });
});

describe("W4 invitations", () => {
  test("POST stores only the hash, mails the link and returns the token once", async () => {
    const res = await invite("New.Person@Example.com", "viewer");
    expect(res.status).toBe(201);
    const { invitation, link } = res.body;
    expect(link).toMatch(/^http:\/\/localhost:5173\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(invitation).toEqual({
      id: expect.any(String),
      email: "New.Person@Example.com",
      role: "viewer",
      workspace: { id: BCDX, name: "BCDX" },
      status: "pending",
      invitedBy: { id: userId("ana"), displayName: "Ana Villanueva", avatarUrl: null, badge: null },
      createdAt: expect.any(String),
      expiresAt: expect.any(String),
      acceptedAt: null,
    });
    const days = (Date.parse(invitation.expiresAt) - Date.parse(invitation.createdAt)) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);

    const [row] = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.id, invitation.id));
    expect(row?.tokenHash).toBe(hashInvitationToken(tokenOf(link)));
    expect(row?.tokenHash).not.toContain(tokenOf(link));
    expect(row?.workspaceId).toBe(BCDX);

    expect(t.mailbox.sent).toHaveLength(1);
    const mail = t.mailbox.sent[0];
    expect(mail?.to).toBe("New.Person@Example.com");
    expect(mail?.subject).toContain("Ana Villanueva");
    expect(mail?.text).toContain(link);
    expect(mail?.text).toContain("7 days");

    const list = await call(t.app, "GET", `${ws}/invitations`, { as: as.ana });
    expect(JSON.stringify(list.body)).not.toContain(tokenOf(link));
  });

  test("tokens differ between invitations", async () => {
    const a = await invite("a@example.com");
    const b = await invite("b@example.com");
    expect(tokenOf(a.body.link)).not.toBe(tokenOf(b.body.link));
  });

  test("GET lists valid pending ones by default and everything with status=all", async () => {
    const pending = await call(t.app, "GET", `${ws}/invitations`, { as: as.ana });
    expect(pending.status).toBe(200);
    expect(pending.body.items.map((i: { email: string }) => i.email)).toEqual([
      "new.member@bcdx.example",
    ]);
    const all = await call(t.app, "GET", `${ws}/invitations?status=all`, { as: as.ana });
    const byEmail = Object.fromEntries(
      all.body.items.map((i: { email: string; status: string }) => [i.email, i.status]),
    );
    expect(byEmail).toEqual({
      "new.member@bcdx.example": "pending",
      "late.joiner@bcdx.example": "expired",
    });
    expect(
      (await call(t.app, "GET", `${ws}/invitations?status=bogus`, { as: as.ana })).status,
    ).toBe(422);
  });

  test("a pending invitation past its expiry reads as expired and is not listed as pending", async () => {
    await t.db
      .update(schema.invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.invitations.email, "new.member@bcdx.example"));
    const pending = await call(t.app, "GET", `${ws}/invitations`, { as: as.ana });
    expect(pending.body.items).toHaveLength(0);
    const all = await call(t.app, "GET", `${ws}/invitations?status=all`, { as: as.ana });
    expect(all.body.items.every((i: { status: string }) => i.status === "expired")).toBe(true);
  });

  test("revoked and accepted ones are listed with their status", async () => {
    await t.db
      .update(schema.invitations)
      .set({ status: "accepted", acceptedAt: new Date(), acceptedById: userId("kenji") })
      .where(eq(schema.invitations.email, "new.member@bcdx.example"));
    const all = await call(t.app, "GET", `${ws}/invitations?status=all`, { as: as.ana });
    const accepted = all.body.items.find((i: { status: string }) => i.status === "accepted");
    expect(accepted.acceptedAt).toEqual(expect.any(String));
  });

  test("409 ALREADY_MEMBER (case-insensitive) and 409 INVITATION_PENDING", async () => {
    const member = await invite("KENJI@bcdx.example");
    expect(member.status).toBe(409);
    expect(member.body.error.code).toBe("ALREADY_MEMBER");
    const pending = await invite("New.Member@BCDX.example");
    expect(pending.status).toBe(409);
    expect(pending.body.error.code).toBe("INVITATION_PENDING");
    expect(t.mailbox.sent).toHaveLength(0);
  });

  test("simultaneous invitations to one address create one invitation", async () => {
    const [a, b] = await Promise.all([invite("race@example.com"), invite("RACE@example.com")]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const rows = await t.db
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(eq(schema.invitations.email, "race@example.com"));
    expect(rows).toHaveLength(1);
  });

  test("workspace writes are not held up while the invitation mail is on its way", async () => {
    const send = t.mailbox.send;
    let release = () => {};
    let reached = () => {};
    const inFlight = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    t.mailbox.send = async (message) => {
      reached();
      await gate;
      return send(message);
    };
    try {
      const pending = invite("slow.mail@example.com");
      await inFlight;
      const rename = await Promise.race([
        call(t.app, "PATCH", ws, { as: as.ana, body: { name: "Renamed meanwhile" } }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      expect(rename?.status).toBe(200);
      release();
      expect((await pending).status).toBe(201);
    } finally {
      release();
      t.mailbox.send = send;
    }
  });

  test("an expired invitation to the same address does not block a new one", async () => {
    const res = await invite("late.joiner@bcdx.example");
    expect(res.status).toBe(201);
  });

  test("an invitation for another workspace does not block", async () => {
    const created = await call(t.app, "POST", "/api/v1/workspaces", {
      as: as.ana,
      body: { name: "Second" },
    });
    const res = await call(t.app, "POST", `/api/v1/workspaces/${created.body.id}/invitations`, {
      as: as.ana,
      body: { email: "new.member@bcdx.example", role: "member" },
    });
    expect(res.status).toBe(201);
    expect(res.body.invitation.workspace.name).toBe("Second");
  });

  test("422 for a bad email or role", async () => {
    for (const body of [
      { email: "not-an-email", role: "member" },
      { email: "", role: "member" },
      { email: "a@example.com", role: "admin" },
      { email: "a@example.com" },
    ]) {
      const res = await call(t.app, "POST", `${ws}/invitations`, { as: as.ana, body });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
  });

  test("Owner only for GET and POST; the Admin who is not a member gets nothing here", async () => {
    for (const who of ["kenji", "grace"] as const) {
      expect((await call(t.app, "GET", `${ws}/invitations`, { as: as[who] })).body.error.code).toBe(
        "FORBIDDEN",
      );
      expect((await invite("x@example.com", "member", as[who])).body.error.code).toBe("FORBIDDEN");
    }
    expect((await call(t.app, "GET", `${ws}/invitations`, { as: as.admin })).body.error.code).toBe(
      "NO_ACCESS",
    );
    expect((await invite("x@example.com", "member", as.admin)).body.error.code).toBe("NO_ACCESS");
    expect((await call(t.app, "GET", `${ws}/invitations`)).status).toBe(401);
    expect(
      (await call(t.app, "GET", `/api/v1/workspaces/${OTHER}/invitations`, { as: as.ana })).status,
    ).toBe(404);
    expect(t.mailbox.sent).toHaveLength(0);
  });

  test("the 21st send or resend in an hour is 429 with retryAfterSeconds", async () => {
    for (let i = 0; i < RATE_LIMITS.invitation.limit; i++) {
      const res = await invite(`bulk${i}@example.com`);
      expect(res.status).toBe(201);
    }
    const over = await invite("one.more@example.com");
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("RATE_LIMITED");
    expect(over.body.error.retryAfterSeconds).toBeGreaterThan(0);
    const [pending] = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.workspaceId, BCDX))
      .limit(1);
    const resend = await call(t.app, "POST", `/api/v1/invitations/${pending?.id}/resend`, {
      as: as.ana,
    });
    expect(resend.status).toBe(429);
    const link = await call(t.app, "POST", `/api/v1/invitations/${pending?.id}/link`, {
      as: as.ana,
    });
    expect(link.status).toBe(200);
    const rows = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.email, "one.more@example.com"));
    expect(rows).toHaveLength(0);
  });

  test("conflicts do not use up the rate limit", async () => {
    for (let i = 0; i < RATE_LIMITS.invitation.limit + 2; i++) {
      expect((await invite("kenji@bcdx.example")).status).toBe(409);
    }
    expect((await invite("fresh@example.com")).status).toBe(201);
  });
});

describe("W5 / W6 / W7 invitation actions", () => {
  const pendingId = async () => {
    const [row] = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.email, "new.member@bcdx.example"));
    return row as NonNullable<typeof row>;
  };
  const act = (verb: "resend" | "link" | "revoke", id: string, who = as.ana) =>
    verb === "revoke"
      ? call(t.app, "DELETE", `/api/v1/invitations/${id}`, { as: who })
      : call(t.app, "POST", `/api/v1/invitations/${id}/${verb}`, { as: who });

  test("W5 reissues the token, extends expiry, mails again and kills the old link", async () => {
    const created = await invite("again@example.com");
    const oldToken = tokenOf(created.body.link);
    await t.db
      .update(schema.invitations)
      .set({ expiresAt: new Date(Date.now() + 3600_000) })
      .where(eq(schema.invitations.id, created.body.invitation.id));
    t.mailbox.sent.length = 0;
    const res = await act("resend", created.body.invitation.id);
    expect(res.status).toBe(200);
    expect(res.body.invitation.status).toBe("pending");
    expect(Date.parse(res.body.invitation.expiresAt) - Date.now()).toBeGreaterThan(
      6.9 * 86_400_000,
    );
    const newToken = tokenOf(res.body.link);
    expect(newToken).not.toBe(oldToken);
    const [row] = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.id, created.body.invitation.id));
    expect(row?.tokenHash).toBe(hashInvitationToken(newToken));
    const stale = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.tokenHash, hashInvitationToken(oldToken)));
    expect(stale).toHaveLength(0);
    expect(t.mailbox.sent).toHaveLength(1);
    expect(t.mailbox.sent[0]?.to).toBe("again@example.com");
    expect(t.mailbox.sent[0]?.text).toContain(res.body.link);
    expect(t.mailbox.sent[0]?.text).not.toContain(oldToken);
  });

  test("W5 revives an expired invitation", async () => {
    const expired = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.email, "late.joiner@bcdx.example"));
    const res = await act("resend", expired[0]?.id as string);
    expect(res.status).toBe(200);
    expect(res.body.invitation.status).toBe("pending");
    const list = await call(t.app, "GET", `${ws}/invitations`, { as: as.ana });
    expect(list.body.items).toHaveLength(2);
  });

  test("W6 returns a fresh link without mail or rate use and invalidates the old one", async () => {
    const row = await pendingId();
    const res = await act("link", row.id);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["link"]);
    expect(t.mailbox.sent).toHaveLength(0);
    const [after] = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.id, row.id));
    expect(after?.tokenHash).toBe(hashInvitationToken(tokenOf(res.body.link)));
    expect(after?.tokenHash).not.toBe(row.tokenHash);
    const [limit] = await t.db.select().from(schema.rateLimits);
    expect(limit).toBeUndefined();
  });

  test("W7 revokes; afterwards every action is 410", async () => {
    const row = await pendingId();
    const res = await act("revoke", row.id);
    expect(res.status).toBe(204);
    const [after] = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.id, row.id));
    expect(after?.status).toBe("revoked");
    for (const verb of ["resend", "link", "revoke"] as const) {
      const again = await act(verb, row.id);
      expect(again.status).toBe(410);
      expect(again.body.error.code).toBe("INVITATION_INVALID");
    }
    const all = await call(t.app, "GET", `${ws}/invitations?status=all`, { as: as.ana });
    expect(all.body.items.find((i: { id: string }) => i.id === row.id).status).toBe("revoked");
    expect(t.mailbox.sent).toHaveLength(0);
  });

  test("W7 can revoke an expired one", async () => {
    const [expired] = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.email, "late.joiner@bcdx.example"));
    expect((await act("revoke", expired?.id as string)).status).toBe(204);
  });

  test("an accepted invitation is 409 for all three", async () => {
    const row = await pendingId();
    await t.db
      .update(schema.invitations)
      .set({ status: "accepted", acceptedAt: new Date(), acceptedById: userId("kenji") })
      .where(eq(schema.invitations.id, row.id));
    for (const verb of ["resend", "link", "revoke"] as const) {
      const res = await act(verb, row.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVITATION_ALREADY_ACCEPTED");
    }
  });

  test("Member, Viewer and a non-Owner outsider are 403; anonymous 401; unknown 404; bad id 422", async () => {
    const row = await pendingId();
    for (const who of ["kenji", "grace"] as const) {
      for (const verb of ["resend", "link", "revoke"] as const) {
        const res = await act(verb, row.id, as[who]);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      }
    }
    const { id: otherWs } = (
      await call(t.app, "POST", "/api/v1/workspaces", { as: as.paolo, body: { name: "P" } })
    ).body;
    expect(otherWs).toBeDefined();
    expect((await act("resend", row.id, as.paolo)).status).toBe(403);
    expect((await call(t.app, "POST", `/api/v1/invitations/${row.id}/link`)).status).toBe(401);
    expect((await act("link", OTHER)).status).toBe(404);
    expect((await act("link", "nope")).status).toBe(422);
    const [after] = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.id, row.id));
    expect(after?.tokenHash).toBe(row.tokenHash);
    expect(t.mailbox.sent).toHaveLength(0);
  });

  test("the Admin who is not a member manages any invitation, but still has no workspace access", async () => {
    const row = await pendingId();
    const link = await act("link", row.id, as.admin);
    expect(link.status).toBe(200);
    const resend = await act("resend", row.id, as.admin);
    expect(resend.status).toBe(200);
    expect(resend.body.invitation.invitedBy.id).toBe(userId("ana"));
    expect(t.mailbox.sent).toHaveLength(1);
    expect(t.mailbox.sent[0]?.subject).toContain("Moonx Admin");
    expect((await act("revoke", row.id, as.admin)).status).toBe(204);
    expect((await call(t.app, "GET", ws, { as: as.admin })).body.error.code).toBe("NO_ACCESS");
    expect((await call(t.app, "GET", `${ws}/members`, { as: as.admin })).body.error.code).toBe(
      "NO_ACCESS",
    );
  });

  test("operator invitations without a workspace: Admin only", async () => {
    const [op] = await t.db
      .insert(schema.invitations)
      .values({
        workspaceId: null,
        email: "operator.guest@example.com",
        role: null,
        tokenHash: hashInvitationToken("operator-token"),
        invitedById: userId("admin"),
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    expect((await act("link", op?.id as string, as.ana)).status).toBe(403);
    const resend = await act("resend", op?.id as string, as.admin);
    expect(resend.status).toBe(200);
    expect(resend.body.invitation).toMatchObject({
      workspace: null,
      role: null,
      status: "pending",
    });
    expect(t.mailbox.sent[0]?.subject).toBe("Moonx Admin invited you to moonx");
    expect((await act("revoke", op?.id as string, as.admin)).status).toBe(204);
  });
});

describe("W8 mention candidates", () => {
  const url = (q = "") => `${ws}/mention-candidates${q}`;
  const names = (res: { body: { items: { displayName: string }[] } }) =>
    res.body.items.map((u) => u.displayName);

  test("without a target every member is a candidate, Viewers included, for every role", async () => {
    for (const who of ["ana", "kenji", "grace"] as const) {
      const res = await call(t.app, "GET", url(), { as: as[who] });
      expect(res.status).toBe(200);
      expect(names(res)).toEqual(["Ana Villanueva", "Grace Tan", "Kenji Mori", "Paolo Gonzaga"]);
      expect(res.body.items[0]).toEqual({
        id: userId("ana"),
        displayName: "Ana Villanueva",
        avatarUrl: null,
        badge: null,
      });
    }
  });

  test("a non-comment target does not narrow the list", async () => {
    const res = await call(t.app, "GET", url(`?targetType=idea&targetId=${OTHER}`), { as: as.ana });
    expect(names(res)).toHaveLength(4);
  });

  test("a self-analysis answer narrows to Owners and Members of a workspace it is shared with", async () => {
    const [answer] = await t.db
      .select({ id: schema.selfAnalyses.id })
      .from(schema.selfAnalyses)
      .where(eq(schema.selfAnalyses.userId, userId("paolo")));
    const res = await call(
      t.app,
      "GET",
      url(`?targetType=self_analysis_answer&targetId=${answer?.id}`),
      {
        as: as.kenji,
      },
    );
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(["Ana Villanueva", "Kenji Mori", "Paolo Gonzaga"]);
  });

  test("a Viewer cannot ask about a self analysis (403 FORBIDDEN)", async () => {
    const [analysis] = await t.db
      .select({ id: schema.selfAnalyses.id })
      .from(schema.selfAnalyses)
      .where(eq(schema.selfAnalyses.userId, userId("paolo")));
    const res = await call(
      t.app,
      "GET",
      url(`?targetType=self_analysis_answer&targetId=${analysis?.id}`),
      { as: as.grace },
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  test("an analysis that is not shared here is 403 NOT_SHARED; an unknown analysis 404", async () => {
    const [answer] = await t.db
      .select({ id: schema.selfAnalyses.id })
      .from(schema.selfAnalyses)
      .where(eq(schema.selfAnalyses.userId, userId("kenji")));
    const res = await call(
      t.app,
      "GET",
      url(`?targetType=self_analysis_answer&targetId=${answer?.id}`),
      {
        as: as.ana,
      },
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_SHARED");
    const none = await call(
      t.app,
      "GET",
      url(`?targetType=self_analysis_answer&targetId=${OTHER}`),
      {
        as: as.ana,
      },
    );
    expect(none.status).toBe(404);
  });

  test("a share removed by demotion leaves the demoted person out", async () => {
    const [answer] = await t.db
      .select({ id: schema.selfAnalyses.id })
      .from(schema.selfAnalyses)
      .where(eq(schema.selfAnalyses.userId, userId("ana")));
    const q = url(`?targetType=self_analysis_answer&targetId=${answer?.id}`);
    expect((await call(t.app, "GET", q, { as: as.kenji })).status).toBe(200);
    await call(t.app, "PATCH", `${ws}/members/${userId("kenji")}`, {
      as: as.ana,
      body: { role: "owner" },
    });
    await call(t.app, "PATCH", `${ws}/members/${userId("ana")}`, {
      as: as.ana,
      body: { role: "viewer" },
    });
    const res = await call(t.app, "GET", q, { as: as.kenji });
    expect(res.body.error.code).toBe("NOT_SHARED");
  });

  test("targetType and targetId go together; 401, non-member and Admin refused; 404 unknown workspace", async () => {
    expect((await call(t.app, "GET", url("?targetType=idea"), { as: as.ana })).status).toBe(422);
    expect((await call(t.app, "GET", url(`?targetId=${OTHER}`), { as: as.ana })).status).toBe(422);
    expect(
      (await call(t.app, "GET", url(`?targetType=bogus&targetId=${OTHER}`), { as: as.ana })).status,
    ).toBe(422);
    expect((await call(t.app, "GET", url())).status).toBe(401);
    expect((await call(t.app, "GET", url(), { as: as.admin })).body.error.code).toBe("NO_ACCESS");
    const other = `/api/v1/workspaces/${personalWorkspaceId("ana")}/mention-candidates`;
    expect((await call(t.app, "GET", other, { as: as.kenji })).status).toBe(403);
    expect(
      (await call(t.app, "GET", `/api/v1/workspaces/${OTHER}/mention-candidates`, { as: as.ana }))
        .status,
    ).toBe(404);
  });
});
