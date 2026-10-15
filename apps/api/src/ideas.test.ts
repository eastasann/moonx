import { afterAll, describe, expect, test } from "bun:test";
import {
  businessPlans,
  changeHistory,
  competitors,
  costItems,
  decisionLogEntries,
  economicsInputs,
  evidenceLinks,
  ideas,
  researchLogEntries,
  templates,
  templateVersions,
  validationAnswers,
  validations,
  workspaces,
} from "@moonx/db";
import {
  errorBodySchema,
  ideaDetailSchema,
  ideaDuplicateResultSchema,
  ideaPageSchema,
  validationQuestionsSchema,
} from "@moonx/schemas";
import { and, asc, eq } from "drizzle-orm";
import { buildTestApp, connectTestDatabase, uniqueIp } from "./test-app";
import { apiRequest, signIn, testFixtures } from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
const { app } = buildTestApp(database);

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

const cookieOf = (user: { email: string }) =>
  signIn(app, user.email, uniqueIp());

/** A team whose Owner, Member and Viewer are signed in. */
async function signedInTeam() {
  const team = await fixtures.createTeam();
  return {
    ...team,
    ownerCookie: await cookieOf(team.owner),
    memberCookie: await cookieOf(team.member),
    viewerCookie: await cookieOf(team.viewer),
  };
}

const ideaRow = async (id: string) =>
  (await db.select().from(ideas).where(eq(ideas.id, id)))[0];

const historyOf = (containerId: string) =>
  db
    .select()
    .from(changeHistory)
    .where(eq(changeHistory.containerId, containerId))
    .orderBy(asc(changeHistory.changedAt), asc(changeHistory.targetType));

async function createIdea(
  cookie: string,
  workspaceId: string,
  body: Record<string, unknown> = {
    name: "Piaya boxes",
    oneLineConcept: "Gift boxes for offices",
  },
) {
  const response = await app.handle(
    apiRequest("POST", `/api/v1/workspaces/${workspaceId}/ideas`, {
      cookie,
      body,
    }),
  );
  expect(response.status).toBe(201);
  return ideaDetailSchema.parse(await response.json());
}

