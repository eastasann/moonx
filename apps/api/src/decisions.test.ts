import { afterAll, describe, expect, test } from "bun:test";
import {
  decisionLogEntries,
  ideas,
  notifications,
  users,
  workspaces,
} from "@moonx/db";
import {
  decisionContextSchema,
  decisionResultSchema,
  errorBodySchema,
  ideaDetailSchema,
  validationAnswerSchema,
} from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { buildTestApp, connectTestDatabase, uniqueIp } from "./test-app";
import { apiRequest, signIn, testFixtures } from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
let clock = Date.UTC(2026, 9, 1, 3, 0);
const { app } = buildTestApp(database, { now: () => clock });

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

const cookieOf = (user: { email: string }) =>
  signIn(app, user.email, uniqueIp());

async function teamWithIdea() {
  const team = await fixtures.createTeam();
  const ownerCookie = await cookieOf(team.owner);
  const memberCookie = await cookieOf(team.member);
  const viewerCookie = await cookieOf(team.viewer);
  await fixtures.templateVersion("validation");
  const response = await app.handle(
    apiRequest("POST", `/api/v1/workspaces/${team.workspace.id}/ideas`, {
      cookie: ownerCookie,
      body: { name: "Piaya boxes", oneLineConcept: "Gift boxes for offices" },
    }),
  );
  const idea = ideaDetailSchema.parse(await response.json());
  return { ...team, ownerCookie, memberCookie, viewerCookie, idea };
}

type Team = Awaited<ReturnType<typeof teamWithIdea>>;

const record = (
  team: Team,
  body: Record<string, unknown>,
  cookie = team.memberCookie,
) =>
  app.handle(
    apiRequest("POST", `/api/v1/ideas/${team.idea.id}/decisions`, {
      cookie,
      body,
    }),
  );

const context = async (team: Team, cookie = team.ownerCookie) => {
  const response = await app.handle(
    apiRequest("GET", `/api/v1/ideas/${team.idea.id}/decision-context`, {
      cookie,
    }),
  );
  expect(response.status).toBe(200);
  return decisionContextSchema.parse(await response.json());
};

describe("V18 GET /api/v1/ideas/{ideaId}/decision-context", () => {
  test("gathers the summary, five key numbers, the checks not done and the F/A/U breakdown", async () => {
    const team = await teamWithIdea();
    for (const [key, text] of [
      ["V.01.WHO", "HR officers"],
      ["V.10.BIGGEST_RISK", "Stale boxes"],
      ["V.10.BIGGEST_UNKNOWN", "   "],
    ] as const) {
      const saved = await app.handle(
        apiRequest(
          "PUT",
          `/api/v1/validations/${team.idea.validationId}/answers/${key}`,
          { cookie: team.ownerCookie, body: { text, lockVersion: 0 } },
        ),
      );
      validationAnswerSchema.parse(await saved.json());
    }
    const view = await context(team);
    expect(view.summary).toEqual({
      oneLineConcept: "Gift boxes for offices",
      customer: "HR officers",
      problem: null,
      solution: null,
      marketType: null,
      biggestOpportunity: null,
      biggestRisk: "Stale boxes",
      biggestUnknown: null,
    });
    expect(Object.keys(view.keyMetrics).sort()).toEqual([
      "break_even_units_day",
      "expected_operating_profit",
      "initial_cost_total",
      "payback_months",
      "simple_roi",
    ]);
    expect(view.missingChecks).toHaveLength(6);
    expect(view.fau.unclassified).toBe(2);
    expect(view.lastDecision).toBeNull();
  });

  test("shows an archived idea's material to its Owners and Members, and nothing to a Viewer", async () => {
    const team = await teamWithIdea();
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    await context(team, team.memberCookie);
    const viewer = await app.handle(
      apiRequest("GET", `/api/v1/ideas/${team.idea.id}/decision-context`, {
        cookie: team.viewerCookie,
      }),
    );
    expect((await errorOf(viewer)).code).toBe("FORBIDDEN");
  });
});

