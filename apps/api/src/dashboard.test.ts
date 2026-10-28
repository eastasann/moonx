import { afterAll, describe, expect, test } from "bun:test";
import {
  changeHistory,
  comments,
  competitors,
  executionItems,
  type ideas,
  selfAnalyses,
  users,
} from "@moonx/db";
import {
  dashboardActivitySchema,
  dashboardDueSoonSchema,
  dashboardIdeasSchema,
  dashboardSelfAnalysesSchema,
  ideaDetailSchema,
  ideaDuplicateResultSchema,
} from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { buildTestApp, connectTestDatabase, uniqueIp } from "./test-app";
import { apiRequest, signIn, testFixtures } from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
const MINUTE = 60_000;
let clock = Date.UTC(2026, 9, 15, 20, 0);
const { app } = buildTestApp(database, { now: () => clock });

const cookieOf = (user: { email: string }) =>
  signIn(app, user.email, uniqueIp());

async function signedInTeam() {
  const team = await fixtures.createTeam();
  return {
    ...team,
    ownerCookie: await cookieOf(team.owner),
    memberCookie: await cookieOf(team.member),
    viewerCookie: await cookieOf(team.viewer),
  };
}

type Team = Awaited<ReturnType<typeof signedInTeam>>;

const dashboard = async (team: Team, block: string, cookie: string) => {
  const response = await app.handle(
    apiRequest(
      "GET",
      `/api/v1/workspaces/${team.workspace.id}/dashboard/${block}`,
      { cookie },
    ),
  );
  expect(response.status).toBe(200);
  return response.json();
};

describe("D1 GET .../dashboard/ideas", () => {
  test("lists the ideas neither archived nor Drop by latest activity, and counts the Drop ones", async () => {
    const team = await signedInTeam();
    const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 0, minutes));
    const make = (name: string, values: Partial<typeof ideas.$inferInsert>) =>
      fixtures.createIdea(team.workspace.id, team.owner.id, {
        name,
        ...values,
      });
    await make("Older", { lastActivityAt: at(1) });
    await make("Newer", { lastActivityAt: at(2), latestDecision: "hold" });
    await make("Dropped", { lastActivityAt: at(3), latestDecision: "drop" });
    await make("Archived drop", {
      latestDecision: "drop",
      archivedAt: at(4),
    });
    await make("Archived", { archivedAt: at(4) });
    await make("Undone", { deletedAt: at(5) });
    const other = await fixtures.createTeam();
    await fixtures.createIdea(other.workspace.id, other.owner.id);

    const body = dashboardIdeasSchema.parse(
      await dashboard(team, "ideas", team.viewerCookie),
    );
    expect(body.items.map((item) => item.name)).toEqual(["Newer", "Older"]);
    expect(body.droppedCount).toBe(1);
  });
});

describe("D2 GET .../dashboard/self-analyses", () => {
  test("lists Owners and Members by name, with how far they are only where shared", async () => {
    const team = await signedInTeam();
    const extra = await fixtures.createUser({ displayName: "Aaron" });
    await fixtures.addMember(team.workspace.id, extra.id, "member");
    const shared = await fixtures.createSelfAnalysis(team.owner.id, [
      team.workspace.id,
    ]);
    await db
      .update(selfAnalyses)
      .set({ status: "in_progress" })
      .where(eq(selfAnalyses.id, shared.id));
    const elsewhere = await fixtures.createWorkspace();
    const unshared = await fixtures.createSelfAnalysis(team.member.id, [
      elsewhere.id,
    ]);
    await db
      .update(selfAnalyses)
      .set({ status: "done" })
      .where(eq(selfAnalyses.id, unshared.id));
    await fixtures.createSelfAnalysis(team.viewer.id, [team.workspace.id]);

    const body = dashboardSelfAnalysesSchema.parse(
      await dashboard(team, "self-analyses", team.memberCookie),
    );
    expect(
      body.items.map((item) => [
        item.user.displayName,
        item.shared,
        item.status,
      ]),
    ).toEqual([
      ["Aaron", false, null],
      ["Member", false, null],
      ["Owner", true, "in_progress"],
    ]);
  });
});

