import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, ideaId, seedDemo, userId } from "@moonx/db/seed";
import { computeEconomics, type EconomicsInputValues } from "@moonx/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import { ECONOMICS_FIELDS, loadValidationData } from "../src/lib/validation-data";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let ana: Record<string, string>;
let kenji: Record<string, string>;
let grace: Record<string, string>;
let admin: Record<string, string>;
let piaya: string;
let bowl: string;

beforeAll(async () => {
  t = await startTestApp();
  ana = await login(t.app, "ana");
  kenji = await login(t.app, "kenji");
  grace = await login(t.app, "grace");
  admin = await login(t.app, "admin");
  piaya = await validationOf("piaya");
  bowl = await validationOf("health-bowl");
});
afterAll(async () => {
  await t.close();
});

async function validationOf(key: Parameters<typeof ideaId>[0]) {
  const [row] = await t.db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, ideaId(key)));
  return (row as { id: string }).id;
}

const base = (vid: string) => `/api/v1/validations/${vid}`;
const nonexistent = "6f1f3f3a-1111-4111-8111-111111111111";
const history = (targetId: string) =>
  t.db
    .select()
    .from(schema.changeHistory)
    .where(eq(schema.changeHistory.targetId, targetId))
    .orderBy(asc(schema.changeHistory.changedAt));

async function setArchived(archived: boolean) {
  await t.db
    .update(schema.ideas)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(schema.ideas.id, ideaId("piaya")));
}

async function costs(vid = piaya, as = ana) {
  return call(t.app, "GET", `${base(vid)}/costs`, { as });
}

async function itemByKey(templateKey: string, vid = piaya) {
  const res = await costs(vid);
  const item = res.body.items.find((i: { templateKey: string }) => i.templateKey === templateKey);
  if (!item) throw new Error(`no cost item ${templateKey}`);
  return item;
}

const patchItem = (id: string, body: unknown, as = ana) =>
  call(t.app, "PATCH", `/api/v1/cost-items/${id}`, { as, body });

async function addItem(category: string, name: string, vid = piaya) {
  const res = await call(t.app, "POST", `${base(vid)}/cost-items`, {
    as: ana,
    body: { category, name },
  });
  expect(res.status).toBe(201);
  return res.body;
}

const code = (res: { status: number; body: { error: { code: string } } }) => [
  res.status,
  res.body.error.code,
];

