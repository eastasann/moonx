import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import {
  BCDX,
  ideaId,
  type PersonKey,
  personalWorkspaceId,
  planId,
  seedDemo,
  userId,
} from "@moonx/db/seed";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let as: Record<PersonKey, Record<string, string>>;

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

const api = "/api/v1/notifications";
const MISSING = "00000000-0000-4000-8000-000000000001";
const piaya = ideaId("piaya");
const planA = planId("piaya-a");
const planB = planId("piaya-b");
const table = schema.notifications;

const rowsOf = (person: PersonKey) =>
  t.db
    .select()
    .from(table)
    .where(eq(table.userId, userId(person)));

const unreadOf = async (person: PersonKey) =>
  (await rowsOf(person)).filter((r) => r.readAt === null).length;

/** The people who got a notification of `kind` since the table was emptied, by key. */
async function recipients(kind: "mention" | "comment" | "decision" | "due") {
  const rows = await t.db.select().from(table).where(eq(table.kind, kind));
  return rows.map((r) => r.userId).sort();
}
const ids = (...people: PersonKey[]) => people.map(userId).sort();

async function clearNotifications() {
  await t.db.delete(table);
}

async function validationOf(idea: string) {
  const [row] = await t.db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, idea));
  return (row as { id: string }).id;
}

async function analysisOf(person: PersonKey) {
  const [row] = await t.db
    .select({ id: schema.selfAnalyses.id })
    .from(schema.selfAnalyses)
    .where(eq(schema.selfAnalyses.userId, userId(person)));
  return (row as { id: string }).id;
}

function comment(
  who: PersonKey,
  target: { type: string; id: string; key?: string },
  body: string,
  extra: { mentions?: PersonKey[]; parentId?: string } = {},
) {
  return call(t.app, "POST", "/api/v1/comments", {
    as: as[who],
    body: {
      workspaceId: BCDX,
      target,
      body,
      parentId: extra.parentId,
      mentionUserIds: (extra.mentions ?? []).map(userId),
    },
  });
}

const whoTarget = async () => ({
  type: "validation_answer",
  id: await validationOf(piaya),
  key: "V.01.WHO",
});

