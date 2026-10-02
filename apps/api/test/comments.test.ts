import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, ideaId, planId, seedDemo, userId } from "@moonx/db/seed";
import { PITCH_SLIDE_KEYS } from "@moonx/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let as: Record<"admin" | "ana" | "kenji" | "paolo" | "grace", Record<string, string>>;

/** Ids the demo data fixes by name, read once after the first seed. */
const ids = {
  validation: "",
  planQuestionKey: "",
  analysis: { ana: "", kenji: "" },
  saKey: "",
  executionItem: "",
  competitor: "",
};

beforeAll(async () => {
  t = await startTestApp();
  as = {
    admin: await login(t.app, "admin"),
    ana: await login(t.app, "ana"),
    kenji: await login(t.app, "kenji"),
    paolo: await login(t.app, "paolo"),
    grace: await login(t.app, "grace"),
  };
  const first = async <T>(rows: Promise<T[]>) => (await rows)[0] as T;
  const piaya = ideaId("piaya");
  const validation = await first(
    t.db
      .select({ id: schema.validations.id, version: schema.validations.templateVersionId })
      .from(schema.validations)
      .where(eq(schema.validations.ideaId, piaya)),
  );
  ids.validation = validation.id;
  ids.competitor = (
    await first(
      t.db
        .select({ id: schema.competitors.id })
        .from(schema.competitors)
        .where(eq(schema.competitors.validationId, validation.id)),
    )
  ).id;
  const plan = await first(
    t.db
      .select({ version: schema.businessPlans.templateVersionId })
      .from(schema.businessPlans)
      .where(eq(schema.businessPlans.id, planId("piaya-a"))),
  );
  ids.planQuestionKey = (
    await first(
      t.db
        .select({ key: schema.templateQuestions.questionKey })
        .from(schema.templateQuestions)
        .where(eq(schema.templateQuestions.templateVersionId, plan.version))
        .orderBy(asc(schema.templateQuestions.questionKey)),
    )
  ).key;
  for (const who of ["ana", "kenji"] as const) {
    ids.analysis[who] = (
      await first(
        t.db
          .select({ id: schema.selfAnalyses.id })
          .from(schema.selfAnalyses)
          .where(eq(schema.selfAnalyses.userId, userId(who))),
      )
    ).id;
  }
  const analysis = await first(
    t.db
      .select({ version: schema.selfAnalyses.templateVersionId })
      .from(schema.selfAnalyses)
      .where(eq(schema.selfAnalyses.id, ids.analysis.ana)),
  );
  ids.saKey = (
    await first(
      t.db
        .select({ key: schema.templateQuestions.questionKey })
        .from(schema.templateQuestions)
        .where(eq(schema.templateQuestions.templateVersionId, analysis.version))
        .orderBy(asc(schema.templateQuestions.questionKey)),
    )
  ).key;
  ids.executionItem = (
    await first(
      t.db
        .select({ id: schema.executionItems.id })
        .from(schema.executionItems)
        .where(eq(schema.executionItems.businessPlanId, planId("piaya-a"))),
    )
  ).id;
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await seedDemo(t.db);
});

const api = "/api/v1/comments";
const MISSING = "00000000-0000-4000-8000-000000000001";
const QUESTION = "V.01.BEHAVIOR";

// biome-ignore lint/suspicious/noExplicitAny: tests read parsed JSON of any shape
type Obj = any;
type Who = keyof typeof as;
type Target = { type: string; id: string; key?: string };

const validationAnswer = (key = QUESTION): Target => ({
  type: "validation_answer",
  id: ids.validation,
  key,
});
const ideaTarget = (): Target => ({ type: "idea", id: ideaId("piaya") });
const selfAnalysisTarget = (who: "ana" | "kenji" = "ana"): Target => ({
  type: "self_analysis_answer",
  id: ids.analysis[who],
  key: ids.saKey,
});

const listQuery = (target: Target, workspaceId?: string) => {
  const params = new URLSearchParams({ targetType: target.type, targetId: target.id });
  if (target.key) params.set("targetKey", target.key);
  if (workspaceId) params.set("workspaceId", workspaceId);
  return `${api}?${params}`;
};

const list = (who: Who, target: Target, workspaceId?: string) =>
  call(t.app, "GET", listQuery(target, workspaceId), { as: as[who] });

const post = (
  who: Who,
  target: Target,
  body: Record<string, unknown> = {},
  workspaceId: string = BCDX,
) =>
  call(t.app, "POST", api, {
    as: as[who],
    body: { workspaceId, target, body: "A comment", mentionUserIds: [], ...body },
  });

async function created(
  who: Who,
  target: Target,
  body: Record<string, unknown> = {},
  workspaceId: string = BCDX,
) {
  const res = await post(who, target, body, workspaceId);
  expect(res.status).toBe(201);
  return res.body;
}

