import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, ideaId, type PersonKey, planId, seedDemo, userId } from "@moonx/db/seed";
import { and, count, eq } from "drizzle-orm";
import type { Elysia } from "elysia";
import { dueStageOn, EXECUTION_TAB } from "../src/lib/due-notifications";
import { hashInvitationToken } from "../src/lib/invitation-token";
import { createLogger } from "../src/lib/logger";
import { GOOGLE_ISSUER, googleKeySource, type Jwk } from "../src/lib/oidc";
import { localTime } from "../src/lib/timezone";
import { appOn, call, login, startTestApp, type TestApp } from "./helpers";

const AUDIENCE = "https://moonx-api-staging-123456.asia-southeast1.run.app";
const INVOKER = "scheduler@moonx-staging.iam.gserviceaccount.com";
const KID = "test-key-1";
const PATH = "/internal/cron/due-notifications";

let t: TestApp;
let app: Elysia;
let now = new Date("2026-10-02T00:30:00Z");
let signer: CryptoKeyPair;
let jwk: Jwk;
const logLines: string[] = [];
const logger = createLogger("debug", (line) => logLines.push(line));

async function newKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
}

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** A token the way Cloud Scheduler's service account would send it, unless a field is overridden. */
async function token(
  claims: Record<string, unknown> = {},
  opts: { key?: CryptoKey; header?: Record<string, unknown> } = {},
) {
  const seconds = Math.floor(now.getTime() / 1000);
  const header = b64({ alg: "RS256", typ: "JWT", kid: KID, ...opts.header });
  const payload = b64({
    iss: GOOGLE_ISSUER,
    aud: AUDIENCE,
    email: INVOKER,
    email_verified: true,
    iat: seconds,
    exp: seconds + 3600,
    ...claims,
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    opts.key ?? signer.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${Buffer.from(signature).toString("base64url")}`;
}

const bearer = (value: string) => ({ authorization: `Bearer ${value}` });

/** Runs Z3 at `at` with a valid token. */
async function run(at: string) {
  now = new Date(at);
  const res = await call(app, "POST", PATH, { headers: bearer(await token()) });
  expect(res.status).toBe(200);
  return res.body as { checkedItems: number; created: number };
}

beforeAll(async () => {
  t = await startTestApp();
  signer = await newKeyPair();
  jwk = {
    ...(await crypto.subtle.exportKey("jwk", signer.publicKey)),
    kty: "RSA",
    kid: KID,
    alg: "RS256",
  };
  app = appOn(
    t.db,
    { cron: { oidcAudience: AUDIENCE, invokerEmail: INVOKER } },
    {
      now: () => now,
      oidcKeys: async (kid) => (kid === KID ? jwk : null),
      logger,
    },
  );
});
afterAll(async () => {
  await t.close();
});

const planA = planId("piaya-a");
const planB = planId("piaya-b");
const table = schema.notifications;
let counter = 0;

type ItemType = (typeof schema.executionItems.$inferInsert)["type"];
type ItemStatus = (typeof schema.executionItems.$inferInsert)["status"];

interface ItemSpec {
  type?: ItemType;
  title?: string;
  assignee?: PersonKey | null;
  assigneeName?: string;
  dueDate?: string | null;
  status?: ItemStatus;
  plan?: string;
  deleted?: boolean;
}

/** An execution item with exactly the fields the due rules look at. */
async function addItem(spec: ItemSpec) {
  counter += 1;
  const assignee = spec.assignee === undefined ? "ana" : spec.assignee;
  const [row] = await t.db
    .insert(schema.executionItems)
    .values({
      businessPlanId: spec.plan ?? planA,
      type: spec.type ?? "next_action",
      title: spec.title ?? `Item ${counter}`,
      assigneeUserId: assignee ? userId(assignee) : null,
      assigneeName: spec.assigneeName ?? null,
      dueDate: spec.dueDate === undefined ? "2026-10-02" : spec.dueDate,
      status: spec.status === undefined ? "todo" : spec.status,
      sortOrder: 10_000 + counter,
      deletedAt: spec.deleted ? new Date() : null,
    })
    .returning({ id: schema.executionItems.id });
  return (row as { id: string }).id;
}

const dueRows = (itemId?: string) =>
  t.db
    .select()
    .from(table)
    .where(
      itemId
        ? and(eq(table.kind, "due"), eq(table.executionItemId, itemId))
        : eq(table.kind, "due"),
    );

async function setTimeZone(person: PersonKey, timezone: string) {
  await t.db
    .update(schema.users)
    .set({ timezone })
    .where(eq(schema.users.id, userId(person)));
}

beforeEach(async () => {
  await seedDemo(t.db);
  // The demo items and notices would blur the counts; each test sets up the items it needs.
  await t.db.update(schema.executionItems).set({ dueDate: null });
  await t.db.delete(table);
  logLines.length = 0;
  now = new Date("2026-10-02T00:30:00Z");
});

describe("dueStageOn", () => {
  test("picks the stage of the day and nothing while the date is more than 3 days away", () => {
    expect(dueStageOn("2026-10-10", "2026-10-02")).toBeNull();
    expect(dueStageOn("2026-10-06", "2026-10-02")).toBeNull();
    expect(dueStageOn("2026-10-05", "2026-10-02")).toBe("three_days_before");
    expect(dueStageOn("2026-10-03", "2026-10-02")).toBe("three_days_before");
    expect(dueStageOn("2026-10-02", "2026-10-02")).toBe("due_day");
    expect(dueStageOn("2026-10-01", "2026-10-02")).toBe("overdue");
    expect(dueStageOn("2025-01-01", "2026-10-02")).toBe("overdue");
  });

  test("counts days across a month and a year boundary", () => {
    expect(dueStageOn("2027-01-02", "2026-12-30")).toBe("three_days_before");
    expect(dueStageOn("2027-01-03", "2026-12-30")).toBeNull();
    expect(dueStageOn("2026-03-01", "2026-02-26")).toBe("three_days_before");
  });
});

describe("Z3 authentication", () => {
  const post = async (headers: Record<string, string> = {}) => call(app, "POST", PATH, { headers });

  async function expectRejected(headers: Record<string, string>, status: number, code: string) {
    const item = await addItem({ dueDate: "2026-10-02" });
    const res = await post(headers);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(await dueRows(item)).toEqual([]);
  }

  test("a valid token runs the processing and answers the counts", async () => {
    await addItem({ dueDate: "2026-10-02" });
    const res = await post(bearer(await token()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ checkedItems: 1, created: 1 });
  });

  test("needs neither a session nor the Worker's shared secret", async () => {
    const guarded = appOn(
      t.db,
      { proxySecrets: ["shared-secret"], cron: { oidcAudience: AUDIENCE, invokerEmail: INVOKER } },
      { now: () => now, oidcKeys: async () => jwk, logger },
    );
    const res = await call(guarded, "POST", PATH, { headers: bearer(await token()) });
    expect(res.status).toBe(200);
    const other = await call(guarded, "GET", "/api/v1/notifications", {
      as: await login(guarded, "ana", { "x-moonx-proxy-secret": "shared-secret" }),
    });
    expect(other.status).toBe(403);
  });

  test("a missing or malformed Authorization header is 401", async () => {
    await expectRejected({}, 401, "UNAUTHENTICATED");
    await expectRejected({ authorization: "" }, 401, "UNAUTHENTICATED");
    await expectRejected({ authorization: "Bearer" }, 401, "UNAUTHENTICATED");
    await expectRejected({ authorization: `Basic ${await token()}` }, 401, "UNAUTHENTICATED");
    await expectRejected({ authorization: "Bearer not.a.jwt" }, 401, "UNAUTHENTICATED");
    await expectRejected({ authorization: "Bearer abc" }, 401, "UNAUTHENTICATED");
    await expectRejected(
      { authorization: `Bearer ${await token()}.extra` },
      401,
      "UNAUTHENTICATED",
    );
  });

  test("a session cookie is no credential here", async () => {
    await expectRejected(await login(app, "admin"), 401, "UNAUTHENTICATED");
  });

  test("a wrong audience is 401", async () => {
    await expectRejected(
      bearer(await token({ aud: "https://elsewhere.example" })),
      401,
      "UNAUTHENTICATED",
    );
    await expectRejected(bearer(await token({ aud: undefined })), 401, "UNAUTHENTICATED");
  });

  test("an audience list that contains ours is accepted", async () => {
    const res = await post(bearer(await token({ aud: ["https://other.example", AUDIENCE] })));
    expect(res.status).toBe(200);
  });

  test("a wrong issuer is 401 and both spellings of Google's issuer are accepted", async () => {
    await expectRejected(
      bearer(await token({ iss: "https://evil.example" })),
      401,
      "UNAUTHENTICATED",
    );
    await expectRejected(bearer(await token({ iss: undefined })), 401, "UNAUTHENTICATED");
    expect((await post(bearer(await token({ iss: "accounts.google.com" })))).status).toBe(200);
  });

  test("an expired token is 401, a token that expires in the future is fine", async () => {
    const seconds = Math.floor(now.getTime() / 1000);
    await expectRejected(bearer(await token({ exp: seconds - 1 })), 401, "UNAUTHENTICATED");
    await expectRejected(bearer(await token({ exp: seconds })), 401, "UNAUTHENTICATED");
    await expectRejected(bearer(await token({ exp: undefined })), 401, "UNAUTHENTICATED");
    await expectRejected(
      bearer(await token({ exp: String(seconds + 100) })),
      401,
      "UNAUTHENTICATED",
    );
    expect((await post(bearer(await token({ exp: seconds + 1 })))).status).toBe(200);
  });

  test("the clock the endpoint judges expiry by is the app's clock", async () => {
    const issued = await token();
    now = new Date(now.getTime() + 2 * 3600_000);
    const res = await post(bearer(issued));
    expect(res.status).toBe(401);
  });

  test("a token that is not valid yet is 401", async () => {
    const seconds = Math.floor(now.getTime() / 1000);
    await expectRejected(bearer(await token({ nbf: seconds + 60 })), 401, "UNAUTHENTICATED");
  });

  test("a valid token from another service account is 403", async () => {
    await expectRejected(
      bearer(await token({ email: "someone@moonx-staging.iam.gserviceaccount.com" })),
      403,
      "FORBIDDEN",
    );
    await expectRejected(bearer(await token({ email: undefined })), 403, "FORBIDDEN");
    await expectRejected(bearer(await token({ email_verified: false })), 403, "FORBIDDEN");
    await expectRejected(bearer(await token({ email_verified: "true" })), 403, "FORBIDDEN");
  });

  test("the service account is compared without regard to case", async () => {
    const res = await post(bearer(await token({ email: INVOKER.toUpperCase() })));
    expect(res.status).toBe(200);
  });

  test("a token signed by another key is 401 even with our key id", async () => {
    const stranger = await newKeyPair();
    await expectRejected(
      bearer(await token({}, { key: stranger.privateKey })),
      401,
      "UNAUTHENTICATED",
    );
  });

  test("an unknown key id, another algorithm or an altered payload is 401", async () => {
    await expectRejected(
      bearer(await token({}, { header: { kid: "other" } })),
      401,
      "UNAUTHENTICATED",
    );
    await expectRejected(
      bearer(await token({}, { header: { kid: undefined } })),
      401,
      "UNAUTHENTICATED",
    );
    await expectRejected(
      bearer(await token({}, { header: { alg: "none" } })),
      401,
      "UNAUTHENTICATED",
    );
    await expectRejected(
      bearer(await token({}, { header: { alg: "HS256" } })),
      401,
      "UNAUTHENTICATED",
    );
    const [header, , signature] = (await token()).split(".");
    const forged = b64({
      iss: GOOGLE_ISSUER,
      aud: AUDIENCE,
      email: INVOKER,
      email_verified: true,
      exp: Math.floor(now.getTime() / 1000) + 99999,
    });
    await expectRejected(bearer(`${header}.${forged}.${signature}`), 401, "UNAUTHENTICATED");
    await expectRejected(bearer(`${header}.${forged}.`), 401, "UNAUTHENTICATED");
  });

  test("an endpoint with no audience or service account configured refuses everyone", async () => {
    const bare = appOn(t.db, {}, { now: () => now, oidcKeys: async () => jwk, logger });
    const item = await addItem({ dueDate: "2026-10-02" });
    const res = await call(bare, "POST", PATH, { headers: bearer(await token()) });
    expect(res.status).toBe(403);
    expect(await dueRows(item)).toEqual([]);
    const onlyAudience = appOn(
      t.db,
      { cron: { oidcAudience: AUDIENCE, invokerEmail: "" } },
      { now: () => now, oidcKeys: async () => jwk, logger },
    );
    expect(
      (await call(onlyAudience, "POST", PATH, { headers: bearer(await token()) })).status,
    ).toBe(403);
  });

  test("only POST is a route", async () => {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const res = await call(app, method, PATH, { headers: bearer(await token()) });
      expect(res.status).toBe(404);
    }
  });

  test("a failure to reach Google's keys is 503, not a pass", async () => {
    const broken = appOn(
      t.db,
      { cron: { oidcAudience: AUDIENCE, invokerEmail: INVOKER } },
      {
        now: () => now,
        logger,
        oidcKeys: googleKeySource(
          (async () => new Response("down", { status: 500 })) as unknown as typeof fetch,
        ),
      },
    );
    const res = await call(broken, "POST", PATH, { headers: bearer(await token()) });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("UPSTREAM_UNAVAILABLE");
  });
});

describe("googleKeySource", () => {
  const keys = { keys: [{ kid: "a", kty: "RSA", n: "x", e: "AQAB" }] };

  function fake(bodies: object[], cacheControl = "public, max-age=3600") {
    let calls = 0;
    const impl = (async () => {
      const body = bodies[Math.min(calls, bodies.length - 1)];
      calls += 1;
      return new Response(JSON.stringify(body), { headers: { "cache-control": cacheControl } });
    }) as unknown as typeof fetch;
    return { impl, calls: () => calls };
  }

  test("fetches once and serves the cached key until max-age has passed", async () => {
    let clock = 1_000_000;
    const { impl, calls } = fake([keys]);
    const source = googleKeySource(impl, () => clock);
    expect((await source("a"))?.kid).toBe("a");
    clock += 3_599_000;
    expect((await source("a"))?.kid).toBe("a");
    expect(calls()).toBe(1);
    clock += 2_000;
    await source("a");
    expect(calls()).toBe(2);
  });

  test("an unknown key id refetches at most once a minute", async () => {
    let clock = 1_000_000;
    const { impl, calls } = fake([keys]);
    const source = googleKeySource(impl, () => clock);
    expect(await source("zzz")).toBeNull();
    expect(await source("zzz")).toBeNull();
    expect(calls()).toBe(1);
    clock += 61_000;
    expect(await source("zzz")).toBeNull();
    expect(calls()).toBe(2);
  });

  test("a rotated key shows up after the refetch", async () => {
    let clock = 1_000_000;
    const { impl } = fake([
      keys,
      { keys: [...keys.keys, { kid: "b", kty: "RSA", n: "y", e: "AQAB" }] },
    ]);
    const source = googleKeySource(impl, () => clock);
    await source("a");
    clock += 61_000;
    expect((await source("b"))?.kid).toBe("b");
  });
});

describe("Z3 due rules", () => {
  test("creates the notice for the stage each item is in, for its assignee", async () => {
    const threeDays = await addItem({ dueDate: "2026-10-05", assignee: "ana" });
    const tomorrow = await addItem({ dueDate: "2026-10-03", assignee: "kenji" });
    const today = await addItem({ dueDate: "2026-10-02", assignee: "paolo" });
    const yesterday = await addItem({ dueDate: "2026-10-01", assignee: "ana" });
    const longAgo = await addItem({ dueDate: "2026-08-01", assignee: "kenji" });
    const later = await addItem({ dueDate: "2026-10-06", assignee: "ana" });
    const noDate = await addItem({ dueDate: null });

    const result = await run("2026-10-02T00:30:00Z");
    // The 6th is read (the horizon is 4 days) but in no stage yet; the one without a date is not read.
    expect(result).toEqual({ checkedItems: 6, created: 5 });
    const stage = async (id: string) => (await dueRows(id)).map((r) => r.dueStage);
    expect(await stage(threeDays)).toEqual(["three_days_before"]);
    expect(await stage(tomorrow)).toEqual(["three_days_before"]);
    expect(await stage(today)).toEqual(["due_day"]);
    expect(await stage(yesterday)).toEqual(["overdue"]);
    expect(await stage(longAgo)).toEqual(["overdue"]);
    expect(await stage(later)).toEqual([]);
    expect(await stage(noDate)).toEqual([]);
  });

  test("a notice is shaped like the other kinds and links to the item on screen 22", async () => {
    const id = await addItem({
      dueDate: "2026-10-02",
      assignee: "kenji",
      title: "Call the bakery",
    });
    await run("2026-10-02T00:30:00Z");
    const [row] = await dueRows(id);
    expect(row).toMatchObject({
      userId: userId("kenji"),
      workspaceId: BCDX,
      kind: "due",
      actorId: null,
      commentId: null,
      decisionLogEntryId: null,
      executionItemId: id,
      dueStage: "due_day",
      dueDate: "2026-10-02",
      readAt: null,
    });
    expect(row?.createdAt.toISOString()).toBe("2026-10-02T00:30:00.000Z");
    expect(row?.link).toEqual({
      screen: 22,
      workspaceId: BCDX,
      ideaId: ideaId("piaya"),
      planId: planA,
      tab: "actions",
      rowId: id,
    });
  });

  test("the link opens the tab of the item's type", async () => {
    const byType = {} as Record<string, string>;
    for (const type of Object.keys(EXECUTION_TAB) as ItemType[]) {
      byType[type] = await addItem({
        type,
        dueDate: "2026-10-02",
        status: type === "kpi" ? null : type === "open_question" ? "open" : "todo",
      });
    }
    await run("2026-10-02T00:30:00Z");
    const tabs = {
      milestone: "milestones",
      launch: "launch",
      kpi: "kpis",
      open_question: "questions",
      next_action: "actions",
    };
    for (const [type, id] of Object.entries(byType)) {
      const [row] = await dueRows(id);
      const tab = (row?.link as { tab: string } | undefined)?.tab;
      expect(tab).toBe(tabs[type as keyof typeof tabs]);
    }
  });

  test("shows up for the assignee as an unread notice titled after the item", async () => {
    await addItem({ dueDate: "2026-10-02", assignee: "kenji", title: "Call the bakery" });
    await addItem({ dueDate: "2026-10-01", assignee: "kenji", title: "Sign the lease" });
    await addItem({ dueDate: "2026-10-04", assignee: "kenji", title: "Order the boxes" });
    await run("2026-10-02T00:30:00Z");
    const as = await login(app, "kenji");
    const list = await call(app, "GET", "/api/v1/notifications?filter=unread", { as });
    const titles = list.body.items.map((i: { title: string }) => i.title).sort();
    expect(titles).toEqual([
      "Call the bakery is due today",
      "Order the boxes is due in 3 days",
      "Sign the lease is overdue",
    ]);
    expect(list.body.items[0]).toMatchObject({ kind: "due", accessible: true, actor: null });
    expect((await call(app, "GET", "/api/v1/notifications/unread-count", { as })).body.total).toBe(
      3,
    );
    expect(
      (await call(app, "GET", "/api/v1/notifications", { as: await login(app, "ana") })).body.items,
    ).toEqual([]);
  });

  describe("8 am in the assignee's time zone", () => {
    test("waits until 08:00 on the assignee's clock", async () => {
      const id = await addItem({ dueDate: "2026-10-02", assignee: "ana" });
      // 07:59:59 in Manila (UTC+8) on 2026-10-02.
      const early = await run("2026-10-01T23:59:59Z");
      expect(early).toEqual({ checkedItems: 1, created: 0 });
      expect(await dueRows(id)).toEqual([]);
      const onTime = await run("2026-10-02T00:00:00Z");
      expect(onTime).toEqual({ checkedItems: 1, created: 1 });
    });

    test("each assignee is judged by their own zone", async () => {
      await setTimeZone("ana", "Asia/Manila");
      await setTimeZone("kenji", "America/Los_Angeles");
      await setTimeZone("paolo", "Pacific/Auckland");
      const items = {
        ana: await addItem({ dueDate: "2026-10-02", assignee: "ana" }),
        kenji: await addItem({ dueDate: "2026-10-02", assignee: "kenji" }),
        paolo: await addItem({ dueDate: "2026-10-02", assignee: "paolo" }),
      };
      // 18:00 in Manila, 03:00 in Los Angeles (UTC-7), 23:00 in Auckland (UTC+13), all on the 2nd.
      expect(await run("2026-10-02T10:00:00Z")).toEqual({ checkedItems: 3, created: 2 });
      expect(await dueRows(items.ana)).toHaveLength(1);
      expect(await dueRows(items.paolo)).toHaveLength(1);
      expect(await dueRows(items.kenji)).toEqual([]);
      // 08:00 in Los Angeles.
      expect(await run("2026-10-02T15:00:00Z")).toEqual({ checkedItems: 3, created: 1 });
      const [late] = await dueRows(items.kenji);
      expect(late?.dueStage).toBe("due_day");
      expect(late?.createdAt.toISOString()).toBe("2026-10-02T15:00:00.000Z");
    });

    test("the date is the assignee's local date, not the UTC date", async () => {
      await setTimeZone("ana", "Asia/Manila");
      await setTimeZone("kenji", "America/Los_Angeles");
      await setTimeZone("paolo", "Pacific/Auckland");
      // 2026-10-02T20:00Z: Manila 04:00 on the 3rd, Los Angeles 13:00 on the 2nd, Auckland 09:00 on the 3rd.
      const dueThird = {
        ana: await addItem({ dueDate: "2026-10-03", assignee: "ana" }),
        kenji: await addItem({ dueDate: "2026-10-03", assignee: "kenji" }),
        paolo: await addItem({ dueDate: "2026-10-03", assignee: "paolo" }),
      };
      await run("2026-10-02T20:00:00Z");
      expect((await dueRows(dueThird.paolo))[0]?.dueStage).toBe("due_day");
      expect((await dueRows(dueThird.kenji))[0]?.dueStage).toBe("three_days_before");
      expect(await dueRows(dueThird.ana)).toEqual([]);
    });

    test("a zone with daylight saving is read at the instant, not by a fixed offset", async () => {
      await setTimeZone("kenji", "America/Los_Angeles");
      const id = await addItem({ dueDate: "2026-11-02", assignee: "kenji" });
      // The clocks went back on 2026-11-01, so Los Angeles is UTC-8 on the 2nd: 15:59Z is 07:59.
      expect(await run("2026-11-02T15:59:59Z")).toMatchObject({ created: 0 });
      expect(await run("2026-11-02T16:00:00Z")).toMatchObject({ created: 1 });
      expect((await dueRows(id))[0]?.dueStage).toBe("due_day");
    });

    test("an unknown stored zone is read as Manila and logged", async () => {
      await setTimeZone("ana", "Not/AZone");
      const id = await addItem({ dueDate: "2026-10-02", assignee: "ana" });
      expect(await run("2026-10-01T23:59:59Z")).toMatchObject({ created: 0 });
      expect(await run("2026-10-02T00:00:00Z")).toMatchObject({ created: 1 });
      expect(await dueRows(id)).toHaveLength(1);
      expect(logLines.some((l) => l.includes("unknown time zone"))).toBe(true);
    });

    test("localTime reads the hour and date of an instant", () => {
      expect(localTime(new Date("2026-10-02T00:30:00Z"), "Asia/Manila")).toEqual({
        date: "2026-10-02",
        hour: 8,
      });
      expect(localTime(new Date("2026-10-02T00:30:00Z"), "America/Los_Angeles")).toEqual({
        date: "2026-10-01",
        hour: 17,
      });
      expect(localTime(new Date("2026-10-01T16:00:00Z"), "Asia/Manila")).toEqual({
        date: "2026-10-02",
        hour: 0,
      });
    });
  });

  describe("sending each stage once", () => {
    test("a second run creates nothing", async () => {
      await addItem({ dueDate: "2026-10-05", assignee: "ana" });
      await addItem({ dueDate: "2026-10-02", assignee: "kenji" });
      await addItem({ dueDate: "2026-10-01", assignee: "paolo" });
      expect(await run("2026-10-02T00:30:00Z")).toEqual({ checkedItems: 3, created: 3 });
      expect(await run("2026-10-02T00:30:00Z")).toEqual({ checkedItems: 3, created: 0 });
      expect(await run("2026-10-02T05:30:00Z")).toEqual({ checkedItems: 3, created: 0 });
      expect(await dueRows()).toHaveLength(3);
    });

    test("a notice that was read is not made again", async () => {
      await addItem({ dueDate: "2026-10-02", assignee: "ana" });
      await run("2026-10-02T00:30:00Z");
      await call(app, "POST", "/api/v1/notifications/read-all", { as: await login(app, "ana") });
      expect(await run("2026-10-02T01:30:00Z")).toMatchObject({ created: 0 });
      expect(await dueRows()).toHaveLength(1);
    });

    test("two runs at once still make one notice", async () => {
      await addItem({ dueDate: "2026-10-02", assignee: "ana" });
      await addItem({ dueDate: "2026-10-01", assignee: "kenji" });
      now = new Date("2026-10-02T00:30:00Z");
      const headers = bearer(await token());
      const results = await Promise.all([1, 2, 3].map(() => call(app, "POST", PATH, { headers })));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      const created = results.reduce((sum, r) => sum + r.body.created, 0);
      expect(created).toBe(2);
      expect(await dueRows()).toHaveLength(2);
    });

    test("an item walks through three days before, the day and overdue, one notice each", async () => {
      const id = await addItem({ dueDate: "2026-10-05", assignee: "ana" });
      const days = [
        ["2026-10-01T00:30:00Z", 0],
        ["2026-10-02T00:30:00Z", 1],
        ["2026-10-03T00:30:00Z", 0],
        ["2026-10-04T00:30:00Z", 0],
        ["2026-10-05T00:30:00Z", 1],
        ["2026-10-06T00:30:00Z", 1],
        ["2026-10-07T00:30:00Z", 0],
        ["2026-10-20T00:30:00Z", 0],
      ] as const;
      for (const [at, created] of days) {
        expect((await run(at)).created).toBe(created);
      }
      const rows = await dueRows(id);
      expect(rows.map((r) => r.dueStage).sort()).toEqual([
        "due_day",
        "overdue",
        "three_days_before",
      ]);
      expect(rows.every((r) => r.dueDate === "2026-10-05")).toBe(true);
    });

    test("after missed runs only the current stage is made", async () => {
      const id = await addItem({ dueDate: "2026-10-02", assignee: "ana" });
      expect(await run("2026-10-09T00:30:00Z")).toMatchObject({ created: 1 });
      expect((await dueRows(id)).map((r) => r.dueStage)).toEqual(["overdue"]);
    });

    test("changing the due date sends again", async () => {
      const id = await addItem({ dueDate: "2026-10-05", assignee: "ana" });
      expect(await run("2026-10-02T00:30:00Z")).toMatchObject({ created: 1 });
      const move = (dueDate: string) =>
        t.db.update(schema.executionItems).set({ dueDate }).where(eq(schema.executionItems.id, id));
      await move("2026-10-09");
      expect(await run("2026-10-02T01:30:00Z")).toMatchObject({ created: 0 });
      await move("2026-10-04");
      expect(await run("2026-10-02T02:30:00Z")).toMatchObject({ created: 1 });
      expect((await dueRows(id)).map((r) => r.dueDate).sort()).toEqual([
        "2026-10-04",
        "2026-10-05",
      ]);
    });

    test("a different item or assignee of the same date and stage is its own notice", async () => {
      await addItem({ dueDate: "2026-10-02", assignee: "ana" });
      await addItem({ dueDate: "2026-10-02", assignee: "ana" });
      await addItem({ dueDate: "2026-10-02", assignee: "kenji" });
      expect(await run("2026-10-02T00:30:00Z")).toEqual({ checkedItems: 3, created: 3 });
    });
  });

  describe("who is left out", () => {
    async function positive() {
      return addItem({ dueDate: "2026-10-02", assignee: "ana", title: "Control" });
    }
    async function expectOnlyControl(control: string) {
      const result = await run("2026-10-02T00:30:00Z");
      expect(result.created).toBe(1);
      const rows = await dueRows();
      expect(rows.map((r) => r.executionItemId)).toEqual([control]);
    }

    test("done and resolved items", async () => {
      const control = await positive();
      await addItem({ dueDate: "2026-10-02", status: "done" });
      await addItem({ type: "open_question", dueDate: "2026-10-02", status: "resolved" });
      await expectOnlyControl(control);
    });

    test("items still doing, to do or open are notified", async () => {
      await addItem({ dueDate: "2026-10-02", status: "doing" });
      await addItem({ type: "open_question", dueDate: "2026-10-02", status: "open" });
      await addItem({ type: "kpi", dueDate: "2026-10-02", status: null });
      expect((await run("2026-10-02T00:30:00Z")).created).toBe(3);
    });

    test("items without a member as assignee", async () => {
      const control = await positive();
      await addItem({ dueDate: "2026-10-02", assignee: null });
      await addItem({ dueDate: "2026-10-02", assignee: null, assigneeName: "The landlord" });
      await expectOnlyControl(control);
    });

    test("deleted items and items without a due date", async () => {
      const control = await positive();
      await addItem({ dueDate: "2026-10-02", deleted: true });
      await addItem({ dueDate: null });
      await expectOnlyControl(control);
    });

    test("suspended and deleted assignees", async () => {
      const control = await positive();
      await addItem({ dueDate: "2026-10-02", assignee: "kenji" });
      await addItem({ dueDate: "2026-10-02", assignee: "paolo" });
      await t.db
        .update(schema.users)
        .set({ status: "suspended" })
        .where(eq(schema.users.id, userId("kenji")));
      await t.db
        .update(schema.users)
        .set({ status: "deleted" })
        .where(eq(schema.users.id, userId("paolo")));
      await expectOnlyControl(control);
    });

    test("an assignee who has left the workspace", async () => {
      const control = await positive();
      await addItem({ dueDate: "2026-10-02", assignee: "kenji" });
      await t.db
        .delete(schema.memberships)
        .where(
          and(
            eq(schema.memberships.userId, userId("kenji")),
            eq(schema.memberships.workspaceId, BCDX),
          ),
        );
      await expectOnlyControl(control);
    });

    test("items of an archived idea or an archived plan", async () => {
      const control = await positive();
      await addItem({ dueDate: "2026-10-02", plan: planB });
      await t.db
        .update(schema.businessPlans)
        .set({ archivedAt: new Date("2026-09-01T00:00:00Z") })
        .where(eq(schema.businessPlans.id, planB));
      await expectOnlyControl(control);
      // The idea of plan A, once archived, silences it too.
      await t.db
        .update(schema.ideas)
        .set({ archivedAt: new Date("2026-09-01T00:00:00Z") })
        .where(eq(schema.ideas.id, ideaId("piaya")));
      expect(await run("2026-10-02T01:30:00Z")).toMatchObject({ created: 0 });
    });

    test("an item restored from the archive is notified at its next run", async () => {
      const id = await addItem({ dueDate: "2026-10-02", plan: planB });
      await t.db
        .update(schema.businessPlans)
        .set({ archivedAt: new Date("2026-09-01T00:00:00Z") })
        .where(eq(schema.businessPlans.id, planB));
      expect(await run("2026-10-02T00:30:00Z")).toMatchObject({ created: 0 });
      await t.db
        .update(schema.businessPlans)
        .set({ archivedAt: null })
        .where(eq(schema.businessPlans.id, planB));
      expect(await run("2026-10-02T01:30:00Z")).toMatchObject({ created: 1 });
      expect(await dueRows(id)).toHaveLength(1);
    });
  });

  test("with nothing to do the answer is zero and no row is written", async () => {
    expect(await run("2026-10-02T00:30:00Z")).toEqual({ checkedItems: 0, created: 0 });
    expect(await t.db.select().from(table)).toEqual([]);
  });
});

describe("local scripts", () => {
  const cwd = `${import.meta.dir}/..`;
  const databaseUrl = process.env.DATABASE_URL as string;

  async function script(
    file: string,
    args: string[],
    env: Record<string, string | undefined> = {},
  ) {
    const proc = Bun.spawn(["bun", `scripts/${file}`, ...args], {
      cwd,
      env: {
        ...process.env,
        APP_ENV: "local",
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: "test-secret-0123456789abcdef-0123",
        ...env,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout: stdout.trim(), stderr: stderr.trim(), code };
  }

  /** A zone where it is already past 8 am, so the script (which reads the real clock) may create. */
  function zoneAfterEight() {
    const zones = [
      "Asia/Manila",
      "Pacific/Auckland",
      "Europe/London",
      "America/Los_Angeles",
      "Pacific/Honolulu",
    ];
    const at = new Date();
    const zone = zones.find((z) => localTime(at, z).hour >= 8) as string;
    return { zone, today: localTime(at, zone).date };
  }

  describe("cron-due", () => {
    test("creates what is owed, prints the counts, and a second run adds nothing", async () => {
      const { zone, today } = zoneAfterEight();
      await setTimeZone("ana", zone);
      const id = await addItem({ dueDate: today, assignee: "ana", title: "Script item" });
      const first = await script("cron-due.ts", []);
      expect(first.code).toBe(0);
      const firstResult = JSON.parse(first.stdout.split("\n").at(-1) as string);
      expect(firstResult.created).toBeGreaterThanOrEqual(1);
      expect(firstResult.checkedItems).toBeGreaterThanOrEqual(firstResult.created);
      const rows = await dueRows(id);
      expect(rows.map((r) => r.dueStage)).toEqual(["due_day"]);

      const second = await script("cron-due.ts", []);
      expect(second.code).toBe(0);
      const secondResult = JSON.parse(second.stdout.split("\n").at(-1) as string);
      expect(secondResult.created).toBe(0);
      expect(secondResult.checkedItems).toBe(firstResult.checkedItems);
      expect(await dueRows(id)).toHaveLength(1);
    });

    test("on the demo data it only adds notices for items without one yet, then none", async () => {
      await seedDemo(t.db);
      const first = await script("cron-due.ts", []);
      expect(first.code).toBe(0);
      const second = await script("cron-due.ts", []);
      expect(JSON.parse(second.stdout.split("\n").at(-1) as string).created).toBe(0);
      const duplicates = await t.db
        .select({
          item: table.executionItemId,
          date: table.dueDate,
          stage: table.dueStage,
          n: count(),
        })
        .from(table)
        .where(eq(table.kind, "due"))
        .groupBy(table.executionItemId, table.dueDate, table.dueStage);
      expect(duplicates.every((d) => d.n === 1)).toBe(true);
    });

    test("refuses to run outside APP_ENV=local and without a database", async () => {
      const noDatabase = await script("cron-due.ts", [], { DATABASE_URL: "" });
      expect(noDatabase.code).toBe(2);
      expect(noDatabase.stderr).toContain("DATABASE_URL is required");
      const staging = await script("cron-due.ts", [], { APP_ENV: "staging" });
      expect(staging.code).not.toBe(0);
      const unset = await script("cron-due.ts", [], { APP_ENV: "" });
      expect(unset.code).not.toBe(0);
    });
  });

  describe("admin-create", () => {
    const email = "first.operator@example.com";

    test("prints the invitation link of an operator invitation", async () => {
      const out = await script("admin-create.ts", [email], {
        BETTER_AUTH_URL: "https://moonx.example/",
      });
      expect(out.code).toBe(0);
      const [message, link] = out.stdout.split("\n") as [string, string];
      expect(message).toStartWith(`Issued an operator invitation for ${email} (valid until `);
      expect(link).toStartWith("https://moonx.example/");
      const token = new URL(link as string).pathname.split("/").at(-1) as string;
      expect(token.length).toBeGreaterThan(20);

      const [invitation] = await t.db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.email, email));
      expect(invitation).toMatchObject({ workspaceId: null, status: "pending" });
      expect(invitation?.invitedById).toBe(userId("admin"));
      expect(link).toBe(`https://moonx.example/invite/${token}`);
      expect(invitation?.tokenHash).toBe(hashInvitationToken(token));
    });

    test("issues the first operator's invitation on a database without an operator", async () => {
      await t.db.update(schema.users).set({ isAdmin: false });
      const out = await script("admin-create.ts", [email]);
      expect(out.code).toBe(0);
      const [invitation] = await t.db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.email, email));
      expect(invitation).toMatchObject({ workspaceId: null, invitedById: null, status: "pending" });
      await t.db
        .update(schema.users)
        .set({ isAdmin: true })
        .where(eq(schema.users.id, userId("admin")));
      const listed = await call(t.app, "GET", "/api/v1/admin/invitations", {
        as: await login(t.app, "admin"),
      });
      expect(listed.body.items.find((i: { email: string }) => i.email === email)).toMatchObject({
        invitedBy: null,
        status: "pending",
      });
    });

    test("running it again reissues the link and the old one stops working", async () => {
      const first = await script("admin-create.ts", [email]);
      const second = await script("admin-create.ts", [email]);
      expect(second.code).toBe(0);
      expect(second.stdout.split("\n")[0]).toStartWith(
        `Reissued an operator invitation for ${email}`,
      );
      const tokenOf = (out: string) =>
        new URL(out.split("\n")[1] as string).pathname.split("/").at(-1);
      expect(tokenOf(second.stdout)).not.toBe(tokenOf(first.stdout));
      const rows = await t.db
        .select({ id: schema.invitations.id })
        .from(schema.invitations)
        .where(eq(schema.invitations.email, email));
      expect(rows).toHaveLength(1);
      expect(rows).toHaveLength(1);
      const [stored] = await t.db
        .select({ tokenHash: schema.invitations.tokenHash })
        .from(schema.invitations)
        .where(eq(schema.invitations.email, email));
      expect(stored?.tokenHash).toBe(hashInvitationToken(tokenOf(second.stdout) as string));
    });

    test("falls back to the local Web address without BETTER_AUTH_URL", async () => {
      const out = await script("admin-create.ts", [email], { BETTER_AUTH_URL: "" });
      expect(out.stdout.split("\n")[1]).toStartWith("http://localhost:5173/");
    });

    test("explains what is wrong and exits non-zero", async () => {
      const none = await script("admin-create.ts", []);
      expect(none.code).toBe(1);
      expect(none.stderr).toContain("Usage: bun run admin-create <email>");
      const bad = await script("admin-create.ts", ["not-an-email"]);
      expect(bad.code).toBe(1);
      expect(bad.stderr).toContain("is not a valid email address");
      const existing = await script("admin-create.ts", ["ana@bcdx.example"]);
      expect(existing.code).toBe(1);
      expect(existing.stderr).toContain("already exists");
      const noDatabase = await script("admin-create.ts", [email], { DATABASE_URL: "" });
      expect(noDatabase.code).toBe(1);
      expect(noDatabase.stderr).toContain("DATABASE_URL is required");
      expect(
        await t.db.select().from(schema.invitations).where(eq(schema.invitations.email, email)),
      ).toEqual([]);
    });
  });
});
