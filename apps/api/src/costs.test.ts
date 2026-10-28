import { afterAll, describe, expect, test } from "bun:test";
import {
  changeHistory,
  costItems,
  economicsInputs,
  ideas,
  templateVersions,
  validations,
} from "@moonx/db";
import {
  costItemSchema,
  costsSchema,
  type ErrorCode,
  economicsInputSchema,
  economicsSchema,
  errorBodySchema,
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

const costs = async (team: Team, cookie = team.viewerCookie) => {
  const response = await app.handle(
    apiRequest("GET", `/api/v1/validations/${team.validationId}/costs`, {
      cookie,
    }),
  );
  expect(response.status).toBe(200);
  return costsSchema.parse(await response.json());
};

const economics = async (team: Team, cookie = team.viewerCookie) => {
  const response = await app.handle(
    apiRequest("GET", `/api/v1/validations/${team.validationId}/economics`, {
      cookie,
    }),
  );
  expect(response.status).toBe(200);
  return economicsSchema.parse(await response.json());
};

const editRow = (
  team: Team,
  id: string,
  body: Record<string, unknown>,
  cookie = team.ownerCookie,
) =>
  app.handle(apiRequest("PATCH", `/api/v1/cost-items/${id}`, { cookie, body }));

const savedRow = async (response: Response) => {
  expect(response.status).toBe(200);
  return costItemSchema.parse(await response.json());
};

const saveNumber = (
  team: Team,
  field: string,
  body: Record<string, unknown>,
  cookie = team.ownerCookie,
) =>
  app.handle(
    apiRequest(
      "PUT",
      `/api/v1/validations/${team.validationId}/economics/${field}`,
      { cookie, body },
    ),
  );

const savedNumber = async (response: Response) => {
  expect(response.status).toBe(200);
  return economicsInputSchema.parse(await response.json());
};

/** The row of the template's cost row `key`, as V12 lists it. */
const rowOf = async (team: Team, key: string) => {
  const row = (await costs(team)).items.find(
    (item) => item.templateKey === key,
  );
  if (row === undefined) throw new Error(`No cost row ${key}`);
  return row;
};

/** `request` with the raw JSON `body`, for what JSON.stringify cannot write (-0). */
const withRawBody = (request: Request, body: string) =>
  new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
  });

const historyOf = (targetId: string, targetKey: string | null = null) =>
  db
    .select()
    .from(changeHistory)
    .where(
      and(
        eq(changeHistory.targetId, targetId),
        targetKey === null ? undefined : eq(changeHistory.targetKey, targetKey),
      ),
    )
    .orderBy(asc(changeHistory.changedAt), asc(changeHistory.id));

/** The worked inputs of design-spec 8.3, entered through V14 and V16. */
const WORKED = {
  costs: {
    "variable.materials": 120,
    "variable.packaging": 45,
    "variable.payment_fee": { percent: 0.03 },
    "variable.delivery": 40,
    "variable.labor": 0,
    "variable.other": 0,
    "monthly.rent": 12_000,
    "monthly.salaries": 18_000,
    "monthly.utilities": 3_500,
    "monthly.internet": 1_200,
    "monthly.accounting": 2_000,
    "monthly.marketing": 5_000,
    "monthly.insurance": 0,
    "monthly.other": 0,
    "initial.equipment": 35_000,
    "initial.renovation": 20_000,
    "initial.lease_deposit": 24_000,
    "initial.permits": 8_500,
    "initial.inventory": 15_000,
    "initial.branding": 12_000,
    "initial.launch_marketing": 10_000,
    "initial.tech_setup": 5_000,
    "initial.working_capital": 40_000,
    "initial.other": 0,
  } as Record<string, number | { percent: number }>,
  numbers: {
    selling_price: 450,
    operating_days: 26,
    units_conservative: 6,
    units_expected: 10,
    units_strong: 15,
    units_capacity: 25,
  } as Record<string, number>,
};

