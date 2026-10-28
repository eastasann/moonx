import { afterAll, describe, expect, test } from "bun:test";
import {
  changeHistory,
  comments,
  memberships,
  selfAnalyses,
  selfAnalysisAnswers,
  selfAnalysisShares,
  templateQuestions,
  templateSections,
  templates,
  templateVersions,
  workspaces,
} from "@moonx/db";
import {
  type ErrorCode,
  errorBodySchema,
  memberSelfAnalysesSchema,
  selfAnalysisAnswerSchema,
  selfAnalysisHomeSchema,
  selfAnalysisSectionSchema,
  sharedSelfAnalysisSchema,
} from "@moonx/schemas";
import { and, eq, inArray, sql } from "drizzle-orm";
import { lockMembers } from "./membership";
import { buildTestApp, connectTestDatabase, uniqueIp } from "./test-app";
import {
  apiRequest,
  duringAccountDeletion,
  signIn,
  testFixtures,
  untilBlockedBy,
} from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
const { app } = buildTestApp(database);

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

/** A user signed in, once the template version S1 makes self-analyses on exists. */
async function signedInUser(options: { isAdmin?: boolean } = {}) {
  await fixtures.selfAnalysisVersion();
  const user = await fixtures.createUser(options);
  return { user, cookie: await signIn(app, user.email, uniqueIp()) };
}

type Caller = Awaited<ReturnType<typeof signedInUser>>;

const call = (
  caller: Caller,
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  body?: unknown,
) =>
  app.handle(
    apiRequest(method, `/api/v1/me/self-analysis${path}`, {
      cookie: caller.cookie,
      body,
    }),
  );

/** S1 GET, which makes the self-analysis the first time. */
async function open(caller: Caller) {
  const response = await call(caller, "GET", "");
  expect(response.status).toBe(200);
  return selfAnalysisHomeSchema.parse(await response.json());
}

const save = (caller: Caller, key: string, body: unknown) =>
  call(caller, "PUT", `/answers/${key}`, body);

async function saved(response: Response) {
  expect(response.status).toBe(200);
  return selfAnalysisAnswerSchema.parse(await response.json());
}

const homeOf = async (response: Response) => {
  expect(response.status).toBe(200);
  return selfAnalysisHomeSchema.parse(await response.json());
};

/** A self-analysis answered in full and marked as done. */
async function doneSelfAnalysis(caller: Caller) {
  await open(caller);
  await saved(await save(caller, "SA.WHY.1", { text: "a", lockVersion: 0 }));
  await saved(await save(caller, "SA.WHY.2", { text: "b", lockVersion: 0 }));
  await saved(
    await save(caller, "SA.INCOME.1", { amount: 50000, lockVersion: 0 }),
  );
  return homeOf(await call(caller, "POST", "/complete", null));
}

const historyOf = async (selfAnalysisId: string) =>
  (
    await db
      .select({ action: changeHistory.action })
      .from(changeHistory)
      .where(eq(changeHistory.containerId, selfAnalysisId))
      .orderBy(changeHistory.changedAt)
  ).map((row) => row.action);

async function teamOf(caller: Caller, role: "owner" | "member" | "viewer") {
  const workspace = await fixtures.createWorkspace({ name: `Team ${role}` });
  await fixtures.addMember(workspace.id, caller.user.id, role);
  return workspace;
}

describe("S1 GET /api/v1/me/self-analysis", () => {
  test("makes it the first time, not started on the latest published version", async () => {
    const caller = await signedInUser();
    const version = await fixtures.selfAnalysisVersion();

    const first = await open(caller);
    expect(first).toMatchObject({
      status: "not_started",
      completedAt: null,
      currency: "PHP",
      template: { versionId: version, versionNumber: 1, newerVersion: null },
      answered: 0,
      total: 3,
      sections: [
        { key: "WHY", title: "Why", answered: 0, total: 2 },
        { key: "INCOME", title: "Personal income", answered: 0, total: 1 },
      ],
      firstUnanswered: { sectionKey: "WHY", questionKey: "SA.WHY.1" },
      shares: [],
      shareableWorkspaces: [],
    });
    expect((await open(caller)).id).toBe(first.id);
  });

  test("makes one when two first opens meet", async () => {
    const caller = await signedInUser();
    const [a, b] = await Promise.all([open(caller), open(caller)]);
    expect(a.id).toBe(b.id);
    const rows = await db
      .select()
      .from(selfAnalyses)
      .where(eq(selfAnalyses.userId, caller.user.id));
    expect(rows).toHaveLength(1);
  });

  test("makes one for an operator too", async () => {
    const admin = await signedInUser({ isAdmin: true });
    expect((await open(admin)).status).toBe("not_started");
  });

  test("offers the team workspaces the caller is an Owner or Member of", async () => {
    const caller = await signedInUser();
    const owned = await teamOf(caller, "owner");
    const joined = await teamOf(caller, "member");
    await teamOf(caller, "viewer");
    const personal = await fixtures.createWorkspace({
      isPersonal: true,
      createdById: caller.user.id,
    });
    await fixtures.addMember(personal.id, caller.user.id, "owner");
    const othersPersonal = await fixtures.createWorkspace({ isPersonal: true });
    await fixtures.addMember(othersPersonal.id, caller.user.id, "member");

    expect((await open(caller)).shareableWorkspaces).toEqual([
      { id: owned.id, name: owned.name },
      { id: joined.id, name: joined.name },
    ]);
  });

  test("answers 409 TEMPLATE_NOT_PUBLISHED before the operator publishes one", async () => {
    const caller = await signedInUser();
    const version = await fixtures.selfAnalysisVersion();
    await db
      .update(templateVersions)
      .set({ status: "draft" })
      .where(eq(templateVersions.id, version));
    try {
      const response = await call(caller, "GET", "");
      expect(response.status).toBe(409);
      expect((await errorOf(response)).code).toBe("TEMPLATE_NOT_PUBLISHED");
    } finally {
      await db
        .update(templateVersions)
        .set({ status: "published" })
        .where(eq(templateVersions.id, version));
    }
    const rows = await db
      .select()
      .from(selfAnalyses)
      .where(eq(selfAnalyses.userId, caller.user.id));
    expect(rows).toEqual([]);
  });

  test("makes it on the newest of the published versions", async () => {
    const caller = await signedInUser();
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.kind, "self_analysis"));
    if (template === undefined) throw new Error("No template");
    const [newer] = await db
      .insert(templateVersions)
      .values({
        templateId: template.id,
        versionNumber: 902,
        status: "published",
        // Published before v1: the newest is the highest version number.
        publishedAt: new Date("2000-01-01T00:00:00.000Z"),
      })
      .returning();
    if (newer === undefined) throw new Error("No version");
    try {
      expect((await open(caller)).template).toEqual({
        versionId: newer.id,
        versionNumber: 902,
        newerVersion: null,
      });
    } finally {
      await db
        .delete(selfAnalyses)
        .where(eq(selfAnalyses.userId, caller.user.id));
      await db
        .delete(templateVersions)
        .where(eq(templateVersions.id, newer.id));
    }
  });

  test("makes nothing for an account deleted while the request waits", async () => {
    const caller = await signedInUser();
    const response = await duringAccountDeletion(db, caller.user.id, () =>
      call(caller, "GET", ""),
    );
    expect(response.status).toBe(401);
    const rows = await db
      .select()
      .from(selfAnalyses)
      .where(eq(selfAnalyses.userId, caller.user.id));
    expect(rows).toEqual([]);
  });
});

