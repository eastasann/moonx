import { afterAll, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ideas, sessions, users } from "@moonx/db";
import { errorBodySchema } from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import {
  AccessDeclarationError,
  accessDeclarations,
  assertAccessDeclared,
  type Caller,
  type ScopeLocator,
} from "./access";
import type { Scope } from "./scope";
import {
  accessLine,
  buildTestAccess,
  buildTestApp,
  connectTestDatabase,
  uniqueIp,
} from "./test-app";
import { signIn, testFixtures } from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
const access = buildTestAccess(database);
const DAY_MS = 24 * 60 * 60 * 1000;

/** What each test route saw, keyed by the request's `X-Test-Id` header. */
const seen = new Map<string, { caller: Caller; scope?: Scope | null }>();
const record = (
  request: Request,
  value: { caller: Caller; scope?: Scope | null },
) => {
  seen.set(request.headers.get("x-test-id") ?? "", value);
  return { ok: true };
};

const ideaInBody: ScopeLocator = ({ body }) => ({
  ideaId: (body as { ideaId: string }).ideaId,
});
const ideaOrNothingInBody: ScopeLocator = ({ body }) => {
  const { ideaId } = body as { ideaId: string | null };
  return ideaId === null ? null : { ideaId };
};

// Routes over the plugin, added to the whole app so the entry plugin shapes their
// errors and Better Auth signs in for them.
const routes = new Elysia()
  .use(access)
  .get("/api/v1/test/open", () => ({ ok: true }), { open: true })
  .post(
    "/api/v1/test/signed-in",
    ({ request, caller }) => record(request, { caller }),
    { signedIn: true, body: z.object({ name: z.string() }).nullable() },
  )
  .get(
    "/api/v1/test/operator",
    ({ request, caller }) => record(request, { caller }),
    {
      operator: true,
    },
  )
  .get(
    "/api/v1/test/workspaces/:workspaceId",
    ({ request, caller, scope }) => record(request, { caller, scope }),
    { scoped: { to: "workspaceId", need: "read" } },
  )
  .post(
    "/api/v1/test/workspaces/:workspaceId/settings",
    ({ request, caller, scope }) => record(request, { caller, scope }),
    { scoped: { to: "workspaceId", need: "owner" } },
  )
  .post(
    "/api/v1/test/ideas/:ideaId/edit",
    ({ request, caller, scope }) => record(request, { caller, scope }),
    { scoped: { to: "ideaId", need: "writeUnarchived" } },
  )
  .post(
    "/api/v1/test/ideas/:ideaId/comment",
    ({ request, caller, scope }) => record(request, { caller, scope }),
    { scoped: { to: "ideaId", need: "comment" } },
  )
  .post(
    "/api/v1/test/plans/:planId/comment",
    ({ request, caller, scope }) => record(request, { caller, scope }),
    { scoped: { to: "planId", need: "comment" } },
  )
  .post(
    "/api/v1/test/ideas/:ideaId/archive",
    ({ request, caller, scope }) => record(request, { caller, scope }),
    { scoped: { to: "ideaId", need: "write" } },
  )
  .get(
    "/api/v1/test/validations/:validationId",
    ({ request, caller, scope }) => record(request, { caller, scope }),
    { scoped: { to: "validationId", need: "read" } },
  )
  .post(
    "/api/v1/test/validations/:validationId/edit",
    ({ request, caller, scope }) => record(request, { caller, scope }),
    { scoped: { to: "validationId", need: "writeUnarchived" } },
  )
  .post(
    "/api/v1/test/plans/:planId/edit",
    ({ request, caller, scope }) => record(request, { caller, scope }),
    { scoped: { to: "planId", need: "writeUnarchived" } },
  )
  .post(
    "/api/v1/test/plans/:planId/archive",
    ({ request, caller, scope }) => record(request, { caller, scope }),
    { scoped: { to: "planId", need: "writeIdeaUnarchived" } },
  )
  .post(
    "/api/v1/test/by-body",
    ({ request, caller, scope }) => record(request, { caller, scope }),
    {
      scoped: { to: ideaInBody, need: "read" },
      body: z.object({ ideaId: z.string() }),
    },
  )
  .post(
    "/api/v1/test/located",
    ({ request, caller, scope }) => record(request, { caller, scope }),
    {
      located: { to: ideaOrNothingInBody, need: "writeUnarchived" },
      body: z.object({ ideaId: z.string().nullable() }),
    },
  );