describe("V12 GET /api/v1/validations/{validationId}/costs", () => {
  test("a new idea: the template rows Empty table by table, totals Empty, seven empty numbers", async () => {
    const team = await newTeam();
    const view = await costs(team);
    expect(view.items).toHaveLength(24);
    expect(view.items.map((item) => item.category)).toEqual([
      ...Array(10).fill("initial"),
      ...Array(8).fill("monthly_fixed"),
      ...Array(6).fill("variable"),
    ]);
    expect(view.items[0]).toMatchObject({
      templateKey: "initial.equipment",
      name: "Equipment",
      inputMode: "amount",
      amount: null,
      sortOrder: 0,
      lockVersion: 0,
      classification: { state: "empty", fau: null, evidence: [] },
    });
    expect(view.result.totals.initial).toEqual({
      amount: null,
      isLowerBound: true,
      unknownRows: 0,
      emptyRows: 10,
    });
    expect(
      view.economicsInputs.map((input) => [
        input.fieldKey,
        input.lockVersion,
        input.value,
      ]),
    ).toEqual([
      ["selling_price", 0, null],
      ["operating_days", 0, null],
      ["target_margin", 0, null],
      ["units_conservative", 0, null],
      ["units_expected", 0, null],
      ["units_strong", 0, null],
      ["units_capacity", 0, null],
    ]);
    expect(view.result.defaultsUsed).toEqual({
      operatingDays: true,
      targetMargin: true,
    });
  });
});

