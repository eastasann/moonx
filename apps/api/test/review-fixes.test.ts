import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, ideaId, userId } from "@moonx/db/seed";
import { and, eq } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { InvalidCookieSignature, InvalidFileType } from "elysia";
import { z } from "zod";
import { ApiError } from "../src/errors";
import { reportable, sentrySafe } from "../src/lib/error-report";
import { decodeCursor } from "../src/lib/page";
import { touchValidationActivity } from "../src/lib/validation-write";
import { appOn, call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let ana: Record<string, string>;
let kenji: Record<string, string>;

beforeAll(async () => {
  t = await startTestApp();
  ana = await login(t.app, "ana");
  kenji = await login(t.app, "kenji");
});
afterAll(async () => {
  await t.close();
});

const piaya = ideaId("piaya");
const validationOf = async (idea: string) =>
  (
    await t.db
      .select({ id: schema.validations.id })
      .from(schema.validations)
      .where(eq(schema.validations.ideaId, idea))
  )[0]?.id as string;

describe("error reporting", () => {
  test("a database error keeps its Postgres code but never its SQL parameters", () => {
    const failure = new DrizzleQueryError(
      'insert into "x" values ($1)',
      ["secret answer text"],
      Object.assign(new Error("duplicate key"), { code: "23505", constraint_name: "x_uq" }),
    );
    const report = reportable(failure);
    expect(report).toMatchObject({ code: "23505", constraint: "x_uq" });
    expect(JSON.stringify(report)).not.toContain("secret answer text");
    expect(String(sentrySafe(failure))).not.toContain("secret answer text");
    expect((sentrySafe(failure) as Error).stack).not.toContain("secret answer text");
  });

  test("other errors are reported as they are", () => {
    const plain = new Error("boom");
    expect(reportable(plain)).toMatchObject({ name: "Error", message: "boom" });
    expect(sentrySafe(plain)).toBe(plain);
  });

  test("a deliberate INTERNAL error is logged like an unexpected one", async () => {
    const lines: { m: string; f?: Record<string, unknown> }[] = [];
    const app = appOn(
      t.db,
      {},
      {
        logger: { log: (_l, m, f) => lines.push({ m, f }) },
      },
    );
    const failing = app.get("/api/boom", () => {
      throw new ApiError("INTERNAL", "No published template");
    });
    const res = await failing.handle(new Request("http://localhost/api/boom"));
    expect(res.status).toBe(500);
    expect(lines.find((l) => l.m === "request failed")?.f).toMatchObject({
      errorCode: "INTERNAL",
      errorMessage: "No published template",
    });
  });

  test("a database failure in a handler logs no query text", async () => {
    const lines: string[] = [];
    const app = appOn(
      t.db,
      {},
      {
        logger: { log: (_l, m, f) => lines.push(JSON.stringify({ m, f })) },
      },
    );
    const failing = app.get("/api/boom", async () => {
      await t.db.insert(schema.users).values({
        id: userId("ana"),
        email: "leak-check@example.com",
        displayName: "Leak check",
      });
    });
    const res = await failing.handle(new Request("http://localhost/api/boom"));
    expect(res.status).toBe(500);
    const log = lines.join("\n");
    expect(log).toContain("23505");
    expect(log).not.toContain("leak-check@example.com");
    expect(log).not.toContain("insert into");
  });
});

describe("pipeline errors", () => {
  test("a response that fails its schema is a 500 and its content stays out of the log", async () => {
    const lines: string[] = [];
    const app = appOn(
      t.db,
      {},
      { logger: { log: (_l, m, f) => lines.push(JSON.stringify({ m, f })) } },
    );
    const route = app.get("/api/v", () => ({ email: "leak@example.com" }) as never, {
      response: z.object({ n: z.number() }),
    });
    const res = await route.handle(new Request("http://localhost/api/v"));
    expect(res.status).toBe(500);
    expect(lines.join("\n")).toContain("request failed");
    expect(lines.join("\n")).not.toContain("leak@example.com");
  });

  test("Elysia's own client errors keep their class: bad file type 422, bad cookie signature 400", async () => {
    const app = appOn(t.db);
    const route = app
      .get("/api/file", () => {
        throw new InvalidFileType("avatar", "image/png");
      })
      .get("/api/cookie", () => {
        throw new InvalidCookieSignature("session");
      });
    expect((await route.handle(new Request("http://localhost/api/file"))).status).toBe(422);
    expect((await route.handle(new Request("http://localhost/api/cookie"))).status).toBe(400);
  });
});

describe("no-op writes leave no trace", () => {
  test("a competitor PATCH with the same values keeps the lock version and writes no history", async () => {
    const vid = await validationOf(piaya);
    const [row] = await t.db
      .select()
      .from(schema.competitors)
      .where(eq(schema.competitors.validationId, vid));
    const before = (
      await t.db
        .select()
        .from(schema.changeHistory)
        .where(eq(schema.changeHistory.targetId, row?.id as string))
    ).length;
    const res = await call(t.app, "PATCH", `/api/v1/competitors/${row?.id}`, {
      as: kenji,
      body: { name: row?.name, lockVersion: row?.lockVersion },
    });
    expect(res.status).toBe(200);
    expect(res.body.lockVersion).toBe(row?.lockVersion);
    const [after] = await t.db
      .select()
      .from(schema.competitors)
      .where(eq(schema.competitors.id, row?.id as string));
    expect(after?.lockVersion).toBe(row?.lockVersion);
    expect(after?.updatedById).toBe(row?.updatedById);
    expect(
      (
        await t.db
          .select()
          .from(schema.changeHistory)
          .where(eq(schema.changeHistory.targetId, row?.id as string))
      ).length,
    ).toBe(before);
  });

  test("an economics input set to its current value, or cleared when it has no row, changes nothing", async () => {
    const vid = await validationOf(ideaId("bike-repair"));
    const none = await call(t.app, "PUT", `/api/v1/validations/${vid}/economics/units_strong`, {
      as: kenji,
      body: { value: null, lockVersion: 0 },
    });
    expect(none.status).toBe(200);
    expect(
      await t.db
        .select()
        .from(schema.economicsInputs)
        .where(
          and(
            eq(schema.economicsInputs.validationId, vid),
            eq(schema.economicsInputs.fieldKey, "units_strong"),
          ),
        ),
    ).toHaveLength(0);

    const first = await call(t.app, "PUT", `/api/v1/validations/${vid}/economics/units_strong`, {
      as: kenji,
      body: { value: 12, lockVersion: 0 },
    });
    expect(first.body.lockVersion).toBe(1);
    const again = await call(t.app, "PUT", `/api/v1/validations/${vid}/economics/units_strong`, {
      as: kenji,
      body: { value: 12, lockVersion: 1 },
    });
    expect(again.status).toBe(200);
    expect(again.body.lockVersion).toBe(1);
  });
});

describe("activity touches", () => {
  test("a content write keeps the summary's own editor and update time", async () => {
    const [before] = await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, piaya));
    const vid = await validationOf(piaya);
    const [answer] = await t.db
      .select()
      .from(schema.validationAnswers)
      .where(eq(schema.validationAnswers.validationId, vid));
    await call(t.app, "PUT", `/api/v1/validations/${vid}/answers/${answer?.questionKey}`, {
      as: kenji,
      body: { text: "Changed for the activity test", lockVersion: answer?.lockVersion },
    });
    const [after] = await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, piaya));
    expect(after?.updatedAt).toEqual(before?.updatedAt as Date);
    expect(after?.updatedById).toBe(before?.updatedById ?? null);
    expect(after?.lastActivityAt.getTime()).toBeGreaterThan(before?.lastActivityAt.getTime() ?? 0);
  });

  test("an idea archived before the write commits refuses it with ARCHIVED", async () => {
    const target = ideaId("laundry");
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: new Date() })
      .where(eq(schema.ideas.id, target));
    const error = await t.db
      .transaction((tx) =>
        touchValidationActivity(tx, { workspaceId: BCDX, ideaId: target }, new Date()),
      )
      .catch((e) => e);
    expect(error.code).toBe("ARCHIVED");
    await t.db.update(schema.ideas).set({ archivedAt: null }).where(eq(schema.ideas.id, target));
  });
});

