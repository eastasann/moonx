import { afterAll, describe, expect, test } from "bun:test";
import {
  changeHistory,
  comments,
  competitors,
  costItems,
  decisionLogEntries,
  economicsInputs,
  evidenceLinks,
  ideas,
  importTemplateFile,
  planVersions,
  publishTemplateVersion,
  researchLogEntries,
  templateVersions,
  validationAnswers,
} from "@moonx/db";
import {
  errorBodySchema,
  evidenceRemovalSchema,
  evidenceResultSchema,
  ideaDetailSchema,
  validationAnswerSchema,
  validationHomeSchema,
  validationQuestionsSchema,
} from "@moonx/schemas";
import { and, asc, eq } from "drizzle-orm";
import { templateRef } from "./idea-views";
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

/** A team, signed in, with an idea made through I1 so it has its cost rows. */
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
  return {
    ...team,
    ownerCookie,
    memberCookie,
    viewerCookie,
    idea,
    validationId: idea.validationId,
  };
}

type Team = Awaited<ReturnType<typeof teamWithIdea>>;

const home = async (team: Team, cookie = team.ownerCookie) => {
  const response = await app.handle(
    apiRequest("GET", `/api/v1/ideas/${team.idea.id}/validation`, { cookie }),
  );
  expect(response.status).toBe(200);
  return validationHomeSchema.parse(await response.json());
};

const saveAnswer = (
  team: Team,
  key: string,
  body: Record<string, unknown>,
  cookie = team.ownerCookie,
) =>
  app.handle(
    apiRequest(
      "PUT",
      `/api/v1/validations/${team.validationId}/answers/${key}`,
      { cookie, body },
    ),
  );

const saved = async (response: Response) => {
  expect(response.status).toBe(200);
  return validationAnswerSchema.parse(await response.json());
};

const historyOf = (team: Team, targetKey: string) =>
  db
    .select()
    .from(changeHistory)
    .where(
      and(
        eq(changeHistory.containerId, team.validationId),
        eq(changeHistory.targetKey, targetKey),
      ),
    )
    .orderBy(asc(changeHistory.changedAt), asc(changeHistory.id));

const addEvidence = (
  team: Team,
  body: Record<string, unknown>,
  cookie = team.ownerCookie,
) =>
  app.handle(
    apiRequest("POST", `/api/v1/validations/${team.validationId}/evidence`, {
      cookie,
      body,
    }),
  );

const answerTarget = (team: Team, key: string) => ({
  type: "validation_answer",
  id: team.validationId,
  key,
});