const patch = (who: Who, id: string, body: unknown) =>
  call(t.app, "PATCH", `${api}/${id}`, { as: as[who], body });
const remove = (who: Who, id: string) => call(t.app, "DELETE", `${api}/${id}`, { as: as[who] });
const resolve = (who: Who, id: string) =>
  call(t.app, "POST", `${api}/${id}/resolve`, { as: as[who] });
const reopen = (who: Who, id: string) =>
  call(t.app, "DELETE", `${api}/${id}/resolve`, { as: as[who] });

const notificationsOf = (commentId: string) =>
  t.db.select().from(schema.notifications).where(eq(schema.notifications.commentId, commentId));

const expectError = (res: { status: number; body: Obj }, status: number, code: string) => {
  expect(res.status).toBe(status);
  expect(res.body.error.code).toBe(code);
  expect(typeof res.body.error.message).toBe("string");
  expect(typeof res.body.error.requestId).toBe("string");
};

/** A second workspace where Ana (Owner) and Kenji (Member) work and Ana's analysis is shared. */
async function secondWorkspace(): Promise<string> {
  const res = await call(t.app, "POST", "/api/v1/workspaces", {
    as: as.ana,
    body: { name: "Second" },
  });
  expect(res.status).toBe(201);
  const id = res.body.id as string;
  await t.db
    .insert(schema.memberships)
    .values({ workspaceId: id, userId: userId("kenji"), role: "member" });
  const shares = await call(t.app, "PUT", "/api/v1/me/self-analysis/shares", {
    as: as.ana,
    body: { workspaceIds: [BCDX, id] },
  });
  expect(shares.status).toBe(200);
  return id;
}

describe("C1 GET and POST", () => {
  test("a new thread is empty, then lists the comment with its author, workspace and target", async () => {
    const empty = await list("ana", validationAnswer());
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ threads: [] });

    const comment = await created("paolo", validationAnswer(), { body: "  Where exactly?  " });
    expect(comment).toMatchObject({
      workspace: { id: BCDX, name: "BCDX" },
      target: { type: "validation_answer", id: ids.validation, key: QUESTION },
      parentId: null,
      author: { id: userId("paolo"), displayName: "Paolo Gonzaga" },
      body: "Where exactly?",
      mentions: [],
      resolvedAt: null,
      resolvedBy: null,
      editedAt: null,
      deleted: false,
    });

    const res = await list("kenji", validationAnswer());
    expect(res.body.threads).toHaveLength(1);
    expect(res.body.threads[0].root.id).toBe(comment.id);
    expect(res.body.threads[0].replies).toEqual([]);
  });

  test("threads list oldest first with replies under their root, and only this target's", async () => {
    const first = await created("paolo", validationAnswer(), { body: "first" });
    const second = await created("ana", validationAnswer(), { body: "second" });
    const replyB = await created("kenji", validationAnswer(), { parentId: first.id, body: "b" });
    const replyA = await created("ana", validationAnswer(), { parentId: first.id, body: "a" });
    await created("ana", validationAnswer("V.01.FREQUENCY"), { body: "elsewhere" });
    await created("ana", ideaTarget(), { body: "idea" });

    const { threads } = (await list("grace", validationAnswer())).body;
    expect(threads.map((th: Obj) => th.root.id)).toEqual([first.id, second.id]);
    expect(threads[0].replies.map((r: Obj) => r.id)).toEqual([replyB.id, replyA.id]);
    expect(threads[1].replies).toEqual([]);

    const ideaThreads = (await list("grace", ideaTarget())).body.threads;
    expect(ideaThreads).toHaveLength(1);
    expect(ideaThreads[0].root.body).toBe("idea");
  });

  test("every kind of target takes a comment and lists it back", async () => {
    const variant = Object.keys(PITCH_SLIDE_KEYS)[0] as keyof typeof PITCH_SLIDE_KEYS;
    const targets: Target[] = [
      validationAnswer(),
      ideaTarget(),
      { type: "research_log_entry", id: await rowId(schema.researchLogEntries) },
      { type: "competitor", id: ids.competitor },
      { type: "assumption", id: await rowId(schema.assumptions) },
      { type: "risk", id: await rowId(schema.risks) },
      { type: "cost_item", id: await rowId(schema.costItems) },
      { type: "economics_input", id: ids.validation, key: "selling_price" },
      { type: "plan_answer", id: planId("piaya-a"), key: ids.planQuestionKey },
      { type: "execution_item", id: ids.executionItem },
      {
        type: "pitch_slide",
        id: planId("piaya-a"),
        key: `${variant}.${PITCH_SLIDE_KEYS[variant][0]}`,
      },
    ];
    for (const target of targets) {
      const comment = await created("kenji", target, { body: `on ${target.type}` });
      expect(comment.target).toEqual({ type: target.type, id: target.id, key: target.key ?? null });
      const res = await list("ana", target);
      expect(res.body.threads.map((th: Obj) => th.root.id)).toEqual([comment.id]);
    }
  });

  test("a reply goes one level deep, and only under a root of the same target", async () => {
    const root = await created("paolo", validationAnswer());
    const reply = await created("ana", validationAnswer(), { parentId: root.id });
    expect(reply.parentId).toBe(root.id);

    expectError(
      await post("kenji", validationAnswer(), { parentId: reply.id }),
      422,
      "REPLY_DEPTH",
    );
    expectError(
      await post("kenji", validationAnswer("V.01.FREQUENCY"), { parentId: root.id }),
      422,
      "VALIDATION_FAILED",
    );
    expectError(
      await post("kenji", validationAnswer(), { parentId: MISSING }),
      422,
      "VALIDATION_FAILED",
    );
  });

  test("an unpublished question key, a missing key and a key on a keyless target are 422", async () => {
    const unknown = await post("ana", validationAnswer("V.01.NOPE"));
    expectError(unknown, 422, "QUESTION_NOT_FOUND");
    const noKey = await post("ana", { type: "validation_answer", id: ids.validation });
    expectError(noKey, 422, "VALIDATION_FAILED");
    expect(noKey.body.error.details[0].path).toBe("key");
    const extraKey = await post("ana", { type: "idea", id: ideaId("piaya"), key: "x" });
    expectError(extraKey, 422, "VALIDATION_FAILED");
    expectError(
      await post("ana", { type: "economics_input", id: ids.validation, key: "nope" }),
      422,
      "QUESTION_NOT_FOUND",
    );
    expectError(
      await post("ana", { type: "pitch_slide", id: planId("piaya-a"), key: "nope.nope" }),
      422,
      "QUESTION_NOT_FOUND",
    );
  });

  test("the workspace must be the target's: another one is a 422 on workspaceId", async () => {
    const other = await secondWorkspace();
    const res = await post("kenji", validationAnswer(), {}, other);
    expectError(res, 422, "VALIDATION_FAILED");
    expect(res.body.error.details[0].path).toBe("workspaceId");
    const read = await list("kenji", validationAnswer(), other);
    expectError(read, 422, "VALIDATION_FAILED");
  });
});

