import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  businessPlans,
  changeHistory,
  connectDatabase,
  costItems,
  ideas,
  importTemplateFile,
  publishTemplateVersion,
  selfAnalyses,
  selfAnalysisAnswers,
  validationAnswers,
  validations,
} from "@moonx/db";
import {
  prepareTestDatabase,
  quoteIdentifier,
  testDatabaseName,
} from "@moonx/db/test-database";
import {
  adminTemplateListSchema,
  errorBodySchema,
  historyBatchRevertResultSchema,
  type TemplateFile,
  templateMigrationPreviewSchema,
  templateMigrationResultSchema,
  validationQuestionsSchema,
} from "@moonx/schemas";
import { SQL } from "bun";
import { and, asc, eq } from "drizzle-orm";
import { buildTestApp, uniqueIp } from "./test-app";
import {
  apiRequest,
  signIn,
  teamWithNewIdea,
  testFixtures,
} from "./test-fixtures";

// T1 and T2 (SDD 5.12, design-spec 6.0.7), and H3 undoing a migration. A database of its
// own: the tests publish newer template versions, which every idea, plan and
// self-analysis made after them would pin.

const base = process.env.DATABASE_URL_TEST;
if (base === undefined || base === "") {
  throw new Error("DATABASE_URL_TEST is required for make test-api");
}
const scratch = new URL(base);
scratch.pathname = `/${testDatabaseName(base)}_migrations_test`;
const url = scratch.toString();
const database = connectDatabase(url);
const { db } = database;
const { app } = buildTestApp(database);
const fixtures = testFixtures(db);

const BCDX = join(import.meta.dir, "../../../data/templates/bcdx");
const bcdxFile = (name: string): TemplateFile =>
  JSON.parse(readFileSync(join(BCDX, name), "utf8"));

type Team = Awaited<ReturnType<typeof teamWithNewIdea>>;

/** Teams whose ideas I1 made on validation v1, before v2 was published: one per test. */
const teams: Team[] = [];
const takeTeam = () => {
  const team = teams.shift();
  if (team === undefined) throw new Error("Make more teams in beforeAll");
  return team;
};

const versions = {
  validationV1: "",
  validationV2: "",
  validationDraft: "",
  planV1: "",
  planV2: "",
  selfAnalysisV1: "",
  selfAnalysisV2: "",
};

const publish = async (kind: TemplateFile["kind"], file: TemplateFile) => {
  const draft = await importTemplateFile(db, kind, file);
  await publishTemplateVersion(db, draft.versionId, null);
  return draft.versionId;
};

beforeAll(async () => {
  await prepareTestDatabase(url);
  versions.validationV1 = (await fixtures.templateVersion("validation")).id;
  for (let i = 0; i < 11; i++) teams.push(await teamWithNewIdea(app, fixtures));

  // v2 asks how to reach the customer, drops BIGGEST_OPPORTUNITY and adds a cost row.
  const validation = bcdxFile("validation.json");
  const [first] = validation.sections;
  const reach = first?.questions[0];
  if (first === undefined || reach === undefined) throw new Error("No 01");
  first.questions.push({
    ...reach,
    key: "V.01.REACH",
    title: "Reach",
    prompt: "How will you reach this customer?",
  });
  const last = validation.sections.at(-1);
  if (last === undefined) throw new Error("No 10");
  last.questions = last.questions.filter(
    (question) => question.key !== "V.10.BIGGEST_OPPORTUNITY",
  );
  validation.costDefaults.push({
    category: "initial",
    key: "initial.signage",
    name: "Signage",
  });
  versions.validationV2 = await publish("validation", validation);
  versions.validationDraft = (
    await importTemplateFile(db, "validation", validation)
  ).versionId;

  versions.planV1 = (await fixtures.templateVersion("business_plan")).id;
  const plan = bcdxFile("plan.json");
  const lastItem = plan.sections.at(-1);
  if (lastItem === undefined) throw new Error("No item 30");
  lastItem.questions = lastItem.questions.slice(0, -1);
  versions.planV2 = await publish("business_plan", plan);

  versions.selfAnalysisV1 = await fixtures.selfAnalysisVersion();
  versions.selfAnalysisV2 = await publish("self_analysis", {
    format: "moonx-template",
    formatVersion: 1,
    kind: "self_analysis",
    name: "Self analysis",
    aiPrompt: "",
    sections: [
      {
        key: "WHY",
        part: null,
        title: "Why",
        subtitle: null,
        guidance: null,
        questions: ["SA.WHY.1", "SA.WHY.3"].map((key) => ({
          key,
          title: key,
          prompt: `${key}?`,
          example: null,
          hint: null,
          answerType: "long_text",
          options: null,
          displayCondition: null,
          hasFau: false,
          copyFrom: null,
          reference: null,
        })),
      },
    ],
    costDefaults: [],
    checkRules: [],
    executionPresets: [],
  });
}, 120_000);