describe("V1 GET /api/v1/ideas/{ideaId}/validation", () => {
  test("a new idea: everything Empty, all checks not started, and Start with 01 first", async () => {
    const team = await teamWithIdea();
    const view = await home(team);
    expect(view.validationId).toBe(team.validationId);
    expect(view.idea.id).toBe(team.idea.id);
    expect(view.template).toMatchObject({ versionNumber: 1 });
    expect(view.summary).toEqual({
      customer: null,
      problem: null,
      solution: null,
      marketType: null,
    });
    for (const metric of Object.values(view.keyMetrics))
      expect(metric.reason).toBe("empty");
    expect(view.checks.map((check) => check.state)).toEqual(
      Array(6).fill("not_started"),
    );
    expect(view.nextSteps[0]).toMatchObject({
      kind: "start_customer_problem",
      sectionKey: "01",
      link: {
        screen: 11,
        sectionKey: "01",
        ideaId: team.idea.id,
        workspaceId: team.workspace.id,
      },
    });
    expect(view.sections.map((section) => section.title)).toEqual([
      "01 Customer & Problem",
      "02 Market",
      "03 Research Log",
      "04 Competitors",
      "05 Costs",
      "06–08 Unit Economics",
      "09 Assumptions & Risks",
      "10 Final Assessment",
    ]);
    expect(view.sections.find((s) => s.key === "05")).toMatchObject({
      answered: 0,
      total: 24,
    });
    expect(view.decisions).toEqual([]);
    expect(view.plans).toEqual([]);
    expect(view.archivedPlanCount).toBe(0);
    expect(view.canAddPlan).toBe(false);
  });

  test("links into writing are null for a Viewer and on an archived idea", async () => {
    const team = await teamWithIdea();
    const demand = (view: { checks: { key: string; link: unknown }[] }) =>
      view.checks.find((check) => check.key === "demand_signal")?.link;
    expect(demand(await home(team, team.memberCookie))).toMatchObject({
      screen: 14,
      newEntry: true,
    });
    expect(demand(await home(team, team.viewerCookie))).toBeNull();
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    const archived = await home(team, team.memberCookie);
    expect(demand(archived)).toBeNull();
    expect(archived.idea.archived).toBe(true);
  });

  test("quotes the summary answers, lists decisions newest first and the plans not archived", async () => {
    const team = await teamWithIdea();
    for (const [key, text] of [
      ["V.01.WHO", "HR officers"],
      ["V.01.PROBLEM", "Gifts look improvised"],
      ["V.02.OCEAN", "Mixed"],
    ] as const) {
      await saved(await saveAnswer(team, key, { text, lockVersion: 0 }));
    }
    await app.handle(
      apiRequest("PATCH", `/api/v1/ideas/${team.idea.id}`, {
        cookie: team.ownerCookie,
        body: { proposedSolution: "Same-day boxes", lockVersion: 0 },
      }),
    );
    const at = (day: number) => new Date(Date.UTC(2026, 8, day));
    for (const [day, value] of [
      [1, "hold"],
      [2, "proceed"],
    ] as const) {
      await db.insert(decisionLogEntries).values({
        workspaceId: team.workspace.id,
        ideaId: team.idea.id,
        kind: "validation_decision",
        value,
        reason: `Reason ${day} ${"x".repeat(300)}`,
        snapshot: {},
        recordedById: team.owner.id,
        recordedAt: at(day),
      });
    }
    await db
      .update(ideas)
      .set({ latestDecision: "proceed" })
      .where(eq(ideas.id, team.idea.id));
    const planA = await fixtures.createPlan(team.idea.id, team.owner.id, {
      name: "Plan A",
    });
    await fixtures.createPlan(team.idea.id, team.owner.id, {
      name: "Plan B",
      archivedAt: new Date(),
    });
    const [version] = await db
      .insert(planVersions)
      .values({
        businessPlanId: planA.id,
        versionNumber: 1,
        name: "v1 For advisors",
        snapshot: {},
        savedById: team.owner.id,
        savedAt: new Date(planA.updatedAt.getTime() - 1000),
      })
      .returning();

    const view = await home(team, team.viewerCookie);
    expect(view.summary).toEqual({
      customer: "HR officers",
      problem: "Gifts look improvised",
      solution: "Same-day boxes",
      marketType: "Mixed",
    });
    expect(view.decisions.map((d) => d.value)).toEqual(["proceed", "hold"]);
    expect(view.decisions[0]?.reasonExcerpt).toHaveLength(200);
    expect(view.decisions[0]?.reasonExcerpt?.endsWith("…")).toBe(true);
    expect(view.plans).toMatchObject([
      {
        id: planA.id,
        name: "Plan A",
        archived: false,
        latestVersion: { id: version?.id, name: "v1 For advisors" },
        hasChangesSinceVersion: true,
        latestGoNoGo: null,
      },
    ]);
    expect(view.archivedPlanCount).toBe(1);
    expect(view.canAddPlan).toBe(true);
    expect(view.idea.stage).toBe("planning");
  });

  test("names a newer published version of the template", async () => {
    // The self-analysis template, so the validation version I1 picks stays the same.
    const v1 = await fixtures.templateVersion("self_analysis");
    expect((await templateRef(db, v1.id)).newerVersion).toBeNull();
    const file = {
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
          questions: [
            {
              key: "SA.WHY.1",
              title: "Why",
              prompt: "Why do you want this?",
              example: null,
              hint: null,
              answerType: "long_text",
              options: null,
              displayCondition: null,
              hasFau: false,
              copyFrom: null,
              reference: null,
            },
          ],
        },
      ],
      costDefaults: [],
      checkRules: [],
      executionPresets: [],
    };
    const imported = await importTemplateFile(db, "self_analysis", file);
    try {
      await publishTemplateVersion(db, imported.versionId, null);
      expect(await templateRef(db, v1.id)).toEqual({
        versionId: v1.id,
        versionNumber: 1,
        newerVersion: {
          versionId: imported.versionId,
          versionNumber: imported.versionNumber,
        },
      });
    } finally {
      // Other tests make self-analyses on the latest version: leave v1 the latest.
      await db
        .delete(templateVersions)
        .where(eq(templateVersions.id, imported.versionId));
    }
  });
});

