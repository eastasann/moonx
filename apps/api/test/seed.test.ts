import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { scrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDb, schema } from "@moonx/db";
import {
  DEMO_PASSWORD,
  type IdeaKey,
  ideaId,
  planId,
  seedDemo,
  seedTemplates,
} from "@moonx/db/seed";
import {
  buildKeyMetrics,
  type CheckRules,
  type CostRowInput,
  computeEconomics,
  DEFAULT_CHECK_RULES,
  decideStage,
  deriveFauState,
  type EconomicsInputValues,
  evaluateChecks,
} from "@moonx/domain";
import type { CheckKey, CheckState } from "@moonx/schemas";
import { and, eq, isNull } from "drizzle-orm";
import planJson from "../../../packages/db/seed/templates/business-plan.json";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must point at the test database (make test-api sets it)");
// seedDemo empties every table, so the suite only runs against the dedicated test database.
if (!new URL(url).pathname.slice(1).endsWith("_test")) {
  throw new Error("seed tests only run against a database whose name ends in _test");
}
const { db, client } = createDb(url, { max: 2, quiet: true });

beforeAll(async () => {
  await seedDemo(db);
});
afterAll(async () => {
  await client.end();
});

function must<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new Error(`expected ${what} to exist`);
  return value;
}

const todayInManila = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

async function versionRow(kind: string, versionNumber: number) {
  const rows = await db
    .select({ id: schema.templateVersions.id, status: schema.templateVersions.status })
    .from(schema.templateVersions)
    .innerJoin(schema.templates, eq(schema.templates.id, schema.templateVersions.templateId))
    .where(
      and(
        eq(schema.templates.kind, kind as "validation"),
        eq(schema.templateVersions.versionNumber, versionNumber),
      ),
    );
  return must(rows[0], `${kind} v${versionNumber}`);
}

async function questionKeys(versionId: string) {
  const rows = await db
    .select({ key: schema.templateQuestions.questionKey })
    .from(schema.templateQuestions)
    .where(eq(schema.templateQuestions.templateVersionId, versionId));
  return rows.map((r) => r.key);
}

/** One idea's validation as the domain functions take it, read back from the database. */
async function loadValidation(key: IdeaKey) {
  const validation = must(
    (
      await db
        .select()
        .from(schema.validations)
        .where(eq(schema.validations.ideaId, ideaId(key)))
    )[0],
    `validation of ${key}`,
  );
  const idea = must(
    (
      await db
        .select()
        .from(schema.ideas)
        .where(eq(schema.ideas.id, ideaId(key)))
    )[0],
    `idea ${key}`,
  );
  const vid = validation.id;

  const [competitors, logs, costs, econ, links, rules] = await Promise.all([
    db
      .select()
      .from(schema.competitors)
      .where(and(eq(schema.competitors.validationId, vid), isNull(schema.competitors.deletedAt))),
    db
      .select()
      .from(schema.researchLogEntries)
      .where(
        and(
          eq(schema.researchLogEntries.validationId, vid),
          isNull(schema.researchLogEntries.deletedAt),
        ),
      ),
    db
      .select()
      .from(schema.costItems)
      .where(and(eq(schema.costItems.validationId, vid), isNull(schema.costItems.deletedAt))),
    db.select().from(schema.economicsInputs).where(eq(schema.economicsInputs.validationId, vid)),
    db
      .select()
      .from(schema.evidenceLinks)
      .where(
        and(eq(schema.evidenceLinks.validationId, vid), isNull(schema.evidenceLinks.deletedAt)),
      ),
    db
      .select()
      .from(schema.templateCheckRules)
      .where(eq(schema.templateCheckRules.templateVersionId, validation.templateVersionId)),
  ]);

  const costRows: CostRowInput[] = costs.map((c) => ({
    id: c.id,
    category: c.category,
    templateKey: c.templateKey,
    inputMode: c.inputMode,
    amount: c.amount,
    percent: c.percent,
    fauState: deriveFauState({
      hasValue: c.amount != null || c.percent != null,
      fau: c.fau,
      confidence: c.confidence,
      activeEvidenceCount: links.filter((l) => l.targetType === "cost_item" && l.targetId === c.id)
        .length,
    }),
  }));
  const value = (field: string) => econ.find((e) => e.fieldKey === field)?.value ?? null;
  const economics: EconomicsInputValues = {
    sellingPrice: value("selling_price"),
    operatingDays: value("operating_days"),
    targetMargin: value("target_margin"),
    unitsConservative: value("units_conservative"),
    unitsExpected: value("units_expected"),
    unitsStrong: value("units_strong"),
    unitsCapacity: value("units_capacity"),
  };
  const param = (checkKey: CheckKey) =>
    must(
      rules.find((r) => r.checkKey === checkKey),
      `rule ${checkKey}`,
    ).params;
  const checks = evaluateChecks({
    workspaceId: idea.workspaceId,
    ideaId: idea.id,
    competitors,
    researchLogs: logs,
    costRows,
    economics,
    rules: {
      competitors: param("competitors"),
      local_price: param("local_price"),
      permits: param("permits"),
      demand_signal: param("demand_signal"),
    } as CheckRules,
  });
  return { validation, costRows, economics, checks, logs, competitors };
}