describe("I1 POST /api/v1/workspaces/{workspaceId}/ideas", () => {
  test("makes the idea, its validation on the latest version and the template's cost rows, Empty", async () => {
    const team = await signedInTeam();
    const version = await fixtures.templateVersion("validation");

    const idea = await createIdea(team.memberCookie, team.workspace.id, {
      name: "Piaya boxes",
      oneLineConcept: "Gift boxes for offices",
      proposedSolution: "   ",
    });

    expect(idea).toMatchObject({
      name: "Piaya boxes",
      oneLineConcept: "Gift boxes for offices",
      proposedSolution: null,
      proposer: { id: team.member.id },
      stage: "validation",
      latestDecision: null,
      archived: false,
      plans: [],
      lockVersion: 0,
      duplicatedFrom: null,
      workspaceId: team.workspace.id,
    });
    expect(idea.checks.map((check) => check.state)).toEqual(
      Array(6).fill("not_started"),
    );
    for (const metric of Object.values(idea.keyMetrics)) {
      expect(metric).toEqual({ value: null, bound: "exact", reason: "empty" });
    }
    const [validation] = await db
      .select()
      .from(validations)
      .where(eq(validations.ideaId, idea.id));
    expect(validation?.templateVersionId).toBe(version.id);
    expect(validation?.id).toBe(idea.validationId);
    const rows = await db
      .select()
      .from(costItems)
      .where(eq(costItems.validationId, idea.validationId))
      .orderBy(asc(costItems.category), asc(costItems.sortOrder));
    expect(rows).toHaveLength(24);
    expect(
      rows.every(
        (row) =>
          row.amount === null && row.fau === null && row.lockVersion === 0,
      ),
    ).toBe(true);
    expect(
      rows
        .filter((row) => row.category === "initial")
        .map((row) => [row.sortOrder, row.templateKey]),
    ).toEqual(
      [
        "initial.equipment",
        "initial.renovation",
        "initial.lease_deposit",
        "initial.permits",
        "initial.inventory",
        "initial.branding",
        "initial.launch_marketing",
        "initial.tech_setup",
        "initial.working_capital",
        "initial.other",
      ].map((key, index) => [index, key]),
    );

    // The idea's creation and each row it starts with, one row apiece (6.0.5).
    const ideaHistory = await historyOf(idea.id);
    expect(ideaHistory).toMatchObject([
      {
        targetType: "idea",
        action: "create",
        source: "manual",
        batchId: null,
        after: {
          name: "Piaya boxes",
          oneLineConcept: "Gift boxes for offices",
          proposedSolution: null,
        },
      },
    ]);
    const costHistory = await historyOf(idea.validationId);
    expect(costHistory).toHaveLength(24);
    expect(
      costHistory.every(
        (row) =>
          row.targetType === "cost_item" &&
          row.action === "create" &&
          row.sectionKey === "costs",
      ),
    ).toBe(true);
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, team.workspace.id));
    expect(workspace?.lastActiveAt?.toISOString()).toBe(idea.createdAt);
  });

  test("refuses a blank name or concept, and a Viewer", async () => {
    const team = await signedInTeam();
    const blank = await app.handle(
      apiRequest("POST", `/api/v1/workspaces/${team.workspace.id}/ideas`, {
        cookie: team.ownerCookie,
        body: { name: "  ", oneLineConcept: "x" },
      }),
    );
    expect(blank.status).toBe(422);
    expect((await errorOf(blank)).details?.[0]?.path).toBe("name");
    const viewer = await app.handle(
      apiRequest("POST", `/api/v1/workspaces/${team.workspace.id}/ideas`, {
        cookie: team.viewerCookie,
        body: { name: "A", oneLineConcept: "B" },
      }),
    );
    expect(viewer.status).toBe(403);
  });

  test("answers 409 TEMPLATE_NOT_PUBLISHED before a validation template is published", async () => {
    const team = await signedInTeam();
    const version = await fixtures.templateVersion("validation");
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.kind, "validation"));
    const published = await db
      .select({ id: templateVersions.id })
      .from(templateVersions)
      .where(
        and(
          eq(templateVersions.templateId, template?.id ?? ""),
          eq(templateVersions.status, "published"),
        ),
      );
    expect(published.map((row) => row.id)).toEqual([version.id]);
    await db
      .update(templateVersions)
      .set({ status: "draft", publishedAt: null })
      .where(eq(templateVersions.id, version.id));
    try {
      const response = await app.handle(
        apiRequest("POST", `/api/v1/workspaces/${team.workspace.id}/ideas`, {
          cookie: team.ownerCookie,
          body: { name: "A", oneLineConcept: "B" },
        }),
      );
      expect(response.status).toBe(409);
      expect((await errorOf(response)).code).toBe("TEMPLATE_NOT_PUBLISHED");
    } finally {
      await db
        .update(templateVersions)
        .set({ status: "published", publishedAt: version.publishedAt })
        .where(eq(templateVersions.id, version.id));
    }
  });
});