describe("S1 PATCH /api/v1/me/self-analysis", () => {
  test("changes the currency without converting the amounts", async () => {
    const caller = await signedInUser();
    const home = await open(caller);
    await saved(
      await save(caller, "SA.INCOME.1", { amount: 50000, lockVersion: 0 }),
    );
    const long = new Date("2026-01-01T00:00:00.000Z");
    await db
      .update(selfAnalyses)
      .set({ updatedAt: long })
      .where(eq(selfAnalyses.id, home.id));
    const updatedAt = async () =>
      (
        await db
          .select({ updatedAt: selfAnalyses.updatedAt })
          .from(selfAnalyses)
          .where(eq(selfAnalyses.id, home.id))
      )[0]?.updatedAt;

    // The same currency changes nothing.
    await homeOf(await call(caller, "PATCH", "", { currency: "PHP" }));
    expect(await updatedAt()).toEqual(long);

    const changed = await homeOf(
      await call(caller, "PATCH", "", { currency: "JPY" }),
    );
    expect(changed.currency).toBe("JPY");
    const [answer] = await db
      .select()
      .from(selfAnalysisAnswers)
      .where(eq(selfAnalysisAnswers.selfAnalysisId, home.id));
    expect(answer?.amount).toBe(50000);
    expect((await updatedAt())?.getTime()).toBeGreaterThan(long.getTime());
    // Settings keep no history (design-spec 6.0.5).
    const history = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.containerId, home.id));
    expect(history).toHaveLength(1);
  });

  test("refuses a code that is not a currency in use", async () => {
    const caller = await signedInUser();
    await open(caller);
    const response = await call(caller, "PATCH", "", { currency: "XAU" });
    expect(response.status).toBe(422);
    expect(await errorOf(response)).toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ path: "currency" }],
    });
  });

  test("answers 404 before S1 GET made the self-analysis, as S2–S5 do", async () => {
    const caller = await signedInUser();
    for (const [method, path, body] of [
      ["PATCH", "", { currency: "USD" }],
      ["GET", "/sections/WHY", undefined],
      ["PUT", "/answers/SA.WHY.1", { text: "x", lockVersion: 0 }],
      ["POST", "/complete", { confirmEmpty: true }],
      ["POST", "/reopen", null],
      ["PUT", "/shares", { workspaceIds: [] }],
    ] as const) {
      const response = await call(caller, method, path, body);
      expect({ path, method, status: response.status }).toEqual({
        path,
        method,
        status: 404,
      });
    }
  });
});

