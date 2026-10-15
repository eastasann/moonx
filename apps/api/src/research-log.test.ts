import { afterAll, describe, expect, test } from "bun:test";
import {
  changeHistory,
  competitors,
  costItems,
  evidenceLinks,
  ideas,
  researchLogEntries,
  validationAnswers,
} from "@moonx/db";
import {
  errorBodySchema,
  researchLogDeletionSchema,
  researchLogDetailSchema,
  researchLogEntrySchema,
  researchLogPageSchema,
  validationAnswerSchema,
} from "@moonx/schemas";
import { and, asc, eq } from "drizzle-orm";
import { buildTestApp, connectTestDatabase } from "./test-app";
import { apiRequest, teamWithNewIdea, testFixtures } from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
const { app } = buildTestApp(database);

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

type Team = Awaited<ReturnType<typeof teamWithNewIdea>>;
const newTeam = () => teamWithNewIdea(app, fixtures);

const record = async (
  team: Team,
  body: Record<string, unknown>,
  cookie = team.ownerCookie,
) => {
  const response = await app.handle(
    apiRequest(
      "POST",
      `/api/v1/validations/${team.validationId}/research-log`,
      { cookie, body },
    ),
  );
  expect(response.status).toBe(201);
  return researchLogEntrySchema.parse(await response.json());
};

const list = async (team: Team, query = "", cookie = team.viewerCookie) => {
  const response = await app.handle(
    apiRequest(
      "GET",
      `/api/v1/validations/${team.validationId}/research-log${query}`,
      { cookie },
    ),
  );
  expect(response.status).toBe(200);
  return researchLogPageSchema.parse(await response.json());
};

const detail = async (team: Team, id: string, cookie = team.ownerCookie) => {
  const response = await app.handle(
    apiRequest("GET", `/api/v1/research-log/${id}`, { cookie }),
  );
  expect(response.status).toBe(200);
  return researchLogDetailSchema.parse(await response.json());
};

const edit = (
  team: Team,
  id: string,
  body: Record<string, unknown>,
  cookie = team.ownerCookie,
) =>
  app.handle(
    apiRequest("PATCH", `/api/v1/research-log/${id}`, { cookie, body }),
  );

const remove = (team: Team, id: string, cookie = team.ownerCookie) =>
  app.handle(apiRequest("DELETE", `/api/v1/research-log/${id}`, { cookie }));

const historyOf = (id: string) =>
  db
    .select()
    .from(changeHistory)
    .where(eq(changeHistory.targetId, id))
    .orderBy(asc(changeHistory.changedAt), asc(changeHistory.id));

/** Answers the question `key` and makes it a Fact on the evidence of `logId` (V3, V4). */
async function factOn(team: Team, key: string, logId: string) {
  const saved = await app.handle(
    apiRequest(
      "PUT",
      `/api/v1/validations/${team.validationId}/answers/${key}`,
      {
        cookie: team.ownerCookie,
        body: { text: "HR officers", lockVersion: 0 },
      },
    ),
  );
  expect(saved.status).toBe(200);
  const answer = validationAnswerSchema.parse(await saved.json());
  const response = await app.handle(
    apiRequest("POST", `/api/v1/validations/${team.validationId}/evidence`, {
      cookie: team.ownerCookie,
      body: {
        target: { type: "validation_answer", id: team.validationId, key },
        researchLogEntryId: logId,
        setFact: true,
        lockVersion: answer.lockVersion,
      },
    }),
  );
  expect(response.status).toBe(201);
}