describe("N1 list", () => {
  test("shows only the caller's notifications, newest first, in the documented shape", async () => {
    for (const person of ["ana", "kenji", "paolo", "grace", "admin"] as const) {
      const res = await call(t.app, "GET", `${api}?limit=200`, { as: as[person] });
      expect(res.status).toBe(200);
      const mine = (await rowsOf(person)).map((r) => r.id).sort();
      expect(res.body.items.map((i: { id: string }) => i.id).sort()).toEqual(mine);
      expect(res.body.nextCursor).toBeNull();
      const times = res.body.items.map((i: { createdAt: string }) => Date.parse(i.createdAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
    }
    const [item] = (await call(t.app, "GET", api, { as: as.ana })).body.items;
    expect(Object.keys(item).sort()).toEqual(
      [
        "accessible",
        "actor",
        "createdAt",
        "excerpt",
        "id",
        "kind",
        "link",
        "readAt",
        "title",
        "workspace",
      ].sort(),
    );
  });

  test("a person with nothing gets an empty page", async () => {
    const res = await call(t.app, "GET", api, { as: as.admin });
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  test("titles and excerpts read from what the notification is about", async () => {
    const res = await call(t.app, "GET", `${api}?limit=200`, { as: as.ana });
    const items = res.body.items as {
      kind: string;
      title: string;
      excerpt: string | null;
      actor: { displayName: string } | null;
      workspace: { id: string; name: string };
      link: { screen: number };
      readAt: string | null;
    }[];
    const delayIf = items.find((i) => i.kind === "comment" && i.link.screen === 21);
    expect(delayIf?.title).toBe("Paolo Gonzaga commented on Plan 24.2");
    expect(delayIf?.excerpt).toBe("Should five pilot offices be the threshold, or ten?");
    expect(delayIf?.actor?.displayName).toBe("Paolo Gonzaga");
    expect(delayIf?.workspace).toEqual({ id: BCDX, name: expect.any(String) });
    expect(delayIf?.readAt).toBeNull();

    const hold = items.find((i) => i.title.includes("recorded a decision on"));
    expect(hold?.excerpt).toEqual(expect.any(String));

    const overdue = items.find((i) => i.kind === "due" && i.title.endsWith("is overdue"));
    expect(overdue?.excerpt).toBeNull();
    expect(overdue?.actor).toBeNull();
    const dueIds = items.filter((i) => i.kind === "due").map((i) => i.title);
    expect(dueIds).toHaveLength(3);
  });

  test("the title says Go / No-Go and the saved version for those entries", async () => {
    const res = await call(t.app, "GET", `${api}?limit=200`, { as: as.kenji });
    const titles = res.body.items.map((i: { title: string }) => i.title) as string[];
    expect(titles.some((x) => /^Ana Villanueva recorded Go \/ No-Go on .+/.test(x))).toBe(true);
    expect(titles.some((x) => /^Ana Villanueva saved v1 For advisors of .+/.test(x))).toBe(true);
  });

  test("filter=unread keeps only unread, filter=all and no filter keep everything", async () => {
    const all = await call(t.app, "GET", `${api}?limit=200`, { as: as.kenji });
    const unread = await call(t.app, "GET", `${api}?filter=unread&limit=200`, { as: as.kenji });
    const expected = (await rowsOf("kenji")).filter((r) => r.readAt === null);
    expect(unread.body.items).toHaveLength(expected.length);
    expect(unread.body.items.every((i: { readAt: string | null }) => i.readAt === null)).toBe(true);
    expect(expected.length).toBeLessThan(all.body.items.length);
    const explicit = await call(t.app, "GET", `${api}?filter=all&limit=200`, { as: as.kenji });
    expect(explicit.body.items).toEqual(all.body.items);
  });

  test("an unknown filter, limit or cursor is 422", async () => {
    for (const query of ["filter=read", "limit=0", "limit=201", "cursor=%25%25"]) {
      const res = await call(t.app, "GET", `${api}?${query}`, { as: as.ana });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
  });

  test("pages with the cursor, with and without the unread filter", async () => {
    for (const filter of ["all", "unread"]) {
      const full = await call(t.app, "GET", `${api}?filter=${filter}&limit=200`, { as: as.ana });
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res: {
          status: number;
          body: { items: { id: string }[]; nextCursor: string | null };
        } = await call(
          t.app,
          "GET",
          `${api}?filter=${filter}&limit=4${cursor ? `&cursor=${cursor}` : ""}`,
          { as: as.ana },
        );
        expect(res.status).toBe(200);
        seen.push(...res.body.items.map((i) => i.id));
        cursor = res.body.nextCursor;
        pages += 1;
      } while (cursor && pages < 20);
      expect(pages).toBe(Math.ceil(full.body.items.length / 4));
      expect(seen).toEqual(full.body.items.map((i: { id: string }) => i.id));
    }
  });

  test("lists the notifications of every workspace in one list with each name", async () => {
    await t.db.insert(table).values({
      userId: userId("ana"),
      workspaceId: personalWorkspaceId("ana"),
      kind: "decision",
      link: { screen: 13, workspaceId: personalWorkspaceId("ana") },
      createdAt: new Date(),
    });
    const res = await call(t.app, "GET", `${api}?limit=200`, { as: as.ana });
    const names = new Map<string, string>(
      res.body.items.map((i: { workspace: { id: string; name: string } }) => [
        i.workspace.id,
        i.workspace.name,
      ]),
    );
    expect(names.size).toBe(2);
    expect(names.get(personalWorkspaceId("ana"))).toBe("Ana Villanueva's workspace");
  });

  describe("accessible", () => {
    test("is true while the person is a member, false once they leave the workspace", async () => {
      const before = await call(t.app, "GET", `${api}?limit=200`, { as: as.kenji });
      expect(before.body.items.every((i: { accessible: boolean }) => i.accessible)).toBe(true);
      await t.db.delete(schema.memberships).where(eq(schema.memberships.userId, userId("kenji")));
      const after = await call(t.app, "GET", `${api}?limit=200`, { as: as.kenji });
      expect(after.body.items.length).toBe(before.body.items.length);
      expect(after.body.items.every((i: { accessible: boolean }) => !i.accessible)).toBe(true);
    });

    test("a self analysis comment needs the right to read the analysis", async () => {
      const saId = await analysisOf("ana");
      const link = {
        screen: 12,
        workspaceId: BCDX,
        userId: userId("ana"),
        target: { type: "self_analysis_answer", id: saId, key: "SA.WHY.1" },
      };
      const give = (person: PersonKey) =>
        t.db
          .insert(table)
          .values({ userId: userId(person), workspaceId: BCDX, kind: "comment", link });
      await clearNotifications();
      await give("ana");
      await give("kenji");
      await give("grace");
      const accessibleFor = async (person: PersonKey) =>
        (await call(t.app, "GET", api, { as: as[person] })).body.items[0].accessible;
      expect(await accessibleFor("ana")).toBe(true);
      expect(await accessibleFor("kenji")).toBe(true);
      expect(await accessibleFor("grace")).toBe(false);
      await t.db
        .delete(schema.selfAnalysisShares)
        .where(eq(schema.selfAnalysisShares.selfAnalysisId, saId));
      expect(await accessibleFor("kenji")).toBe(false);
      expect(await accessibleFor("ana")).toBe(true);
    });
  });

  test("a notification that is not accessible carries no title or excerpt", async () => {
    const saId = await analysisOf("ana");
    await clearNotifications();
    await t.db.insert(table).values({
      userId: userId("kenji"),
      workspaceId: BCDX,
      kind: "comment",
      actorId: userId("ana"),
      link: {
        screen: 12,
        workspaceId: BCDX,
        userId: userId("ana"),
        target: { type: "self_analysis_answer", id: saId, key: "SA.WHY.1" },
      },
    });
    const open = (await call(t.app, "GET", api, { as: as.kenji })).body.items[0];
    expect(open.accessible).toBe(true);
    expect(open.title).not.toBe("");
    await t.db
      .delete(schema.selfAnalysisShares)
      .where(eq(schema.selfAnalysisShares.selfAnalysisId, saId));
    const closed = (await call(t.app, "GET", api, { as: as.kenji })).body.items[0];
    expect(closed).toMatchObject({ accessible: false, title: "", excerpt: null });
  });

  test("a deleted comment shows no excerpt and a missing actor reads Deleted user", async () => {
    await clearNotifications();
    const target = await whoTarget();
    const written = await comment("paolo", target, "Secret text here", { mentions: ["kenji"] });
    expect(written.status).toBe(201);
    const first = await call(t.app, "GET", api, { as: as.kenji });
    expect(first.body.items[0].excerpt).toBe("Secret text here");
    await t.db
      .update(schema.comments)
      .set({ deletedAt: new Date() })
      .where(eq(schema.comments.id, written.body.id));
    await t.db
      .update(schema.users)
      .set({ status: "deleted" })
      .where(eq(schema.users.id, userId("paolo")));
    const second = await call(t.app, "GET", api, { as: as.kenji });
    expect(second.body.items[0].excerpt).toBeNull();
    expect(second.body.items[0].title).toStartWith("Deleted user mentioned you on");
  });

  test("a comment on something that no longer exists still lists with a generic phrase", async () => {
    await clearNotifications();
    const target = await whoTarget();
    await comment("paolo", target, "hello", { mentions: ["kenji"] });
    await t.db
      .update(table)
      .set({ link: { screen: 11, workspaceId: BCDX, target: { type: "cost_item", id: MISSING } } });
    const res = await call(t.app, "GET", api, { as: as.kenji });
    expect(res.status).toBe(200);
    expect(res.body.items[0].title).toBe("Paolo Gonzaga mentioned you on an item");
  });
});

describe("N2 unread count", () => {
  test("counts the caller's unread notifications only", async () => {
    for (const person of ["ana", "kenji", "paolo", "grace", "admin"] as const) {
      const res = await call(t.app, "GET", `${api}/unread-count`, { as: as[person] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ total: await unreadOf(person) });
    }
    expect((await unreadOf("ana")) > 0).toBe(true);
  });

  test("is not read as a notification id", async () => {
    const res = await call(t.app, "GET", `${api}/unread-count`, { as: as.ana });
    expect(res.status).toBe(200);
  });
});

describe("N3 read", () => {
  async function firstUnread(person: PersonKey) {
    const row = (await rowsOf(person)).find((r) => r.readAt === null);
    return row as NonNullable<typeof row>;
  }

  test("marks one read, answers 204 and lowers the count", async () => {
    const before = (await call(t.app, "GET", `${api}/unread-count`, { as: as.kenji })).body.total;
    const target = await firstUnread("kenji");
    const res = await call(t.app, "POST", `${api}/${target.id}/read`, { as: as.kenji });
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    const after = (await call(t.app, "GET", `${api}/unread-count`, { as: as.kenji })).body.total;
    expect(after).toBe(before - 1);
    const listed = (await call(t.app, "GET", `${api}?limit=200`, { as: as.kenji })).body.items.find(
      (i: { id: string }) => i.id === target.id,
    );
    expect(typeof listed.readAt).toBe("string");
  });

  test("reading again is 204 and keeps the first read time", async () => {
    const target = await firstUnread("kenji");
    await call(t.app, "POST", `${api}/${target.id}/read`, { as: as.kenji });
    const [first] = await t.db.select().from(table).where(eq(table.id, target.id));
    await Bun.sleep(15);
    const again = await call(t.app, "POST", `${api}/${target.id}/read`, { as: as.kenji });
    expect(again.status).toBe(204);
    const [second] = await t.db.select().from(table).where(eq(table.id, target.id));
    expect(second?.readAt?.getTime()).toBe(first?.readAt?.getTime() as number);
  });

  test("somebody else's notification and an unknown id are 404 and stay unread", async () => {
    const theirs = await firstUnread("kenji");
    const res = await call(t.app, "POST", `${api}/${theirs.id}/read`, { as: as.ana });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect((await firstUnread("kenji")).id).toBeDefined();
    const [row] = await t.db.select().from(table).where(eq(table.id, theirs.id));
    expect(row?.readAt).toBeNull();
    const unknown = await call(t.app, "POST", `${api}/${MISSING}/read`, { as: as.ana });
    expect(unknown.status).toBe(404);
    const bad = await call(t.app, "POST", `${api}/nope/read`, { as: as.ana });
    expect(bad.status).toBe(422);
  });

  test("read-all marks every unread of the caller and nobody else's", async () => {
    const othersBefore = await unreadOf("kenji");
    const res = await call(t.app, "POST", `${api}/read-all`, { as: as.ana });
    expect(res.status).toBe(204);
    expect(await unreadOf("ana")).toBe(0);
    expect(await unreadOf("kenji")).toBe(othersBefore);
    expect((await call(t.app, "GET", `${api}/unread-count`, { as: as.ana })).body.total).toBe(0);
    const unread = await call(t.app, "GET", `${api}?filter=unread`, { as: as.ana });
    expect(unread.body.items).toEqual([]);
  });

  test("read-all keeps the time of what was already read and works with nothing unread", async () => {
    const readBefore = (await rowsOf("ana")).filter((r) => r.readAt);
    await call(t.app, "POST", `${api}/read-all`, { as: as.ana });
    const readAfter = new Map((await rowsOf("ana")).map((r) => [r.id, r.readAt?.getTime()]));
    for (const row of readBefore) expect(readAfter.get(row.id)).toBe(row.readAt?.getTime());
    expect((await call(t.app, "POST", `${api}/read-all`, { as: as.ana })).status).toBe(204);
    expect((await call(t.app, "POST", `${api}/read-all`, { as: as.admin })).status).toBe(204);
  });

  test("read-all spans every workspace of the caller", async () => {
    await t.db.insert(table).values({
      userId: userId("ana"),
      workspaceId: personalWorkspaceId("ana"),
      kind: "decision",
      link: { screen: 13 },
    });
    await call(t.app, "POST", `${api}/read-all`, { as: as.ana });
    const left = await t.db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.userId, userId("ana")), isNull(table.readAt)));
    expect(left).toEqual([]);
  });
});

describe("permissions", () => {
  test("every role, the operator included, reaches its own notifications", async () => {
    for (const person of ["ana", "kenji", "grace", "admin"] as const) {
      for (const [method, path] of [
        ["GET", api],
        ["GET", `${api}/unread-count`],
        ["POST", `${api}/read-all`],
      ]) {
        const res = await call(t.app, method as string, path as string, { as: as[person] });
        expect(res.status).toBeLessThan(300);
      }
    }
  });

  test("without a session every endpoint is 401", async () => {
    const some = (await rowsOf("ana"))[0] as { id: string };
    for (const [method, path] of [
      ["GET", api],
      ["GET", `${api}/unread-count`],
      ["POST", `${api}/read-all`],
      ["POST", `${api}/${some.id}/read`],
    ]) {
      const res = await call(t.app, method as string, path as string);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("a suspended person is 401", async () => {
    await t.db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, userId("kenji")));
    expect((await call(t.app, "GET", api, { as: as.kenji })).status).toBe(401);
  });

  test("there is no way to create or delete a notification through the API", async () => {
    const some = (await rowsOf("ana"))[0] as { id: string };
    const before = (await t.db.select({ id: table.id }).from(table)).length;
    for (const [method, path] of [
      ["POST", api],
      ["DELETE", api],
      ["DELETE", `${api}/${some.id}`],
      ["PATCH", `${api}/${some.id}`],
      ["PUT", `${api}/${some.id}/read`],
    ]) {
      const res = await call(t.app, method as string, path as string, { as: as.ana, body: {} });
      expect(res.status).toBe(404);
    }
    expect((await t.db.select({ id: table.id }).from(table)).length).toBe(before);
  });
});

describe("creation: mention and comment", () => {
  beforeEach(clearNotifications);

  test("a mention notifies the mentioned person and the idea's proposer, not the author", async () => {
    const res = await comment("paolo", await whoTarget(), "Check this, @Kenji", {
      mentions: ["kenji"],
    });
    expect(res.status).toBe(201);
    expect(await recipients("mention")).toEqual(ids("kenji"));
    // Ana proposed the idea, so she hears about the comment although nobody mentioned her.
    expect(await recipients("comment")).toEqual(ids("ana"));
    const [mention] = await t.db.select().from(table).where(eq(table.kind, "mention"));
    expect(mention).toMatchObject({
      workspaceId: BCDX,
      actorId: userId("paolo"),
      commentId: res.body.thread?.id ?? res.body.id,
      readAt: null,
    });
    expect(mention?.link).toMatchObject({
      screen: 11,
      workspaceId: BCDX,
      ideaId: piaya,
      panel: "comments",
      target: { type: "validation_answer", key: "V.01.WHO" },
    });
    const listed = await call(t.app, "GET", api, { as: as.kenji });
    expect(listed.body.items[0]).toMatchObject({ kind: "mention", accessible: true });
    expect(listed.body.items[0].title).toStartWith("Paolo Gonzaga mentioned you on");
  });

  test("someone who is both mentioned and the proposer gets the mention only", async () => {
    await comment("paolo", await whoTarget(), "Ana, look", { mentions: ["ana"] });
    expect(await recipients("mention")).toEqual(ids("ana"));
    expect(await recipients("comment")).toEqual([]);
  });

  test("nobody is told about their own comment", async () => {
    await comment("ana", await whoTarget(), "Note to self");
    expect(await t.db.select().from(table)).toEqual([]);
    await comment("ana", await whoTarget(), "Note to Kenji", { mentions: ["kenji"] });
    expect(await recipients("mention")).toEqual(ids("kenji"));
    expect(await recipients("comment")).toEqual([]);
  });

  test("a reply notifies everyone who wrote in the thread", async () => {
    const root = await comment("kenji", await whoTarget(), "First");
    await clearNotifications();
    const reply = await comment("paolo", await whoTarget(), "Second", { parentId: root.body.id });
    expect(reply.status).toBe(201);
    // The thread's author and the proposer.
    expect(await recipients("comment")).toEqual(ids("ana", "kenji"));
    await clearNotifications();
    await comment("ana", await whoTarget(), "Third", { parentId: root.body.id });
    // Everyone who wrote in the thread, so Paolo's reply counts too.
    expect(await recipients("comment")).toEqual(ids("kenji", "paolo"));
  });

  test("a comment on a plan goes to whoever created the plan", async () => {
    const [plan] = await t.db
      .select({ createdById: schema.businessPlans.createdById })
      .from(schema.businessPlans)
      .where(eq(schema.businessPlans.id, planA));
    const author: PersonKey = plan?.createdById === userId("paolo") ? "kenji" : "paolo";
    const res = await comment(author, { type: "plan_answer", id: planA, key: "P.24.2" }, "Why?");
    expect(res.status).toBe(201);
    const rows = await t.db.select().from(table);
    expect(rows.map((r) => r.userId)).toEqual([plan?.createdById as string]);
    expect(rows[0]?.link).toMatchObject({ screen: 21, planId: planA, ideaId: piaya });
  });

  test("a comment on a self analysis tells its owner, and only readers can be mentioned", async () => {
    const target = { type: "self_analysis_answer", id: await analysisOf("ana"), key: "SA.WHY.1" };
    const res = await comment("paolo", target, "Same here");
    expect(res.status).toBe(201);
    const rows = await t.db.select().from(table);
    expect(rows.map((r) => [r.userId, r.kind])).toEqual([[userId("ana"), "comment"]]);
    expect(rows[0]?.link).toMatchObject({ screen: 11, sectionKey: "WHY", questionKey: "SA.WHY.1" });

    await clearNotifications();
    await comment("kenji", target, "Paolo, you too?", { mentions: ["paolo"] });
    const [forPaolo] = await t.db
      .select()
      .from(table)
      .where(eq(table.userId, userId("paolo")));
    expect(forPaolo?.kind).toBe("mention");
    expect(forPaolo?.link).toMatchObject({ screen: 12, userId: userId("ana") });

    const viewer = await comment("paolo", target, "Hi Grace", { mentions: ["grace"] });
    expect(viewer.status).toBe(422);
    expect(viewer.body.error.code).toBe("INVALID_MENTION");
    expect(await rowsOf("grace")).toEqual([]);
  });

  test("a suspended or departed person is not notified", async () => {
    await t.db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, userId("ana")));
    await comment("paolo", await whoTarget(), "Anyone?");
    expect(await t.db.select().from(table)).toEqual([]);

    await t.db
      .update(schema.users)
      .set({ status: "active" })
      .where(eq(schema.users.id, userId("ana")));
    await t.db.delete(schema.memberships).where(eq(schema.memberships.userId, userId("ana")));
    await comment("paolo", await whoTarget(), "Anyone now?");
    expect(await t.db.select().from(table)).toEqual([]);
  });

  test("a mention of someone who cannot read it is refused and writes nothing", async () => {
    const res = await comment("paolo", await whoTarget(), "Hi admin", { mentions: ["admin"] });
    expect(res.status).toBe(422);
    expect(await t.db.select().from(table)).toEqual([]);
    expect(
      await t.db
        .select({ id: schema.comments.id })
        .from(schema.comments)
        .where(eq(schema.comments.body, "Hi admin")),
    ).toEqual([]);
  });

  test("editing a comment notifies only the people mentioned for the first time", async () => {
    const written = await comment("paolo", await whoTarget(), "v1", { mentions: ["kenji"] });
    await clearNotifications();
    const patch = (mentions: PersonKey[], body: string) =>
      call(t.app, "PATCH", `/api/v1/comments/${written.body.id}`, {
        as: as.paolo,
        body: { body, mentionUserIds: mentions.map(userId) },
      });
    expect((await patch(["kenji"], "typo fixed")).status).toBe(200);
    expect(await t.db.select().from(table)).toEqual([]);
    expect((await patch(["kenji", "grace"], "now with Grace")).status).toBe(200);
    expect(await recipients("mention")).toEqual(ids("grace"));
  });
});

