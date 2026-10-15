import { afterAll, describe, expect, test } from "bun:test";
import {
  comments,
  competitors,
  ideas,
  memberships,
  notifications,
  selfAnalysisShares,
  workspaces,
} from "@moonx/db";
import {
  type Comment,
  commentListSchema,
  commentSchema,
  type ErrorCode,
  errorBodySchema,
} from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { buildTestApp, connectTestDatabase, uniqueIp } from "./test-app";
import {
  apiRequest,
  signIn,
  teamWithNewIdea,
  teamWithProceedIdea,
  testFixtures,
} from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
let clock = Date.UTC(2026, 9, 1, 3, 0);
const { app } = buildTestApp(database, { now: () => clock });

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

type Team = Awaited<ReturnType<typeof teamWithNewIdea>>;

const answer = (team: Team, key = "V.01.WHO") => ({
  type: "validation_answer" as const,
  id: team.validationId,
  key,
});

async function post(
  cookie: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return app.handle(apiRequest("POST", "/api/v1/comments", { cookie, body }));
}

async function comment(
  team: Team,
  cookie: string,
  body: Partial<Record<string, unknown>> = {},
): Promise<Comment> {
  const response = await post(cookie, {
    workspaceId: team.workspace.id,
    target: answer(team),
    body: "Who exactly?",
    mentionUserIds: [],
    ...body,
  });
  expect(response.status).toBe(201);
  return commentSchema.parse(await response.json());
}

async function list(cookie: string, query: string) {
  const response = await app.handle(
    apiRequest("GET", `/api/v1/comments?${query}`, { cookie }),
  );
  expect(response.status).toBe(200);
  return commentListSchema.parse(await response.json());
}

const itemQuery = (team: Team, key = "V.01.WHO") =>
  `workspaceId=${team.workspace.id}&targetType=validation_answer&targetId=${team.validationId}&targetKey=${key}`;

const noticesOf = (commentId: string) =>
  db
    .select({ userId: notifications.userId, kind: notifications.kind })
    .from(notifications)
    .where(eq(notifications.commentId, commentId));

