import { afterAll, describe, expect, test } from "bun:test";
import {
  changeHistory,
  ideas,
  planAnswers,
  selfAnalyses,
  selfAnalysisAnswers,
  templateQuestions,
  templateSections,
  templates,
  templateVersions,
  validationAnswers,
} from "@moonx/db";
import { matchBlocks, parseAiReply, readImportedAnswer } from "@moonx/domain";
import {
  aiExportSchema,
  type ErrorCode,
  errorBodySchema,
  type ImportChange,
  type ImportContext,
  importApplyResultSchema,
  importContextSchema,
  planHomeSchema,
  selfAnalysisHomeSchema,
} from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { AI_LIMIT } from "./ai";
import { buildTestApp, connectTestDatabase, uniqueIp } from "./test-app";
import {
  apiRequest,
  signIn,
  teamWithNewIdea,
  teamWithProceedIdea,
  testFixtures,
  untilBlockedBy,
} from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
// 10:00 on Oct 1, 2026 in Manila, every user's default time zone.
let clock = Date.UTC(2026, 9, 1, 2, 0);
const { app } = buildTestApp(database, { now: () => clock });

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

const call = (
  method: "GET" | "POST" | "PUT",
  path: string,
  cookie: string,
  body?: unknown,
) => app.handle(apiRequest(method, path, { cookie, body }));

async function exported(cookie: string, query: string) {
  const response = await call("GET", `/api/v1/ai/export?${query}`, cookie);
  expect(response.status).toBe(200);
  return aiExportSchema.parse(await response.json());
}

async function context(cookie: string, query: string) {
  const response = await call(
    "GET",
    `/api/v1/ai/import/context?${query}`,
    cookie,
  );
  expect(response.status).toBe(200);
  return importContextSchema.parse(await response.json());
}

const apply = (
  cookie: string,
  target: { type: string; id?: string },
  changes: ImportChange[],
) => call("POST", "/api/v1/ai/import/apply", cookie, { target, changes });

