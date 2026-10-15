import { afterAll, describe, expect, test } from "bun:test";
import {
  accounts,
  assumptions,
  competitors,
  costItems,
  evidenceLinks,
  researchLogEntries,
  risks,
  validationAnswers,
  verifications,
} from "@moonx/db";
import type { Role } from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { type AccessKind, accessDeclarations } from "./access";
import { newAvatarName } from "./avatars";
import {
  buildTestApp,
  connectTestDatabase,
  testConfig,
  uniqueIp,
} from "./test-app";
import {
  photoForm,
  signIn,
  TEST_PASSWORD,
  testFixtures,
  testPng,
  uniqueEmail,
} from "./test-fixtures";

// The table-driven test of SDD 7.1 (10章): each endpoint, called by each kind of caller,
// against the status the table allows or refuses with. A route without a row fails the
// last test, so every endpoint a later step adds needs its row here.

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
const ORIGIN = testConfig.trustedOrigins[0] ?? "";
const GOOGLE = { clientId: "test-client", clientSecret: "test-secret" };

/** The columns of the 7.1 table. Admin is an operator outside the workspace. */
const CALLERS = ["anonymous", "viewer", "member", "owner", "admin"] as const;
type CallerName = (typeof CALLERS)[number];

interface Person {
  id: string;
  email: string;
  /** The session cookie; none for `anonymous`, who still has an account to use. */
  cookie: string | undefined;
}

type People = Record<CallerName, Person>;

/** A workspace with a Viewer, a Member and an Owner, an operator outside it, and a stranger. */
async function people(app: { handle(request: Request): Promise<Response> }) {
  const team = await fixtures.createTeam();
  const stranger = await fixtures.createUser();
  const person = async (
    user: { id: string; email: string },
    signedIn: boolean,
  ): Promise<Person> => ({
    id: user.id,
    email: user.email,
    cookie: signedIn ? await signIn(app, user.email, uniqueIp()) : undefined,
  });
  return {
    workspaceId: team.workspace.id,
    callers: {
      anonymous: await person(stranger, false),
      viewer: await person(team.viewer, true),
      member: await person(team.member, true),
      owner: await person(team.owner, true),
      admin: await person(team.admin, true),
    } satisfies People,
  };
}

/**
 * A request as the Web sends it: JSON for every state-changing `/api/v1` call, bodyless
 * ones included (SDD 7.2「CSRF」), or the form of a photo upload.
 */
function request(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  caller: Person,
  body?: unknown,
) {
  const form = body instanceof FormData;
  const json =
    !form &&
    (path.startsWith("/api/v1/") ? method !== "GET" : body !== undefined);
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "x-forwarded-for": uniqueIp(),
      origin: ORIGIN,
      ...(json ? { "content-type": "application/json" } : {}),
      ...(caller.cookie === undefined ? {} : { cookie: caller.cookie }),
    },
    body: form ? body : json ? JSON.stringify(body ?? null) : undefined,
  });
}

/** Statuses for the five columns, from what an allowed call answers and what a refusal is. */
const everyone = (status: number): Record<CallerName, number> =>
  Object.fromEntries(CALLERS.map((caller) => [caller, status])) as Record<
    CallerName,
    number
  >;
const signedInOnly = (status: number): Record<CallerName, number> => ({
  ...everyone(status),
  anonymous: 401,
});

/** The workspace of a row's people, and the people. */
interface Team {
  workspaceId: string;
  callers: People;
}

interface Row {
  /** The API numbers of SDD 5.3. */
  api: string;
  /** The routes the row covers, as the router names them, and how they declare access. */
  routes: Record<string, AccessKind>;
  /** The app to call: the default, Google configured, or staging. */
  app?: "google" | "staging";
  call(caller: Person, team: Team): Promise<Request> | Request;
  expected: Record<CallerName, number>;
}

/** Statuses of a workspace route for its members, refusing the operator outside it. */
const members = (
  viewer: number,
  member: number,
  owner: number,
): Record<CallerName, number> => ({
  anonymous: 401,
  viewer,
  member,
  owner,
  admin: 403,
});

/** A new idea of the row's workspace proposed by its Owner, with its validation. */
const newIdea = (
  team: Team,
  values: Parameters<typeof fixtures.createIdea>[2] = {},
) => fixtures.createIdea(team.workspaceId, team.callers.owner.id, values);

/** A new member of the row's workspace, for a call that changes or removes one. */
async function newMember(workspaceId: string) {
  const user = await fixtures.createUser();
  await fixtures.addMember(workspaceId, user.id, "member");
  return user;
}

/** A row of each worksheet list of a new idea of the team, made straight in the database. */
async function newListRows(team: Team) {
  const { idea, validation } = await newIdea(team);
  const validationId = validation.id;
  const [log] = await db
    .insert(researchLogEntries)
    .values({
      validationId,
      topic: "Price check",
      createdById: idea.proposerId,
    })
    .returning();
  const [competitor] = await db
    .insert(competitors)
    .values({ validationId, name: "Bongbong's", sortOrder: 0 })
    .returning();
  const [assumption] = await db
    .insert(assumptions)
    .values({ validationId, statement: "Offices order monthly", sortOrder: 0 })
    .returning();
  const [risk] = await db
    .insert(risks)
    .values({ validationId, statement: "Supplier raises prices" })
    .returning();
  const [cost] = await db
    .insert(costItems)
    .values({
      validationId,
      category: "monthly_fixed",
      name: "Rent",
      sortOrder: 0,
    })
    .returning();
  if (!log || !competitor || !assumption || !risk || !cost) {
    throw new Error("list rows were not made");
  }
  return { validationId, log, competitor, assumption, risk, cost };
}

/** A Proceed idea of the row's workspace with one plan, made straight in the database. */
async function newPlan(team: Team) {
  const { idea } = await newIdea(team);
  await fixtures.createDecision(idea, team.callers.owner.id);
  const plan = await fixtures.createPlan(idea.id, team.callers.owner.id);
  return { idea, plan };
}