describe("V12 GET costs", () => {
  test("rows are ordered by table then sortOrder and carry classification and comments", async () => {
    const res = await costs();
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["economicsInputs", "items", "result"]);
    expect(res.body.items).toHaveLength(24);
    const categories = res.body.items.map((i: { category: string }) => i.category);
    expect(categories).toEqual([
      ...Array(10).fill("initial"),
      ...Array(8).fill("monthly_fixed"),
      ...Array(6).fill("variable"),
    ]);
    for (const category of ["initial", "monthly_fixed", "variable"]) {
      const orders = res.body.items
        .filter((i: { category: string }) => i.category === category)
        .map((i: { sortOrder: number }) => i.sortOrder);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    }
    expect(res.body.items[0].templateKey).toBe("initial.equipment");
    expect(Object.keys(res.body.items[0]).sort()).toEqual(
      [
        "id",
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
        "classification",
        "sortOrder",
        "commentCount",
        "lockVersion",
        "updatedAt",
        "updatedBy",
      ].sort(),
    );
    const fee = await itemByKey("variable.payment_fee");
    expect(fee).toMatchObject({ inputMode: "percent_of_price", amount: null, percent: 0.03 });
    expect(fee.classification.state).toBe("fact");
  });

  test("result is computeEconomics over the stored rows and matches the Piaya numbers", async () => {
    const res = await costs();
    const data = (await loadValidationData(t.db, [piaya])).get(piaya);
    const loaded = data as NonNullable<typeof data>;
    const values: EconomicsInputValues = {
      sellingPrice: null,
      operatingDays: null,
      targetMargin: null,
      unitsConservative: null,
      unitsExpected: null,
      unitsStrong: null,
      unitsCapacity: null,
    };
    const key = {
      selling_price: "sellingPrice",
      operating_days: "operatingDays",
      target_margin: "targetMargin",
      units_conservative: "unitsConservative",
      units_expected: "unitsExpected",
      units_strong: "unitsStrong",
      units_capacity: "unitsCapacity",
    } as const;
    for (const row of loaded.economicsInputs) values[key[row.fieldKey]] = row.value;
    const rows = res.body.items.map((i: Record<string, unknown>) => ({
      id: i.id,
      category: i.category,
      templateKey: i.templateKey,
      inputMode: i.inputMode,
      amount: i.amount,
      percent: i.percent,
      fauState: (i.classification as { state: string }).state,
    }));
    expect(res.body.result).toEqual(computeEconomics(rows, values));

    const r = res.body.result;
    expect(r.variableCostPerUnit.value).toBeCloseTo(218.5, 6);
    expect(r.contributionMargin.value).toBeCloseTo(231.5, 6);
    expect(r.totals.initial.amount).toBe(169_500);
    expect(r.totals.monthlyFixed.amount).toBe(41_700);
    expect(r.breakEvenUnitsMonth.value).toBeCloseTo(180.13, 2);
    expect(r.breakEvenUnitsDay.value).toBeCloseTo(6.93, 2);
    expect(r.breakEvenRevenue.value).toBeCloseTo(81_058, 0);
    expect(r.targetMarginUnitsMonth.value).toBeCloseTo(254.3, 1);
    expect(r.defaultsUsed).toEqual({ operatingDays: false, targetMargin: true });
    const expected = r.scenarios.find((s: { key: string }) => s.key === "expected");
    expect(expected.operatingProfit.value).toBeCloseTo(18_490, 4);
    const conservative = r.scenarios.find((s: { key: string }) => s.key === "conservative");
    expect(conservative.operatingProfit.value).toBeCloseTo(-5_586, 4);
    expect(r.paybackMonths.value).toBeCloseTo(9.17, 2);
    expect(r.simpleRoi.value).toBeCloseTo(1.309, 3);
  });

  test("economicsInputs lists all seven fields; an unentered one is unsaved and empty", async () => {
    const res = await costs();
    expect(res.body.economicsInputs.map((e: { fieldKey: string }) => e.fieldKey)).toEqual(
      ECONOMICS_FIELDS,
    );
    const margin = res.body.economicsInputs.find(
      (e: { fieldKey: string }) => e.fieldKey === "target_margin",
    );
    expect(margin).toEqual({
      fieldKey: "target_margin",
      value: null,
      lockVersion: 0,
      updatedAt: null,
      updatedBy: null,
      commentCount: 0,
      classification: { fau: null, confidence: null, state: "empty", evidence: [] },
    });
    const price = res.body.economicsInputs[0];
    expect(price).toMatchObject({ fieldKey: "selling_price", value: 450 });
    expect(price.classification.state).toBe("assumption");
  });

  test("an Unknown row and the counted comments show", async () => {
    const permits = await itemByKey("initial.permits", bowl);
    expect(permits.classification).toMatchObject({ fau: "unknown", state: "unknown" });
    expect(permits.amount).toBeNull();
    await t.db.insert(schema.comments).values([
      {
        workspaceId: BCDX,
        targetType: "cost_item",
        targetId: permits.id,
        authorId: userId("ana"),
        body: "Ask the city hall",
      },
      {
        workspaceId: BCDX,
        targetType: "economics_input",
        targetId: bowl,
        targetKey: "selling_price",
        authorId: userId("ana"),
        body: "Price?",
      },
    ]);
    const res = await costs(bowl);
    expect(res.body.items.find((i: { id: string }) => i.id === permits.id).commentCount).toBe(1);
    expect(
      res.body.economicsInputs.find((e: { fieldKey: string }) => e.fieldKey === "selling_price")
        .commentCount,
    ).toBe(1);
  });

  test("roles, strangers and missing ids", async () => {
    expect((await costs(piaya, grace)).status).toBe(200);
    expect(code(await costs(piaya, admin))).toEqual([403, "NO_ACCESS"]);
    expect((await costs(nonexistent)).status).toBe(404);
    expect((await call(t.app, "GET", `${base(piaya)}/costs`)).status).toBe(401);
    expect((await call(t.app, "GET", `${base("x")}/costs`, { as: ana })).status).toBe(422);
  });
});