describe("S2 GET /api/v1/me/self-analysis/sections/{sectionKey}", () => {
  test("answers every question of the section, unanswered ones at version 0", async () => {
    const caller = await signedInUser();
    await open(caller);
    await saved(
      await save(caller, "SA.WHY.2", { text: "Family", lockVersion: 0 }),
    );

    const response = await call(caller, "GET", "/sections/WHY");
    expect(response.status).toBe(200);
    const view = selfAnalysisSectionSchema.parse(await response.json());
    expect(view.section).toMatchObject({ key: "WHY", title: "Why" });
    expect(view.answers).toEqual([
      {
        questionKey: "SA.WHY.1",
        text: null,
        amount: null,
        commentCounts: [],
        lockVersion: 0,
        updatedAt: null,
        updatedBy: null,
      },
      {
        questionKey: "SA.WHY.2",
        text: "Family",
        amount: null,
        commentCounts: [],
        lockVersion: 1,
        updatedAt: expect.any(String),
        updatedBy: {
          id: caller.user.id,
          displayName: "Test User",
          avatarUrl: null,
          badge: null,
        },
      },
    ]);
  });

  test("counts comments in each workspace it is shared with now, and no other", async () => {
    const caller = await signedInUser();
    const shared = await teamOf(caller, "owner");
    const unshared = await teamOf(caller, "member");
    const home = await doneSelfAnalysis(caller);
    await homeOf(
      await call(caller, "PUT", "/shares", { workspaceIds: [shared.id] }),
    );
    const comment = (workspaceId: string, extra = {}) =>
      db
        .insert(comments)
        .values({
          workspaceId,
          containerType: "self_analysis",
          containerId: home.id,
          sectionKey: "WHY",
          targetType: "self_analysis_answer",
          targetId: home.id,
          targetKey: "SA.WHY.1",
          authorId: caller.user.id,
          body: "Why this?",
          ...extra,
        })
        .returning();
    const [root] = await comment(shared.id);
    await comment(shared.id, { parentId: root?.id });
    await comment(shared.id, { deletedAt: new Date() });
    // Left from when it was shared there: hidden until it is again (design-spec 6.0.4).
    await comment(unshared.id);

    const response = await call(caller, "GET", "/sections/WHY");
    const view = selfAnalysisSectionSchema.parse(await response.json());
    expect(view.answers.map((answer) => answer.commentCounts)).toEqual([
      [{ workspaceId: shared.id, workspaceName: shared.name, count: 2 }],
      [{ workspaceId: shared.id, workspaceName: shared.name, count: 0 }],
    ]);
  });

  test("answers 404 for a section the pinned version lacks", async () => {
    const caller = await signedInUser();
    await open(caller);
    const response = await call(caller, "GET", "/sections/NOPE");
    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("NOT_FOUND");
  });
});