const { app, lines } = buildTestApp(database);
app.use(routes);

interface CallOptions {
  cookie?: string;
  body?: unknown;
}

/** Calls a test route and returns the response with what the handler saw, if it ran. */
async function call(
  method: "GET" | "POST",
  path: string,
  options: CallOptions = {},
) {
  const id = crypto.randomUUID();
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        "x-forwarded-for": uniqueIp(),
        "x-test-id": id,
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
        ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
      },
      body:
        method === "POST"
          ? JSON.stringify(options.body === undefined ? null : options.body)
          : undefined,
    }),
  );
  return { response, handled: seen.get(id) };
}

async function errorCode(response: Response) {
  return errorBodySchema.parse(await response.json()).error.code;
}

const session = (email: string) => signIn(app, email, uniqueIp());

describe("declarations (ADR-005)", () => {
  for (const appEnv of ["test", "staging"] as const) {
    test(`every route of the ${appEnv} app declares exactly one way of access`, () => {
      const { app: built } = buildTestApp(database, { config: { appEnv } });
      const declared = accessDeclarations(built);

      expect(declared.size).toBeGreaterThan(0);
      for (const [route, kinds] of declared) {
        expect({ route, kinds: kinds.length }).toEqual({ route, kinds: 1 });
      }
    });
  }

  test("refuses an app with a route that declares nothing", () => {
    const undeclared = new Elysia()
      .use(access)
      .get("/api/v1/declared", () => "ok", { signedIn: true })
      .get("/api/v1/undeclared", () => "oops");

    expect(() => assertAccessDeclared(undeclared)).toThrow(
      AccessDeclarationError,
    );
    expect(() => assertAccessDeclared(undeclared)).toThrow(
      "GET /api/v1/undeclared (none)",
    );
  });

  test("refuses a route that declares two ways", () => {
    const twice = new Elysia()
      .use(access)
      .get("/api/v1/twice", () => "ok", { open: true, signedIn: true });

    expect(() => assertAccessDeclared(twice)).toThrow(
      "GET /api/v1/twice (open, signedIn)",
    );
  });

  test("names each route's way of access", () => {
    expect(accessDeclarations(routes)).toEqual(
      new Map([
        ["GET /api/v1/test/open", ["open"]],
        ["POST /api/v1/test/signed-in", ["signedIn"]],
        ["GET /api/v1/test/operator", ["operator"]],
        ["GET /api/v1/test/workspaces/:workspaceId", ["scoped"]],
        ["POST /api/v1/test/workspaces/:workspaceId/settings", ["scoped"]],
        ["POST /api/v1/test/ideas/:ideaId/edit", ["scoped"]],
        ["POST /api/v1/test/ideas/:ideaId/comment", ["scoped"]],
        ["POST /api/v1/test/plans/:planId/comment", ["scoped"]],
        ["POST /api/v1/test/ideas/:ideaId/archive", ["scoped"]],
        ["GET /api/v1/test/validations/:validationId", ["scoped"]],
        ["POST /api/v1/test/validations/:validationId/edit", ["scoped"]],
        ["POST /api/v1/test/plans/:planId/edit", ["scoped"]],
        ["POST /api/v1/test/plans/:planId/archive", ["scoped"]],
        ["POST /api/v1/test/by-body", ["scoped"]],
        ["POST /api/v1/test/located", ["located"]],
      ]),
    );
  });
});