describe("V2 GET /api/v1/validations/{validationId}/questions/{sectionKey}", () => {
  test("answers every question of 02, hiding the ones OCEAN does not show", async () => {
    const team = await teamWithIdea();
    await saved(
      await saveAnswer(team, "V.02.OCEAN", { text: "Red", lockVersion: 0 }),
    );
    await db.insert(comments).values({
      workspaceId: team.workspace.id,
      containerType: "validation",
      containerId: team.validationId,
      sectionKey: "02",
      targetType: "validation_answer",
      targetId: team.validationId,
      targetKey: "V.02.OCEAN",
      authorId: team.member.id,
      body: "Why red?",
    });
    const response = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/validations/${team.validationId}/questions/02`,
        { cookie: team.viewerCookie },
      ),
    );
    expect(response.status).toBe(200);
    const { section, answers } = validationQuestionsSchema.parse(
      await response.json(),
    );
    expect(section.title).toBe("Market");
    expect(answers.map((a) => a.questionKey)).toEqual(
      section.questions.map((q) => q.key),
    );
    const byKey = new Map(answers.map((a) => [a.questionKey, a]));
    expect(byKey.get("V.02.OCEAN")).toMatchObject({
      text: "Red",
      lockVersion: 1,
      hidden: false,
      commentCount: 1,
      classification: { fau: null, state: "unclassified", evidence: [] },
      updatedBy: { id: team.owner.id },
    });
    expect(byKey.get("V.02.RED_1")?.hidden).toBe(false);
    expect(byKey.get("V.02.BLUE_1")?.hidden).toBe(true);
    expect(byKey.get("V.02.WHY")).toMatchObject({
      text: null,
      lockVersion: 0,
      updatedAt: null,
      updatedBy: null,
      classification: { state: "empty" },
    });
  });

  test("answers 404 for a section without questions or not in the version", async () => {
    const team = await teamWithIdea();
    for (const key of ["03", "04", "08", "99"]) {
      const response = await app.handle(
        apiRequest(
          "GET",
          `/api/v1/validations/${team.validationId}/questions/${key}`,
          { cookie: team.ownerCookie },
        ),
      );
      expect({ key, status: response.status }).toEqual({ key, status: 404 });
    }
  });
});

describe("V3 PUT /api/v1/validations/{validationId}/answers/{questionKey}", () => {
  test("creates the answer at version 1, then saves under the optimistic lock with a history row each", async () => {
    const team = await teamWithIdea();
    const first = await saved(
      await saveAnswer(team, "V.01.WHO", {
        text: "HR officers",
        lockVersion: 0,
      }),
    );
    expect(first).toMatchObject({
      text: "HR officers",
      lockVersion: 1,
      classification: { state: "unclassified" },
    });
    const second = await saved(
      await saveAnswer(
        team,
        "V.01.WHO",
        {
          classification: { fau: "assumption", confidence: "medium" },
          lockVersion: 1,
        },
        team.memberCookie,
      ),
    );
    expect(second).toMatchObject({
      text: "HR officers",
      lockVersion: 2,
      classification: { fau: "assumption", confidence: "medium" },
      updatedBy: { id: team.member.id },
    });
    // Changing the text keeps F/A/U (design-spec 6.2).
    const third = await saved(
      await saveAnswer(team, "V.01.WHO", {
        text: "HR and admin officers",
        lockVersion: 2,
      }),
    );
    expect(third.classification.fau).toBe("assumption");

    const stale = await saveAnswer(team, "V.01.WHO", {
      text: "Mine",
      lockVersion: 2,
    });
    expect(stale.status).toBe(409);
    expect((await errorOf(stale)).current).toMatchObject({
      value: {
        text: "HR and admin officers",
        fau: "assumption",
        confidence: "medium",
        evidenceIds: [],
      },
      lockVersion: 3,
    });
    const forced = await saved(
      await saveAnswer(team, "V.01.WHO", {
        text: "Mine",
        lockVersion: 2,
        force: true,
      }),
    );
    expect(forced.lockVersion).toBe(4);
    // Nothing changes: no version, no history.
    await saved(
      await saveAnswer(team, "V.01.WHO", { text: "Mine", lockVersion: 1 }),
    );

    const history = await historyOf(team, "V.01.WHO");
    expect(history.map((row) => [row.action, row.after])).toEqual([
      [
        "create",
        { text: "HR officers", fau: null, confidence: null, evidenceIds: [] },
      ],
      [
        "update",
        {
          text: "HR officers",
          fau: "assumption",
          confidence: "medium",
          evidenceIds: [],
        },
      ],
      [
        "update",
        {
          text: "HR and admin officers",
          fau: "assumption",
          confidence: "medium",
          evidenceIds: [],
        },
      ],
      [
        "update",
        {
          text: "Mine",
          fau: "assumption",
          confidence: "medium",
          evidenceIds: [],
        },
      ],
    ]);
    expect(history.every((row) => row.sectionKey === "01")).toBe(true);
    expect(history[1]?.before).toEqual(history[0]?.after);
  });

  test("clearing the text clears F/A/U except Unknown", async () => {
    const team = await teamWithIdea();
    await saved(
      await saveAnswer(team, "V.01.WHO", {
        text: "HR officers",
        classification: { fau: "assumption", confidence: "low" },
        lockVersion: 0,
      }),
    );
    const cleared = await saved(
      await saveAnswer(team, "V.01.WHO", { text: "  ", lockVersion: 1 }),
    );
    expect(cleared).toMatchObject({
      text: null,
      classification: { fau: null, confidence: null, state: "empty" },
    });
    const unknown = await saved(
      await saveAnswer(team, "V.01.PROBLEM", {
        text: "We do not know yet",
        classification: { fau: "unknown" },
        lockVersion: 0,
      }),
    );
    const kept = await saved(
      await saveAnswer(team, "V.01.PROBLEM", {
        text: null,
        lockVersion: unknown.lockVersion,
      }),
    );
    expect(kept.classification).toMatchObject({
      fau: "unknown",
      state: "unknown",
    });
  });

  test("refuses what the rules of 6.0.3 and 6.0.8 refuse", async () => {
    const team = await teamWithIdea();
    const cases: [string, Record<string, unknown>, string, string?][] = [
      [
        "V.01.WHO",
        { text: "x", classification: { fau: "fact" }, lockVersion: 0 },
        "FACT_REQUIRES_EVIDENCE",
      ],
      [
        "V.01.WHO",
        { text: "x", classification: { fau: "assumption" }, lockVersion: 0 },
        "CONFIDENCE_REQUIRED",
      ],
      [
        "V.01.WHO",
        {
          text: "x",
          classification: { fau: "unknown", confidence: "low" },
          lockVersion: 0,
        },
        "VALIDATION_FAILED",
        "classification.confidence",
      ],
      [
        "V.01.WHO",
        {
          classification: { fau: "assumption", confidence: "low" },
          lockVersion: 0,
        },
        "VALIDATION_FAILED",
        "classification.fau",
      ],
      ["V.02.OCEAN", { text: "Purple", lockVersion: 0 }, "INVALID_CHOICE"],
      [
        "V.02.CATEGORY",
        { text: "x".repeat(201), lockVersion: 0 },
        "VALIDATION_FAILED",
        "text",
      ],
      [
        "V.01.WHO",
        { text: "x".repeat(20_001), lockVersion: 0 },
        "VALIDATION_FAILED",
        "text",
      ],
      ["V.01.NOPE", { text: "x", lockVersion: 0 }, "QUESTION_NOT_FOUND"],
      ["V.03.WHO", { text: "x", lockVersion: 0 }, "QUESTION_NOT_FOUND"],
    ];
    for (const [key, body, code, path] of cases) {
      const response = await saveAnswer(team, key, body);
      const error = await errorOf(response);
      expect({
        key,
        code: error.code as string,
        path: error.details?.[0]?.path,
      }).toEqual({ key, code, path });
    }
    // Nothing was saved.
    expect(
      await db
        .select()
        .from(validationAnswers)
        .where(eq(validationAnswers.validationId, team.validationId)),
    ).toEqual([]);
  });

  test("a save that never saw the first one gets 409 CONFLICT even with force", async () => {
    const team = await teamWithIdea();
    await saved(
      await saveAnswer(team, "V.01.WHO", {
        text: "Mine first",
        lockVersion: 0,
      }),
    );
    for (const force of [false, true]) {
      const response = await saveAnswer(
        team,
        "V.01.WHO",
        { text: "Mine", lockVersion: 0, force },
        team.memberCookie,
      );
      const error = await errorOf(response);
      expect(error).toMatchObject({
        code: "CONFLICT",
        current: { lockVersion: 1, value: { text: "Mine first" } },
      });
    }
    const evidence = await addEvidence(team, {
      target: answerTarget(team, "V.01.WHO"),
      url: "https://example.com",
      lockVersion: 0,
      force: true,
    });
    expect((await errorOf(evidence)).code).toBe("CONFLICT");
  });

  test("records the client the save came from", async () => {
    const team = await teamWithIdea();
    const request = apiRequest(
      "PUT",
      `/api/v1/validations/${team.validationId}/answers/V.01.WHO`,
      { cookie: team.ownerCookie, body: { text: "HR", lockVersion: 0 } },
    );
    request.headers.set("x-moonx-client", "web_mobile");
    await saved(await app.handle(request));
    const [row] = await historyOf(team, "V.01.WHO");
    expect(row?.client).toBe("web_mobile");
  });

  test("an archived idea refuses with 409 ARCHIVED", async () => {
    const team = await teamWithIdea();
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    const response = await saveAnswer(team, "V.01.WHO", {
      text: "x",
      lockVersion: 0,
    });
    expect((await errorOf(response)).code).toBe("ARCHIVED");
  });
});

describe("V4 POST /api/v1/validations/{validationId}/evidence", () => {
  test("a new research log with setFact makes the answer a Fact, with both history rows", async () => {
    const team = await teamWithIdea();
    await saved(
      await saveAnswer(team, "V.01.WHO", { text: "HR", lockVersion: 0 }),
    );
    const response = await addEvidence(team, {
      target: answerTarget(team, "V.01.WHO"),
      newResearchLog: {
        topic: "Called five offices",
        observedOn: "2026-09-12",
        supportsChecks: ["demand_signal"],
      },
      setFact: true,
      lockVersion: 1,
    });
    expect(response.status).toBe(201);
    const result = evidenceResultSchema.parse(await response.json());
    expect(result).toMatchObject({
      evidence: {
        kind: "research_log",
        researchLog: {
          topic: "Called five offices",
          observedOn: "2026-09-12",
          deleted: false,
        },
        url: null,
      },
      classification: { fau: "fact", state: "fact" },
      lockVersion: 2,
    });
    const history = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.containerId, team.validationId))
      .orderBy(asc(changeHistory.targetType));
    const log = history.find((row) => row.targetType === "research_log_entry");
    expect(log).toMatchObject({
      action: "create",
      sectionKey: "research_log",
    });
    const answer = history.filter(
      (row) => row.targetKey === "V.01.WHO" && row.action === "update",
    );
    expect(answer.map((row) => [row.before, row.after])).toEqual([
      [
        { text: "HR", fau: null, confidence: null, evidenceIds: [] },
        {
          text: "HR",
          fau: "fact",
          confidence: null,
          evidenceIds: [result.evidence.id],
        },
      ],
    ]);
  });

  test("attaches an existing log or a URL, once, without changing F/A/U", async () => {
    const team = await teamWithIdea();
    await saved(
      await saveAnswer(team, "V.01.WHO", {
        text: "HR",
        classification: { fau: "assumption", confidence: "high" },
        lockVersion: 0,
      }),
    );
    const [log, deleted] = await db
      .insert(researchLogEntries)
      .values([
        {
          validationId: team.validationId,
          topic: "Visit",
          createdById: team.owner.id,
        },
        {
          validationId: team.validationId,
          topic: "Gone",
          createdById: team.owner.id,
          deletedAt: new Date(),
        },
      ])
      .returning();
    const byLog = evidenceResultSchema.parse(
      await (
        await addEvidence(team, {
          target: answerTarget(team, "V.01.WHO"),
          researchLogEntryId: log?.id,
          lockVersion: 1,
        })
      ).json(),
    );
    expect(byLog.classification).toMatchObject({
      fau: "assumption",
      confidence: "high",
      state: "assumption",
    });
    const byUrl = evidenceResultSchema.parse(
      await (
        await addEvidence(team, {
          target: answerTarget(team, "V.01.WHO"),
          url: "https://example.com/report",
          note: "Annual report",
          lockVersion: 2,
        })
      ).json(),
    );
    expect(byUrl.evidence).toMatchObject({
      kind: "url",
      url: "https://example.com/report",
      note: "Annual report",
      researchLog: null,
    });
    expect(byUrl.classification.evidence).toHaveLength(2);

    for (const [body, path] of [
      [{ researchLogEntryId: log?.id, lockVersion: 3 }, "researchLogEntryId"],
      [
        { researchLogEntryId: deleted?.id, lockVersion: 3 },
        "researchLogEntryId",
      ],
      [
        { researchLogEntryId: crypto.randomUUID(), lockVersion: 3 },
        "researchLogEntryId",
      ],
      [{ url: "ftp://example.com", lockVersion: 3 }, "url"],
      [
        {
          url: "https://example.com",
          researchLogEntryId: log?.id,
          lockVersion: 3,
        },
        "researchLogEntryId",
      ],
      [{ lockVersion: 3 }, "researchLogEntryId"],
    ] as const) {
      const response = await addEvidence(team, {
        target: answerTarget(team, "V.01.WHO"),
        ...body,
      });
      const error = await errorOf(response);
      expect([error.code, error.details?.[0]?.path]).toEqual([
        "VALIDATION_FAILED",
        path,
      ]);
    }
  });

  test("setFact needs an item with a value and F/A/U", async () => {
    const team = await teamWithIdea();
    const [competitor] = await db
      .insert(competitors)
      .values({ validationId: team.validationId, name: "Rival", sortOrder: 0 })
      .returning();
    for (const [target, lockVersion] of [
      [answerTarget(team, "V.01.PROOF"), 0],
      [{ type: "competitor", id: competitor?.id }, 0],
    ] as const) {
      const response = await addEvidence(team, {
        target,
        url: "https://example.com",
        setFact: true,
        lockVersion,
      });
      const error = await errorOf(response);
      expect([error.code, error.details?.[0]?.path]).toEqual([
        "VALIDATION_FAILED",
        "setFact",
      ]);
    }
  });

  test("evidence on an unsaved answer or number saves it at version 1", async () => {
    const team = await teamWithIdea();
    const answer = evidenceResultSchema.parse(
      await (
        await addEvidence(team, {
          target: answerTarget(team, "V.01.PROOF"),
          url: "https://example.com/a",
          lockVersion: 0,
        })
      ).json(),
    );
    expect(answer).toMatchObject({
      lockVersion: 1,
      classification: { state: "empty" },
    });
    const number = await addEvidence(team, {
      target: {
        type: "economics_input",
        id: team.validationId,
        key: "selling_price",
      },
      url: "https://example.com/b",
      lockVersion: 0,
    });
    expect(evidenceResultSchema.parse(await number.json()).lockVersion).toBe(1);
    const [row] = await db
      .select()
      .from(economicsInputs)
      .where(eq(economicsInputs.validationId, team.validationId));
    expect(row).toMatchObject({ fieldKey: "selling_price", value: null });
    const [created] = await historyOf(team, "selling_price");
    expect(created).toMatchObject({
      action: "create",
      sectionKey: "economics",
    });
  });

  test("rows: a cost row becomes a Fact; a competitor takes evidence without F/A/U; both raise their version", async () => {
    const team = await teamWithIdea();
    const [permits] = await db
      .update(costItems)
      .set({ amount: 8500, lockVersion: 1 })
      .where(
        and(
          eq(costItems.validationId, team.validationId),
          eq(costItems.templateKey, "initial.permits"),
        ),
      )
      .returning();
    const cost = evidenceResultSchema.parse(
      await (
        await addEvidence(team, {
          target: { type: "cost_item", id: permits?.id },
          url: "https://example.com/fees",
          setFact: true,
          lockVersion: 1,
        })
      ).json(),
    );
    expect(cost).toMatchObject({
      lockVersion: 2,
      classification: { fau: "fact", state: "fact" },
    });
    const [competitor] = await db
      .insert(competitors)
      .values({ validationId: team.validationId, name: "Rival", sortOrder: 0 })
      .returning();
    const rival = evidenceResultSchema.parse(
      await (
        await addEvidence(team, {
          target: { type: "competitor", id: competitor?.id },
          url: "https://example.com/rival",
          lockVersion: 0,
        })
      ).json(),
    );
    expect(rival).toMatchObject({
      lockVersion: 1,
      classification: { fau: null, state: "unclassified" },
    });
    const [history] = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.targetId, competitor?.id ?? ""));
    expect(history).toMatchObject({
      action: "update",
      sectionKey: "competitors",
      after: { name: "Rival", evidenceIds: [rival.evidence.id] },
    });
  });

  test("a stale version is 409 CONFLICT unless forced; another validation's item is 404", async () => {
    const team = await teamWithIdea();
    await saved(
      await saveAnswer(team, "V.01.WHO", { text: "HR", lockVersion: 0 }),
    );
    await saved(
      await saveAnswer(team, "V.01.WHO", {
        text: "HR officers",
        lockVersion: 1,
      }),
    );
    const stale = await addEvidence(team, {
      target: answerTarget(team, "V.01.WHO"),
      url: "https://example.com",
      lockVersion: 1,
    });
    expect((await errorOf(stale)).code).toBe("CONFLICT");
    const forced = await addEvidence(team, {
      target: answerTarget(team, "V.01.WHO"),
      url: "https://example.com",
      lockVersion: 1,
      force: true,
    });
    expect(forced.status).toBe(201);

    const other = await teamWithIdea();
    const [foreign] = await db
      .select()
      .from(costItems)
      .where(eq(costItems.validationId, other.validationId))
      .limit(1);
    for (const target of [
      { type: "cost_item", id: foreign?.id },
      answerTarget(other, "V.01.WHO"),
    ]) {
      const response = await addEvidence(team, {
        target,
        url: "https://example.com",
        lockVersion: 0,
      });
      expect(response.status).toBe(404);
    }
  });
});

describe("V5 DELETE /api/v1/evidence/{evidenceId}", () => {
  /** WHO as a Fact on a research log and a URL. */
  async function factWithTwo() {
    const team = await teamWithIdea();
    await saved(
      await saveAnswer(team, "V.01.WHO", { text: "HR", lockVersion: 0 }),
    );
    const first = evidenceResultSchema.parse(
      await (
        await addEvidence(team, {
          target: answerTarget(team, "V.01.WHO"),
          newResearchLog: { topic: "Calls" },
          setFact: true,
          lockVersion: 1,
        })
      ).json(),
    );
    const second = evidenceResultSchema.parse(
      await (
        await addEvidence(team, {
          target: answerTarget(team, "V.01.WHO"),
          url: "https://example.com",
          lockVersion: 2,
        })
      ).json(),
    );
    return { team, first, second };
  }

  const remove = (
    team: Team,
    evidenceId: string,
    query: string,
    cookie = team.ownerCookie,
  ) =>
    app.handle(
      apiRequest("DELETE", `/api/v1/evidence/${evidenceId}${query}`, {
        cookie,
      }),
    );

  test("removing one of two keeps the Fact; removing the last makes it Unclassified", async () => {
    const { team, first, second } = await factWithTwo();
    const one = evidenceRemovalSchema.parse(
      await (await remove(team, second.evidence.id, "?lockVersion=3")).json(),
    );
    expect(one).toMatchObject({
      lockVersion: 4,
      classification: { fau: "fact", state: "fact" },
    });
    expect(one.classification.evidence.map((e) => e.id)).toEqual([
      first.evidence.id,
    ]);
    const last = evidenceRemovalSchema.parse(
      await (await remove(team, first.evidence.id, "?lockVersion=4")).json(),
    );
    expect(last).toMatchObject({
      lockVersion: 5,
      classification: { fau: null, state: "unclassified", evidence: [] },
    });
    const [link] = await db
      .select()
      .from(evidenceLinks)
      .where(eq(evidenceLinks.id, first.evidence.id));
    expect(link?.deletedAt).not.toBeNull();
    const rows = (await historyOf(team, "V.01.WHO")).slice(-2);
    expect(rows.map((row) => [row.before, row.after])).toEqual([
      [
        {
          text: "HR",
          fau: "fact",
          confidence: null,
          evidenceIds: [first.evidence.id, second.evidence.id],
        },
        {
          text: "HR",
          fau: "fact",
          confidence: null,
          evidenceIds: [first.evidence.id],
        },
      ],
      [
        {
          text: "HR",
          fau: "fact",
          confidence: null,
          evidenceIds: [first.evidence.id],
        },
        { text: "HR", fau: null, confidence: null, evidenceIds: [] },
      ],
    ]);
    const again = await remove(team, first.evidence.id, "?lockVersion=5");
    expect(again.status).toBe(404);
  });

  test("evidence citing a deleted log does not count: removing the other makes it Unclassified", async () => {
    const { team, first, second } = await factWithTwo();
    await db
      .update(researchLogEntries)
      .set({ deletedAt: new Date() })
      .where(eq(researchLogEntries.id, first.evidence.researchLog?.id ?? ""));
    const result = evidenceRemovalSchema.parse(
      await (await remove(team, second.evidence.id, "?lockVersion=3")).json(),
    );
    expect(result.classification).toMatchObject({
      fau: null,
      state: "unclassified",
    });
    expect(result.classification.evidence).toMatchObject([
      { id: first.evidence.id, researchLog: { deleted: true } },
    ]);
  });

  test("removing the link to a deleted log from a Fact with no evidence makes it Unclassified", async () => {
    const { team, first, second } = await factWithTwo();
    await remove(team, second.evidence.id, "?lockVersion=3");
    await db
      .update(researchLogEntries)
      .set({ deletedAt: new Date() })
      .where(eq(researchLogEntries.id, first.evidence.researchLog?.id ?? ""));
    const result = evidenceRemovalSchema.parse(
      await (await remove(team, first.evidence.id, "?lockVersion=4")).json(),
    );
    expect(result.classification).toMatchObject({
      fau: null,
      state: "unclassified",
      evidence: [],
    });
  });

  test("removes evidence from an answer whose question the pinned version no longer has", async () => {
    const team = await teamWithIdea();
    await db.insert(validationAnswers).values({
      validationId: team.validationId,
      questionKey: "V.01.RETIRED",
      text: "Kept, hidden",
      lockVersion: 1,
    });
    const [link] = await db
      .insert(evidenceLinks)
      .values({
        workspaceId: team.workspace.id,
        validationId: team.validationId,
        targetType: "validation_answer",
        targetId: team.validationId,
        targetKey: "V.01.RETIRED",
        url: "https://example.com",
        createdById: team.owner.id,
      })
      .returning();
    const response = await remove(team, link?.id ?? "", "?lockVersion=1");
    expect(response.status).toBe(200);
    expect(evidenceRemovalSchema.parse(await response.json()).lockVersion).toBe(
      2,
    );
  });

  test("an archived idea refuses attaching and removing with 409 ARCHIVED", async () => {
    const { team, second } = await factWithTwo();
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    const removing = await remove(team, second.evidence.id, "?lockVersion=3");
    expect((await errorOf(removing)).code).toBe("ARCHIVED");
    const attaching = await addEvidence(team, {
      target: answerTarget(team, "V.01.WHO"),
      url: "https://example.com/other",
      lockVersion: 3,
    });
    expect((await errorOf(attaching)).code).toBe("ARCHIVED");
  });

  test("checks the item's version, needs it, and lets a Viewer do nothing", async () => {
    const { team, second } = await factWithTwo();
    const stale = await remove(team, second.evidence.id, "?lockVersion=1");
    expect((await errorOf(stale)).code).toBe("CONFLICT");
    const missing = await remove(team, second.evidence.id, "");
    expect((await errorOf(missing)).details?.[0]?.path).toBe("lockVersion");
    const viewer = await remove(
      team,
      second.evidence.id,
      "?lockVersion=3",
      team.viewerCookie,
    );
    expect(viewer.status).toBe(403);
    const forced = await remove(
      team,
      second.evidence.id,
      "?lockVersion=1&force=true",
    );
    expect(forced.status).toBe(200);
  });
});
