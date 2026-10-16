import { afterAll, describe, expect, test } from "bun:test";
import {
  comments,
  decisionLogEntries,
  notifications,
  selfAnalyses,
  selfAnalysisShares,
  users,
} from "@moonx/db";
import { eq, inArray } from "drizzle-orm";
import { commentLink, notifyComment, notifyDecision } from "./notifications";
import { connectTestDatabase } from "./test-app";
import { testFixtures } from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);

async function setUp() {
  const team = await fixtures.createTeam();
  const proposer = await fixtures.createUser({ displayName: "Proposer" });
  await fixtures.addMember(team.workspace.id, proposer.id, "member");
  const { idea, validation } = await fixtures.createIdea(
    team.workspace.id,
    proposer.id,
  );
  const planner = await fixtures.createUser({ displayName: "Planner" });
  await fixtures.addMember(team.workspace.id, planner.id, "member");
  const plan = await fixtures.createPlan(idea.id, planner.id);
  return { ...team, proposer, planner, idea, validation, plan };
}

type CommentValues = typeof comments.$inferInsert;

async function addComment(values: CommentValues) {
  const [comment] = await db.insert(comments).values(values).returning();
  if (comment === undefined) throw new Error("no comment");
  return comment;
}

/** The notifications of `comment` or `entry`, as `{ userId: kind }`. */
async function received(where: { commentId?: string; entryId?: string }) {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      where.commentId === undefined
        ? eq(notifications.decisionLogEntryId, where.entryId ?? "")
        : eq(notifications.commentId, where.commentId),
    );
  return Object.fromEntries(rows.map((row) => [row.userId, row.kind]));
}

describe("decisions (design-spec 6.15 判定)", () => {
  async function record(
    t: Awaited<ReturnType<typeof setUp>>,
    kind: "validation_decision" | "go_no_go" | "version_saved",
  ) {
    const [entry] = await db
      .insert(decisionLogEntries)
      .values({
        workspaceId: t.workspace.id,
        ideaId: t.idea.id,
        businessPlanId: kind === "validation_decision" ? null : t.plan.id,
        kind,
        value:
          kind === "version_saved"
            ? null
            : kind === "go_no_go"
              ? "launch"
              : "proceed",
        reason: "Because",
        snapshot: {},
        recordedById: t.member.id,
      })
      .returning();
    if (entry === undefined) throw new Error("no entry");
    return entry;
  }

  test("tells everyone in the workspace but the recorder, Viewers included", async () => {
    const t = await setUp();
    const entry = await record(t, "validation_decision");
    const at = new Date("2026-10-15T06:00:00.000Z");

    await db.transaction((tx) => notifyDecision(tx, entry, at));

    expect(await received({ entryId: entry.id })).toEqual({
      [t.owner.id]: "decision",
      [t.viewer.id]: "decision",
      [t.proposer.id]: "decision",
      [t.planner.id]: "decision",
    });
    const [row] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, t.owner.id));
    expect(row).toMatchObject({
      workspaceId: t.workspace.id,
      actorId: t.member.id,
      commentId: null,
      link: { screen: 13, workspaceId: t.workspace.id, ideaId: t.idea.id },
      readAt: null,
      createdAt: at,
    });
  });

  test("opens the plan home for a Go / No-Go and a saved version", async () => {
    const t = await setUp();
    for (const kind of ["go_no_go", "version_saved"] as const) {
      const entry = await record(t, kind);
      await db.transaction((tx) => notifyDecision(tx, entry, new Date()));
      const [row] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.decisionLogEntryId, entry.id));
      expect(row?.link).toEqual({
        screen: 20,
        workspaceId: t.workspace.id,
        ideaId: t.idea.id,
        planId: t.plan.id,
      });
    }
  });

  test("refuses a Go / No-Go or a saved version that names no plan", async () => {
    const t = await setUp();
    const entry = await record(t, "validation_decision");

    await expect(
      db.transaction((tx) =>
        notifyDecision(tx, { ...entry, kind: "go_no_go" }, new Date()),
      ),
    ).rejects.toThrow("A go_no_go entry must name its plan");
  });

  test("leaves out suspended users and people outside the workspace", async () => {
    const t = await setUp();
    await db
      .update(users)
      .set({ status: "suspended" })
      .where(eq(users.id, t.viewer.id));
    const entry = await record(t, "validation_decision");

    await db.transaction((tx) => notifyDecision(tx, entry, new Date()));

    const recipients = Object.keys(await received({ entryId: entry.id }));
    expect(recipients).not.toContain(t.viewer.id);
    expect(recipients).not.toContain(t.admin.id);
    expect(recipients).not.toContain(t.member.id);
  });
});