const states = (checks: { key: CheckKey; state: CheckState }[]) =>
  Object.fromEntries(checks.map((c) => [c.key, c.state]));

describe("templates", () => {
  test("self analysis has 36 questions in 11 sections and the AI prompt", async () => {
    const v1 = await versionRow("self_analysis", 1);
    expect(v1.status).toBe("published");
    const [version] = await db
      .select()
      .from(schema.templateVersions)
      .where(eq(schema.templateVersions.id, v1.id));
    expect(
      version?.aiPrompt.startsWith("I want to complete the attached Self Analysis template."),
    ).toBe(true);
    const sections = await db
      .select()
      .from(schema.templateSections)
      .where(eq(schema.templateSections.templateVersionId, v1.id));
    expect(sections).toHaveLength(11);
    const questions = await db
      .select()
      .from(schema.templateQuestions)
      .where(eq(schema.templateQuestions.templateVersionId, v1.id));
    expect(questions).toHaveLength(36);
    expect(
      questions
        .filter((q) => q.answerType === "amount_with_reason")
        .map((q) => q.questionKey)
        .sort(),
    ).toEqual(["SA.INCOME.1", "SA.INCOME.2", "SA.INCOME.3"]);
  });

  test("validation: v1 and v2 published, v2 adds one question, v3 is a draft", async () => {
    const v1 = await versionRow("validation", 1);
    const v2 = await versionRow("validation", 2);
    const v3 = await versionRow("validation", 3);
    expect([v1.status, v2.status, v3.status]).toEqual(["published", "published", "draft"]);
    const [k1, k2, k3] = await Promise.all([v1, v2, v3].map((v) => questionKeys(v.id)));
    expect(k1).toHaveLength(34);
    expect(k2?.filter((k) => !k1?.includes(k))).toEqual(["V.01.REACH"]);
    expect(k3?.filter((k) => !k2?.includes(k))).toEqual(["V.10.NEXT_STEP"]);
  });

  test("validation v1 holds the original cost rows and the check thresholds", async () => {
    const v1 = await versionRow("validation", 1);
    const defaults = await db
      .select()
      .from(schema.templateCostDefaults)
      .where(eq(schema.templateCostDefaults.templateVersionId, v1.id));
    const count = (category: string) => defaults.filter((d) => d.category === category).length;
    expect([count("initial"), count("monthly_fixed"), count("variable")]).toEqual([10, 8, 6]);
    expect(defaults.some((d) => d.key === "initial.permits")).toBe(true);

    const rules = await db
      .select()
      .from(schema.templateCheckRules)
      .where(eq(schema.templateCheckRules.templateVersionId, v1.id));
    const byKey = Object.fromEntries(rules.map((r) => [r.checkKey, r.params]));
    expect(byKey.competitors).toEqual(DEFAULT_CHECK_RULES.competitors);
    expect(byKey.local_price).toEqual(DEFAULT_CHECK_RULES.local_price);
    expect(byKey.permits).toEqual(DEFAULT_CHECK_RULES.permits);
    expect(byKey.demand_signal).toEqual(DEFAULT_CHECK_RULES.demand_signal);
  });

  test("business plan has 30 items, Part A is items 1 to 10, and 23 preset execution rows", async () => {
    const v1 = await versionRow("business_plan", 1);
    const sections = await db
      .select()
      .from(schema.templateSections)
      .where(eq(schema.templateSections.templateVersionId, v1.id));
    expect(sections).toHaveLength(30);
    expect(sections.filter((s) => s.part === "a")).toHaveLength(10);
    const presets = await db
      .select()
      .from(schema.templateExecutionPresets)
      .where(eq(schema.templateExecutionPresets.templateVersionId, v1.id));
    const count = (type: string) => presets.filter((p) => p.type === type).length;
    expect([count("milestone"), count("launch"), count("kpi")]).toEqual([6, 5, 12]);
  });
});