describe("D3 GET .../dashboard/due-soon", () => {
  test("lists open items due within 7 days or overdue, the caller's first, by today in their time zone", async () => {
    const team = await signedInTeam();
    // 20:00 UTC on Oct 15 is already Oct 16 in Manila.
    clock = Date.UTC(2026, 9, 15, 20, 0);
    await db
      .update(users)
      .set({ timezone: "Asia/Manila" })
      .where(eq(users.id, team.owner.id));
    await db
      .update(users)
      .set({ timezone: "UTC" })
      .where(eq(users.id, team.member.id));
    const { idea } = await fixtures.createIdea(
      team.workspace.id,
      team.owner.id,
      { name: "Piaya" },
    );
    const plan = await fixtures.createPlan(idea.id, team.owner.id, {
      name: "Plan A",
    });
    const archivedPlan = await fixtures.createPlan(idea.id, team.owner.id, {
      archivedAt: new Date(),
    });
    const { idea: archivedIdea } = await fixtures.createIdea(
      team.workspace.id,
      team.owner.id,
      { archivedAt: new Date() },
    );
    const hiddenPlan = await fixtures.createPlan(
      archivedIdea.id,
      team.owner.id,
    );
    const item = (
      title: string,
      values: Partial<typeof executionItems.$inferInsert>,
    ) => ({
      businessPlanId: plan.id,
      type: "next_action" as const,
      title,
      status: "todo" as const,
      sortOrder: 0,
      ...values,
    });
    await db.insert(executionItems).values([
      item("Get a quote", {
        type: "milestone",
        dueDate: "2026-10-15",
        assigneeUserId: team.member.id,
      }),
      item("Book venue", {
        dueDate: "2026-10-23",
        status: "doing",
        assigneeUserId: team.owner.id,
      }),
      item("Ask the city", {
        type: "open_question",
        dueDate: "2026-10-10",
        status: "resolved",
      }),
      item("Launch day", {
        type: "launch",
        dueDate: "2026-10-17",
        status: "done",
      }),
      item("Revenue", { type: "kpi", dueDate: "2026-10-17", status: null }),
      item("Print flyers", { dueDate: "2026-10-20", assigneeName: "Lito" }),
      item("Gone", { dueDate: "2026-10-18", deletedAt: new Date() }),
      item("Later", { dueDate: "2026-11-30" }),
      item("No date", {}),
      item("Archived plan", {
        businessPlanId: archivedPlan.id,
        dueDate: "2026-10-18",
      }),
      item("Archived idea", {
        businessPlanId: hiddenPlan.id,
        dueDate: "2026-10-18",
      }),
    ]);

    const owner = dashboardDueSoonSchema.parse(
      await dashboard(team, "due-soon", team.ownerCookie),
    );
    expect(
      owner.items.map((i) => [i.title, i.dueDate, i.overdue, i.isMine]),
    ).toEqual([
      ["Book venue", "2026-10-23", false, true],
      ["Get a quote", "2026-10-15", true, false],
      ["Print flyers", "2026-10-20", false, false],
    ]);
    expect(owner.items[1]).toMatchObject({
      type: "milestone",
      assignee: { user: { id: team.member.id } },
      idea: { id: idea.id, name: "Piaya" },
      plan: { id: plan.id, name: "Plan A" },
    });
    expect(owner.items[2]?.assignee).toEqual({ name: "Lito" });

    const member = dashboardDueSoonSchema.parse(
      await dashboard(team, "due-soon", team.memberCookie),
    );
    expect(member.items.map((i) => [i.title, i.overdue, i.isMine])).toEqual([
      ["Get a quote", false, true],
      ["Print flyers", false, false],
    ]);
  });
});

