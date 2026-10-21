import { afterAll, describe, expect, test } from "bun:test";
import {
  assumptions,
  changeHistory,
  comments,
  competitors,
  costItems,
  ideas,
  researchLogEntries,
  risks,
  templateCheckRules,
  templateVersions,
  validations,
  workspaces,
} from "@moonx/db";
import {
  assumptionListSchema,
  assumptionSchema,
  competitorListSchema,
  competitorSchema,
  errorBodySchema,
  riskListSchema,
  riskSchema,
  validationHomeSchema,
} from "@moonx/schemas";
import { and, asc, eq, isNull } from "drizzle-orm";
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

const call = (
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  cookie: string,
  body?: unknown,
) => app.handle(apiRequest(method, path, { cookie, body }));

const competitorList = async (team: Team, cookie = team.viewerCookie) => {
  const response = await call(
    "GET",
    `/api/v1/validations/${team.validationId}/competitors`,
    cookie,
  );
  expect(response.status).toBe(200);
  return competitorListSchema.parse(await response.json());
};

const addCompetitor = async (team: Team, body: Record<string, unknown>) => {
  const response = await call(
    "POST",
    `/api/v1/validations/${team.validationId}/competitors`,
    team.ownerCookie,
    body,
  );
  expect(response.status).toBe(201);
  return competitorSchema.parse(await response.json());
};

const addAssumption = async (team: Team, body: Record<string, unknown>) => {
  const response = await call(
    "POST",
    `/api/v1/validations/${team.validationId}/assumptions`,
    team.memberCookie,
    body,
  );
  expect(response.status).toBe(201);
  return assumptionSchema.parse(await response.json());
};

const addRisk = async (team: Team, body: Record<string, unknown>) => {
  const response = await call(
    "POST",
    `/api/v1/validations/${team.validationId}/risks`,
    team.ownerCookie,
    body,
  );
  expect(response.status).toBe(201);
  return riskSchema.parse(await response.json());
};

const riskList = async (team: Team) =>
  riskListSchema.parse(
    await (
      await call(
        "GET",
        `/api/v1/validations/${team.validationId}/risks`,
        team.viewerCookie,
      )
    ).json(),
  );

const order = (team: Team, list: string, body: unknown) =>
  call(
    "PUT",
    `/api/v1/validations/${team.validationId}/${list}/order`,
    team.ownerCookie,
    body,
  );

const historyOf = (id: string) =>
  db
    .select()
    .from(changeHistory)
    .where(eq(changeHistory.targetId, id))
    .orderBy(asc(changeHistory.changedAt), asc(changeHistory.id));