describe("V13 and V14 cost rows", () => {
  test("adds an Empty row with an empty name at the end of its table, and deletes rows, template ones too", async () => {
    const team = await newTeam();
    const response = await app.handle(
      apiRequest(
        "POST",
        `/api/v1/validations/${team.validationId}/cost-items`,
        {
          cookie: team.memberCookie,
          body: { category: "monthly_fixed", name: "   " },
        },
      ),
    );
    expect(response.status).toBe(201);
    const added = costItemSchema.parse(await response.json());
    expect(added).toMatchObject({
      category: "monthly_fixed",
      templateKey: null,
      name: "",
      sortOrder: 8,
      lockVersion: 0,
      classification: { state: "empty" },
    });
    const listed = (await costs(team)).items.filter(
      (item) => item.category === "monthly_fixed",
    );
    expect(listed.at(-1)?.id).toBe(added.id);
    const rent = await rowOf(team, "monthly.rent");
    const removed = await app.handle(
      apiRequest("DELETE", `/api/v1/cost-items/${rent.id}`, {
        cookie: team.ownerCookie,
      }),
    );
    expect(removed.status).toBe(204);
    expect((await costs(team)).items.some((item) => item.id === rent.id)).toBe(
      false,
    );
    expect(
      (await historyOf(rent.id)).map((row) => [row.action, row.after]),
    ).toEqual([
      ["create", expect.anything()],
      ["delete", null],
    ]);
    expect((await historyOf(added.id))[0]).toMatchObject({
      action: "create",
      sectionKey: "costs",
      after: { category: "monthly_fixed", name: "", templateKey: null },
    });
    // A deleted row is gone to every method.
    for (const response of [
      await editRow(team, rent.id, { amount: 1, lockVersion: 0 }),
      await app.handle(
        apiRequest("DELETE", `/api/v1/cost-items/${rent.id}`, {
          cookie: team.ownerCookie,
        }),
      ),
    ]) {
      expect((await errorOf(response)).code).toBe("NOT_FOUND");
    }
    const tooLong = await app.handle(
      apiRequest(
        "POST",
        `/api/v1/validations/${team.validationId}/cost-items`,
        {
          cookie: team.ownerCookie,
          body: { category: "initial", name: "x".repeat(201) },
        },
      ),
    );
    expect((await errorOf(tooLong)).details?.[0]?.path).toBe("name");
  });

  test("saves an amount, then F/A/U, under the lock, with a history row each", async () => {
    const team = await newTeam();
    const rent = await rowOf(team, "monthly.rent");
    const first = await savedRow(
      await editRow(team, rent.id, { amount: 15_000, lockVersion: 0 }),
    );
    expect(first).toMatchObject({
      amount: 15_000,
      lockVersion: 1,
      classification: { state: "unclassified" },
    });
    const second = await savedRow(
      await editRow(
        team,
        rent.id,
        {
          classification: { fau: "assumption", confidence: "medium" },
          notes: "Quoted by the landlord",
          lockVersion: 1,
        },
        team.memberCookie,
      ),
    );
    expect(second).toMatchObject({
      lockVersion: 2,
      notes: "Quoted by the landlord",
      classification: {
        fau: "assumption",
        confidence: "medium",
        state: "assumption",
      },
      updatedBy: { id: team.member.id },
    });
    // Nothing changes: no version, no history.
    expect(
      (
        await savedRow(
          await editRow(team, rent.id, { amount: 15_000, lockVersion: 2 }),
        )
      ).lockVersion,
    ).toBe(2);
    const stale = await editRow(team, rent.id, { amount: 1, lockVersion: 1 });
    expect(await errorOf(stale)).toMatchObject({
      code: "CONFLICT",
      current: {
        lockVersion: 2,
        value: { amount: 15_000, fau: "assumption", evidenceIds: [] },
      },
    });
    expect(
      (
        await savedRow(
          await editRow(team, rent.id, {
            amount: 1,
            lockVersion: 1,
            force: true,
          }),
        )
      ).lockVersion,
    ).toBe(3);
    const history = await historyOf(rent.id);
    expect(history.map((row) => row.action)).toEqual([
      "create",
      "update",
      "update",
      "update",
    ]);
    expect(history[2]?.after).toMatchObject({
      amount: 15_000,
      fau: "assumption",
      confidence: "medium",
      notes: "Quoted by the landlord",
    });
    // Clearing the amount clears the Assumption.
    expect(
      (
        await savedRow(
          await editRow(team, rent.id, { amount: null, lockVersion: 3 }),
        )
      ).classification,
    ).toMatchObject({ fau: null, confidence: null, state: "empty" });
  });

  test("Unknown takes the value away; a value typed into Unknown makes it Unclassified", async () => {
    const team = await newTeam();
    const permits = await rowOf(team, "initial.permits");
    await savedRow(
      await editRow(team, permits.id, { amount: 8_500, lockVersion: 0 }),
    );
    const unknown = await savedRow(
      await editRow(team, permits.id, {
        classification: { fau: "unknown" },
        lockVersion: 1,
      }),
    );
    expect(unknown).toMatchObject({
      amount: null,
      classification: { fau: "unknown", state: "unknown" },
    });
    const valued = await savedRow(
      await editRow(team, permits.id, { amount: 9_000, lockVersion: 2 }),
    );
    expect(valued).toMatchObject({
      amount: 9_000,
      classification: { fau: null, state: "unclassified" },
    });
    // A value sent with Unknown cannot hold.
    const both = await editRow(team, permits.id, {
      amount: 9_000,
      classification: { fau: "unknown" },
      lockVersion: 3,
    });
    expect(await errorOf(both)).toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ path: "amount" }],
    });
    // Assumption Low keeps the value (design-spec 6.0.3).
    expect(
      (
        await savedRow(
          await editRow(team, permits.id, {
            classification: { fau: "assumption", confidence: "low" },
            lockVersion: 3,
          }),
        )
      ).classification,
    ).toMatchObject({ fau: "assumption", confidence: "low" });
    // Unknown on an Empty row.
    const other = await rowOf(team, "initial.other");
    expect(
      (
        await savedRow(
          await editRow(team, other.id, {
            classification: { fau: "unknown" },
            lockVersion: 0,
          }),
        )
      ).classification.state,
    ).toBe("unknown");
    const totals = (await costs(team)).result.totals.initial;
    expect(totals).toMatchObject({
      amount: 9_000,
      unknownRows: 1,
      emptyRows: 8,
    });
  });

  test("a percentage of the price is for variable rows; switching the mode clears the value it leaves", async () => {
    const team = await newTeam();
    const rent = await rowOf(team, "monthly.rent");
    for (const body of [
      { inputMode: "percent_of_price", lockVersion: 0 },
      { percent: 0.1, lockVersion: 0 },
    ]) {
      expect((await errorOf(await editRow(team, rent.id, body))).code).toBe(
        "PERCENT_ONLY_FOR_VARIABLE",
      );
    }
    const materials = await rowOf(team, "variable.materials");
    await savedRow(
      await editRow(team, materials.id, { amount: 120, lockVersion: 0 }),
    );
    const mixed = await editRow(team, materials.id, {
      percent: 0.35,
      lockVersion: 1,
    });
    expect(await errorOf(mixed)).toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ path: "percent" }],
    });
    const switched = await savedRow(
      await editRow(team, materials.id, {
        inputMode: "percent_of_price",
        percent: 0.35,
        lockVersion: 1,
      }),
    );
    expect(switched).toMatchObject({
      inputMode: "percent_of_price",
      amount: null,
      percent: 0.35,
    });
    const amountOnPercent = await editRow(team, materials.id, {
      amount: 10,
      lockVersion: 2,
    });
    expect((await errorOf(amountOnPercent)).details?.[0]?.path).toBe("amount");
    // Without a price the variable cost needs it (17's "Needs price").
    const { result } = await costs(team);
    expect(result.variableCostPerUnit.reason).toBe("needs_price");
    const back = await savedRow(
      await editRow(team, materials.id, {
        inputMode: "amount",
        lockVersion: 2,
      }),
    );
    expect(back).toMatchObject({
      inputMode: "amount",
      amount: null,
      percent: null,
    });
  });

  test("values out of 6.0.8 are 422 OUT_OF_RANGE with details; F/A/U follows V3", async () => {
    const team = await newTeam();
    const rent = await rowOf(team, "monthly.rent");
    const fee = await rowOf(team, "variable.payment_fee");
    const cases: [string, Record<string, unknown>, string, string?][] = [
      [rent.id, { amount: -1, lockVersion: 0 }, "OUT_OF_RANGE", "amount"],
      [
        rent.id,
        { amount: 1_000_000_000_001, lockVersion: 0 },
        "OUT_OF_RANGE",
        "amount",
      ],
      [rent.id, { amount: 10.005, lockVersion: 0 }, "OUT_OF_RANGE", "amount"],
      [
        fee.id,
        { inputMode: "percent_of_price", percent: 1.5, lockVersion: 0 },
        "OUT_OF_RANGE",
        "percent",
      ],
      [
        fee.id,
        { inputMode: "percent_of_price", percent: 0.12345, lockVersion: 0 },
        "OUT_OF_RANGE",
        "percent",
      ],
      [
        rent.id,
        { amount: "15000", lockVersion: 0 },
        "VALIDATION_FAILED",
        "amount",
      ],
      [
        rent.id,
        { amount: 1, classification: { fau: "fact" }, lockVersion: 0 },
        "FACT_REQUIRES_EVIDENCE",
      ],
      [
        rent.id,
        { amount: 1, classification: { fau: "assumption" }, lockVersion: 0 },
        "CONFIDENCE_REQUIRED",
      ],
      [
        rent.id,
        {
          amount: 1,
          classification: { fau: "unknown", confidence: "low" },
          lockVersion: 0,
        },
        "VALIDATION_FAILED",
        "classification.confidence",
      ],
      [
        rent.id,
        {
          classification: { fau: "assumption", confidence: "low" },
          lockVersion: 0,
        },
        "VALIDATION_FAILED",
        "classification.fau",
      ],
      [
        rent.id,
        { canReduce: "maybe", lockVersion: 0 },
        "VALIDATION_FAILED",
        "canReduce",
      ],
    ];
    for (const [id, body, code, path] of cases) {
      const error = await errorOf(await editRow(team, id, body));
      expect({
        body,
        code: error.code as string,
        path: error.details?.[0]?.path,
      }).toEqual({
        body,
        code,
        path,
      });
    }
    const [stored] = await db
      .select()
      .from(costItems)
      .where(eq(costItems.id, rent.id));
    expect(stored).toMatchObject({ amount: null, lockVersion: 0 });
  });

  test("a Fact keeps its evidence: a row with evidence becomes a Fact through V14 too", async () => {
    const team = await newTeam();
    const rent = await rowOf(team, "monthly.rent");
    await savedRow(
      await editRow(team, rent.id, { amount: 12_000, lockVersion: 0 }),
    );
    const attached = await app.handle(
      apiRequest("POST", `/api/v1/validations/${team.validationId}/evidence`, {
        cookie: team.ownerCookie,
        body: {
          target: { type: "cost_item", id: rent.id },
          url: "https://example.com/lease",
          lockVersion: 1,
        },
      }),
    );
    expect(attached.status).toBe(201);
    const fact = await savedRow(
      await editRow(team, rent.id, {
        classification: { fau: "fact" },
        lockVersion: 2,
      }),
    );
    expect(fact.classification).toMatchObject({ fau: "fact", state: "fact" });
    expect(fact.classification.evidence).toHaveLength(1);
    const [last] = (await historyOf(rent.id)).slice(-1);
    expect(last?.after).toMatchObject({
      fau: "fact",
      evidenceIds: [fact.classification.evidence[0]?.id],
    });
  });

  test("a stale save is 409 CONFLICT before a 422 that the newer row causes", async () => {
    const team = await newTeam();
    const delivery = await rowOf(team, "variable.delivery");
    // Another member switches the row to a percentage; the owner still sees amounts.
    await savedRow(
      await editRow(
        team,
        delivery.id,
        { inputMode: "percent_of_price", percent: 0.1, lockVersion: 0 },
        team.memberCookie,
      ),
    );
    const typed = await editRow(team, delivery.id, {
      amount: 40,
      lockVersion: 0,
    });
    expect(await errorOf(typed)).toMatchObject({
      code: "CONFLICT",
      current: {
        lockVersion: 1,
        value: { inputMode: "percent_of_price", percent: 0.1 },
      },
    });
    // Then makes it Unknown, which takes the value away.
    await savedRow(
      await editRow(
        team,
        delivery.id,
        { classification: { fau: "unknown" }, lockVersion: 1 },
        team.memberCookie,
      ),
    );
    const assumed = await editRow(team, delivery.id, {
      classification: { fau: "assumption", confidence: "low" },
      lockVersion: 1,
    });
    expect(await errorOf(assumed)).toMatchObject({
      code: "CONFLICT",
      current: { lockVersion: 2, value: { fau: "unknown", percent: null } },
    });
    // At the stored version, the same requests are judged against the row.
    expect(
      await errorOf(
        await editRow(team, delivery.id, { amount: 40, lockVersion: 2 }),
      ),
    ).toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ path: "amount" }],
    });
    expect(
      await errorOf(
        await editRow(team, delivery.id, {
          classification: { fau: "assumption", confidence: "low" },
          lockVersion: 2,
        }),
      ),
    ).toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ path: "classification.fau" }],
    });
    // What the request settles alone keeps its 422 at a stale version.
    const rent = await rowOf(team, "monthly.rent");
    const alone: [string, Record<string, unknown>, ErrorCode][] = [
      [delivery.id, { amount: -1, lockVersion: 0 }, "OUT_OF_RANGE"],
      [
        delivery.id,
        { classification: { fau: "assumption" }, lockVersion: 0 },
        "CONFIDENCE_REQUIRED",
      ],
      [
        delivery.id,
        { inputMode: "amount", percent: 0.2, lockVersion: 0 },
        "VALIDATION_FAILED",
      ],
      [rent.id, { percent: 0.1, lockVersion: 5 }, "PERCENT_ONLY_FOR_VARIABLE"],
    ];
    for (const [id, body, code] of alone) {
      expect((await errorOf(await editRow(team, id, body))).code).toBe(code);
    }
    // The row's creation, then the member's two saves as one row (ADR-020), which ends
    // at the last accepted save: the refused requests wrote nothing.
    const rows = await historyOf(delivery.id);
    expect(rows.map((row) => row.action)).toEqual(["create", "update"]);
    expect(rows[1]?.before).toEqual(rows[0]?.after);
    expect(rows[1]?.after).toMatchObject({
      inputMode: "percent_of_price",
      percent: null,
      fau: "unknown",
    });
  });

  test("a -0 over a stored 0 changes nothing", async () => {
    const team = await newTeam();
    const labor = await rowOf(team, "variable.labor");
    await savedRow(
      await editRow(team, labor.id, { amount: 0, lockVersion: 0 }),
    );
    const again = await savedRow(
      await app.handle(
        withRawBody(
          apiRequest("PATCH", `/api/v1/cost-items/${labor.id}`, {
            cookie: team.ownerCookie,
            body: {},
          }),
          '{"amount":-0,"lockVersion":1}',
        ),
      ),
    );
    expect(again).toMatchObject({ amount: 0, lockVersion: 1 });
    expect(await historyOf(labor.id)).toHaveLength(2);
  });

  test("a Viewer may not change rows, and an archived idea refuses with 409 ARCHIVED", async () => {
    const team = await newTeam();
    const rent = await rowOf(team, "monthly.rent");
    expect(
      (
        await editRow(
          team,
          rent.id,
          { amount: 1, lockVersion: 0 },
          team.viewerCookie,
        )
      ).status,
    ).toBe(403);
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    for (const response of [
      await editRow(team, rent.id, { amount: 1, lockVersion: 0 }),
      await app.handle(
        apiRequest(
          "POST",
          `/api/v1/validations/${team.validationId}/cost-items`,
          {
            cookie: team.ownerCookie,
            body: { category: "initial", name: "" },
          },
        ),
      ),
      await app.handle(
        apiRequest("DELETE", `/api/v1/cost-items/${rent.id}`, {
          cookie: team.ownerCookie,
        }),
      ),
      await saveNumber(team, "selling_price", { value: 1, lockVersion: 0 }),
    ]) {
      expect((await errorOf(response)).code).toBe("ARCHIVED");
    }
  });
});