describe("creation: decision, Go / No-Go and saved version", () => {
  beforeEach(clearNotifications);

  test("a validation decision notifies every other active member and links to screen 13", async () => {
    const res = await call(t.app, "POST", `/api/v1/ideas/${piaya}/decisions`, {
      as: as.ana,
      body: {
        value: "hold",
        reason: "Waiting for the quote.",
        basedOnDecisionId: null,
        confirmNewer: true,
      },
    });
    expect(res.status).toBe(201);
    expect(await recipients("decision")).toEqual(ids("grace", "kenji", "paolo"));
    const rows = await t.db.select().from(table);
    for (const row of rows) {
      expect(row).toMatchObject({
        workspaceId: BCDX,
        actorId: userId("ana"),
        decisionLogEntryId: res.body.entry.id,
        readAt: null,
      });
      expect(row.link).toEqual({ screen: 13, workspaceId: BCDX, ideaId: piaya });
    }
    const listed = await call(t.app, "GET", api, { as: as.grace });
    const [idea] = await t.db
      .select({ name: schema.ideas.name })
      .from(schema.ideas)
      .where(eq(schema.ideas.id, piaya));
    expect(listed.body.items[0].title).toBe(`Ana Villanueva recorded a decision on ${idea?.name}`);
    expect(listed.body.items[0].excerpt).toBe("Waiting for the quote.");
  });

  test("suspended users get no decision notification and the recorder never does", async () => {
    await t.db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, userId("paolo")));
    await call(t.app, "POST", `/api/v1/ideas/${piaya}/decisions`, {
      as: as.kenji,
      body: { value: "hold", reason: "r", basedOnDecisionId: null, confirmNewer: true },
    });
    expect(await recipients("decision")).toEqual(ids("ana", "grace"));
  });

  test("a Go / No-Go links to the plan screen 20", async () => {
    const res = await call(t.app, "POST", `/api/v1/plans/${planA}/go-no-go`, {
      as: as.kenji,
      body: { value: "launch", reason: "Numbers hold up." },
    });
    expect(res.status).toBe(201);
    expect(await recipients("decision")).toEqual(ids("ana", "grace", "paolo"));
    const [row] = await t.db
      .select()
      .from(table)
      .where(eq(table.userId, userId("ana")));
    expect(row?.link).toEqual({ screen: 20, workspaceId: BCDX, ideaId: piaya, planId: planA });
    const listed = await call(t.app, "GET", api, { as: as.ana });
    expect(listed.body.items[0].title).toMatch(/^Kenji Mori recorded Go \/ No-Go on .+/);
  });

  test("saving a version notifies the others and names the version", async () => {
    const res = await call(t.app, "POST", `/api/v1/plans/${planB}/versions`, {
      as: as.ana,
      body: { name: "v1 For Kenji" },
    });
    expect(res.status).toBe(201);
    expect(await recipients("decision")).toEqual(ids("grace", "kenji", "paolo"));
    const listed = await call(t.app, "GET", api, { as: as.kenji });
    expect(listed.body.items[0].title).toMatch(/^Ana Villanueva saved v1 For Kenji of .+/);
    expect(listed.body.items[0].excerpt).toBeNull();
    expect(listed.body.items[0].link).toMatchObject({ screen: 20, planId: planB });
  });

  test("a refused request leaves no notification behind", async () => {
    const viewer = await call(t.app, "POST", `/api/v1/ideas/${piaya}/decisions`, {
      as: as.grace,
      body: { value: "hold", reason: "r", basedOnDecisionId: null, confirmNewer: true },
    });
    expect(viewer.status).toBe(403);
    const empty = await call(t.app, "POST", `/api/v1/plans/${planA}/go-no-go`, {
      as: as.kenji,
      body: { value: "launch", reason: "  " },
    });
    expect(empty.status).toBe(422);
    expect(await t.db.select().from(table)).toEqual([]);
  });

  test("notifications of other workspaces are untouched by a decision here", async () => {
    await call(t.app, "POST", `/api/v1/ideas/${piaya}/decisions`, {
      as: as.ana,
      body: { value: "hold", reason: "r", basedOnDecisionId: null, confirmNewer: true },
    });
    const outside = await t.db
      .select({ id: table.id })
      .from(table)
      .where(and(inArray(table.userId, [userId("admin")]), eq(table.workspaceId, BCDX)));
    expect(outside).toEqual([]);
  });
});
