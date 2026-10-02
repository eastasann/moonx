import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, ideaId, planId, seedDemo, userId } from "@moonx/db/seed";
import { eq } from "drizzle-orm";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let as: Record<"admin" | "ana" | "kenji" | "paolo" | "grace", Record<string, string>>;

beforeAll(async () => {
  t = await startTestApp();
  as = {
    admin: await login(t.app, "admin"),
    ana: await login(t.app, "ana"),
    kenji: await login(t.app, "kenji"),
    paolo: await login(t.app, "paolo"),
    grace: await login(t.app, "grace"),
  };
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await seedDemo(t.db);
});

const piaya = ideaId("piaya");
const planA = planId("piaya-a");
const listPath = (workspaceId = BCDX) => `/api/v1/workspaces/${workspaceId}/decision-log`;
const entryPath = (id: string) => `/api/v1/decision-log/${id}`;
const MISSING = "00000000-0000-4000-8000-000000000001";

/** The eight entries of the demo data (design-spec 8), newest first. */
const SEEDED = 8;

async function idsWhere(kind: "validation_decision" | "go_no_go" | "version_saved") {
  const rows = await t.db
    .select({ id: schema.decisionLogEntries.id })
    .from(schema.decisionLogEntries)
    .where(eq(schema.decisionLogEntries.kind, kind));
  return rows.map((r) => r.id);
}

/** Empties the log; plans only point at the decision that started them. */
async function clearLog() {
  await t.db.update(schema.businessPlans).set({ createdFromDecisionId: null });
  await t.db.delete(schema.decisionLogEntries);
}

/** An entry recorded at an exact instant, for the date-boundary tests. */
async function insertAt(recordedAt: string, reason = "boundary") {
  const at = new Date(recordedAt);
  const [row] = await t.db
    .insert(schema.decisionLogEntries)
    .values({
      workspaceId: BCDX,
      ideaId: piaya,
      kind: "validation_decision",
      value: "hold",
      reason,
      snapshot: {},
      recordedById: userId("ana"),
      recordedAt: at,
      createdAt: at,
    })
    .returning({ id: schema.decisionLogEntries.id });
  return (row as { id: string }).id;
}