const saveAnswer = async (
  validationId: string,
  key: string,
  cookie: string,
  body: Record<string, unknown>,
) => {
  const response = await call(
    "PUT",
    `/api/v1/validations/${validationId}/answers/${key}`,
    cookie,
    body,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { lockVersion: number };
};

const answerRow = async (validationId: string, key: string) =>
  (
    await db
      .select()
      .from(validationAnswers)
      .where(
        and(
          eq(validationAnswers.validationId, validationId),
          eq(validationAnswers.questionKey, key),
        ),
      )
  )[0];

const historyOf = (containerId: string) =>
  db
    .select()
    .from(changeHistory)
    .where(eq(changeHistory.containerId, containerId));

const lockVersionOf = (ctx: ImportContext, key: string) =>
  ctx.questions.find((question) => question.questionKey === key)?.current
    .lockVersion ?? -1;

/** A team with an idea whose WHO is an Assumption with a research log and a URL as evidence. */
async function teamWithAnswers() {
  const team = await teamWithNewIdea(app, fixtures);
  const { validationId, memberCookie } = team;
  await saveAnswer(validationId, "V.01.WHO", memberCookie, {
    text: "HR teams of BPO companies in Bacolod that buy gifts for clients",
    classification: { fau: "assumption", confidence: "medium" },
    lockVersion: 0,
  });
  const attach = async (source: Record<string, unknown>, lockVersion: number) =>
    expect(
      (
        await call(
          "POST",
          `/api/v1/validations/${validationId}/evidence`,
          memberCookie,
          {
            target: {
              type: "validation_answer",
              id: validationId,
              key: "V.01.WHO",
            },
            ...source,
            lockVersion,
          },
        )
      ).status,
    ).toBe(201);
  await attach(
    {
      newResearchLog: {
        observedOn: "2026-09-12",
        topic: "Store observation: offices",
        supportsChecks: ["demand_signal"],
      },
    },
    1,
  );
  // Evidence lists in the order attached, so each is attached at its own time.
  clock += 1;
  await attach({ url: "https://example.com/piaya" }, 2);
  return team;
}

describe("X1 GET /api/v1/ai/export", () => {
  test("writes a validation's questions as design-spec 6.6 does", async () => {
    const team = await teamWithAnswers();
    const result = await exported(
      team.memberCookie,
      `source=validation&id=${team.validationId}&sections=01`,
    );
    expect(result.markdown).toStartWith(
      '<!-- moonx-export v1 | kind: validation | scope: 01 | idea: Piaya boxes | exported: 2026-10-01T10:00+08:00 -->\n\n# Questions\n\n## [V.01.WHO] WHO\n\n**Question:** Who is the primary paying customer?\n\n**Current answer:**\n\n> HR teams of BPO companies in Bacolod that buy gifts for clients\n\n**F/A/U:** Assumption (Medium)\n\n**Evidence:** Research log 2026-09-12 "Store observation: offices"; https://example.com/piaya\n\n## [V.01.WHY_THEM]',
    );
    expect(result.questionCount).toBe(10);
    expect(result.allEmpty).toBe(false);
    expect(result.fileBaseName).toBe(
      "moonx-export-validation-Piaya boxes-2026-10-01",
    );
    expect(result.json).toMatchObject({
      format: "moonx-export",
      version: 1,
      exportedAt: "2026-10-01T10:00:00+08:00",
      kind: "validation",
      scope: { ideaName: "Piaya boxes", sections: ["01"] },
      templateVersion: 1,
      currency: "PHP",
    });
    expect(result.json).not.toHaveProperty("prompt");
    expect(result.json.questions[0]?.answer).toEqual({
      text: "HR teams of BPO companies in Bacolod that buy gifts for clients",
      fau: "assumption",
      confidence: "medium",
      evidence: [
        {
          type: "research_log",
          date: "2026-09-12",
          topic: "Store observation: offices",
        },
        { type: "url", url: "https://example.com/piaya", note: null },
      ],
    });
    // The Reference is on by default: the numbers, checks and lists of 13 to 18.
    expect(result.json.reference?.checks).toHaveLength(6);
    expect(result.json.reference?.researchLog).toEqual([
      {
        date: "2026-09-12",
        topic: "Store observation: offices",
        sourceType: null,
        supports: ["Demand or problem signal"],
      },
    ]);
    expect(result.markdown).toContain(
      "# Reference (read-only)\n\n## Key numbers\n\n- Startup cost: Empty",
    );
  });

  test("covers every question section without sections, and leaves out what it is asked to", async () => {
    const team = await teamWithAnswers();
    const whole = await exported(
      team.memberCookie,
      `source=validation&id=${team.validationId}&includeEmpty=false&includeReference=false&includeExamples=false`,
    );
    expect(whole.json.scope).toEqual({
      ideaName: "Piaya boxes",
      sections: null,
    });
    expect(whole.json.questions.map((q) => q.id)).toEqual(["V.01.WHO"]);
    expect(whole.json).not.toHaveProperty("reference");
    expect(whole.markdown).toContain("| scope: all |");
    expect(whole.markdown).not.toContain("# Reference");
  });

  test("leaves out the questions OCEAN hides", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    await saveAnswer(team.validationId, "V.02.OCEAN", team.memberCookie, {
      text: "Red",
      lockVersion: 0,
    });
    const result = await exported(
      team.memberCookie,
      `source=validation&id=${team.validationId}&sections=02`,
    );
    const ids = result.json.questions.map((q) => q.id);
    expect(ids).toContain("V.02.RED_1");
    expect(ids).not.toContain("V.02.BLUE_1");
    expect(result.markdown).toContain("**Choices:** Red / Blue / Mixed");
  });

  test("writes a plan's text sub-items, its tables as Reference", async () => {
    const team = await teamWithProceedIdea(app, fixtures);
    const draft = await call(
      "POST",
      `/api/v1/ideas/${team.idea.id}/plans`,
      team.memberCookie,
      { name: "Plan A" },
    );
    const plan = planHomeSchema.parse(await draft.json());
    expect(
      (
        await call(
          "PUT",
          `/api/v1/plans/${plan.id}/answers/P.11.1`,
          team.memberCookie,
          {
            rows: [{ name: "Ana", role: "Owner" }],
            lockVersion: 0,
          },
        )
      ).status,
    ).toBe(200);
    const result = await exported(
      team.memberCookie,
      `source=business_plan&id=${plan.id}&items=11,1`,
    );
    expect(result.json.scope).toEqual({
      planName: "Plan A",
      items: [1, 11],
      part: null,
    });
    expect(result.json.questions.map((q) => q.id)).toEqual([
      "P.01.1",
      "P.01.2",
      "P.01.3",
      "P.01.4",
      "P.01.5",
      "P.01.6",
      "P.11.2",
    ]);
    expect(result.json.questions[0]?.answer).toEqual({
      text: "Gift boxes for offices",
    });
    expect(result.json.reference?.tables?.[0]).toMatchObject({
      id: "P.11.1",
      rows: [["Ana", "Owner", null, null, null]],
    });
    expect(result.markdown).toStartWith(
      "<!-- moonx-export v1 | kind: business_plan | scope: 01,11 | idea: Piaya boxes / Plan A |",
    );
    expect(result.fileBaseName).toBe(
      "moonx-export-business_plan-Piaya boxes - Plan A-2026-10-01",
    );
    const partB = await exported(
      team.memberCookie,
      `source=business_plan&id=${plan.id}&part=b&includeReference=false`,
    );
    expect(partB.json.scope).toEqual({
      planName: "Plan A",
      items: null,
      part: "b",
    });
    expect(partB.json.questions.every((q) => Number(q.section) >= 11)).toBe(
      true,
    );
  });

  test("writes the caller's own self-analysis with its template's prompt", async () => {
    const user = await fixtures.createUser({ displayName: "Ana Reyes" });
    const cookie = await signIn(app, user.email, uniqueIp());
    const versionId = await fixtures.selfAnalysisVersion();
    await db
      .update(templateVersions)
      .set({ aiPrompt: "Guide me through it." })
      .where(eq(templateVersions.id, versionId));

    // Not made before S1 GET opens it the first time.
    for (const response of [
      await call("GET", "/api/v1/ai/export?source=self_analysis", cookie),
      await call(
        "GET",
        "/api/v1/ai/import/context?target=self_analysis",
        cookie,
      ),
      await apply(cookie, { type: "self_analysis" }, [
        { questionKey: "SA.WHY.1", text: "To stay", baseLockVersion: 0 },
      ]),
    ]) {
      expect(response.status).toBe(404);
      expect((await errorOf(response)).code).toBe("NOT_FOUND");
    }

    const home = selfAnalysisHomeSchema.parse(
      await (await call("GET", "/api/v1/me/self-analysis", cookie)).json(),
    );
    await db.insert(selfAnalysisAnswers).values({
      selfAnalysisId: home.id,
      questionKey: "SA.INCOME.1",
      text: "Rent",
      amount: 30000,
      lockVersion: 1,
    });
    const result = await exported(cookie, "source=self_analysis");
    expect(result.markdown).toContain(
      "| exported: 2026-10-01T10:00+08:00 -->\n\n# Prompt\n\nGuide me through it.\n\n# Questions",
    );
    expect(result.markdown).toContain(
      "> ### Amount\n>\n> ₱30,000\n>\n> ### Why this amount?\n>\n> Rent",
    );
    expect(result.json.prompt).toBe("Guide me through it.");
    expect(result.json.scope).toEqual({ sections: null });
    expect(result.fileBaseName).toBe(
      "moonx-export-self_analysis-Ana Reyes-2026-10-01",
    );
  });

  test("refuses scopes it cannot write, and exports an archived idea", async () => {
    const team = await teamWithProceedIdea(app, fixtures);
    const { memberCookie, validationId } = team;
    const refused = async (query: string, code: ErrorCode, path?: string) => {
      const response = await call(
        "GET",
        `/api/v1/ai/export?${query}`,
        memberCookie,
      );
      expect({ query, status: response.status }).toEqual({
        query,
        status: 422,
      });
      const error = await errorOf(response);
      expect(error.code).toBe(code);
      if (path !== undefined) expect(error.details?.[0]?.path).toBe(path);
    };
    await refused(
      `source=validation&id=${validationId}&sections=`,
      "EMPTY_SCOPE",
    );
    await refused(
      `source=validation&id=${validationId}&sections=03`,
      "VALIDATION_FAILED",
      "sections",
    );
    await refused("source=validation", "VALIDATION_FAILED", "id");
    await refused(
      `source=validation&id=${validationId}&items=1`,
      "VALIDATION_FAILED",
    );
    await refused(
      `source=self_analysis&id=${validationId}`,
      "VALIDATION_FAILED",
    );
    const draft = await call(
      "POST",
      `/api/v1/ideas/${team.idea.id}/plans`,
      memberCookie,
      { name: "Plan A" },
    );
    const plan = planHomeSchema.parse(await draft.json());
    await refused(`source=business_plan&id=${plan.id}&items=23`, "EMPTY_SCOPE");
    await refused(
      `source=business_plan&id=${plan.id}&items=1&part=a`,
      "VALIDATION_FAILED",
    );
    await refused(
      `source=business_plan&id=${plan.id}&items=31`,
      "VALIDATION_FAILED",
      "items",
    );

    const viewer = await call(
      "GET",
      `/api/v1/ai/export?source=validation&id=${validationId}`,
      team.viewerCookie,
    );
    expect(viewer.status).toBe(403);

    await db
      .update(ideas)
      .set({ archivedAt: new Date(clock) })
      .where(eq(ideas.id, team.idea.id));
    await exported(memberCookie, `source=validation&id=${validationId}`);
    const ctx = await context(
      memberCookie,
      `target=validation&id=${validationId}`,
    );
    expect(ctx.target.archived).toBe(true);
  });
});