describe("V13 POST cost-items", () => {
  test("creates an Empty row at the end of its table", async () => {
    const before = await costs();
    const lastVariable = Math.max(
      ...before.body.items
        .filter((i: { category: string }) => i.category === "variable")
        .map((i: { sortOrder: number }) => i.sortOrder),
    );
    const res = await call(t.app, "POST", `${base(piaya)}/cost-items`, {
      as: kenji,
      body: { category: "variable", name: " Sticker " },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      category: "variable",
      templateKey: null,
      name: "Sticker",
      inputMode: "amount",
      amount: null,
      percent: null,
      isLumpSum: false,
      whyNeeded: null,
      canReduce: null,
      notes: null,
      sortOrder: lastVariable + 1,
      lockVersion: 0,
      commentCount: 0,
      classification: { fau: null, confidence: null, state: "empty", evidence: [] },
      updatedBy: { id: userId("kenji") },
    });
    const after = await costs();
    expect(after.body.items.at(-1).id).toBe(res.body.id);
    const rows = await history(res.body.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "create",
      source: "manual",
      containerType: "validation",
      containerId: piaya,
      sectionKey: "costs",
      targetType: "cost_item",
      workspaceId: BCDX,
      before: null,
    });
    expect(rows[0]?.after).toMatchObject({ category: "variable", name: "Sticker", amount: null });
  });

  test("validation, roles and archive", async () => {
    const send = (body: unknown, as = ana) =>
      call(t.app, "POST", `${base(piaya)}/cost-items`, { as, body });
    for (const body of [
      {},
      { category: "initial" },
      { name: "A" },
      { category: "other", name: "A" },
      { category: "initial", name: "" },
      { category: "initial", name: "x".repeat(201) },
    ]) {
      expect(code(await send(body))).toEqual([422, "VALIDATION_FAILED"]);
    }
    expect((await send({ category: "initial", name: "x".repeat(200) })).status).toBe(201);
    expect(code(await send({ category: "initial", name: "A" }, grace))).toEqual([403, "FORBIDDEN"]);
    expect(code(await send({ category: "initial", name: "A" }, admin))).toEqual([403, "NO_ACCESS"]);
    await setArchived(true);
    expect(code(await send({ category: "initial", name: "A" }))).toEqual([409, "ARCHIVED"]);
    await setArchived(false);
  });

  test("deleting every row of a table and adding one starts at 0", async () => {
    const vid = bowl;
    const rows = (await costs(vid)).body.items.filter(
      (i: { category: string }) => i.category === "variable",
    );
    for (const row of rows) {
      await call(t.app, "DELETE", `/api/v1/cost-items/${row.id}`, { as: ana });
    }
    const created = await addItem("variable", "Only", vid);
    expect(created.sortOrder).toBeGreaterThanOrEqual(0);
    const list = (await costs(vid)).body.items.filter(
      (i: { category: string }) => i.category === "variable",
    );
    expect(list.map((i: { id: string }) => i.id)).toEqual([created.id]);
  });
});