describe("C1 POST /api/v1/comments", () => {
  test("starts a thread on an item, filed under its screen, by anyone in the workspace", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const created = await comment(team, team.viewerCookie);
    expect(created).toMatchObject({
      workspace: { id: team.workspace.id, name: "Team" },
      target: answer(team),
      parentId: null,
      author: { id: team.viewer.id, badge: null },
      body: "Who exactly?",
      mentions: [],
      resolvedAt: null,
      resolvedBy: null,
      editedAt: null,
      deleted: false,
    });
    const [row] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, created.id));
    expect(row).toMatchObject({
      containerType: "validation",
      containerId: team.validationId,
      sectionKey: "01",
    });
    // The idea's proposer hears of it (design-spec 6.15).
    expect(await noticesOf(created.id)).toEqual([
      { userId: team.owner.id, kind: "comment" },
    ]);
  });

  test("files rows, numbers, slides and the idea under their screens", async () => {
    const team = await teamWithProceedIdea(app, fixtures);
    const plan = await fixtures.createPlan(team.idea.id, team.owner.id);
    const item = await fixtures.createExecutionItem(plan.id);
    const [row] = await db
      .insert(competitors)
      .values({
        validationId: team.validationId,
        name: "Bongbong's",
        sortOrder: 0,
      })
      .returning();
    const cases = [
      [{ type: "competitor", id: row?.id }, "validation", "competitors"],
      [
        {
          type: "economics_input",
          id: team.validationId,
          key: "selling_price",
        },
        "validation",
        "economics",
      ],
      [{ type: "idea", id: team.idea.id }, "idea", null],
      [
        { type: "plan_answer", id: plan.id, key: "P.05.1" },
        "business_plan",
        "05",
      ],
      [
        { type: "pitch_slide", id: plan.id, key: "five.market" },
        "business_plan",
        "pitch",
      ],
      [{ type: "execution_item", id: item.id }, "business_plan", "execution"],
    ] as const;
    for (const [target, containerType, sectionKey] of cases) {
      const created = await comment(team, team.memberCookie, { target });
      const [stored] = await db
        .select()
        .from(comments)
        .where(eq(comments.id, created.id));
      expect({
        type: target.type,
        containerType: stored?.containerType,
        sectionKey: stored?.sectionKey,
      }).toEqual({
        type: target.type,
        containerType,
        sectionKey,
      });
    }
  });

  test("checks the item's key", async () => {
    const team = await teamWithProceedIdea(app, fixtures);
    const plan = await fixtures.createPlan(team.idea.id, team.owner.id);
    const cases: [Record<string, unknown>, number, ErrorCode, string?][] = [
      [
        { ...answer(team), key: undefined },
        422,
        "VALIDATION_FAILED",
        "target.key",
      ],
      [
        { type: "idea", id: team.idea.id, key: "x" },
        422,
        "VALIDATION_FAILED",
        "target.key",
      ],
      [answer(team, "V.99.NOPE"), 404, "NOT_FOUND"],
      [
        { type: "economics_input", id: team.validationId, key: "rent" },
        404,
        "NOT_FOUND",
      ],
      // The one-minute deck has no market slide (design-spec 6.14).
      [
        { type: "pitch_slide", id: plan.id, key: "one.market" },
        404,
        "NOT_FOUND",
      ],
      [
        { type: "business_plan", id: plan.id },
        422,
        "VALIDATION_FAILED",
        "target.type",
      ],
      [{ type: "competitor", id: crypto.randomUUID() }, 404, "NOT_FOUND"],
    ];
    for (const [target, status, code, path] of cases) {
      const response = await post(team.ownerCookie, {
        workspaceId: team.workspace.id,
        target,
        body: "Hm",
        mentionUserIds: [],
      });
      const error = await errorOf(response);
      expect({
        target,
        status: response.status,
        code: error.code,
        path: error.details?.[0]?.path,
      }).toEqual({ target, status, code, path: path as string | undefined });
    }
  });

  test("answers 404 for an item of another workspace than the body names", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const other = await fixtures.createWorkspace();
    await fixtures.addMember(other.id, team.owner.id, "owner");
    const response = await post(team.ownerCookie, {
      workspaceId: other.id,
      target: answer(team),
      body: "Hm",
      mentionUserIds: [],
    });
    expect(response.status).toBe(404);
  });

  test("replies one level deep, to a comment on the same item", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const root = await comment(team, team.memberCookie);
    const reply = await comment(team, team.ownerCookie, {
      parentId: root.id,
      body: "Office managers",
    });
    expect(reply.parentId).toBe(root.id);
    const deeper = await post(team.ownerCookie, {
      workspaceId: team.workspace.id,
      target: answer(team),
      parentId: reply.id,
      body: "And?",
      mentionUserIds: [],
    });
    expect(deeper.status).toBe(422);
    expect((await errorOf(deeper)).code).toBe("REPLY_DEPTH");
    const elsewhere = await post(team.ownerCookie, {
      workspaceId: team.workspace.id,
      target: answer(team, "V.01.WHY_THEM"),
      parentId: root.id,
      body: "And?",
      mentionUserIds: [],
    });
    expect(elsewhere.status).toBe(422);
    expect((await errorOf(elsewhere)).details?.[0]?.path).toBe("parentId");
    // The root's writer hears of the reply; the reply's writer does not.
    expect(await noticesOf(reply.id)).toEqual([
      { userId: team.member.id, kind: "comment" },
    ]);
  });

  test("mentions the people W8 offers, once each, with a mention instead of a comment", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const created = await comment(team, team.memberCookie, {
      body: "@Owner @Viewer look",
      mentionUserIds: [
        team.owner.id,
        team.viewer.id,
        team.viewer.id.toUpperCase(),
      ],
    });
    expect(created.mentions.map((user) => user.id).sort()).toEqual(
      [team.owner.id, team.viewer.id].sort(),
    );
    expect(
      (await noticesOf(created.id)).sort((a, b) =>
        a.userId.localeCompare(b.userId),
      ),
    ).toEqual(
      [
        { userId: team.owner.id, kind: "mention" as const },
        { userId: team.viewer.id, kind: "mention" as const },
      ].sort((a, b) => a.userId.localeCompare(b.userId)),
    );
    const outsider = await fixtures.createUser();
    const response = await post(team.memberCookie, {
      workspaceId: team.workspace.id,
      target: answer(team),
      body: "@Outsider",
      mentionUserIds: [outsider.id],
    });
    expect(response.status).toBe(422);
    expect((await errorOf(response)).code).toBe("INVALID_MENTION");
  });

  test("refuses archived content whatever the role, and moves the last activity", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    clock += 60_000;
    await comment(team, team.viewerCookie);
    const [idea] = await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, team.idea.id));
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, team.workspace.id));
    expect(idea?.lastActivityAt.getTime()).toBe(clock);
    expect(workspace?.lastActiveAt?.getTime()).toBe(clock);
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    const response = await post(team.viewerCookie, {
      workspaceId: team.workspace.id,
      target: answer(team),
      body: "Late",
      mentionUserIds: [],
    });
    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("ARCHIVED");
  });
});