describe("I1 GET /api/v1/workspaces/{workspaceId}/ideas", () => {
  /** Ideas made straight in the database, last activity a minute apart. */
  async function listed() {
    const team = await signedInTeam();
    const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 0, minutes));
    const make = (
      name: string,
      minutes: number,
      values: Partial<typeof ideas.$inferInsert> = {},
    ) =>
      fixtures.createIdea(team.workspace.id, team.owner.id, {
        name,
        oneLineConcept: `${name} concept`,
        lastActivityAt: at(minutes),
        createdAt: at(60 - minutes),
        ...values,
      });
    const piaya = await make("Piaya boxes", 5, { latestDecision: "proceed" });
    const bowl = await make("health bowl", 4, {
      latestDecision: "hold",
      proposerId: team.member.id,
    });
    const laundry = await make("Laundry", 3, { latestDecision: "drop" });
    const sari = await make("Sari-sari", 2, { archivedAt: at(2) });
    const bike = await make("Bike repair", 1);
    const undone = await make("Undone copy", 6, { deletedAt: at(7) });
    await fixtures.createPlan(piaya.idea.id, team.owner.id);
    const other = await fixtures.createTeam();
    await fixtures.createIdea(other.workspace.id, other.owner.id, {
      name: "Elsewhere",
    });
    const list = async (query = "") => {
      const response = await app.handle(
        apiRequest(
          "GET",
          `/api/v1/workspaces/${team.workspace.id}/ideas${query}`,
          { cookie: team.viewerCookie },
        ),
      );
      expect(response.status).toBe(200);
      return ideaPageSchema.parse(await response.json());
    };
    const names = (page: { items: { name: string }[] }) =>
      page.items.map((item) => item.name);
    return { team, list, names, piaya, bowl, laundry, sari, bike, undone };
  }

  test("hides Drop and archived ideas by default and counts the hidden Drop ones", async () => {
    const { list, names } = await listed();
    const page = await list();
    expect(names(page)).toEqual(["Piaya boxes", "health bowl", "Bike repair"]);
    expect(page.hiddenDroppedCount).toBe(1);
    expect(page.nextCursor).toBeNull();
    expect(page.items[0]).toMatchObject({
      stage: "planning",
      latestDecision: "proceed",
      plans: [{ latestVersionName: null, latestGoNoGo: null }],
    });
    expect(page.items[0]?.checks.map((check) => check.key)).toEqual([
      "competitors",
      "local_price",
      "costs",
      "break_even",
      "permits",
      "demand_signal",
    ]);
    expect(page.items[0]?.checks[0]?.params).toEqual({ min: 3, max: 5 });
  });

  test("filters by decision, stage, proposer and text, and includes archived ones on request", async () => {
    const { list, names, team } = await listed();
    expect(names(await list("?decision=all"))).toEqual([
      "Piaya boxes",
      "health bowl",
      "Laundry",
      "Bike repair",
    ]);
    expect((await list("?decision=all")).hiddenDroppedCount).toBe(0);
    expect(names(await list("?decision=undecided"))).toEqual(["Bike repair"]);
    expect(names(await list("?decision=drop"))).toEqual(["Laundry"]);
    expect(names(await list("?stage=planning"))).toEqual(["Piaya boxes"]);
    expect(names(await list("?stage=validation"))).toEqual([
      "health bowl",
      "Bike repair",
    ]);
    expect(names(await list(`?proposerId=${team.member.id}`))).toEqual([
      "health bowl",
    ]);
    expect(names(await list("?q=HEALTH"))).toEqual(["health bowl"]);
    expect(names(await list("?q=boxes%20CONCEPT"))).toEqual(["Piaya boxes"]);
    expect(
      names(await list("?includeArchived=true&decision=all&sort=name")),
    ).toEqual([
      "Bike repair",
      "health bowl",
      "Laundry",
      "Piaya boxes",
      "Sari-sari",
    ]);
    expect(
      (await list("?includeArchived=true")).items.find(
        (item) => item.name === "Sari-sari",
      )?.archived,
    ).toBe(true);
  });

  test("sorts by activity, creation or name, and pages with an offset cursor", async () => {
    const { list, names } = await listed();
    expect(names(await list("?sort=created"))).toEqual([
      "Bike repair",
      "health bowl",
      "Piaya boxes",
    ]);
    expect(names(await list("?sort=name"))).toEqual([
      "Bike repair",
      "health bowl",
      "Piaya boxes",
    ]);
    const first = await list("?limit=2");
    expect(names(first)).toEqual(["Piaya boxes", "health bowl"]);
    expect(first.nextCursor).toBe("2");
    const second = await list(`?limit=2&cursor=${first.nextCursor}`);
    expect(names(second)).toEqual(["Bike repair"]);
    expect(second.nextCursor).toBeNull();
  });

  test("refuses an unreadable cursor or limit with 422 on its path", async () => {
    const { team } = await listed();
    for (const [query, path] of [
      ["?cursor=abc", "cursor"],
      ["?cursor=-1", "cursor"],
      ["?cursor=1000001", "cursor"],
      ["?limit=0", "limit"],
      ["?limit=201", "limit"],
      ["?sort=decision", "sort"],
    ] as const) {
      const response = await app.handle(
        apiRequest(
          "GET",
          `/api/v1/workspaces/${team.workspace.id}/ideas${query}`,
          { cookie: team.ownerCookie },
        ),
      );
      expect({ query, status: response.status }).toEqual({
        query,
        status: 422,
      });
      expect((await errorOf(response)).details?.[0]?.path).toBe(path);
    }
  });
});