describe("mentions and notifications", () => {
  test("mentions are stored in the answer and become mention notifications", async () => {
    const comment = await created("paolo", validationAnswer(), {
      body: "@Kenji Mori and @Grace Tan",
      mentionUserIds: [userId("kenji"), userId("grace"), userId("kenji")],
    });
    expect(comment.mentions.map((m: Obj) => m.id).sort()).toEqual(
      [userId("kenji"), userId("grace")].sort(),
    );
    const rows = await notificationsOf(comment.id);
    const byUser = Object.fromEntries(rows.map((n) => [n.userId, n]));
    expect(byUser[userId("kenji")]?.kind).toBe("mention");
    expect(byUser[userId("grace")]?.kind).toBe("mention");
    // The idea's proposer (Ana) hears of the comment without being mentioned.
    expect(byUser[userId("ana")]?.kind).toBe("comment");
    expect(byUser[userId("paolo")]).toBeUndefined();
    expect(rows).toHaveLength(3);
    for (const n of rows) {
      expect(n).toMatchObject({ workspaceId: BCDX, actorId: userId("paolo"), readAt: null });
      expect(n.link).toMatchObject({
        workspaceId: BCDX,
        panel: "comments",
        target: { type: "validation_answer", id: ids.validation, key: QUESTION },
      });
    }
  });

  test("only members of the workspace can be mentioned", async () => {
    for (const mentionUserIds of [[userId("admin")], [userId("kenji"), MISSING]]) {
      const res = await post("paolo", validationAnswer(), { mentionUserIds });
      expectError(res, 422, "INVALID_MENTION");
    }
    const count = await t.db
      .select({ id: schema.comments.id })
      .from(schema.comments)
      .where(eq(schema.comments.authorId, userId("paolo")));
    const seeded = count.length;
    await post("paolo", validationAnswer(), { mentionUserIds: [userId("admin")] });
    const after = await t.db
      .select({ id: schema.comments.id })
      .from(schema.comments)
      .where(eq(schema.comments.authorId, userId("paolo")));
    expect(after).toHaveLength(seeded);
  });

  test("a person who is both mentioned and the owner of the item gets the mention only", async () => {
    const comment = await created("paolo", validationAnswer(), {
      mentionUserIds: [userId("ana")],
    });
    const rows = await notificationsOf(comment.id);
    expect(rows.map((n) => [n.userId, n.kind])).toEqual([[userId("ana"), "mention"]]);
  });

  test("the proposer of the idea is not notified of their own comment", async () => {
    const comment = await created("ana", validationAnswer());
    expect(await notificationsOf(comment.id)).toEqual([]);
  });

  test("a comment on the plan's items tells the plan's creator, not the idea's proposer", async () => {
    const [plan] = await t.db
      .select({ createdById: schema.businessPlans.createdById })
      .from(schema.businessPlans)
      .where(eq(schema.businessPlans.id, planId("piaya-a")));
    const author = (["ana", "kenji", "paolo"] as const).find(
      (p) => userId(p) !== plan?.createdById,
    ) as "ana" | "kenji" | "paolo";
    const comment = await created(author, {
      type: "plan_answer",
      id: planId("piaya-a"),
      key: ids.planQuestionKey,
    });
    const rows = await notificationsOf(comment.id);
    expect(rows.map((n) => [n.userId, n.kind])).toEqual([[plan?.createdById as string, "comment"]]);
    expect(rows[0]?.link).toMatchObject({ screen: 21, planId: planId("piaya-a") });
  });

  test("a reply tells the people already in the thread", async () => {
    const root = await created("paolo", validationAnswer());
    const reply = await created("kenji", validationAnswer(), { parentId: root.id });
    const rows = await notificationsOf(reply.id);
    expect(rows.map((n) => n.userId).sort()).toEqual([userId("ana"), userId("paolo")].sort());
    expect(rows.every((n) => n.kind === "comment")).toBe(true);
  });

  test("an edit notifies only the people newly mentioned and drops removed mentions", async () => {
    const comment = await created("paolo", validationAnswer(), {
      mentionUserIds: [userId("kenji")],
    });
    const edited = await patch("paolo", comment.id, {
      body: "changed",
      mentionUserIds: [userId("kenji"), userId("grace")],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.mentions.map((m: Obj) => m.id).sort()).toEqual(
      [userId("kenji"), userId("grace")].sort(),
    );
    const rows = await notificationsOf(comment.id);
    const mentions = rows.filter((n) => n.kind === "mention").map((n) => n.userId);
    expect(mentions.sort()).toEqual([userId("kenji"), userId("grace")].sort());
    expect(rows.filter((n) => n.userId === userId("kenji"))).toHaveLength(1);

    const dropped = await patch("paolo", comment.id, {
      body: "changed",
      mentionUserIds: [userId("grace")],
    });
    expect(dropped.body.mentions.map((m: Obj) => m.id)).toEqual([userId("grace")]);
    expectError(
      await patch("paolo", comment.id, { body: "x", mentionUserIds: [userId("admin")] }),
      422,
      "INVALID_MENTION",
    );
  });
});

describe("C2 PATCH and DELETE", () => {
  test("the author edits: the text changes and editedAt is set", async () => {
    const comment = await created("paolo", validationAnswer());
    const res = await patch("paolo", comment.id, { body: " Better wording " });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: comment.id, body: "Better wording" });
    expect(res.body.editedAt).not.toBeNull();
    const thread = (await list("ana", validationAnswer())).body.threads[0];
    expect(thread.root.body).toBe("Better wording");
  });

  test("saving the same text again is not an edit", async () => {
    const comment = await created("paolo", validationAnswer(), { body: "same" });
    const res = await patch("paolo", comment.id, { body: "same", mentionUserIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.editedAt).toBeNull();
  });

  test("the author deletes: 204, the comment stays in its thread without its content", async () => {
    const root = await created("paolo", validationAnswer(), {
      body: "secret",
      mentionUserIds: [userId("kenji")],
    });
    const reply = await created("ana", validationAnswer(), { parentId: root.id });
    const res = await remove("paolo", root.id);
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();

    const [thread] = (await list("kenji", validationAnswer())).body.threads;
    expect(thread.root).toMatchObject({ id: root.id, deleted: true, body: "", mentions: [] });
    expect(thread.replies.map((r: Obj) => r.id)).toEqual([reply.id]);
    expect(JSON.stringify(thread)).not.toContain("secret");
    const [row] = await t.db.select().from(schema.comments).where(eq(schema.comments.id, root.id));
    expect(row?.deletedAt).not.toBeNull();
  });

  test("a deleted comment cannot be edited", async () => {
    const comment = await created("paolo", validationAnswer());
    await remove("paolo", comment.id);
    expectError(await patch("paolo", comment.id, { body: "back" }), 404, "NOT_FOUND");
  });

  test("only the author edits or deletes, whatever the role", async () => {
    const comment = await created("paolo", validationAnswer());
    for (const who of ["ana", "kenji", "grace"] as const) {
      expectError(await patch(who, comment.id, { body: "mine" }), 403, "FORBIDDEN");
      expectError(await remove(who, comment.id), 403, "FORBIDDEN");
    }
    const [row] = await t.db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, comment.id));
    expect(row).toMatchObject({ body: "A comment", deletedAt: null });
  });

  test("a Viewer edits and deletes their own comments", async () => {
    const comment = await created("grace", validationAnswer());
    expect((await patch("grace", comment.id, { body: "Edited" })).status).toBe(200);
    expect((await remove("grace", comment.id)).status).toBe(204);
  });

  test("a missing comment is 404 and a malformed id is 422", async () => {
    expectError(await patch("ana", MISSING, { body: "x" }), 404, "NOT_FOUND");
    expectError(await remove("ana", MISSING), 404, "NOT_FOUND");
    expectError(await patch("ana", "nope", { body: "x" }), 422, "VALIDATION_FAILED");
    expectError(await remove("ana", "nope"), 422, "VALIDATION_FAILED");
  });
});

