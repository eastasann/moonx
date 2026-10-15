import { afterAll, describe, expect, test } from "bun:test";
import { verifications } from "@moonx/db";
import { type AccessKind, accessDeclarations } from "./access";
import {
  buildTestApp,
  connectTestDatabase,
  testConfig,
  uniqueIp,
} from "./test-app";
import {
  signIn,
  TEST_PASSWORD,
  testFixtures,
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

function request(
  method: "GET" | "POST",
  path: string,
  caller: Person,
  body?: unknown,
) {
  const json = path.startsWith("/api/v1/")
    ? method === "POST"
    : body !== undefined;
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "x-forwarded-for": uniqueIp(),
      origin: ORIGIN,
      ...(json ? { "content-type": "application/json" } : {}),
      ...(caller.cookie === undefined ? {} : { cookie: caller.cookie }),
    },
    body: json ? JSON.stringify(body ?? null) : undefined,
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

interface Row {
  /** The API numbers of SDD 5.3. */
  api: string;
  /** The routes the row covers, as the router names them, and how they declare access. */
  routes: Record<string, AccessKind>;
  /** The app to call: the default, Google configured, or staging. */
  app?: "google" | "staging";
  call(caller: Person, workspaceId: string): Promise<Request> | Request;
  expected: Record<CallerName, number>;
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
    async call(caller, workspaceId) {
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
    async call(caller, workspaceId) {
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
];

const apps = {
  default: buildTestApp(database).app,
  google: buildTestApp(database, { config: { google: GOOGLE } }).app,
  staging: buildTestApp(database, { config: { appEnv: "staging" } }).app,
};

describe("SDD 7.1 authorization matrix", () => {
  for (const row of ROWS) {
    test(row.api, async () => {
      const app = apps[row.app ?? "default"];
      const { workspaceId, callers } = await people(app);
      const statuses: Partial<Record<CallerName, number>> = {};
      for (const name of CALLERS) {
        const response = await app.handle(
          await row.call(callers[name], workspaceId),
        );
        statuses[name] = response.status;
      }
      expect(statuses).toEqual(row.expected);
    });
  }

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