describe("transcription of the drive copies", () => {
  const squash = (text: string) =>
    text
      .replace(/\f/g, " ")
      .replace(/​/g, "")
      .replace(/Prompt\s+Response/g, " ")
      .replace(/\[Write here\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const raw = (name: string) =>
    readFileSync(new URL(`../../../docs/drive-templates/${name}`, import.meta.url), "utf8")
      .replace(/\f/g, "\n")
      .replace(/​/g, "");
  const template = (kind: string) =>
    must(
      seedTemplates.find((t) => t.kind === kind),
      `${kind} template`,
    );

  test("self analysis: every block of the original is in the seed, with its example", () => {
    const text = raw("self-analysis.txt");
    expect(text.match(/^\s*YOUR ANSWER\s*$/gm)).toHaveLength(36);
    expect(text.match(/^\s*EXAMPLE\s*$/gm)).toHaveLength(36);
    const flat = squash(text);
    const questions = must(template("self_analysis").versions[0], "v1").sections.flatMap(
      (s) => s.questions,
    );
    expect(questions).toHaveLength(36);
    for (const q of questions) {
      expect(q.example).toBeTruthy();
      expect(flat).toContain(squash(q.prompt));
      expect(flat).toContain(squash(q.example as string));
    }
    for (const s of must(template("self_analysis").versions[0], "v1").sections) {
      expect(flat).toContain(squash(s.guidance as string));
    }
    const prompt = squash(raw("initialize-prompt.txt"));
    expect(prompt).toContain(squash(must(template("self_analysis").versions[0], "v1").aiPrompt));
  });

  test("business plan: the parsed copy has every prompt and example, and the seed uses it", () => {
    const text = raw("business-plan.txt");
    const promptLines = text
      .split("\n")
      .filter(
        (l) => /^ ?\S.*\s{2,}\[Write here\]\s*$/.test(l) && l.split("[Write here]").length === 2,
      );
    const items = planJson.flatMap((s) => s.items);
    expect(items).toHaveLength(promptLines.length);
    expect(items.filter((i) => i.example)).toHaveLength(
      text.match(/(?:^|\s{3,})Example:/gm)?.length ?? -1,
    );

    const flat = squash(text);
    const seedItems = must(template("business_plan").versions[0], "v1").sections.flatMap(
      (s) => s.questions,
    );
    for (const q of seedItems) {
      if (q.example) expect(flat).toContain(squash(q.example));
    }
    // 11 and 13 replace five prompt rows by tables; everything else is carried over.
    const texts = new Set(seedItems.map((q) => q.prompt));
    const dropped = items.filter(
      (i) =>
        !texts.has(i.label) &&
        !i.label.startsWith("Founder ") &&
        !/^Initial (ownership|capital)/.test(i.label),
    );
    expect(dropped).toEqual([]);
  });

  test("validation: question texts equal the cells of the workbook", () => {
    const text = raw("business-idea-validation.txt");
    const sheet = (name: string) => {
      const start = text.indexOf(`=== Sheet: ${name}`);
      const next = text.indexOf("=== Sheet:", start + 1);
      return text.slice(start, next === -1 ? undefined : next);
    };
    const cells = (name: string, column: string, fromRow: number, toRow = 99) =>
      sheet(name)
        .split("\n")
        .flatMap((l) => {
          const m = l.match(new RegExp(`^${column}(\\d+): (.*)$`));
          return m && Number(m[1]) >= fromRow && Number(m[1]) <= toRow ? [m[2] as string] : [];
        });
    const v1 = must(template("validation").versions[0], "v1");
    const prompts = (key: string) =>
      must(
        v1.sections.find((s) => s.key === key),
        `section ${key}`,
      ).questions.map((q) => q.prompt);

    expect(prompts("01")).toEqual(cells("01 Customer & Problem", "B", 5));
    expect(prompts("02")).toEqual(cells("02 Market", "B", 5));
    expect(prompts("04")).toEqual(
      cells("04 Competitors", "A", 14).filter((c) => /Patterns/.test(c)),
    );
    expect(prompts("08")).toEqual(cells("08 Return", "A", 14).slice(0, 1));
    expect(prompts("10")).toEqual(cells("10 Final Assessment", "A", 5, 10));
    for (const s of v1.sections) {
      const sheetName = {
        "01": "01 Customer & Problem",
        "02": "02 Market",
        "04": "04 Competitors",
        "08": "08 Return",
        "10": "10 Final Assessment",
      }[s.key] as string;
      expect(cells(sheetName, "A", 2, 2)[0]).toBe(s.guidance as string);
    }
  });
});

describe("demo data", () => {
  test("seeding twice leaves the same rows", async () => {
    const snapshot = async () => ({
      users: (await db.select().from(schema.users)).length,
      answers: (await db.select().from(schema.validationAnswers)).length,
      history: (await db.select().from(schema.changeHistory)).length,
      ideas: (await db.select({ id: schema.ideas.id }).from(schema.ideas)).map((r) => r.id).sort(),
      history_ids: (await db.select({ id: schema.changeHistory.id }).from(schema.changeHistory))
        .map((r) => r.id)
        .sort(),
    });
    const before = await snapshot();
    await seedDemo(db);
    expect(await snapshot()).toEqual(before);
  });

  test("users, roles and invitations (design-spec 8.1)", async () => {
    const rows = await db
      .select({
        email: schema.users.email,
        isAdmin: schema.users.isAdmin,
        role: schema.memberships.role,
        workspace: schema.workspaces.name,
        personal: schema.workspaces.isPersonal,
      })
      .from(schema.users)
      .leftJoin(schema.memberships, eq(schema.memberships.userId, schema.users.id))
      .leftJoin(schema.workspaces, eq(schema.workspaces.id, schema.memberships.workspaceId));
    const inBcdx = Object.fromEntries(
      rows.filter((r) => r.workspace === "BCDX").map((r) => [r.email, r.role]),
    );
    expect(inBcdx).toEqual({
      "ana@bcdx.example": "owner",
      "kenji@bcdx.example": "member",
      "paolo@bcdx.example": "member",
      "grace@advisor.example": "viewer",
    });
    expect(rows.filter((r) => r.personal)).toHaveLength(5);
    expect(rows.filter((r) => r.isAdmin).map((r) => r.email)).toEqual(["admin@moonx.example"]);

    const invitations = await db.select().from(schema.invitations);
    expect(invitations.map((i) => i.status).sort()).toEqual(["expired", "pending"]);
    for (const i of invitations) {
      expect(i.expiresAt.getTime() > Date.now()).toBe(i.status === "pending");
    }
  });

  test("passwords are Better Auth scrypt hashes of the demo password", async () => {
    const accounts = await db.select().from(schema.accounts);
    expect(accounts).toHaveLength(5);
    for (const account of accounts) {
      const [salt, key] = must(account.password, "password hash").split(":");
      expect(salt).toHaveLength(32);
      const derived = await new Promise<string>((resolve, reject) =>
        scrypt(
          DEMO_PASSWORD.normalize("NFKC"),
          must(salt, "salt"),
          64,
          { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
          (err, out) => (err ? reject(err) : resolve(out.toString("hex"))),
        ),
      );
      expect(derived).toBe(key as string);
    }
  });

  test("self analyses: Ana 36, Kenji 21, Paolo 36, Grace not started; Ana and Paolo shared", async () => {
    const rows = await db
      .select({
        email: schema.users.email,
        status: schema.selfAnalyses.status,
        id: schema.selfAnalyses.id,
      })
      .from(schema.selfAnalyses)
      .innerJoin(schema.users, eq(schema.users.id, schema.selfAnalyses.userId));
    const answers = await db.select().from(schema.selfAnalysisAnswers);
    const count = (email: string) =>
      answers.filter((a) => a.selfAnalysisId === rows.find((r) => r.email === email)?.id).length;
    expect(count("ana@bcdx.example")).toBe(36);
    expect(count("kenji@bcdx.example")).toBe(21);
    expect(count("paolo@bcdx.example")).toBe(36);
    expect(count("grace@advisor.example")).toBe(0);
    expect(Object.fromEntries(rows.map((r) => [r.email.split("@")[0], r.status]))).toEqual({
      ana: "done",
      kenji: "in_progress",
      paolo: "done",
      grace: "not_started",
    });
    expect(await db.select().from(schema.selfAnalysisShares)).toHaveLength(2);
  });

  test("check states match design-spec 8.4", async () => {
    const piaya = states((await loadValidation("piaya")).checks);
    expect(Object.values(piaya).every((s) => s === "done")).toBe(true);

    expect(states((await loadValidation("health-bowl")).checks)).toEqual({
      competitors: "done",
      local_price: "done",
      costs: "partial",
      break_even: "done",
      permits: "not_started",
      demand_signal: "done",
    });

    const bike = states((await loadValidation("bike-repair")).checks);
    expect(Object.values(bike).every((s) => s === "not_started")).toBe(true);
  });

  test("Piaya's economics match the worked example (design-spec 8.3)", async () => {
    const { costRows, economics } = await loadValidation("piaya");
    const result = computeEconomics(costRows, economics);
    expect(result.variableCostPerUnit.value).toBeCloseTo(218.5, 6);
    expect(result.contributionMargin.value).toBeCloseTo(231.5, 6);
    expect(result.contributionMarginRate.value).toBeCloseTo(0.514, 3);
    expect(result.totals.monthlyFixed.amount).toBe(41700);
    expect(result.breakEvenUnitsMonth.value).toBeCloseTo(180.13, 2);
    expect(result.breakEvenUnitsDay.value).toBeCloseTo(6.93, 2);
    expect(result.breakEvenRevenue.value).toBeCloseTo(81058, 0);
    expect(result.targetMarginUnitsMonth.value).toBeCloseTo(254.3, 1);
    expect(result.targetMarginUnitsDay.value).toBeCloseTo(9.8, 1);
    expect(result.defaultsUsed.targetMargin).toBe(true);

    const scenario = (key: string) => result.scenarios.find((s) => s.key === key);
    expect(scenario("expected")?.unitsPerMonth.value).toBe(260);
    expect(scenario("expected")?.revenue.value).toBe(117000);
    expect(scenario("expected")?.variableCostTotal.value).toBeCloseTo(56810, 6);
    expect(scenario("expected")?.operatingProfit.value).toBeCloseTo(18490, 6);
    expect(scenario("expected")?.operatingMargin.value).toBeCloseTo(0.158, 3);
    expect(scenario("conservative")?.unitsPerMonth.value).toBe(156);
    expect(scenario("conservative")?.revenue.value).toBe(70200);
    expect(scenario("conservative")?.operatingProfit.value).toBeCloseTo(-5586, 6);
    expect(result.totals.initial.amount).toBe(169500);
    expect(result.paybackMonths.value).toBeCloseTo(9.17, 2);
    expect(result.simpleRoi.value).toBeCloseTo(1.309, 3);
    expect(buildKeyMetrics(result, economics, costRows).initial_cost_total?.value).toBe(169500);
  });

  test("the corporate variant differs from Piaya only in price", async () => {
    const piaya = await loadValidation("piaya");
    const corp = await loadValidation("piaya-corp");
    expect(corp.economics).toEqual({ ...piaya.economics, sellingPrice: 650 });
    const withoutIds = (rows: CostRowInput[]) => rows.map(({ id: _id, ...row }) => row);
    expect(withoutIds(corp.costRows)).toEqual(withoutIds(piaya.costRows));
    const ideas = await db.select().from(schema.ideas);
    expect(ideas.find((i) => i.id === ideaId("piaya-corp"))?.duplicatedFromId).toBe(
      ideaId("piaya"),
    );
  });

  test("Laundry Pickup has a negative contribution margin", async () => {
    const { costRows, economics } = await loadValidation("laundry");
    const result = computeEconomics(costRows, economics);
    expect(result.variableCostPerUnit.value).toBe(75);
    expect(result.contributionMargin.value).toBe(-15);
    expect(result.warnings).toContain("margin_not_positive");
  });

  test("Health Bowl: startup costs have 3 Unknown rows and 1 Empty row, Materials is 35%", async () => {
    const { costRows, economics, validation, logs } = await loadValidation("health-bowl");
    const initial = costRows.filter((r) => r.category === "initial");
    expect(initial.filter((r) => r.fauState === "unknown")).toHaveLength(3);
    expect(initial.filter((r) => r.fauState === "empty")).toHaveLength(1);
    const result = computeEconomics(costRows, economics);
    expect(result.totals.initial.isLowerBound).toBe(true);
    expect(economics.sellingPrice).toBe(220);
    const materials = costRows.find((r) => r.templateKey === "variable.materials");
    expect(materials?.inputMode).toBe("percent_of_price");
    expect(materials?.percent).toBe(0.35);

    const answers = await db
      .select()
      .from(schema.validationAnswers)
      .where(eq(schema.validationAnswers.validationId, validation.id));
    expect(answers.filter((a) => a.text != null && a.fau == null)).toHaveLength(3);

    const tagged = (tag: string) =>
      logs.filter((l) => l.supportsChecks.includes(tag as "permits")).length;
    expect([tagged("local_price"), tagged("demand_signal"), tagged("permits")]).toEqual([1, 2, 0]);
  });

  test("every validation but Mobile Bike Repair is on template v1; Bike Repair has two answers only", async () => {
    const v1 = await versionRow("validation", 1);
    const v2 = await versionRow("validation", 2);
    const validations = await db.select().from(schema.validations);
    expect(validations).toHaveLength(6);
    for (const v of validations) {
      expect(v.templateVersionId).toBe(v.ideaId === ideaId("bike-repair") ? v2.id : v1.id);
    }

    const { validation, logs, competitors } = await loadValidation("bike-repair");
    const answers = await db
      .select()
      .from(schema.validationAnswers)
      .where(eq(schema.validationAnswers.validationId, validation.id));
    expect(answers).toHaveLength(2);
    expect(answers.every((a) => a.questionKey.startsWith("V.01."))).toBe(true);
    expect([logs.length, competitors.length]).toEqual([0, 0]);
  });

  test("research logs and competitors per idea (design-spec 8.4)", async () => {
    const counts = async (key: IdeaKey) => {
      const { logs, competitors } = await loadValidation(key);
      return {
        logs: logs.length,
        competitors: competitors.length,
        priced: competitors.filter((c) => c.typicalPrice != null).length,
      };
    };
    expect(await counts("piaya")).toEqual({ logs: 7, competitors: 4, priced: 3 });
    expect(await counts("health-bowl")).toEqual({ logs: 5, competitors: 4, priced: 2 });
    expect(await counts("bike-repair")).toEqual({ logs: 0, competitors: 0, priced: 0 });
  });

  test("stages follow the plans' latest Go / No-Go, and decisions are recorded per idea", async () => {
    const plans = await db.select().from(schema.businessPlans);
    const entries = await db.select().from(schema.decisionLogEntries);
    const stageOf = (key: IdeaKey) =>
      decideStage(
        plans
          .filter((p) => p.ideaId === ideaId(key))
          .map((p) => {
            const latest = entries
              .filter((e) => e.kind === "go_no_go" && e.businessPlanId === p.id)
              .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
            return {
              archived: p.archivedAt != null,
              latestGoNoGo: (latest?.value as "launch" | "delay" | "stop" | undefined) ?? null,
            };
          }),
      );
    expect(stageOf("piaya")).toBe("planning");
    expect(stageOf("study-cafe")).toBe("launch_prep");
    expect(stageOf("health-bowl")).toBe("validation");
    expect(stageOf("laundry")).toBe("validation");
    expect(stageOf("bike-repair")).toBe("validation");

    const ideas = await db.select().from(schema.ideas);
    const decision = (key: IdeaKey) => ideas.find((i) => i.id === ideaId(key))?.latestDecision;
    expect([
      decision("piaya"),
      decision("health-bowl"),
      decision("study-cafe"),
      decision("laundry"),
    ]).toEqual(["proceed", "hold", "proceed", "drop"]);
    expect(decision("bike-repair")).toBeNull();

    const kinds = (key: IdeaKey) =>
      entries
        .filter((e) => e.ideaId === ideaId(key))
        .map((e) => `${e.kind}:${e.value}`)
        .sort();
    expect(kinds("piaya")).toEqual([
      "go_no_go:delay",
      "validation_decision:proceed",
      "version_saved:null",
    ]);
    expect(kinds("health-bowl")).toEqual(["validation_decision:hold"]);
    expect(kinds("study-cafe")).toEqual([
      "go_no_go:launch",
      "validation_decision:proceed",
      "version_saved:null",
    ]);
    expect(kinds("laundry")).toEqual(["validation_decision:drop"]);
    expect(kinds("piaya-corp")).toEqual([]);
    expect(entries.find((e) => e.ideaId === ideaId("laundry"))?.reason).toBe(
      "Contribution margin is negative",
    );
  });

  test("Piaya Plan A: version with changes since, Delay recorded, execution rows with due dates", async () => {
    const plan = must(
      (
        await db
          .select()
          .from(schema.businessPlans)
          .where(eq(schema.businessPlans.id, planId("piaya-a")))
      )[0],
      "Plan A",
    );
    const versions = await db
      .select()
      .from(schema.planVersions)
      .where(eq(schema.planVersions.businessPlanId, plan.id));
    expect(versions.map((v) => v.name)).toEqual(["v1 For advisors"]);
    const answers = await db
      .select()
      .from(schema.planAnswers)
      .where(eq(schema.planAnswers.businessPlanId, plan.id));
    const version = must(versions[0], "version");
    const changed = answers.filter((a) => a.updatedAt.getTime() > version.savedAt.getTime());
    expect(changed.map((a) => a.questionKey)).toEqual(["P.24.2"]);
    const snapshot = version.snapshot as {
      answers: { questionKey: string; text: string | null }[];
    };
    const saved = snapshot.answers.find((a) => a.questionKey === "P.24.2");
    expect(saved?.text).toBeTruthy();
    expect(saved?.text).not.toBe(changed[0]?.text);

    const planB = must(
      (
        await db
          .select()
          .from(schema.businessPlans)
          .where(eq(schema.businessPlans.id, planId("piaya-b")))
      )[0],
      "Plan B",
    );
    expect(
      await db
        .select()
        .from(schema.planVersions)
        .where(eq(schema.planVersions.businessPlanId, planB.id)),
    ).toHaveLength(0);
    const draftAnswers = await db
      .select()
      .from(schema.planAnswers)
      .where(eq(schema.planAnswers.businessPlanId, planB.id));
    expect(draftAnswers.length).toBeGreaterThan(0);
    expect(draftAnswers.every((a) => a.copiedFrom != null)).toBe(true);

    const items = await db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.businessPlanId, plan.id));
    const today = todayInManila();
    const in2Days = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86400_000)
      .toISOString()
      .slice(0, 10);
    const actions = items.filter((i) => i.type === "next_action" && i.status !== "done");
    expect(actions.filter((i) => (i.dueDate ?? "9999") < today)).toHaveLength(1);
    expect(actions.filter((i) => i.dueDate === in2Days)).toHaveLength(1);
    expect(items.filter((i) => i.type === "milestone")).toHaveLength(6);
    expect(items.filter((i) => i.type === "launch")).toHaveLength(5);
    expect(items.filter((i) => i.type === "kpi")).toHaveLength(12);
    expect(items.filter((i) => i.type === "open_question")).toHaveLength(1);

    const entries = await db
      .select()
      .from(schema.decisionLogEntries)
      .where(eq(schema.decisionLogEntries.businessPlanId, plan.id));
    const goNoGo = must(
      entries.find((e) => e.kind === "go_no_go"),
      "Go / No-Go",
    );
    expect(goNoGo.value).toBe("delay");
    const conditions = (goNoGo.snapshot as { conditions: { delayIf: string } }).conditions;
    expect(conditions.delayIf).toBe(saved?.text as string);
  });

  test("Piaya Plan A has the material every Pitch Deck slide reads (design-spec 6.14)", async () => {
    const answers = await db
      .select()
      .from(schema.planAnswers)
      .where(eq(schema.planAnswers.businessPlanId, planId("piaya-a")));
    const filled = (key: string) => {
      const a = answers.find((x) => x.questionKey === key);
      return Boolean(a?.text?.trim()) || ((a?.rows as unknown[] | null)?.length ?? 0) > 0;
    };
    const oneMinute = [
      "P.01.1",
      "P.01.6",
      "P.03.1",
      "P.03.3",
      "P.03.4",
      "P.04.1",
      "P.04.2",
      "P.04.3",
      "P.05.1",
      "P.05.3",
      "P.06.8",
      "P.08.1",
      "P.10.1",
      "P.24.1",
    ];
    const fiveMinute = [
      "P.06.1",
      "P.06.2",
      "P.06.3",
      "P.06.4",
      "P.06.5",
      "P.06.7",
      "P.08.2",
      "P.08.11",
      "P.11.1",
      "P.20.2",
      "P.20.10",
      "P.20.11",
      "P.22.1",
      "P.24.2",
      "P.24.3",
      "P.30.1",
      "P.30.2",
    ];
    expect([...oneMinute, ...fiveMinute].filter((k) => !filled(k))).toEqual([]);

    const items = await db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.businessPlanId, planId("piaya-a")));
    const open = items.filter((i) => i.type === "next_action" && i.status !== "done" && i.dueDate);
    expect(open.length).toBeGreaterThanOrEqual(3);
    expect(items.filter((i) => i.type === "milestone" && i.dueDate)).toHaveLength(6);
  });

  test("Study Café has its launch version and KPI actuals", async () => {
    const versions = await db
      .select()
      .from(schema.planVersions)
      .where(eq(schema.planVersions.businessPlanId, planId("study-cafe-a")));
    expect(versions.map((v) => v.name)).toEqual(["v1 Launch review"]);
    const kpis = await db
      .select()
      .from(schema.executionItems)
      .where(
        and(
          eq(schema.executionItems.businessPlanId, planId("study-cafe-a")),
          eq(schema.executionItems.type, "kpi"),
        ),
      );
    expect(kpis.filter((k) => k.kpiActual != null).length).toBeGreaterThanOrEqual(3);
  });

  test("comments, mentions and notifications", async () => {
    const comments = await db.select().from(schema.comments);
    const roots = comments.filter((c) => c.parentId == null);
    expect(roots).toHaveLength(6);
    expect(roots.filter((c) => c.resolvedAt != null)).toHaveLength(1);
    expect(comments.some((c) => c.targetType === "self_analysis_answer")).toBe(true);

    const kenji = must(
      (await db.select().from(schema.users).where(eq(schema.users.email, "kenji@bcdx.example")))[0],
      "Kenji",
    );
    const mentions = await db.select().from(schema.commentMentions);
    expect(mentions.filter((m) => m.userId === kenji.id)).toHaveLength(2);
    const unread = await db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, kenji.id), isNull(schema.notifications.readAt)));
    expect(unread.filter((n) => n.kind === "mention")).toHaveLength(2);
  });

  test("history has manual edits, AI imports, a revert and the batches behind drafts and duplicates", async () => {
    const history = await db.select().from(schema.changeHistory);
    const sources = new Set(history.map((h) => h.source));
    for (const source of ["manual", "ai_import", "revert", "duplicate", "plan_draft"] as const) {
      expect(sources.has(source)).toBe(true);
    }
    expect(
      history.filter((h) => h.source === "revert").every((h) => h.revertedFromId != null),
    ).toBe(true);
    expect(history.some((h) => h.workspaceId == null && h.ownerUserId != null)).toBe(true);

    const countFor = async (key: IdeaKey, targetKey: string) => {
      const { validation } = await loadValidation(key);
      return history.filter((h) => h.containerId === validation.id && h.targetKey === targetKey)
        .length;
    };
    for (const [idea, key] of [
      ["piaya", "V.01.WHO"],
      ["piaya", "V.01.PROBLEM"],
      ["health-bowl", "V.02.OCEAN"],
    ] as const) {
      const count = await countFor(idea, key);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(4);
    }
  });

  test("timestamps are never in the future", async () => {
    const now = Date.now();
    const rows = await db.select().from(schema.changeHistory);
    expect(rows.filter((r) => r.changedAt.getTime() > now)).toEqual([]);
    const users = await db.select().from(schema.users);
    expect(users.filter((u) => (u.lastActiveAt?.getTime() ?? 0) > now)).toEqual([]);
  });
});