describe("decisions", () => {
  test("a decision recorded after waiting still sorts after the one committed meanwhile", async () => {
    const frozen = new Date("2020-01-01T00:00:00Z");
    const app = appOn(t.db, {}, { now: () => frozen });
    const idea = ideaId("bike-repair");
    const post = (as: Record<string, string>, based: string | null) =>
      call(app, "POST", `/api/v1/ideas/${idea}/decisions`, {
        as,
        body: { value: "hold", reason: "r", basedOnDecisionId: based, confirmNewer: true },
      });
    const first = await post(ana, null);
    const second = await post(kenji, first.body.entry.id);
    expect(Date.parse(second.body.entry.recordedAt)).toBeGreaterThan(
      Date.parse(first.body.entry.recordedAt),
    );
    const ordered = await t.db
      .select({ id: schema.decisionLogEntries.id })
      .from(schema.decisionLogEntries)
      .where(eq(schema.decisionLogEntries.ideaId, idea))
      .orderBy(schema.decisionLogEntries.recordedAt);
    expect(ordered.at(-1)?.id).toBe(second.body.entry.id);
  });
});

describe("invitations", () => {
  test("two simultaneous invitations for one address leave one pending invitation", async () => {
    const send = () =>
      call(t.app, "POST", `/api/v1/workspaces/${BCDX}/invitations`, {
        as: ana,
        body: { email: "double.click@example.com", role: "member" },
      });
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const rows = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.email, "double.click@example.com"));
    expect(rows).toHaveLength(1);
  });

  test("a failing mail provider rolls the invitation back and answers 503 UPSTREAM_UNAVAILABLE", async () => {
    const app = appOn(
      t.db,
      {},
      {
        mailer: {
          async send() {
            throw new ApiError("UPSTREAM_UNAVAILABLE", "Resend answered 500");
          },
        },
      },
    );
    const res = await call(app, "POST", `/api/v1/workspaces/${BCDX}/invitations`, {
      as: ana,
      body: { email: "mail.down@example.com", role: "member" },
    });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(
      await t.db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.email, "mail.down@example.com")),
    ).toHaveLength(0);
  });

  test("a signed-in non-member gets NO_ACCESS on an invitation of another workspace, a member FORBIDDEN", async () => {
    const own = await call(t.app, "POST", "/api/v1/workspaces", {
      as: kenji,
      body: { name: "Kenji's own" },
    });
    const invite = await call(t.app, "POST", `/api/v1/workspaces/${own.body.id}/invitations`, {
      as: kenji,
      body: { email: "elsewhere@example.com", role: "member" },
    });
    const anasView = await call(
      t.app,
      "POST",
      `/api/v1/invitations/${invite.body.invitation.id}/resend`,
      { as: ana },
    );
    expect(anasView.status).toBe(403);
    expect(anasView.body.error.code).toBe("NO_ACCESS");
    const [pending] = await t.db
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.email, "new.member@bcdx.example"));
    const asMember = await call(t.app, "POST", `/api/v1/invitations/${pending?.id}/resend`, {
      as: kenji,
    });
    expect(asMember.status).toBe(403);
    expect(asMember.body.error.code).toBe("FORBIDDEN");
  });
});