describe("V6 /api/v1/validations/{validationId}/research-log", () => {
  test("POST records an entry at version 0 with its history row; blank optional texts are null", async () => {
    const team = await newTeam();
    const entry = await record(
      team,
      {
        observedOn: "2026-09-12",
        topic: "Price check: Lacson St.",
        observation: "  ",
        sourceType: "price_check",
        sourceUrl: "https://example.com/menu",
        supportsChecks: ["local_price"],
        supportsNote: "Boxes sell at ₱350–₱500",
      },
      team.memberCookie,
    );
    expect(entry).toMatchObject({
      observedOn: "2026-09-12",
      topic: "Price check: Lacson St.",
      observation: null,
      sourceType: "price_check",
      supportsChecks: ["local_price"],
      createdBy: { id: team.member.id },
      updatedBy: { id: team.member.id },
      lockVersion: 0,
      usedAsEvidenceCount: 0,
      commentCount: 0,
    });
    const [row] = await historyOf(entry.id);
    expect(row).toMatchObject({
      action: "create",
      source: "manual",
      sectionKey: "research_log",
      containerId: team.validationId,
      after: {
        observedOn: "2026-09-12",
        topic: "Price check: Lacson St.",
        observation: null,
        sourceType: "price_check",
        sourceUrl: "https://example.com/menu",
        supportsChecks: ["local_price"],
        supportsNote: "Boxes sell at ₱350–₱500",
      },
    });
  });

  test("POST refuses what 6.0.8 refuses, and a Viewer", async () => {
    const team = await newTeam();
    const post = (body: unknown, cookie = team.ownerCookie) =>
      app.handle(
        apiRequest(
          "POST",
          `/api/v1/validations/${team.validationId}/research-log`,
          { cookie, body },
        ),
      );
    for (const [body, path] of [
      [{ topic: "   " }, "topic"],
      [{ topic: "x".repeat(201) }, "topic"],
      [{ topic: "x", sourceUrl: "ftp://example.com" }, "sourceUrl"],
      [{ topic: "x", observedOn: "2026-02-30" }, "observedOn"],
      [
        { topic: "x", supportsChecks: ["permits", "permits"] },
        "supportsChecks",
      ],
    ] as const) {
      const error = await errorOf(await post(body));
      expect({ path, code: error.code }).toEqual({
        path,
        code: "VALIDATION_FAILED",
      });
      expect(error.details?.[0]?.path).toBe(path);
    }
    expect((await post({ topic: "x" }, team.viewerCookie)).status).toBe(403);
  });

  test("GET lists the newest observation first, undated last, and filters", async () => {
    const team = await newTeam();
    const old = await record(team, {
      observedOn: "2026-08-01",
      topic: "Store visit",
      observation: "Queues at lunch",
      sourceType: "store_observation",
      supportsChecks: ["demand_signal"],
    });
    const undated = await record(team, { topic: "Permit office call" });
    const recent = await record(team, {
      observedOn: "2026-09-20",
      topic: "Price check",
      sourceType: "price_check",
      supportsChecks: ["local_price", "demand_signal"],
    });
    const sameDay = await record(team, {
      observedOn: "2026-09-20",
      topic: "Reviews",
      sourceType: "google_maps_reviews",
    });
    const ids = (page: { items: { id: string }[] }) =>
      page.items.map((item) => item.id);
    expect(ids(await list(team))).toEqual([
      sameDay.id,
      recent.id,
      old.id,
      undated.id,
    ]);
    expect(ids(await list(team, "?supports=demand_signal"))).toEqual([
      recent.id,
      old.id,
    ]);
    expect(ids(await list(team, "?sourceType=price_check"))).toEqual([
      recent.id,
    ]);
    expect(ids(await list(team, "?q=QUEUES"))).toEqual([old.id]);
    expect(ids(await list(team, "?q=permit"))).toEqual([undated.id]);
    expect(ids(await list(team, "?q=%20%20"))).toHaveLength(4);
    const long = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/validations/${team.validationId}/research-log?q=${"x".repeat(201)}`,
        { cookie: team.ownerCookie },
      ),
    );
    expect((await errorOf(long)).details?.[0]?.path).toBe("q");
    const first = await list(team, "?limit=3");
    expect(first.nextCursor).toBe("3");
    const second = await list(team, `?limit=3&cursor=${first.nextCursor}`);
    expect(ids(second)).toEqual([undated.id]);
    expect(second.nextCursor).toBeNull();
    // Deleted entries are left out.
    expect((await remove(team, recent.id)).status).toBe(200);
    expect(ids(await list(team))).toEqual([sameDay.id, old.id, undated.id]);
    const bad = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/validations/${team.validationId}/research-log?supports=menu`,
        { cookie: team.ownerCookie },
      ),
    );
    expect((await errorOf(bad)).details?.[0]?.path).toBe("supports");
  });
});