afterAll(async () => {
  await database.close();
  const admin = new URL(base);
  admin.pathname = "/postgres";
  const sql = new SQL(admin.toString());
  try {
    await sql.unsafe(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(testDatabaseName(url))} WITH (FORCE)`,
    );
  } finally {
    await sql.close();
  }
});

const previewOf = (
  targetType: string,
  targetId: string,
  cookie: string | undefined,
) =>
  app.handle(
    apiRequest(
      "GET",
      `/api/v1/template-migrations/preview?targetType=${targetType}&targetId=${targetId}`,
      { cookie },
    ),
  );

const migrate = (
  targetType: string,
  targetId: string,
  toVersionId: string,
  cookie: string | undefined,
) =>
  app.handle(
    apiRequest("POST", "/api/v1/template-migrations", {
      cookie,
      body: { targetType, targetId, toVersionId },
    }),
  );

const undo = (batchId: string, cookie: string) =>
  app.handle(
    apiRequest("POST", `/api/v1/history/batches/${batchId}/revert`, {
      cookie,
    }),
  );

const codeOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error.code;

const answer = (team: Team, key: string, body: Record<string, unknown>) =>
  app.handle(
    apiRequest(
      "PUT",
      `/api/v1/validations/${team.validationId}/answers/${key}`,
      { cookie: team.ownerCookie, body: { lockVersion: 0, ...body } },
    ),
  );

const pinnedValidation = async (team: Team) =>
  (
    await db
      .select({ versionId: validations.templateVersionId })
      .from(validations)
      .where(eq(validations.id, team.validationId))
  )[0]?.versionId;

const costRowsOf = (team: Team, key: string) =>
  db
    .select()
    .from(costItems)
    .where(
      and(
        eq(costItems.validationId, team.validationId),
        eq(costItems.templateKey, key),
      ),
    )
    .orderBy(asc(costItems.createdAt));

describe("T1 GET /api/v1/template-migrations/preview", () => {
  test("shows what moving a validation to the newest version keeps, hides and adds", async () => {
    const team = takeTeam();
    expect(
      (await answer(team, "V.01.WHO", { text: "HR officers" })).status,
    ).toBe(200);
    expect(
      (
        await answer(team, "V.10.BIGGEST_OPPORTUNITY", {
          text: "Corporate gifting season",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await answer(team, "V.10.WHY_FAIL", {
          classification: { fau: "unknown" },
        })
      ).status,
    ).toBe(200);

    const response = await previewOf(
      "validation",
      team.validationId,
      team.memberCookie,
    );
    expect(response.status).toBe(200);
    expect(templateMigrationPreviewSchema.parse(await response.json())).toEqual(
      {
        from: { versionNumber: 1 },
        to: { versionId: versions.validationV2, versionNumber: 2 },
        carried: 2,
        hiddenQuestions: [
          {
            questionKey: "V.10.BIGGEST_OPPORTUNITY",
            title: expect.any(String),
            hasAnswer: true,
          },
        ],
        addedQuestions: 1,
        addedCostRows: ["Signage"],
      },
    );
  });

  test("answers 409 ALREADY_LATEST on the newest version", async () => {
    const team = takeTeam();
    await migrate(
      "validation",
      team.validationId,
      versions.validationV2,
      team.ownerCookie,
    );
    const response = await previewOf(
      "validation",
      team.validationId,
      team.ownerCookie,
    );
    expect(response.status).toBe(409);
    expect(await codeOf(response)).toBe("ALREADY_LATEST");
  });
});

describe("T2 POST /api/v1/template-migrations", () => {
  test("pins the newest version and adds its cost rows, which H3 removes and the next migration adds again", async () => {
    const team = takeTeam();
    await answer(team, "V.10.BIGGEST_OPPORTUNITY", { text: "Gifting season" });

    const response = await migrate(
      "validation",
      team.validationId,
      versions.validationV2,
      team.memberCookie,
    );
    expect(response.status).toBe(200);
    const result = templateMigrationResultSchema.parse(await response.json());
    expect(result.template).toEqual({
      versionId: versions.validationV2,
      versionNumber: 2,
      newerVersion: null,
    });
    expect(await pinnedValidation(team)).toBe(versions.validationV2);
    const [signage] = await costRowsOf(team, "initial.signage");
    // After the ten starting rows of v1's initial costs (0 to 9).
    expect(signage).toMatchObject({
      category: "initial",
      name: "Signage",
      sortOrder: 10,
      deletedAt: null,
    });

    const rows = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.batchId, result.batchId))
      .orderBy(asc(changeHistory.targetType));
    expect(rows).toMatchObject([
      {
        containerType: "validation",
        containerId: team.validationId,
        targetType: "cost_item",
        targetId: signage?.id,
        action: "create",
        before: null,
        source: "template_migration",
        changedById: team.member.id,
      },
      {
        containerType: "validation",
        targetType: "template_version",
        targetId: team.validationId,
        targetKey: "validation",
        action: "update",
        before: { versionId: versions.validationV1, versionNumber: 1 },
        after: { versionId: versions.validationV2, versionNumber: 2 },
        source: "template_migration",
      },
    ]);

    // The dropped question's answer stays, hidden from 11.
    const section = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/validations/${team.validationId}/questions/10`,
        { cookie: team.ownerCookie },
      ),
    );
    const shown = validationQuestionsSchema.parse(await section.json());
    expect(shown.section.questions.map((q) => q.key)).not.toContain(
      "V.10.BIGGEST_OPPORTUNITY",
    );
    const [kept] = await db
      .select()
      .from(validationAnswers)
      .where(
        and(
          eq(validationAnswers.validationId, team.validationId),
          eq(validationAnswers.questionKey, "V.10.BIGGEST_OPPORTUNITY"),
        ),
      );
    expect(kept?.text).toBe("Gifting season");

    const again = await migrate(
      "validation",
      team.validationId,
      versions.validationV2,
      team.ownerCookie,
    );
    expect(again.status).toBe(409);
    expect(await codeOf(again)).toBe("ALREADY_LATEST");

    const undone = await undo(result.batchId, team.ownerCookie);
    expect(undone.status).toBe(200);
    expect(
      historyBatchRevertResultSchema.parse(await undone.json()).reverted,
    ).toBe(2);
    expect(await pinnedValidation(team)).toBe(versions.validationV1);
    expect((await costRowsOf(team, "initial.signage"))[0]?.deletedAt).not.toBe(
      null,
    );

    const preview = await previewOf(
      "validation",
      team.validationId,
      team.ownerCookie,
    );
    expect(
      templateMigrationPreviewSchema.parse(await preview.json()).addedCostRows,
    ).toEqual(["Signage"]);
    const redo = await migrate(
      "validation",
      team.validationId,
      versions.validationV2,
      team.ownerCookie,
    );
    expect(redo.status).toBe(200);
    const signs = await costRowsOf(team, "initial.signage");
    expect(signs).toHaveLength(2);
    expect(signs[0]?.deletedAt).not.toBe(null);
    // After the deleted one too.
    expect(signs[1]).toMatchObject({
      name: "Signage",
      sortOrder: 11,
      deletedAt: null,
    });
  });

  test("does not bring back a starting cost row the person deleted", async () => {
    const team = takeTeam();
    const [equipment] = await costRowsOf(team, "initial.equipment");
    if (equipment === undefined) throw new Error("No equipment row");
    const deleted = await app.handle(
      apiRequest("DELETE", `/api/v1/cost-items/${equipment.id}`, {
        cookie: team.ownerCookie,
      }),
    );
    expect(deleted.status).toBe(204);

    const preview = await previewOf(
      "validation",
      team.validationId,
      team.ownerCookie,
    );
    expect(
      templateMigrationPreviewSchema.parse(await preview.json()).addedCostRows,
    ).toEqual(["Signage"]);
    expect(
      (
        await migrate(
          "validation",
          team.validationId,
          versions.validationV2,
          team.ownerCookie,
        )
      ).status,
    ).toBe(200);
    const equipmentRows = await costRowsOf(team, "initial.equipment");
    expect(equipmentRows).toHaveLength(1);
    expect(equipmentRows[0]?.deletedAt).not.toBe(null);
  });

  test("refuses a version that is not a newer published one of the same template", async () => {
    const team = takeTeam();
    for (const toVersionId of [
      versions.validationV1,
      versions.validationDraft,
      versions.planV2,
      crypto.randomUUID(),
    ]) {
      const response = await migrate(
        "validation",
        team.validationId,
        toVersionId,
        team.ownerCookie,
      );
      expect(response.status).toBe(422);
      const body = errorBodySchema.parse(await response.json());
      expect(body.error).toMatchObject({
        code: "VALIDATION_FAILED",
        details: [{ path: "toVersionId" }],
      });
    }
    expect(await pinnedValidation(team)).toBe(versions.validationV1);
  });

  test("refuses archived ideas, Viewers and what does not exist", async () => {
    const team = takeTeam();
    const viewer = await migrate(
      "validation",
      team.validationId,
      versions.validationV2,
      team.viewerCookie,
    );
    expect(viewer.status).toBe(403);
    const missing = await migrate(
      "validation",
      crypto.randomUUID(),
      versions.validationV2,
      team.ownerCookie,
    );
    expect(missing.status).toBe(404);
    const archived = await app.handle(
      apiRequest("POST", `/api/v1/ideas/${team.idea.id}/archive`, {
        cookie: team.ownerCookie,
      }),
    );
    expect(archived.status).toBe(200);
    const refused = await migrate(
      "validation",
      team.validationId,
      versions.validationV2,
      team.ownerCookie,
    );
    expect(refused.status).toBe(409);
    expect(await codeOf(refused)).toBe("ARCHIVED");
    expect(await pinnedValidation(team)).toBe(versions.validationV1);
    // Reading writes nothing, so an archived idea still shows what M8 would do.
    expect(
      (await previewOf("validation", team.validationId, team.ownerCookie))
        .status,
    ).toBe(200);
  });

  test("moves a plan under its own history, and H3 moves it back", async () => {
    const team = takeTeam();
    const plan = await fixtures.createPlan(team.idea.id, team.owner.id);
    const preview = await previewOf(
      "business_plan",
      plan.id,
      team.memberCookie,
    );
    expect(preview.status).toBe(200);
    expect(
      templateMigrationPreviewSchema.parse(await preview.json()),
    ).toMatchObject({
      from: { versionNumber: 1 },
      to: { versionId: versions.planV2, versionNumber: 2 },
      carried: 0,
      hiddenQuestions: [{ hasAnswer: false }],
      addedQuestions: 0,
      addedCostRows: [],
    });

    const response = await migrate(
      "business_plan",
      plan.id,
      versions.planV2,
      team.memberCookie,
    );
    expect(response.status).toBe(200);
    const { batchId } = templateMigrationResultSchema.parse(
      await response.json(),
    );
    const pinned = async () =>
      (
        await db
          .select({ versionId: businessPlans.templateVersionId })
          .from(businessPlans)
          .where(eq(businessPlans.id, plan.id))
      )[0]?.versionId;
    expect(await pinned()).toBe(versions.planV2);
    expect(
      await db
        .select({
          containerType: changeHistory.containerType,
          targetKey: changeHistory.targetKey,
        })
        .from(changeHistory)
        .where(eq(changeHistory.batchId, batchId)),
    ).toEqual([{ containerType: "business_plan", targetKey: "business_plan" }]);

    expect((await undo(batchId, team.ownerCookie)).status).toBe(200);
    expect(await pinned()).toBe(versions.planV1);
  });

  test("moves a self-analysis for its owner only, which starts once a hidden answer shows", async () => {
    const team = takeTeam();
    const analysis = await fixtures.createSelfAnalysis(team.owner.id);
    // An answer to a question v1 lacks, as one an earlier migration hid.
    await db.insert(selfAnalysisAnswers).values({
      selfAnalysisId: analysis.id,
      questionKey: "SA.WHY.3",
      text: "To work near my family",
      lockVersion: 1,
    });

    const stranger = await previewOf(
      "self_analysis",
      analysis.id,
      team.memberCookie,
    );
    expect(stranger.status).toBe(403);
    expect(
      (await previewOf("self_analysis", crypto.randomUUID(), team.ownerCookie))
        .status,
    ).toBe(404);
    const preview = await previewOf(
      "self_analysis",
      analysis.id,
      team.ownerCookie,
    );
    expect(templateMigrationPreviewSchema.parse(await preview.json())).toEqual({
      from: { versionNumber: 1 },
      to: { versionId: versions.selfAnalysisV2, versionNumber: 2 },
      carried: 0,
      hiddenQuestions: [
        { questionKey: "SA.WHY.2", title: "SA.WHY.2", hasAnswer: false },
        {
          questionKey: "SA.INCOME.1",
          title: "SA.INCOME.1",
          hasAnswer: false,
        },
      ],
      addedQuestions: 1,
      addedCostRows: [],
    });

    expect(
      (
        await migrate(
          "self_analysis",
          analysis.id,
          versions.selfAnalysisV2,
          team.memberCookie,
        )
      ).status,
    ).toBe(403);
    const response = await migrate(
      "self_analysis",
      analysis.id,
      versions.selfAnalysisV2,
      team.ownerCookie,
    );
    expect(response.status).toBe(200);
    const { batchId } = templateMigrationResultSchema.parse(
      await response.json(),
    );
    const stored = async () =>
      (
        await db
          .select()
          .from(selfAnalyses)
          .where(eq(selfAnalyses.id, analysis.id))
      )[0];
    expect(await stored()).toMatchObject({
      templateVersionId: versions.selfAnalysisV2,
      status: "in_progress",
    });
    expect(
      await db
        .select({
          ownerUserId: changeHistory.ownerUserId,
          workspaceId: changeHistory.workspaceId,
        })
        .from(changeHistory)
        .where(eq(changeHistory.batchId, batchId)),
    ).toEqual([{ ownerUserId: team.owner.id, workspaceId: null }]);

    expect((await undo(batchId, team.ownerCookie)).status).toBe(200);
    // Back on v1, it stays in progress: a self-analysis never goes back to not started.
    expect(await stored()).toMatchObject({
      templateVersionId: versions.selfAnalysisV1,
      status: "in_progress",
    });
  });

  test("answers 401 without a session, before reading the body", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/v1/template-migrations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": uniqueIp(),
        },
        body: JSON.stringify({ targetType: "nope" }),
      }),
    );
    expect(response.status).toBe(401);
    // A signed-in caller gets the body checked.
    const team = teams[0] as Team;
    const cookie = await signIn(app, team.owner.email, uniqueIp());
    const invalid = await app.handle(
      apiRequest("POST", "/api/v1/template-migrations", {
        cookie,
        body: { targetType: "nope", targetId: "x", toVersionId: "y" },
      }),
    );
    expect(invalid.status).toBe(422);
  });
});