describe("V14 PATCH cost-items", () => {
  test("sets an amount; the row becomes Unclassified; the history row has before and after", async () => {
    const row = await addItem("initial", "Signage");
    const res = await patchItem(row.id, {
      lockVersion: 0,
      amount: 1500.5,
      whyNeeded: "Shop front",
      canReduce: "partly",
      notes: "Quote pending",
      isLumpSum: true,
      name: "Signage board",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "Signage board",
      amount: 1500.5,
      percent: null,
      whyNeeded: "Shop front",
      canReduce: "partly",
      notes: "Quote pending",
      isLumpSum: true,
      lockVersion: 1,
      classification: { fau: null, state: "unclassified" },
    });
    const update = (await history(row.id)).find((r) => r.action === "update");
    expect(update).toMatchObject({
      source: "manual",
      targetType: "cost_item",
      sectionKey: "costs",
    });
    expect(update?.before).toMatchObject({ name: "Signage", amount: null, isLumpSum: false });
    expect(update?.after).toMatchObject({ name: "Signage board", amount: 1500.5, isLumpSum: true });
    expect(res.body.updatedBy.id).toBe(userId("ana"));
  });

  test("amount and percent ranges answer OUT_OF_RANGE, not VALIDATION_FAILED", async () => {
    const fixed = await addItem("initial", "Range");
    const variable = await addItem("variable", "Range v");
    for (const body of [{ amount: -1 }, { amount: -0.01 }, { amount: 1e13 }]) {
      expect(code(await patchItem(fixed.id, { lockVersion: 0, ...body }))).toEqual([
        422,
        "OUT_OF_RANGE",
      ]);
    }
    for (const body of [{ percent: 1.01 }, { percent: -0.1 }]) {
      expect(
        code(
          await patchItem(variable.id, { lockVersion: 0, inputMode: "percent_of_price", ...body }),
        ),
      ).toEqual([422, "OUT_OF_RANGE"]);
    }
    const ok = await patchItem(variable.id, {
      lockVersion: 0,
      inputMode: "percent_of_price",
      percent: 1,
    });
    expect(ok.body).toMatchObject({ percent: 1, amount: null });
    expect((await patchItem(fixed.id, { lockVersion: 0, amount: 0 })).body.amount).toBe(0);
    expect((await patchItem(fixed.id, { lockVersion: 1, amount: "12" })).status).toBe(422);
    expect((await patchItem(fixed.id, { lockVersion: 1, amount: "12" })).body.error.code).toBe(
      "VALIDATION_FAILED",
    );
  });

  test("a percent of price belongs to the variable table only", async () => {
    const initial = await addItem("initial", "Not variable");
    const monthly = await addItem("monthly_fixed", "Not variable either");
    for (const row of [initial, monthly]) {
      expect(
        code(await patchItem(row.id, { lockVersion: 0, inputMode: "percent_of_price" })),
      ).toEqual([422, "PERCENT_ONLY_FOR_VARIABLE"]);
      expect(code(await patchItem(row.id, { lockVersion: 0, percent: 0.1 }))).toEqual([
        422,
        "PERCENT_ONLY_FOR_VARIABLE",
      ]);
      expect((await patchItem(row.id, { lockVersion: 0, percent: null })).status).toBe(200);
    }
  });

  test("switching the input mode clears the other value; a value for the inactive mode is refused", async () => {
    const row = await addItem("variable", "Mode");
    const amount = await patchItem(row.id, { lockVersion: 0, amount: 12 });
    expect(amount.body).toMatchObject({ amount: 12, percent: null, inputMode: "amount" });
    const toPercent = await patchItem(row.id, {
      lockVersion: 1,
      inputMode: "percent_of_price",
    });
    expect(toPercent.body).toMatchObject({
      inputMode: "percent_of_price",
      amount: null,
      percent: null,
      classification: { state: "empty" },
    });
    expect(
      (await patchItem(row.id, { lockVersion: 2, inputMode: "percent_of_price", percent: 0.035 }))
        .body,
    ).toMatchObject({ percent: 0.035, amount: null, classification: { state: "unclassified" } });
    const refused = await patchItem(row.id, { lockVersion: 3, amount: 5 });
    expect(code(refused)).toEqual([422, "VALIDATION_FAILED"]);
    const back = await patchItem(row.id, { lockVersion: 3, inputMode: "amount" });
    expect(back.body).toMatchObject({ inputMode: "amount", amount: null, percent: null });
    const refusedPercent = await patchItem(row.id, { lockVersion: 4, percent: 0.2 });
    expect(code(refusedPercent)).toEqual([422, "VALIDATION_FAILED"]);
  });

  test("F/A/U rules: confidence, evidence, Unknown clears the numbers", async () => {
    const row = await addItem("variable", "Fau");
    let lock = 0;
    const send = async (body: Record<string, unknown>) => {
      const res = await patchItem(row.id, { lockVersion: lock, ...body });
      if (res.status === 200) lock = res.body.lockVersion;
      return res;
    };
    await send({ inputMode: "percent_of_price", percent: 0.3 });
    expect(code(await send({ classification: { fau: "assumption" } }))).toEqual([
      422,
      "CONFIDENCE_REQUIRED",
    ]);
    const assumption = await send({ classification: { fau: "assumption", confidence: "high" } });
    expect(assumption.body.classification).toMatchObject({
      fau: "assumption",
      confidence: "high",
      state: "assumption",
    });
    expect(code(await send({ classification: { fau: "fact" } }))).toEqual([
      422,
      "FACT_REQUIRES_EVIDENCE",
    ]);
    await t.db.insert(schema.evidenceLinks).values({
      workspaceId: BCDX,
      validationId: piaya,
      targetType: "cost_item",
      targetId: row.id,
      url: "https://example.com/quote",
      createdById: userId("ana"),
    });
    const fact = await send({ classification: { fau: "fact" } });
    expect(fact.body.classification).toMatchObject({ fau: "fact", state: "fact" });
    expect(fact.body.classification.evidence).toHaveLength(1);
    const snapshot = (await history(row.id)).filter((r) => r.action === "update").at(-1);
    expect(
      ((snapshot as NonNullable<typeof snapshot>).after as { evidence: string[] }).evidence,
    ).toHaveLength(1);

    const unknown = await send({ classification: { fau: "unknown" } });
    expect(unknown.body).toMatchObject({
      amount: null,
      percent: null,
      classification: { fau: "unknown", state: "unknown" },
    });
    const typed = await send({ percent: 0.4 });
    expect(typed.body).toMatchObject({
      percent: 0.4,
      classification: { fau: null, state: "unclassified" },
    });
    const both = await send({ percent: 0.5, classification: { fau: "unknown" } });
    expect(both.body).toMatchObject({ percent: null, classification: { fau: "unknown" } });
    const cleared = await send({ classification: { fau: "assumption", confidence: "low" } });
    expect(cleared.body.classification.state).toBe("empty");
    const dropped = await send({
      percent: 0.1,
      classification: { fau: "assumption", confidence: "low" },
    });
    expect(dropped.body.classification).toMatchObject({ fau: "assumption", confidence: "low" });
    const removed = await send({ percent: null });
    expect(removed.body).toMatchObject({
      percent: null,
      classification: { fau: null, state: "empty" },
    });
    expect(code(await send({ classification: { fau: "unknown", confidence: "low" } }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
  });

  test("a Fact that loses its evidence log stays Fact (no evidence) through an edit", async () => {
    const rent = await itemByKey("monthly.rent");
    expect(rent.classification.state).toBe("fact");
    const res = await patchItem(rent.id, { lockVersion: rent.lockVersion, amount: 12_500 });
    expect(res.body.classification.fau).toBe("fact");
    expect(res.body.amount).toBe(12_500);
  });

  test("optimistic lock: 409 with the current row, force overwrites", async () => {
    const row = await addItem("initial", "Lock");
    await patchItem(row.id, { lockVersion: 0, amount: 10 });
    const stale = await patchItem(row.id, { lockVersion: 0, amount: 99 }, kenji);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("CONFLICT");
    expect(stale.body.error.current).toMatchObject({
      lockVersion: 1,
      updatedBy: { id: userId("ana") },
      value: { id: row.id, amount: 10, classification: { state: "unclassified" } },
    });
    const forced = await patchItem(row.id, { lockVersion: 0, amount: 99, force: true }, kenji);
    expect(forced.body).toMatchObject({ amount: 99, lockVersion: 2 });
    expect((await history(row.id)).filter((r) => r.action === "update")).toHaveLength(2);
  });

  test("validation, roles, archive, missing row", async () => {
    const row = await addItem("initial", "Perm");
    expect(code(await patchItem(row.id, { amount: 1 }))).toEqual([422, "VALIDATION_FAILED"]);
    expect(code(await patchItem(row.id, { lockVersion: 0, name: "" }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(code(await patchItem(row.id, { lockVersion: 0, canReduce: "maybe" }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(code(await patchItem(row.id, { lockVersion: 0, inputMode: "x" }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(code(await patchItem(row.id, { lockVersion: 0, amount: 1 }, grace))).toEqual([
      403,
      "FORBIDDEN",
    ]);
    expect(code(await patchItem(row.id, { lockVersion: 0, amount: 1 }, admin))).toEqual([
      403,
      "NO_ACCESS",
    ]);
    expect((await patchItem(nonexistent, { lockVersion: 0 })).status).toBe(404);
    await setArchived(true);
    expect(code(await patchItem(row.id, { lockVersion: 0, amount: 1 }))).toEqual([409, "ARCHIVED"]);
    await setArchived(false);
  });
});

describe("V14 DELETE cost-items", () => {
  test("a template row can be deleted; totals and the history follow", async () => {
    const before = (await costs()).body.result.totals.initial.amount;
    const permits = await itemByKey("initial.permits");
    expect(permits.amount).toBe(8500);
    const denied = await call(t.app, "DELETE", `/api/v1/cost-items/${permits.id}`, { as: grace });
    expect(denied.status).toBe(403);
    const res = await call(t.app, "DELETE", `/api/v1/cost-items/${permits.id}`, { as: ana });
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    const after = await costs();
    expect(after.body.items.some((i: { id: string }) => i.id === permits.id)).toBe(false);
    expect(after.body.result.totals.initial.amount).toBe(before - 8500);
    const [stored] = await t.db
      .select()
      .from(schema.costItems)
      .where(eq(schema.costItems.id, permits.id));
    expect(stored?.deletedAt).not.toBeNull();
    const rows = (await history(permits.id)).filter((r) => r.action === "delete");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ after: null, source: "manual", sectionKey: "costs" });
    expect(rows[0]?.before).toMatchObject({ name: permits.name, amount: 8500 });
    expect(
      (await call(t.app, "DELETE", `/api/v1/cost-items/${permits.id}`, { as: ana })).status,
    ).toBe(404);
    expect((await patchItem(permits.id, { lockVersion: 0 })).status).toBe(404);
    await setArchived(true);
    const other = await itemByKey("initial.branding");
    expect(
      code(await call(t.app, "DELETE", `/api/v1/cost-items/${other.id}`, { as: ana })),
    ).toEqual([409, "ARCHIVED"]);
    await setArchived(false);
  });

  test("a deleted row is not counted by the checks", async () => {
    const rows = await t.db
      .select({ id: schema.costItems.id })
      .from(schema.costItems)
      .where(and(eq(schema.costItems.validationId, piaya), isNull(schema.costItems.deletedAt)));
    const data = (await loadValidationData(t.db, [piaya])).get(piaya);
    expect(data?.costItems).toHaveLength(rows.length);
  });
});

describe("V15 GET economics and V16 PUT", () => {
  beforeAll(async () => {
    await seedDemo(t.db);
  });

  const put = (field: string, body: unknown, as = ana, vid = piaya) =>
    call(t.app, "PUT", `${base(vid)}/economics/${field}`, { as, body });

  test("GET returns the inputs in order, the worth answer, the result and the rows", async () => {
    const res = await call(t.app, "GET", `${base(piaya)}/economics`, { as: grace });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["costItems", "inputs", "result", "worth"]);
    expect(res.body.inputs.map((i: { fieldKey: string }) => i.fieldKey)).toEqual(ECONOMICS_FIELDS);
    expect(res.body.inputs).toHaveLength(7);
    expect(res.body.worth).toMatchObject({ questionKey: "V.08.WORTH", hidden: false });
    expect(res.body.worth.classification).toHaveProperty("state");
    const sameAsCosts = await costs();
    expect(res.body.result).toEqual(sameAsCosts.body.result);
    expect(res.body.costItems).toEqual(sameAsCosts.body.items);
    expect(res.body.inputs).toEqual(sameAsCosts.body.economicsInputs);
  });

  test("worth is unsaved when nobody has answered", async () => {
    await t.db
      .delete(schema.validationAnswers)
      .where(
        and(
          eq(schema.validationAnswers.validationId, bowl),
          eq(schema.validationAnswers.questionKey, "V.08.WORTH"),
        ),
      );
    const res = await call(t.app, "GET", `${base(bowl)}/economics`, { as: ana });
    expect(res.body.worth).toEqual({
      questionKey: "V.08.WORTH",
      text: null,
      lockVersion: 0,
      updatedAt: null,
      updatedBy: null,
      hidden: false,
      commentCount: 0,
      classification: { fau: null, confidence: null, state: "empty", evidence: [] },
    });
  });

  test("GET roles", async () => {
    const get = (as: Record<string, string> | undefined, vid = piaya) =>
      call(t.app, "GET", `${base(vid)}/economics`, { as });
    expect(code(await get(admin))).toEqual([403, "NO_ACCESS"]);
    expect((await get(ana, nonexistent)).status).toBe(404);
    expect((await get(undefined)).status).toBe(401);
  });

  test("PUT creates a missing input at lockVersion 1 and writes a create history row", async () => {
    const res = await put("target_margin", { value: 0.2, lockVersion: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fieldKey: "target_margin",
      value: 0.2,
      lockVersion: 1,
      commentCount: 0,
      classification: { fau: null, state: "unclassified" },
      updatedBy: { id: userId("ana") },
    });
    const rows = (await history(piaya)).filter((r) => r.targetKey === "target_margin");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "create",
      source: "manual",
      containerType: "validation",
      containerId: piaya,
      sectionKey: "economics",
      targetType: "economics_input",
      targetId: piaya,
      targetKey: "target_margin",
      before: null,
      after: { value: 0.2, fau: null, confidence: null, evidence: [] },
    });
    const result = (await costs()).body.result;
    expect(result.defaultsUsed.targetMargin).toBe(false);
    expect(result.targetMarginUnitsMonth.value).not.toBeCloseTo(254.3, 1);
  });

  test("PUT updates under the lock; a stale version is 409 with the current input; force", async () => {
    const ok = await put("units_expected", { value: 12, lockVersion: 0 });
    expect(ok.body).toMatchObject({ value: 12, lockVersion: 1 });
    const update = (await history(piaya)).find(
      (r) => r.targetKey === "units_expected" && r.action === "update",
    );
    expect(update?.before).toMatchObject({ value: 10 });
    expect(update?.after).toMatchObject({ value: 12 });
    const stale = await put("units_expected", { value: 99, lockVersion: 0 }, kenji);
    expect(stale.status).toBe(409);
    expect(stale.body.error.current).toMatchObject({
      lockVersion: 1,
      value: { fieldKey: "units_expected", value: 12 },
    });
    const forced = await put("units_expected", { value: 99, lockVersion: 0, force: true }, kenji);
    expect(forced.body).toMatchObject({ value: 99, lockVersion: 2 });
    expect(code(await put("units_strong", { value: 1, lockVersion: 5 }))).toEqual([
      409,
      "CONFLICT",
    ]);
    const stillMissing = await put("target_margin", { value: 0.1, lockVersion: 0 });
    expect(stillMissing.status).toBe(409);
    expect(stillMissing.body.error.current.lockVersion).toBe(1);
  });

  test("a value out of range is OUT_OF_RANGE; the field key is checked as a parameter", async () => {
    const cases: [string, number][] = [
      ["selling_price", 0],
      ["selling_price", -5],
      ["operating_days", 0],
      ["operating_days", 32],
      ["operating_days", 26.5],
      ["target_margin", 0.995],
      ["target_margin", -0.1],
      ["units_conservative", -1],
      ["units_expected", 2e9],
      ["units_strong", -0.5],
      ["units_capacity", -1],
    ];
    for (const [field, value] of cases) {
      expect(code(await put(field, { value, lockVersion: 99, force: true }))).toEqual([
        422,
        "OUT_OF_RANGE",
      ]);
    }
    for (const [field, value] of [
      ["selling_price", 0.01],
      ["operating_days", 31],
      ["operating_days", 1],
      ["target_margin", 0.99],
      ["target_margin", 0],
      ["units_capacity", 7.5],
    ] as const) {
      expect((await put(field, { value, lockVersion: 0, force: true })).status).toBe(200);
    }
    expect(code(await put("rent", { value: 1, lockVersion: 0 }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(code(await put("selling_price", { value: "12", lockVersion: 0 }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(code(await put("selling_price", { lockVersion: 0 }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(code(await put("selling_price", { value: 1 }))).toEqual([422, "VALIDATION_FAILED"]);
  });

  test("null clears the value and the F/A/U; Unknown clears the value", async () => {
    const field = "units_conservative";
    const current = (await costs()).body.economicsInputs.find(
      (e: { fieldKey: string }) => e.fieldKey === field,
    );
    const cleared = await put(field, { value: null, lockVersion: current.lockVersion });
    expect(cleared.body).toMatchObject({
      value: null,
      classification: { fau: null, confidence: null, state: "empty" },
    });
    const assumption = await put(field, {
      value: 5,
      classification: { fau: "assumption", confidence: "medium" },
      lockVersion: cleared.body.lockVersion,
    });
    expect(assumption.body.classification).toMatchObject({
      fau: "assumption",
      confidence: "medium",
    });
    const unknown = await put(field, {
      value: 7,
      classification: { fau: "unknown" },
      lockVersion: assumption.body.lockVersion,
    });
    expect(unknown.body).toMatchObject({
      value: null,
      classification: { fau: "unknown", state: "unknown" },
    });
    const typed = await put(field, { value: 8, lockVersion: unknown.body.lockVersion });
    expect(typed.body).toMatchObject({
      value: 8,
      classification: { fau: null, state: "unclassified" },
    });
    expect(
      code(
        await put(field, {
          value: 8,
          lockVersion: typed.body.lockVersion,
          classification: { fau: "assumption" },
        }),
      ),
    ).toEqual([422, "CONFIDENCE_REQUIRED"]);
    expect(
      code(
        await put(field, {
          value: 8,
          lockVersion: typed.body.lockVersion,
          classification: { fau: "fact" },
        }),
      ),
    ).toEqual([422, "FACT_REQUIRES_EVIDENCE"]);
    const link = await t.db
      .insert(schema.evidenceLinks)
      .values({
        workspaceId: BCDX,
        validationId: piaya,
        targetType: "economics_input",
        targetId: piaya,
        targetKey: field,
        url: "https://example.com/units",
        createdById: userId("ana"),
      })
      .returning();
    const fact = await put(field, {
      value: 8,
      lockVersion: typed.body.lockVersion,
      classification: { fau: "fact" },
    });
    expect(fact.body.classification).toMatchObject({ fau: "fact", state: "fact" });
    const last = (await history(piaya)).filter((r) => r.targetKey === field).at(-1);
    expect(((last as NonNullable<typeof last>).after as { evidence: string[] }).evidence).toEqual([
      link[0]?.id as string,
    ]);
    const empty = await put(field, { value: null, lockVersion: fact.body.lockVersion });
    expect(empty.body.classification.state).toBe("empty");
  });

  test("a change moves the result of V12 and V15", async () => {
    await put("selling_price", { value: 450, lockVersion: 0, force: true });
    const before = (await costs()).body.result.breakEvenUnitsMonth.value;
    const price = (await costs()).body.economicsInputs[0];
    await put("selling_price", { value: 600, lockVersion: price.lockVersion });
    const after = await call(t.app, "GET", `${base(piaya)}/economics`, { as: ana });
    expect(after.body.result.breakEvenUnitsMonth.value).toBeLessThan(before);
    expect(after.body.inputs[0]).toMatchObject({ fieldKey: "selling_price", value: 600 });
  });

  test("Viewer, stranger, archived idea and another validation", async () => {
    expect(code(await put("selling_price", { value: 1, lockVersion: 0 }, grace))).toEqual([
      403,
      "FORBIDDEN",
    ]);
    expect(code(await put("selling_price", { value: 1, lockVersion: 0 }, admin))).toEqual([
      403,
      "NO_ACCESS",
    ]);
    expect(
      (await put("selling_price", { value: 1, lockVersion: 0 }, ana, nonexistent)).status,
    ).toBe(404);
    await setArchived(true);
    expect(code(await put("selling_price", { value: 1, lockVersion: 0 }))).toEqual([
      409,
      "ARCHIVED",
    ]);
    await setArchived(false);
    const before = (await costs(bowl)).body.economicsInputs;
    await put("operating_days", { value: 20, lockVersion: 0, force: true });
    expect(
      (await costs(bowl)).body.economicsInputs.map((e: { value: number | null }) => e.value),
    ).toEqual(before.map((e: { value: number | null }) => e.value));
  });
});

describe("V17 cost-items order", () => {
  const put = (body: unknown, as = ana, vid = piaya) =>
    call(t.app, "PUT", `${base(vid)}/cost-items/order`, { as, body });
  const table = async (category: string) =>
    (await costs()).body.items
      .filter((i: { category: string }) => i.category === category)
      .map((i: { id: string }) => i.id) as string[];

  test("one table is renumbered 0..n-1 and the others stay", async () => {
    const lockBefore = Object.fromEntries(
      (await costs()).body.items.map((i: { id: string; lockVersion: number }) => [
        i.id,
        i.lockVersion,
      ]),
    );
    const monthlyBefore = await table("monthly_fixed");
    const variable = await table("variable");
    const reversed = [...variable].reverse();
    const historyCount = (await t.db.select().from(schema.changeHistory)).length;
    const res = await put({ ids: reversed, category: "variable" });
    expect(res.status).toBe(204);
    expect(await table("variable")).toEqual(reversed);
    expect(await table("monthly_fixed")).toEqual(monthlyBefore);
    const items = (await costs()).body.items.filter(
      (i: { category: string }) => i.category === "variable",
    );
    expect(items.map((i: { sortOrder: number }) => i.sortOrder)).toEqual(reversed.map((_, i) => i));
    const lockAfter = Object.fromEntries(
      (await costs()).body.items.map((i: { id: string; lockVersion: number }) => [
        i.id,
        i.lockVersion,
      ]),
    );
    expect(lockAfter).toEqual(lockBefore);
    expect((await t.db.select().from(schema.changeHistory)).length).toBe(historyCount);
  });

  test("category is required and the ids must be exactly that table's rows", async () => {
    const initial = await table("initial");
    expect(code(await put({ ids: initial }))).toEqual([422, "VALIDATION_FAILED"]);
    expect(code(await put({ ids: initial, category: "variable" }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(code(await put({ ids: initial.slice(1), category: "initial" }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(code(await put({ ids: [...initial, nonexistent], category: "initial" }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect(
      code(await put({ ids: [initial[0], initial[0], ...initial.slice(2)], category: "initial" })),
    ).toEqual([422, "VALIDATION_FAILED"]);
    expect(code(await put({ ids: initial, category: "weekly" }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
    expect((await put({ ids: initial, category: "initial" })).status).toBe(204);
  });

  test("a deleted row is not part of its table", async () => {
    const row = await addItem("monthly_fixed", "Temp");
    await call(t.app, "DELETE", `/api/v1/cost-items/${row.id}`, { as: ana });
    const monthly = await table("monthly_fixed");
    expect(monthly).not.toContain(row.id);
    expect(code(await put({ ids: [...monthly, row.id], category: "monthly_fixed" }))).toEqual([
      422,
      "VALIDATION_FAILED",
    ]);
  });

  test("new rows go to the end of a reordered table; roles and archive", async () => {
    const monthly = await table("monthly_fixed");
    const added = await addItem("monthly_fixed", "Last");
    expect((await table("monthly_fixed")).at(-1)).toBe(added.id);
    expect(added.sortOrder).toBeGreaterThanOrEqual(monthly.length);
    const ids = await table("monthly_fixed");
    expect(code(await put({ ids, category: "monthly_fixed" }, grace))).toEqual([403, "FORBIDDEN"]);
    expect(code(await put({ ids, category: "monthly_fixed" }, admin))).toEqual([403, "NO_ACCESS"]);
    await setArchived(true);
    expect(code(await put({ ids, category: "monthly_fixed" }))).toEqual([409, "ARCHIVED"]);
    await setArchived(false);
  });
});
