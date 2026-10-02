import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { DEMO_PASSWORD, personalWorkspaceId, seedDemo, userId } from "@moonx/db/seed";
import { and, eq } from "drizzle-orm";
import type { Elysia } from "elysia";
import { appOn, call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let app: Elysia;

beforeAll(async () => {
  t = await startTestApp();
  app = appOn(t.db);
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await seedDemo(t.db);
});

const deleteKenji = async () =>
  call(app, "POST", "/api/v1/me/delete", {
    as: await login(app, "kenji"),
    body: { confirmEmail: "kenji@bcdx.example", password: DEMO_PASSWORD },
  });

const workspaceRows = (id: string) =>
  t.db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
const memberRows = (id: string) =>
  t.db.select().from(schema.memberships).where(eq(schema.memberships.workspaceId, id));

/** A team workspace whose only member is Kenji, with an idea he proposed. */
async function soloTeam() {
  const [workspace] = await t.db
    .insert(schema.workspaces)
    .values({ name: "Kenji's side team", isPersonal: false, createdById: userId("kenji") })
    .returning({ id: schema.workspaces.id });
  const id = (workspace as { id: string }).id;
  await t.db
    .insert(schema.memberships)
    .values({ workspaceId: id, userId: userId("kenji"), role: "owner" });
  const [idea] = await t.db
    .insert(schema.ideas)
    .values({
      workspaceId: id,
      name: "Solo idea",
      oneLineConcept: "A record the team keeps",
      proposerId: userId("kenji"),
    })
    .returning({ id: schema.ideas.id });
  return { id, ideaId: (idea as { id: string }).id };
}

describe("U7 delete account: workspaces nobody else belongs to (design-spec 6.16)", () => {
  test("a team workspace with only the deleting user stays; only the membership goes", async () => {
    const team = await soloTeam();
    const res = await deleteKenji();
    expect(res.status).toBe(204);

    expect(await workspaceRows(team.id)).toHaveLength(1);
    expect(await memberRows(team.id)).toHaveLength(0);
    const ideas = await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, team.ideaId));
    expect(ideas).toHaveLength(1);
    expect(ideas[0]?.proposerId).toBe(userId("kenji"));
    const [user] = await t.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId("kenji")));
    expect(user).toMatchObject({ status: "deleted", displayName: "Deleted user" });
  });

  test("the sole member being its Owner does not trigger LAST_OWNER", async () => {
    await soloTeam();
    const res = await deleteKenji();
    expect(res.status).toBe(204);
  });

  test("the personal workspace nobody else belongs to is deleted with its content", async () => {
    const personal = personalWorkspaceId("kenji");
    expect(await workspaceRows(personal)).toHaveLength(1);
    expect((await deleteKenji()).status).toBe(204);
    expect(await workspaceRows(personal)).toHaveLength(0);
  });

  test("a personal workspace that has other members is treated like a team workspace", async () => {
    const personal = personalWorkspaceId("kenji");
    await t.db
      .insert(schema.memberships)
      .values({ workspaceId: personal, userId: userId("ana"), role: "member" });
    const blocked = await deleteKenji();
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("LAST_OWNER");

    await t.db
      .update(schema.memberships)
      .set({ role: "owner" })
      .where(
        and(
          eq(schema.memberships.workspaceId, personal),
          eq(schema.memberships.userId, userId("ana")),
        ),
      );
    expect((await deleteKenji()).status).toBe(204);
    expect(await workspaceRows(personal)).toHaveLength(1);
    expect((await memberRows(personal)).map((m) => m.userId)).toEqual([userId("ana")]);
  });
});