/** The caller's own self-analysis, made straight in the database as S1 GET would. */
const ownSelfAnalysis = (caller: Person) =>
  fixtures.createSelfAnalysis(caller.id);

const ROWS: Row[] = [
  {
    api: "Z1",
    routes: { "GET /api/health": "open" },
    call: (caller) => request("GET", "/api/health", caller),
    expected: everyone(200),
  },
  {
    api: "Z2",
    routes: { "GET /api/health/db": "open" },
    call: (caller) => request("GET", "/api/health/db", caller),
    expected: everyone(200),
  },
  {
    api: "Z3 (staging only)",
    routes: {
      "GET /api/docs": "open",
      "GET /api/docs/json": "open",
      "GET /api/docs/swagger-ui.css": "open",
      "GET /api/docs/swagger-ui-bundle.js": "open",
      "GET /api/docs/start.js": "open",
    },
    app: "staging",
    call: (caller) => request("GET", "/api/docs/json", caller),
    expected: everyone(200),
  },
  {
    api: "A1",
    routes: { "POST /api/auth/*": "open" },
    call: (caller) =>
      request("POST", "/api/auth/sign-in/email", caller, {
        email: caller.email,
        password: TEST_PASSWORD,
      }),
    expected: everyone(200),
  },
  {
    api: "A2",
    routes: { "POST /api/auth/*": "open" },
    app: "google",
    call: (caller) =>
      request("POST", "/api/auth/sign-in/social", caller, {
        provider: "google",
        callbackURL: "/",
      }),
    expected: everyone(200),
  },
  {
    api: "A3",
    routes: { "GET /api/auth/*": "open" },
    app: "google",
    // Google's answer cannot be had here; an unknown state still reaches the handler,
    // which sends the browser back to the login screen.
    call: (caller) =>
      request(
        "GET",
        "/api/auth/callback/google?code=code&state=forged",
        caller,
      ),
    expected: everyone(302),
  },
  {
    api: "A4",
    routes: { "POST /api/auth/*": "open" },
    call: (caller) => request("POST", "/api/auth/sign-out", caller, {}),
    expected: signedInOnly(200),
  },
  {
    api: "A5",
    routes: { "GET /api/auth/*": "open" },
    call: (caller) => request("GET", "/api/auth/get-session", caller),
    expected: signedInOnly(200),
  },
  {
    api: "A6",
    routes: { "POST /api/auth/*": "open" },
    call: (caller) =>
      request("POST", "/api/auth/request-password-reset", caller, {
        email: caller.email,
        redirectTo: "/reset-password",
      }),
    expected: everyone(200),
  },
  {
    api: "A7",
    routes: { "POST /api/auth/*": "open" },
    async call(caller) {
      const token = crypto.randomUUID();
      await db.insert(verifications).values({
        identifier: `reset-password:${token}`,
        value: caller.id,
        expiresAt: new Date(Date.now() + 60_000),
      });
      return request("POST", "/api/auth/reset-password", caller, {
        token,
        newPassword: "another long password",
      });
    },
    expected: everyone(200),
  },
  {
    api: "A8",
    routes: { "POST /api/auth/*": "open" },
    call: (caller) =>
      request("POST", "/api/auth/change-password", caller, {
        currentPassword: TEST_PASSWORD,
        newPassword: "another long password",
      }),
    expected: signedInOnly(200),
  },
  {
    api: "U4",
    routes: { "GET /api/v1/invitations/by-token/:token": "open" },
    async call(caller, { workspaceId }) {
      const { token } = await fixtures.createInvitation({
        email: uniqueEmail(),
        workspaceId,
        role: "member",
      });
      return request("GET", `/api/v1/invitations/by-token/${token}`, caller);
    },
    expected: everyone(200),
  },
  {
    api: "U5",
    routes: { "POST /api/v1/invitations/by-token/:token/sign-up": "open" },
    async call(caller, { workspaceId }) {
      const { token } = await fixtures.createInvitation({
        email: uniqueEmail(),
        workspaceId,
        role: "member",
      });
      return request(
        "POST",
        `/api/v1/invitations/by-token/${token}/sign-up`,
        caller,
        {
          displayName: "Newcomer",
          password: "a long password",
          timezone: "Asia/Manila",
        },
      );
    },
    expected: everyone(201),
  },
  {
    api: "U6 (the invitation's own address)",
    routes: { "POST /api/v1/invitations/by-token/:token/accept": "signedIn" },
    async call(caller) {
      const workspace = await fixtures.createWorkspace();
      const { token } = await fixtures.createInvitation({
        email: caller.email,
        workspaceId: workspace.id,
        role: "member",
      });
      return request(
        "POST",
        `/api/v1/invitations/by-token/${token}/accept`,
        caller,
      );
    },
    expected: signedInOnly(200),
  },
  {
    api: "U1",
    routes: { "GET /api/v1/me": "signedIn" },
    call: (caller) => request("GET", "/api/v1/me", caller),
    expected: signedInOnly(200),
  },
  {
    api: "U2",
    routes: { "PATCH /api/v1/me": "signedIn" },
    call: (caller) => request("PATCH", "/api/v1/me", caller, { theme: "dark" }),
    expected: signedInOnly(200),
  },
  {
    api: "U3 PUT",
    routes: { "PUT /api/v1/me/avatar": "signedIn" },
    call: async (caller) =>
      request("PUT", "/api/v1/me/avatar", caller, photoForm(await testPng())),
    expected: signedInOnly(200),
  },
  {
    api: "U3 DELETE",
    routes: { "DELETE /api/v1/me/avatar": "signedIn" },
    call: (caller) => request("DELETE", "/api/v1/me/avatar", caller),
    expected: signedInOnly(204),
  },
  {
    // The Viewer and the Member go first, so the Owner is left alone and may go too.
    api: "U7",
    routes: { "POST /api/v1/me/delete": "signedIn" },
    call: (caller) =>
      request("POST", "/api/v1/me/delete", caller, {
        confirmEmail: caller.email,
        password: TEST_PASSWORD,
      }),
    expected: signedInOnly(204),
  },
  {
    api: "U8 (an account without a password)",
    routes: { "POST /api/v1/me/password": "signedIn" },
    async call(caller) {
      await db
        .update(accounts)
        .set({ password: null })
        .where(eq(accounts.userId, caller.id));
      return request("POST", "/api/v1/me/password", caller, {
        newPassword: "a brand new password",
      });
    },
    expected: signedInOnly(204),
  },
  {
    api: "U9 (local only)",
    routes: { "GET /api/avatars/:name": "open" },
    async call(caller) {
      const url = await testApp.avatars.save(newAvatarName(), await testPng());
      return request("GET", url, caller);
    },
    expected: everyone(200),
  },
  {
    api: "W0",
    routes: { "POST /api/v1/workspaces": "signedIn" },
    call: (caller) =>
      request("POST", "/api/v1/workspaces", caller, { name: "Side project" }),
    expected: signedInOnly(201),
  },
  {
    api: "W1 GET",
    routes: { "GET /api/v1/workspaces/:workspaceId": "scoped" },
    call: (caller, { workspaceId }) =>
      request("GET", `/api/v1/workspaces/${workspaceId}`, caller),
    expected: members(200, 200, 200),
  },
  {
    api: "W1 PATCH",
    routes: { "PATCH /api/v1/workspaces/:workspaceId": "scoped" },
    call: (caller, { workspaceId }) =>
      request("PATCH", `/api/v1/workspaces/${workspaceId}`, caller, {
        name: `Renamed by ${caller.id}`,
      }),
    expected: members(403, 403, 200),
  },
  {
    api: "W2",
    routes: { "GET /api/v1/workspaces/:workspaceId/members": "scoped" },
    call: (caller, { workspaceId }) =>
      request("GET", `/api/v1/workspaces/${workspaceId}/members`, caller),
    expected: members(200, 200, 200),
  },
  {
    api: "W3 PATCH",
    routes: {
      "PATCH /api/v1/workspaces/:workspaceId/members/:userId": "scoped",
    },
    async call(caller, { workspaceId }) {
      const target = await newMember(workspaceId);
      return request(
        "PATCH",
        `/api/v1/workspaces/${workspaceId}/members/${target.id}`,
        caller,
        { role: "viewer" },
      );
    },
    expected: members(403, 403, 200),
  },
  {
    api: "W3 DELETE (another member)",
    routes: {
      "DELETE /api/v1/workspaces/:workspaceId/members/:userId": "scoped",
    },
    async call(caller, { workspaceId }) {
      const target = await newMember(workspaceId);
      return request(
        "DELETE",
        `/api/v1/workspaces/${workspaceId}/members/${target.id}`,
        caller,
      );
    },
    expected: members(403, 403, 204),
  },
  {
    api: "W3 DELETE (leaving; the Owner is the last)",
    routes: {
      "DELETE /api/v1/workspaces/:workspaceId/members/:userId": "scoped",
    },
    call: (caller, { workspaceId }) =>
      request("DELETE", `/api/v1/workspaces/${workspaceId}/members/me`, caller),
    expected: members(204, 204, 409),
  },
  {
    api: "W4 GET",
    routes: { "GET /api/v1/workspaces/:workspaceId/invitations": "scoped" },
    call: (caller, { workspaceId }) =>
      request("GET", `/api/v1/workspaces/${workspaceId}/invitations`, caller),
    expected: members(403, 403, 200),
  },
  {
    api: "W4 POST",
    routes: { "POST /api/v1/workspaces/:workspaceId/invitations": "scoped" },
    call: (caller, { workspaceId }) =>
      request("POST", `/api/v1/workspaces/${workspaceId}/invitations`, caller, {
        email: uniqueEmail("invitee"),
        role: "member",
      }),
    expected: members(403, 403, 201),
  },
  {
    api: "W5",
    routes: { "POST /api/v1/invitations/:invitationId/resend": "located" },
    async call(caller, { workspaceId }) {
      const invitation = await fixtures.createInvitation({
        email: uniqueEmail("invitee"),
        workspaceId,
        role: "member",
      });
      return request(
        "POST",
        `/api/v1/invitations/${invitation.id}/resend`,
        caller,
      );
    },
    expected: { ...members(403, 403, 200), admin: 200 },
  },
  {
    api: "W7",
    routes: { "DELETE /api/v1/invitations/:invitationId": "located" },
    async call(caller, { workspaceId }) {
      const invitation = await fixtures.createInvitation({
        email: uniqueEmail("invitee"),
        workspaceId,
        role: "member",
      });
      return request("DELETE", `/api/v1/invitations/${invitation.id}`, caller);
    },
    expected: { ...members(403, 403, 204), admin: 204 },
  },
  {
    api: "W8",
    routes: {
      "GET /api/v1/workspaces/:workspaceId/mention-candidates": "scoped",
    },
    call: (caller, { workspaceId }) =>
      request(
        "GET",
        `/api/v1/workspaces/${workspaceId}/mention-candidates?targetType=idea&targetId=${crypto.randomUUID()}`,
        caller,
      ),
    expected: members(200, 200, 200),
  },
  {
    api: "W8 (a shared self-analysis)",
    routes: {
      "GET /api/v1/workspaces/:workspaceId/mention-candidates": "scoped",
    },
    async call(caller, { workspaceId }) {
      const author = await newMember(workspaceId);
      const analysis = await fixtures.createSelfAnalysis(author.id, [
        workspaceId,
      ]);
      return request(
        "GET",
        `/api/v1/workspaces/${workspaceId}/mention-candidates?targetType=self_analysis_answer&targetId=${analysis.id}&targetKey=SA.WHY.1`,
        caller,
      );
    },
    expected: members(403, 200, 200),
  },
  {
    api: "D1",
    routes: {
      "GET /api/v1/workspaces/:workspaceId/dashboard/ideas": "scoped",
    },
    call: (caller, { workspaceId }) =>
      request(
        "GET",
        `/api/v1/workspaces/${workspaceId}/dashboard/ideas`,
        caller,
      ),
    expected: members(200, 200, 200),
  },
  {
    api: "D2",
    routes: {
      "GET /api/v1/workspaces/:workspaceId/dashboard/self-analyses": "scoped",
    },
    call: (caller, { workspaceId }) =>
      request(
        "GET",
        `/api/v1/workspaces/${workspaceId}/dashboard/self-analyses`,
        caller,
      ),
    expected: members(403, 200, 200),
  },
  {
    api: "D3",
    routes: {
      "GET /api/v1/workspaces/:workspaceId/dashboard/due-soon": "scoped",
    },
    call: (caller, { workspaceId }) =>
      request(
        "GET",
        `/api/v1/workspaces/${workspaceId}/dashboard/due-soon`,
        caller,
      ),
    expected: members(200, 200, 200),
  },
  {
    api: "D4",
    routes: {
      "GET /api/v1/workspaces/:workspaceId/dashboard/activity": "scoped",
    },
    call: (caller, { workspaceId }) =>
      request(
        "GET",
        `/api/v1/workspaces/${workspaceId}/dashboard/activity`,
        caller,
      ),
    expected: members(200, 200, 200),
  },
  {
    api: "I1 GET",
    routes: { "GET /api/v1/workspaces/:workspaceId/ideas": "scoped" },
    call: (caller, { workspaceId }) =>
      request("GET", `/api/v1/workspaces/${workspaceId}/ideas`, caller),
    expected: members(200, 200, 200),
  },
  {
    api: "I1 POST",
    routes: { "POST /api/v1/workspaces/:workspaceId/ideas": "scoped" },
    async call(caller, { workspaceId }) {
      // Made on the latest published validation template, which must exist.
      await fixtures.templateVersion("validation");
      return request(
        "POST",
        `/api/v1/workspaces/${workspaceId}/ideas`,
        caller,
        {
          name: "Idea",
          oneLineConcept: "Worth checking",
        },
      );
    },
    expected: members(403, 201, 201),
  },
  {
    api: "I2 GET",
    routes: { "GET /api/v1/ideas/:ideaId": "scoped" },
    async call(caller, team) {
      const { idea } = await newIdea(team);
      return request("GET", `/api/v1/ideas/${idea.id}`, caller);
    },
    expected: members(200, 200, 200),
  },
  {
    api: "I2 PATCH",
    routes: { "PATCH /api/v1/ideas/:ideaId": "scoped" },
    async call(caller, team) {
      const { idea } = await newIdea(team);
      return request("PATCH", `/api/v1/ideas/${idea.id}`, caller, {
        name: "Renamed",
        lockVersion: 0,
      });
    },
    expected: members(403, 200, 200),
  },
  {
    api: "I3",
    routes: { "POST /api/v1/ideas/:ideaId/duplicate": "scoped" },
    async call(caller, team) {
      const { idea } = await newIdea(team);
      return request("POST", `/api/v1/ideas/${idea.id}/duplicate`, caller, {});
    },
    expected: members(403, 201, 201),
  },
  {
    api: "I4 archive",
    routes: { "POST /api/v1/ideas/:ideaId/archive": "scoped" },
    async call(caller, team) {
      const { idea } = await newIdea(team);
      return request("POST", `/api/v1/ideas/${idea.id}/archive`, caller);
    },
    expected: members(403, 200, 200),
  },
  {
    api: "I4 restore",
    routes: { "POST /api/v1/ideas/:ideaId/restore": "scoped" },
    async call(caller, team) {
      const { idea } = await newIdea(team, { archivedAt: new Date() });
      return request("POST", `/api/v1/ideas/${idea.id}/restore`, caller);
    },
    expected: members(403, 200, 200),
  },
  {
    api: "V1",
    routes: { "GET /api/v1/ideas/:ideaId/validation": "scoped" },
    async call(caller, team) {
      const { idea } = await newIdea(team);
      return request("GET", `/api/v1/ideas/${idea.id}/validation`, caller);
    },
    expected: members(200, 200, 200),
  },
  {
    api: "V2",
    routes: {
      "GET /api/v1/validations/:validationId/questions/:sectionKey": "scoped",
    },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "GET",
        `/api/v1/validations/${validation.id}/questions/01`,
        caller,
      );
    },
    expected: members(200, 200, 200),
  },
  {
    api: "V3",
    routes: {
      "PUT /api/v1/validations/:validationId/answers/:questionKey": "scoped",
    },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "PUT",
        `/api/v1/validations/${validation.id}/answers/V.01.WHO`,
        caller,
        { text: "Office workers", lockVersion: 0 },
      );
    },
    expected: members(403, 200, 200),
  },
  {
    api: "V4",
    routes: { "POST /api/v1/validations/:validationId/evidence": "scoped" },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "POST",
        `/api/v1/validations/${validation.id}/evidence`,
        caller,
        {
          target: {
            type: "validation_answer",
            id: validation.id,
            key: "V.01.WHO",
          },
          url: "https://example.com/source",
          lockVersion: 0,
        },
      );
    },
    expected: members(403, 201, 201),
  },
  {
    api: "V5",
    routes: { "DELETE /api/v1/evidence/:evidenceId": "scoped" },
    async call(caller, team) {
      const { idea, validation } = await newIdea(team);
      await db.insert(validationAnswers).values({
        validationId: validation.id,
        questionKey: "V.01.WHO",
        text: "Office workers",
        lockVersion: 1,
      });
      const [link] = await db
        .insert(evidenceLinks)
        .values({
          workspaceId: idea.workspaceId,
          validationId: validation.id,
          targetType: "validation_answer",
          targetId: validation.id,
          targetKey: "V.01.WHO",
          url: "https://example.com/source",
          createdById: idea.proposerId,
        })
        .returning();
      return request(
        "DELETE",
        `/api/v1/evidence/${link?.id}?lockVersion=1`,
        caller,
      );
    },
    expected: members(403, 200, 200),
  },
  {
    api: "V6 GET",
    routes: {
      "GET /api/v1/validations/:validationId/research-log": "scoped",
    },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "GET",
        `/api/v1/validations/${validation.id}/research-log`,
        caller,
      );
    },
    expected: members(200, 200, 200),
  },
  {
    api: "V6 POST",
    routes: {
      "POST /api/v1/validations/:validationId/research-log": "scoped",
    },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "POST",
        `/api/v1/validations/${validation.id}/research-log`,
        caller,
        { topic: "Price check" },
      );
    },
    expected: members(403, 201, 201),
  },
  {
    api: "V7 GET",
    routes: { "GET /api/v1/research-log/:entryId": "scoped" },
    async call(caller, team) {
      const { log } = await newListRows(team);
      return request("GET", `/api/v1/research-log/${log.id}`, caller);
    },
    expected: members(200, 200, 200),
  },
  {
    api: "V7 PATCH",
    routes: { "PATCH /api/v1/research-log/:entryId": "scoped" },
    async call(caller, team) {
      const { log } = await newListRows(team);
      return request("PATCH", `/api/v1/research-log/${log.id}`, caller, {
        topic: "Price check, Lacson St.",
        lockVersion: 0,
      });
    },
    expected: members(403, 200, 200),
  },
  {
    api: "V7 DELETE",
    routes: { "DELETE /api/v1/research-log/:entryId": "scoped" },
    async call(caller, team) {
      const { log } = await newListRows(team);
      return request("DELETE", `/api/v1/research-log/${log.id}`, caller);
    },
    expected: members(403, 200, 200),
  },
  {
    api: "V8 GET",
    routes: {
      "GET /api/v1/validations/:validationId/competitors": "scoped",
    },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "GET",
        `/api/v1/validations/${validation.id}/competitors`,
        caller,
      );
    },
    expected: members(200, 200, 200),
  },
  {
    api: "V8 POST",
    routes: {
      "POST /api/v1/validations/:validationId/competitors": "scoped",
    },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "POST",
        `/api/v1/validations/${validation.id}/competitors`,
        caller,
        { name: "Bongbong's" },
      );
    },
    expected: members(403, 201, 201),
  },
  {
    api: "V9 PATCH",
    routes: { "PATCH /api/v1/competitors/:competitorId": "scoped" },
    async call(caller, team) {
      const { competitor } = await newListRows(team);
      return request("PATCH", `/api/v1/competitors/${competitor.id}`, caller, {
        typicalPrice: 380,
        lockVersion: 0,
      });
    },
    expected: members(403, 200, 200),
  },
  {
    api: "V9 DELETE",
    routes: { "DELETE /api/v1/competitors/:competitorId": "scoped" },
    async call(caller, team) {
      const { competitor } = await newListRows(team);
      return request("DELETE", `/api/v1/competitors/${competitor.id}`, caller);
    },
    expected: members(403, 204, 204),
  },
  {
    api: "V10 GET assumptions",
    routes: {
      "GET /api/v1/validations/:validationId/assumptions": "scoped",
    },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "GET",
        `/api/v1/validations/${validation.id}/assumptions`,
        caller,
      );
    },
    expected: members(200, 200, 200),
  },
  {
    api: "V10 POST assumptions",
    routes: {
      "POST /api/v1/validations/:validationId/assumptions": "scoped",
    },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "POST",
        `/api/v1/validations/${validation.id}/assumptions`,
        caller,
        { statement: "Offices order monthly" },
      );
    },
    expected: members(403, 201, 201),
  },
  {
    api: "V10 GET risks",
    routes: { "GET /api/v1/validations/:validationId/risks": "scoped" },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "GET",
        `/api/v1/validations/${validation.id}/risks`,
        caller,
      );
    },
    expected: members(200, 200, 200),
  },
  {
    api: "V10 POST risks",
    routes: { "POST /api/v1/validations/:validationId/risks": "scoped" },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "POST",
        `/api/v1/validations/${validation.id}/risks`,
        caller,
        { statement: "Supplier raises prices" },
      );
    },
    expected: members(403, 201, 201),
  },
  {
    api: "V11 PATCH assumptions",
    routes: { "PATCH /api/v1/assumptions/:id": "scoped" },
    async call(caller, team) {
      const { assumption } = await newListRows(team);
      return request("PATCH", `/api/v1/assumptions/${assumption.id}`, caller, {
        confidence: "medium",
        lockVersion: 0,
      });
    },
    expected: members(403, 200, 200),
  },
  {
    api: "V11 DELETE assumptions",
    routes: { "DELETE /api/v1/assumptions/:id": "scoped" },
    async call(caller, team) {
      const { assumption } = await newListRows(team);
      return request("DELETE", `/api/v1/assumptions/${assumption.id}`, caller);
    },
    expected: members(403, 204, 204),
  },
  {
    api: "V11 PATCH risks",
    routes: { "PATCH /api/v1/risks/:id": "scoped" },
    async call(caller, team) {
      const { risk } = await newListRows(team);
      return request("PATCH", `/api/v1/risks/${risk.id}`, caller, {
        impact: "high",
        lockVersion: 0,
      });
    },
    expected: members(403, 200, 200),
  },
  {
    api: "V11 DELETE risks",
    routes: { "DELETE /api/v1/risks/:id": "scoped" },
    async call(caller, team) {
      const { risk } = await newListRows(team);
      return request("DELETE", `/api/v1/risks/${risk.id}`, caller);
    },
    expected: members(403, 204, 204),
  },
  {
    api: "V12",
    routes: { "GET /api/v1/validations/:validationId/costs": "scoped" },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "GET",
        `/api/v1/validations/${validation.id}/costs`,
        caller,
      );
    },
    expected: members(200, 200, 200),
  },
  {
    api: "V13",
    routes: {
      "POST /api/v1/validations/:validationId/cost-items": "scoped",
    },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "POST",
        `/api/v1/validations/${validation.id}/cost-items`,
        caller,
        { category: "initial", name: "" },
      );
    },
    expected: members(403, 201, 201),
  },
  {
    api: "V14 PATCH",
    routes: { "PATCH /api/v1/cost-items/:costItemId": "scoped" },
    async call(caller, team) {
      const { cost } = await newListRows(team);
      return request("PATCH", `/api/v1/cost-items/${cost.id}`, caller, {
        amount: 15_000,
        lockVersion: 0,
      });
    },
    expected: members(403, 200, 200),
  },
  {
    api: "V14 DELETE",
    routes: { "DELETE /api/v1/cost-items/:costItemId": "scoped" },
    async call(caller, team) {
      const { cost } = await newListRows(team);
      return request("DELETE", `/api/v1/cost-items/${cost.id}`, caller);
    },
    expected: members(403, 204, 204),
  },
  {
    api: "V15",
    routes: { "GET /api/v1/validations/:validationId/economics": "scoped" },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "GET",
        `/api/v1/validations/${validation.id}/economics`,
        caller,
      );
    },
    expected: members(200, 200, 200),
  },
  {
    api: "V16",
    routes: {
      "PUT /api/v1/validations/:validationId/economics/:fieldKey": "scoped",
    },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request(
        "PUT",
        `/api/v1/validations/${validation.id}/economics/selling_price`,
        caller,
        { value: 450, lockVersion: 0 },
      );
    },
    expected: members(403, 200, 200),
  },
  ...(["competitors", "assumptions", "risks", "cost-items"] as const).map(
    (list): Row => ({
      api: `V17 ${list}`,
      routes: {
        [`PUT /api/v1/validations/:validationId/${list}/order`]: "scoped",
      },
      async call(caller, team) {
        const rows = await newListRows(team);
        const id = {
          competitors: rows.competitor.id,
          assumptions: rows.assumption.id,
          risks: rows.risk.id,
          "cost-items": rows.cost.id,
        }[list];
        return request(
          "PUT",
          `/api/v1/validations/${rows.validationId}/${list}/order`,
          caller,
          list === "cost-items"
            ? { ids: [id], category: "monthly_fixed" }
            : { ids: [id] },
        );
      },
      expected: members(403, 204, 204),
    }),
  ),
  {
    api: "V18",
    routes: { "GET /api/v1/ideas/:ideaId/decision-context": "scoped" },
    async call(caller, team) {
      const { idea } = await newIdea(team);
      return request(
        "GET",
        `/api/v1/ideas/${idea.id}/decision-context`,
        caller,
      );
    },
    expected: members(403, 200, 200),
  },
  {
    api: "V19",
    routes: { "POST /api/v1/ideas/:ideaId/decisions": "scoped" },
    async call(caller, team) {
      const { idea } = await newIdea(team);
      return request("POST", `/api/v1/ideas/${idea.id}/decisions`, caller, {
        value: "hold",
        reason: "Permits are unclear",
        basedOnDecisionId: null,
      });
    },
    expected: members(403, 201, 201),
  },
  {
    api: "S1 GET",
    routes: { "GET /api/v1/me/self-analysis": "signedIn" },
    async call(caller) {
      await fixtures.selfAnalysisVersion();
      return request("GET", "/api/v1/me/self-analysis", caller);
    },
    expected: signedInOnly(200),
  },
  {
    api: "S1 PATCH",
    routes: { "PATCH /api/v1/me/self-analysis": "signedIn" },
    async call(caller) {
      await ownSelfAnalysis(caller);
      return request("PATCH", "/api/v1/me/self-analysis", caller, {
        currency: "USD",
      });
    },
    expected: signedInOnly(200),
  },
  {
    api: "S2",
    routes: {
      "GET /api/v1/me/self-analysis/sections/:sectionKey": "signedIn",
    },
    async call(caller) {
      await ownSelfAnalysis(caller);
      return request("GET", "/api/v1/me/self-analysis/sections/WHY", caller);
    },
    expected: signedInOnly(200),
  },
  {
    api: "S3",
    routes: {
      "PUT /api/v1/me/self-analysis/answers/:questionKey": "signedIn",
    },
    async call(caller) {
      await ownSelfAnalysis(caller);
      return request(
        "PUT",
        "/api/v1/me/self-analysis/answers/SA.WHY.1",
        caller,
        { text: "To stay", lockVersion: 0 },
      );
    },
    expected: signedInOnly(200),
  },
  {
    api: "S4 complete",
    routes: { "POST /api/v1/me/self-analysis/complete": "signedIn" },
    async call(caller) {
      await ownSelfAnalysis(caller);
      return request("POST", "/api/v1/me/self-analysis/complete", caller, {
        confirmEmpty: true,
      });
    },
    expected: signedInOnly(200),
  },
  {
    api: "S4 reopen",
    routes: { "POST /api/v1/me/self-analysis/reopen": "signedIn" },
    async call(caller) {
      await ownSelfAnalysis(caller);
      return request("POST", "/api/v1/me/self-analysis/reopen", caller);
    },
    expected: signedInOnly(200),
  },
  {
    api: "S5",
    routes: { "PUT /api/v1/me/self-analysis/shares": "signedIn" },
    async call(caller) {
      await ownSelfAnalysis(caller);
      return request("PUT", "/api/v1/me/self-analysis/shares", caller, {
        workspaceIds: [],
      });
    },
    expected: signedInOnly(200),
  },
  {
    api: "S6",
    routes: { "GET /api/v1/workspaces/:workspaceId/self-analyses": "scoped" },
    call: (caller, { workspaceId }) =>
      request("GET", `/api/v1/workspaces/${workspaceId}/self-analyses`, caller),
    expected: members(403, 200, 200),
  },
  {
    api: "S7 (shared with the workspace)",
    routes: {
      "GET /api/v1/workspaces/:workspaceId/self-analyses/:userId": "scoped",
    },
    async call(caller, { workspaceId }) {
      const author = await newMember(workspaceId);
      await fixtures.createSelfAnalysis(author.id, [workspaceId]);
      return request(
        "GET",
        `/api/v1/workspaces/${workspaceId}/self-analyses/${author.id}`,
        caller,
      );
    },
    expected: members(403, 200, 200),
  },
  {
    api: "P1 GET",
    routes: { "GET /api/v1/ideas/:ideaId/plans": "scoped" },
    async call(caller, team) {
      const { idea } = await newPlan(team);
      return request("GET", `/api/v1/ideas/${idea.id}/plans`, caller);
    },
    expected: members(200, 200, 200),
  },
  {
    api: "P1 POST",
    routes: { "POST /api/v1/ideas/:ideaId/plans": "scoped" },
    async call(caller, team) {
      const { idea } = await newIdea(team);
      await fixtures.createDecision(idea, team.callers.owner.id);
      await fixtures.templateVersion("business_plan");
      return request("POST", `/api/v1/ideas/${idea.id}/plans`, caller, {
        name: "Plan A",
      });
    },
    expected: members(403, 201, 201),
  },
  {
    api: "P2 GET",
    routes: { "GET /api/v1/plans/:planId": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      return request("GET", `/api/v1/plans/${plan.id}`, caller);
    },
    expected: members(200, 200, 200),
  },
  {
    api: "P2 PATCH",
    routes: { "PATCH /api/v1/plans/:planId": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      return request("PATCH", `/api/v1/plans/${plan.id}`, caller, {
        businessName: "Piaya Co.",
        lockVersion: 0,
      });
    },
    expected: members(403, 200, 200),
  },
  ...(["archive", "restore"] as const).map(
    (action): Row => ({
      api: `P3 ${action}`,
      routes: { [`POST /api/v1/plans/:planId/${action}`]: "scoped" },
      async call(caller, team) {
        const { plan } = await newPlan(team);
        return request("POST", `/api/v1/plans/${plan.id}/${action}`, caller);
      },
      expected: members(403, 200, 200),
    }),
  ),
  {
    api: "P4",
    routes: { "GET /api/v1/plans/:planId/items/:itemNo": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      return request("GET", `/api/v1/plans/${plan.id}/items/1`, caller);
    },
    expected: members(200, 200, 200),
  },
  {
    api: "P5",
    routes: { "PUT /api/v1/plans/:planId/answers/:questionKey": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      return request("PUT", `/api/v1/plans/${plan.id}/answers/P.01.5`, caller, {
        text: "Boxes sold to offices",
        lockVersion: 0,
      });
    },
    expected: members(403, 200, 200),
  },
  {
    api: "P6 GET",
    routes: { "GET /api/v1/plans/:planId/versions": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      return request("GET", `/api/v1/plans/${plan.id}/versions`, caller);
    },
    expected: members(200, 200, 200),
  },
  {
    api: "P6 POST",
    routes: { "POST /api/v1/plans/:planId/versions": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      return request("POST", `/api/v1/plans/${plan.id}/versions`, caller, {
        name: "v1 For advisors",
      });
    },
    expected: members(403, 201, 201),
  },
  {
    api: "P7",
    routes: { "GET /api/v1/plans/:planId/go-no-go-context": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      return request(
        "GET",
        `/api/v1/plans/${plan.id}/go-no-go-context`,
        caller,
      );
    },
    expected: members(403, 200, 200),
  },
  {
    api: "P8",
    routes: { "POST /api/v1/plans/:planId/go-no-go": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      return request("POST", `/api/v1/plans/${plan.id}/go-no-go`, caller, {
        value: "delay",
        reason: "Waiting for the pilot",
      });
    },
    expected: members(403, 201, 201),
  },
  {
    api: "P9 GET",
    routes: { "GET /api/v1/plans/:planId/execution-items": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      return request("GET", `/api/v1/plans/${plan.id}/execution-items`, caller);
    },
    expected: members(200, 200, 200),
  },
  {
    api: "P9 POST",
    routes: { "POST /api/v1/plans/:planId/execution-items": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      return request(
        "POST",
        `/api/v1/plans/${plan.id}/execution-items`,
        caller,
        { type: "next_action", title: "Call the supplier" },
      );
    },
    expected: members(403, 201, 201),
  },
  {
    api: "P10 PATCH",
    routes: { "PATCH /api/v1/execution-items/:itemId": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      const item = await fixtures.createExecutionItem(plan.id);
      return request("PATCH", `/api/v1/execution-items/${item.id}`, caller, {
        status: "doing",
        lockVersion: 0,
      });
    },
    expected: members(403, 200, 200),
  },
  {
    api: "P10 DELETE",
    routes: { "DELETE /api/v1/execution-items/:itemId": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      const item = await fixtures.createExecutionItem(plan.id);
      return request("DELETE", `/api/v1/execution-items/${item.id}`, caller);
    },
    expected: members(403, 204, 204),
  },
  {
    api: "P11",
    routes: { "PUT /api/v1/plans/:planId/execution-items/order": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      const item = await fixtures.createExecutionItem(plan.id, {
        type: "milestone",
      });
      return request(
        "PUT",
        `/api/v1/plans/${plan.id}/execution-items/order`,
        caller,
        { type: "milestone", ids: [item.id] },
      );
    },
    expected: members(403, 204, 204),
  },
  {
    api: "P12",
    routes: { "GET /api/v1/plans/:planId/pitch-deck": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      return request(
        "GET",
        `/api/v1/plans/${plan.id}/pitch-deck?variant=one`,
        caller,
      );
    },
    expected: members(200, 200, 200),
  },
  {
    api: "P13",
    routes: { "GET /api/v1/plans/:planId/pitch-deck.pdf": "scoped" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      return request(
        "GET",
        `/api/v1/plans/${plan.id}/pitch-deck.pdf?variant=one`,
        caller,
      );
    },
    expected: members(200, 200, 200),
  },
  ...(["export", "import/context"] as const).flatMap((path): Row[] => {
    const api = path === "export" ? "X1" : "X2";
    const param = path === "export" ? "source" : "target";
    const routes = { [`GET /api/v1/ai/${path}`]: "located" as const };
    return [
      {
        api: `${api} validation`,
        routes,
        async call(caller, team) {
          const { validation } = await newIdea(team);
          return request(
            "GET",
            `/api/v1/ai/${path}?${param}=validation&id=${validation.id}`,
            caller,
          );
        },
        expected: members(403, 200, 200),
      },
      {
        api: `${api} plan`,
        routes,
        async call(caller, team) {
          const { plan } = await newPlan(team);
          return request(
            "GET",
            `/api/v1/ai/${path}?${param}=business_plan&id=${plan.id}`,
            caller,
          );
        },
        expected: members(403, 200, 200),
      },
      {
        api: `${api} self-analysis`,
        routes,
        async call(caller) {
          await ownSelfAnalysis(caller);
          return request(
            "GET",
            `/api/v1/ai/${path}?${param}=self_analysis`,
            caller,
          );
        },
        expected: signedInOnly(200),
      },
    ];
  }),
  {
    api: "X3 validation",
    routes: { "POST /api/v1/ai/import/apply": "located" },
    async call(caller, team) {
      const { validation } = await newIdea(team);
      return request("POST", "/api/v1/ai/import/apply", caller, {
        target: { type: "validation", id: validation.id },
        changes: [
          { questionKey: "V.01.WHO", text: "Offices", baseLockVersion: 0 },
        ],
      });
    },
    expected: members(403, 200, 200),
  },
  {
    api: "X3 plan",
    routes: { "POST /api/v1/ai/import/apply": "located" },
    async call(caller, team) {
      const { plan } = await newPlan(team);
      return request("POST", "/api/v1/ai/import/apply", caller, {
        target: { type: "business_plan", id: plan.id },
        changes: [
          { questionKey: "P.01.5", text: "Offices", baseLockVersion: 0 },
        ],
      });
    },
    expected: members(403, 200, 200),
  },
  {
    api: "X3 self-analysis",
    routes: { "POST /api/v1/ai/import/apply": "located" },
    async call(caller) {
      await ownSelfAnalysis(caller);
      return request("POST", "/api/v1/ai/import/apply", caller, {
        target: { type: "self_analysis" },
        changes: [
          { questionKey: "SA.WHY.1", text: "To stay", baseLockVersion: 0 },
        ],
      });
    },
    expected: signedInOnly(200),
  },
];