describe("S3 PUT /api/v1/me/self-analysis/answers/{questionKey}", () => {
  test("creates the answer at version 1, records it for the owner only and starts the self-analysis", async () => {
    const caller = await signedInUser();
    const home = await open(caller);

    const answer = await saved(
      await app.handle(
        new Request(
          `http://localhost/api/v1/me/self-analysis/answers/SA.WHY.1`,
          {
            method: "PUT",
            headers: {
              "content-type": "application/json",
              "x-forwarded-for": uniqueIp(),
              "x-moonx-client": "web_mobile",
              cookie: caller.cookie,
            },
            body: JSON.stringify({ text: "Family recipe", lockVersion: 0 }),
          },
        ),
      ),
    );
    expect(answer).toMatchObject({
      questionKey: "SA.WHY.1",
      text: "Family recipe",
      amount: null,
      lockVersion: 1,
    });
    const history = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.containerId, home.id));
    expect(history).toEqual([
      expect.objectContaining({
        workspaceId: null,
        ownerUserId: caller.user.id,
        containerType: "self_analysis",
        sectionKey: "WHY",
        targetType: "self_analysis_answer",
        targetId: home.id,
        targetKey: "SA.WHY.1",
        action: "create",
        before: null,
        after: { text: "Family recipe", amount: null },
        source: "manual",
        client: "web_mobile",
        changedById: caller.user.id,
      }),
    ]);
    expect(await open(caller)).toMatchObject({
      status: "in_progress",
      answered: 1,
      firstUnanswered: { sectionKey: "WHY", questionKey: "SA.WHY.2" },
    });
  });

  test("updates under the optimistic lock, and changes nothing for a save that changes nothing", async () => {
    const caller = await signedInUser();
    const home = await open(caller);
    await saved(await save(caller, "SA.WHY.1", { text: "v1", lockVersion: 0 }));
    const second = await saved(
      await save(caller, "SA.WHY.1", { text: "v2", lockVersion: 1 }),
    );
    expect(second.lockVersion).toBe(2);

    const stale = await save(caller, "SA.WHY.1", {
      text: "v3",
      lockVersion: 1,
    });
    expect(stale.status).toBe(409);
    expect(await errorOf(stale)).toMatchObject({
      code: "CONFLICT",
      current: {
        value: { text: "v2", amount: null },
        lockVersion: 2,
        updatedBy: { id: caller.user.id, badge: null },
      },
    });

    const unchanged = await saved(
      await save(caller, "SA.WHY.1", { text: "v2", lockVersion: 1 }),
    );
    expect(unchanged.lockVersion).toBe(2);

    const forced = await saved(
      await save(caller, "SA.WHY.1", {
        text: "v3",
        lockVersion: 1,
        force: true,
      }),
    );
    expect(forced).toMatchObject({ text: "v3", lockVersion: 3 });

    // The overwrite keeps a row of its own, though v2 was the same person's a moment
    // before: what it overwrote stays in the history (ADR-019, ADR-020).
    const history = await db
      .select({ action: changeHistory.action, after: changeHistory.after })
      .from(changeHistory)
      .where(eq(changeHistory.containerId, home.id))
      .orderBy(changeHistory.changedAt);
    expect(history.map((row) => row.after)).toEqual([
      { text: "v1", amount: null },
      { text: "v2", amount: null },
      { text: "v3", amount: null },
    ]);
  });

  test("a first save that lost the race to create the answer is 409, even with force", async () => {
    const caller = await signedInUser();
    await open(caller);
    await saved(
      await save(caller, "SA.WHY.1", { text: "won", lockVersion: 0 }),
    );
    const lost = await save(caller, "SA.WHY.1", {
      text: "lost",
      lockVersion: 0,
      force: true,
    });
    expect(lost.status).toBe(409);
    expect((await errorOf(lost)).code).toBe("CONFLICT");
  });

  test("saves an amount and its reason on an amount-with-reason question", async () => {
    const caller = await signedInUser();
    await open(caller);
    const answer = await saved(
      await save(caller, "SA.INCOME.1", {
        text: "Household costs",
        amount: 50000.5,
        lockVersion: 0,
      }),
    );
    expect(answer).toMatchObject({
      text: "Household costs",
      amount: 50000.5,
    });
    const cleared = await saved(
      await save(caller, "SA.INCOME.1", { amount: null, lockVersion: 1 }),
    );
    expect(cleared).toMatchObject({ text: "Household costs", amount: null });
  });

  test("refuses what design-spec 6.0.8 does not allow", async () => {
    const caller = await signedInUser();
    await open(caller);
    const cases: [string, unknown, ErrorCode, string | undefined][] = [
      [
        "SA.WHY.1",
        { amount: 100, lockVersion: 0 },
        "VALIDATION_FAILED",
        "amount",
      ],
      [
        "SA.INCOME.1",
        { amount: -1, lockVersion: 0 },
        "VALIDATION_FAILED",
        "amount",
      ],
      [
        "SA.INCOME.1",
        { amount: 1.005, lockVersion: 0 },
        "VALIDATION_FAILED",
        "amount",
      ],
      [
        "SA.WHY.1",
        { text: "x".repeat(20_001), lockVersion: 0 },
        "VALIDATION_FAILED",
        "text",
      ],
      [
        "SA.NOPE.1",
        { text: "x", lockVersion: 0 },
        "QUESTION_NOT_FOUND",
        undefined,
      ],
    ];
    for (const [key, body, code, path] of cases) {
      const response = await save(caller, key, body);
      const error = await errorOf(response);
      expect({ key, body, status: response.status, code: error.code }).toEqual({
        key,
        body,
        status: 422,
        code,
      });
      if (path !== undefined) expect(error.details?.[0]?.path).toBe(path);
    }
    // A null amount on a question without one is no amount at all.
    expect(
      (
        await saved(
          await save(caller, "SA.WHY.1", {
            text: "y",
            amount: null,
            lockVersion: 0,
          }),
        )
      ).amount,
    ).toBeNull();
  });

  test("checks the types of 11 a template may give a self-analysis question", async () => {
    const caller = await signedInUser();
    const home = await open(caller);
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.kind, "self_analysis"));
    if (template === undefined) throw new Error("No template");
    const [version] = await db
      .insert(templateVersions)
      .values({ templateId: template.id, versionNumber: 900 })
      .returning();
    if (version === undefined) throw new Error("No version");
    try {
      const [section] = await db
        .insert(templateSections)
        .values({
          templateVersionId: version.id,
          key: "NOW",
          title: "Now",
          sortOrder: 0,
        })
        .returning();
      if (section === undefined) throw new Error("No section");
      const question = (
        key: string,
        answerType: "short_text" | "choice" | "table",
        options: unknown = null,
      ) => ({
        templateVersionId: version.id,
        templateSectionId: section.id,
        questionKey: key,
        title: key,
        prompt: `${key}?`,
        answerType,
        options,
        sortOrder: 0,
      });
      await db.insert(templateQuestions).values([
        question("SA.NOW.1", "short_text"),
        question("SA.NOW.2", "choice", {
          kind: "choice",
          choices: ["Yes", "No"],
        }),
        question("SA.NOW.3", "table", {
          kind: "table",
          columns: [{ key: "a", label: "A", type: "text" }],
        }),
      ]);
      await db
        .update(selfAnalyses)
        .set({ templateVersionId: version.id })
        .where(eq(selfAnalyses.id, home.id));

      const refused = async (key: string, text: string, code: ErrorCode) => {
        const response = await save(caller, key, { text, lockVersion: 0 });
        expect({ key, status: response.status }).toEqual({ key, status: 422 });
        const error = await errorOf(response);
        expect(error.code).toBe(code);
        if (code === "VALIDATION_FAILED") {
          expect(error.details?.[0]?.path).toBe("text");
        }
      };
      await refused("SA.NOW.1", "x".repeat(201), "VALIDATION_FAILED");
      await refused("SA.NOW.2", "Maybe", "INVALID_CHOICE");
      await refused("SA.NOW.3", "x", "NOT_EDITABLE");
      // Questions of the version it no longer pins are not there to answer.
      await refused("SA.WHY.1", "x", "QUESTION_NOT_FOUND");
      expect(
        (
          await saved(
            await save(caller, "SA.NOW.2", { text: "Yes", lockVersion: 0 }),
          )
        ).text,
      ).toBe("Yes");
    } finally {
      await db.delete(selfAnalyses).where(eq(selfAnalyses.id, home.id));
      await db
        .delete(templateVersions)
        .where(eq(templateVersions.id, version.id));
    }
  });

  test("starts nothing with an answer to a question its display condition hides", async () => {
    const caller = await signedInUser();
    const home = await open(caller);
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.kind, "self_analysis"));
    if (template === undefined) throw new Error("No template");
    const [version] = await db
      .insert(templateVersions)
      .values({ templateId: template.id, versionNumber: 903 })
      .returning();
    if (version === undefined) throw new Error("No version");
    try {
      const [section] = await db
        .insert(templateSections)
        .values({
          templateVersionId: version.id,
          key: "NOW",
          title: "Now",
          sortOrder: 0,
        })
        .returning();
      if (section === undefined) throw new Error("No section");
      await db.insert(templateQuestions).values([
        {
          templateVersionId: version.id,
          templateSectionId: section.id,
          questionKey: "SA.NOW.1",
          title: "SA.NOW.1",
          prompt: "Ready?",
          answerType: "choice",
          options: { kind: "choice", choices: ["Yes", "No"] },
          sortOrder: 0,
        },
        {
          templateVersionId: version.id,
          templateSectionId: section.id,
          questionKey: "SA.NOW.2",
          title: "SA.NOW.2",
          prompt: "Why now?",
          answerType: "long_text",
          displayCondition: { "SA.NOW.1": ["Yes"] },
          sortOrder: 1,
        },
      ]);
      await db
        .update(selfAnalyses)
        .set({ templateVersionId: version.id })
        .where(eq(selfAnalyses.id, home.id));

      await saved(
        await save(caller, "SA.NOW.2", { text: "Hidden", lockVersion: 0 }),
      );
      expect(await open(caller)).toMatchObject({
        status: "not_started",
        answered: 0,
        total: 1,
      });
      // Answering what shows it counts both (design-spec 6.11).
      await saved(
        await save(caller, "SA.NOW.1", { text: "Yes", lockVersion: 0 }),
      );
      expect(await open(caller)).toMatchObject({
        status: "in_progress",
        answered: 2,
        total: 2,
      });
    } finally {
      await db.delete(selfAnalyses).where(eq(selfAnalyses.id, home.id));
      await db
        .delete(templateVersions)
        .where(eq(templateVersions.id, version.id));
    }
  });

  test("keeps a done self-analysis done, and an empty first save starts nothing", async () => {
    const caller = await signedInUser();
    await open(caller);
    const nothing = await saved(
      await save(caller, "SA.WHY.1", { text: "  ", lockVersion: 0 }),
    );
    expect(nothing.lockVersion).toBe(0);
    expect((await open(caller)).status).toBe("not_started");

    await doneSelfAnalysis(caller);
    await saved(await save(caller, "SA.WHY.1", { text: "", lockVersion: 1 }));
    expect(await open(caller)).toMatchObject({ status: "done", answered: 2 });
  });

  test("saves nothing for an account deleted while the request waits", async () => {
    const caller = await signedInUser();
    const home = await open(caller);
    const response = await duringAccountDeletion(db, caller.user.id, () =>
      save(caller, "SA.WHY.1", { text: "x", lockVersion: 0 }),
    );
    expect(response.status).toBe(401);
    const rows = await db
      .select()
      .from(selfAnalysisAnswers)
      .where(eq(selfAnalysisAnswers.selfAnalysisId, home.id));
    expect(rows).toEqual([]);
  });
});