describe("V8 and V9 competitors", () => {
  test("GET gives the patterns questions of the pinned version, the 3–5 guide and the cards in order", async () => {
    const team = await newTeam();
    const empty = await competitorList(team);
    expect(empty.items).toEqual([]);
    expect(empty.guidance).toEqual({ min: 3, max: 5 });
    expect(
      empty.patterns.map(({ question, answer }) => [
        question.key,
        answer.questionKey,
        answer.lockVersion,
        answer.hidden,
      ]),
    ).toEqual([
      ["V.04.SURVIVOR_PATTERNS", "V.04.SURVIVOR_PATTERNS", 0, false],
      ["V.04.FAILURE_PATTERNS", "V.04.FAILURE_PATTERNS", 0, false],
    ]);
    const first = await addCompetitor(team, {
      name: "Bongbong's",
      type: "direct",
      typicalPrice: 380,
      priceNote: "per box",
      strength: "  ",
    });
    expect(first).toMatchObject({
      name: "Bongbong's",
      type: "direct",
      typicalPrice: 380,
      priceNote: "per box",
      strength: null,
      sortOrder: 0,
      lockVersion: 0,
      evidence: [],
      commentCount: 0,
      unresolvedThreadCount: 0,
      updatedBy: { id: team.owner.id },
    });
    const second = await addCompetitor(team, { name: "Home bakers" });
    expect(second.sortOrder).toBe(1);
    expect((await competitorList(team)).items.map((c) => c.id)).toEqual([
      first.id,
      second.id,
    ]);
    const [created] = await historyOf(first.id);
    expect(created).toMatchObject({
      action: "create",
      sectionKey: "competitors",
      after: {
        name: "Bongbong's",
        type: "direct",
        typicalPrice: 380,
        priceNote: "per box",
        strength: null,
        evidenceIds: [],
      },
    });
    // 13 counts them for check 1.
    const home = validationHomeSchema.parse(
      await (
        await call(
          "GET",
          `/api/v1/ideas/${team.idea.id}/validation`,
          team.ownerCookie,
        )
      ).json(),
    );
    expect(home.checks[0]).toMatchObject({ key: "competitors", count: 2 });
  });

  test("a card counts its threads not resolved, as C1 does (design-spec 6.10)", async () => {
    const team = await newTeam();
    const card = await addCompetitor(team, { name: "Bongbong's" });
    const thread = (extra: Partial<typeof comments.$inferInsert> = {}) => ({
      workspaceId: team.workspace.id,
      containerType: "validation" as const,
      containerId: team.validationId,
      sectionKey: "competitors",
      targetType: "competitor" as const,
      targetId: card.id,
      authorId: team.owner.id,
      body: "Is this price current?",
      ...extra,
    });
    const [open] = await db.insert(comments).values(thread()).returning();
    if (open === undefined) throw new Error("no comment");
    await db.insert(comments).values([
      // A reply is part of its thread, not a thread of its own.
      thread({ parentId: open.id, body: "Checked last week." }),
      thread({ resolvedAt: new Date(), resolvedById: team.owner.id }),
      // Deleted, but not resolved: still open, as C1's unresolvedCount has it.
      thread({ deletedAt: new Date() }),
    ]);
    const [listed] = (await competitorList(team)).items;
    expect(listed).toMatchObject({
      id: card.id,
      unresolvedThreadCount: 2,
      commentCount: 3,
    });
  });

  test("GET leaves out the patterns questions the pinned version lacks", async () => {
    const team = await newTeam();
    const [pinned] = await db
      .select({
        versionId: validations.templateVersionId,
        templateId: templateVersions.templateId,
      })
      .from(validations)
      .innerJoin(
        templateVersions,
        eq(templateVersions.id, validations.templateVersionId),
      )
      .where(eq(validations.id, team.validationId));
    if (pinned === undefined) throw new Error("no pinned version");
    // A version with the check thresholds every validation template has, and no
    // questions, pinned for this request only.
    const [bare] = await db
      .insert(templateVersions)
      .values({
        templateId: pinned.templateId,
        versionNumber: 1_000 + Math.floor(Math.random() * 1_000_000),
      })
      .returning();
    if (bare === undefined) throw new Error("no version");
    const rules = await db
      .select({
        checkKey: templateCheckRules.checkKey,
        params: templateCheckRules.params,
      })
      .from(templateCheckRules)
      .where(eq(templateCheckRules.templateVersionId, pinned.versionId));
    await db
      .insert(templateCheckRules)
      .values(rules.map((rule) => ({ ...rule, templateVersionId: bare.id })));
    try {
      await db
        .update(validations)
        .set({ templateVersionId: bare.id })
        .where(eq(validations.id, team.validationId));
      const view = await competitorList(team);
      expect(view.patterns).toEqual([]);
      expect(view.guidance).toEqual({ min: 3, max: 5 });
    } finally {
      await db
        .update(validations)
        .set({ templateVersionId: pinned.versionId })
        .where(eq(validations.id, team.validationId));
      await db.delete(templateVersions).where(eq(templateVersions.id, bare.id));
    }
  });

  test("cards leave out evidence citing a deleted research log", async () => {
    const team = await newTeam();
    const card = await addCompetitor(team, { name: "Bongbong's" });
    const logs = await db
      .insert(researchLogEntries)
      .values(
        ["Menu photo", "Reviews"].map((topic) => ({
          validationId: team.validationId,
          topic,
          createdById: team.owner.id,
        })),
      )
      .returning();
    let version = 0;
    for (const log of logs) {
      const response = await call(
        "POST",
        `/api/v1/validations/${team.validationId}/evidence`,
        team.ownerCookie,
        {
          target: { type: "competitor", id: card.id },
          researchLogEntryId: log.id,
          lockVersion: version,
        },
      );
      expect(response.status).toBe(201);
      version += 1;
    }
    expect(
      (
        await call(
          "DELETE",
          `/api/v1/research-log/${logs[0]?.id}`,
          team.ownerCookie,
        )
      ).status,
    ).toBe(200);
    const [shown] = (await competitorList(team)).items;
    expect(shown?.evidence.map((e) => e.researchLog?.topic)).toEqual([
      "Reviews",
    ]);
    expect(shown?.lockVersion).toBe(2);
  });

  test("PATCH saves under the lock, with evidence ids in the history; DELETE hides the card", async () => {
    const team = await newTeam();
    const card = await addCompetitor(team, { name: "Bongbong's" });
    const edit = (body: Record<string, unknown>, cookie = team.memberCookie) =>
      call("PATCH", `/api/v1/competitors/${card.id}`, cookie, body);
    const saved = competitorSchema.parse(
      await (
        await edit({
          typicalPrice: 420.5,
          weakness: "No delivery",
          lockVersion: 0,
        })
      ).json(),
    );
    expect(saved).toMatchObject({
      name: "Bongbong's",
      typicalPrice: 420.5,
      weakness: "No delivery",
      lockVersion: 1,
      updatedBy: { id: team.member.id },
    });
    const unchanged = competitorSchema.parse(
      await (await edit({ typicalPrice: 420.5, lockVersion: 0 })).json(),
    );
    expect(unchanged.lockVersion).toBe(1);
    expect(
      await errorOf(await edit({ name: "Mine", lockVersion: 0 })),
    ).toMatchObject({
      code: "CONFLICT",
      current: {
        lockVersion: 1,
        value: { name: "Bongbong's", typicalPrice: 420.5, evidenceIds: [] },
      },
    });
    for (const [body, path] of [
      [{ name: "", lockVersion: 1 }, "name"],
      [{ typicalPrice: -1, lockVersion: 1 }, "typicalPrice"],
      [{ typicalPrice: 1.234, lockVersion: 1 }, "typicalPrice"],
      [{ type: "rival", lockVersion: 1 }, "type"],
    ] as const) {
      const error = await errorOf(await edit(body));
      expect({ path, code: error.code, at: error.details?.[0]?.path }).toEqual({
        path,
        code: "VALIDATION_FAILED",
        at: path,
      });
    }
    expect(
      (await edit({ name: "x", lockVersion: 1 }, team.viewerCookie)).status,
    ).toBe(403);

    const removed = await call(
      "DELETE",
      `/api/v1/competitors/${card.id}`,
      team.ownerCookie,
    );
    expect(removed.status).toBe(204);
    expect((await competitorList(team)).items).toEqual([]);
    const history = await historyOf(card.id);
    expect(history.map((row) => row.action)).toEqual([
      "create",
      "update",
      "delete",
    ]);
    expect(history[2]).toMatchObject({
      before: { name: "Bongbong's", weakness: "No delivery", evidenceIds: [] },
      after: null,
    });
    expect((await edit({ name: "x", lockVersion: 1 })).status).toBe(404);
    expect(
      (await call("DELETE", `/api/v1/competitors/${card.id}`, team.ownerCookie))
        .status,
    ).toBe(404);
  });
});