describe("X2 GET /api/v1/ai/import/context", () => {
  test("gives a validation's questions with what they hold and whether they import", async () => {
    const team = await teamWithAnswers();
    await saveAnswer(team.validationId, "V.02.OCEAN", team.memberCookie, {
      text: "Red",
      lockVersion: 0,
    });
    const ctx = await context(
      team.ownerCookie,
      `target=validation&id=${team.validationId}`,
    );
    expect(ctx.target).toEqual({
      type: "validation",
      id: team.validationId,
      name: "Piaya boxes",
      workspaceId: team.workspace.id,
      ideaId: team.idea.id,
      currency: "PHP",
      archived: false,
    });
    expect(ctx.sections.map((s) => [s.key, s.importable])).toEqual([
      ["01", true],
      ["02", true],
      ["04", true],
      ["08", true],
      ["10", true],
    ]);
    const who = ctx.questions.find((q) => q.questionKey === "V.01.WHO");
    expect(who).toMatchObject({
      prompt: "Who is the primary paying customer?",
      sectionKey: "01",
      answerType: "long_text",
      importable: true,
      hasFau: true,
      hidden: false,
      current: {
        text: "HR teams of BPO companies in Bacolod that buy gifts for clients",
        amount: null,
        lockVersion: 3,
        classification: { fau: "assumption", state: "assumption" },
        updatedBy: { displayName: "Member" },
      },
    });
    const hidden = Object.fromEntries(
      ctx.questions
        .filter((q) => q.sectionKey === "02")
        .map((q) => [q.questionKey, q.hidden]),
    );
    expect(hidden["V.02.RED_1"]).toBe(false);
    expect(hidden["V.02.BLUE_1"]).toBe(true);
  });

  test("marks a plan's tables, numbers and execution items as not importable", async () => {
    const team = await teamWithProceedIdea(app, fixtures);
    const draft = await call(
      "POST",
      `/api/v1/ideas/${team.idea.id}/plans`,
      team.memberCookie,
      { name: "Plan A" },
    );
    const plan = planHomeSchema.parse(await draft.json());
    const ctx = await context(
      team.memberCookie,
      `target=business_plan&id=${plan.id}`,
    );
    expect(ctx.target).toMatchObject({
      type: "business_plan",
      name: "Plan A",
      ideaId: team.idea.id,
    });
    const importable = (key: string) =>
      ctx.questions.find((q) => q.questionKey === key)?.importable;
    expect(importable("P.01.1")).toBe(true);
    // A plan's answers have no F/A/U (design-spec 6.0.3).
    expect(ctx.questions.some((q) => q.hasFau)).toBe(false);
    expect(importable("P.01.7")).toBe(false);
    expect(importable("P.11.1")).toBe(false);
    expect(importable("P.23.1")).toBe(false);
    expect(ctx.sections.find((s) => s.key === "23")?.importable).toBe(false);
    expect(ctx.sections.find((s) => s.key === "01")).toEqual({
      key: "01",
      title: "Executive Summary",
      part: "a",
      importable: true,
    });
  });

  test("lists an answer a migration hid, as the version that had it defines it", async () => {
    const user = await fixtures.createUser({ displayName: "Mig" });
    const cookie = await signIn(app, user.email, uniqueIp());
    const v1 = await fixtures.selfAnalysisVersion();
    const home = selfAnalysisHomeSchema.parse(
      await (await call("GET", "/api/v1/me/self-analysis", cookie)).json(),
    );
    await db.insert(selfAnalysisAnswers).values([
      {
        selfAnalysisId: home.id,
        questionKey: "SA.INCOME.1",
        text: "Rent",
        amount: 30000,
        lockVersion: 1,
      },
    ]);
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.kind, "self_analysis"));
    if (template === undefined) throw new Error("No template");
    const [v2] = await db
      .insert(templateVersions)
      .values({
        templateId: template.id,
        versionNumber: 1000 + Math.floor(Math.random() * 100_000),
      })
      .returning();
    if (v2 === undefined) throw new Error("No version");
    try {
      const [why] = await db
        .insert(templateSections)
        .values({
          templateVersionId: v2.id,
          key: "WHY",
          title: "Why",
          sortOrder: 0,
        })
        .returning();
      if (why === undefined) throw new Error("No section");
      await db.insert(templateQuestions).values({
        templateVersionId: v2.id,
        templateSectionId: why.id,
        questionKey: "SA.WHY.1",
        title: "Q1",
        prompt: "Why?",
        answerType: "long_text",
        sortOrder: 0,
      });
      await db
        .update(selfAnalyses)
        .set({ templateVersionId: v2.id })
        .where(eq(selfAnalyses.id, home.id));

      const ctx = await context(cookie, "target=self_analysis");
      expect(ctx.questions.map((q) => [q.questionKey, q.hidden])).toEqual([
        ["SA.WHY.1", false],
        ["SA.INCOME.1", true],
      ]);
      expect(ctx.questions[1]).toMatchObject({
        sectionKey: "INCOME",
        answerType: "amount_with_reason",
        current: { text: "Rent", amount: 30000, classification: null },
      });
      const refused = await apply(cookie, { type: "self_analysis" }, [
        { questionKey: "SA.INCOME.1", text: "New", baseLockVersion: 1 },
      ]);
      expect(refused.status).toBe(422);
      expect((await errorOf(refused)).code).toBe("NOT_IMPORTABLE");
      // A question of no version at all is not found.
      const missing = await apply(cookie, { type: "self_analysis" }, [
        { questionKey: "SA.WHY.9", text: "New", baseLockVersion: 0 },
      ]);
      expect((await errorOf(missing)).code).toBe("QUESTION_NOT_FOUND");
      // The export leaves it out.
      const result = await exported(cookie, "source=self_analysis");
      expect(result.json.questions.map((q) => q.id)).toEqual(["SA.WHY.1"]);
    } finally {
      await db
        .update(selfAnalyses)
        .set({ templateVersionId: v1 })
        .where(eq(selfAnalyses.id, home.id));
      await db.delete(templateVersions).where(eq(templateVersions.id, v2.id));
    }
  });
});

