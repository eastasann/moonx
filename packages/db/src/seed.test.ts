import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  computeEconomics,
  evaluateValidation,
  fauState,
  ideaStage,
  scenarioOf,
} from "@moonx/domain";
import { verifyPassword } from "better-auth/crypto";
import { SQL } from "bun";
import { and, asc, eq, getTableName, is, isNull } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { connectDatabase } from "./client";
import { hashInvitationToken } from "./invitations";
import * as schema from "./schema";
import {
  accounts,
  assumptions,
  businessPlans,
  changeHistory,
  commentMentions,
  comments,
  competitors,
  costItems,
  decisionLogEntries,
  economicsInputs,
  evidenceLinks,
  executionItems,
  ideas,
  invitations,
  memberships,
  notifications,
  planAnswers,
  planVersions,
  researchLogEntries,
  risks,
  selfAnalyses,
  selfAnalysisAnswers,
  selfAnalysisShares,
  templateQuestions,
  templateSections,
  templates,
  templateVersions,
  users,
  validationAnswers,
  validations,
  workspaces,
} from "./schema";
import {
  BCDX_WORKSPACE_ID,
  personalWorkspaceId,
  SEED_INVITATION_TOKENS,
  SEED_PASSWORD,
  SEED_USERS,
  seedDatabase,
  seedId,
  selfAnalysisId,
  userId,
} from "./seed/index";
import {
  prepareTestDatabase,
  quoteIdentifier,
  testDatabaseName,
} from "./test-database";
import { loadValidation } from "./validation-state";

const base = process.env.DATABASE_URL_TEST;
if (base === undefined || base === "") {
  throw new Error("DATABASE_URL_TEST is required for make test-api");
}
// A database of its own: the seed empties every table, which other tests' rows in
// DATABASE_URL_TEST would not survive.
const scratch = new URL(base);
scratch.pathname = `/${testDatabaseName(base)}_seed_test`;
const url = scratch.toString();
const { db, close } = connectDatabase(url);

/** The moment the seed runs, so dates can be checked exactly. */
const NOW = new Date("2026-10-14T03:00:00.000Z");
const TODAY = "2026-10-14"; // In Asia/Manila
const daysFromToday = (days: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

// Times follow the run, and each run salts the password hashes anew.
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const timeless = (value: unknown): unknown => {
  if (typeof value === "string") return TIME.test(value) ? "<time>" : value;
  if (Array.isArray(value)) return value.map(timeless);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "password")
        .map(([key, inner]) => [key, timeless(inner)]),
    );
  return value;
};

/** Every row of every table by id, without what differs between runs. */
const allRows = async () => {
  const tables: Record<string, Record<string, unknown>> = {};
  for (const value of Object.values(schema) as unknown[]) {
    if (!is(value, PgTable)) continue;
    const name = getTableName(value);
    const rows = await db.execute<{ id: string; row: Record<string, unknown> }>(
      `select id::text, row_to_json(t) as row from "${name}" t`,
    );
    tables[name] = Object.fromEntries(
      rows.map((row) => [row.id, timeless(row.row)]),
    );
  }
  return tables;
};

/**
 * Runs `make db-seed`'s script with `env` added to this process's environment. Bun would
 * read the repository's .env into the child, putting back an APP_ENV the test leaves out.
 */