describe("D4 GET .../dashboard/activity", () => {
  const saveWho = (
    team: Team & { idea: { validationId: string } },
    cookie: string,
    text: string,
    version: number,
  ) =>
    app.handle(
      apiRequest(
        "PUT",
        `/api/v1/validations/${team.idea.validationId}/answers/V.01.WHO`,
        { cookie, body: { text, lockVersion: version } },
      ),
    );

  async function teamWithIdea() {
    const team = await signedInTeam();
    await fixtures.templateVersion("validation");
    const response = await app.handle(
      apiRequest("POST", `/api/v1/workspaces/${team.workspace.id}/ideas`, {
        cookie: team.ownerCookie,
        body: { name: "Piaya boxes", oneLineConcept: "Gift boxes" },
      }),
    );
    return { ...team, idea: ideaDetailSchema.parse(await response.json()) };
  }

  test("one move per operation, one per run of saves within 10 minutes, with comments and decisions", async () => {
    clock = Date.UTC(2026, 9, 1, 0, 0);
    const start = clock;
    const team = await teamWithIdea();
    const minute = (n: number) => {
      clock = start + n * MINUTE;
    };
    minute(1);
    await saveWho(team, team.ownerCookie, "HR", 0);
    minute(4);
    await saveWho(team, team.ownerCookie, "HR officers", 1);
    minute(13);
    await saveWho(team, team.ownerCookie, "HR and admin", 2);
    minute(20);
    await saveWho(team, team.memberCookie, "Admins", 3);
    // The owner's saves at 4 and 13 are one history row from 4 to 13 (ADR-020): only
    // from its first change is it near enough to the answer added at 1.
    const who = await db
      .select({
        changedAt: changeHistory.changedAt,
        firstChangedAt: changeHistory.firstChangedAt,
      })
      .from(changeHistory)
      .where(
        and(
          eq(changeHistory.targetId, team.idea.validationId),
          eq(changeHistory.targetKey, "V.01.WHO"),
        ),
      )
      .orderBy(changeHistory.changedAt);
    expect(
      who
        .filter((row) => row.changedAt.getTime() < start + 20 * MINUTE)
        .map((row) => [
          (row.changedAt.getTime() - start) / MINUTE,
          row.firstChangedAt === null
            ? null
            : (row.firstChangedAt.getTime() - start) / MINUTE,
        ]),
    ).toEqual([
      [1, null],
      [13, 4],
    ]);
    const [rival] = await db
      .insert(competitors)
      .values({
        validationId: team.idea.validationId,
        name: "Closed",
        sortOrder: 0,
        deletedAt: new Date(start),
      })
      .returning();
    const comment = (
      minutes: number,
      values: Partial<typeof comments.$inferInsert>,
    ) => ({
      workspaceId: team.workspace.id,
      containerType: "validation" as const,
      containerId: team.idea.validationId,
      sectionKey: "01",
      targetType: "validation_answer" as const,
      targetId: team.idea.validationId,
      targetKey: "V.01.WHO",
      authorId: team.viewer.id,
      body: "Which offices?",
      createdAt: new Date(start + minutes * MINUTE),
      ...values,
    });
    const analysis = await fixtures.createSelfAnalysis(team.owner.id, [
      team.workspace.id,
    ]);
    await db.insert(comments).values([
      comment(25, {}),
      comment(26, {
        sectionKey: "competitors",
        targetType: "competitor",
        targetId: rival?.id,
        targetKey: null,
      }),
      comment(27, { deletedAt: new Date(start) }),
      comment(28, {
        containerType: "self_analysis",
        containerId: analysis.id,
        sectionKey: "WHY",
        targetType: "self_analysis_answer",
        targetId: analysis.id,
        targetKey: "SA.WHY.1",
      }),
    ]);
    minute(30);
    await app.handle(
      apiRequest("POST", `/api/v1/ideas/${team.idea.id}/decisions`, {
        cookie: team.memberCookie,
        body: { value: "hold", reason: "Permits", basedOnDecisionId: null },
      }),
    );
    minute(40);
    const copy = ideaDuplicateResultSchema.parse(
      await (
        await app.handle(
          apiRequest("POST", `/api/v1/ideas/${team.idea.id}/duplicate`, {
            cookie: team.memberCookie,
            body: { name: "Piaya copy" },
          }),
        )
      ).json(),
    );
    const { idea: undone } = await fixtures.createIdea(
      team.workspace.id,
      team.owner.id,
      { deletedAt: new Date(start) },
    );
    await db.insert(comments).values(
      comment(50, {
        containerType: "idea",
        containerId: undone.id,
        sectionKey: null,
        targetType: "idea",
        targetId: undone.id,
        targetKey: null,
      }),
    );

    const body = dashboardActivitySchema.parse(
      await dashboard(team, "activity", team.viewerCookie),
    );
    expect(
      body.items.map((item) => [
        item.kind,
        item.actor.id,
        (Date.parse(item.at) - start) / MINUTE,
        item.summary,
        item.idea?.name,
      ]),
    ).toEqual([
      ["change", team.member.id, 40, "Piaya copy", "Piaya copy"],
      ["decision", team.member.id, 30, "hold", "Piaya boxes"],
      ["comment", team.viewer.id, 25, "01 WHO", "Piaya boxes"],
      ["change", team.member.id, 20, "01 WHO", "Piaya boxes"],
      // The saves at 4 and 13 are one history row from 4 to 13 (ADR-020), 3 minutes
      // after the answer was added at 1: one run, shown at its last save.
      ["change", team.owner.id, 13, "01 WHO", "Piaya boxes"],
      ["change", team.owner.id, 0, "Piaya boxes", "Piaya boxes"],
    ]);
    const [duplicated, decided, commented, saved, , created] = body.items;
    expect(duplicated?.link).toEqual({
      screen: 13,
      workspaceId: team.workspace.id,
      ideaId: copy.id,
    });
    expect(decided?.link).toEqual({
      screen: 13,
      workspaceId: team.workspace.id,
      ideaId: team.idea.id,
    });
    expect(commented?.link).toEqual({
      screen: 11,
      workspaceId: team.workspace.id,
      ideaId: team.idea.id,
      sectionKey: "01",
      questionKey: "V.01.WHO",
      panel: "comments",
      target: {
        type: "validation_answer",
        id: team.idea.validationId,
        key: "V.01.WHO",
      },
    });
    expect(saved?.link).toEqual({
      screen: 11,
      workspaceId: team.workspace.id,
      ideaId: team.idea.id,
      sectionKey: "01",
      questionKey: "V.01.WHO",
    });
    expect(created?.plan).toBeNull();
  });

  test("reads past one page of operations when a long run of saves merges into one move", async () => {
    const team = await signedInTeam();
    const { idea, validation } = await fixtures.createIdea(
      team.workspace.id,
      team.owner.id,
    );
    const start = Date.UTC(2026, 11, 1, 0, 0);
    const row = (key: string, minutes: number) => ({
      workspaceId: team.workspace.id,
      containerType: "validation" as const,
      containerId: validation.id,
      sectionKey: "01",
      targetType: "validation_answer",
      targetId: validation.id,
      targetKey: key,
      action: "update" as const,
      source: "manual" as const,
      changedById: team.owner.id,
      changedAt: new Date(start + minutes * MINUTE),
    });
    await db
      .insert(changeHistory)
      .values([
        row("V.01.PROBLEM", 0),
        row("V.01.PROOF", 1),
        row("V.01.PAYMENT", 2),
        ...Array.from({ length: 250 }, (_, index) =>
          row("V.01.WHO", 10 + index),
        ),
      ]);
    const body = dashboardActivitySchema.parse(
      await dashboard(team, "activity", team.ownerCookie),
    );
    expect(
      body.items.map((item) => [
        item.summary,
        (Date.parse(item.at) - start) / MINUTE,
      ]),
    ).toEqual([
      ["01 WHO", 259],
      ["01 PAYMENT", 2],
      ["01 PROOF", 1],
      ["01 PROBLEM", 0],
    ]);
    expect(body.items[0]?.idea?.id).toBe(idea.id);
  });

  test("a save more than 10 minutes after the last starts a new move; at most 20 moves", async () => {
    clock = Date.UTC(2026, 10, 1, 0, 0);
    const start = clock;
    const team = await teamWithIdea();
    clock = start + 5 * MINUTE;
    await saveWho(team, team.ownerCookie, "One", 0);
    clock = start + 16 * MINUTE;
    await saveWho(team, team.ownerCookie, "Two", 1);
    let body = dashboardActivitySchema.parse(
      await dashboard(team, "activity", team.ownerCookie),
    );
    expect(body.items.map((item) => item.summary)).toEqual([
      "01 WHO",
      "01 WHO",
      "Piaya boxes",
    ]);

    const keys = [
      "V.01.WHY_THEM",
      "V.01.BEHAVIOR",
      "V.01.PROBLEM",
      "V.01.FREQUENCY",
      "V.01.SEVERITY",
      "V.01.PAYMENT",
      "V.01.SWITCHING",
      "V.01.NON_CUSTOMER",
      "V.01.PROOF",
      "V.02.CATEGORY",
      "V.02.WHY",
      "V.02.DRIVERS",
      "V.02.BARRIERS",
      "V.02.MARKET_SIZE",
      "V.02.REACHABLE",
      "V.02.SHARE",
      "V.10.WHY_WORK",
      "V.10.WHY_FAIL",
      "V.10.MUST_BE_TRUE",
    ];
    for (const [index, key] of keys.entries()) {
      clock = start + (30 + index) * MINUTE;
      await app.handle(
        apiRequest(
          "PUT",
          `/api/v1/validations/${team.idea.validationId}/answers/${key}`,
          { cookie: team.ownerCookie, body: { text: "x", lockVersion: 0 } },
        ),
      );
    }
    body = dashboardActivitySchema.parse(
      await dashboard(team, "activity", team.ownerCookie),
    );
    expect(body.items).toHaveLength(20);
    expect(body.items[0]?.summary).toBe("10 What must be true?");
    expect(body.items.at(-1)?.summary).toBe("01 WHO");
  });
});
