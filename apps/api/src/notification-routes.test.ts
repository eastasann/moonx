import { afterAll, describe, expect, test } from "bun:test";
import { memberships, notifications, selfAnalysisShares } from "@moonx/db";
import {
  errorBodySchema,
  notificationPageSchema,
  planHomeSchema,
  unreadCountSchema,
} from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { buildTestApp, connectTestDatabase } from "./test-app";
import {
  apiRequest,
  teamWithNewIdea,
  teamWithProceedIdea,
  testFixtures,
} from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
let clock = Date.UTC(2026, 9, 1, 3, 0);
const tick = () => {
  clock += 1000;
};
const { app } = buildTestApp(database, { now: () => clock });

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

const call = (
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  cookie: string,
  body?: unknown,
) => app.handle(apiRequest(method, path, { cookie, body }));

async function inbox(cookie: string, query = "") {
  const response = await call("GET", `/api/v1/notifications${query}`, cookie);
  expect(response.status).toBe(200);
  return notificationPageSchema.parse(await response.json());
}

async function unread(cookie: string) {
  const response = await call(
    "GET",
    "/api/v1/notifications/unread-count",
    cookie,
  );
  expect(response.status).toBe(200);
  return unreadCountSchema.parse(await response.json()).total;
}

describe("N1 GET /api/v1/notifications", () => {
  test("says who did what where, with the start of the comment, newest first", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    tick();
    const response = await call("POST", "/api/v1/comments", team.memberCookie, {
      workspaceId: team.workspace.id,
      target: {
        type: "validation_answer",
        id: team.validationId,
        key: "V.01.WHO",
      },
      body: `@Owner ${"who ".repeat(80)}`,
      mentionUserIds: [team.owner.id],
    });
    expect(response.status).toBe(201);
    tick();
    await call(
      "POST",
      `/api/v1/ideas/${team.idea.id}/decisions`,
      team.memberCookie,
      {
        value: "hold",
        reason: "Still missing",
        basedOnDecisionId: null,
      },
    );
    const page = await inbox(team.ownerCookie);
    expect(page.items.map((item) => item.title)).toEqual([
      "Member recorded Hold on Piaya boxes",
      "Member mentioned you on 01 WHO · Piaya boxes",
    ]);
    const [decision, mention] = page.items;
    expect(decision).toMatchObject({
      kind: "decision",
      workspace: { id: team.workspace.id, name: "Team" },
      actor: { id: team.member.id },
      excerpt: "Still missing",
      link: { screen: 13, ideaId: team.idea.id },
      accessible: true,
      readAt: null,
    });
    expect(mention?.kind).toBe("mention");
    expect(mention?.excerpt).toHaveLength(200);
    expect(mention?.excerpt?.endsWith("…")).toBe(true);
    expect(mention?.link).toMatchObject({
      screen: 11,
      sectionKey: "01",
      questionKey: "V.01.WHO",
      panel: "comments",
    });
    expect(await unread(team.ownerCookie)).toBe(2);
    // Viewers hear of decisions too, but not of a comment they do not follow.
    expect((await inbox(team.viewerCookie)).items.map((i) => i.title)).toEqual([
      "Member recorded Hold on Piaya boxes",
    ]);
  });

  test("names plans, versions and self-analyses, and filters the unread", async () => {
    const team = await teamWithProceedIdea(app, fixtures);
    tick();
    const drafted = await call(
      "POST",
      `/api/v1/ideas/${team.idea.id}/plans`,
      team.ownerCookie,
      { name: "Plan A" },
    );
    const plan = planHomeSchema.parse(await drafted.json());
    tick();
    expect(
      (
        await call(
          "POST",
          `/api/v1/plans/${plan.id}/versions`,
          team.memberCookie,
          {
            name: "v1 For advisors",
          },
        )
      ).status,
    ).toBe(201);
    tick();
    expect(
      (
        await call(
          "POST",
          `/api/v1/plans/${plan.id}/go-no-go`,
          team.memberCookie,
          {
            value: "delay",
            reason: "Pilot first",
          },
        )
      ).status,
    ).toBe(201);
    tick();
    await call("POST", "/api/v1/comments", team.memberCookie, {
      workspaceId: team.workspace.id,
      target: { type: "plan_answer", id: plan.id, key: "P.05.1" },
      body: "Shorter?",
      mentionUserIds: [],
    });
    const analysis = await fixtures.createSelfAnalysis(team.owner.id, [
      team.workspace.id,
    ]);
    tick();
    await call("POST", "/api/v1/comments", team.memberCookie, {
      workspaceId: team.workspace.id,
      target: {
        type: "self_analysis_answer",
        id: analysis.id,
        key: "SA.WHY.1",
      },
      body: "Strong",
      mentionUserIds: [],
    });
    const page = await inbox(team.ownerCookie);
    expect(page.items.map((item) => item.title)).toEqual([
      "Member commented on WHY SA.WHY.1 · your self-analysis",
      expect.stringMatching(
        /^Member commented on 05 .+ · Plan A · Piaya boxes$/,
      ),
      "Member recorded Delay on Plan A · Piaya boxes",
      "Member saved the version “v1 For advisors” of Plan A · Piaya boxes",
    ]);
    expect(page.items[3]?.excerpt).toBeNull();
    expect(page.items[2]?.link).toMatchObject({ screen: 20, planId: plan.id });

    const first = page.items[3]?.id ?? "";
    const read = await call(
      "POST",
      `/api/v1/notifications/${first}/read`,
      team.ownerCookie,
    );
    expect(read.status).toBe(204);
    const unreadOnly = await inbox(team.ownerCookie, "?filter=unread");
    expect(unreadOnly.items.map((item) => item.id)).not.toContain(first);
    expect(unreadOnly.items).toHaveLength(3);
    const paged = await inbox(team.ownerCookie, "?limit=2");
    expect(paged.items).toHaveLength(2);
    expect(paged.nextCursor).toBe("2");
    expect(
      (await inbox(team.ownerCookie, "?limit=2&cursor=2")).nextCursor,
    ).toBeNull();
  });

  test("marks what the recipient can no longer open", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const analysis = await fixtures.createSelfAnalysis(team.owner.id, [
      team.workspace.id,
    ]);
    tick();
    await call("POST", "/api/v1/comments", team.ownerCookie, {
      workspaceId: team.workspace.id,
      target: {
        type: "self_analysis_answer",
        id: analysis.id,
        key: "SA.WHY.1",
      },
      body: "@Member what do you think?",
      mentionUserIds: [team.member.id],
    });
    tick();
    await call("POST", "/api/v1/comments", team.ownerCookie, {
      workspaceId: team.workspace.id,
      target: { type: "idea", id: team.idea.id },
      body: "@Member look",
      mentionUserIds: [team.member.id],
    });
    const accessible = async () =>
      (await inbox(team.memberCookie)).items.map((item) => item.accessible);
    expect(await accessible()).toEqual([true, true]);
    // Ending the share closes the self-analysis to the member (design-spec 6.15).
    await db
      .delete(selfAnalysisShares)
      .where(eq(selfAnalysisShares.selfAnalysisId, analysis.id));
    expect(await accessible()).toEqual([true, false]);
    // What it can no longer read is not shown: who acted, and nothing more.
    const [, closed] = (await inbox(team.memberCookie)).items;
    expect(closed).toMatchObject({
      title: "Owner mentioned you",
      excerpt: null,
    });
    await db
      .delete(memberships)
      .where(
        and(
          eq(memberships.workspaceId, team.workspace.id),
          eq(memberships.userId, team.member.id),
        ),
      );
    expect(await accessible()).toEqual([false, false]);
    expect(
      (await inbox(team.memberCookie)).items.map((item) => item.title),
    ).toEqual(["Owner mentioned you", "Owner mentioned you"]);
  });
});