describe("the API refuses to start with an undeclared route", () => {
  test("exits with one JSON log line naming the route", async () => {
    // Loads index.ts with app.ts changed to add an undeclared route before its check.
    const preload = join(tmpdir(), `undeclared-${crypto.randomUUID()}.ts`);
    await Bun.write(
      preload,
      `import { plugin } from "bun";
const marker = "  assertAccessDeclared(app);";
plugin({
  name: "undeclared route",
  setup(build) {
    build.onLoad({ filter: /apps\\/api\\/src\\/app\\.ts$/ }, async ({ path }) => {
      const source = await Bun.file(path).text();
      if (!source.includes(marker)) throw new Error("app.ts no longer has the check");
      return {
        loader: "ts",
        contents: source.replace(marker, '  app.get("/api/v1/undeclared", () => "oops");\\n' + marker),
      };
    });
  },
});
`,
    );
    try {
      const child = Bun.spawn(
        ["bun", "--preload", preload, `${import.meta.dir}/index.ts`],
        {
          // Outside the repository, so Bun cannot pick up the root .env.
          cwd: tmpdir(),
          env: {
            PATH: process.env.PATH ?? "",
            APP_ENV: "local",
            PORT: "1",
            DATABASE_URL: "postgres://nobody@127.0.0.1:1/none",
            BETTER_AUTH_SECRET: "x".repeat(32),
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      expect(await child.exited).toBe(1);
      const errors = (await new Response(child.stderr).text()).trim();
      expect(errors.split("\n")).toHaveLength(1);
      expect(JSON.parse(errors)).toEqual({
        severity: "ERROR",
        message: expect.stringContaining("GET /api/v1/undeclared (none)"),
      });
    } finally {
      await Bun.file(preload).delete();
    }
  }, 10_000);
});

describe("open", () => {
  test("answers without a session", async () => {
    const { response } = await call("GET", "/api/v1/test/open");

    expect(response.status).toBe(200);
  });
});

describe("signedIn", () => {
  test("answers 401 UNAUTHENTICATED without a session, before checking the body", async () => {
    const { response, handled } = await call("POST", "/api/v1/test/signed-in", {
      body: { name: 42 },
    });

    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("UNAUTHENTICATED");
    expect(handled).toBeUndefined();
  });

  test("checks the body once signed in", async () => {
    const user = await fixtures.createUser();
    const cookie = await session(user.email);

    const { response } = await call("POST", "/api/v1/test/signed-in", {
      cookie,
      body: { name: 42 },
    });

    expect(response.status).toBe(422);
  });

  test("hands the caller to the handler and logs its id", async () => {
    const user = await fixtures.createUser();
    const cookie = await session(user.email);

    const { response, handled } = await call("POST", "/api/v1/test/signed-in", {
      cookie,
      body: { name: "ok" },
    });

    expect(response.status).toBe(200);
    expect(handled?.caller).toEqual({
      id: user.id,
      email: user.email,
      isAdmin: false,
      session: { id: expect.any(String), createdAt: expect.any(Date) },
    });
    expect(await accessLine(lines, response)).toMatchObject({
      userId: user.id,
    });
  });

  test("answers 401 to a forged or unknown session cookie", async () => {
    const { response } = await call("POST", "/api/v1/test/signed-in", {
      cookie: "moonx.session_token=forged.signature",
      body: { name: "ok" },
    });

    expect(response.status).toBe(401);
  });

  for (const status of ["suspended", "deleted"] as const) {
    test(`answers 401 to a ${status} user whose session is still there`, async () => {
      const user = await fixtures.createUser();
      const cookie = await session(user.email);
      await db.update(users).set({ status }).where(eq(users.id, user.id));

      const { response, handled } = await call(
        "POST",
        "/api/v1/test/signed-in",
        { cookie, body: { name: "ok" } },
      );

      expect(response.status).toBe(401);
      expect(await errorCode(response)).toBe("UNAUTHENTICATED");
      expect(handled).toBeUndefined();
    });
  }

  test("answers 401 to an expired session and clears its cookie", async () => {
    const user = await fixtures.createUser();
    const cookie = await session(user.email);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, user.id));

    const { response } = await call("POST", "/api/v1/test/signed-in", {
      cookie,
      body: { name: "ok" },
    });

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toContainEqual(
      expect.stringMatching(/^moonx\.session_token=;.*Max-Age=0/),
    );
  });

  test("renews a day-old session and carries its cookie on (SDD 5.4「セッション」)", async () => {
    const user = await fixtures.createUser();
    const cookie = await session(user.email);
    // Made two days ago: older than the day after which Better Auth renews it.
    const old = new Date(Date.now() + 28 * DAY_MS);
    await db
      .update(sessions)
      .set({ expiresAt: old })
      .where(eq(sessions.userId, user.id));

    const { response } = await call("POST", "/api/v1/test/signed-in", {
      cookie,
      body: { name: "ok" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toContainEqual(
      expect.stringMatching(/^moonx\.session_token=[^;]+;.*Max-Age=2592000/),
    );
    const [renewed] = await db
      .select({ expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(renewed?.expiresAt.getTime()).toBeGreaterThan(old.getTime());
  });

  test("moves users.last_active_at through Better Auth's hook (SDD 5.13)", async () => {
    const user = await fixtures.createUser();
    const cookie = await session(user.email);
    const stale = new Date(Date.now() - DAY_MS);
    await db
      .update(users)
      .set({ lastActiveAt: stale })
      .where(eq(users.id, user.id));

    await call("POST", "/api/v1/test/signed-in", {
      cookie,
      body: { name: "ok" },
    });

    const [row] = await db
      .select({ lastActiveAt: users.lastActiveAt })
      .from(users)
      .where(eq(users.id, user.id));
    expect(row?.lastActiveAt?.getTime()).toBeGreaterThan(stale.getTime());
  });
});

describe("operator", () => {
  test("lets an operator in", async () => {
    const admin = await fixtures.createUser({ isAdmin: true });
    const { response, handled } = await call("GET", "/api/v1/test/operator", {
      cookie: await session(admin.email),
    });

    expect(response.status).toBe(200);
    expect(handled?.caller.isAdmin).toBe(true);
  });

  test("answers 403 FORBIDDEN to anyone else, and 401 without a session", async () => {
    const user = await fixtures.createUser();
    const refused = await call("GET", "/api/v1/test/operator", {
      cookie: await session(user.email),
    });
    expect(refused.response.status).toBe(403);
    expect(await errorCode(refused.response)).toBe("FORBIDDEN");

    const anonymous = await call("GET", "/api/v1/test/operator");
    expect(anonymous.response.status).toBe(401);
  });
});

describe("scoped (SDD 7.1)", () => {
  async function team() {
    const people = await fixtures.createTeam();
    const { idea, validation } = await fixtures.createIdea(
      people.workspace.id,
      people.member.id,
    );
    const plan = await fixtures.createPlan(idea.id, people.member.id);
    const cookies = {
      owner: await session(people.owner.email),
      member: await session(people.member.email),
      viewer: await session(people.viewer.email),
      admin: await session(people.admin.email),
    };
    return { ...people, idea, validation, plan, cookies };
  }

  test("checks each role against what the route needs", async () => {
    const t = await team();
    const ws = `/api/v1/test/workspaces/${t.workspace.id}`;
    const cases: [
      string,
      "GET" | "POST",
      string,
      keyof typeof t.cookies,
      number,
    ][] = [
      ["read", "GET", ws, "viewer", 200],
      ["read", "GET", ws, "member", 200],
      ["read", "GET", ws, "owner", 200],
      ["read", "GET", ws, "admin", 403],
      ["owner", "POST", `${ws}/settings`, "viewer", 403],
      ["owner", "POST", `${ws}/settings`, "member", 403],
      ["owner", "POST", `${ws}/settings`, "owner", 200],
      ["write", "POST", `/api/v1/test/ideas/${t.idea.id}/edit`, "viewer", 403],
      ["write", "POST", `/api/v1/test/ideas/${t.idea.id}/edit`, "member", 200],
      ["write", "POST", `/api/v1/test/ideas/${t.idea.id}/edit`, "owner", 200],
      ["write", "POST", `/api/v1/test/ideas/${t.idea.id}/edit`, "admin", 403],
      [
        "comment",
        "POST",
        `/api/v1/test/ideas/${t.idea.id}/comment`,
        "viewer",
        200,
      ],
      [
        "comment",
        "POST",
        `/api/v1/test/ideas/${t.idea.id}/comment`,
        "member",
        200,
      ],
      [
        "comment",
        "POST",
        `/api/v1/test/ideas/${t.idea.id}/comment`,
        "admin",
        403,
      ],
    ];
    for (const [need, method, path, who, status] of cases) {
      const { response } = await call(method, path, { cookie: t.cookies[who] });
      expect({ need, who, status: response.status }).toEqual({
        need,
        who,
        status,
      });
    }

    const { response: viewerWrite } = await call(
      "POST",
      `/api/v1/test/ideas/${t.idea.id}/edit`,
      { cookie: t.cookies.viewer },
    );
    expect(await errorCode(viewerWrite)).toBe("FORBIDDEN");
    const { response: outsider } = await call("GET", ws, {
      cookie: t.cookies.admin,
    });
    expect(await errorCode(outsider)).toBe("NO_ACCESS");
    const { response: anonymous } = await call("GET", ws);
    expect(anonymous.status).toBe(401);
  });

  test("hands the scope to the handler", async () => {
    const t = await team();

    const { handled: fromPlan } = await call(
      "POST",
      `/api/v1/test/plans/${t.plan.id}/edit`,
      { cookie: t.cookies.member },
    );
    const { handled: fromValidation } = await call(
      "GET",
      `/api/v1/test/validations/${t.validation.id}`,
      { cookie: t.cookies.viewer },
    );
    const { handled: fromWorkspace } = await call(
      "GET",
      `/api/v1/test/workspaces/${t.workspace.id}`,
      { cookie: t.cookies.owner },
    );

    expect(fromPlan?.scope).toEqual({
      workspaceId: t.workspace.id,
      role: "member",
      ideaId: t.idea.id,
      planId: t.plan.id,
      ideaArchived: false,
      planArchived: false,
      need: "writeUnarchived",
    });
    expect(fromValidation?.scope).toMatchObject({
      workspaceId: t.workspace.id,
      role: "viewer",
      ideaId: t.idea.id,
      planId: null,
    });
    expect(fromWorkspace?.scope).toMatchObject({
      workspaceId: t.workspace.id,
      role: "owner",
      ideaId: null,
      planId: null,
    });
  });

  test("answers 404 NOT_FOUND for what does not exist, not a UUID, or was undone", async () => {
    const t = await team();
    const { idea: undone } = await fixtures.createIdea(
      t.workspace.id,
      t.member.id,
      { deletedAt: new Date() },
    );
    const planOfUndone = await fixtures.createPlan(undone.id, t.member.id);
    const undonePlan = await fixtures.createPlan(t.idea.id, t.member.id, {
      deletedAt: new Date(),
    });

    for (const path of [
      `/api/v1/test/ideas/${crypto.randomUUID()}/edit`,
      "/api/v1/test/ideas/not-a-uuid/edit",
      `/api/v1/test/ideas/${undone.id}/edit`,
      `/api/v1/test/plans/${planOfUndone.id}/edit`,
      `/api/v1/test/plans/${undonePlan.id}/edit`,
      `/api/v1/test/validations/${crypto.randomUUID()}/edit`,
    ]) {
      const { response } = await call("POST", path, {
        cookie: t.cookies.owner,
      });
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
      expect(await errorCode(response)).toBe("NOT_FOUND");
    }
    const { response } = await call(
      "GET",
      `/api/v1/test/workspaces/${crypto.randomUUID()}`,
      { cookie: t.cookies.owner },
    );
    expect(response.status).toBe(404);
  });

  test("answers 409 ARCHIVED to any member changing an archived idea, Viewers included", async () => {
    const t = await team();
    await db
      .update(ideas)
      .set({ archivedAt: new Date() })
      .where(eq(ideas.id, t.idea.id));

    for (const who of ["owner", "member", "viewer"] as const) {
      for (const path of [
        `/api/v1/test/ideas/${t.idea.id}/edit`,
        `/api/v1/test/ideas/${t.idea.id}/comment`,
        `/api/v1/test/plans/${t.plan.id}/comment`,
        `/api/v1/test/validations/${t.validation.id}/edit`,
        `/api/v1/test/plans/${t.plan.id}/edit`,
        `/api/v1/test/plans/${t.plan.id}/archive`,
      ]) {
        const { response } = await call("POST", path, {
          cookie: t.cookies[who],
        });
        expect({ who, path, status: response.status }).toEqual({
          who,
          path,
          status: 409,
        });
        expect(await errorCode(response)).toBe("ARCHIVED");
      }
    }
    // A non-member learns nothing about the idea.
    const { response: outsider } = await call(
      "POST",
      `/api/v1/test/ideas/${t.idea.id}/edit`,
      { cookie: t.cookies.admin },
    );
    expect(await errorCode(outsider)).toBe("NO_ACCESS");
    const { response: read } = await call(
      "GET",
      `/api/v1/test/validations/${t.validation.id}`,
      { cookie: t.cookies.viewer },
    );
    expect(read.status).toBe(200);
    const { response: restore } = await call(
      "POST",
      `/api/v1/test/ideas/${t.idea.id}/archive`,
      { cookie: t.cookies.member },
    );
    expect(restore.status).toBe(200);
  });

  test("stops changes to an archived plan, but not its own archiving and restoring", async () => {
    const t = await team();
    await fixtures.createPlan(t.idea.id, t.member.id);
    const archived = await fixtures.createPlan(t.idea.id, t.member.id, {
      archivedAt: new Date(),
    });

    for (const [path, who] of [
      [`/api/v1/test/plans/${archived.id}/edit`, "member"],
      [`/api/v1/test/plans/${archived.id}/comment`, "viewer"],
    ] as const) {
      const { response } = await call("POST", path, {
        cookie: t.cookies[who],
      });
      expect(response.status).toBe(409);
      expect(await errorCode(response)).toBe("ARCHIVED");
    }

    const { response: restore } = await call(
      "POST",
      `/api/v1/test/plans/${archived.id}/archive`,
      { cookie: t.cookies.member },
    );
    expect(restore.status).toBe(200);
    const { response: viewerRestore } = await call(
      "POST",
      `/api/v1/test/plans/${archived.id}/archive`,
      { cookie: t.cookies.viewer },
    );
    expect(await errorCode(viewerRestore)).toBe("FORBIDDEN");

    // The idea's own content stays open to change.
    const { response: validation } = await call(
      "POST",
      `/api/v1/test/validations/${t.validation.id}/edit`,
      { cookie: t.cookies.member },
    );
    expect(validation.status).toBe(200);
  });

  test("locates the resource from the checked body", async () => {
    const t = await team();

    const { response, handled } = await call("POST", "/api/v1/test/by-body", {
      cookie: t.cookies.viewer,
      body: { ideaId: t.idea.id },
    });
    expect(response.status).toBe(200);
    expect(handled?.scope).toMatchObject({ ideaId: t.idea.id, role: "viewer" });

    const { response: invalid } = await call("POST", "/api/v1/test/by-body", {
      cookie: t.cookies.viewer,
      body: {},
    });
    expect(invalid.status).toBe(422);
  });
});

describe("located (SDD 7.1)", () => {
  test("gives a null scope to a resource without a workspace", async () => {
    const user = await fixtures.createUser();
    const { response, handled } = await call("POST", "/api/v1/test/located", {
      cookie: await session(user.email),
      body: { ideaId: null },
    });

    expect(response.status).toBe(200);
    expect(handled?.scope).toBeNull();
    expect(handled?.caller.id).toBe(user.id);
  });

  test("checks a resource with a workspace like a scoped route", async () => {
    const people = await fixtures.createTeam();
    const { idea } = await fixtures.createIdea(
      people.workspace.id,
      people.owner.id,
    );

    const member = await call("POST", "/api/v1/test/located", {
      cookie: await session(people.member.email),
      body: { ideaId: idea.id },
    });
    expect(member.response.status).toBe(200);
    expect(member.handled?.scope).toMatchObject({ role: "member" });

    const viewer = await call("POST", "/api/v1/test/located", {
      cookie: await session(people.viewer.email),
      body: { ideaId: idea.id },
    });
    expect(await errorCode(viewer.response)).toBe("FORBIDDEN");

    const outsider = await call("POST", "/api/v1/test/located", {
      cookie: await session(people.admin.email),
      body: { ideaId: idea.id },
    });
    expect(await errorCode(outsider.response)).toBe("NO_ACCESS");

    const missing = await call("POST", "/api/v1/test/located", {
      cookie: await session(people.member.email),
      body: { ideaId: crypto.randomUUID() },
    });
    expect(missing.response.status).toBe(404);
  });
});