describe("C3 resolve", () => {
  test("anyone who can comment resolves a thread and reopens it", async () => {
    const root = await created("paolo", validationAnswer());
    for (const who of ["ana", "kenji", "grace"] as const) {
      const done = await resolve(who, root.id);
      expect(done.status).toBe(200);
      expect(done.body.resolvedAt).not.toBeNull();
      expect(done.body.resolvedBy.id).toBe(userId(who));
      const open = await reopen(who, root.id);
      expect(open.status).toBe(200);
      expect(open.body).toMatchObject({ resolvedAt: null, resolvedBy: null });
    }
  });

  test("resolving twice keeps the first resolver, and the list shows it", async () => {
    const root = await created("paolo", validationAnswer());
    await resolve("kenji", root.id);
    const again = await resolve("ana", root.id);
    expect(again.body.resolvedBy.id).toBe(userId("kenji"));
    const [thread] = (await list("ana", validationAnswer())).body.threads;
    expect(thread.root.resolvedBy.id).toBe(userId("kenji"));
  });

  test("only the first comment of a thread resolves", async () => {
    const root = await created("paolo", validationAnswer());
    const reply = await created("ana", validationAnswer(), { parentId: root.id });
    expectError(await resolve("ana", reply.id), 422, "VALIDATION_FAILED");
    expectError(await reopen("ana", reply.id), 422, "VALIDATION_FAILED");
  });

  test("a missing comment is 404 and a malformed id is 422", async () => {
    expectError(await resolve("ana", MISSING), 404, "NOT_FOUND");
    expectError(await reopen("ana", MISSING), 404, "NOT_FOUND");
    expectError(await resolve("ana", "nope"), 422, "VALIDATION_FAILED");
  });
});

