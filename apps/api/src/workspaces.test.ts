import { afterAll, describe, expect, test } from "bun:test";
import {
  businessPlans,
  changeHistory,
  competitors,
  executionItems,
  ideas,
  memberships,
  selfAnalysisShares,
  users,
  workspaces,
} from "@moonx/db";
import {
  errorBodySchema,
  memberListSchema,
  workspaceSchema,
} from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { lockMembers } from "./membership";
import { buildTestApp, connectTestDatabase, uniqueIp } from "./test-app";
import {
  apiRequest,
  duringAccountDeletion,
  signIn,
  testFixtures,
  untilBlockedBy,
} from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
const { app } = buildTestApp(database);

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

const cookieOf = (user: { email: string }) =>
  signIn(app, user.email, uniqueIp());

const workspaceRow = async (id: string) =>
  (await db.select().from(workspaces).where(eq(workspaces.id, id)))[0];

const roleOf = async (workspaceId: string, userId: string) =>
  (
    await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.userId, userId),
        ),
      )
  )[0]?.role;

/** A team with an idea, a plan and an execution item assigned to the Member. */
async function teamWithWork() {
  const team = await fixtures.createTeam();
  const { idea } = await fixtures.createIdea(team.workspace.id, team.owner.id);
  const plan = await fixtures.createPlan(idea.id, team.owner.id);
  const [item] = await db
    .insert(executionItems)
    .values({
      businessPlanId: plan.id,
      type: "milestone",
      title: "Open the stall",
      assigneeUserId: team.member.id,
      status: "todo",
      sortOrder: 0,
    })
    .returning();
  if (item === undefined) throw new Error("no item");
  return { ...team, idea, plan, item };
}

const itemRow = async (id: string) =>
  (await db.select().from(executionItems).where(eq(executionItems.id, id)))[0];

describe("W0 POST /api/v1/workspaces", () => {
  test("makes the caller its Owner, lands them on it and defaults to PHP", async () => {
    const user = await fixtures.createUser();
    const cookie = await cookieOf(user);

    const response = await app.handle(
      apiRequest("POST", "/api/v1/workspaces", {
        cookie,
        body: { name: "Side project" },
      }),
    );

    expect(response.status).toBe(201);
    const workspace = workspaceSchema.parse(await response.json());
    expect(workspace).toMatchObject({
      name: "Side project",
      currency: "PHP",
      isPersonal: false,
      myRole: "owner",
      memberCount: 1,
    });
    expect(await roleOf(workspace.id, user.id)).toBe("owner");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.lastWorkspaceId).toBe(workspace.id);
  });

  test("takes a currency in circulation and refuses others", async () => {
    const cookie = await cookieOf(await fixtures.createUser());
    const made = await app.handle(
      apiRequest("POST", "/api/v1/workspaces", {
        cookie,
        body: { name: "Yen", currency: "JPY" },
      }),
    );
    expect(await made.json()).toMatchObject({ currency: "JPY" });

    for (const body of [
      { name: "Fund", currency: "XAU" },
      { name: "   " },
      { name: "x".repeat(61) },
    ]) {
      const refused = await app.handle(
        apiRequest("POST", "/api/v1/workspaces", { cookie, body }),
      );
      expect(refused.status).toBe(422);
    }
  });

  test("refuses a caller whose account is deleted while the request waits", async () => {
    const user = await fixtures.createUser();
    const cookie = await cookieOf(user);
    const name = `Made too late ${crypto.randomUUID()}`;

    const response = await duringAccountDeletion(db, user.id, () =>
      app.handle(
        apiRequest("POST", "/api/v1/workspaces", { cookie, body: { name } }),
      ),
    );

    expect(response.status).toBe(401);
    expect(
      await db.select().from(workspaces).where(eq(workspaces.name, name)),
    ).toEqual([]);
  });
});