describe("V19 POST /api/v1/ideas/{ideaId}/decisions", () => {
  test("records the decision with its snapshot, changes the latest decision and notifies the others", async () => {
    const team = await teamWithIdea();
    const suspended = await fixtures.createUser({ status: "suspended" });
    await fixtures.addMember(team.workspace.id, suspended.id, "member");
    clock += 60_000;

    const response = await record(team, {
      value: "proceed",
      reason: "Worth planning",
      basedOnDecisionId: null,
    });
    expect(response.status).toBe(201);
    const result = decisionResultSchema.parse(await response.json());
    expect(result).toMatchObject({
      latestDecision: "proceed",
      canCreatePlan: true,
      entry: {
        kind: "validation_decision",
        value: "proceed",
        reason: "Worth planning",
        reasonExcerpt: "Worth planning",
        idea: { id: team.idea.id, name: "Piaya boxes" },
        plan: null,
        versionName: null,
        recordedBy: { id: team.member.id },
        recordedAt: new Date(clock).toISOString(),
      },
    });
    expect(result.entry.snapshot.missingChecks).toHaveLength(6);
    expect(result.entry.snapshot.fau.empty).toBeGreaterThan(0);
    expect(result.entry.snapshot.keyMetrics.initial_cost_total).toMatchObject({
      reason: "empty",
    });

    const [idea] = await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, team.idea.id));
    expect(idea?.latestDecision).toBe("proceed");
    expect(idea?.lastActivityAt.getTime()).toBe(clock);
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, team.workspace.id));
    expect(workspace?.lastActiveAt?.getTime()).toBe(clock);

    const sent = await db
      .select()
      .from(notifications)
      .where(eq(notifications.decisionLogEntryId, result.entry.id));
    expect(sent.map((row) => row.userId).sort()).toEqual(
      [team.owner.id, team.viewer.id].sort(),
    );
    expect(sent[0]).toMatchObject({
      kind: "decision",
      actorId: team.member.id,
      link: {
        screen: 13,
        workspaceId: team.workspace.id,
        ideaId: team.idea.id,
      },
    });
    // The idea list and 13 read the new decision.
    const hold = await record(team, {
      value: "hold",
      reason: "Permits",
      basedOnDecisionId: result.entry.id,
    });
    expect(decisionResultSchema.parse(await hold.json()).canCreatePlan).toBe(
      false,
    );
  });

  test("answers 409 DECISION_CHANGED when another decision came after the screen opened, unless confirmed", async () => {
    const team = await teamWithIdea();
    const first = decisionResultSchema.parse(
      await (
        await record(team, {
          value: "hold",
          reason: "Not yet",
          basedOnDecisionId: null,
        })
      ).json(),
    );
    for (const basedOnDecisionId of [null]) {
      const response = await record(
        team,
        { value: "drop", reason: "No", basedOnDecisionId },
        team.ownerCookie,
      );
      expect(response.status).toBe(409);
      const error = await errorOf(response);
      expect(error.code).toBe("DECISION_CHANGED");
      expect(error.latest).toMatchObject({
        id: first.entry.id,
        value: "hold",
        recordedBy: { id: team.member.id },
      });
    }
    clock += 60_000;
    const second = decisionResultSchema.parse(
      await (
        await record(
          team,
          {
            value: "drop",
            reason: "No",
            basedOnDecisionId: null,
            confirmNewer: true,
          },
          team.ownerCookie,
        )
      ).json(),
    );
    const stale = await record(team, {
      value: "proceed",
      reason: "Yes",
      basedOnDecisionId: first.entry.id,
    });
    expect((await errorOf(stale)).latest).toMatchObject({
      id: second.entry.id,
    });
    const entries = await db
      .select()
      .from(decisionLogEntries)
      .where(eq(decisionLogEntries.ideaId, team.idea.id));
    expect(entries.map((entry) => entry.value).sort()).toEqual([
      "drop",
      "hold",
    ]);
  });

  test("refuses a blank reason, an unknown basis, an archived idea and a Viewer", async () => {
    const team = await teamWithIdea();
    const blank = await record(team, {
      value: "hold",
      reason: "  ",
      basedOnDecisionId: null,
    });
    expect((await errorOf(blank)).details?.[0]?.path).toBe("reason");
    const unknown = await record(team, {
      value: "hold",
      reason: "r",
      basedOnDecisionId: crypto.randomUUID(),
    });
    expect((await errorOf(unknown)).details?.[0]?.path).toBe(
      "basedOnDecisionId",
    );
    const viewer = await record(
      team,
      { value: "hold", reason: "r", basedOnDecisionId: null },
      team.viewerCookie,
    );
    expect(viewer.status).toBe(403);
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    const archived = await record(team, {
      value: "hold",
      reason: "r",
      basedOnDecisionId: null,
    });
    expect((await errorOf(archived)).code).toBe("ARCHIVED");
    expect(
      await db
        .select()
        .from(decisionLogEntries)
        .where(eq(decisionLogEntries.ideaId, team.idea.id)),
    ).toEqual([]);
  });

  test("records after the latest decision even when another clock ran ahead, and keeps no links into writing", async () => {
    const team = await teamWithIdea();
    const ahead = new Date(clock + 3_600_000);
    const [future] = await db
      .insert(decisionLogEntries)
      .values({
        workspaceId: team.workspace.id,
        ideaId: team.idea.id,
        kind: "validation_decision",
        value: "hold",
        reason: "From a clock ahead",
        snapshot: {},
        recordedById: team.owner.id,
        recordedAt: ahead,
      })
      .returning();
    const result = decisionResultSchema.parse(
      await (
        await record(team, {
          value: "proceed",
          reason: "Now",
          basedOnDecisionId: future?.id ?? null,
        })
      ).json(),
    );
    expect(Date.parse(result.entry.recordedAt)).toBe(ahead.getTime() + 1);
    expect((await context(team)).lastDecision?.id).toBe(result.entry.id);
    const demand = result.entry.snapshot.missingChecks.find(
      (check) => check.key === "demand_signal",
    );
    expect(demand?.link).toBeNull();
  });

  test("a deleted member gets no notification", async () => {
    const team = await teamWithIdea();
    await db
      .update(users)
      .set({ status: "deleted" })
      .where(eq(users.id, team.viewer.id));
    const result = decisionResultSchema.parse(
      await (
        await record(team, {
          value: "hold",
          reason: "r",
          basedOnDecisionId: null,
        })
      ).json(),
    );
    const sent = await db
      .select()
      .from(notifications)
      .where(eq(notifications.decisionLogEntryId, result.entry.id));
    expect(sent.map((row) => row.userId)).toEqual([team.owner.id]);
  });
});