describe("S4 POST /api/v1/me/self-analysis/complete・/reopen", () => {
  test("asks to confirm empty questions, then marks it done", async () => {
    const caller = await signedInUser();
    await open(caller);
    await saved(await save(caller, "SA.WHY.1", { text: "a", lockVersion: 0 }));

    for (const body of [null, {}, { confirmEmpty: false }]) {
      const response = await call(caller, "POST", "/complete", body);
      expect(response.status).toBe(409);
      expect(await errorOf(response)).toMatchObject({
        code: "HAS_EMPTY_QUESTIONS",
        emptyCount: 2,
      });
    }

    const done = await homeOf(
      await call(caller, "POST", "/complete", { confirmEmpty: true }),
    );
    expect(done).toMatchObject({ status: "done", answered: 1 });
    expect(done.completedAt).not.toBeNull();

    const again = await homeOf(await call(caller, "POST", "/complete", null));
    expect(again.completedAt).toBe(done.completedAt);
  });

  test("reopens a done one, keeping its shares; leaves others as they are", async () => {
    const caller = await signedInUser();
    const team = await teamOf(caller, "member");
    await doneSelfAnalysis(caller);
    await homeOf(
      await call(caller, "PUT", "/shares", { workspaceIds: [team.id] }),
    );

    const reopened = await homeOf(await call(caller, "POST", "/reopen", null));
    expect(reopened).toMatchObject({
      status: "in_progress",
      completedAt: null,
      shares: [{ workspace: { id: team.id, name: team.name } }],
    });
    const again = await homeOf(await call(caller, "POST", "/reopen", null));
    expect(again.status).toBe("in_progress");

    // Only the three answers of doneSelfAnalysis: the status and the shares are not
    // items the history records (design-spec 6.0.5).
    expect(await historyOf(reopened.id)).toEqual([
      "create",
      "create",
      "create",
    ]);

    const fresh = await signedInUser();
    await open(fresh);
    expect(
      (await homeOf(await call(fresh, "POST", "/reopen", null))).status,
    ).toBe("not_started");
  });
});