describe("permission matrix (SDD 7.1)", () => {
  const roles: [Who, number][] = [
    ["ana", 200],
    ["kenji", 200],
    ["grace", 200],
  ];

  test("C1 GET: every member reads, a stranger is NO_ACCESS, a visitor is 401", async () => {
    for (const [who, status] of roles) {
      expect((await list(who, validationAnswer())).status).toBe(status);
    }
    expectError(await list("admin", validationAnswer()), 403, "NO_ACCESS");
    const visitor = await call(t.app, "GET", listQuery(validationAnswer()));
    expectError(visitor, 401, "UNAUTHENTICATED");
  });

  test("C1 POST: Owner, Member and Viewer write, a stranger is NO_ACCESS, a visitor is 401", async () => {
    for (const [who] of roles) {
      expect((await post(who, validationAnswer())).status).toBe(201);
    }
    expectError(await post("admin", validationAnswer()), 403, "NO_ACCESS");
    const visitor = await call(t.app, "POST", api, {
      body: { workspaceId: BCDX, target: validationAnswer(), body: "x", mentionUserIds: [] },
    });
    expectError(visitor, 401, "UNAUTHENTICATED");
  });

  test("C2 and C3 answer a stranger NO_ACCESS and a visitor 401", async () => {
    const comment = await created("paolo", validationAnswer());
    expectError(await patch("admin", comment.id, { body: "x" }), 403, "NO_ACCESS");
    expectError(await remove("admin", comment.id), 403, "NO_ACCESS");
    expectError(await resolve("admin", comment.id), 403, "NO_ACCESS");
    expectError(await reopen("admin", comment.id), 403, "NO_ACCESS");
    for (const [method, path] of [
      ["PATCH", `${api}/${comment.id}`],
      ["DELETE", `${api}/${comment.id}`],
      ["POST", `${api}/${comment.id}/resolve`],
      ["DELETE", `${api}/${comment.id}/resolve`],
    ]) {
      const body = method === "PATCH" ? { body: "x" } : undefined;
      expectError(
        await call(t.app, method as string, path as string, { body }),
        401,
        "UNAUTHENTICATED",
      );
    }
  });

  test("a target that does not exist is 404 on read and write", async () => {
    for (const target of [
      { type: "idea", id: MISSING },
      { type: "validation_answer", id: MISSING, key: QUESTION },
      { type: "competitor", id: MISSING },
      { type: "execution_item", id: MISSING },
    ]) {
      expectError(await list("ana", target), 404, "NOT_FOUND");
      expectError(await post("ana", target), 404, "NOT_FOUND");
    }
  });

  test("a stranger cannot read a comment through the target of another workspace", async () => {
    const mine = await call(t.app, "POST", "/api/v1/workspaces", {
      as: as.kenji,
      body: { name: "Kenji only" },
    });
    expect(mine.status).toBe(201);
    const ideaRes = await call(t.app, "POST", `/api/v1/workspaces/${mine.body.id}/ideas`, {
      as: as.kenji,
      body: { name: "Private idea", oneLineConcept: "x", proposedSolution: "y" },
    });
    expect(ideaRes.status).toBe(201);
    const target = { type: "idea", id: ideaRes.body.id };
    const secret = await created("kenji", target, { body: "private" }, mine.body.id);
    expectError(await list("ana", target), 403, "NO_ACCESS");
    expectError(await post("ana", target, {}, mine.body.id), 403, "NO_ACCESS");
    expectError(await patch("ana", secret.id, { body: "x" }), 403, "NO_ACCESS");
    expectError(await resolve("ana", secret.id), 403, "NO_ACCESS");
    // The BCDX idea's comments never show up under the other workspace's target.
    await created("ana", ideaTarget(), { body: "BCDX" });
    expect((await list("kenji", target)).body.threads.map((th: Obj) => th.root.body)).toEqual([
      "private",
    ]);
  });
});

