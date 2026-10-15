import { afterAll, describe, expect, test } from "bun:test";
import { decisionLogEntries, ideas, users } from "@moonx/db";
import {
  decisionLogEntrySchema,
  decisionLogPageSchema,
  decisionResultSchema,
  errorBodySchema,
} from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { buildTestApp, connectTestDatabase } from "./test-app";
import { apiRequest, teamWithNewIdea, testFixtures } from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
const { app } = buildTestApp(database);

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

const get = (path: string, cookie: string) =>
  app.handle(apiRequest("GET", path, { cookie }));

/** Records a decision through V19, as 19 does. */
async function decide(
  team: Awaited<ReturnType<typeof teamWithNewIdea>>,
  value: "proceed" | "hold" | "drop",
  reason: string,
  cookie = team.ownerCookie,
) {
  const response = await app.handle(
    apiRequest("POST", `/api/v1/ideas/${team.idea.id}/decisions`, {
      cookie,
      body: { value, reason, basedOnDecisionId: null, confirmNewer: true },
    }),
  );
  expect(response.status).toBe(201);
  return decisionResultSchema.parse(await response.json()).entry;
}

describe("L1 GET /api/v1/workspaces/{workspaceId}/decision-log", () => {
  test("lists the workspace's decisions newest first, for Viewers too", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const first = await decide(team, "hold", "Costs are missing");
    const second = await decide(team, "proceed", "x".repeat(250));
    const response = await get(
      `/api/v1/workspaces/${team.workspace.id}/decision-log`,
      team.viewerCookie,
    );
    expect(response.status).toBe(200);
    const page = decisionLogPageSchema.parse(await response.json());
    expect(page.items.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(page.nextCursor).toBeNull();
    const [latest] = page.items;
    expect(latest?.idea).toEqual({ id: team.idea.id, name: "Piaya boxes" });
    expect(latest?.plan).toBeNull();
    expect(latest?.recordedBy.id).toBe(team.owner.id);
    // design-spec 6.15: the reason's start, cut with "…".
    expect(latest?.reasonExcerpt).toBe(`${"x".repeat(199)}…`);
  });

  test("filters by kind, idea, plan, recorder and the caller's days", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const hold = await decide(team, "hold", "Not yet", team.memberCookie);
    const proceed = await decide(team, "proceed", "Ready");
    const other = await fixtures.createIdea(team.workspace.id, team.owner.id);
    await fixtures.createDecision(
      { id: other.idea.id, workspaceId: team.workspace.id },
      team.owner.id,
      "drop",
    );
    const plan = await fixtures.createPlan(team.idea.id, team.owner.id);
    const [goNoGo] = await db
      .insert(decisionLogEntries)
      .values({
        workspaceId: team.workspace.id,
        ideaId: team.idea.id,
        businessPlanId: plan.id,
        kind: "go_no_go",
        value: "delay",
        reason: "Pilot first",
        snapshot: {},
        recordedById: team.member.id,
      })
      .returning();
    const version = goNoGo?.id ?? "";
    const list = async (query: string) => {
      const response = await get(
        `/api/v1/workspaces/${team.workspace.id}/decision-log?${query}`,
        team.ownerCookie,
      );
      expect(response.status).toBe(200);
      return decisionLogPageSchema
        .parse(await response.json())
        .items.map((item) => item.id);
    };
    expect(
      await list(`ideaId=${team.idea.id}&kind=validation_decision`),
    ).toEqual([proceed.id, hold.id]);
    expect(await list(`recordedBy=${team.member.id}`)).toEqual([
      version,
      hold.id,
    ]);
    expect(await list(`planId=${plan.id}`)).toEqual([version]);
    expect(await list("kind=go_no_go")).toEqual([version]);

    // A day in Manila (UTC+8) starts at 16:00 UTC the day before.
    await db
      .update(users)
      .set({ timezone: "Asia/Manila" })
      .where(eq(users.id, team.owner.id));
    await db
      .update(decisionLogEntries)
      .set({ recordedAt: new Date("2026-03-01T15:59:59.000Z") })
      .where(eq(decisionLogEntries.id, hold.id));
    await db
      .update(decisionLogEntries)
      .set({ recordedAt: new Date("2026-03-01T16:00:00.000Z") })
      .where(eq(decisionLogEntries.id, proceed.id));
    expect(
      await list(`ideaId=${team.idea.id}&from=2026-03-02&to=2026-03-02`),
    ).toEqual([proceed.id]);
    expect(
      await list(
        `ideaId=${team.idea.id}&kind=validation_decision&to=2026-03-01`,
      ),
    ).toEqual([hold.id]);
  });

  test("pages with cursor and limit", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    for (const reason of ["one", "two", "three"]) {
      await decide(team, "hold", reason);
    }
    const page = async (query: string) =>
      decisionLogPageSchema.parse(
        await (
          await get(
            `/api/v1/workspaces/${team.workspace.id}/decision-log?${query}`,
            team.ownerCookie,
          )
        ).json(),
      );
    const first = await page("limit=2");
    expect(first.items.map((item) => item.reasonExcerpt)).toEqual([
      "three",
      "two",
    ]);
    expect(first.nextCursor).toBe("2");
    const second = await page("limit=2&cursor=2");
    expect(second.items.map((item) => item.reasonExcerpt)).toEqual(["one"]);
    expect(second.nextCursor).toBeNull();
    const bad = await get(
      `/api/v1/workspaces/${team.workspace.id}/decision-log?cursor=x`,
      team.ownerCookie,
    );
    expect(bad.status).toBe(422);
    expect((await errorOf(bad)).details?.[0]?.path).toBe("cursor");
  });

  test("leaves out ideas whose creation was undone", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    await decide(team, "hold", "Gone soon");
    await db
      .update(ideas)
      .set({ deletedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    const response = await get(
      `/api/v1/workspaces/${team.workspace.id}/decision-log`,
      team.ownerCookie,
    );
    expect(decisionLogPageSchema.parse(await response.json()).items).toEqual(
      [],
    );
  });
});

describe("L2 GET /api/v1/decision-log/{entryId}", () => {
  test("returns the entry with its snapshot", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const entry = await decide(team, "hold", "Costs are missing");
    const response = await get(
      `/api/v1/decision-log/${entry.id}`,
      team.viewerCookie,
    );
    expect(response.status).toBe(200);
    const read = decisionLogEntrySchema.parse(await response.json());
    expect(read).toEqual(entry);
    expect(read.reason).toBe("Costs are missing");
    expect(read.snapshot.missingChecks.length).toBeGreaterThan(0);
  });

  test("answers 404 for no entry, an id that is no UUID, and 403 outside the workspace", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const entry = await decide(team, "hold", "Costs are missing");
    for (const id of [crypto.randomUUID(), "nope"]) {
      const response = await get(
        `/api/v1/decision-log/${id}`,
        team.ownerCookie,
      );
      expect(response.status).toBe(404);
    }
    const outsider = await teamWithNewIdea(app, fixtures);
    const response = await get(
      `/api/v1/decision-log/${entry.id}`,
      outsider.ownerCookie,
    );
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("NO_ACCESS");
  });
});