describe("W1 /api/v1/workspaces/{workspaceId}", () => {
  test("GET answers the caller's role and the member count", async () => {
    const team = await fixtures.createTeam();

    const response = await app.handle(
      apiRequest("GET", `/api/v1/workspaces/${team.workspace.id}`, {
        cookie: await cookieOf(team.viewer),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: team.workspace.id,
      name: team.workspace.name,
      currency: "PHP",
      isPersonal: false,
      myRole: "viewer",
      memberCount: 3,
    });
  });

  test("GET answers 404 for an id that is not a workspace", async () => {
    const cookie = await cookieOf(await fixtures.createUser());
    for (const id of [crypto.randomUUID(), "not-a-uuid"]) {
      const response = await app.handle(
        apiRequest("GET", `/api/v1/workspaces/${id}`, { cookie }),
      );
      expect(response.status).toBe(404);
    }
  });

  test("PATCH changes the name and currency and moves the last activity", async () => {
    const team = await fixtures.createTeam();

    const response = await app.handle(
      apiRequest("PATCH", `/api/v1/workspaces/${team.workspace.id}`, {
        cookie: await cookieOf(team.owner),
        body: { name: "Renamed", currency: "USD" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "Renamed",
      currency: "USD",
    });
    const row = await workspaceRow(team.workspace.id);
    expect(row?.lastActiveAt).not.toBeNull();
    expect(row?.updatedAt.getTime()).toBeGreaterThan(
      team.workspace.updatedAt.getTime(),
    );
  });

  test("PATCH with the same values changes nothing", async () => {
    const team = await fixtures.createTeam();

    const response = await app.handle(
      apiRequest("PATCH", `/api/v1/workspaces/${team.workspace.id}`, {
        cookie: await cookieOf(team.owner),
        body: { name: team.workspace.name },
      }),
    );

    expect(response.status).toBe(200);
    const row = await workspaceRow(team.workspace.id);
    expect(row?.lastActiveAt).toBeNull();
    expect(row?.updatedAt).toEqual(team.workspace.updatedAt);
  });

  test("PATCH holds the values to design-spec 6.0.8, and answers 404 for no workspace", async () => {
    const team = await fixtures.createTeam();
    const cookie = await cookieOf(team.owner);
    for (const body of [{ name: "   " }, { currency: "XAU" }]) {
      const response = await app.handle(
        apiRequest("PATCH", `/api/v1/workspaces/${team.workspace.id}`, {
          cookie,
          body,
        }),
      );
      expect(response.status).toBe(422);
    }
    const missing = await app.handle(
      apiRequest("PATCH", `/api/v1/workspaces/${crypto.randomUUID()}`, {
        cookie,
        body: { name: "Nowhere" },
      }),
    );
    expect(missing.status).toBe(404);
  });
});

describe("W2 GET /api/v1/workspaces/{workspaceId}/members", () => {
  test("lists the members in the order they joined, addresses for an Owner only", async () => {
    const owner = await fixtures.createUser({ displayName: "Owner" });
    const member = await fixtures.createUser({
      displayName: "Suspended",
      status: "suspended",
    });
    const personal = await fixtures.createWorkspace({
      createdById: owner.id,
      isPersonal: true,
    });
    await fixtures.addMember(personal.id, owner.id, "owner");
    await fixtures.addMember(personal.id, member.id, "member");

    const asOwner = memberListSchema.parse(
      await (
        await app.handle(
          apiRequest("GET", `/api/v1/workspaces/${personal.id}/members`, {
            cookie: await cookieOf(owner),
          }),
        )
      ).json(),
    );

    expect(
      asOwner.items.map((item) => ({
        id: item.user.id,
        badge: item.user.badge,
        email: item.email,
        role: item.role,
        isPersonalOwner: item.isPersonalOwner,
      })),
    ).toEqual([
      {
        id: owner.id,
        badge: null,
        email: owner.email,
        role: "owner",
        isPersonalOwner: true,
      },
      {
        id: member.id,
        badge: "suspended",
        email: member.email,
        role: "member",
        isPersonalOwner: false,
      },
    ]);

    const team = await fixtures.createTeam();
    const asMember = memberListSchema.parse(
      await (
        await app.handle(
          apiRequest("GET", `/api/v1/workspaces/${team.workspace.id}/members`, {
            cookie: await cookieOf(team.member),
          }),
        )
      ).json(),
    );
    expect(asMember.items.map((item) => item.email)).toEqual([
      null,
      null,
      null,
    ]);
  });
});

describe("W3 PATCH /api/v1/workspaces/{workspaceId}/members/{userId}", () => {
  const changeRole = async (
    workspaceId: string,
    userId: string,
    role: string,
    caller: { email: string },
  ) =>
    app.handle(
      apiRequest(
        "PATCH",
        `/api/v1/workspaces/${workspaceId}/members/${userId}`,
        {
          cookie: await cookieOf(caller),
          body: { role },
        },
      ),
    );

  test("changes the role and answers the member", async () => {
    const team = await fixtures.createTeam();

    const response = await changeRole(
      team.workspace.id,
      team.viewer.id,
      "member",
      team.owner,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { id: team.viewer.id },
      email: team.viewer.email,
      role: "member",
    });
    expect(
      (await workspaceRow(team.workspace.id))?.lastActiveAt,
    ).not.toBeNull();
  });

  test("leaves the same role alone", async () => {
    const team = await fixtures.createTeam();

    const response = await changeRole(
      team.workspace.id,
      team.member.id,
      "member",
      team.owner,
    );

    expect(response.status).toBe(200);
    expect((await workspaceRow(team.workspace.id))?.lastActiveAt).toBeNull();
  });

  test("keeps the last Owner, even from themselves", async () => {
    const team = await fixtures.createTeam();

    const response = await changeRole(
      team.workspace.id,
      team.owner.id,
      "member",
      team.owner,
    );

    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("LAST_OWNER");
  });

  test("keeps the owner of a personal workspace its Owner", async () => {
    const owner = await fixtures.createUser();
    const other = await fixtures.createUser();
    const personal = await fixtures.createWorkspace({
      createdById: owner.id,
      isPersonal: true,
    });
    await fixtures.addMember(personal.id, owner.id, "owner");
    await fixtures.addMember(personal.id, other.id, "owner");

    for (const caller of [other, owner]) {
      const response = await changeRole(
        personal.id,
        owner.id,
        "member",
        caller,
      );
      expect(response.status).toBe(409);
      expect((await errorOf(response)).code).toBe("PERSONAL_OWNER");
    }
  });

  test("answers 404 for someone who is not a member, and 422 for a userId that is not a UUID", async () => {
    const team = await fixtures.createTeam();
    const stranger = await fixtures.createUser();

    const missing = await changeRole(
      team.workspace.id,
      stranger.id,
      "member",
      team.owner,
    );
    expect(missing.status).toBe(404);

    const me = await changeRole(team.workspace.id, "me", "member", team.owner);
    expect(me.status).toBe(422);
    expect((await errorOf(me)).details?.[0]?.path).toBe("userId");
  });

  test("a new Viewer stops sharing their self-analysis and loses their execution items", async () => {
    const t = await teamWithWork();
    await fixtures.createSelfAnalysis(t.member.id, [t.workspace.id]);
    const before = await itemRow(t.item.id);
    const touchedBefore = (
      await db.select().from(ideas).where(eq(ideas.id, t.idea.id))
    )[0]?.lastActivityAt;

    const response = await changeRole(
      t.workspace.id,
      t.member.id,
      "viewer",
      t.owner,
    );

    expect(response.status).toBe(200);
    expect(
      await db
        .select()
        .from(selfAnalysisShares)
        .where(eq(selfAnalysisShares.workspaceId, t.workspace.id)),
    ).toEqual([]);
    const after = await itemRow(t.item.id);
    expect(after).toMatchObject({
      assigneeUserId: null,
      assigneeName: "Member",
      lockVersion: (before?.lockVersion ?? 0) + 1,
      updatedById: t.owner.id,
    });
    const [history] = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.targetId, t.item.id));
    expect(history).toMatchObject({
      workspaceId: t.workspace.id,
      containerType: "business_plan",
      containerId: t.plan.id,
      sectionKey: "execution",
      targetType: "execution_item",
      action: "update",
      source: "manual",
      changedById: t.owner.id,
    });
    expect(history?.before).toMatchObject({
      title: "Open the stall",
      assigneeUserId: t.member.id,
      assigneeName: null,
    });
    expect(history?.after).toMatchObject({
      assigneeUserId: null,
      assigneeName: "Member",
    });
    const touchedAfter = (
      await db.select().from(ideas).where(eq(ideas.id, t.idea.id))
    )[0]?.lastActivityAt;
    expect(touchedAfter?.getTime()).toBeGreaterThan(
      touchedBefore?.getTime() ?? 0,
    );
  });

  test("names the member on items of archived plans, but not of plans whose creation was undone", async () => {
    const t = await teamWithWork();
    await db
      .update(businessPlans)
      .set({ archivedAt: new Date() })
      .where(eq(businessPlans.id, t.plan.id));
    const undone = await fixtures.createPlan(t.idea.id, t.owner.id, {
      deletedAt: new Date(),
    });
    const [left] = await db
      .insert(executionItems)
      .values({
        businessPlanId: undone.id,
        type: "milestone",
        title: "Gone",
        assigneeUserId: t.member.id,
        status: "todo",
        sortOrder: 0,
      })
      .returning();

    const response = await changeRole(
      t.workspace.id,
      t.member.id,
      "viewer",
      t.owner,
    );

    expect(response.status).toBe(200);
    expect((await itemRow(t.item.id))?.assigneeName).toBe("Member");
    expect((await itemRow(left?.id ?? ""))?.assigneeUserId).toBe(t.member.id);
  });

  test("lets only one of two Owners demoting each other at once through", async () => {
    // The one that waited is no Owner any more when it gets the members' lock.
    const team = await fixtures.createTeam();
    const second = await fixtures.createUser();
    await fixtures.addMember(team.workspace.id, second.id, "owner");
    const [ownerCookie, secondCookie] = await Promise.all([
      cookieOf(team.owner),
      cookieOf(second),
    ]);

    const statuses = await Promise.all(
      [
        [ownerCookie, second.id],
        [secondCookie, team.owner.id],
      ].map(
        async ([cookie, userId]) =>
          (
            await app.handle(
              apiRequest(
                "PATCH",
                `/api/v1/workspaces/${team.workspace.id}/members/${userId}`,
                { cookie, body: { role: "member" } },
              ),
            )
          ).status,
      ),
    );

    expect(statuses.sort()).toEqual([200, 403]);
  });
});