describe("archived ideas and plans", () => {
  test("reading works, every write is 409 ARCHIVED, a Viewer included", async () => {
    const comment = await created("grace", validationAnswer());
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: new Date() })
      .where(eq(schema.ideas.id, ideaId("piaya")));
    expect((await list("grace", validationAnswer())).body.threads).toHaveLength(1);
    expectError(await post("grace", validationAnswer()), 409, "ARCHIVED");
    expectError(await patch("grace", comment.id, { body: "x" }), 409, "ARCHIVED");
    expectError(await remove("grace", comment.id), 409, "ARCHIVED");
    expectError(await resolve("ana", comment.id), 409, "ARCHIVED");
    expectError(await reopen("ana", comment.id), 409, "ARCHIVED");
  });

  test("an archived plan locks the comments of its items only", async () => {
    await t.db
      .update(schema.businessPlans)
      .set({ archivedAt: new Date() })
      .where(eq(schema.businessPlans.id, planId("piaya-a")));
    expectError(
      await post("ana", { type: "execution_item", id: ids.executionItem }),
      409,
      "ARCHIVED",
    );
    expect((await post("ana", validationAnswer())).status).toBe(201);
  });
});

describe("hidden comments", () => {
  test("comments of a soft-deleted row are hidden until the row returns", async () => {
    const target = { type: "competitor", id: ids.competitor };
    const comment = await created("kenji", target);
    await t.db
      .update(schema.competitors)
      .set({ deletedAt: new Date() })
      .where(eq(schema.competitors.id, ids.competitor));

    expect((await list("kenji", target)).body).toEqual({ threads: [] });
    expectError(await post("kenji", target), 404, "NOT_FOUND");
    expectError(await patch("kenji", comment.id, { body: "x" }), 404, "NOT_FOUND");
    expectError(await remove("kenji", comment.id), 404, "NOT_FOUND");
    expectError(await resolve("ana", comment.id), 404, "NOT_FOUND");

    await t.db
      .update(schema.competitors)
      .set({ deletedAt: null })
      .where(eq(schema.competitors.id, ids.competitor));
    const back = await list("kenji", target);
    expect(back.body.threads.map((th: Obj) => th.root.id)).toEqual([comment.id]);
  });

  test("comments of a soft-deleted execution item are hidden", async () => {
    const target = { type: "execution_item", id: ids.executionItem };
    await created("kenji", target);
    await t.db
      .update(schema.executionItems)
      .set({ deletedAt: new Date() })
      .where(eq(schema.executionItems.id, ids.executionItem));
    expect((await list("kenji", target)).body).toEqual({ threads: [] });
    expectError(await post("kenji", target), 404, "NOT_FOUND");
  });

  test("a question the pinned template no longer has hides its comments", async () => {
    const comment = await created("kenji", validationAnswer());
    const [validation] = await t.db
      .select({ version: schema.validations.templateVersionId })
      .from(schema.validations)
      .where(eq(schema.validations.id, ids.validation));
    await t.db
      .delete(schema.templateQuestions)
      .where(
        and(
          eq(schema.templateQuestions.templateVersionId, validation?.version as string),
          eq(schema.templateQuestions.questionKey, QUESTION),
        ),
      );
    expect((await list("kenji", validationAnswer())).body).toEqual({ threads: [] });
    expectError(await post("kenji", validationAnswer()), 422, "QUESTION_NOT_FOUND");
    expectError(await patch("kenji", comment.id, { body: "x" }), 404, "NOT_FOUND");
    expectError(await remove("kenji", comment.id), 404, "NOT_FOUND");
    expectError(await resolve("ana", comment.id), 404, "NOT_FOUND");
    const [row] = await t.db
      .select({ id: schema.comments.id })
      .from(schema.comments)
      .where(eq(schema.comments.id, comment.id));
    expect(row).toBeDefined();
  });
});