describe("L1 list", () => {
  test("returns the summaries newest first with the names the screen shows", async () => {
    const res = await call(t.app, "GET", listPath(), { as: as.ana });
    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.items).toHaveLength(SEEDED);
    const times = res.body.items.map((i: { recordedAt: string }) => Date.parse(i.recordedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          "id",
          "idea",
          "kind",
          "plan",
          "reasonExcerpt",
          "recordedAt",
          "recordedBy",
          "value",
          "versionName",
        ].sort(),
      );
    }
    const delay = res.body.items.find(
      (i: { kind: string; value: string }) => i.kind === "go_no_go" && i.value === "delay",
    );
    expect(delay).toMatchObject({
      idea: { id: piaya, name: expect.any(String) },
      plan: { id: planA, name: expect.any(String) },
      recordedBy: { id: userId("ana") },
      versionName: null,
    });
    const version = res.body.items.find(
      (i: { kind: string; plan: { id: string } | null }) =>
        i.kind === "version_saved" && i.plan?.id === planA,
    );
    expect(version).toMatchObject({ versionName: "v1 For advisors", value: null });
    const decision = res.body.items.find((i: { kind: string }) => i.kind === "validation_decision");
    expect(decision.plan).toBeNull();
  });

  test("the excerpt is one flattened line cut at 140 characters", async () => {
    await insertAt("2026-09-01T00:00:00Z", `${"word ".repeat(10)}\n\n${"x".repeat(200)}`);
    const res = await call(t.app, "GET", `${listPath()}?limit=200`, { as: as.ana });
    const excerpt = res.body.items.find((i: { reasonExcerpt: string | null }) =>
      i.reasonExcerpt?.startsWith("word word"),
    ).reasonExcerpt as string;
    expect(excerpt).not.toContain("\n");
    expect(excerpt).toHaveLength(140);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  test("filters by kind, idea, plan and recorder, and combines them", async () => {
    const byKind = await call(t.app, "GET", `${listPath()}?kind=go_no_go`, { as: as.ana });
    expect(byKind.body.items.map((i: { kind: string }) => i.kind)).toEqual(
      Array(2).fill("go_no_go"),
    );

    const byIdea = await call(t.app, "GET", `${listPath()}?ideaId=${piaya}`, { as: as.ana });
    expect(byIdea.body.items).toHaveLength(3);
    expect(byIdea.body.items.every((i: { idea: { id: string } }) => i.idea.id === piaya)).toBe(
      true,
    );

    const byPlan = await call(t.app, "GET", `${listPath()}?planId=${planA}`, { as: as.ana });
    expect(byPlan.body.items.map((i: { kind: string }) => i.kind).sort()).toEqual([
      "go_no_go",
      "version_saved",
    ]);

    const byPerson = await call(t.app, "GET", `${listPath()}?recordedBy=${userId("kenji")}`, {
      as: as.ana,
    });
    expect(byPerson.body.items).toHaveLength(1);
    expect(byPerson.body.items[0].recordedBy.id).toBe(userId("kenji"));

    const combined = await call(
      t.app,
      "GET",
      `${listPath()}?ideaId=${piaya}&kind=validation_decision&recordedBy=${userId("ana")}`,
      { as: as.ana },
    );
    expect(combined.body.items).toHaveLength(1);

    const none = await call(
      t.app,
      "GET",
      `${listPath()}?kind=version_saved&recordedBy=${userId("kenji")}`,
      {
        as: as.ana,
      },
    );
    expect(none.body).toEqual({ items: [], nextCursor: null });
  });

  test("rejects values it cannot read with 422", async () => {
    for (const query of [
      "kind=nope",
      "ideaId=not-a-uuid",
      "from=yesterday",
      "to=2026-13-40",
      "limit=0",
      "limit=201",
      "cursor=%25%25",
    ]) {
      const res = await call(t.app, "GET", `${listPath()}?${query}`, { as: as.ana });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
  });

  describe("date filters", () => {
    // Manila is UTC+8: 2026-10-01 in Manila is 2026-09-30T16:00Z up to 2026-10-01T16:00Z.
    const ids = {} as Record<"early" | "start" | "end" | "next", string>;
    beforeEach(async () => {
      await clearLog();
      ids.early = await insertAt("2026-09-30T15:59:59Z");
      ids.start = await insertAt("2026-09-30T16:00:00Z");
      ids.end = await insertAt("2026-10-01T15:59:59Z");
      ids.next = await insertAt("2026-10-01T16:00:00Z");
    });
    const idsOf = (res: { body: { items: { id: string }[] } }) =>
      res.body.items.map((i) => i.id).sort();

    test("a date without a time is a whole day on the caller's calendar", async () => {
      const res = await call(t.app, "GET", `${listPath()}?from=2026-10-01&to=2026-10-01`, {
        as: as.ana,
      });
      expect(res.status).toBe(200);
      expect(idsOf(res)).toEqual([ids.start, ids.end].sort());
    });

    test("from alone and to alone are open on the other side", async () => {
      const from = await call(t.app, "GET", `${listPath()}?from=2026-10-01`, { as: as.ana });
      expect(idsOf(from)).toEqual([ids.start, ids.end, ids.next].sort());
      const to = await call(t.app, "GET", `${listPath()}?to=2026-10-01`, { as: as.ana });
      expect(idsOf(to)).toEqual([ids.early, ids.start, ids.end].sort());
    });

    test("the same dates select other instants for a person in another time zone", async () => {
      await t.db
        .update(schema.users)
        .set({ timezone: "America/Los_Angeles" })
        .where(eq(schema.users.id, userId("kenji")));
      // Los Angeles is UTC-7 in October: 2026-10-01 is 2026-10-01T07:00Z up to 2026-10-02T07:00Z.
      const res = await call(t.app, "GET", `${listPath()}?from=2026-10-01&to=2026-10-01`, {
        as: as.kenji,
      });
      expect(idsOf(res)).toEqual([ids.end, ids.next].sort());
    });

    test("an unknown stored time zone falls back to Manila instead of failing", async () => {
      await t.db
        .update(schema.users)
        .set({ timezone: "Not/AZone" })
        .where(eq(schema.users.id, userId("kenji")));
      const res = await call(t.app, "GET", `${listPath()}?from=2026-10-01&to=2026-10-01`, {
        as: as.kenji,
      });
      expect(res.status).toBe(200);
      expect(idsOf(res)).toEqual([ids.start, ids.end].sort());
    });

    test("a date and time is an instant, and the upper bound includes it", async () => {
      const res = await call(
        t.app,
        "GET",
        `${listPath()}?from=2026-09-30T16:00:00Z&to=2026-10-01T15:59:59Z`,
        { as: as.ana },
      );
      expect(idsOf(res)).toEqual([ids.start, ids.end].sort());
    });
  });

  test("pages with the cursor without skipping or repeating an entry", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: { status: number; body: { items: { id: string }[]; nextCursor: string | null } } =
        await call(t.app, "GET", `${listPath()}?limit=3${cursor ? `&cursor=${cursor}` : ""}`, {
          as: as.ana,
        });
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(3);
      seen.push(...res.body.items.map((i) => i.id));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(SEEDED);
    const all = await call(t.app, "GET", listPath(), { as: as.ana });
    expect(seen).toEqual(all.body.items.map((i: { id: string }) => i.id));
  });

  test("a page that ends exactly at the last entry has no next cursor", async () => {
    const res = await call(t.app, "GET", `${listPath()}?limit=${SEEDED}`, { as: as.ana });
    expect(res.body.items).toHaveLength(SEEDED);
    expect(res.body.nextCursor).toBeNull();
  });

  test("entries of the same instant keep one stable order across pages", async () => {
    await clearLog();
    for (let i = 0; i < 5; i++) await insertAt("2026-09-01T00:00:00Z", `same ${i}`);
    const one = await call(t.app, "GET", `${listPath()}?limit=2`, { as: as.ana });
    const two = await call(t.app, "GET", `${listPath()}?limit=2&cursor=${one.body.nextCursor}`, {
      as: as.ana,
    });
    const three = await call(t.app, "GET", `${listPath()}?limit=2&cursor=${two.body.nextCursor}`, {
      as: as.ana,
    });
    const ids = [...one.body.items, ...two.body.items, ...three.body.items].map(
      (i: { id: string }) => i.id,
    );
    expect(new Set(ids).size).toBe(5);
  });

  test("an empty log is an empty page", async () => {
    await clearLog();
    const res = await call(t.app, "GET", listPath(), { as: as.ana });
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  test("never shows the entries of another workspace", async () => {
    const mine = userId("ana");
    const personal = await t.db
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .innerJoin(schema.memberships, eq(schema.memberships.workspaceId, schema.workspaces.id))
      .where(eq(schema.memberships.userId, mine));
    expect(personal.length).toBeGreaterThan(1);
    for (const w of personal.filter((p) => p.id !== BCDX)) {
      const res = await call(t.app, "GET", listPath(w.id), { as: as.ana });
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    }
  });
});

describe("L2 entry", () => {
  test("a validation decision carries the full reason and the snapshot", async () => {
    const [id] = await t.db
      .select({ id: schema.decisionLogEntries.id, reason: schema.decisionLogEntries.reason })
      .from(schema.decisionLogEntries)
      .where(eq(schema.decisionLogEntries.ideaId, piaya))
      .then((rows) => rows.filter((r) => r.reason?.startsWith("All six checks")));
    const res = await call(t.app, "GET", entryPath((id as { id: string }).id), { as: as.paolo });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      kind: "validation_decision",
      value: "proceed",
      reason: (id as { reason: string }).reason,
      idea: { id: piaya },
      plan: null,
      recordedBy: { id: userId("ana") },
    });
    expect(Object.keys(res.body.snapshot).sort()).toEqual(["fau", "keyMetrics", "missingChecks"]);
    expect(res.body.snapshot.conditions).toBeUndefined();
  });

  test("a Go / No-Go carries the conditions and the version it was based on", async () => {
    const entries = await idsWhere("go_no_go");
    const bodies = await Promise.all(
      entries.map((id) => call(t.app, "GET", entryPath(id), { as: as.grace })),
    );
    const delay = bodies.find((b) => b.body.value === "delay");
    expect(delay?.status).toBe(200);
    expect(delay?.body.plan.id).toBe(planA);
    expect(delay?.body.snapshot.conditions).toEqual({
      launchIf: expect.any(String),
      delayIf: expect.any(String),
      stopIf: expect.any(String),
    });
    expect(delay?.body.snapshot.planVersion).toMatchObject({ name: "v1 For advisors" });
  });

  test("a saved version has no value or reason and names the version", async () => {
    const [id] = await idsWhere("version_saved");
    const res = await call(t.app, "GET", entryPath(id as string), { as: as.ana });
    expect(res.body).toMatchObject({ kind: "version_saved", value: null, reason: null });
    expect(res.body.versionName).toEqual(expect.any(String));
    expect(res.body.snapshot.planVersion.name).toBe(res.body.versionName);
  });

  test("answers 404 for an entry that does not exist", async () => {
    const res = await call(t.app, "GET", entryPath(MISSING), { as: as.ana });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  test("rejects an id that is not a UUID with 422", async () => {
    const res = await call(t.app, "GET", entryPath("nope"), { as: as.ana });
    expect(res.status).toBe(422);
  });
});

describe("no write endpoints", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    test(`${method} on the collection and on an entry is not a route`, async () => {
      const entries = await idsWhere("go_no_go");
      for (const path of [listPath(), entryPath(entries[0] as string), entryPath(MISSING)]) {
        const res = await call(t.app, method, path, { as: as.ana, body: { reason: "edited" } });
        expect(res.status).toBe(404);
      }
      const unchanged = await t.db
        .select({ id: schema.decisionLogEntries.id })
        .from(schema.decisionLogEntries);
      expect(unchanged).toHaveLength(SEEDED);
    });
  }
});