describe("N2 and N3", () => {
  test("count the unread, mark one or all as read, and keep to the caller's own", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    for (const reason of ["one", "two"]) {
      tick();
      await call(
        "POST",
        `/api/v1/ideas/${team.idea.id}/decisions`,
        team.ownerCookie,
        {
          value: "hold",
          reason,
          basedOnDecisionId: null,
          confirmNewer: true,
        },
      );
    }
    expect(await unread(team.memberCookie)).toBe(2);
    const [mine] = (await inbox(team.memberCookie)).items;
    const others = await call(
      "POST",
      `/api/v1/notifications/${mine?.id}/read`,
      team.viewerCookie,
    );
    expect(others.status).toBe(404);
    expect((await errorOf(others)).code).toBe("NOT_FOUND");
    for (const id of [crypto.randomUUID(), "nope"]) {
      expect(
        (
          await call(
            "POST",
            `/api/v1/notifications/${id}/read`,
            team.memberCookie,
          )
        ).status,
      ).toBe(404);
    }
    tick();
    expect(
      (
        await call(
          "POST",
          `/api/v1/notifications/${mine?.id}/read`,
          team.memberCookie,
        )
      ).status,
    ).toBe(204);
    expect(await unread(team.memberCookie)).toBe(1);
    const readAt = clock;
    tick();
    await call(
      "POST",
      `/api/v1/notifications/${mine?.id}/read`,
      team.memberCookie,
    );
    const [row] = await db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, mine?.id ?? ""));
    expect(row?.readAt?.getTime()).toBe(readAt);
    expect(
      (await call("POST", "/api/v1/notifications/read-all", team.memberCookie))
        .status,
    ).toBe(204);
    expect(await unread(team.memberCookie)).toBe(0);
    expect(await unread(team.viewerCookie)).toBe(2);
  });

  test("ask for a session", async () => {
    for (const [method, path] of [
      ["GET", "/api/v1/notifications"],
      ["GET", "/api/v1/notifications/unread-count"],
      ["POST", "/api/v1/notifications/read-all"],
    ] as const) {
      const response = await app.handle(apiRequest(method, path));
      expect(response.status).toBe(401);
    }
  });
});