describe("self-analysis comments", () => {
  test("a Member of the sharing workspace comments, the owner is notified and reads it", async () => {
    const comment = await created("paolo", selfAnalysisTarget("ana"));
    expect(comment.workspace.id).toBe(BCDX);

    const rows = await notificationsOf(comment.id);
    expect(rows.map((n) => [n.userId, n.kind])).toEqual([[userId("ana"), "comment"]]);
    // The owner opens it on screen 11, others on 12 (design-spec 6.15).
    expect(rows[0]?.link).toMatchObject({ screen: 11 });

    const asOwner = await list("ana", selfAnalysisTarget("ana"));
    expect(asOwner.body.threads.map((th: Obj) => th.root.id)).toEqual([comment.id]);
    const asMember = await list("kenji", selfAnalysisTarget("ana"), BCDX);
    expect(asMember.body.threads.map((th: Obj) => th.root.id)).toEqual([comment.id]);
  });

  test("others see the owner's page link on screen 12", async () => {
    const comment = await created("ana", selfAnalysisTarget("ana"));
    const reply = await created("paolo", selfAnalysisTarget("ana"), { parentId: comment.id });
    const rows = await notificationsOf(reply.id);
    expect(rows.map((n) => n.userId)).toEqual([userId("ana")]);
    const mention = await created("ana", selfAnalysisTarget("ana"), {
      mentionUserIds: [userId("kenji")],
    });
    const [n] = await notificationsOf(mention.id);
    expect(n?.link).toMatchObject({ screen: 12, userId: userId("ana") });
  });

  test("comments are kept apart per sharing workspace", async () => {
    const other = await secondWorkspace();
    const inBcdx = await created("paolo", selfAnalysisTarget(), { body: "bcdx" });
    const inOther = await created("kenji", selfAnalysisTarget(), { body: "other" }, other);
    expect(inOther.workspace).toEqual({ id: other, name: "Second" });

    const bodies = (who: Who, workspaceId?: string) =>
      list(who, selfAnalysisTarget(), workspaceId).then((r) =>
        r.body.threads.map((th: Obj) => th.root.body),
      );
    expect(await bodies("ana")).toEqual(["bcdx", "other"]);
    // SDD 5.11 C1: the owner gets every share, naming one does not narrow it.
    expect(await bodies("ana", BCDX)).toEqual(["bcdx", "other"]);
    expect(await bodies("kenji", BCDX)).toEqual(["bcdx"]);
    expect(await bodies("kenji", other)).toEqual(["other"]);
    expect(await bodies("paolo", BCDX)).toEqual(["bcdx"]);
    // Paolo is not in the other workspace.
    expectError(await list("paolo", selfAnalysisTarget(), other), 403, "NO_ACCESS");
    // A reply must stay in its thread's workspace.
    expectError(
      await post("kenji", selfAnalysisTarget(), { parentId: inBcdx.id }, other),
      422,
      "VALIDATION_FAILED",
    );
  });

  test("a stopped share hides its comments from everyone and sharing again brings them back", async () => {
    const comment = await created("paolo", selfAnalysisTarget());
    const stop = await call(t.app, "PUT", "/api/v1/me/self-analysis/shares", {
      as: as.ana,
      body: { workspaceIds: [] },
    });
    expect(stop.status).toBe(200);
    expect((await list("ana", selfAnalysisTarget())).body).toEqual({ threads: [] });
    expectError(await list("kenji", selfAnalysisTarget(), BCDX), 403, "NOT_SHARED");
    expectError(await post("paolo", selfAnalysisTarget()), 403, "NOT_SHARED");
    expectError(await patch("paolo", comment.id, { body: "x" }), 404, "NOT_FOUND");
    expectError(await resolve("ana", comment.id), 404, "NOT_FOUND");

    await call(t.app, "PUT", "/api/v1/me/self-analysis/shares", {
      as: as.ana,
      body: { workspaceIds: [BCDX] },
    });
    expect((await list("ana", selfAnalysisTarget())).body.threads).toHaveLength(1);
  });

  test("an analysis that was never shared takes no comments", async () => {
    expectError(await post("paolo", selfAnalysisTarget("kenji")), 403, "NOT_SHARED");
    expectError(await list("paolo", selfAnalysisTarget("kenji"), BCDX), 403, "NOT_SHARED");
    expect((await list("kenji", selfAnalysisTarget("kenji"))).body).toEqual({ threads: [] });
  });

  test("a Viewer cannot read or write them, a reader must name the workspace", async () => {
    await created("paolo", selfAnalysisTarget());
    expectError(await list("grace", selfAnalysisTarget(), BCDX), 403, "FORBIDDEN");
    expectError(await post("grace", selfAnalysisTarget()), 403, "FORBIDDEN");
    const unnamed = await list("kenji", selfAnalysisTarget());
    expectError(unnamed, 422, "VALIDATION_FAILED");
    expect(unnamed.body.error.details[0].path).toBe("workspaceId");
    expectError(await list("admin", selfAnalysisTarget(), BCDX), 403, "NO_ACCESS");
  });

  test("only Owners and Members who can read it can be mentioned", async () => {
    expectError(
      await post("paolo", selfAnalysisTarget(), { mentionUserIds: [userId("grace")] }),
      422,
      "INVALID_MENTION",
    );
    const ok = await created("paolo", selfAnalysisTarget(), {
      mentionUserIds: [userId("kenji")],
    });
    expect(ok.mentions.map((m: Obj) => m.id)).toEqual([userId("kenji")]);
    const rows = await notificationsOf(ok.id);
    expect(rows.map((n) => [n.userId, n.kind]).sort()).toEqual(
      [
        [userId("ana"), "comment"],
        [userId("kenji"), "mention"],
      ].sort(),
    );
  });

  test("the owner writes on their own analysis too, and the author edits it", async () => {
    const comment = await created("ana", selfAnalysisTarget());
    expect((await patch("ana", comment.id, { body: "Updated" })).status).toBe(200);
    expectError(await patch("paolo", comment.id, { body: "x" }), 403, "FORBIDDEN");
    const resolved = await resolve("paolo", comment.id);
    expect(resolved.status).toBe(200);
  });
});