describe("C1 GET /api/v1/comments", () => {
  test("lists an item's threads oldest first with their replies, and counts the unresolved", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    clock += 1000;
    const first = await comment(team, team.memberCookie, { body: "First" });
    clock += 1000;
    const second = await comment(team, team.ownerCookie, { body: "Second" });
    clock += 1000;
    const reply = await comment(team, team.viewerCookie, {
      parentId: first.id,
      body: "Reply",
    });
    await comment(team, team.ownerCookie, {
      target: answer(team, "V.01.WHY_THEM"),
    });
    const read = await list(team.viewerCookie, itemQuery(team));
    expect(read.threads.map((thread) => thread.root.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(read.threads[0]?.replies.map((c) => c.id)).toEqual([reply.id]);
    expect(read.unresolvedCount).toBe(2);
  });

  test("lists a screen's threads in its sections, with the comments on the idea", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const who = await comment(team, team.ownerCookie);
    const ocean = await comment(team, team.ownerCookie, {
      target: answer(team, "V.02.OCEAN"),
    });
    const onIdea = await comment(team, team.ownerCookie, {
      target: { type: "idea", id: team.idea.id },
    });
    const screen = (sections?: string) =>
      `workspaceId=${team.workspace.id}&containerType=validation&containerId=${team.validationId}${sections === undefined ? "" : `&sectionKeys=${sections}`}`;
    const ids = (read: { threads: { root: { id: string } }[] }) =>
      read.threads.map((thread) => thread.root.id).sort();
    expect(ids(await list(team.ownerCookie, screen("01")))).toEqual(
      [who.id, onIdea.id].sort(),
    );
    expect(ids(await list(team.ownerCookie, screen("01,02")))).toEqual(
      [who.id, ocean.id, onIdea.id].sort(),
    );
    expect(ids(await list(team.ownerCookie, screen()))).toEqual(
      [who.id, ocean.id, onIdea.id].sort(),
    );
    expect(
      ids(
        await list(
          team.ownerCookie,
          `workspaceId=${team.workspace.id}&containerType=idea&containerId=${team.idea.id}`,
        ),
      ),
    ).toEqual([onIdea.id]);
  });

  test("hides the comments on deleted rows and on questions the pinned version lacks", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const [row] = await db
      .insert(competitors)
      .values({
        validationId: team.validationId,
        name: "Bongbong's",
        sortOrder: 0,
      })
      .returning();
    if (row === undefined) throw new Error("no competitor");
    const onRow = await comment(team, team.ownerCookie, {
      target: { type: "competitor", id: row.id },
    });
    // As a template migration leaves it: an answer's question gone from the version.
    await db.insert(comments).values({
      workspaceId: team.workspace.id,
      containerType: "validation",
      containerId: team.validationId,
      sectionKey: "01",
      targetType: "validation_answer",
      targetId: team.validationId,
      targetKey: "V.01.GONE",
      authorId: team.owner.id,
      body: "On a question that went",
    });
    const screen = `workspaceId=${team.workspace.id}&containerType=validation&containerId=${team.validationId}`;
    expect(
      (await list(team.ownerCookie, screen)).threads.map((t) => t.root.id),
    ).toEqual([onRow.id]);
    const gone = await app.handle(
      apiRequest("GET", `/api/v1/comments?${itemQuery(team, "V.01.GONE")}`, {
        cookie: team.ownerCookie,
      }),
    );
    expect(gone.status).toBe(404);

    await db
      .update(competitors)
      .set({ deletedAt: new Date() })
      .where(eq(competitors.id, row.id));
    expect((await list(team.ownerCookie, screen)).threads).toEqual([]);
    const response = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/comments?workspaceId=${team.workspace.id}&targetType=competitor&targetId=${row.id}`,
        { cookie: team.ownerCookie },
      ),
    );
    expect(response.status).toBe(404);
    const onDeleted = await post(team.ownerCookie, {
      workspaceId: team.workspace.id,
      target: { type: "competitor", id: row.id },
      body: "Hm",
      mentionUserIds: [],
    });
    expect(onDeleted.status).toBe(404);
    // Restoring the row brings its comments back (design-spec 6.0.4).
    await db
      .update(competitors)
      .set({ deletedAt: null })
      .where(eq(competitors.id, row.id));
    expect((await list(team.ownerCookie, screen)).threads).toHaveLength(1);
  });

  test("checks the query names one item or one screen", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    for (const [query, path] of [
      [`workspaceId=${team.workspace.id}`, "targetType"],
      [`${itemQuery(team)}&containerType=validation`, "targetType"],
      [
        `workspaceId=${team.workspace.id}&containerType=validation`,
        "containerId",
      ],
    ] as const) {
      const response = await app.handle(
        apiRequest("GET", `/api/v1/comments?${query}`, {
          cookie: team.ownerCookie,
        }),
      );
      expect(response.status).toBe(422);
      expect((await errorOf(response)).details?.[0]?.path).toBe(path);
    }
  });
});

describe("comments on a self-analysis (design-spec 6.0.4)", () => {
  async function shared() {
    const team = await teamWithNewIdea(app, fixtures);
    const second = await fixtures.createWorkspace({ name: "Second" });
    await fixtures.addMember(second.id, team.owner.id, "owner");
    await fixtures.addMember(second.id, team.member.id, "member");
    const analysis = await fixtures.createSelfAnalysis(team.owner.id, [
      team.workspace.id,
      second.id,
    ]);
    const target = {
      type: "self_analysis_answer" as const,
      id: analysis.id,
      key: "SA.WHY.1",
    };
    return { ...team, second, analysis, target };
  }
  type Shared = Awaited<ReturnType<typeof shared>>;
  const onAnswer = (team: Shared, workspaceId = team.workspace.id) =>
    `workspaceId=${workspaceId}&targetType=self_analysis_answer&targetId=${team.analysis.id}&targetKey=SA.WHY.1`;

  test("Owners and Members of a workspace it is shared with comment there; its owner reads every share", async () => {
    const team = await shared();
    const here = await comment(team, team.memberCookie, {
      target: team.target,
      body: "Strong",
    });
    const there = await comment(team, team.memberCookie, {
      workspaceId: team.second.id,
      target: team.target,
      body: "Also here",
    });
    expect(here.workspace.id).toBe(team.workspace.id);
    expect(await noticesOf(here.id)).toEqual([
      { userId: team.owner.id, kind: "comment" },
    ]);
    const memberView = await list(team.memberCookie, onAnswer(team));
    expect(memberView.threads.map((t) => t.root.id)).toEqual([here.id]);
    const ownerView = await list(team.ownerCookie, onAnswer(team));
    expect(ownerView.threads.map((t) => t.root.id).sort()).toEqual(
      [here.id, there.id].sort(),
    );
    // Ending a share hides its comments, even from the owner, until it is shared again.
    await db
      .delete(selfAnalysisShares)
      .where(eq(selfAnalysisShares.workspaceId, team.second.id));
    expect(
      (await list(team.ownerCookie, onAnswer(team))).threads.map(
        (t) => t.root.id,
      ),
    ).toEqual([here.id]);
    const unshared = await app.handle(
      apiRequest("GET", `/api/v1/comments?${onAnswer(team, team.second.id)}`, {
        cookie: team.memberCookie,
      }),
    );
    expect(unshared.status).toBe(403);
    expect((await errorOf(unshared)).code).toBe("NOT_SHARED");
  });

  test("lets a writer demoted to Viewer edit their comment, but not resolve threads", async () => {
    const team = await shared();
    const created = await comment(team, team.memberCookie, {
      target: team.target,
      body: "Strong",
    });
    await db
      .update(memberships)
      .set({ role: "viewer" })
      .where(
        and(
          eq(memberships.workspaceId, team.workspace.id),
          eq(memberships.userId, team.member.id),
        ),
      );
    const edited = await app.handle(
      apiRequest("PATCH", `/api/v1/comments/${created.id}`, {
        cookie: team.memberCookie,
        body: { body: "Stronger", mentionUserIds: [] },
      }),
    );
    expect(edited.status).toBe(200);
    const resolved = await app.handle(
      apiRequest("POST", `/api/v1/comments/${created.id}/resolve`, {
        cookie: team.memberCookie,
      }),
    );
    expect(resolved.status).toBe(403);
    expect((await errorOf(resolved)).code).toBe("FORBIDDEN");
    // Once the share ends, the comment is gone for everyone writing to it.
    await db
      .delete(selfAnalysisShares)
      .where(eq(selfAnalysisShares.selfAnalysisId, team.analysis.id));
    const hidden = await app.handle(
      apiRequest("POST", `/api/v1/comments/${created.id}/resolve`, {
        cookie: team.ownerCookie,
      }),
    );
    expect(hidden.status).toBe(404);
  });

  test("refuses Viewers, and mentions of them", async () => {
    const team = await shared();
    const read = await app.handle(
      apiRequest("GET", `/api/v1/comments?${onAnswer(team)}`, {
        cookie: team.viewerCookie,
      }),
    );
    expect(read.status).toBe(403);
    expect((await errorOf(read)).code).toBe("FORBIDDEN");
    const write = await post(team.viewerCookie, {
      workspaceId: team.workspace.id,
      target: team.target,
      body: "Hm",
      mentionUserIds: [],
    });
    expect(write.status).toBe(403);
    expect((await errorOf(write)).code).toBe("FORBIDDEN");
    const mention = await post(team.memberCookie, {
      workspaceId: team.workspace.id,
      target: team.target,
      body: "@Viewer",
      mentionUserIds: [team.viewer.id],
    });
    expect(mention.status).toBe(422);
    expect((await errorOf(mention)).code).toBe("INVALID_MENTION");
    const missing = await post(team.memberCookie, {
      workspaceId: team.workspace.id,
      target: { ...team.target, key: "SA.NOPE.1" },
      body: "Hm",
      mentionUserIds: [],
    });
    expect(missing.status).toBe(404);
  });
});

describe("C2 /api/v1/comments/{commentId}", () => {
  test("PATCH lets its writer edit it, telling only the newly mentioned", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const created = await comment(team, team.memberCookie, {
      mentionUserIds: [team.owner.id],
    });
    clock += 5000;
    const response = await app.handle(
      apiRequest("PATCH", `/api/v1/comments/${created.id}`, {
        cookie: team.memberCookie,
        body: {
          body: "Who, @Owner @Viewer?",
          mentionUserIds: [team.owner.id, team.viewer.id],
        },
      }),
    );
    expect(response.status).toBe(200);
    const edited = commentSchema.parse(await response.json());
    expect(edited.body).toBe("Who, @Owner @Viewer?");
    expect(edited.editedAt).toBe(new Date(clock).toISOString());
    expect(edited.mentions.map((user) => user.id).sort()).toEqual(
      [team.owner.id, team.viewer.id].sort(),
    );
    expect(
      (await noticesOf(created.id)).filter((n) => n.userId === team.viewer.id),
    ).toEqual([{ userId: team.viewer.id, kind: "mention" }]);
    expect(
      (await noticesOf(created.id)).filter((n) => n.userId === team.owner.id),
    ).toHaveLength(1);

    const other = await app.handle(
      apiRequest("PATCH", `/api/v1/comments/${created.id}`, {
        cookie: team.ownerCookie,
        body: { body: "Mine now", mentionUserIds: [] },
      }),
    );
    expect(other.status).toBe(403);
    expect((await errorOf(other)).code).toBe("FORBIDDEN");
  });

  test("DELETE keeps it in its thread as deleted, without its body", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const root = await comment(team, team.memberCookie, {
      mentionUserIds: [team.owner.id],
    });
    const reply = await comment(team, team.ownerCookie, { parentId: root.id });
    const remove = (id: string, cookie: string) =>
      app.handle(apiRequest("DELETE", `/api/v1/comments/${id}`, { cookie }));
    expect((await remove(root.id, team.ownerCookie)).status).toBe(403);
    expect((await remove(root.id, team.memberCookie)).status).toBe(204);
    expect((await remove(root.id, team.memberCookie)).status).toBe(204);
    const read = await list(team.ownerCookie, itemQuery(team));
    expect(read.threads[0]?.root).toMatchObject({
      id: root.id,
      deleted: true,
      body: "",
      mentions: [],
    });
    const edit = await app.handle(
      apiRequest("PATCH", `/api/v1/comments/${root.id}`, {
        cookie: team.memberCookie,
        body: { body: "Back", mentionUserIds: [] },
      }),
    );
    expect(edit.status).toBe(404);
    // A thread whose every comment is deleted stays, as deleted (design-spec 6.0.4).
    expect((await remove(reply.id, team.ownerCookie)).status).toBe(204);
    const emptied = await list(team.ownerCookie, itemQuery(team));
    expect(
      emptied.threads.map((thread) => [
        thread.root.deleted,
        thread.replies.map((c) => c.deleted),
      ]),
    ).toEqual([[true, [true]]]);
    expect(emptied.unresolvedCount).toBe(1);
  });
});

describe("C2 on archived content", () => {
  test("refuses to edit or delete a comment in an archived idea", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const created = await comment(team, team.memberCookie);
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    for (const [method, body] of [
      ["PATCH", { body: "Late", mentionUserIds: [] }],
      ["DELETE", undefined],
    ] as const) {
      const response = await app.handle(
        apiRequest(method, `/api/v1/comments/${created.id}`, {
          cookie: team.memberCookie,
          body,
        }),
      );
      expect(response.status).toBe(409);
      expect((await errorOf(response)).code).toBe("ARCHIVED");
    }
  });
});

describe("C3 /api/v1/comments/{commentId}/resolve", () => {
  test("resolves and reopens a thread, for Viewers too, on its first comment only", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const root = await comment(team, team.memberCookie);
    const reply = await comment(team, team.ownerCookie, { parentId: root.id });
    const resolve = (method: "POST" | "DELETE", id: string) =>
      app.handle(
        apiRequest(method, `/api/v1/comments/${id}/resolve`, {
          cookie: team.viewerCookie,
        }),
      );
    const done = await resolve("POST", root.id);
    expect(done.status).toBe(200);
    expect(commentSchema.parse(await done.json())).toMatchObject({
      resolvedAt: new Date(clock).toISOString(),
      resolvedBy: { id: team.viewer.id },
    });
    expect(
      (await list(team.ownerCookie, itemQuery(team))).unresolvedCount,
    ).toBe(0);
    const onReply = await resolve("POST", reply.id);
    expect(onReply.status).toBe(422);
    const reopened = await resolve("DELETE", root.id);
    expect(commentSchema.parse(await reopened.json()).resolvedAt).toBeNull();
    expect(
      (await list(team.ownerCookie, itemQuery(team))).unresolvedCount,
    ).toBe(1);
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, team.idea.id));
    const archived = await resolve("POST", root.id);
    expect(archived.status).toBe(409);
    expect((await errorOf(archived)).code).toBe("ARCHIVED");
  });

  test("answers 404 for a comment that is gone or no UUID, and 403 outside the workspace", async () => {
    const team = await teamWithNewIdea(app, fixtures);
    const root = await comment(team, team.memberCookie);
    for (const id of [crypto.randomUUID(), "nope"]) {
      const response = await app.handle(
        apiRequest("POST", `/api/v1/comments/${id}/resolve`, {
          cookie: team.ownerCookie,
        }),
      );
      expect(response.status).toBe(404);
    }
    const stranger = await fixtures.createUser();
    const response = await app.handle(
      apiRequest("POST", `/api/v1/comments/${root.id}/resolve`, {
        cookie: await signIn(app, stranger.email, uniqueIp()),
      }),
    );
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("NO_ACCESS");
  });
});
