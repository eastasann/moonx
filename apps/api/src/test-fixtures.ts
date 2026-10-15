import {
  accounts,
  businessPlans,
  type Database,
  hashInvitationToken,
  INVITATION_VALID_MS,
  ideas,
  invitations,
  memberships,
  templates,
  templateVersions,
  users,
  validations,
  workspaces,
} from "@moonx/db";
import type { Role, TemplateKind } from "@moonx/schemas";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

// Rows the API's tests build on, made straight in the database. Every row gets fresh
// ids and addresses, so tests never meet each other's data.

/** The password of every user {@link testFixtures} creates. */
export const TEST_PASSWORD = "correct horse battery";

export const uniqueEmail = (label = "user") =>
  `${label}-${crypto.randomUUID()}@example.com`;

/** The `Cookie` header a browser would send back after `response`. */
export const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .filter((pair) => !pair?.endsWith("="))
    .join("; ");

const required = <T>(row: T | undefined, what: string): T => {
  if (row === undefined) throw new Error(`no ${what} row`);
  return row;
};

/** The fixtures, bound to the test database. */
export function testFixtures(db: Database) {
  /** A user who signs in with {@link TEST_PASSWORD}, as U5 and the seed create them. */
  async function createUser(
    options: {
      email?: string;
      displayName?: string;
      status?: "active" | "suspended" | "deleted";
      isAdmin?: boolean;
    } = {},
  ) {
    const [user] = await db
      .insert(users)
      .values({
        email: options.email ?? uniqueEmail(),
        emailVerified: true,
        displayName: options.displayName ?? "Test User",
        status: options.status ?? "active",
        isAdmin: options.isAdmin ?? false,
      })
      .returning();
    const created = required(user, "user");
    await db.insert(accounts).values({
      userId: created.id,
      accountId: created.id,
      providerId: "credential",
      password: await hashPassword(TEST_PASSWORD),
    });
    return created;
  }

  /** An invitation and the token of its link, valid for 7 days unless `values` say otherwise. */
  async function createInvitation(
    values: Partial<typeof invitations.$inferInsert> & { email: string },
  ) {
    const token = crypto.randomUUID();
    const [invitation] = await db
      .insert(invitations)
      .values({
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + INVITATION_VALID_MS),
        ...values,
      })
      .returning();
    return { ...required(invitation, "invitation"), token };
  }

  /** A workspace created by `createdById` (a new user when left out), with no members. */
  async function createWorkspace(
    values: Partial<typeof workspaces.$inferInsert> = {},
  ) {
    const createdById = values.createdById ?? (await createUser()).id;
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Team", ...values, createdById })
      .returning();
    return required(workspace, "workspace");
  }

  async function addMember(workspaceId: string, userId: string, role: Role) {
    await db.insert(memberships).values({ workspaceId, userId, role });
  }

  /** A workspace with one user in each role, and an operator who is not in it. */
  async function createTeam() {
    const owner = await createUser({ displayName: "Owner" });
    const member = await createUser({ displayName: "Member" });
    const viewer = await createUser({ displayName: "Viewer" });
    const admin = await createUser({ displayName: "Admin", isAdmin: true });
    const workspace = await createWorkspace({ createdById: owner.id });
    await addMember(workspace.id, owner.id, "owner");
    await addMember(workspace.id, member.id, "member");
    await addMember(workspace.id, viewer.id, "viewer");
    return { workspace, owner, member, viewer, admin };
  }

  /**
   * A published version of the `kind` template, the one validations and plans of the
   * tests pin. There is one template per kind, so tests share it.
   */
  async function templateVersion(kind: TemplateKind) {
    await db
      .insert(templates)
      .values({ kind, name: `Test ${kind}` })
      .onConflictDoNothing();
    const template = required(
      (await db.select().from(templates).where(eq(templates.kind, kind)))[0],
      "template",
    );
    await db
      .insert(templateVersions)
      .values({
        templateId: template.id,
        versionNumber: 1,
        status: "published",
        publishedAt: new Date(),
      })
      .onConflictDoNothing();
    return required(
      (
        await db
          .select()
          .from(templateVersions)
          .where(
            and(
              eq(templateVersions.templateId, template.id),
              eq(templateVersions.versionNumber, 1),
            ),
          )
      )[0],
      "template version",
    );
  }

  /** An idea of `workspaceId` with its validation. */
  async function createIdea(
    workspaceId: string,
    proposerId: string,
    values: Partial<typeof ideas.$inferInsert> = {},
  ) {
    const [idea] = await db
      .insert(ideas)
      .values({
        workspaceId,
        proposerId,
        name: "Test idea",
        oneLineConcept: "Something worth checking",
        ...values,
      })
      .returning();
    const created = required(idea, "idea");
    const [validation] = await db
      .insert(validations)
      .values({
        ideaId: created.id,
        templateVersionId: (await templateVersion("validation")).id,
      })
      .returning();
    return { idea: created, validation: required(validation, "validation") };
  }

  async function createPlan(
    ideaId: string,
    createdById: string,
    values: Partial<typeof businessPlans.$inferInsert> = {},
  ) {
    const [plan] = await db
      .insert(businessPlans)
      .values({
        ideaId,
        createdById,
        name: `Plan ${crypto.randomUUID().slice(0, 8)}`,
        businessName: "Test business",
        preparedBy: "Tester",
        templateVersionId: (await templateVersion("business_plan")).id,
        ...values,
      })
      .returning();
    return required(plan, "plan");
  }

  return {
    createUser,
    createInvitation,
    createWorkspace,
    addMember,
    createTeam,
    templateVersion,
    createIdea,
    createPlan,
  };
}

/** Signs in through A1 and returns the `Cookie` header of the session. */
export async function signIn(
  app: { handle(request: Request): Promise<Response> },
  email: string,
  ip: string,
): Promise<string> {
  const response = await app.handle(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    }),
  );
  if (response.status !== 200) {
    throw new Error(`sign-in answered ${response.status}`);
  }
  return cookiesOf(response);
}