describe("V15 and V16 unit economics", () => {
  test("V16 makes the number at version 1, saves it under the lock, and writes nothing for no change", async () => {
    const team = await newTeam();
    const price = await savedNumber(
      await saveNumber(team, "selling_price", { value: 450, lockVersion: 0 }),
    );
    expect(price).toMatchObject({
      fieldKey: "selling_price",
      value: 450,
      lockVersion: 1,
      classification: { state: "unclassified" },
      updatedBy: { id: team.owner.id },
    });
    const assumed = await savedNumber(
      await saveNumber(
        team,
        "selling_price",
        {
          value: 450,
          classification: { fau: "assumption", confidence: "high" },
          lockVersion: 1,
        },
        team.memberCookie,
      ),
    );
    expect(assumed).toMatchObject({
      lockVersion: 2,
      classification: { state: "assumption" },
    });
    expect(
      (
        await savedNumber(
          await saveNumber(team, "selling_price", {
            value: 450,
            lockVersion: 2,
          }),
        )
      ).lockVersion,
    ).toBe(2);
    const stale = await saveNumber(team, "selling_price", {
      value: 500,
      lockVersion: 1,
    });
    expect(await errorOf(stale)).toMatchObject({
      code: "CONFLICT",
      current: {
        lockVersion: 2,
        value: {
          value: 450,
          fau: "assumption",
          confidence: "high",
          evidenceIds: [],
        },
      },
    });
    // A first save that never saw the stored one loses even with force.
    const lost = await saveNumber(team, "selling_price", {
      value: 500,
      lockVersion: 0,
      force: true,
    });
    expect((await errorOf(lost)).code).toBe("CONFLICT");
    // An empty number saved empty makes no row.
    expect(
      (
        await savedNumber(
          await saveNumber(team, "units_strong", {
            value: null,
            lockVersion: 0,
          }),
        )
      ).lockVersion,
    ).toBe(0);
    const rows = await db
      .select({ field: economicsInputs.fieldKey })
      .from(economicsInputs)
      .where(eq(economicsInputs.validationId, team.validationId));
    expect(rows.map((row) => row.field)).toEqual(["selling_price"]);
    const history = await historyOf(team.validationId, "selling_price");
    expect(history.map((row) => [row.action, row.sectionKey])).toEqual([
      ["create", "economics"],
      ["update", "economics"],
    ]);
    expect(history[0]?.after).toEqual({
      value: 450,
      fau: null,
      confidence: null,
      evidenceIds: [],
    });
  });

  test("V16: a -0 over a stored 0 changes nothing", async () => {
    const team = await newTeam();
    await savedNumber(
      await saveNumber(team, "units_conservative", {
        value: 0,
        lockVersion: 0,
      }),
    );
    const again = await savedNumber(
      await app.handle(
        withRawBody(
          apiRequest(
            "PUT",
            `/api/v1/validations/${team.validationId}/economics/units_conservative`,
            { cookie: team.ownerCookie, body: {} },
          ),
          '{"value":-0,"lockVersion":1}',
        ),
      ),
    );
    expect(again).toMatchObject({ value: 0, lockVersion: 1 });
    expect(
      await historyOf(team.validationId, "units_conservative"),
    ).toHaveLength(1);
  });

  test("V16 checks each field by its own rule, and F/A/U as every number", async () => {
    const team = await newTeam();
    const cases: [string, Record<string, unknown>, string, string?][] = [
      ["selling_price", { value: 0, lockVersion: 0 }, "OUT_OF_RANGE", "value"],
      [
        "selling_price",
        { value: 1.001, lockVersion: 0 },
        "OUT_OF_RANGE",
        "value",
      ],
      [
        "operating_days",
        { value: 32, lockVersion: 0 },
        "OUT_OF_RANGE",
        "value",
      ],
      [
        "operating_days",
        { value: 26.5, lockVersion: 0 },
        "OUT_OF_RANGE",
        "value",
      ],
      [
        "target_margin",
        { value: 0.995, lockVersion: 0 },
        "OUT_OF_RANGE",
        "value",
      ],
      [
        "target_margin",
        { value: 0.12345, lockVersion: 0 },
        "OUT_OF_RANGE",
        "value",
      ],
      [
        "units_expected",
        { value: 1_000_000_001, lockVersion: 0 },
        "OUT_OF_RANGE",
        "value",
      ],
      [
        "units_expected",
        { value: -1, lockVersion: 0 },
        "OUT_OF_RANGE",
        "value",
      ],
      ["units_expected", { lockVersion: 0 }, "VALIDATION_FAILED", "value"],
      [
        "capacity",
        { value: 1, lockVersion: 0 },
        "VALIDATION_FAILED",
        "fieldKey",
      ],
      [
        "units_expected",
        { value: 10, classification: { fau: "fact" }, lockVersion: 0 },
        "FACT_REQUIRES_EVIDENCE",
      ],
      [
        "units_expected",
        { value: 10, classification: { fau: "unknown" }, lockVersion: 0 },
        "VALIDATION_FAILED",
        "value",
      ],
      [
        "units_expected",
        {
          value: null,
          classification: { fau: "assumption", confidence: "low" },
          lockVersion: 0,
        },
        "VALIDATION_FAILED",
        "classification.fau",
      ],
    ];
    for (const [field, body, code, path] of cases) {
      const error = await errorOf(await saveNumber(team, field, body));
      expect({
        field,
        body,
        code: error.code as string,
        path: error.details?.[0]?.path,
      }).toEqual({
        field,
        body,
        code,
        path,
      });
    }
    // The edges of each rule pass.
    for (const [field, value] of [
      ["selling_price", 0.01],
      ["operating_days", 31],
      ["target_margin", 0.99],
      ["units_capacity", 0],
    ] as const) {
      expect(
        (await saveNumber(team, field, { value, lockVersion: 0 })).status,
      ).toBe(200);
    }
    // Unknown: no value; a value typed in makes it Unclassified.
    const unknown = await savedNumber(
      await saveNumber(team, "units_strong", {
        value: null,
        classification: { fau: "unknown" },
        lockVersion: 0,
      }),
    );
    expect(unknown).toMatchObject({
      lockVersion: 1,
      value: null,
      classification: { state: "unknown" },
    });
    const typed = await savedNumber(
      await saveNumber(team, "units_strong", { value: 15, lockVersion: 1 }),
    );
    expect(typed.classification).toMatchObject({
      fau: null,
      state: "unclassified",
    });
    // Unknown operating days fall back on the default.
    await savedNumber(
      await saveNumber(team, "operating_days", {
        value: null,
        classification: { fau: "unknown" },
        lockVersion: 1,
      }),
    );
    expect((await economics(team)).result.defaultsUsed.operatingDays).toBe(
      true,
    );
  });

  test("V15 calculates design-spec 8.3 from what V14 and V16 saved", async () => {
    const team = await newTeam();
    const { items } = await costs(team);
    for (const [key, value] of Object.entries(WORKED.costs)) {
      const row = items.find((item) => item.templateKey === key);
      if (row === undefined) throw new Error(`No row ${key}`);
      await savedRow(
        await editRow(
          team,
          row.id,
          typeof value === "number"
            ? { amount: value, lockVersion: 0 }
            : {
                inputMode: "percent_of_price",
                percent: value.percent,
                lockVersion: 0,
              },
        ),
      );
    }
    for (const [field, value] of Object.entries(WORKED.numbers)) {
      await savedNumber(
        await saveNumber(team, field, { value, lockVersion: 0 }),
      );
    }
    const view = await economics(team);
    const { result } = view;
    expect(
      view.inputs.find((i) => i.fieldKey === "target_margin"),
    ).toMatchObject({
      value: null,
      lockVersion: 0,
    });
    expect(result.defaultsUsed).toEqual({
      operatingDays: false,
      targetMargin: true,
    });
    expect(result.variableCostPerUnit.value).toBeCloseTo(218.5, 6);
    expect(result.contributionMargin.value).toBeCloseTo(231.5, 6);
    expect(result.contributionMarginRate.value).toBeCloseTo(0.5144, 4);
    expect(result.totals.monthlyFixed.amount).toBe(41_700);
    expect(result.totals.initial).toEqual({
      amount: 169_500,
      isLowerBound: false,
      unknownRows: 0,
      emptyRows: 0,
    });
    expect(result.breakEvenUnitsMonth.value).toBeCloseTo(180.13, 2);
    expect(result.breakEvenUnitsDay.value).toBeCloseTo(6.93, 2);
    expect(Math.round(result.breakEvenRevenue.value ?? 0)).toBe(81_058);
    expect(result.targetMarginUnitsMonth.value).toBeCloseTo(254.3, 1);
    expect(result.targetMarginUnitsDay.value).toBeCloseTo(9.8, 1);
    const scenario = (key: string) =>
      result.scenarios.find((column) => column.key === key);
    expect(scenario("expected")).toMatchObject({
      unitsPerMonth: { value: 260 },
      revenue: { value: 117_000 },
      variableCostTotal: { value: 56_810 },
      operatingProfit: { value: 18_490, bound: "exact" },
    });
    expect(scenario("expected")?.operatingMargin.value).toBeCloseTo(0.158, 3);
    expect(scenario("conservative")).toMatchObject({
      unitsPerMonth: { value: 156 },
      revenue: { value: 70_200 },
      operatingProfit: { value: -5_586 },
    });
    expect(result.paybackMonths.value).toBeCloseTo(9.17, 2);
    expect(result.simpleRoi.value).toBeCloseTo(1.309, 3);
    expect(result.warnings).toEqual([]);
    expect(view.costItems).toHaveLength(24);
    expect(view.worth).toMatchObject({
      questionKey: "V.08.WORTH",
      text: null,
      lockVersion: 0,
      hidden: false,
    });
    expect(view.worthQuestion).toMatchObject({
      key: "V.08.WORTH",
      sectionKey: "08",
      answerType: "long_text",
      hasFau: true,
    });
    // V12 shows the same calculation.
    expect((await costs(team)).result).toEqual(result);
  });

  test("V15 marks WORTH hidden, without its question, when the pinned version lacks it", async () => {
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
    // A version without V.08.WORTH, as an operator could make one (AD6 does not require
    // it), pinned for this request only.
    const [bare] = await db
      .insert(templateVersions)
      .values({
        templateId: pinned.templateId,
        versionNumber: 1_000 + Math.floor(Math.random() * 1_000_000),
      })
      .returning();
    if (bare === undefined) throw new Error("no version");
    try {
      await db
        .update(validations)
        .set({ templateVersionId: bare.id })
        .where(eq(validations.id, team.validationId));
      const view = await economics(team);
      expect(view.worth).toMatchObject({
        questionKey: "V.08.WORTH",
        hidden: true,
      });
      expect(view.worthQuestion).toBeNull();
    } finally {
      await db
        .update(validations)
        .set({ templateVersionId: pinned.versionId })
        .where(eq(validations.id, team.validationId));
      await db.delete(templateVersions).where(eq(templateVersions.id, bare.id));
    }
  });
});