describe("V10 and V11 assumptions and risks", () => {
  test("assumptions: added at the end, blank required text refused, blank optional text null", async () => {
    const team = await newTeam();
    const first = await addAssumption(team, {
      statement: "Offices order every month",
      whyBelieve: "HR said so",
      confidence: "medium",
      nextCheck: " ",
    });
    expect(first).toMatchObject({
      statement: "Offices order every month",
      whyBelieve: "HR said so",
      confidence: "medium",
      nextCheck: null,
      evidence: [],
      sortOrder: 0,
      lockVersion: 0,
    });
    const second = await addAssumption(team, {
      statement: "Couriers are reliable",
    });
    expect(second.sortOrder).toBe(1);
    const blank = await call(
      "POST",
      `/api/v1/validations/${team.validationId}/assumptions`,
      team.ownerCookie,
      { statement: "   " },
    );
    expect((await errorOf(blank)).details?.[0]?.path).toBe("statement");
    const edited = await call(
      "PATCH",
      `/api/v1/assumptions/${first.id}`,
      team.ownerCookie,
      { confidence: null, evidenceNote: "Two HR managers", lockVersion: 0 },
    );
    expect(assumptionSchema.parse(await edited.json())).toMatchObject({
      confidence: null,
      evidenceNote: "Two HR managers",
      lockVersion: 1,
    });
    expect(
      (
        await call(
          "DELETE",
          `/api/v1/assumptions/${second.id}`,
          team.ownerCookie,
        )
      ).status,
    ).toBe(204);
    const listed = assumptionListSchema.parse(
      await (
        await call(
          "GET",
          `/api/v1/validations/${team.validationId}/assumptions`,
          team.viewerCookie,
        )
      ).json(),
    );
    expect(listed.items.map((item) => item.id)).toEqual([first.id]);
    expect((await historyOf(first.id)).map((row) => row.after)).toEqual([
      {
        statement: "Offices order every month",
        whyBelieve: "HR said so",
        evidenceNote: null,
        confidence: "medium",
        disproveCondition: null,
        nextCheck: null,
        evidenceIds: [],
      },
      {
        statement: "Offices order every month",
        whyBelieve: "HR said so",
        evidenceNote: "Two HR managers",
        confidence: null,
        disproveCondition: null,
        nextCheck: null,
        evidenceIds: [],
      },
    ]);
  });

  test("risks: the automatic order until put in order by hand, then new ones at the end", async () => {
    const team = await newTeam();
    const low = await addRisk(team, {
      statement: "Rain",
      impact: "low",
      probability: "high",
    });
    const unset = await addRisk(team, { statement: "Unclear" });
    const high = await addRisk(team, {
      statement: "Supplier",
      impact: "high",
      probability: "low",
    });
    const highLikely = await addRisk(team, {
      statement: "Rent",
      impact: "high",
      probability: "medium",
    });
    expect(low.sortOrder).toBeNull();
    const ids = async () => (await riskList(team)).items.map((r) => r.id);
    expect(await ids()).toEqual([highLikely.id, high.id, low.id, unset.id]);
    // Changing Impact moves it in the automatic order.
    expect(
      (
        await call("PATCH", `/api/v1/risks/${unset.id}`, team.ownerCookie, {
          impact: "medium",
          lockVersion: 0,
        })
      ).status,
    ).toBe(200);
    expect(await ids()).toEqual([highLikely.id, high.id, unset.id, low.id]);

    const reordered = [low.id, unset.id, high.id, highLikely.id];
    expect((await order(team, "risks", { ids: reordered })).status).toBe(204);
    expect(await ids()).toEqual(reordered);
    const last = await addRisk(team, { statement: "Theft", impact: "high" });
    expect(last.sortOrder).toBe(4);
    expect(await ids()).toEqual([...reordered, last.id]);
    // Reordering writes no history and keeps versions and update times.
    const [stored] = await db
      .select()
      .from(risks)
      .where(eq(risks.id, unset.id));
    expect(stored).toMatchObject({ lockVersion: 1, sortOrder: 1 });
    expect((await historyOf(low.id)).map((row) => row.action)).toEqual([
      "create",
    ]);
  });

  test("V11 saves under the optimistic lock with a history row each; a deleted row is 404", async () => {
    const team = await newTeam();
    const assumption = await addAssumption(team, {
      statement: "Offices order monthly",
    });
    const risk = await addRisk(team, { statement: "Rain", impact: "low" });
    const cases = [
      {
        id: assumption.id,
        path: `/api/v1/assumptions/${assumption.id}`,
        first: { nextCheck: "Ask HR" },
        second: { nextCheck: "Call HR" },
      },
      {
        id: risk.id,
        path: `/api/v1/risks/${risk.id}`,
        first: { mitigation: "Tents" },
        second: { mitigation: "Indoor stalls" },
      },
    ];
    for (const { id, path, first, second } of cases) {
      const saved = await call("PATCH", path, team.memberCookie, {
        ...first,
        lockVersion: 0,
      });
      expect(saved.status).toBe(200);
      const stale = await call("PATCH", path, team.ownerCookie, {
        ...second,
        lockVersion: 0,
      });
      expect(await errorOf(stale)).toMatchObject({
        code: "CONFLICT",
        current: {
          lockVersion: 1,
          value: first,
          updatedBy: { id: team.member.id },
        },
      });
      const forced = await call("PATCH", path, team.ownerCookie, {
        ...second,
        lockVersion: 0,
        force: true,
      });
      expect(await forced.json()).toMatchObject({ ...second, lockVersion: 2 });
      expect((await call("DELETE", path, team.ownerCookie)).status).toBe(204);
      for (const response of [
        await call("PATCH", path, team.ownerCookie, {
          ...second,
          lockVersion: 2,
        }),
        await call("DELETE", path, team.ownerCookie),
      ]) {
        expect((await errorOf(response)).code).toBe("NOT_FOUND");
      }
      const history = await historyOf(id);
      expect(
        history.map((row) => [row.action, row.sectionKey, row.source]),
      ).toEqual([
        ["create", "assumptions_risks", "manual"],
        ["update", "assumptions_risks", "manual"],
        ["update", "assumptions_risks", "manual"],
        ["delete", "assumptions_risks", "manual"],
      ]);
      expect(history[2]?.before).toMatchObject(first);
      expect(history[2]?.after).toMatchObject(second);
      expect(history[3]).toMatchObject({ before: second, after: null });
    }
  });
});