describe("W3 DELETE /api/v1/workspaces/{workspaceId}/members/{userId}", () => {
  const remove = async (
    workspaceId: string,
    userId: string,
    caller: { email: string },
  ) =>
    app.handle(
      apiRequest(
        "DELETE",
        `/api/v1/workspaces/${workspaceId}/members/${userId}`,
        { cookie: await cookieOf(caller) },
      ),
    );

  test("an Owner removes a member, who loses their share and items and lands home", async () => {
    const t = await teamWithWork();
    await fixtures.createSelfAnalysis(t.member.id, [t.workspace.id]);
    await db
      .update(users)
      .set({ lastWorkspaceId: t.workspace.id })
      .where(eq(users.id, t.member.id));
    const personal = await fixtures.createWorkspace({
      createdById: t.member.id,
      isPersonal: true,
    });
    await fixtures.addMember(personal.id, t.member.id, "owner");

    const response = await remove(t.workspace.id, t.member.id, t.owner);

    expect(response.status).toBe(204);
    expect(await roleOf(t.workspace.id, t.member.id)).toBeUndefined();
    expect((await itemRow(t.item.id))?.assigneeName).toBe("Member");
    expect(
      await db
        .select()
        .from(selfAnalysisShares)
        .where(eq(selfAnalysisShares.workspaceId, t.workspace.id)),
    ).toEqual([]);
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, t.member.id));
    expect(row?.lastWorkspaceId).toBe(personal.id);
    expect((await workspaceRow(t.workspace.id))?.lastActiveAt).not.toBeNull();
  });

  test("every member may leave, with me or their own id", async () => {
    const team = await fixtures.createTeam();

    expect((await remove(team.workspace.id, "me", team.viewer)).status).toBe(
      204,
    );
    expect(
      (await remove(team.workspace.id, team.member.id, team.member)).status,
    ).toBe(204);
    expect(await roleOf(team.workspace.id, team.viewer.id)).toBeUndefined();
    expect(await roleOf(team.workspace.id, team.member.id)).toBeUndefined();
  });

  test("only an Owner removes someone else", async () => {
    const team = await fixtures.createTeam();

    const response = await remove(
      team.workspace.id,
      team.viewer.id,
      team.member,
    );

    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("FORBIDDEN");
  });

  test("keeps the last Owner, the owner of a personal workspace, and answers 404 for others", async () => {
    const team = await fixtures.createTeam();
    const lastOwner = await remove(team.workspace.id, "me", team.owner);
    expect(lastOwner.status).toBe(409);
    expect((await errorOf(lastOwner)).code).toBe("LAST_OWNER");

    const owner = await fixtures.createUser();
    const other = await fixtures.createUser();
    const personal = await fixtures.createWorkspace({
      createdById: owner.id,
      isPersonal: true,
    });
    await fixtures.addMember(personal.id, owner.id, "owner");
    await fixtures.addMember(personal.id, other.id, "owner");
    const leaving = await remove(personal.id, "me", owner);
    expect(leaving.status).toBe(409);
    expect((await errorOf(leaving)).code).toBe("CANNOT_LEAVE_PERSONAL");
    const removing = await remove(personal.id, owner.id, other);
    expect(removing.status).toBe(409);
    expect((await errorOf(removing)).code).toBe("PERSONAL_OWNER");

    const stranger = await fixtures.createUser();
    const missing = await remove(team.workspace.id, stranger.id, team.owner);
    expect(missing.status).toBe(404);
    const notAnId = await remove(team.workspace.id, "someone", team.owner);
    expect(notAnId.status).toBe(422);
  });

  test("refuses an Owner demoted while their removal of someone waited", async () => {
    const team = await fixtures.createTeam();
    const second = await fixtures.createUser();
    await fixtures.addMember(team.workspace.id, second.id, "owner");
    const cookie = await cookieOf(team.owner);

    // Holds the members' lock, as a role change by the other Owner does.
    const started: { response?: Promise<Response> } = {};
    await db.transaction(async (tx) => {
      await lockMembers(tx, team.workspace.id);
      started.response = app.handle(
        apiRequest(
          "DELETE",
          `/api/v1/workspaces/${team.workspace.id}/members/${team.member.id}`,
          { cookie },
        ),
      );
      await untilBlockedBy(db, tx);
      await tx
        .update(memberships)
        .set({ role: "member" })
        .where(
          and(
            eq(memberships.workspaceId, team.workspace.id),
            eq(memberships.userId, team.owner.id),
          ),
        );
    });
    const response = await started.response;

    expect(response?.status).toBe(403);
    expect(await roleOf(team.workspace.id, team.member.id)).toBe("member");
  });
});