const testApp = buildTestApp(database);
const apps = {
  default: testApp.app,
  google: buildTestApp(database, { config: { google: GOOGLE } }).app,
  staging: buildTestApp(database, {
    config: { appEnv: "staging", avatarBucket: "test-moonx-staging-avatars" },
  }).app,
};

describe("SDD 7.1 authorization matrix", () => {
  for (const row of ROWS) {
    test(row.api, async () => {
      const app = apps[row.app ?? "default"];
      const team = await people(app);
      const statuses: Partial<Record<CallerName, number>> = {};
      for (const name of CALLERS) {
        const response = await app.handle(
          await row.call(team.callers[name], team),
        );
        statuses[name] = response.status;
      }
      expect(statuses).toEqual(row.expected);
    });
  }

  test("holds an operator inside a workspace to their role there (Admin column)", async () => {
    const app = apps.default;
    const cases = (role: Role, statuses: Record<string, number>) =>
      Object.entries(statuses).map(
        ([key, status]) => [key, role, status] as const,
      );
    const workspaceCalls: Record<
      string,
      (caller: Person, workspaceId: string) => Request
    > = {
      "W1 GET": (caller, id) =>
        request("GET", `/api/v1/workspaces/${id}`, caller),
      "W1 PATCH": (caller, id) =>
        request("PATCH", `/api/v1/workspaces/${id}`, caller, {
          currency: "USD",
        }),
      W2: (caller, id) =>
        request("GET", `/api/v1/workspaces/${id}/members`, caller),
      "W4 GET": (caller, id) =>
        request("GET", `/api/v1/workspaces/${id}/invitations`, caller),
      W8: (caller, id) =>
        request(
          "GET",
          `/api/v1/workspaces/${id}/mention-candidates?targetType=idea&targetId=${crypto.randomUUID()}`,
          caller,
        ),
    };
    for (const [key, role, expected] of [
      ...cases("viewer", {
        "W1 GET": 200,
        "W1 PATCH": 403,
        W2: 200,
        "W4 GET": 403,
        W8: 200,
      }),
      ...cases("owner", { "W1 PATCH": 200, "W4 GET": 200 }),
    ]) {
      const team = await fixtures.createTeam();
      await fixtures.addMember(team.workspace.id, team.admin.id, role);
      const admin: Person = {
        id: team.admin.id,
        email: team.admin.email,
        cookie: await signIn(app, team.admin.email, uniqueIp()),
      };
      const call = workspaceCalls[key];
      if (call === undefined) throw new Error(`No call for ${key}`);
      const response = await app.handle(call(admin, team.workspace.id));
      expect({ key, role, status: response.status }).toEqual({
        key,
        role,
        status: expected,
      });
    }
  });

  test("covers every route of the API, declared as the table expects", () => {
    const covered = new Map<string, AccessKind>();
    for (const row of ROWS) {
      for (const [route, kind] of Object.entries(row.routes)) {
        covered.set(route, kind);
      }
    }
    const declared = new Map([
      ...accessDeclarations(apps.default),
      ...accessDeclarations(apps.staging),
    ]);

    expect([...declared.keys()].sort()).toEqual([...covered.keys()].sort());
    for (const [route, kinds] of declared) {
      expect({ route, kinds: kinds as (AccessKind | undefined)[] }).toEqual({
        route,
        kinds: [covered.get(route)],
      });
    }
  });
});