describe("S5 PUT /api/v1/me/self-analysis/shares", () => {
  test("adds and removes shares once done, and moves the workspaces' last activity", async () => {
    const caller = await signedInUser();
    const a = await teamOf(caller, "owner");
    const b = await teamOf(caller, "member");
    await doneSelfAnalysis(caller);
    const long = new Date("2026-01-01T00:00:00.000Z");
    const resetLastActive = () =>
      db
        .update(workspaces)
        .set({ lastActiveAt: long })
        .where(inArray(workspaces.id, [a.id, b.id]));
    const lastActive = async () =>
      Object.fromEntries(
        (
          await db
            .select({ id: workspaces.id, at: workspaces.lastActiveAt })
            .from(workspaces)
            .where(inArray(workspaces.id, [a.id, b.id]))
        ).map((row) => [row.id === a.id ? "a" : "b", row.at?.getTime()]),
      );

    await resetLastActive();
    const both = await homeOf(
      await call(caller, "PUT", "/shares", { workspaceIds: [a.id, b.id] }),
    );
    // Shared in one request: by workspace id.
    expect(both.shares.map((share) => share.workspace.id)).toEqual(
      [a.id, b.id].sort(),
    );
    const shared = await lastActive();
    expect(shared.a).toBeGreaterThan(long.getTime());
    expect(shared.b).toBeGreaterThan(long.getTime());

    // Answers and the status belong to no workspace (SDD 5.8 S5).
    await resetLastActive();
    await saved(await save(caller, "SA.WHY.1", { text: "c", lockVersion: 1 }));
    await homeOf(await call(caller, "POST", "/reopen", null));
    await homeOf(
      await call(caller, "POST", "/complete", { confirmEmpty: true }),
    );
    expect(await lastActive()).toEqual({
      a: long.getTime(),
      b: long.getTime(),
    });

    const onlyB = await homeOf(
      await call(caller, "PUT", "/shares", { workspaceIds: [b.id] }),
    );
    expect(onlyB.shares).toEqual([
      { workspace: { id: b.id, name: b.name }, sharedAt: expect.any(String) },
    ]);
    // Only the workspace whose share went.
    const removed = await lastActive();
    expect(removed.a).toBeGreaterThan(long.getTime());
    expect(removed.b).toBe(long.getTime());
    // The same set changes no share.
    await resetLastActive();
    await homeOf(
      await call(caller, "PUT", "/shares", { workspaceIds: [b.id] }),
    );
    expect(await lastActive()).toEqual({
      a: long.getTime(),
      b: long.getTime(),
    });
    expect(await historyOf(onlyB.id)).toEqual([
      "create",
      "create",
      "create",
      "update",
    ]);

    // Shared again, it comes after the share that stayed.
    const again = await homeOf(
      await call(caller, "PUT", "/shares", { workspaceIds: [a.id, b.id] }),
    );
    expect(again.shares.map((share) => share.workspace.id)).toEqual([
      b.id,
      a.id,
    ]);
  });

  test("keeps the comments of a share it removes, and shows them once shared again", async () => {
    const caller = await signedInUser();
    const team = await teamOf(caller, "member");
    const home = await doneSelfAnalysis(caller);
    const first = await homeOf(
      await call(caller, "PUT", "/shares", { workspaceIds: [team.id] }),
    );
    await db.insert(comments).values({
      workspaceId: team.id,
      containerType: "self_analysis",
      containerId: home.id,
      sectionKey: "WHY",
      targetType: "self_analysis_answer",
      targetId: home.id,
      targetKey: "SA.WHY.1",
      authorId: caller.user.id,
      body: "Why this?",
    });
    const counts = async () =>
      selfAnalysisSectionSchema
        .parse(await (await call(caller, "GET", "/sections/WHY")).json())
        .answers.map((answer) => answer.commentCounts);

    await homeOf(await call(caller, "PUT", "/shares", { workspaceIds: [] }));
    expect(await counts()).toEqual([[], []]);
    const kept = await db
      .select({ id: comments.id })
      .from(comments)
      .where(eq(comments.containerId, home.id));
    expect(kept).toHaveLength(1);

    const again = await homeOf(
      await call(caller, "PUT", "/shares", { workspaceIds: [team.id] }),
    );
    expect(Date.parse(again.shares[0]?.sharedAt ?? "")).toBeGreaterThan(
      Date.parse(first.shares[0]?.sharedAt ?? ""),
    );
    expect(await counts()).toEqual([
      [{ workspaceId: team.id, workspaceName: team.name, count: 1 }],
      [{ workspaceId: team.id, workspaceName: team.name, count: 0 }],
    ]);
  });

  test("adds only when done, and removes at any time", async () => {
    const caller = await signedInUser();
    const team = await teamOf(caller, "member");
    await doneSelfAnalysis(caller);
    await homeOf(
      await call(caller, "PUT", "/shares", { workspaceIds: [team.id] }),
    );
    await homeOf(await call(caller, "POST", "/reopen", null));
    const other = await teamOf(caller, "owner");

    const adding = await call(caller, "PUT", "/shares", {
      workspaceIds: [team.id, other.id],
    });
    expect(adding.status).toBe(422);
    expect((await errorOf(adding)).code).toBe("MUST_BE_DONE_TO_SHARE");

    const kept = await homeOf(
      await call(caller, "PUT", "/shares", { workspaceIds: [team.id] }),
    );
    expect(kept.shares).toHaveLength(1);
    const removed = await homeOf(
      await call(caller, "PUT", "/shares", { workspaceIds: [] }),
    );
    expect(removed.shares).toEqual([]);
  });

  test("shares only with team workspaces the caller is an Owner or Member of", async () => {
    const caller = await signedInUser();
    const viewing = await teamOf(caller, "viewer");
    const personal = await fixtures.createWorkspace({
      isPersonal: true,
      createdById: caller.user.id,
    });
    await fixtures.addMember(personal.id, caller.user.id, "owner");
    const othersPersonal = await fixtures.createWorkspace({ isPersonal: true });
    await fixtures.addMember(othersPersonal.id, caller.user.id, "member");
    const stranger = await fixtures.createWorkspace();
    await doneSelfAnalysis(caller);

    const refused = async (id: string) => {
      const response = await call(caller, "PUT", "/shares", {
        workspaceIds: [id],
      });
      expect({ id, status: response.status }).toEqual({ id, status: 422 });
      expect((await errorOf(response)).code).toBe("NOT_SHAREABLE");
    };
    const ids = [
      viewing.id,
      personal.id,
      othersPersonal.id,
      stranger.id,
      crypto.randomUUID(),
    ];
    for (const id of ids) await refused(id);
    // Checked before MUST_BE_DONE_TO_SHARE (SDD 5.8 S5).
    await homeOf(await call(caller, "POST", "/reopen", null));
    for (const id of ids) await refused(id);
  });

  test("reads a UUID in capitals as the same id", async () => {
    const caller = await signedInUser();
    const team = await teamOf(caller, "member");
    await doneSelfAnalysis(caller);
    const shared = await homeOf(
      await call(caller, "PUT", "/shares", {
        workspaceIds: [team.id.toUpperCase()],
      }),
    );
    expect(shared.shares.map((share) => share.workspace.id)).toEqual([team.id]);
  });

  test("refuses a body of ids outside the caller's workspaces, however many", async () => {
    const caller = await signedInUser();
    await doneSelfAnalysis(caller);
    const response = await call(caller, "PUT", "/shares", {
      workspaceIds: Array.from({ length: 2000 }, () => crypto.randomUUID()),
    });
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("NOT_SHAREABLE");
  });

  test("refuses a workspace twice and ids that are not UUIDs", async () => {
    const caller = await signedInUser();
    const team = await teamOf(caller, "member");
    await doneSelfAnalysis(caller);
    for (const [workspaceIds, path] of [
      [[team.id, team.id], "workspaceIds"],
      [[team.id, team.id.toUpperCase()], "workspaceIds"],
      [["nope"], "workspaceIds.0"],
    ] as const) {
      const response = await call(caller, "PUT", "/shares", { workspaceIds });
      expect(response.status).toBe(422);
      expect(await errorOf(response)).toMatchObject({
        code: "VALIDATION_FAILED",
        details: [{ path }],
      });
    }
  });

  test("lets in no share a demotion took away while the request waited", async () => {
    const caller = await signedInUser();
    const team = await teamOf(caller, "member");
    await doneSelfAnalysis(caller);

    const started: { response?: Promise<Response> } = {};
    await db.transaction(async (tx) => {
      await lockMembers(tx, team.id);
      started.response = call(caller, "PUT", "/shares", {
        workspaceIds: [team.id],
      });
      await untilBlockedBy(db, tx);
      await tx
        .update(memberships)
        .set({ role: "viewer" })
        .where(
          and(
            eq(memberships.workspaceId, team.id),
            eq(memberships.userId, caller.user.id),
          ),
        );
    });
    const response = await (started.response as Promise<Response>);
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("NOT_SHAREABLE");
    const shares = await db
      .select()
      .from(selfAnalysisShares)
      .where(eq(selfAnalysisShares.workspaceId, team.id));
    expect(shares).toEqual([]);
  });

  test("adds no share after a Reopen that held the self-analysis first", async () => {
    const caller = await signedInUser();
    const team = await teamOf(caller, "member");
    const home = await doneSelfAnalysis(caller);

    const started: { response?: Promise<Response> } = {};
    await db.transaction(async (tx) => {
      // What Reopen writes, holding the row the share then waits for.
      await tx
        .update(selfAnalyses)
        .set({ status: "in_progress", completedAt: null })
        .where(eq(selfAnalyses.id, home.id));
      started.response = call(caller, "PUT", "/shares", {
        workspaceIds: [team.id],
      });
      await untilBlockedBy(db, tx);
    });
    const response = await (started.response as Promise<Response>);
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("MUST_BE_DONE_TO_SHARE");
    const shares = await db
      .select()
      .from(selfAnalysisShares)
      .where(eq(selfAnalysisShares.selfAnalysisId, home.id));
    expect(shares).toEqual([]);
  });
});