const runSeedScript = async (env: Record<string, string | undefined>) => {
  const child = Bun.spawn(
    ["bun", "--no-env-file", join(import.meta.dir, "seed.ts")],
    {
      env: { ...process.env, DATABASE_URL: url, ...env },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [code, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  return { code, stderr };
};

beforeAll(async () => {
  await prepareTestDatabase(url);
});

afterAll(async () => {
  await close();
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

describe("make db-seed", () => {
  test("refuses to run unless APP_ENV is local, before touching the database", async () => {
    const sentinel = {
      id: crypto.randomUUID(),
      email: "sentinel@example.com",
      displayName: "Sentinel",
    };
    await db.insert(users).values(sentinel);
    for (const appEnv of ["staging", "production", " ", undefined]) {
      const { code, stderr } = await runSeedScript({ APP_ENV: appEnv });
      expect(code).toBe(1);
      expect(stderr).toContain("APP_ENV=local");
    }
    expect(
      (await db.select({ id: users.id }).from(users)).map((u) => u.id),
    ).toEqual([sentinel.id]);
  });

  test("seeds with APP_ENV=local, and a second run writes the same rows under the same ids", async () => {
    const { code, stderr } = await runSeedScript({ APP_ENV: "local" });
    if (code !== 0) throw new Error(`make db-seed failed: ${stderr}`);
    const first = await allRows();
    expect(Object.keys(first.users ?? {})).toHaveLength(5);
    await seedDatabase(db);
    expect(await allRows()).toEqual(first);

    // The rest of this file reads a run made at a fixed moment.
    await seedDatabase(db, { now: NOW });
  });
});

describe("templates (design-spec 8.4)", () => {
  const versionsOf = async (
    kind: "self_analysis" | "validation" | "business_plan",
  ) =>
    db
      .select({
        id: templateVersions.id,
        versionNumber: templateVersions.versionNumber,
        status: templateVersions.status,
        aiPrompt: templateVersions.aiPrompt,
      })
      .from(templateVersions)
      .innerJoin(templates, eq(templates.id, templateVersions.templateId))
      .where(eq(templates.kind, kind))
      .orderBy(asc(templateVersions.versionNumber));
  const keysOf = async (versionId: string) =>
    (
      await db
        .select({
          key: templateQuestions.questionKey,
          section: templateSections.key,
        })
        .from(templateQuestions)
        .innerJoin(
          templateSections,
          eq(templateSections.id, templateQuestions.templateSectionId),
        )
        .where(eq(templateQuestions.templateVersionId, versionId))
        .orderBy(
          asc(templateSections.sortOrder),
          asc(templateQuestions.sortOrder),
        )
    ).map((row) => row.key);
  const bcdxKeys = async (file: string) =>
    (
      (await Bun.file(
        join(import.meta.dir, "../../../data/templates/bcdx", file),
      ).json()) as { sections: { questions: { key: string }[] }[] }
    ).sections.flatMap((section) => section.questions.map((q) => q.key));

  test("all three BCDX files are v1, published as the files have them", async () => {
    for (const [kind, file] of [
      ["self_analysis", "self-analysis.json"],
      ["validation", "validation.json"],
      ["business_plan", "plan.json"],
    ] as const) {
      const [v1] = await versionsOf(kind);
      expect(v1?.versionNumber).toBe(1);
      expect(v1?.status).toBe("published");
      expect(await keysOf(v1?.id ?? "")).toEqual(await bcdxKeys(file));
    }
    expect((await versionsOf("self_analysis")).length).toBe(1);
    expect((await versionsOf("business_plan")).length).toBe(1);
  });

  test("validation v2 adds V.01.REACH, published; v3 adds V.10.NEXT_STEP, a draft", async () => {
    const [v1, v2, v3] = await versionsOf("validation");
    expect([v2?.status, v3?.status]).toEqual(["published", "draft"]);
    const v1Keys = await keysOf(v1?.id ?? "");
    const v2Keys = await keysOf(v2?.id ?? "");
    const lastOf01 = v1Keys.filter((key) => key.startsWith("V.01.")).length;
    expect(v2Keys).toEqual([
      ...v1Keys.slice(0, lastOf01),
      "V.01.REACH",
      ...v1Keys.slice(lastOf01),
    ]);
    expect(await keysOf(v3?.id ?? "")).toEqual([...v2Keys, "V.10.NEXT_STEP"]);
  });

  test("validation and plan templates have no AI prompt", async () => {
    for (const version of [
      ...(await versionsOf("validation")),
      ...(await versionsOf("business_plan")),
    ])
      expect(version.aiPrompt).toBe("");
    expect((await versionsOf("self_analysis"))[0]?.aiPrompt).not.toBe("");
  });

  test("only Mobile Bike Repair is on v2", async () => {
    const [, v2] = await versionsOf("validation");
    const rows = await db
      .select({ name: ideas.name, version: validations.templateVersionId })
      .from(validations)
      .innerJoin(ideas, eq(ideas.id, validations.ideaId));
    expect(
      rows.filter((row) => row.version === v2?.id).map((r) => r.name),
    ).toEqual(["Mobile Bike Repair"]);
  });
});

describe("users and workspaces (design-spec 8.1)", () => {
  test("five users sign in with the demo password", async () => {
    const rows = await db
      .select({
        email: users.email,
        name: users.displayName,
        isAdmin: users.isAdmin,
        providerId: accounts.providerId,
        accountId: accounts.accountId,
        id: users.id,
        hash: accounts.password,
      })
      .from(users)
      .innerJoin(accounts, eq(accounts.userId, users.id));
    expect(
      rows.map((row) => [row.email, row.name, row.isAdmin]).sort(),
    ).toEqual(
      [
        ["admin@moonx.example", "Moonx Admin", true],
        ["ana@bcdx.example", "Ana Villanueva", false],
        ["grace@advisor.example", "Grace Tan", false],
        ["kenji@bcdx.example", "Kenji Mori", false],
        ["paolo@bcdx.example", "Paolo Gonzaga", false],
      ].sort(),
    );
    for (const row of rows) {
      expect(row.providerId).toBe("credential");
      expect(row.accountId).toBe(row.id);
      expect(
        await verifyPassword({ hash: row.hash ?? "", password: SEED_PASSWORD }),
      ).toBe(true);
    }
  });

  test("BCDX has the four roles; everyone has a personal workspace", async () => {
    const [bcdx] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, BCDX_WORKSPACE_ID));
    expect(bcdx).toMatchObject({
      name: "BCDX",
      currency: "PHP",
      isPersonal: false,
    });
    const roles = await db
      .select({ userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.workspaceId, BCDX_WORKSPACE_ID));
    expect(Object.fromEntries(roles.map((r) => [r.userId, r.role]))).toEqual({
      [userId("ana")]: "owner",
      [userId("kenji")]: "member",
      [userId("paolo")]: "member",
      [userId("grace")]: "viewer",
    });
    for (const key of Object.keys(SEED_USERS) as (keyof typeof SEED_USERS)[]) {
      const [personal] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, personalWorkspaceId(key)));
      expect(personal).toMatchObject({
        name: `${SEED_USERS[key].displayName}'s workspace`,
        isPersonal: true,
        createdById: userId(key),
      });
      expect(
        await db.$count(
          memberships,
          and(
            eq(memberships.workspaceId, personalWorkspaceId(key)),
            eq(memberships.userId, userId(key)),
            eq(memberships.role, "owner"),
          ),
        ),
      ).toBe(1);
      // U1 lists memberships in the order they were made, the personal one first.
      const joined = await db
        .select({
          workspaceId: memberships.workspaceId,
          createdAt: memberships.createdAt,
        })
        .from(memberships)
        .where(eq(memberships.userId, userId(key)))
        .orderBy(asc(memberships.createdAt));
      expect(joined[0]?.workspaceId).toBe(personalWorkspaceId(key));
      expect(joined[1]?.createdAt.getTime() ?? Infinity).toBeGreaterThan(
        joined[0]?.createdAt.getTime() ?? Infinity,
      );
    }
  });

  test("one pending and one expired invitation, found by their tokens", async () => {
    const rows = await db.select().from(invitations);
    expect(rows).toHaveLength(2);
    const byToken = (token: string) =>
      rows.find((row) => row.tokenHash === hashInvitationToken(token));
    const pending = byToken(SEED_INVITATION_TOKENS.pending);
    const expired = byToken(SEED_INVITATION_TOKENS.expired);
    expect(pending).toMatchObject({
      email: "new.member@bcdx.example",
      role: "member",
      status: "pending",
      workspaceId: BCDX_WORKSPACE_ID,
    });
    expect(pending?.expiresAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(expired).toMatchObject({
      email: "late.joiner@bcdx.example",
      role: "member",
      status: "pending",
    });
    expect(expired?.expiresAt.getTime()).toBeLessThan(NOW.getTime());
  });

  test("self-analyses: Ana and Paolo done and shared, Kenji 21/36, Grace not started, Admin none", async () => {
    const [selfAnalysisVersion] = await db
      .select({ id: templateVersions.id })
      .from(templateVersions)
      .innerJoin(templates, eq(templates.id, templateVersions.templateId))
      .where(eq(templates.kind, "self_analysis"));
    const total = await db.$count(
      templateQuestions,
      eq(templateQuestions.templateVersionId, selfAnalysisVersion?.id ?? ""),
    );
    expect(total).toBe(36);
    const expected = {
      ana: { status: "done", answers: 36, shared: true },
      kenji: { status: "in_progress", answers: 21, shared: false },
      paolo: { status: "done", answers: 36, shared: true },
      grace: { status: "not_started", answers: 0, shared: false },
    } as const;
    for (const [user, want] of Object.entries(expected)) {
      const id = selfAnalysisId(user as keyof typeof expected);
      const [row] = await db
        .select()
        .from(selfAnalyses)
        .where(eq(selfAnalyses.id, id));
      expect(row?.status).toBe(want.status);
      expect(
        await db.$count(
          selfAnalysisAnswers,
          eq(selfAnalysisAnswers.selfAnalysisId, id),
        ),
      ).toBe(want.answers);
      const shares = await db
        .select({ workspaceId: selfAnalysisShares.workspaceId })
        .from(selfAnalysisShares)
        .where(eq(selfAnalysisShares.selfAnalysisId, id));
      expect(shares.map((s) => s.workspaceId)).toEqual(
        want.shared ? [BCDX_WORKSPACE_ID] : [],
      );
    }
    expect(
      await db.$count(selfAnalyses, eq(selfAnalyses.userId, userId("admin"))),
    ).toBe(0);
  });
});

/** An idea by name, with its validation evaluated as an Owner sees it. */
const ideaNamed = async (name: string) => {
  const [idea] = await db.select().from(ideas).where(eq(ideas.name, name));
  if (idea === undefined) throw new Error(`No idea ${name}`);
  const [validation] = await db
    .select()
    .from(validations)
    .where(eq(validations.ideaId, idea.id));
  if (validation === undefined) throw new Error(`No validation for ${name}`);
  const loaded = await loadValidation(db, validation.id);
  const evaluation = evaluateValidation(loaded.state, {
    workspaceId: idea.workspaceId,
    ideaId: idea.id,
    canWrite: true,
  });
  const plans = await db
    .select()
    .from(businessPlans)
    .where(
      and(eq(businessPlans.ideaId, idea.id), isNull(businessPlans.deletedAt)),
    )
    .orderBy(asc(businessPlans.name));
  const entries = await db
    .select()
    .from(decisionLogEntries)
    .where(eq(decisionLogEntries.ideaId, idea.id))
    .orderBy(asc(decisionLogEntries.recordedAt));
  const latestGoNoGo = (planId: string) =>
    entries
      .filter((e) => e.kind === "go_no_go" && e.businessPlanId === planId)
      .at(-1)?.value ?? null;
  const stage = ideaStage(
    plans.map((plan) => ({
      archived: plan.archivedAt !== null,
      latestGoNoGo: latestGoNoGo(plan.id) as "launch" | "delay" | "stop" | null,
    })),
  );
  return { idea, validation, loaded, evaluation, plans, entries, stage };
};

const checkStates = (
  evaluation: Awaited<ReturnType<typeof ideaNamed>>["evaluation"],
) =>
  Object.fromEntries(
    evaluation.checks.map((check) => [check.key, check.state]),
  );
const ALL_DONE = {
  competitors: "done",
  local_price: "done",
  costs: "done",
  break_even: "done",
  permits: "done",
  demand_signal: "done",
} as const;

describe("ideas (design-spec 8.2)", () => {
  test("proposer, decision and stage match the table", async () => {
    const table = [
      ["Piaya Gift Box Delivery", "ana", "proceed", "planning"],
      ["Piaya Gift Box (Corporate)", "kenji", null, "validation"],
      ["Bacolod Health Bowl", "kenji", "hold", "validation"],
      ["Student Study Café", "paolo", "proceed", "launch_prep"],
      ["Bacolod Night Market Stall", "ana", "hold", "planning"],
      ["Laundry Pickup", "paolo", "drop", "validation"],
      ["Sari-sari Store Delivery", "kenji", null, "validation"],
      ["Mobile Bike Repair", "ana", null, "validation"],
    ] as const;
    expect(await db.$count(ideas)).toBe(table.length);
    for (const [name, proposer, decision, stage] of table) {
      const found = await ideaNamed(name);
      expect([
        name,
        found.idea.proposerId,
        found.idea.latestDecision,
        found.stage,
      ]).toEqual([name, userId(proposer), decision, stage]);
      // The copy of the latest validation decision on the idea row agrees with the log.
      const latest = found.entries
        .filter((e) => e.kind === "validation_decision")
        .at(-1);
      expect(latest?.value ?? null).toBe(decision);
    }
  });

  test("Piaya: six checks done, and the numbers of 8.3", async () => {
    const { evaluation, loaded } = await ideaNamed("Piaya Gift Box Delivery");
    expect(checkStates(evaluation)).toEqual(ALL_DONE);
    const economics = computeEconomics({
      costRows: loaded.state.costRows,
      inputs: Object.fromEntries(
        loaded.state.economicsInputs.map((i) => [
          i.fieldKey,
          { value: i.value, fau: i.fau },
        ]),
      ),
    });
    expect(economics).toEqual(evaluation.economics);
    const close = (value: number | null, expected: number, digits = 2) =>
      expect(value).toBeCloseTo(expected, digits);
    close(economics.variableCostPerUnit.value, 218.5);
    close(economics.contributionMargin.value, 231.5);
    close(economics.contributionMarginRate.value, 0.5144, 4);
    expect(economics.totals.monthlyFixed.amount).toBe(41700);
    close(economics.breakEvenUnitsMonth.value, 180.13);
    close(economics.breakEvenUnitsDay.value, 6.93);
    expect(Math.round(economics.breakEvenRevenue.value ?? 0)).toBe(81058);
    close(economics.targetMarginUnitsMonth.value, 254.3, 1);
    close(economics.targetMarginUnitsDay.value, 9.8, 1);
    expect(economics.defaultsUsed.targetMargin).toBe(true);
    const expected = scenarioOf(economics, "expected");
    expect(expected.unitsPerMonth.value).toBe(260);
    expect(expected.revenue.value).toBe(117000);
    close(expected.variableCostTotal.value, 56810);
    close(expected.operatingProfit.value, 18490);
    close(expected.operatingMargin.value, 0.158, 3);
    const conservative = scenarioOf(economics, "conservative");
    expect(conservative.unitsPerMonth.value).toBe(156);
    expect(conservative.revenue.value).toBe(70200);
    close(conservative.operatingProfit.value, -5586);
    expect(economics.totals.initial.amount).toBe(169500);
    close(economics.paybackMonths.value, 9.17);
    close(economics.simpleRoi.value, 1.309, 3);
  });

  test("Piaya Gift Box (Corporate): a duplicate of Piaya at ₱650", async () => {
    const piaya = await ideaNamed("Piaya Gift Box Delivery");
    const copy = await ideaNamed("Piaya Gift Box (Corporate)");
    expect(copy.idea.duplicatedFromId).toBe(piaya.idea.id);
    expect(copy.plans).toEqual([]);
    expect(copy.entries).toEqual([]);
    const strip = (state: typeof piaya.loaded.state) => ({
      ...state,
      costRows: state.costRows.map(({ id: _id, ...row }) => row),
      economicsInputs: state.economicsInputs.filter(
        (i) => i.fieldKey !== "selling_price",
      ),
    });
    expect(strip(copy.loaded.state)).toEqual(strip(piaya.loaded.state));
    const price = (state: typeof piaya.loaded.state) =>
      state.economicsInputs.find((i) => i.fieldKey === "selling_price")?.value;
    expect([price(piaya.loaded.state), price(copy.loaded.state)]).toEqual([
      450, 650,
    ]);
    // Research logs are copied with their recorders (6.8), and the copied evidence
    // points at the copies.
    const logsOf = (validationId: string) =>
      db
        .select({
          id: researchLogEntries.id,
          topic: researchLogEntries.topic,
          createdById: researchLogEntries.createdById,
        })
        .from(researchLogEntries)
        .where(
          and(
            eq(researchLogEntries.validationId, validationId),
            isNull(researchLogEntries.deletedAt),
          ),
        )
        .orderBy(asc(researchLogEntries.topic));
    const copiedLogs = await logsOf(copy.validation.id);
    expect(copiedLogs).toHaveLength(7);
    const recorders = (logs: typeof copiedLogs) =>
      logs.map((log) => [log.topic, log.createdById]);
    expect(recorders(copiedLogs)).toEqual(
      recorders(await logsOf(piaya.validation.id)),
    );
    // Kenji duplicated it; the logs stay recorded by others too.
    expect(copiedLogs.some((log) => log.createdById !== userId("kenji"))).toBe(
      true,
    );
    const copiedLogIds = new Set(copiedLogs.map((log) => log.id));
    const links = await db
      .select({ logId: evidenceLinks.researchLogEntryId })
      .from(evidenceLinks)
      .where(eq(evidenceLinks.validationId, copy.validation.id));
    const logLinks = links.filter((link) => link.logId !== null);
    expect(logLinks.length).toBeGreaterThan(0);
    expect(logLinks.every((link) => copiedLogIds.has(link.logId ?? ""))).toBe(
      true,
    );
    expect(
      await db.$count(comments, eq(comments.containerId, copy.validation.id)),
    ).toBe(0);
    const batch = await db
      .select({ source: changeHistory.source, batchId: changeHistory.batchId })
      .from(changeHistory)
      .where(eq(changeHistory.containerId, copy.idea.id));
    expect(
      batch.some((row) => row.source === "duplicate" && row.batchId !== null),
    ).toBe(true);
  });

  test("Bacolod Health Bowl: costs partial, permits not started, 3 unclassified, 1 Fact without evidence", async () => {
    const { evaluation, loaded, validation, entries } = await ideaNamed(
      "Bacolod Health Bowl",
    );
    expect(checkStates(evaluation)).toEqual({
      competitors: "done",
      local_price: "done",
      costs: "partial",
      break_even: "done",
      permits: "not_started",
      demand_signal: "done",
    });
    const initial = loaded.state.costRows.filter(
      (row) => row.category === "initial",
    );
    expect(initial.filter((row) => row.fau === "unknown")).toHaveLength(3);
    expect(evaluation.economics.totals.initial).toMatchObject({
      isLowerBound: true,
      unknownRows: 3,
      emptyRows: 1,
    });
    expect(
      loaded.state.costRows.find(
        (row) => row.templateKey === "variable.materials",
      ),
    ).toMatchObject({ inputMode: "percent_of_price", percent: 0.35 });
    expect(
      loaded.state.economicsInputs.find((i) => i.fieldKey === "selling_price")
        ?.value,
    ).toBe(220);
    expect(evaluation.economics.totals.monthlyFixed.amount).not.toBeNull();

    const states = Object.fromEntries(
      loaded.state.answers.map((a) => [
        a.questionKey,
        fauState({ ...a, hasValue: (a.text ?? "").trim() !== "" }),
      ]),
    );
    expect(
      Object.entries(states)
        .filter(([, state]) => state === "unclassified")
        .map(([key]) => key)
        .sort(),
    ).toEqual(["V.01.BEHAVIOR", "V.01.SWITCHING", "V.02.DRIVERS"]);
    expect(
      Object.entries(states).filter(
        ([, state]) => state === "fact_no_evidence",
      ),
    ).toEqual([["V.01.PROBLEM", "fact_no_evidence"]]);
    // Its only research log is the deleted one, which supports no check.
    const logs = await db
      .select()
      .from(researchLogEntries)
      .where(eq(researchLogEntries.validationId, validation.id));
    const deleted = logs.filter((log) => log.deletedAt !== null);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.supportsChecks).toEqual([]);

    const unclassifiedHistory = await db
      .select({ key: changeHistory.targetKey, batchId: changeHistory.batchId })
      .from(changeHistory)
      .where(
        and(
          eq(changeHistory.containerId, validation.id),
          eq(changeHistory.source, "ai_import"),
        ),
      );
    expect(unclassifiedHistory.map((row) => row.key).sort()).toEqual([
      "V.01.BEHAVIOR",
      "V.01.SWITCHING",
      "V.02.DRIVERS",
    ]);
    expect(new Set(unclassifiedHistory.map((row) => row.batchId)).size).toBe(1);

    // The Hold was recorded before the AI import and the deletion: its snapshot has the
    // answers as they were then, and lacks the costs and permits checks.
    const [hold] = entries;
    expect(hold).toMatchObject({ kind: "validation_decision", value: "hold" });
    const snapshot = hold?.snapshot as {
      missingChecks: { key: string }[];
      fau: { unclassified: number; factNoEvidence: number };
    };
    expect(snapshot.missingChecks.map((c) => c.key)).toEqual([
      "costs",
      "permits",
    ]);
    expect(snapshot.fau).toMatchObject({ unclassified: 0, factNoEvidence: 0 });
  });

  test("Student Study Café: Plan A saved as v1 Launch review and launched, Plan B archived", async () => {
    const { plans, entries } = await ideaNamed("Student Study Café");
    expect(plans.map((p) => [p.name, p.archivedAt !== null])).toEqual([
      ["Plan A", false],
      ["Plan B", true],
    ]);
    const planA = plans[0];
    const versions = await db
      .select()
      .from(planVersions)
      .where(eq(planVersions.businessPlanId, planA?.id ?? ""));
    expect(versions.map((v) => v.name)).toEqual(["v1 Launch review"]);
    expect(entries.map((e) => [e.kind, e.value])).toEqual([
      ["validation_decision", "proceed"],
      ["version_saved", null],
      ["go_no_go", "launch"],
    ]);
    const kpis = await db
      .select()
      .from(executionItems)
      .where(
        and(
          eq(executionItems.businessPlanId, planA?.id ?? ""),
          eq(executionItems.type, "kpi"),
        ),
      );
    expect(kpis.filter((kpi) => kpi.kpiActual !== null).length).toBeGreaterThan(
      0,
    );
  });

  test("Bacolod Night Market Stall: Hold after Proceed and Plan A; Strong exceeds capacity", async () => {
    const { entries, plans, evaluation } = await ideaNamed(
      "Bacolod Night Market Stall",
    );
    expect(entries.map((e) => e.value)).toEqual(["proceed", "hold"]);
    expect(plans.map((p) => p.name)).toEqual(["Plan A"]);
    expect(plans[0]?.createdAt.getTime()).toBeLessThan(
      entries[1]?.recordedAt.getTime() ?? 0,
    );
    expect(evaluation.economics.warnings).toContain("strong_exceeds_capacity");
  });

  test("Laundry Pickup: dropped for a negative contribution margin", async () => {
    const { entries, evaluation } = await ideaNamed("Laundry Pickup");
    expect(entries.map((e) => [e.value, e.reason])).toEqual([
      ["drop", "Contribution margin is negative"],
    ]);
    expect(evaluation.economics.contributionMargin.value).toBe(-15);
    expect(evaluation.economics.warnings).toContain("margin_not_positive");
  });

  test("Sari-sari Store Delivery is archived", async () => {
    const { idea } = await ideaNamed("Sari-sari Store Delivery");
    expect(idea.archivedAt).not.toBeNull();
  });

  test("Mobile Bike Repair: two answers in 01, every check not started", async () => {
    const { evaluation, loaded } = await ideaNamed("Mobile Bike Repair");
    expect(loaded.state.answers.map((a) => a.questionKey).sort()).toEqual([
      "V.01.PROBLEM",
      "V.01.WHO",
    ]);
    expect(new Set(Object.values(checkStates(evaluation)))).toEqual(
      new Set(["not_started"]),
    );
  });

  test("research logs and competitors per 8.4", async () => {
    const counts = async (name: string) => {
      const { validation, loaded } = await ideaNamed(name);
      const priced = loaded.state.competitors.filter(
        (c) => c.typicalPrice !== null,
      );
      const tags = new Set(
        loaded.state.researchLogs.flatMap((l) => l.supportsChecks),
      );
      return {
        logs: loaded.state.researchLogs.length,
        deletedLogs:
          (await db.$count(
            researchLogEntries,
            eq(researchLogEntries.validationId, validation.id),
          )) - loaded.state.researchLogs.length,
        tags: [...tags].sort(),
        competitors: loaded.state.competitors.length,
        priced: priced.length,
      };
    };
    expect(await counts("Piaya Gift Box Delivery")).toEqual({
      logs: 7,
      deletedLogs: 0,
      tags: ["demand_signal", "local_price", "permits"],
      competitors: 4,
      priced: 3,
    });
    expect(await counts("Bacolod Health Bowl")).toEqual({
      logs: 5,
      deletedLogs: 1,
      tags: ["demand_signal", "local_price"],
      competitors: 4,
      priced: 2,
    });
    const { loaded: health } = await ideaNamed("Bacolod Health Bowl");
    const tagged = (tag: string) =>
      health.state.researchLogs.filter((l) =>
        l.supportsChecks.includes(tag as never),
      ).length;
    expect([tagged("local_price"), tagged("demand_signal")]).toEqual([1, 2]);
    for (const name of [
      "Mobile Bike Repair",
      "Bacolod Night Market Stall",
      "Sari-sari Store Delivery",
    ])
      expect(await counts(name)).toMatchObject({
        logs: 0,
        deletedLogs: 0,
        competitors: 0,
      });
  });
});

describe("Piaya plans (design-spec 8.2・6.12〜6.14)", () => {
  const planNamed = async (name: string) => {
    const { plans, entries } = await ideaNamed("Piaya Gift Box Delivery");
    const plan = plans.find((p) => p.name === name);
    if (plan === undefined) throw new Error(`No ${name}`);
    const answers = await db
      .select()
      .from(planAnswers)
      .where(eq(planAnswers.businessPlanId, plan.id));
    const items = await db
      .select()
      .from(executionItems)
      .where(eq(executionItems.businessPlanId, plan.id));
    const versions = await db
      .select()
      .from(planVersions)
      .where(eq(planVersions.businessPlanId, plan.id));
    return {
      plan,
      answers,
      items,
      versions,
      entries: entries.filter((e) => e.businessPlanId === plan.id),
    };
  };

  test("Plan A: v1 For advisors with changes since, latest Go / No-Go Delay", async () => {
    const { plan, answers, items, versions, entries } =
      await planNamed("Plan A");
    expect(versions.map((v) => v.name)).toEqual(["v1 For advisors"]);
    const savedAt = versions[0]?.savedAt ?? NOW;
    const changedSince = [...answers, ...items].filter(
      (row) => row.updatedAt > savedAt,
    );
    expect(changedSince.length).toBeGreaterThan(0);
    expect(plan.updatedAt <= savedAt).toBe(true);
    expect(entries.map((e) => [e.kind, e.value])).toEqual([
      ["version_saved", null],
      ["go_no_go", "delay"],
    ]);
    const goNoGo = entries[1]?.snapshot as {
      conditions: Record<string, string | null>;
      planVersion: { id: string; name: string } | null;
    };
    expect(goNoGo.planVersion).toEqual({
      id: versions[0]?.id ?? "",
      name: "v1 For advisors",
    });
    expect(
      Object.values(goNoGo.conditions).every((text) => text !== null),
    ).toBe(true);

    const snapshot = versions[0]?.snapshot as {
      header: { name: string };
      answers: { questionKey: string; text: string | null }[];
      keyMetrics: Record<string, { value: number | null }>;
      scenarios: unknown[];
      execution: unknown[];
      competitors: unknown[];
    };
    expect(snapshot.header.name).toBe("Plan A");
    expect(snapshot.keyMetrics.initial_cost_total?.value).toBe(169500);
    expect(snapshot.scenarios).toHaveLength(5);
    expect(snapshot.competitors).toHaveLength(4);
    expect(snapshot.execution.length).toBe(items.length);
    // The version keeps the text P.01.6 had before the later change.
    const current = answers.find((a) => a.questionKey === "P.01.6")?.text;
    const saved = snapshot.answers.find(
      (a) => a.questionKey === "P.01.6",
    )?.text;
    expect(current).not.toBe(saved);
    expect(saved).toBe(
      "Offices already buy gifts every month and nobody delivers piaya to them.",
    );
  });

  test("Plan A: every execution type, one item overdue and one due in 2 days", async () => {
    const { items } = await planNamed("Plan A");
    expect(new Set(items.map((i) => i.type))).toEqual(
      new Set(["milestone", "launch", "kpi", "open_question", "next_action"]),
    );
    const open = items.filter(
      (i) =>
        i.dueDate !== null && i.status !== "done" && i.status !== "resolved",
    );
    expect(
      open.filter((i) => (i.dueDate ?? "") < TODAY).map((i) => i.title),
    ).toEqual(["Get supplier quote"]);
    expect(open.find((i) => i.dueDate === daysFromToday(2))?.title).toBe(
      "Book venue",
    );
    // Due soon on 5 (design-spec 6.9) is exactly these two in the whole workspace.
    const allOpen = (
      await db
        .select({
          title: executionItems.title,
          due: executionItems.dueDate,
          status: executionItems.status,
          planArchived: businessPlans.archivedAt,
          ideaArchived: ideas.archivedAt,
        })
        .from(executionItems)
        .innerJoin(
          businessPlans,
          eq(businessPlans.id, executionItems.businessPlanId),
        )
        .innerJoin(ideas, eq(ideas.id, businessPlans.ideaId))
    ).filter(
      (i) =>
        i.due !== null &&
        i.due <= daysFromToday(7) &&
        i.status !== "done" &&
        i.status !== "resolved" &&
        i.planArchived === null &&
        i.ideaArchived === null,
    );
    expect(allOpen.map((i) => i.title).sort()).toEqual([
      "Book venue",
      "Get supplier quote",
    ]);
  });

  test("Plan A: every source of the one- and five-minute Pitch Decks is written", async () => {
    const { answers, items } = await planNamed("Plan A");
    const text = (key: string) =>
      answers.find((a) => a.questionKey === key)?.text?.trim();
    const rows = (key: string) =>
      answers.find((a) => a.questionKey === key)?.rows as unknown[] | undefined;
    // design-spec 6.14: the sub-items each slide's bullets, numbers and tables come from.
    const textSources = [
      "P.01.1",
      "P.01.6",
      "P.03.1",
      "P.03.2",
      "P.03.3",
      "P.03.4",
      "P.03.5",
      "P.04.1",
      "P.04.2",
      "P.04.3",
      "P.04.4",
      "P.04.5",
      "P.05.1",
      "P.05.2",
      "P.05.3",
      "P.05.4",
      "P.05.5",
      "P.06.1",
      "P.06.2",
      "P.06.3",
      "P.06.4",
      "P.06.5",
      "P.06.7",
      "P.06.8",
      "P.08.1",
      "P.08.2",
      "P.08.11",
      "P.10.1",
      "P.10.2",
      "P.10.3",
      "P.20.2",
      "P.20.10",
      "P.20.11",
      "P.24.1",
      "P.24.2",
      "P.24.3",
      "P.30.1",
      "P.30.2",
    ];
    expect(textSources.filter((key) => !text(key))).toEqual([]);
    expect(rows("P.11.1")?.length).toBeGreaterThan(0);
    expect(rows("P.22.1")?.length).toBeGreaterThanOrEqual(3);
    const ofType = (type: string) => items.filter((i) => i.type === type);
    expect(
      ofType("milestone").filter((i) => i.dueDate !== null).length,
    ).toBeGreaterThan(0);
    expect(ofType("launch").length).toBeGreaterThan(0);
    expect(
      ofType("next_action").filter((i) => i.status !== "done").length,
    ).toBeGreaterThan(0);
  });

  test("Plan B: a draft with no version, its answers as copied", async () => {
    const { answers, items, versions, plan } = await planNamed("Plan B");
    expect(versions).toEqual([]);
    expect(plan.archivedAt).toBeNull();
    expect(answers.length).toBeGreaterThan(0);
    for (const answer of answers) {
      expect(answer.copiedFrom).not.toBeNull();
      expect(answer.updatedAt).toEqual(plan.createdAt);
    }
    expect(
      items.every(
        (i) =>
          i.fromPreset && i.updatedAt.getTime() === plan.createdAt.getTime(),
      ),
    ).toBe(true);
    expect(items).toHaveLength(23);
    const history = await db
      .select({ source: changeHistory.source, batchId: changeHistory.batchId })
      .from(changeHistory)
      .where(eq(changeHistory.containerId, plan.id));
    expect(new Set(history.map((h) => h.source))).toEqual(
      new Set(["plan_draft"]),
    );
    expect(new Set(history.map((h) => h.batchId)).size).toBe(1);
  });
});

describe("comments, notifications and history (design-spec 8.4)", () => {
  test("6 threads of 7 comments: 2 mention Kenji, 1 resolved, 1 on Ana's self-analysis", async () => {
    const rows = await db.select().from(comments);
    expect(rows).toHaveLength(7);
    const roots = rows.filter((c) => c.parentId === null);
    expect(roots).toHaveLength(6);
    expect(roots.filter((c) => c.resolvedAt !== null)).toHaveLength(1);
    const mentions = await db.select().from(commentMentions);
    expect(mentions.map((m) => m.userId)).toEqual([
      userId("kenji"),
      userId("kenji"),
    ]);
    const onSelfAnalysis = roots.filter(
      (c) => c.containerType === "self_analysis",
    );
    expect(onSelfAnalysis.map((c) => [c.containerId, c.authorId])).toEqual([
      [selfAnalysisId("ana"), userId("paolo")],
    ]);
  });

  test("Kenji's two mentions are his only unread notifications", async () => {
    const unread = await db
      .select()
      .from(notifications)
      .where(isNull(notifications.readAt));
    expect(unread.map((n) => [n.userId, n.kind])).toEqual([
      [userId("kenji"), "mention"],
      [userId("kenji"), "mention"],
    ]);
  });

  test("every recorded decision notifies the other BCDX members", async () => {
    const entries = await db.select().from(decisionLogEntries);
    expect(entries).toHaveLength(10);
    for (const entry of entries) {
      const recipients = await db
        .select({ userId: notifications.userId })
        .from(notifications)
        .where(eq(notifications.decisionLogEntryId, entry.id));
      expect(recipients).toHaveLength(3);
      expect(recipients.map((r) => r.userId)).not.toContain(entry.recordedById);
    }
  });

  test("main answers have 2–3 history rows, made by hand, by an AI import and by a revert", async () => {
    const rows = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.targetType, "validation_answer"));
    const piayaValidation = seedId("validation", "piaya");
    const problem = rows
      .filter(
        (r) => r.targetId === piayaValidation && r.targetKey === "V.01.PROBLEM",
      )
      .sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
    expect(problem.map((r) => [r.action, r.source])).toEqual([
      ["create", "manual"],
      ["update", "ai_import"],
      ["update", "revert"],
    ]);
    expect(problem[2]?.revertedFromId).toBe(problem[0]?.id ?? "");
    expect(problem[2]?.after).toEqual(problem[0]?.after);
    const who = rows.filter(
      (r) => r.targetId === piayaValidation && r.targetKey === "V.01.WHO",
    );
    expect(who).toHaveLength(2);
    // Self-analysis history belongs to its owner, outside any workspace.
    const selfRows = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.containerType, "self_analysis"));
    expect(selfRows.length).toBeGreaterThan(0);
    for (const row of selfRows) {
      expect(row.workspaceId).toBeNull();
      expect(row.ownerUserId).not.toBeNull();
    }
  });

  test("Piaya's validation rows are as M1 and the saves make them", async () => {
    // M1 makes every cost row of the template; the target margin is left empty (8.3).
    const piaya = await ideaNamed("Piaya Gift Box Delivery");
    const rows = await db
      .select({ key: costItems.templateKey })
      .from(costItems)
      .where(eq(costItems.validationId, piaya.validation.id));
    expect(rows).toHaveLength(24);
    const prices = await db
      .select()
      .from(economicsInputs)
      .where(eq(economicsInputs.validationId, piaya.validation.id));
    expect(prices.map((p) => p.fieldKey)).not.toContain("target_margin");
    const answers = await db
      .select()
      .from(validationAnswers)
      .where(eq(validationAnswers.validationId, piaya.validation.id));
    expect(answers.every((a) => a.lockVersion >= 1)).toBe(true);
    expect(
      await db.$count(
        competitors,
        eq(competitors.validationId, piaya.validation.id),
      ),
    ).toBe(4);
  });
});