describe("paging and time zones", () => {
  test("a cursor beyond the supported offset is a validation error, not a 500", () => {
    expect(decodeCursor(Buffer.from(JSON.stringify({ o: 10 })).toString("base64url"))).toBe(10);
    expect(() =>
      decodeCursor(Buffer.from(JSON.stringify({ o: 1e21 })).toString("base64url")),
    ).toThrow();
    expect(() => decodeCursor("not a cursor")).toThrow();
  });

  test("due-soon follows the caller's time zone", async () => {
    // 20:00 UTC on the 1st is already the 2nd in Manila (UTC+8) and still the 1st in Honolulu.
    const at = new Date("2027-03-01T20:00:00Z");
    const app = appOn(t.db, {}, { now: () => at });
    const [item] = await t.db
      .select({ id: schema.executionItems.id })
      .from(schema.executionItems)
      .innerJoin(
        schema.businessPlans,
        eq(schema.businessPlans.id, schema.executionItems.businessPlanId),
      )
      .where(eq(schema.businessPlans.ideaId, piaya));
    await t.db
      .update(schema.executionItems)
      .set({ dueDate: "2027-03-01", status: "todo" })
      .where(eq(schema.executionItems.id, item?.id as string));
    const overdueFor = async (timezone: string) => {
      await t.db
        .update(schema.users)
        .set({ timezone })
        .where(eq(schema.users.id, userId("ana")));
      const res = await call(app, "GET", `/api/v1/workspaces/${BCDX}/dashboard/due-soon`, {
        as: ana,
      });
      return res.body.items.find((i: { id: string }) => i.id === item?.id)?.overdue;
    };
    expect(await overdueFor("Asia/Manila")).toBe(true);
    expect(await overdueFor("Pacific/Honolulu")).toBe(false);
  });
});