describe("V17 PUT /api/v1/validations/{validationId}/{list}/order", () => {
  test("competitors and assumptions take the new order", async () => {
    const team = await newTeam();
    const a = await addCompetitor(team, { name: "A" });
    const b = await addCompetitor(team, { name: "B" });
    const c = await addCompetitor(team, { name: "C" });
    expect(
      (await order(team, "competitors", { ids: [c.id, a.id, b.id] })).status,
    ).toBe(204);
    expect((await competitorList(team)).items.map((x) => x.name)).toEqual([
      "C",
      "A",
      "B",
    ]);
    const kept = await db
      .select()
      .from(competitors)
      .where(eq(competitors.id, c.id));
    expect(kept[0]?.lockVersion).toBe(0);
    expect(kept[0]?.updatedAt.toISOString()).toBe(c.updatedAt ?? "");
    // A card added afterwards goes to the end.
    expect((await addCompetitor(team, { name: "D" })).sortOrder).toBe(3);
    const x = await addAssumption(team, { statement: "X" });
    const y = await addAssumption(team, { statement: "Y" });
    expect(
      (await order(team, "assumptions", { ids: [y.id, x.id] })).status,
    ).toBe(204);
    const stored = await db
      .select({ id: assumptions.id })
      .from(assumptions)
      .where(eq(assumptions.validationId, team.validationId))
      .orderBy(asc(assumptions.sortOrder));
    expect(stored.map((row) => row.id)).toEqual([y.id, x.id]);
  });

  test("a changed order moves the last activity; the same order does not", async () => {
    const team = await newTeam();
    const a = await addCompetitor(team, { name: "A" });
    const b = await addCompetitor(team, { name: "B" });
    const past = new Date("2026-01-01T00:00:00.000Z");
    await db
      .update(ideas)
      .set({ lastActivityAt: past })
      .where(eq(ideas.id, team.idea.id));
    await db
      .update(workspaces)
      .set({ lastActiveAt: past })
      .where(eq(workspaces.id, team.workspace.id));
    const activity = async () => {
      const [idea] = await db
        .select({ at: ideas.lastActivityAt })
        .from(ideas)
        .where(eq(ideas.id, team.idea.id));
      const [workspace] = await db
        .select({ at: workspaces.lastActiveAt })
        .from(workspaces)
        .where(eq(workspaces.id, team.workspace.id));
      return { idea: idea?.at, workspace: workspace?.at };
    };
    expect(
      (await order(team, "competitors", { ids: [a.id, b.id] })).status,
    ).toBe(204);
    expect(await activity()).toEqual({ idea: past, workspace: past });
    expect(
      (await order(team, "competitors", { ids: [b.id, a.id] })).status,
    ).toBe(204);
    const moved = await activity();
    expect(moved.idea?.getTime()).toBeGreaterThan(past.getTime());
    expect(moved.workspace).toEqual(moved.idea);
  });

  test("cost rows are ordered table by table", async () => {
    const team = await newTeam();
    const monthly = await db
      .select({ id: costItems.id })
      .from(costItems)
      .where(
        and(
          eq(costItems.validationId, team.validationId),
          eq(costItems.category, "monthly_fixed"),
          isNull(costItems.deletedAt),
        ),
      )
      .orderBy(asc(costItems.sortOrder));
    const reversed = monthly.map((row) => row.id).reverse();
    expect(
      (
        await order(team, "cost-items", {
          ids: reversed,
          category: "monthly_fixed",
        })
      ).status,
    ).toBe(204);
    const after = await db
      .select({ id: costItems.id })
      .from(costItems)
      .where(
        and(
          eq(costItems.validationId, team.validationId),
          eq(costItems.category, "monthly_fixed"),
        ),
      )
      .orderBy(asc(costItems.sortOrder));
    expect(after.map((row) => row.id)).toEqual(reversed);
  });

  test("refuses a list that is not every row once, and a category where it does not belong", async () => {
    const team = await newTeam();
    const a = await addCompetitor(team, { name: "A" });
    const b = await addCompetitor(team, { name: "B" });
    const other = await newTeam();
    const foreign = await addCompetitor(other, { name: "F" });
    for (const [list, body, path] of [
      ["competitors", { ids: [a.id] }, "ids"],
      ["competitors", { ids: [a.id, a.id] }, "ids"],
      ["competitors", { ids: [a.id, b.id, foreign.id] }, "ids"],
      ["competitors", { ids: [a.id, foreign.id] }, "ids"],
      ["competitors", { ids: [a.id, b.id], category: "initial" }, "category"],
      ["cost-items", { ids: [] }, "category"],
      ["cost-items", { ids: [], category: "initial" }, "ids"],
      ["competitors", { ids: ["nope"] }, "ids.0"],
    ] as const) {
      const error = await errorOf(await order(team, list, body));
      expect({
        list,
        body,
        code: error.code,
        path: error.details?.[0]?.path,
      }).toEqual({
        list,
        body,
        code: "VALIDATION_FAILED",
        path,
      });
    }
    // A deleted card is no longer part of the list.
    expect(
      (await call("DELETE", `/api/v1/competitors/${b.id}`, team.ownerCookie))
        .status,
    ).toBe(204);
    expect((await order(team, "competitors", { ids: [a.id] })).status).toBe(
      204,
    );
    expect((await order(team, "places", { ids: [] })).status).toBe(404);
  });

  test("an archived idea refuses adding, editing, deleting and ordering with 409 ARCHIVED", async () => {
    const team = await newTeam();
    const card = await addCompetitor(team, { name: "A" });
    const risk = await addRisk(team, { statement: "Rain" });
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    for (const response of [
      await call(
        "POST",
        `/api/v1/validations/${team.validationId}/competitors`,
        team.viewerCookie,
        { name: "B" },
      ),
      await call("PATCH", `/api/v1/competitors/${card.id}`, team.ownerCookie, {
        name: "B",
        lockVersion: 0,
      }),
      await call("DELETE", `/api/v1/risks/${risk.id}`, team.ownerCookie),
      await order(team, "competitors", { ids: [card.id] }),
    ]) {
      expect((await errorOf(response)).code).toBe("ARCHIVED");
    }
    expect((await competitorList(team)).items).toHaveLength(1);
  });
});