describe("I2 /api/v1/ideas/{ideaId}", () => {
  test("GET answers the detail; an undone or unknown idea is 404", async () => {
    const team = await signedInTeam();
    const idea = await createIdea(team.ownerCookie, team.workspace.id);
    const response = await app.handle(
      apiRequest("GET", `/api/v1/ideas/${idea.id}`, {
        cookie: team.viewerCookie,
      }),
    );
    expect(response.status).toBe(200);
    expect(ideaDetailSchema.parse(await response.json())).toEqual(idea);
    await db
      .update(ideas)
      .set({ deletedAt: new Date() })
      .where(eq(ideas.id, idea.id));
    for (const id of [idea.id, crypto.randomUUID(), "not-a-uuid"]) {
      const missing = await app.handle(
        apiRequest("GET", `/api/v1/ideas/${id}`, { cookie: team.ownerCookie }),
      );
      expect(missing.status).toBe(404);
    }
  });

  test("PATCH saves the overview under the optimistic lock, with one history row a save", async () => {
    const team = await signedInTeam();
    const idea = await createIdea(team.ownerCookie, team.workspace.id);
    const patch = (cookie: string, body: Record<string, unknown>) =>
      app.handle(
        apiRequest("PATCH", `/api/v1/ideas/${idea.id}`, { cookie, body }),
      );

    const saved = await patch(team.memberCookie, {
      name: "Piaya gift boxes",
      proposedSolution: "Same-day delivery",
      lockVersion: 0,
    });
    expect(saved.status).toBe(200);
    expect(ideaDetailSchema.parse(await saved.json())).toMatchObject({
      name: "Piaya gift boxes",
      proposedSolution: "Same-day delivery",
      lockVersion: 1,
      updatedBy: { id: team.member.id },
    });

    const stale = await patch(team.ownerCookie, {
      oneLineConcept: "Something else",
      lockVersion: 0,
    });
    expect(stale.status).toBe(409);
    const conflict = await errorOf(stale);
    expect(conflict.code).toBe("CONFLICT");
    expect(conflict.current).toMatchObject({
      value: {
        name: "Piaya gift boxes",
        oneLineConcept: "Gift boxes for offices",
        proposedSolution: "Same-day delivery",
      },
      lockVersion: 1,
      updatedBy: { id: team.member.id },
    });

    const forced = await patch(team.ownerCookie, {
      oneLineConcept: "Something else",
      proposedSolution: "",
      lockVersion: 0,
      force: true,
    });
    expect(ideaDetailSchema.parse(await forced.json())).toMatchObject({
      oneLineConcept: "Something else",
      proposedSolution: null,
      lockVersion: 2,
    });

    // Saving what is already there raises no version and writes no history.
    const same = await patch(team.ownerCookie, {
      name: "Piaya gift boxes",
      lockVersion: 0,
    });
    expect(same.status).toBe(200);
    expect((await ideaRow(idea.id))?.lockVersion).toBe(2);

    const history = (await historyOf(idea.id)).filter(
      (row) => row.action === "update",
    );
    expect(history.map((row) => [row.before, row.after])).toEqual([
      [
        {
          name: "Piaya boxes",
          oneLineConcept: "Gift boxes for offices",
          proposedSolution: null,
        },
        {
          name: "Piaya gift boxes",
          oneLineConcept: "Gift boxes for offices",
          proposedSolution: "Same-day delivery",
        },
      ],
      [
        {
          name: "Piaya gift boxes",
          oneLineConcept: "Gift boxes for offices",
          proposedSolution: "Same-day delivery",
        },
        {
          name: "Piaya gift boxes",
          oneLineConcept: "Something else",
          proposedSolution: null,
        },
      ],
    ]);
  });

  test("PATCH on an archived idea is 409 ARCHIVED, a Viewer's included", async () => {
    const team = await signedInTeam();
    const { idea } = await fixtures.createIdea(
      team.workspace.id,
      team.owner.id,
      { archivedAt: new Date() },
    );
    for (const cookie of [team.viewerCookie, team.memberCookie]) {
      const response = await app.handle(
        apiRequest("PATCH", `/api/v1/ideas/${idea.id}`, {
          cookie,
          body: { name: "New", lockVersion: 0 },
        }),
      );
      expect(response.status).toBe(409);
      expect((await errorOf(response)).code).toBe("ARCHIVED");
    }
  });
});

