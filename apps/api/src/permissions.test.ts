import { afterAll, describe, expect, test } from "bun:test";
import { accounts, verifications } from "@moonx/db";
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

/** A new member of the row's workspace, for a call that changes or removes one. */
async function newMember(workspaceId: string) {
  const user = await fixtures.createUser();
  await fixtures.addMember(workspaceId, user.id, "member");
  return user;
}

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