describe("S1 PATCH, S4 and S5 for an account deleted while the request waits", () => {
  test("change nothing and answer 401 (SDD 7.1「停止・削除したユーザー」)", async () => {
    for (const [method, path, body] of [
      ["PATCH", "", { currency: "USD" }],
      ["POST", "/complete", { confirmEmpty: true }],
      ["POST", "/reopen", null],
      ["PUT", "/shares", { workspaceIds: [] }],
    ] as const) {
      const caller = await signedInUser();
      const team = await teamOf(caller, "member");
      const home = await doneSelfAnalysis(caller);
      await homeOf(
        await call(caller, "PUT", "/shares", { workspaceIds: [team.id] }),
      );
      // So that S4 complete has something to change too.
      if (path === "/complete") {
        await homeOf(await call(caller, "POST", "/reopen", null));
      }
      const state = async () => ({
        analysis: await db
          .select()
          .from(selfAnalyses)
          .where(eq(selfAnalyses.id, home.id)),
        shares: await db
          .select()
          .from(selfAnalysisShares)
          .where(eq(selfAnalysisShares.selfAnalysisId, home.id)),
      });
      const before = await state();

      const response = await duringAccountDeletion(db, caller.user.id, () =>
        call(caller, method, path, body),
      );
      expect({ path, status: response.status }).toEqual({ path, status: 401 });
      expect(await state()).toEqual(before);
    }
  });
});