describe("AD1 GET /api/v1/admin/templates", () => {
  test("counts what pins each version, leaving out ideas and plans whose creation was undone", async () => {
    const admin = await fixtures.createUser({ isAdmin: true });
    const cookie = await signIn(app, admin.email, uniqueIp());
    const usage = async (kind: string, versionId: string) => {
      const response = await app.handle(
        apiRequest("GET", "/api/v1/admin/templates", { cookie }),
      );
      const list = adminTemplateListSchema.parse(await response.json());
      return list.items
        .find((item) => item.kind === kind)
        ?.versions.find((version) => version.id === versionId)?.usageCount;
    };
    const team = await fixtures.createTeam();
    const before = {
      validation: await usage("validation", versions.validationV1),
      plan: await usage("business_plan", versions.planV1),
    };
    const { idea } = await fixtures.createIdea(
      team.workspace.id,
      team.owner.id,
    );
    const plan = await fixtures.createPlan(idea.id, team.owner.id);
    expect(await usage("validation", versions.validationV1)).toBe(
      (before.validation ?? 0) + 1,
    );
    expect(await usage("business_plan", versions.planV1)).toBe(
      (before.plan ?? 0) + 1,
    );
    await db
      .update(businessPlans)
      .set({ deletedAt: new Date() })
      .where(eq(businessPlans.id, plan.id));
    expect(await usage("business_plan", versions.planV1)).toBe(before.plan);
    await db
      .update(ideas)
      .set({ deletedAt: new Date() })
      .where(eq(ideas.id, idea.id));
    expect(await usage("validation", versions.validationV1)).toBe(
      before.validation,
    );
  });
});