describe("permissions (SDD 7.1)", () => {
  const people = ["ana", "kenji", "grace"] as const;
  for (const person of people) {
    test(`${person} reads L1 and L2 whatever the role`, async () => {
      const list = await call(t.app, "GET", listPath(), { as: as[person] });
      expect(list.status).toBe(200);
      const detail = await call(t.app, "GET", entryPath(list.body.items[0].id), { as: as[person] });
      expect(detail.status).toBe(200);
    });
  }

  test("someone who is not a member gets 403 NO_ACCESS on both, the operator included", async () => {
    const [entry] = await idsWhere("go_no_go");
    for (const who of [as.admin]) {
      const list = await call(t.app, "GET", listPath(), { as: who });
      expect(list.status).toBe(403);
      expect(list.body.error.code).toBe("NO_ACCESS");
      const detail = await call(t.app, "GET", entryPath(entry as string), { as: who });
      expect(detail.status).toBe(403);
      expect(detail.body.error.code).toBe("NO_ACCESS");
    }
  });

  test("the operator reads the log once a member of the workspace, with that role", async () => {
    await t.db
      .insert(schema.memberships)
      .values({ workspaceId: BCDX, userId: userId("admin"), role: "viewer" });
    const res = await call(t.app, "GET", listPath(), { as: as.admin });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(SEEDED);
  });

  test("a person of another workspace cannot read through the entry id either", async () => {
    const [entry] = await idsWhere("go_no_go");
    await t.db.delete(schema.memberships).where(eq(schema.memberships.userId, userId("grace")));
    const res = await call(t.app, "GET", entryPath(entry as string), { as: as.grace });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NO_ACCESS");
  });

  test("without a session both are 401", async () => {
    const [entry] = await idsWhere("go_no_go");
    for (const path of [listPath(), entryPath(entry as string)]) {
      const res = await call(t.app, "GET", path);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("a suspended person is 401", async () => {
    await t.db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, userId("kenji")));
    const res = await call(t.app, "GET", listPath(), { as: as.kenji });
    expect(res.status).toBe(401);
  });

  test("a workspace id that is not a UUID is 422 and one that does not exist is 404", async () => {
    expect((await call(t.app, "GET", listPath("nope"), { as: as.ana })).status).toBe(422);
    const unknown = await call(t.app, "GET", listPath(MISSING), { as: as.ana });
    expect(unknown.status).toBe(404);
  });
});