describe("S6・S7 the members' self-analyses of a workspace", () => {
  /** A team whose Member shared a done self-analysis and whose Owner did not. */
  async function teamWithShares() {
    await fixtures.selfAnalysisVersion();
    const team = await fixtures.createTeam();
    const caller = (user: { id: string; email: string }) =>
      signIn(app, user.email, uniqueIp()).then((cookie) => ({
        user: { ...user },
        cookie,
      })) as Promise<Caller>;
    const owner = await caller(team.owner);
    const member = await caller(team.member);
    await doneSelfAnalysis(member);
    await homeOf(
      await call(member, "PUT", "/shares", {
        workspaceIds: [team.workspace.id],
      }),
    );
    await open(owner);
    await saved(
      await save(owner, "SA.WHY.1", { text: "Mine", lockVersion: 0 }),
    );
    return { ...team, ownerCaller: owner, memberCaller: member };
  }

  test("S6 lists the Owners and Members by name, with how far only the shared ones are", async () => {
    const team = await teamWithShares();
    // The Owner's is done and shared, but with another workspace.
    const other = await fixtures.createWorkspace();
    await fixtures.addMember(other.id, team.owner.id, "owner");
    await homeOf(
      await call(team.ownerCaller, "POST", "/complete", { confirmEmpty: true }),
    );
    await homeOf(
      await call(team.ownerCaller, "PUT", "/shares", {
        workspaceIds: [other.id],
      }),
    );
    const response = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/workspaces/${team.workspace.id}/self-analyses`,
        { cookie: team.ownerCaller.cookie },
      ),
    );
    expect(response.status).toBe(200);
    const list = memberSelfAnalysesSchema.parse(await response.json());
    expect(list.items).toEqual([
      {
        user: expect.objectContaining({ id: team.member.id }),
        shared: true,
        status: "done",
      },
      {
        user: expect.objectContaining({ id: team.owner.id }),
        shared: false,
        status: null,
      },
    ]);
  });

  test("S7 reads a shared self-analysis with this workspace's comment counts", async () => {
    const team = await teamWithShares();
    const analysis = (await open(team.memberCaller)).id;
    const elsewhere = await fixtures.createWorkspace();
    for (const workspaceId of [team.workspace.id, elsewhere.id]) {
      await db.insert(comments).values({
        workspaceId,
        containerType: "self_analysis",
        containerId: analysis,
        sectionKey: "INCOME",
        targetType: "self_analysis_answer",
        targetId: analysis,
        targetKey: "SA.INCOME.1",
        authorId: team.owner.id,
        body: "Is this enough?",
      });
    }

    // The ids in capitals name the same workspace and member.
    const response = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/workspaces/${team.workspace.id.toUpperCase()}/self-analyses/${team.member.id.toUpperCase()}`,
        { cookie: team.ownerCaller.cookie },
      ),
    );
    expect(response.status).toBe(200);
    const view = sharedSelfAnalysisSchema.parse(await response.json());
    expect(view).toMatchObject({
      id: analysis,
      user: { id: team.member.id, badge: null },
      status: "done",
      currency: "PHP",
    });
    expect(
      view.sections.map((section) => [section.key, section.answers]),
    ).toEqual([
      [
        "WHY",
        [
          { questionKey: "SA.WHY.1", text: "a", amount: null, commentCount: 0 },
          { questionKey: "SA.WHY.2", text: "b", amount: null, commentCount: 0 },
        ],
      ],
      [
        "INCOME",
        [
          {
            questionKey: "SA.INCOME.1",
            text: null,
            amount: 50000,
            commentCount: 1,
          },
        ],
      ],
    ]);
  });

  test("S7 reads the share and the answers at one moment", async () => {
    const team = await teamWithShares();
    const analysis = (await open(team.memberCaller)).id;
    const started: { response?: Promise<Response> } = {};
    await db.transaction(async (tx) => {
      // Holds S7 between its share check and its read of the answers, while the
      // member stops sharing and writes another answer.
      await tx.execute(
        sql`lock table ${selfAnalysisAnswers} in access exclusive mode`,
      );
      started.response = app.handle(
        apiRequest(
          "GET",
          `/api/v1/workspaces/${team.workspace.id}/self-analyses/${team.member.id}`,
          { cookie: team.ownerCaller.cookie },
        ),
      );
      await untilBlockedBy(db, tx);
      await tx
        .delete(selfAnalysisShares)
        .where(eq(selfAnalysisShares.selfAnalysisId, analysis));
      await tx
        .update(selfAnalysisAnswers)
        .set({ text: "Written after the share went" })
        .where(
          and(
            eq(selfAnalysisAnswers.selfAnalysisId, analysis),
            eq(selfAnalysisAnswers.questionKey, "SA.WHY.1"),
          ),
        );
    });
    const response = await (started.response as Promise<Response>);
    expect(response.status).toBe(200);
    const view = sharedSelfAnalysisSchema.parse(await response.json());
    expect(view.sections[0]?.answers[0]).toMatchObject({
      questionKey: "SA.WHY.1",
      text: "a",
    });
  });

  test("S7 refuses one not shared with this workspace, whoever it is", async () => {
    const team = await teamWithShares();
    const read = (userId: string) =>
      app.handle(
        apiRequest(
          "GET",
          `/api/v1/workspaces/${team.workspace.id}/self-analyses/${userId}`,
          { cookie: team.memberCaller.cookie },
        ),
      );

    // A user who does not exist reads like one who has not shared, so S7 tells
    // nothing about who has an account.
    for (const userId of [
      team.owner.id,
      team.viewer.id,
      team.admin.id,
      crypto.randomUUID(),
    ]) {
      const response = await read(userId);
      expect(response.status).toBe(403);
      expect((await errorOf(response)).code).toBe("NOT_SHARED");
    }
    const malformed = await read("not-a-uuid");
    expect(malformed.status).toBe(404);
    expect((await errorOf(malformed)).code).toBe("NOT_FOUND");

    // Shared elsewhere is not shared here.
    const other = await fixtures.createWorkspace();
    await fixtures.addMember(other.id, team.owner.id, "owner");
    await fixtures.addMember(other.id, team.member.id, "member");
    const otherRead = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/workspaces/${other.id}/self-analyses/${team.member.id}`,
        { cookie: team.ownerCaller.cookie },
      ),
    );
    expect(otherRead.status).toBe(403);
    expect((await errorOf(otherRead)).code).toBe("NOT_SHARED");
  });
});