describe("W8 GET /api/v1/workspaces/{workspaceId}/mention-candidates", () => {
  const candidates = async (
    workspaceId: string,
    query: string,
    caller: { email: string },
  ) =>
    app.handle(
      apiRequest(
        "GET",
        `/api/v1/workspaces/${workspaceId}/mention-candidates?${query}`,
        { cookie: await cookieOf(caller) },
      ),
    );

  test("offers every member by name, Viewers and suspended ones included", async () => {
    const team = await fixtures.createTeam();
    const suspended = await fixtures.createUser({
      displayName: "Benny",
      status: "suspended",
    });
    await fixtures.addMember(team.workspace.id, suspended.id, "member");
    const { idea } = await fixtures.createIdea(
      team.workspace.id,
      team.owner.id,
    );

    const response = await candidates(
      team.workspace.id,
      `targetType=idea&targetId=${idea.id}`,
      team.viewer,
    );

    expect(response.status).toBe(200);
    const { items } = (await response.json()) as {
      items: { id: string; displayName: string; badge: string | null }[];
    };
    expect(items.map((item) => [item.displayName, item.badge])).toEqual([
      ["Benny", "suspended"],
      ["Member", null],
      ["Owner", null],
      ["Viewer", null],
    ]);
  });

  test("answers 404 NOT_FOUND for an item that is not in the workspace", async () => {
    const team = await fixtures.createTeam();
    const other = await fixtures.createTeam();
    const { idea, validation } = await fixtures.createIdea(
      team.workspace.id,
      team.owner.id,
    );
    const plan = await fixtures.createPlan(idea.id, team.owner.id);
    const [kept, gone] = await db
      .insert(competitors)
      .values([
        { validationId: validation.id, name: "Rival", sortOrder: 0 },
        {
          validationId: validation.id,
          name: "Closed",
          sortOrder: 1,
          deletedAt: new Date(),
        },
      ])
      .returning();
    const elsewhere = await fixtures.createIdea(
      other.workspace.id,
      other.owner.id,
    );
    const undone = await fixtures.createIdea(team.workspace.id, team.owner.id, {
      deletedAt: new Date(),
    });
    const undonePlan = await fixtures.createPlan(idea.id, team.owner.id, {
      deletedAt: new Date(),
    });
    const removedItem = await fixtures.createExecutionItem(plan.id, {
      deletedAt: new Date(),
    });
    const statusOf = async (query: string) =>
      (await candidates(team.workspace.id, query, team.member)).status;

    for (const query of [
      `targetType=idea&targetId=${idea.id}`,
      `targetType=validation_answer&targetId=${validation.id}&targetKey=V.01.WHO`,
      `targetType=competitor&targetId=${kept?.id}`,
      `targetType=plan_answer&targetId=${plan.id}&targetKey=P.01.1`,
    ]) {
      expect({ query, status: await statusOf(query) }).toEqual({
        query,
        status: 200,
      });
    }
    for (const query of [
      `targetType=idea&targetId=${crypto.randomUUID()}`,
      `targetType=idea&targetId=${elsewhere.idea.id}`,
      `targetType=validation_answer&targetId=${elsewhere.validation.id}`,
      `targetType=idea&targetId=${undone.idea.id}`,
      `targetType=plan_answer&targetId=${undonePlan.id}&targetKey=P.01.1`,
      `targetType=competitor&targetId=${gone?.id}`,
      `targetType=execution_item&targetId=${removedItem.id}`,
    ]) {
      const response = await candidates(team.workspace.id, query, team.member);
      expect({ query, status: response.status }).toEqual({
        query,
        status: 404,
      });
      expect((await errorOf(response)).code).toBe("NOT_FOUND");
    }
  });

  test("on a shared self-analysis, offers its workspace's Owners and Members only", async () => {
    const team = await fixtures.createTeam();
    const analysis = await fixtures.createSelfAnalysis(team.member.id, [
      team.workspace.id,
    ]);
    const query = `targetType=self_analysis_answer&targetId=${analysis.id}&targetKey=SA.WHY.1`;

    const response = await candidates(team.workspace.id, query, team.owner);

    expect(response.status).toBe(200);
    const { items } = (await response.json()) as { items: { id: string }[] };
    expect(items.map((item) => item.id).sort()).toEqual(
      [team.member.id, team.owner.id].sort(),
    );
    const viewer = await candidates(team.workspace.id, query, team.viewer);
    expect(viewer.status).toBe(403);
    expect((await errorOf(viewer)).code).toBe("FORBIDDEN");
  });

  test("refuses a self-analysis that is not shared here, or a question it lacks", async () => {
    const team = await fixtures.createTeam();
    const analysis = await fixtures.createSelfAnalysis(team.member.id);
    const notShared = await candidates(
      team.workspace.id,
      `targetType=self_analysis_answer&targetId=${analysis.id}&targetKey=SA.WHY.1`,
      team.owner,
    );
    expect(notShared.status).toBe(403);
    expect((await errorOf(notShared)).code).toBe("NOT_SHARED");

    await db
      .insert(selfAnalysisShares)
      .values({ selfAnalysisId: analysis.id, workspaceId: team.workspace.id });
    for (const key of ["&targetKey=SA.WHY.99", ""]) {
      const response = await candidates(
        team.workspace.id,
        `targetType=self_analysis_answer&targetId=${analysis.id}${key}`,
        team.owner,
      );
      expect(response.status).toBe(404);
    }
    const missing = await candidates(
      team.workspace.id,
      `targetType=self_analysis_answer&targetId=${crypto.randomUUID()}&targetKey=SA.WHY.1`,
      team.owner,
    );
    expect(missing.status).toBe(404);
  });

  test("needs a target", async () => {
    const team = await fixtures.createTeam();
    for (const query of [
      "",
      "targetType=nothing&targetId=x",
      "targetType=idea",
      // Items C1 takes no comments on.
      `targetType=business_plan&targetId=${crypto.randomUUID()}`,
      `targetType=template_version&targetId=${crypto.randomUUID()}&targetKey=validation`,
      // design-spec 6.0.8 refuses NUL in any text, which PostgreSQL cannot hold.
      `targetType=self_analysis_answer&targetId=${crypto.randomUUID()}&targetKey=SA.WHY.1%00`,
    ]) {
      const response = await candidates(team.workspace.id, query, team.owner);
      expect(response.status).toBe(422);
    }
  });
});