describe("comments (design-spec 6.15 メンション・コメント)", () => {
  test("tells the proposer of the idea about a comment on its validation", async () => {
    const t = await setUp();
    const comment = await addComment({
      workspaceId: t.workspace.id,
      containerType: "validation",
      containerId: t.validation.id,
      sectionKey: "01",
      targetType: "validation_answer",
      targetId: t.validation.id,
      targetKey: "V.01.WHO",
      authorId: t.viewer.id,
      body: "Who exactly?",
    });

    await db.transaction((tx) =>
      notifyComment(
        tx,
        comment,
        { mentioned: [], followers: true },
        new Date(),
      ),
    );

    expect(await received({ commentId: comment.id })).toEqual({
      [t.proposer.id]: "comment",
    });
  });

  test("tells both the plan's maker and the idea's proposer once each, and mentions first", async () => {
    const t = await setUp();
    const comment = await addComment({
      workspaceId: t.workspace.id,
      containerType: "business_plan",
      containerId: t.plan.id,
      sectionKey: "12",
      targetType: "plan_answer",
      targetId: t.plan.id,
      targetKey: "P.12.1",
      authorId: t.owner.id,
      body: "@Planner check this",
    });

    await db.transaction((tx) =>
      notifyComment(
        tx,
        comment,
        { mentioned: [t.planner.id, t.viewer.id, t.owner.id], followers: true },
        new Date(),
      ),
    );

    expect(await received({ commentId: comment.id })).toEqual({
      [t.planner.id]: "mention",
      [t.viewer.id]: "mention",
      [t.proposer.id]: "comment",
    });
  });

  test("tells whoever wrote in the thread about a reply, never the author", async () => {
    const t = await setUp();
    const thread = {
      workspaceId: t.workspace.id,
      containerType: "idea" as const,
      containerId: t.idea.id,
      targetType: "idea" as const,
      targetId: t.idea.id,
    };
    const root = await addComment({
      ...thread,
      authorId: t.viewer.id,
      body: "Q",
    });
    await addComment({
      ...thread,
      parentId: root.id,
      authorId: t.owner.id,
      body: "A",
    });
    // Deleting a comment does not take its writer out of the thread.
    await addComment({
      ...thread,
      parentId: root.id,
      authorId: t.member.id,
      body: "C",
      deletedAt: new Date(),
    });
    const reply = await addComment({
      ...thread,
      parentId: root.id,
      authorId: t.proposer.id,
      body: "B",
    });

    await db.transaction((tx) =>
      notifyComment(tx, reply, { mentioned: [], followers: true }, new Date()),
    );

    expect(await received({ commentId: reply.id })).toEqual({
      [t.viewer.id]: "comment",
      [t.owner.id]: "comment",
      [t.member.id]: "comment",
    });
  });

  test("tells only the newly mentioned about an edit", async () => {
    const t = await setUp();
    const comment = await addComment({
      workspaceId: t.workspace.id,
      containerType: "idea",
      containerId: t.idea.id,
      targetType: "idea",
      targetId: t.idea.id,
      authorId: t.owner.id,
      body: "Edited",
    });

    await db.transaction((tx) =>
      notifyComment(
        tx,
        comment,
        { mentioned: [t.member.id], followers: false },
        new Date(),
      ),
    );

    expect(await received({ commentId: comment.id })).toEqual({
      [t.member.id]: "mention",
    });
  });

  test("never notifies people outside the workspace or suspended users", async () => {
    const t = await setUp();
    await db
      .update(users)
      .set({ status: "suspended" })
      .where(eq(users.id, t.proposer.id));
    const comment = await addComment({
      workspaceId: t.workspace.id,
      containerType: "idea",
      containerId: t.idea.id,
      targetType: "idea",
      targetId: t.idea.id,
      authorId: t.owner.id,
      body: "Hello",
    });

    await db.transaction((tx) =>
      notifyComment(
        tx,
        comment,
        { mentioned: [t.admin.id, t.proposer.id], followers: true },
        new Date(),
      ),
    );

    expect(await received({ commentId: comment.id })).toEqual({});
  });

  test("on a self-analysis, tells only its owner and the shared workspace's Owners and Members", async () => {
    const t = await setUp();
    const [analysis] = await db
      .insert(selfAnalyses)
      .values({
        userId: t.proposer.id,
        templateVersionId: (await fixtures.templateVersion("self_analysis")).id,
      })
      .returning();
    if (analysis === undefined) throw new Error("no self-analysis");
    const values = {
      workspaceId: t.workspace.id,
      containerType: "self_analysis" as const,
      containerId: analysis.id,
      sectionKey: "WHY",
      targetType: "self_analysis_answer" as const,
      targetId: analysis.id,
      targetKey: "SA.WHY.1",
      body: "Interesting",
    };
    const notify = async (authorId: string) => {
      const comment = await addComment({ ...values, authorId });
      await db.transaction((tx) =>
        notifyComment(
          tx,
          comment,
          {
            mentioned: [t.viewer.id, t.member.id, t.owner.id],
            followers: true,
          },
          new Date(),
        ),
      );
      return comment;
    };

    // Not shared: the mentioned members cannot read it.
    const unshared = await notify(t.owner.id);
    expect(await received({ commentId: unshared.id })).toEqual({
      [t.proposer.id]: "comment",
    });

    await db
      .insert(selfAnalysisShares)
      .values({ selfAnalysisId: analysis.id, workspaceId: t.workspace.id });
    const shared = await notify(t.owner.id);
    expect(await received({ commentId: shared.id })).toEqual({
      [t.member.id]: "mention",
      [t.proposer.id]: "comment",
    });

    // A suspended owner hears of nothing.
    await db
      .update(users)
      .set({ status: "suspended" })
      .where(eq(users.id, t.proposer.id));
    const whileSuspended = await notify(t.owner.id);
    expect(await received({ commentId: whileSuspended.id })).toEqual({
      [t.member.id]: "mention",
    });

    const links = await db
      .select({ userId: notifications.userId, link: notifications.link })
      .from(notifications)
      .where(eq(notifications.commentId, shared.id));
    const linkOf = (userId: string) =>
      links.find((row) => row.userId === userId)?.link;
    expect(linkOf(t.proposer.id)).toMatchObject({
      screen: 11,
      sectionKey: "WHY",
      questionKey: "SA.WHY.1",
      panel: "comments",
    });
    expect(linkOf(t.member.id)).toMatchObject({
      screen: 12,
      userId: t.proposer.id,
      sectionKey: "WHY",
    });
  });

  test("records who acted, on what and when", async () => {
    const t = await setUp();
    const comment = await addComment({
      workspaceId: t.workspace.id,
      containerType: "idea",
      containerId: t.idea.id,
      targetType: "idea",
      targetId: t.idea.id,
      authorId: t.owner.id,
      body: "Hi",
    });
    const at = new Date("2026-10-15T07:00:00.000Z");

    await db.transaction((tx) =>
      notifyComment(
        tx,
        comment,
        { mentioned: [t.viewer.id], followers: true },
        at,
      ),
    );

    const rows = await db
      .select()
      .from(notifications)
      .where(inArray(notifications.userId, [t.viewer.id, t.proposer.id]));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      workspaceId: t.workspace.id,
      actorId: t.owner.id,
      commentId: comment.id,
      decisionLogEntryId: null,
      createdAt: at,
    });
  });
});