// Last: it publishes the validation draft, after which v2 is no longer the newest.
// The validation draft published as v3, once whichever test asks first.
let v3: Promise<void> | undefined;
const publishV3 = () => {
  v3 ??= publishTemplateVersion(db, versions.validationDraft, null).then(
    () => {},
  );
  return v3;
};

describe("T2 after a migration was undone and redone", () => {
  test("does not add a row again the person deleted after a migration added it back", async () => {
    const team = takeTeam();
    const first = templateMigrationResultSchema.parse(
      await (
        await migrate(
          "validation",
          team.validationId,
          versions.validationV2,
          team.ownerCookie,
        )
      ).json(),
    );
    expect((await undo(first.batchId, team.ownerCookie)).status).toBe(200);
    expect(
      (
        await migrate(
          "validation",
          team.validationId,
          versions.validationV2,
          team.ownerCookie,
        )
      ).status,
    ).toBe(200);
    const readded = (await costRowsOf(team, "initial.signage")).find(
      (row) => row.deletedAt === null,
    );
    if (readded === undefined) throw new Error("No signage row");
    expect(
      (
        await app.handle(
          apiRequest("DELETE", `/api/v1/cost-items/${readded.id}`, {
            cookie: team.ownerCookie,
          }),
        )
      ).status,
    ).toBe(204);

    await publishV3();
    const preview = templateMigrationPreviewSchema.parse(
      await (
        await previewOf("validation", team.validationId, team.ownerCookie)
      ).json(),
    );
    expect(preview).toMatchObject({
      to: { versionId: versions.validationDraft, versionNumber: 3 },
      addedCostRows: [],
    });
    expect(
      (
        await migrate(
          "validation",
          team.validationId,
          versions.validationDraft,
          team.ownerCookie,
        )
      ).status,
    ).toBe(200);
    const rows = await costRowsOf(team, "initial.signage");
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.deletedAt !== null)).toBe(true);
  });

  test("moves to a newer published version that is not the newest", async () => {
    await publishV3();
    const team = takeTeam();
    const response = await migrate(
      "validation",
      team.validationId,
      versions.validationV2,
      team.ownerCookie,
    );
    expect(response.status).toBe(200);
    expect(
      templateMigrationResultSchema.parse(await response.json()).template,
    ).toEqual({
      versionId: versions.validationV2,
      versionNumber: 2,
      newerVersion: { versionId: versions.validationDraft, versionNumber: 3 },
    });
  });
});