describe("validation errors (SDD 8.1)", () => {
  test("the answer carries code, message, requestId and details with a path per field", async () => {
    const res = await call(t.app, "POST", api, {
      as: as.ana,
      body: { workspaceId: "nope", target: { type: "idea", id: "x" }, body: "   " },
    });
    expectError(res, 422, "VALIDATION_FAILED");
    const paths = res.body.error.details.map((d: Obj) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["workspaceId", "target.id", "body"]));
    for (const d of res.body.error.details) {
      expect(typeof d.code).toBe("string");
      expect(typeof d.message).toBe("string");
    }
    expect(JSON.stringify(res.body)).not.toContain("nope");
  });

  test("POST rejects an empty or long text, bad mentions, a bad target type and a bad parent", async () => {
    const bad: Record<string, unknown>[] = [
      { body: "" },
      { body: "x".repeat(5001) },
      { mentionUserIds: ["nope"] },
      { mentionUserIds: Array.from({ length: 51 }, () => MISSING) },
      { parentId: "nope" },
      { workspaceId: "nope" },
      { target: { type: "unknown", id: MISSING } },
      { target: { type: "validation_answer", id: MISSING, key: "" } },
    ];
    for (const patchBody of bad) {
      const res = await post("ana", validationAnswer(), patchBody);
      expectError(res, 422, "VALIDATION_FAILED");
      expect(Array.isArray(res.body.error.details)).toBe(true);
    }
  });

  test("a text of exactly 5000 characters is accepted", async () => {
    const res = await post("ana", validationAnswer(), { body: "x".repeat(5000) });
    expect(res.status).toBe(201);
  });

  test("PATCH rejects an empty or long text and bad mentions", async () => {
    const comment = await created("ana", validationAnswer());
    for (const body of [
      { body: " " },
      { body: "x".repeat(5001) },
      { body: "ok", mentionUserIds: ["nope"] },
      {},
    ]) {
      expectError(await patch("ana", comment.id, body), 422, "VALIDATION_FAILED");
    }
  });

  test("GET rejects a missing or unknown target type and a malformed id", async () => {
    for (const query of [
      "",
      "?targetType=idea",
      `?targetType=unknown&targetId=${MISSING}`,
      "?targetType=idea&targetId=nope",
      `?targetType=idea&targetId=${MISSING}&workspaceId=nope`,
      `?targetType=idea&targetId=${ideaId("piaya")}&targetKey=extra`,
      `?targetType=validation_answer&targetId=${ids.validation}`,
    ]) {
      const res = await call(t.app, "GET", `${api}${query}`, { as: as.ana });
      expectError(res, 422, "VALIDATION_FAILED");
    }
  });

  test("a body that is not JSON is 400", async () => {
    const res = await t.app.handle(
      new Request(`http://localhost${api}`, {
        method: "POST",
        headers: { ...as.ana, "content-type": "application/json" },
        body: "{",
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as Obj).error.code).toBe("BAD_REQUEST");
  });
});

/** The id of any one row of a validation table of the Piaya idea. */
async function rowId(
  table:
    | typeof schema.researchLogEntries
    | typeof schema.assumptions
    | typeof schema.risks
    | typeof schema.costItems,
): Promise<string> {
  const [row] = await t.db
    .select({ id: table.id })
    .from(table)
    .where(inArray(table.validationId, [ids.validation]));
  return (row as { id: string }).id;
}