describe("where a comment notification opens (SDD 6.3, 4章)", () => {
  const workspaceId = crypto.randomUUID();
  const ideaId = crypto.randomUUID();
  const planId = crypto.randomUUID();
  const rowId = crypto.randomUUID();
  type Place = Parameters<typeof commentLink>[1];
  const place: Place = { ideaId, planId: null, selfAnalysisOwnerId: null };
  const planPlace: Place = { ideaId, planId, selfAnalysisOwnerId: null };
  const link = (
    targetType: Parameters<typeof commentLink>[0]["targetType"],
    targetKey: string | null,
    where = place,
  ) =>
    commentLink(
      {
        id: crypto.randomUUID(),
        workspaceId,
        containerType: "validation",
        containerId: crypto.randomUUID(),
        targetType,
        targetId: rowId,
        targetKey,
        parentId: null,
        authorId: crypto.randomUUID(),
      },
      where,
      crypto.randomUUID(),
    );
  const common = { workspaceId, panel: "comments" };

  test("opens each validation item on its screen", () => {
    expect(link("idea", null)).toMatchObject({ screen: 13, ideaId, ...common });
    expect(link("validation_answer", "V.01.WHO")).toMatchObject({
      screen: 11,
      ideaId,
      sectionKey: "01",
      questionKey: "V.01.WHO",
      ...common,
    });
    expect(link("validation_answer", "V.04.SURVIVOR_PATTERNS")).toMatchObject({
      screen: 15,
      questionKey: "V.04.SURVIVOR_PATTERNS",
    });
    expect(link("validation_answer", "V.08.WORTH")).toMatchObject({
      screen: 18,
    });
    expect(link("research_log_entry", null)).toMatchObject({
      screen: 14,
      rowId,
    });
    expect(link("competitor", null)).toMatchObject({ screen: 15, rowId });
    expect(link("assumption", null)).toMatchObject({
      screen: 16,
      tab: "assumptions",
      rowId,
    });
    expect(link("risk", null)).toMatchObject({
      screen: 16,
      tab: "risks",
      rowId,
    });
    expect(link("cost_item", null)).toMatchObject({ screen: 17, rowId });
    expect(link("economics_input", "selling_price")).toMatchObject({
      screen: 18,
      field: "selling_price",
    });
  });

  test("opens each plan item on its screen", () => {
    expect(link("plan_answer", "P.07.2", planPlace)).toMatchObject({
      screen: 21,
      ideaId,
      planId,
      itemNo: 7,
      questionKey: "P.07.2",
    });
    expect(link("execution_item", null, planPlace)).toMatchObject({
      screen: 22,
      planId,
      rowId,
    });
    expect(link("pitch_slide", "five.market", planPlace)).toMatchObject({
      screen: 23,
      planId,
      target: { type: "pitch_slide", id: rowId, key: "five.market" },
    });
  });
});