describe("I3 POST /api/v1/ideas/{ideaId}/duplicate", () => {
  /** An idea with an answer, a number, research logs, a competitor and evidence. */
  async function filledIdea() {
    const team = await signedInTeam();
    const idea = await createIdea(team.ownerCookie, team.workspace.id);
    const validationId = idea.validationId;
    const [kept, gone] = await db
      .insert(researchLogEntries)
      .values([
        {
          validationId,
          topic: "Price check",
          supportsChecks: ["local_price"],
          createdById: team.owner.id,
        },
        {
          validationId,
          topic: "Deleted",
          createdById: team.owner.id,
          deletedAt: new Date(),
        },
      ])
      .returning();
    const [competitor] = await db
      .insert(competitors)
      .values({ validationId, name: "Rival", typicalPrice: 400, sortOrder: 0 })
      .returning();
    await db.insert(competitors).values({
      validationId,
      name: "Closed",
      sortOrder: 1,
      deletedAt: new Date(),
    });
    await db.insert(validationAnswers).values({
      validationId,
      questionKey: "V.01.WHO",
      text: "HR officers",
      fau: "fact",
      lockVersion: 3,
    });
    await db.insert(economicsInputs).values({
      validationId,
      fieldKey: "selling_price",
      value: 450,
      fau: "assumption",
      confidence: "high",
      lockVersion: 2,
    });
    const link = (values: Partial<typeof evidenceLinks.$inferInsert>) => ({
      workspaceId: team.workspace.id,
      validationId,
      targetType: "validation_answer" as const,
      targetId: validationId,
      targetKey: "V.01.WHO",
      createdById: team.owner.id,
      ...values,
    });
    await db.insert(evidenceLinks).values([
      link({ researchLogEntryId: kept?.id }),
      link({ researchLogEntryId: gone?.id }),
      link({ url: "https://example.com/report" }),
      link({ url: "https://example.com/detached", deletedAt: new Date() }),
      link({
        targetType: "competitor",
        targetId: competitor?.id,
        targetKey: null,
        url: "https://example.com/rival",
      }),
    ]);
    await db.insert(decisionLogEntries).values({
      workspaceId: team.workspace.id,
      ideaId: idea.id,
      kind: "validation_decision",
      value: "proceed",
      reason: "Go",
      snapshot: {},
      recordedById: team.owner.id,
    });
    await db
      .update(ideas)
      .set({ latestDecision: "proceed" })
      .where(eq(ideas.id, idea.id));
    return { team, idea };
  }

  test("copies the validation's content into a new undecided idea of the caller's, with one duplicate history row an item", async () => {
    const { team, idea } = await filledIdea();
    const response = await app.handle(
      apiRequest("POST", `/api/v1/ideas/${idea.id}/duplicate`, {
        cookie: team.memberCookie,
        body: {},
      }),
    );
    expect(response.status).toBe(201);
    const copy = ideaDuplicateResultSchema.parse(await response.json());
    expect(copy).toMatchObject({
      name: "Piaya boxes (copy)",
      oneLineConcept: "Gift boxes for offices",
      proposer: { id: team.member.id },
      latestDecision: null,
      archived: false,
      duplicatedFrom: { id: idea.id, name: "Piaya boxes" },
    });
    expect(copy.id).not.toBe(idea.id);

    const logs = await db
      .select()
      .from(researchLogEntries)
      .where(eq(researchLogEntries.validationId, copy.validationId));
    expect(logs.map((log) => [log.topic, log.createdById])).toEqual([
      ["Price check", team.member.id],
    ]);
    const rivals = await db
      .select()
      .from(competitors)
      .where(eq(competitors.validationId, copy.validationId));
    expect(rivals.map((row) => [row.name, row.lockVersion])).toEqual([
      ["Rival", 0],
    ]);
    const [answer] = await db
      .select()
      .from(validationAnswers)
      .where(eq(validationAnswers.validationId, copy.validationId));
    expect(answer).toMatchObject({
      questionKey: "V.01.WHO",
      text: "HR officers",
      fau: "fact",
      lockVersion: 1,
    });
    const links = await db
      .select()
      .from(evidenceLinks)
      .where(eq(evidenceLinks.validationId, copy.validationId));
    // The deleted log's and the detached link stay behind; the rest follow their item.
    expect(
      links
        .map((link) => [
          link.targetType,
          link.targetId === copy.validationId ||
            link.targetId === rivals[0]?.id,
          link.researchLogEntryId === null
            ? link.url
            : link.researchLogEntryId === logs[0]?.id,
        ])
        .sort(),
    ).toEqual([
      ["competitor", true, "https://example.com/rival"],
      ["validation_answer", true, "https://example.com/report"],
      ["validation_answer", true, true],
    ]);
    expect(
      await db
        .select()
        .from(decisionLogEntries)
        .where(eq(decisionLogEntries.ideaId, copy.id)),
    ).toEqual([]);

    const rows = [
      ...(await historyOf(copy.id)),
      ...(await historyOf(copy.validationId)),
    ];
    expect(new Set(rows.map((row) => row.batchId))).toEqual(
      new Set([copy.batchId]),
    );
    expect(rows.every((row) => row.source === "duplicate")).toBe(true);
    expect(rows.every((row) => row.action === "create")).toBe(true);
    const counts = Object.fromEntries(
      Object.entries(Object.groupBy(rows, (row) => row.targetType)).map(
        ([type, list]) => [type, list?.length],
      ),
    );
    expect(counts).toEqual({
      idea: 1,
      validation_answer: 1,
      economics_input: 1,
      research_log_entry: 1,
      competitor: 1,
      cost_item: 24,
    });
    const whoRow = rows.find((row) => row.targetType === "validation_answer");
    expect(
      (
        whoRow?.after as { evidenceIds: string[] } | undefined
      )?.evidenceIds.sort(),
    ).toEqual(
      links
        .filter((link) => link.targetType === "validation_answer")
        .map((link) => link.id)
        .sort(),
    );
    // The source is not touched.
    expect((await ideaRow(idea.id))?.latestDecision).toBe("proceed");
  });

  test("keeps the order of rows that lists sort by when they were made", async () => {
    const team = await signedInTeam();
    const idea = await createIdea(team.ownerCookie, team.workspace.id);
    const made = (second: number) =>
      new Date(Date.UTC(2026, 8, 1, 0, 0, second));
    const logs = await db
      .insert(researchLogEntries)
      .values(
        ["First", "Second", "Third"].map((topic, index) => ({
          validationId: idea.validationId,
          topic,
          observedOn: "2026-09-01",
          createdById: team.owner.id,
          createdAt: made(index),
        })),
      )
      .returning();
    await db.insert(validationAnswers).values({
      validationId: idea.validationId,
      questionKey: "V.01.WHO",
      text: "HR",
      fau: "fact",
      lockVersion: 1,
    });
    await db.insert(evidenceLinks).values(
      [...logs].reverse().map((log, index) => ({
        workspaceId: team.workspace.id,
        validationId: idea.validationId,
        targetType: "validation_answer" as const,
        targetId: idea.validationId,
        targetKey: "V.01.WHO",
        researchLogEntryId: log.id,
        createdById: team.owner.id,
        createdAt: made(10 + index),
      })),
    );
    const copy = ideaDuplicateResultSchema.parse(
      await (
        await app.handle(
          apiRequest("POST", `/api/v1/ideas/${idea.id}/duplicate`, {
            cookie: team.ownerCookie,
            body: {},
          }),
        )
      ).json(),
    );
    const copied = await db
      .select()
      .from(researchLogEntries)
      .where(eq(researchLogEntries.validationId, copy.validationId))
      .orderBy(asc(researchLogEntries.createdAt));
    expect(copied.map((log) => log.topic)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    const questions = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/validations/${copy.validationId}/questions/01`,
        { cookie: team.ownerCookie },
      ),
    );
    const who = validationQuestionsSchema
      .parse(await questions.json())
      .answers.find((answer) => answer.questionKey === "V.01.WHO");
    expect(
      who?.classification.evidence.map((item) => item.researchLog?.topic),
    ).toEqual(["Third", "Second", "First"]);
  });

  test("copies an archived idea unarchived, and keeps a long name within 100 characters", async () => {
    const team = await signedInTeam();
    const long = "x".repeat(100);
    const { idea } = await fixtures.createIdea(
      team.workspace.id,
      team.owner.id,
      { name: long, archivedAt: new Date() },
    );
    const response = await app.handle(
      apiRequest("POST", `/api/v1/ideas/${idea.id}/duplicate`, {
        cookie: team.ownerCookie,
        body: {},
      }),
    );
    expect(response.status).toBe(201);
    const copy = ideaDuplicateResultSchema.parse(await response.json());
    expect(copy.name).toBe(`${"x".repeat(93)} (copy)`);
    expect(copy.archived).toBe(false);

    const named = await app.handle(
      apiRequest("POST", `/api/v1/ideas/${idea.id}/duplicate`, {
        cookie: team.ownerCookie,
        body: { name: "Plan B numbers" },
      }),
    );
    expect(ideaDuplicateResultSchema.parse(await named.json()).name).toBe(
      "Plan B numbers",
    );
  });
});

describe("I4 POST /api/v1/ideas/{ideaId}/archive and /restore", () => {
  test("archives and restores without history or a new version, and moves only the last activity", async () => {
    const team = await signedInTeam();
    const idea = await createIdea(team.ownerCookie, team.workspace.id);
    const before = await ideaRow(idea.id);
    const historyBefore = (await historyOf(idea.id)).length;
    const call = (action: "archive" | "restore", cookie = team.memberCookie) =>
      app.handle(
        apiRequest("POST", `/api/v1/ideas/${idea.id}/${action}`, { cookie }),
      );

    const archived = await call("archive");
    expect(archived.status).toBe(200);
    expect(ideaDetailSchema.parse(await archived.json()).archived).toBe(true);
    const row = await ideaRow(idea.id);
    expect(row?.archivedAt).not.toBeNull();
    expect(row?.updatedAt).toEqual(before?.updatedAt as Date);
    expect(row?.lockVersion).toBe(0);
    expect(row?.lastActivityAt.getTime()).toBeGreaterThan(
      before?.lastActivityAt.getTime() ?? 0,
    );

    // Already archived: nothing changes.
    const again = await call("archive");
    expect(again.status).toBe(200);
    expect((await ideaRow(idea.id))?.archivedAt).toEqual(
      row?.archivedAt as Date,
    );

    const viewer = await call("restore", team.viewerCookie);
    expect(viewer.status).toBe(403);
    const restored = await call("restore");
    expect(ideaDetailSchema.parse(await restored.json()).archived).toBe(false);
    expect((await historyOf(idea.id)).length).toBe(historyBefore);
  });

  test("archived ideas leave the default list and their plans stay", async () => {
    const team = await signedInTeam();
    const idea = await createIdea(team.ownerCookie, team.workspace.id);
    const plan = await fixtures.createPlan(idea.id, team.owner.id);
    await app.handle(
      apiRequest("POST", `/api/v1/ideas/${idea.id}/archive`, {
        cookie: team.ownerCookie,
      }),
    );
    const list = await app.handle(
      apiRequest("GET", `/api/v1/workspaces/${team.workspace.id}/ideas`, {
        cookie: team.ownerCookie,
      }),
    );
    expect(ideaPageSchema.parse(await list.json()).items).toEqual([]);
    const [kept] = await db
      .select()
      .from(businessPlans)
      .where(eq(businessPlans.id, plan.id));
    expect(kept?.archivedAt).toBeNull();
  });
});