describe("duplicate", () => {
  test("copied answers and economics inputs start at version 1", async () => {
    const res = await call(t.app, "POST", `/api/v1/ideas/${piaya}/duplicate`, {
      as: ana,
      body: {},
    });
    expect(res.status).toBe(201);
    const copy = await validationOf(res.body.id);
    const answers = await t.db
      .select({ v: schema.validationAnswers.lockVersion })
      .from(schema.validationAnswers)
      .where(eq(schema.validationAnswers.validationId, copy));
    const inputs = await t.db
      .select({ v: schema.economicsInputs.lockVersion })
      .from(schema.economicsInputs)
      .where(eq(schema.economicsInputs.validationId, copy));
    expect(answers.length + inputs.length).toBeGreaterThan(0);
    for (const row of [...answers, ...inputs]) expect(row.v).toBe(1);
  });
});

describe("answers to the documentation review", () => {
  test("a 204 is logged as 204", async () => {
    const [invitation] = await t.db
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(eq(schema.invitations.email, "new.member@bcdx.example"));
    t.logLines.length = 0;
    const res = await call(t.app, "DELETE", `/api/v1/invitations/${invitation?.id}`, { as: ana });
    expect(res.status).toBe(204);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    await Bun.sleep(20);
    const line = JSON.parse(t.logLines.find((l) => l.includes('"message":"request"')) as string);
    expect(line.status).toBe(204);
  });

  test("an archived idea cannot be given a plan", async () => {
    const id = ideaId("study-cafe");
    const home = () => call(t.app, "GET", `/api/v1/ideas/${id}/validation`, { as: ana });
    expect((await home()).body.canAddPlan).toBe(true);
    await call(t.app, "POST", `/api/v1/ideas/${id}/archive`, { as: ana });
    expect((await home()).body.canAddPlan).toBe(false);
    await call(t.app, "POST", `/api/v1/ideas/${id}/restore`, { as: ana });
  });

  test("a short text answer holds 200 characters, a long one 20,000", async () => {
    const vid = await validationOf(ideaId("bike-repair"));
    const put = (key: string, text: string) =>
      call(t.app, "PUT", `/api/v1/validations/${vid}/answers/${key}`, {
        as: kenji,
        body: { text, lockVersion: 0, force: true },
      });
    const tooLong = await put("V.02.CATEGORY", "x".repeat(201));
    expect(tooLong.status).toBe(422);
    expect(tooLong.body.error.details[0]).toMatchObject({ path: "text", code: "too_big" });
    expect((await put("V.02.CATEGORY", "x".repeat(200))).status).toBe(200);
    expect((await put("V.01.WHO", "x".repeat(20_000))).status).toBe(200);
  });

  test("blank optional texts of rows are stored as no text", async () => {
    const vid = await validationOf(ideaId("bike-repair"));
    const created = await call(t.app, "POST", `/api/v1/validations/${vid}/competitors`, {
      as: kenji,
      body: { name: "Blank maker", strength: "   ", offering: "" },
    });
    expect(created.status).toBe(201);
    expect(created.body.strength).toBeNull();
    expect(created.body.offering).toBeNull();
  });

  test("comments on a deleted row stay out of the activity feed", async () => {
    const vid = await validationOf(piaya);
    const [competitor] = await t.db
      .select({ id: schema.competitors.id })
      .from(schema.competitors)
      .where(eq(schema.competitors.validationId, vid));
    await t.db.insert(schema.comments).values({
      workspaceId: BCDX,
      targetType: "competitor",
      targetId: competitor?.id as string,
      authorId: userId("kenji"),
      body: "Visible while the row lives",
    });
    const feed = async () =>
      (await call(t.app, "GET", `/api/v1/workspaces/${BCDX}/dashboard/activity`, { as: ana })).body
        .items as { kind: string; link: { target?: { id: string } } }[];
    const has = async () =>
      (await feed()).some((e) => e.kind === "comment" && e.link.target?.id === competitor?.id);
    expect(await has()).toBe(true);
    await t.db
      .update(schema.competitors)
      .set({ deletedAt: new Date() })
      .where(eq(schema.competitors.id, competitor?.id as string));
    expect(await has()).toBe(false);
  });
});