describe("V7 /api/v1/research-log/{entryId}", () => {
  test("GET lists where the entry is evidence, and which Fact it alone supports", async () => {
    const team = await newTeam();
    const log = await record(team, { topic: "HR survey" });
    const other = await record(team, { topic: "Office interviews" });
    await factOn(team, "V.01.WHO", log.id);
    await factOn(team, "V.01.PROBLEM", log.id);
    // PROBLEM also stands on another entry, so it does not depend on this one alone.
    const problem = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/validations/${team.validationId}/questions/01`,
        {
          cookie: team.ownerCookie,
        },
      ),
    );
    const answers = (await problem.json()) as {
      answers: { questionKey: string; lockVersion: number }[];
    };
    const problemVersion = answers.answers.find(
      (a) => a.questionKey === "V.01.PROBLEM",
    )?.lockVersion;
    const attached = await app.handle(
      apiRequest("POST", `/api/v1/validations/${team.validationId}/evidence`, {
        cookie: team.ownerCookie,
        body: {
          target: {
            type: "validation_answer",
            id: team.validationId,
            key: "V.01.PROBLEM",
          },
          researchLogEntryId: other.id,
          lockVersion: problemVersion,
        },
      }),
    );
    expect(attached.status).toBe(201);
    const [competitor] = await db
      .insert(competitors)
      .values({
        validationId: team.validationId,
        name: "Bongbong's",
        sortOrder: 0,
      })
      .returning();
    if (competitor === undefined) throw new Error("no competitor");
    const cited = await app.handle(
      apiRequest("POST", `/api/v1/validations/${team.validationId}/evidence`, {
        cookie: team.ownerCookie,
        body: {
          target: { type: "competitor", id: competitor.id },
          researchLogEntryId: log.id,
          lockVersion: 0,
        },
      }),
    );
    expect(cited.status).toBe(201);
    const entry = await detail(team, log.id, team.viewerCookie);
    expect(entry.usedAsEvidenceCount).toBe(3);
    expect(entry.hiddenUsageCount).toBe(0);
    expect(entry.usages).toEqual([
      {
        target: {
          type: "validation_answer",
          id: team.validationId,
          key: "V.01.WHO",
        },
        label: "01 WHO",
        link: {
          screen: 11,
          workspaceId: team.workspace.id,
          ideaId: team.idea.id,
          sectionKey: "01",
          questionKey: "V.01.WHO",
        },
        isOnlyEvidenceOfFact: true,
      },
      {
        target: {
          type: "validation_answer",
          id: team.validationId,
          key: "V.01.PROBLEM",
        },
        label: "01 PROBLEM",
        link: {
          screen: 11,
          workspaceId: team.workspace.id,
          ideaId: team.idea.id,
          sectionKey: "01",
          questionKey: "V.01.PROBLEM",
        },
        isOnlyEvidenceOfFact: false,
      },
      {
        target: { type: "competitor", id: competitor.id, key: null },
        label: "Competitors · Bongbong's",
        link: {
          screen: 15,
          workspaceId: team.workspace.id,
          ideaId: team.idea.id,
          rowId: competitor.id,
        },
        isOnlyEvidenceOfFact: false,
      },
    ]);
    // A deleted row no longer uses it.
    await db
      .update(competitors)
      .set({ deletedAt: new Date() })
      .where(eq(competitors.id, competitor.id));
    expect((await detail(team, log.id)).usedAsEvidenceCount).toBe(2);
    expect(
      (await list(team)).items.find((item) => item.id === log.id)
        ?.usedAsEvidenceCount,
    ).toBe(2);
  });

  test("GET lists cost rows, numbers and assumptions, and only counts answers a migration hid", async () => {
    const team = await newTeam();
    const log = await record(team, { topic: "Supplier quote" });
    const evidence = async (target: Record<string, unknown>, extra = {}) => {
      const response = await app.handle(
        apiRequest(
          "POST",
          `/api/v1/validations/${team.validationId}/evidence`,
          {
            cookie: team.ownerCookie,
            body: { target, researchLogEntryId: log.id, ...extra },
          },
        ),
      );
      expect(response.status).toBe(201);
    };
    const [rent] = await db
      .select({ id: costItems.id })
      .from(costItems)
      .where(
        and(
          eq(costItems.validationId, team.validationId),
          eq(costItems.templateKey, "monthly.rent"),
        ),
      );
    if (rent === undefined) throw new Error("no rent row");
    const priced = await app.handle(
      apiRequest("PATCH", `/api/v1/cost-items/${rent.id}`, {
        cookie: team.ownerCookie,
        body: { amount: 12_000, lockVersion: 0 },
      }),
    );
    expect(priced.status).toBe(200);
    await evidence(
      { type: "cost_item", id: rent.id },
      { setFact: true, lockVersion: 1 },
    );
    const price = await app.handle(
      apiRequest(
        "PUT",
        `/api/v1/validations/${team.validationId}/economics/selling_price`,
        { cookie: team.ownerCookie, body: { value: 450, lockVersion: 0 } },
      ),
    );
    expect(price.status).toBe(200);
    const priceRef = {
      type: "economics_input" as const,
      id: team.validationId,
      key: "selling_price",
    };
    await evidence(priceRef, { setFact: true, lockVersion: 1 });
    const added = await app.handle(
      apiRequest(
        "POST",
        `/api/v1/validations/${team.validationId}/assumptions`,
        {
          cookie: team.ownerCookie,
          body: { statement: "Offices order monthly" },
        },
      ),
    );
    expect(added.status).toBe(201);
    const { id: assumptionId } = (await added.json()) as { id: string };
    await evidence(
      { type: "assumption", id: assumptionId },
      { lockVersion: 0 },
    );
    // A Fact on a question the pinned version no longer has, as a migration leaves it.
    await db.insert(validationAnswers).values({
      validationId: team.validationId,
      questionKey: "V.01.RETIRED",
      text: "Old answer",
      fau: "fact",
      lockVersion: 1,
      updatedById: team.owner.id,
    });
    const retired = {
      workspaceId: team.workspace.id,
      validationId: team.validationId,
      targetType: "validation_answer" as const,
      targetId: team.validationId,
      targetKey: "V.01.RETIRED",
      researchLogEntryId: log.id,
      createdById: team.owner.id,
    };
    const [card] = await db
      .insert(competitors)
      .values({
        validationId: team.validationId,
        name: "Detached",
        sortOrder: 0,
      })
      .returning();
    if (card === undefined) throw new Error("no competitor");
    await db.insert(evidenceLinks).values([
      retired,
      // A second link to the same answer counts it once.
      retired,
      // Detached links count nowhere.
      { ...retired, targetKey: "V.01.GONE", deletedAt: new Date() },
      {
        ...retired,
        targetType: "competitor",
        targetId: card.id,
        targetKey: null,
        deletedAt: new Date(),
      },
    ]);
    const place = { workspaceId: team.workspace.id, ideaId: team.idea.id };
    const entry = await detail(team, log.id, team.viewerCookie);
    expect(entry.usages).toEqual([
      {
        target: { type: "cost_item", id: rent.id, key: null },
        label: "Costs · Rent",
        link: { screen: 17, ...place, rowId: rent.id },
        isOnlyEvidenceOfFact: true,
      },
      {
        target: priceRef,
        label: expect.stringMatching(/^Unit Economics · /),
        link: { screen: 18, ...place, field: "selling_price" },
        isOnlyEvidenceOfFact: true,
      },
      {
        target: { type: "assumption", id: assumptionId, key: null },
        label: "Assumptions · Offices order monthly",
        link: { screen: 16, ...place, tab: "assumptions", rowId: assumptionId },
        isOnlyEvidenceOfFact: false,
      },
    ]);
    expect(entry.usedAsEvidenceCount).toBe(3);
    // The hidden answer is not listed, but counted for the deletion's confirmation.
    expect(entry.hiddenUsageCount).toBe(1);
    // Deleting it reports what GET listed.
    const removed = await remove(team, log.id);
    expect(removed.status).toBe(200);
    expect(researchLogDeletionSchema.parse(await removed.json())).toEqual({
      affected: entry.usages,
      hiddenAffectedCount: 1,
    });
  });

  test("PATCH saves under the optimistic lock with a history row; nothing changed writes nothing", async () => {
    const team = await newTeam();
    const entry = await record(team, { topic: "Price check" });
    const response = await edit(
      team,
      entry.id,
      {
        observation: "₱450 a box",
        supportsChecks: ["local_price"],
        lockVersion: 0,
      },
      team.memberCookie,
    );
    expect(response.status).toBe(200);
    const saved = researchLogEntrySchema.parse(await response.json());
    expect(saved).toMatchObject({
      topic: "Price check",
      observation: "₱450 a box",
      supportsChecks: ["local_price"],
      lockVersion: 1,
      updatedBy: { id: team.member.id },
      createdBy: { id: team.owner.id },
    });
    const same = await edit(team, entry.id, {
      observation: "₱450 a box",
      lockVersion: 0,
    });
    expect(researchLogEntrySchema.parse(await same.json()).lockVersion).toBe(1);
    const stale = await edit(team, entry.id, {
      observation: "Mine",
      lockVersion: 0,
    });
    expect(await errorOf(stale)).toMatchObject({
      code: "CONFLICT",
      current: {
        lockVersion: 1,
        value: { topic: "Price check", observation: "₱450 a box" },
        updatedBy: { id: team.member.id },
      },
    });
    const forced = await edit(team, entry.id, {
      observation: "Mine",
      lockVersion: 0,
      force: true,
    });
    expect(researchLogEntrySchema.parse(await forced.json()).lockVersion).toBe(
      2,
    );
    const blank = await edit(team, entry.id, { topic: " ", lockVersion: 2 });
    expect((await errorOf(blank)).details?.[0]?.path).toBe("topic");
    expect((await historyOf(entry.id)).map((row) => row.action)).toEqual([
      "create",
      "update",
      "update",
    ]);
    expect(
      (
        await edit(
          team,
          entry.id,
          { topic: "x", lockVersion: 2 },
          team.viewerCookie,
        )
      ).status,
    ).toBe(403);
  });

  test("DELETE answers the affected items and leaves their Fact without evidence", async () => {
    const team = await newTeam();
    const log = await record(team, { topic: "HR survey" });
    await factOn(team, "V.01.WHO", log.id);
    const response = await remove(team, log.id, team.memberCookie);
    expect(response.status).toBe(200);
    const { affected } = researchLogDeletionSchema.parse(await response.json());
    expect(affected).toMatchObject([
      { label: "01 WHO", isOnlyEvidenceOfFact: true },
    ]);
    const questions = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/validations/${team.validationId}/questions/01`,
        {
          cookie: team.ownerCookie,
        },
      ),
    );
    const who = (
      (await questions.json()) as {
        answers: {
          questionKey: string;
          classification: {
            state: string;
            evidence: { researchLog: { deleted: boolean } | null }[];
          };
        }[];
      }
    ).answers.find((answer) => answer.questionKey === "V.01.WHO");
    expect(who?.classification.state).toBe("fact_no_evidence");
    expect(who?.classification.evidence[0]?.researchLog?.deleted).toBe(true);
    const [row] = await db
      .select()
      .from(researchLogEntries)
      .where(eq(researchLogEntries.id, log.id));
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.lockVersion).toBe(0);
    const history = await historyOf(log.id);
    expect(history.map((h) => [h.action, h.after])).toEqual([
      ["create", expect.anything()],
      ["delete", null],
    ]);
    expect(history[1]?.before).toMatchObject({ topic: "HR survey" });
    // Gone: reading, editing and deleting it again are 404.
    expect((await remove(team, log.id)).status).toBe(404);
    expect(
      (
        await app.handle(
          apiRequest("GET", `/api/v1/research-log/${log.id}`, {
            cookie: team.ownerCookie,
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (await edit(team, log.id, { topic: "x", lockVersion: 0 })).status,
    ).toBe(404);
  });

  test("an archived idea refuses every change with 409 ARCHIVED, and reads stay open", async () => {
    const team = await newTeam();
    const entry = await record(team, { topic: "Price check" });
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    for (const response of [
      await app.handle(
        apiRequest(
          "POST",
          `/api/v1/validations/${team.validationId}/research-log`,
          { cookie: team.viewerCookie, body: { topic: "x" } },
        ),
      ),
      await edit(team, entry.id, { topic: "x", lockVersion: 0 }),
      await remove(team, entry.id),
    ]) {
      expect((await errorOf(response)).code).toBe("ARCHIVED");
    }
    expect((await detail(team, entry.id)).id).toBe(entry.id);
  });

  test("another workspace's member gets 403 NO_ACCESS and a malformed id 404", async () => {
    const team = await newTeam();
    const stranger = await newTeam();
    const entry = await record(team, { topic: "Price check" });
    const response = await app.handle(
      apiRequest("GET", `/api/v1/research-log/${entry.id}`, {
        cookie: stranger.ownerCookie,
      }),
    );
    expect((await errorOf(response)).code).toBe("NO_ACCESS");
    expect(
      (
        await app.handle(
          apiRequest("GET", "/api/v1/research-log/not-a-uuid", {
            cookie: team.ownerCookie,
          }),
        )
      ).status,
    ).toBe(404);
    // Rows of 17 stay out of a research log entry's routes.
    const [cost] = await db
      .select()
      .from(costItems)
      .where(and(eq(costItems.validationId, team.validationId)))
      .limit(1);
    expect(
      (
        await app.handle(
          apiRequest("GET", `/api/v1/research-log/${cost?.id}`, {
            cookie: team.ownerCookie,
          }),
        )
      ).status,
    ).toBe(404);
  });
});