describe("X3 POST /api/v1/ai/import/apply", () => {
  test("takes the spec's export back, and applies an AI's reply in one batch", async () => {
    const team = await teamWithAnswers();
    const { validationId, memberCookie } = team;
    const result = await exported(
      memberCookie,
      `source=validation&id=${validationId}&sections=01`,
    );
    const ctx = await context(
      memberCookie,
      `target=validation&id=${validationId}`,
    );
    const target = { ...ctx, currency: ctx.target.currency };
    const scope = { kind: "sections", keys: ["01"] } as const;

    // The export pasted back as it is: every block with an answer is matched.
    const pastedBack = matchBlocks(
      parseAiReply(result.markdown),
      target,
      scope,
    );
    expect(pastedBack.map((block) => [block.id, block.status])).toEqual([
      ["V.01.WHO", "matched"],
    ]);
    // Applied, it changes nothing: the answers are those exported.
    const unchanged = await apply(
      memberCookie,
      { type: "validation", id: validationId },
      pastedBack.map((block) => ({
        questionKey: block.questionKey as string,
        text: block.answer?.text ?? null,
        baseLockVersion: lockVersionOf(ctx, block.questionKey as string),
      })),
    );
    expect(unchanged.status).toBe(200);
    expect(importApplyResultSchema.parse(await unchanged.json()).applied).toBe(
      0,
    );

    const reply = [
      "Here is what I would write.",
      "## [V.01.WHO]",
      "HR and admin teams of BPO offices in Bacolod.",
      "## [V.01.WHY_THEM]",
      "They give gifts every month.",
    ].join("\n");
    const blocks = matchBlocks(parseAiReply(reply), target, scope);
    expect(blocks.map((block) => block.status)).toEqual([
      "unmatched",
      "matched",
      "matched",
    ]);
    const changes = blocks
      .filter((block) => block.status === "matched")
      .map((block) => ({
        questionKey: block.questionKey as string,
        text: block.answer?.text ?? null,
        baseLockVersion: lockVersionOf(ctx, block.questionKey as string),
      }));
    const response = await apply(
      memberCookie,
      { type: "validation", id: validationId },
      changes,
    );
    expect(response.status).toBe(200);
    const applied = importApplyResultSchema.parse(await response.json());
    expect(applied).toMatchObject({ applied: 2, needsClassification: 2 });

    const who = await answerRow(validationId, "V.01.WHO");
    expect(who).toMatchObject({
      text: "HR and admin teams of BPO offices in Bacolod.",
      fau: null,
      confidence: null,
      lockVersion: 4,
    });
    expect(await answerRow(validationId, "V.01.WHY_THEM")).toMatchObject({
      text: "They give gifts every month.",
      lockVersion: 1,
    });
    const rows = (await historyOf(validationId)).filter(
      (row) => row.source === "ai_import",
    );
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.batchId))).toEqual(
      new Set([applied.batchId]),
    );
    const whoRow = rows.find((row) => row.targetKey === "V.01.WHO");
    expect(whoRow).toMatchObject({
      action: "update",
      containerType: "validation",
      sectionKey: "01",
      workspaceId: team.workspace.id,
      changedById: team.member.id,
    });
    expect(whoRow?.before).toMatchObject({
      fau: "assumption",
      confidence: "medium",
    });
    expect(whoRow?.after).toMatchObject({
      text: "HR and admin teams of BPO offices in Bacolod.",
      fau: null,
      confidence: null,
    });
    expect(whoRow?.after).toHaveProperty("evidenceIds.length", 2);
    expect(rows.find((row) => row.targetKey === "V.01.WHY_THEM")?.action).toBe(
      "create",
    );
  });

  test("keeps the F/A/U chosen again, a Fact only with its evidence", async () => {
    const team = await teamWithAnswers();
    const { validationId, memberCookie } = team;
    const ctx = await context(
      memberCookie,
      `target=validation&id=${validationId}`,
    );
    const noEvidence = await apply(
      memberCookie,
      { type: "validation", id: validationId },
      [
        {
          questionKey: "V.01.WHO",
          text: "Offices",
          classification: { fau: "fact" },
          baseLockVersion: lockVersionOf(ctx, "V.01.WHO"),
        },
        {
          questionKey: "V.01.PROBLEM",
          text: "Gifts are late",
          classification: { fau: "fact" },
          baseLockVersion: 0,
        },
      ],
    );
    expect(noEvidence.status).toBe(422);
    expect((await errorOf(noEvidence)).code).toBe("FACT_REQUIRES_EVIDENCE");
    expect((await answerRow(validationId, "V.01.WHO"))?.text).toBe(
      "HR teams of BPO companies in Bacolod that buy gifts for clients",
    );

    const response = await apply(
      memberCookie,
      { type: "validation", id: validationId },
      [
        {
          questionKey: "V.01.WHO",
          text: "Offices",
          classification: { fau: "fact" },
          baseLockVersion: lockVersionOf(ctx, "V.01.WHO"),
        },
        {
          questionKey: "V.01.PROBLEM",
          text: "Gifts are late",
          classification: { fau: "assumption", confidence: "low" },
          baseLockVersion: 0,
        },
      ],
    );
    expect(response.status).toBe(200);
    expect(importApplyResultSchema.parse(await response.json())).toMatchObject({
      applied: 2,
      needsClassification: 0,
    });
    expect(await answerRow(validationId, "V.01.WHO")).toMatchObject({
      fau: "fact",
    });
    expect(await answerRow(validationId, "V.01.PROBLEM")).toMatchObject({
      fau: "assumption",
      confidence: "low",
    });
  });

  test("answers 409 CONFLICT_MULTI with every answer saved since, and saves nothing", async () => {
    const team = await teamWithAnswers();
    const { validationId, memberCookie, ownerCookie } = team;
    const ctx = await context(
      memberCookie,
      `target=validation&id=${validationId}`,
    );
    await saveAnswer(validationId, "V.01.WHO", ownerCookie, {
      text: "Changed by the Owner",
      lockVersion: lockVersionOf(ctx, "V.01.WHO"),
    });
    await saveAnswer(validationId, "V.01.PROOF", ownerCookie, {
      text: "Made by the Owner",
      lockVersion: 0,
    });
    const response = await apply(
      memberCookie,
      { type: "validation", id: validationId },
      [
        { questionKey: "V.01.WHY_THEM", text: "New", baseLockVersion: 0 },
        {
          questionKey: "V.01.WHO",
          text: "Mine",
          baseLockVersion: lockVersionOf(ctx, "V.01.WHO"),
        },
        { questionKey: "V.01.PROOF", text: "Mine too", baseLockVersion: 0 },
      ],
    );
    expect(response.status).toBe(409);
    const error = await errorOf(response);
    expect(error.code).toBe("CONFLICT_MULTI");
    expect(error.conflicts).toEqual([
      {
        questionKey: "V.01.WHO",
        current: {
          value: { text: "Changed by the Owner", amount: null },
          lockVersion: lockVersionOf(ctx, "V.01.WHO") + 1,
          updatedAt: expect.any(String),
          updatedBy: expect.objectContaining({ displayName: "Owner" }),
        },
      },
      {
        questionKey: "V.01.PROOF",
        current: {
          value: { text: "Made by the Owner", amount: null },
          lockVersion: 1,
          updatedAt: expect.any(String),
          updatedBy: expect.objectContaining({ displayName: "Owner" }),
        },
      },
    ]);
    expect(await answerRow(validationId, "V.01.WHY_THEM")).toBeUndefined();

    // The text someone saved since is no change, whatever version it was read at.
    const same = await apply(
      memberCookie,
      { type: "validation", id: validationId },
      [
        {
          questionKey: "V.01.PROOF",
          text: "Made by the Owner",
          baseLockVersion: 0,
        },
      ],
    );
    expect(same.status).toBe(200);
    expect(importApplyResultSchema.parse(await same.json()).applied).toBe(0);
  });

  test("saves nothing when the idea is archived while the import waits", async () => {
    const team = await teamWithAnswers();
    const { validationId, memberCookie } = team;
    const started: { response?: Promise<Response> } = {};
    await db.transaction(async (tx) => {
      await tx
        .select({ id: ideas.id })
        .from(ideas)
        .where(eq(ideas.id, team.idea.id))
        .for("update");
      started.response = apply(
        memberCookie,
        { type: "validation", id: validationId },
        [
          { questionKey: "V.01.WHY_THEM", text: "New", baseLockVersion: 0 },
          { questionKey: "V.01.PROOF", text: "Proof", baseLockVersion: 0 },
        ],
      );
      await untilBlockedBy(db, tx);
      await tx
        .update(ideas)
        .set({ archivedAt: new Date(clock) })
        .where(eq(ideas.id, team.idea.id));
    });
    const response = await started.response;
    expect(response?.status).toBe(409);
    expect(response === undefined ? null : (await errorOf(response)).code).toBe(
      "ARCHIVED",
    );
    expect(await answerRow(validationId, "V.01.WHY_THEM")).toBeUndefined();
    expect(await answerRow(validationId, "V.01.PROOF")).toBeUndefined();
    expect(
      (await historyOf(validationId)).filter(
        (row) => row.source === "ai_import",
      ),
    ).toEqual([]);

    const archived = await apply(
      memberCookie,
      { type: "validation", id: validationId },
      [{ questionKey: "V.01.WHY_THEM", text: "New", baseLockVersion: 0 }],
    );
    expect(archived.status).toBe(409);
    expect((await errorOf(archived)).code).toBe("ARCHIVED");
  });

  test("refuses what it cannot import, checking every change before writing", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const { validationId, memberCookie } = team;
    await saveAnswer(validationId, "V.02.OCEAN", memberCookie, {
      text: "Red",
      lockVersion: 0,
    });
    const refused = async (
      changes: ImportChange[],
      code: ErrorCode,
      path?: string,
    ) => {
      const response = await apply(
        memberCookie,
        { type: "validation", id: validationId },
        changes,
      );
      expect({
        status: response.status,
        code: (await errorOf(response)).code,
      }).toEqual({
        status: 422,
        code,
      });
      if (path !== undefined) {
        const again = await apply(
          memberCookie,
          { type: "validation", id: validationId },
          changes,
        );
        expect((await errorOf(again)).details?.[0]?.path).toBe(path);
      }
    };
    const fine = {
      questionKey: "V.01.WHO",
      text: "Offices",
      baseLockVersion: 0,
    };
    await refused(
      [fine, { questionKey: "V.02.BLUE_1", text: "x", baseLockVersion: 0 }],
      "NOT_IMPORTABLE",
    );
    await refused(
      [fine, { questionKey: "V.09.NOPE", text: "x", baseLockVersion: 0 }],
      "QUESTION_NOT_FOUND",
    );
    await refused(
      [fine, { questionKey: "V.02.OCEAN", text: "Purple", baseLockVersion: 1 }],
      "VALIDATION_FAILED",
      "changes.1.text",
    );
    await refused(
      [
        fine,
        {
          questionKey: "V.02.CATEGORY",
          text: "x".repeat(201),
          baseLockVersion: 0,
        },
      ],
      "VALIDATION_FAILED",
      "changes.1.text",
    );
    await refused(
      [fine, { ...fine, text: "Again" }],
      "VALIDATION_FAILED",
      "changes.1.questionKey",
    );
    await refused(
      [fine, { questionKey: "V.01.PROOF", amount: 5, baseLockVersion: 0 }],
      "VALIDATION_FAILED",
      "changes.1.amount",
    );
    await refused(
      [
        fine,
        {
          questionKey: "V.01.PROOF",
          text: "x",
          classification: { fau: "assumption" },
          baseLockVersion: 0,
        },
      ],
      "CONFIDENCE_REQUIRED",
    );
    await refused([], "VALIDATION_FAILED", "changes");
    expect(await answerRow(validationId, "V.01.WHO")).toBeUndefined();

    // Hidden depends on what is stored, so a version that changed comes first.
    await saveAnswer(validationId, "V.02.OCEAN", team.ownerCookie, {
      text: "Blue",
      lockVersion: 1,
    });
    const stale = await apply(
      memberCookie,
      { type: "validation", id: validationId },
      [
        { questionKey: "V.02.OCEAN", text: "Red", baseLockVersion: 1 },
        { questionKey: "V.02.RED_1", text: "Crowded", baseLockVersion: 0 },
      ],
    );
    expect(stale.status).toBe(409);
    expect((await errorOf(stale)).code).toBe("CONFLICT_MULTI");

    // A choice in any case is saved as the template spells it.
    const response = await apply(
      memberCookie,
      { type: "validation", id: validationId },
      [{ questionKey: "V.02.OCEAN", text: "mixed", baseLockVersion: 2 }],
    );
    expect(response.status).toBe(200);
    expect((await answerRow(validationId, "V.02.OCEAN"))?.text).toBe("Mixed");

    const viewer = await apply(
      team.viewerCookie,
      { type: "validation", id: validationId },
      [fine],
    );
    expect(viewer.status).toBe(403);
  });

  test("writes the caller's self-analysis and starts it", async () => {
    const user = await fixtures.createUser();
    const cookie = await signIn(app, user.email, uniqueIp());
    await fixtures.selfAnalysisVersion();
    const home = selfAnalysisHomeSchema.parse(
      await (await call("GET", "/api/v1/me/self-analysis", cookie)).json(),
    );
    expect(home.status).toBe("not_started");
    const reply = parseAiReply(
      "## [SA.WHY.1]\nTo stay in Bacolod.\n\n## [SA.INCOME.1]\n### Amount\n₱45,000\n### Why this amount?\nRent and food",
    );
    const income = reply.blocks[1];
    expect(
      readImportedAnswer(
        income?.body ?? { kind: "markdown", text: "" },
        { answerType: "amount_with_reason", options: null },
        "PHP",
      ),
    ).toEqual({
      amount: { kind: "value", value: 45000 },
      text: "Rent and food",
    });

    const wrong = await apply(cookie, { type: "self_analysis" }, [
      { questionKey: "SA.WHY.1", text: "x", amount: 5, baseLockVersion: 0 },
    ]);
    expect((await errorOf(wrong)).details?.[0]?.path).toBe("changes.0.amount");
    const classified = await apply(cookie, { type: "self_analysis" }, [
      {
        questionKey: "SA.WHY.1",
        text: "x",
        classification: { fau: "unknown" },
        baseLockVersion: 0,
      },
    ]);
    expect((await errorOf(classified)).details?.[0]?.path).toBe(
      "changes.0.classification",
    );

    const response = await apply(cookie, { type: "self_analysis" }, [
      {
        questionKey: "SA.WHY.1",
        text: "To stay in Bacolod.",
        baseLockVersion: 0,
      },
      {
        questionKey: "SA.INCOME.1",
        amount: 45000,
        text: "Rent and food",
        baseLockVersion: 0,
      },
    ]);
    expect(response.status).toBe(200);
    expect(importApplyResultSchema.parse(await response.json())).toMatchObject({
      applied: 2,
      needsClassification: 0,
    });
    const after = selfAnalysisHomeSchema.parse(
      await (await call("GET", "/api/v1/me/self-analysis", cookie)).json(),
    );
    expect(after.status).toBe("in_progress");
    const rows = await historyOf(home.id);
    expect(
      rows.map((row) => [row.targetKey, row.source, row.ownerUserId]),
    ).toEqual(
      expect.arrayContaining([
        ["SA.WHY.1", "ai_import", user.id],
        ["SA.INCOME.1", "ai_import", user.id],
      ]),
    );
    expect(rows.find((row) => row.targetKey === "SA.INCOME.1")?.after).toEqual({
      text: "Rent and food",
      amount: 45000,
    });

    // Only the amount: the reason stays.
    const amountOnly = await apply(cookie, { type: "self_analysis" }, [
      { questionKey: "SA.INCOME.1", amount: 50000, baseLockVersion: 1 },
    ]);
    expect(amountOnly.status).toBe(200);
    const [income1] = await db
      .select()
      .from(selfAnalysisAnswers)
      .where(
        and(
          eq(selfAnalysisAnswers.selfAnalysisId, home.id),
          eq(selfAnalysisAnswers.questionKey, "SA.INCOME.1"),
        ),
      );
    expect(income1).toMatchObject({
      amount: 50000,
      text: "Rent and food",
      lockVersion: 2,
    });
  });

  test("writes a plan's text sub-items after its latest version", async () => {
    const team = await teamWithProceedIdea(app, fixtures);
    const draft = await call(
      "POST",
      `/api/v1/ideas/${team.idea.id}/plans`,
      team.memberCookie,
      { name: "Plan A" },
    );
    const plan = planHomeSchema.parse(await draft.json());
    const saved = await call(
      "POST",
      `/api/v1/plans/${plan.id}/versions`,
      team.memberCookie,
      { name: "First" },
    );
    expect(saved.status).toBe(201);
    // An instance whose clock is behind the one that saved the version.
    const savedAt = clock;
    clock -= 60_000;
    try {
      const ctx = await context(
        team.memberCookie,
        `target=business_plan&id=${plan.id}`,
      );
      for (const key of ["P.11.1", "P.01.7", "P.23.1"]) {
        const refused = await apply(
          team.memberCookie,
          { type: "business_plan", id: plan.id },
          [{ questionKey: key, text: "x", baseLockVersion: 0 }],
        );
        expect({ key, code: (await errorOf(refused)).code }).toEqual({
          key,
          code: "NOT_IMPORTABLE",
        });
      }
      const response = await apply(
        team.memberCookie,
        { type: "business_plan", id: plan.id },
        [
          {
            questionKey: "P.01.1",
            text: "Gift boxes for Bacolod offices",
            baseLockVersion: lockVersionOf(ctx, "P.01.1"),
          },
        ],
      );
      expect(response.status).toBe(200);
      const [answer] = await db
        .select()
        .from(planAnswers)
        .where(
          and(
            eq(planAnswers.businessPlanId, plan.id),
            eq(planAnswers.questionKey, "P.01.1"),
          ),
        );
      expect(answer?.text).toBe("Gift boxes for Bacolod offices");
      expect(answer?.updatedAt.getTime()).toBeGreaterThan(savedAt);
      const home = planHomeSchema.parse(
        await (
          await call("GET", `/api/v1/plans/${plan.id}`, team.memberCookie)
        ).json(),
      );
      expect(home.hasChangesSinceVersion).toBe(true);
      const [row] = (await historyOf(plan.id)).filter(
        (history) => history.source === "ai_import",
      );
      expect(row).toMatchObject({
        containerType: "business_plan",
        sectionKey: "01",
        after: { text: "Gift boxes for Bacolod offices", rows: null },
      });
    } finally {
      clock = savedAt;
    }
  });

  test(`counts X1 and X3 together, ${AI_LIMIT.max} an hour, and not X2`, async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const { validationId, memberCookie } = team;
    const query = `source=validation&id=${validationId}&sections=01&includeReference=false`;
    for (let made = 0; made < AI_LIMIT.max - 1; made += 1) {
      const response = await call(
        "GET",
        `/api/v1/ai/export?${query}`,
        memberCookie,
      );
      expect(response.status).toBe(200);
    }
    // A refused export is not counted, nor is X2.
    const empty = await call(
      "GET",
      `/api/v1/ai/export?source=validation&id=${validationId}&sections=`,
      memberCookie,
    );
    expect(empty.status).toBe(422);
    await context(memberCookie, `target=validation&id=${validationId}`);
    // A refused import is not counted, whether 422 or 409.
    const refused = await apply(
      memberCookie,
      { type: "validation", id: validationId },
      [{ questionKey: "V.09.NOPE", text: "x", baseLockVersion: 0 }],
    );
    expect(refused.status).toBe(422);
    await saveAnswer(validationId, "V.01.PROOF", team.ownerCookie, {
      text: "Made by the Owner",
      lockVersion: 0,
    });
    const conflicting = await apply(
      memberCookie,
      { type: "validation", id: validationId },
      [{ questionKey: "V.01.PROOF", text: "Mine", baseLockVersion: 0 }],
    );
    expect(conflicting.status).toBe(409);
    const last = await apply(
      memberCookie,
      { type: "validation", id: validationId },
      [{ questionKey: "V.01.WHO", text: "Offices", baseLockVersion: 0 }],
    );
    expect(last.status).toBe(200);

    const limited = await call(
      "GET",
      `/api/v1/ai/export?${query}`,
      memberCookie,
    );
    expect(limited.status).toBe(429);
    const error = await errorOf(limited);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryAfterSeconds).toBe(3600);
    const importLimited = await apply(
      memberCookie,
      { type: "validation", id: validationId },
      [{ questionKey: "V.01.WHO", text: "More", baseLockVersion: 1 }],
    );
    expect(importLimited.status).toBe(429);
    expect((await answerRow(validationId, "V.01.WHO"))?.text).toBe("Offices");
    await context(memberCookie, `target=validation&id=${validationId}`);

    // Another user has their own count.
    const owner = await call(
      "GET",
      `/api/v1/ai/export?${query}`,
      team.ownerCookie,
    );
    expect(owner.status).toBe(200);
  });
});
