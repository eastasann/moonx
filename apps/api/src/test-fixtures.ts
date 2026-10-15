import {
  accounts,
  businessPlans,
  type Database,
  type DatabaseTransaction,
  decisionLogEntries,
  executionItems,
  hashInvitationToken,
  INVITATION_VALID_MS,
  ideas,
  importTemplateFile,
  invitations,
  memberships,
  publishTemplateVersion,
  selfAnalyses,
  selfAnalysisShares,
  templateQuestions,
  templateSections,
  templates,
  templateVersions,
  users,
  validations,
  workspaces,
} from "@moonx/db";
import { ideaDetailSchema, type Role, type TemplateKind } from "@moonx/schemas";
import { hashPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { lockActiveCaller } from "./lock";
import { testConfig, uniqueIp } from "./test-app";

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

/** The BCDX template files the tests' validations and plans pin (data/templates/bcdx). */
const BCDX_FILES = {
  validation: new URL(
    "../../../data/templates/bcdx/validation.json",
    import.meta.url,
  ),
  business_plan: new URL(
    "../../../data/templates/bcdx/plan.json",
    import.meta.url,
  ),
} as const;

/** The published BCDX versions, each made once per process however many ask at once. */
const bcdxVersions = new Map<
  keyof typeof BCDX_FILES,
  Promise<typeof templateVersions.$inferSelect>
>();

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
    if (kind === "validation" || kind === "business_plan") {
      const made = bcdxVersions.get(kind) ?? bcdxVersion(kind);
      bcdxVersions.set(kind, made);
      return made;
    }
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

  /**
   * v1 of the `kind` template with the BCDX file's content (data/templates/bcdx),
   * imported and published as an operator would (AD10, AD6), so validations evaluate
   * and plans draft as they do in use.
   */
  async function bcdxVersion(kind: keyof typeof BCDX_FILES) {
    const published = async () =>
      (
        await db
          .select({ version: templateVersions })
          .from(templateVersions)
          .innerJoin(templates, eq(templates.id, templateVersions.templateId))
          .where(
            and(
              eq(templates.kind, kind),
              eq(templateVersions.versionNumber, 1),
              eq(templateVersions.status, "published"),
            ),
          )
      )[0]?.version;
    const existing = await published();
    if (existing !== undefined) return existing;
    const imported = await importTemplateFile(
      db,
      kind,
      await Bun.file(BCDX_FILES[kind]).json(),
    );
    await publishTemplateVersion(db, imported.versionId, null);
    return required(await published(), `${kind} template version`);
  }

  /**
   * The self-analysis template version the tests share, made once: section `WHY` with
   * the long texts `SA.WHY.1` and `SA.WHY.2`, then `INCOME` with the amount-with-reason
   * question `SA.INCOME.1`. S1 makes new self-analyses on it, as the latest published.
   */
  async function selfAnalysisVersion() {
    const version = await templateVersion("self_analysis");
    const questions = {
      WHY: [
        { key: "SA.WHY.1", answerType: "long_text" },
        { key: "SA.WHY.2", answerType: "long_text" },
      ],
      INCOME: [{ key: "SA.INCOME.1", answerType: "amount_with_reason" }],
    } as const;
    for (const [sortOrder, [key, keyed]] of Object.entries(
      questions,
    ).entries()) {
      await db
        .insert(templateSections)
        .values({
          templateVersionId: version.id,
          key,
          title: key === "WHY" ? "Why" : "Personal income",
          sortOrder,
        })
        .onConflictDoNothing();
      const section = required(
        (
          await db
            .select()
            .from(templateSections)
            .where(
              and(
                eq(templateSections.templateVersionId, version.id),
                eq(templateSections.key, key),
              ),
            )
        )[0],
        "template section",
      );
      for (const [order, question] of keyed.entries()) {
        await db
          .insert(templateQuestions)
          .values({
            templateVersionId: version.id,
            templateSectionId: section.id,
            questionKey: question.key,
            title: question.key,
            prompt: `${question.key}?`,
            answerType: question.answerType,
            sortOrder: order,
          })
          .onConflictDoNothing();
      }
    }
    return version.id;
  }

  /** `userId`'s self-analysis, shared with the workspaces in `sharedWith`. */
  async function createSelfAnalysis(
    userId: string,
    sharedWith: readonly string[] = [],
  ) {
    const versionId = await selfAnalysisVersion();
    const [analysis] = await db
      .insert(selfAnalyses)
      .values({ userId, templateVersionId: versionId })
      .returning();
    const created = required(analysis, "self-analysis");
    for (const workspaceId of sharedWith) {
      await db
        .insert(selfAnalysisShares)
        .values({ selfAnalysisId: created.id, workspaceId });
    }
    return created;
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

  /**
   * A decision on the idea, recorded straight in the database as V19 would (its
   * snapshot empty): Proceed by default, which lets the idea have plans (M5).
   */
  async function createDecision(
    idea: { id: string; workspaceId: string },
    recordedById: string,
    value: "proceed" | "hold" | "drop" = "proceed",
  ) {
    const [entry] = await db
      .insert(decisionLogEntries)
      .values({
        workspaceId: idea.workspaceId,
        ideaId: idea.id,
        kind: "validation_decision",
        value,
        reason: "Decided in a test",
        snapshot: {},
        recordedById,
      })
      .returning();
    await db
      .update(ideas)
      .set({ latestDecision: value })
      .where(eq(ideas.id, idea.id));
    return required(entry, "decision");
  }

  /** An execution item of `planId`, made straight in the database. */
  async function createExecutionItem(
    planId: string,
    values: Partial<typeof executionItems.$inferInsert> = {},
  ) {
    const [item] = await db
      .insert(executionItems)
      .values({
        businessPlanId: planId,
        type: "next_action",
        title: "Call the supplier",
        status: "todo",
        sortOrder: 0,
        ...values,
      })
      .returning();
    return required(item, "execution item");
  }

  return {
    createUser,
    createInvitation,
    createWorkspace,
    addMember,
    createTeam,
    templateVersion,
    selfAnalysisVersion,
    createSelfAnalysis,
    createIdea,
    createPlan,
    createDecision,
    createExecutionItem,
  };
}

/** A small PNG made of one grey square, for the photo uploads of U3. */
export const testPng = (side = 16) =>
  sharp({
    create: {
      width: side,
      height: side,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .png()
    .toBuffer();

/** The `multipart/form-data` body of U3 with `bytes` as its `file`. */
export const photoForm = (bytes: Uint8Array, name = "photo.png") => {
  const form = new FormData();
  form.set("file", new File([bytes], name, { type: "image/png" }));
  return form;
};

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

/**
 * A request to `/api/v1` as the Web sends it (SDD 7.2「CSRF」): from a trusted origin,
 * with a JSON body on every state-changing call (an empty one is `null`), or a form for
 * the photo upload. Each comes from a fresh IP.
 */
export function apiRequest(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options: { cookie?: string; body?: unknown } = {},
): Request {
  const { cookie, body } = options;
  const form = body instanceof FormData;
  const json = !form && method !== "GET";
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "x-forwarded-for": uniqueIp(),
      origin: testConfig.trustedOrigins[0] ?? "",
      ...(json ? { "content-type": "application/json" } : {}),
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: form ? body : json ? JSON.stringify(body ?? null) : undefined,
  });
}

/**
 * Resolves once a query waits for a lock `holder` keeps, so a test holding one knows
 * the request it started has reached it.
 */
export async function untilBlockedBy(
  db: Database,
  holder: DatabaseTransaction,
): Promise<void> {
  const [own] = await holder.execute<{ pid: number }>(
    sql`select pg_backend_pid() as pid`,
  );
  if (own === undefined) throw new Error("No backend pid");
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [row] = await db.execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
        where ${own.pid}::int = any(pg_blocking_pids(pid))`,
    );
    if ((row?.waiting ?? 0) > 0) return;
    await Bun.sleep(10);
  }
  throw new Error("Nothing waited for the test's lock within 5 s");
}

/**
 * Starts `request` while holding the lock U7 takes first on `userId`'s account, deletes
 * the account under it as U7 would, and answers the response once that has committed:
 * the request reached the lock before the account was gone.
 */
export async function duringAccountDeletion(
  db: Database,
  userId: string,
  request: () => Promise<Response>,
): Promise<Response> {
  const started: { response?: Promise<Response> } = {};
  await db.transaction(async (tx) => {
    await lockActiveCaller(tx, userId, "exclusive");
    started.response = request();
    await untilBlockedBy(db, tx);
    await tx
      .update(users)
      .set({ status: "deleted" })
      .where(eq(users.id, userId));
  });
  if (started.response === undefined) {
    throw new Error("The request did not start");
  }
  return started.response;
}

/**
 * A team of `fixtures` signed in to `app`, with an idea its Owner made through I1, so
 * its validation has the template's cost rows as M1 makes them.
 */
export async function teamWithNewIdea(
  app: { handle(request: Request): Promise<Response> },
  fixtures: ReturnType<typeof testFixtures>,
) {
  const team = await fixtures.createTeam();
  const cookieOf = (user: { email: string }) =>
    signIn(app, user.email, uniqueIp());
  const ownerCookie = await cookieOf(team.owner);
  const memberCookie = await cookieOf(team.member);
  const viewerCookie = await cookieOf(team.viewer);
  await fixtures.templateVersion("validation");
  const response = await app.handle(
    apiRequest("POST", `/api/v1/workspaces/${team.workspace.id}/ideas`, {
      cookie: ownerCookie,
      body: { name: "Piaya boxes", oneLineConcept: "Gift boxes for offices" },
    }),
  );
  if (response.status !== 201) {
    throw new Error(`I1 answered ${response.status}`);
  }
  const idea = ideaDetailSchema.parse(await response.json());
  return {
    ...team,
    ownerCookie,
    memberCookie,
    viewerCookie,
    idea,
    validationId: idea.validationId,
  };
}

/**
 * {@link teamWithNewIdea} with a Proceed decision by its Owner and the plan template
 * published, so its Owner and Member can draft plans (M5).
 */
export async function teamWithProceedIdea(
  app: { handle(request: Request): Promise<Response> },
  fixtures: ReturnType<typeof testFixtures>,
) {
  const team = await teamWithNewIdea(app, fixtures);
  const decision = await fixtures.createDecision(
    { id: team.idea.id, workspaceId: team.workspace.id },
    team.owner.id,
  );
  await fixtures.templateVersion("business_plan");
  return { ...team, decision };
}