describe("history and locks (SDD 6.5「変更はすべて履歴に残す」・5.1「同時編集」)", () => {
  /**
   * Every row the history covers, with what its latest history row must hold and how
   * many saves its lock_version counts. Keyed items count every save (the first makes 1);
   * listed rows count the saves after their creation (SDD 5.1).
   */
  const covered = async () => {
    const evidence = await db
      .select()
      .from(evidenceLinks)
      .where(isNull(evidenceLinks.deletedAt));
    const evidenceIds = (type: string, id: string, key: string | null = null) =>
      evidence
        .filter(
          (link) =>
            link.targetType === type &&
            link.targetId === id &&
            (link.targetKey ?? null) === key,
        )
        .map((link) => link.id)
        .sort();
    const pick = (row: Record<string, unknown>, fields: string[]) =>
      Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
    const items: {
      target: string;
      expected: unknown;
      lockVersion: number;
      keyed: boolean;
      deleted?: boolean;
    }[] = [];
    const add = (
      type: string,
      id: string,
      key: string | null,
      row: { lockVersion: number } & Record<string, unknown>,
      expected: unknown,
      keyed: boolean,
    ) =>
      items.push({
        target: `${type}/${id}/${key ?? ""}`,
        expected,
        lockVersion: row.lockVersion,
        keyed,
        deleted: row.deletedAt != null,
      });
    for (const row of await db.select().from(validationAnswers))
      add(
        "validation_answer",
        row.validationId,
        row.questionKey,
        row,
        {
          ...pick(row, ["text", "fau", "confidence"]),
          evidenceIds:
            row.fau === "fact"
              ? evidenceIds(
                  "validation_answer",
                  row.validationId,
                  row.questionKey,
                )
              : [],
        },
        true,
      );
    for (const row of await db.select().from(economicsInputs))
      add(
        "economics_input",
        row.validationId,
        row.fieldKey,
        row,
        {
          ...pick(row, ["value", "fau", "confidence"]),
          evidenceIds:
            row.fau === "fact"
              ? evidenceIds("economics_input", row.validationId, row.fieldKey)
              : [],
        },
        true,
      );
    for (const row of await db.select().from(selfAnalysisAnswers))
      add(
        "self_analysis_answer",
        row.selfAnalysisId,
        row.questionKey,
        row,
        pick(row, ["text", "amount"]),
        true,
      );
    for (const row of await db.select().from(planAnswers))
      add(
        "plan_answer",
        row.businessPlanId,
        row.questionKey,
        row,
        pick(row, ["text", "rows"]),
        true,
      );
    for (const row of await db.select().from(researchLogEntries))
      add(
        "research_log_entry",
        row.id,
        null,
        row,
        pick(row, [
          "observedOn",
          "topic",
          "observation",
          "sourceType",
          "sourceUrl",
          "supportsChecks",
          "supportsNote",
        ]),
        false,
      );
    for (const row of await db.select().from(competitors))
      add(
        "competitor",
        row.id,
        null,
        row,
        {
          ...pick(row, [
            "name",
            "type",
            "targetCustomer",
            "offering",
            "typicalPrice",
            "priceNote",
            "strength",
            "weakness",
            "whyChosen",
            "whySurvive",
          ]),
          evidenceIds: evidenceIds("competitor", row.id),
        },
        false,
      );
    for (const row of await db.select().from(assumptions))
      add(
        "assumption",
        row.id,
        null,
        row,
        {
          ...pick(row, [
            "statement",
            "whyBelieve",
            "evidenceNote",
            "confidence",
            "disproveCondition",
            "nextCheck",
          ]),
          evidenceIds: evidenceIds("assumption", row.id),
        },
        false,
      );
    for (const row of await db.select().from(risks))
      add(
        "risk",
        row.id,
        null,
        row,
        pick(row, [
          "statement",
          "probability",
          "impact",
          "whyMatters",
          "mitigation",
          "howToValidate",
        ]),
        false,
      );
    for (const row of await db.select().from(costItems))
      add(
        "cost_item",
        row.id,
        null,
        row,
        {
          ...pick(row, [
            "category",
            "templateKey",
            "name",
            "inputMode",
            "amount",
            "percent",
            "isLumpSum",
            "whyNeeded",
            "canReduce",
            "notes",
            "fau",
            "confidence",
          ]),
          evidenceIds:
            row.fau === "fact" ? evidenceIds("cost_item", row.id) : [],
        },
        false,
      );
    for (const row of await db.select().from(executionItems))
      add(
        "execution_item",
        row.id,
        null,
        row,
        pick(row, [
          "type",
          "title",
          "assigneeUserId",
          "assigneeName",
          "dueDate",
          "status",
          "goal",
          "exitCondition",
          "launchTiming",
          "actions",
          "completionCriteria",
          "kpiArea",
          "kpiTarget",
          "kpiReviewFrequency",
          "kpiActual",
          "whyItMatters",
          "answer",
        ]),
        false,
      );
    for (const row of await db.select().from(businessPlans))
      add(
        "business_plan",
        row.id,
        null,
        row,
        pick(row, ["name", "businessName", "preparedBy"]),
        false,
      );
    for (const row of await db.select().from(ideas))
      add(
        "idea",
        row.id,
        null,
        row,
        pick(row, ["name", "oneLineConcept", "proposedSolution"]),
        false,
      );
    return items;
  };

  /** Evidence ids are a set: the order they were attached in does not matter. */
  const sortedEvidence = (after: unknown) =>
    after !== null &&
    typeof after === "object" &&
    "evidenceIds" in after &&
    Array.isArray(after.evidenceIds)
      ? { ...after, evidenceIds: after.evidenceIds.toSorted() }
      : after;

  test("every row has history whose latest row holds it as it is", async () => {
    const history = await db
      .select()
      .from(changeHistory)
      .orderBy(asc(changeHistory.changedAt));
    const byTarget = Map.groupBy(
      history,
      (row) => `${row.targetType}/${row.targetId}/${row.targetKey ?? ""}`,
    );
    const items = await covered();
    expect(items.length).toBeGreaterThan(500);
    for (const item of items) {
      const rows = byTarget.get(item.target) ?? [];
      const latest = rows.at(-1);
      expect([item.target, latest?.action === "delete"]).toEqual([
        item.target,
        item.deleted === true,
      ]);
      if (item.deleted) continue;
      expect([item.target, sortedEvidence(latest?.after)]).toEqual([
        item.target,
        item.expected,
      ]);
      const saves = rows.filter((row) => row.action !== "delete").length;
      expect([item.target, item.lockVersion]).toEqual([
        item.target,
        item.keyed ? saves : saves - 1,
      ]);
    }
  });

  test("each history row starts from where the one before it ended", async () => {
    const history = await db
      .select()
      .from(changeHistory)
      .orderBy(asc(changeHistory.changedAt));
    const byTarget = Map.groupBy(
      history,
      (row) => `${row.targetType}/${row.targetId}/${row.targetKey ?? ""}`,
    );
    for (const [target, rows] of byTarget) {
      expect([target, rows[0]?.action]).toEqual([target, "create"]);
      rows.forEach((row, index) => {
        if (index === 0) return;
        expect([target, row.before]).toEqual([target, rows[index - 1]?.after]);
      });
    }
  });
});
