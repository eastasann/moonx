import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, ideaId, userId } from "@moonx/db/seed";
import { and, asc, eq, isNull } from "drizzle-orm";
import { call, login, startTestApp, type TestApp } from "./helpers";

/**
 * The authorization matrix of SDD 7.1, endpoint by endpoint, for every endpoint of Step 6. Each
 * endpoint states the lowest role that may call it; the test then checks that every lower role,
 * a signed-in stranger, an operator who is not a member, and an anonymous caller are refused with
 * the right code, and that the lowest allowed role gets through. Refusals run first, so no
 * success call has changed the data they depend on.
 */

type Min = "read" | "editor" | "owner" | "invitation";

interface Fixture {
  ws: string;
  idea: string;
  validation: string;
  logId: string;
  competitorId: string;
  assumptionId: string;
  riskId: string;
  costItemId: string;
  evidenceId: string;
  invitationId: string;
  removableId: string;
}

interface Endpoint {
  name: string;
  method: string;
  path: (f: Fixture) => string;
  body?: (f: Fixture) => unknown | Promise<unknown>;
  min: Min;
  ok: number;
}

let t: TestApp;
let f: Fixture;
const who: Record<string, Record<string, string>> = {};
const STRANGER = "5b1d0c2e-7a53-4f0e-9a64-3b2f9d1c8e11";
const MISSING = "6f1f3f3a-1111-4111-8111-111111111111";

beforeAll(async () => {
  t = await startTestApp();
  for (const p of ["ana", "kenji", "grace", "admin"] as const) who[p] = await login(t.app, p);
  await t.db.insert(schema.users).values({
    id: STRANGER,
    email: "stranger@elsewhere.example",
    displayName: "Stranger",
  });
  who.stranger = { "x-moonx-dev-user-id": STRANGER };

  const [validation] = await t.db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, ideaId("piaya")));
  const vid = (validation as { id: string }).id;
  const first = async <T>(rows: Promise<T[]>) => (await rows)[0] as T;
  const [log, competitor, assumption, risk, cost, evidence, invitation] = await Promise.all([
    first(
      t.db
        .select({ id: schema.researchLogEntries.id })
        .from(schema.researchLogEntries)
        .where(
          and(
            eq(schema.researchLogEntries.validationId, vid),
            isNull(schema.researchLogEntries.deletedAt),
          ),
        )
        .orderBy(asc(schema.researchLogEntries.createdAt)),
    ),
    first(
      t.db
        .select({ id: schema.competitors.id })
        .from(schema.competitors)
        .where(eq(schema.competitors.validationId, vid))
        .orderBy(asc(schema.competitors.sortOrder)),
    ),
    first(
      t.db
        .select({ id: schema.assumptions.id })
        .from(schema.assumptions)
        .where(eq(schema.assumptions.validationId, vid))
        .orderBy(asc(schema.assumptions.sortOrder)),
    ),
    first(
      t.db
        .select({ id: schema.risks.id })
        .from(schema.risks)
        .where(eq(schema.risks.validationId, vid))
        .orderBy(asc(schema.risks.createdAt)),
    ),
    first(
      t.db
        .select({ id: schema.costItems.id })
        .from(schema.costItems)
        .where(eq(schema.costItems.validationId, vid))
        .orderBy(asc(schema.costItems.sortOrder)),
    ),
    first(
      t.db
        .select({ id: schema.evidenceLinks.id })
        .from(schema.evidenceLinks)
        .where(
          and(eq(schema.evidenceLinks.validationId, vid), isNull(schema.evidenceLinks.deletedAt)),
        ),
    ),
    first(
      t.db
        .select({ id: schema.invitations.id })
        .from(schema.invitations)
        .where(eq(schema.invitations.email, "new.member@bcdx.example")),
    ),
  ]);
  f = {
    ws: BCDX,
    idea: ideaId("piaya"),
    validation: vid,
    logId: log.id,
    competitorId: competitor.id,
    assumptionId: assumption.id,
    riskId: risk.id,
    costItemId: cost.id,
    evidenceId: evidence.id,
    invitationId: invitation.id,
    removableId: userId("paolo"),
  };
});
afterAll(async () => {
  await t.close();
});

const v = (x: Fixture) => `/api/v1/validations/${x.validation}`;
const ids = async (rows: Promise<{ id: string }[]>) => (await rows).map((r) => r.id);

const endpoints: Endpoint[] = [
  {
    name: "W1 GET",
    method: "GET",
    path: (x) => `/api/v1/workspaces/${x.ws}`,
    min: "read",
    ok: 200,
  },
  {
    name: "W2 GET",
    method: "GET",
    path: (x) => `/api/v1/workspaces/${x.ws}/members`,
    min: "read",
    ok: 200,
  },
  {
    name: "W8 GET",
    method: "GET",
    path: (x) => `/api/v1/workspaces/${x.ws}/mention-candidates`,
    min: "read",
    ok: 200,
  },
  {
    name: "D1",
    method: "GET",
    path: (x) => `/api/v1/workspaces/${x.ws}/dashboard/ideas`,
    min: "read",
    ok: 200,
  },
  {
    name: "D2",
    method: "GET",
    path: (x) => `/api/v1/workspaces/${x.ws}/dashboard/self-analyses`,
    min: "editor",
    ok: 200,
  },
  {
    name: "D3",
    method: "GET",
    path: (x) => `/api/v1/workspaces/${x.ws}/dashboard/due-soon`,
    min: "read",
    ok: 200,
  },
  {
    name: "D4",
    method: "GET",
    path: (x) => `/api/v1/workspaces/${x.ws}/dashboard/activity`,
    min: "read",
    ok: 200,
  },
  {
    name: "I1 GET",
    method: "GET",
    path: (x) => `/api/v1/workspaces/${x.ws}/ideas`,
    min: "read",
    ok: 200,
  },
  { name: "I2 GET", method: "GET", path: (x) => `/api/v1/ideas/${x.idea}`, min: "read", ok: 200 },
  {
    name: "V1",
    method: "GET",
    path: (x) => `/api/v1/ideas/${x.idea}/validation`,
    min: "read",
    ok: 200,
  },
  { name: "V2", method: "GET", path: (x) => `${v(x)}/questions/01`, min: "read", ok: 200 },
  { name: "V6 GET", method: "GET", path: (x) => `${v(x)}/research-log`, min: "read", ok: 200 },
  {
    name: "V7 GET",
    method: "GET",
    path: (x) => `/api/v1/research-log/${x.logId}`,
    min: "read",
    ok: 200,
  },
  { name: "V8 GET", method: "GET", path: (x) => `${v(x)}/competitors`, min: "read", ok: 200 },
  {
    name: "V10 GET assumptions",
    method: "GET",
    path: (x) => `${v(x)}/assumptions`,
    min: "read",
    ok: 200,
  },
  { name: "V10 GET risks", method: "GET", path: (x) => `${v(x)}/risks`, min: "read", ok: 200 },
  { name: "V12", method: "GET", path: (x) => `${v(x)}/costs`, min: "read", ok: 200 },
  { name: "V15", method: "GET", path: (x) => `${v(x)}/economics`, min: "read", ok: 200 },

  {
    name: "W1 PATCH",
    method: "PATCH",
    path: (x) => `/api/v1/workspaces/${x.ws}`,
    body: () => ({ name: "BCDX" }),
    min: "owner",
    ok: 200,
  },
  {
    name: "W3 PATCH",
    method: "PATCH",
    path: (x) => `/api/v1/workspaces/${x.ws}/members/${userId("paolo")}`,
    body: () => ({ role: "member" }),
    min: "owner",
    ok: 200,
  },
  {
    name: "W4 GET",
    method: "GET",
    path: (x) => `/api/v1/workspaces/${x.ws}/invitations`,
    min: "owner",
    ok: 200,
  },
  {
    name: "W4 POST",
    method: "POST",
    path: (x) => `/api/v1/workspaces/${x.ws}/invitations`,
    body: () => ({ email: "matrix@example.com", role: "viewer" }),
    min: "owner",
    ok: 201,
  },
  {
    name: "W5",
    method: "POST",
    path: (x) => `/api/v1/invitations/${x.invitationId}/resend`,
    min: "invitation",
    ok: 200,
  },
  {
    name: "W6",
    method: "POST",
    path: (x) => `/api/v1/invitations/${x.invitationId}/link`,
    min: "invitation",
    ok: 200,
  },

  {
    name: "I1 POST",
    method: "POST",
    path: (x) => `/api/v1/workspaces/${x.ws}/ideas`,
    body: () => ({ name: "Matrix idea", oneLineConcept: "Checks the matrix" }),
    min: "editor",
    ok: 201,
  },
  {
    name: "I2 PATCH",
    method: "PATCH",
    path: (x) => `/api/v1/ideas/${x.idea}`,
    body: () => ({ name: "Piaya Gift Box Delivery", lockVersion: 0, force: true }),
    min: "editor",
    ok: 200,
  },
  {
    name: "I3",
    method: "POST",
    path: (x) => `/api/v1/ideas/${x.idea}/duplicate`,
    body: () => ({}),
    min: "editor",
    ok: 201,
  },
  {
    name: "V3",
    method: "PUT",
    path: (x) => `${v(x)}/answers/V.01.WHO`,
    body: () => ({ text: "Office workers", lockVersion: 0, force: true }),
    min: "editor",
    ok: 200,
  },
  {
    name: "V4",
    method: "POST",
    path: (x) => `${v(x)}/evidence`,
    body: async (x) => {
      const [answer] = await t.db
        .select({ lockVersion: schema.validationAnswers.lockVersion })
        .from(schema.validationAnswers)
        .where(
          and(
            eq(schema.validationAnswers.validationId, x.validation),
            eq(schema.validationAnswers.questionKey, "V.01.WHO"),
          ),
        );
      return {
        target: { type: "validation_answer", id: x.validation, key: "V.01.WHO" },
        url: "https://example.com/source",
        lockVersion: answer?.lockVersion ?? 0,
      };
    },
    min: "editor",
    ok: 201,
  },
  {
    name: "V6 POST",
    method: "POST",
    path: (x) => `${v(x)}/research-log`,
    body: () => ({ topic: "Matrix visit" }),
    min: "editor",
    ok: 201,
  },
  {
    name: "V7 PATCH",
    method: "PATCH",
    path: (x) => `/api/v1/research-log/${x.logId}`,
    body: () => ({ topic: "Matrix topic", lockVersion: 0, force: true }),
    min: "editor",
    ok: 200,
  },
  {
    name: "V8 POST",
    method: "POST",
    path: (x) => `${v(x)}/competitors`,
    body: () => ({ name: "Matrix competitor" }),
    min: "editor",
    ok: 201,
  },
  {
    name: "V9 PATCH",
    method: "PATCH",
    path: (x) => `/api/v1/competitors/${x.competitorId}`,
    body: () => ({ name: "Matrix rename", lockVersion: 0, force: true }),
    min: "editor",
    ok: 200,
  },
  {
    name: "V10 POST assumptions",
    method: "POST",
    path: (x) => `${v(x)}/assumptions`,
    body: () => ({ statement: "Matrix assumption" }),
    min: "editor",
    ok: 201,
  },
  {
    name: "V10 POST risks",
    method: "POST",
    path: (x) => `${v(x)}/risks`,
    body: () => ({ statement: "Matrix risk" }),
    min: "editor",
    ok: 201,
  },
  {
    name: "V11 PATCH assumptions",
    method: "PATCH",
    path: (x) => `/api/v1/assumptions/${x.assumptionId}`,
    body: () => ({ statement: "Matrix rename", lockVersion: 0, force: true }),
    min: "editor",
    ok: 200,
  },
  {
    name: "V11 PATCH risks",
    method: "PATCH",
    path: (x) => `/api/v1/risks/${x.riskId}`,
    body: () => ({ statement: "Matrix rename", lockVersion: 0, force: true }),
    min: "editor",
    ok: 200,
  },
  {
    name: "V13",
    method: "POST",
    path: (x) => `${v(x)}/cost-items`,
    body: () => ({ category: "initial", name: "Matrix cost" }),
    min: "editor",
    ok: 201,
  },
  {
    name: "V14 PATCH",
    method: "PATCH",
    path: (x) => `/api/v1/cost-items/${x.costItemId}`,
    body: () => ({ name: "Matrix cost rename", lockVersion: 0, force: true }),
    min: "editor",
    ok: 200,
  },
  {
    name: "V16",
    method: "PUT",
    path: (x) => `${v(x)}/economics/selling_price`,
    body: () => ({ value: 250, lockVersion: 0, force: true }),
    min: "editor",
    ok: 200,
  },
  {
    name: "V17",
    method: "PUT",
    path: (x) => `${v(x)}/competitors/order`,
    body: async (x) => ({
      ids: (
        await ids(
          t.db
            .select({ id: schema.competitors.id })
            .from(schema.competitors)
            .where(
              and(
                eq(schema.competitors.validationId, x.validation),
                isNull(schema.competitors.deletedAt),
              ),
            )
            .orderBy(asc(schema.competitors.sortOrder)),
        )
      ).reverse(),
    }),
    min: "editor",
    ok: 204,
  },
  {
    name: "V18",
    method: "GET",
    path: (x) => `/api/v1/ideas/${x.idea}/decision-context`,
    min: "editor",
    ok: 200,
  },
  {
    name: "V19",
    method: "POST",
    path: (x) => `/api/v1/ideas/${x.idea}/decisions`,
    body: () => ({
      value: "hold",
      reason: "Matrix check",
      basedOnDecisionId: null,
      confirmNewer: true,
    }),
    min: "editor",
    ok: 201,
  },

  // Deleting and archiving come last: they change what the endpoints above operate on.
  {
    name: "V5",
    method: "DELETE",
    path: (x) => `/api/v1/evidence/${x.evidenceId}?lockVersion=0&force=true`,
    min: "editor",
    ok: 200,
  },
  {
    name: "V7 DELETE",
    method: "DELETE",
    path: (x) => `/api/v1/research-log/${x.logId}`,
    min: "editor",
    ok: 200,
  },
  {
    name: "V9 DELETE",
    method: "DELETE",
    path: (x) => `/api/v1/competitors/${x.competitorId}`,
    min: "editor",
    ok: 204,
  },
  {
    name: "V11 DELETE assumptions",
    method: "DELETE",
    path: (x) => `/api/v1/assumptions/${x.assumptionId}`,
    min: "editor",
    ok: 204,
  },
  {
    name: "V11 DELETE risks",
    method: "DELETE",
    path: (x) => `/api/v1/risks/${x.riskId}`,
    min: "editor",
    ok: 204,
  },
  {
    name: "V14 DELETE",
    method: "DELETE",
    path: (x) => `/api/v1/cost-items/${x.costItemId}`,
    min: "editor",
    ok: 204,
  },
  {
    name: "I4 archive",
    method: "POST",
    path: (x) => `/api/v1/ideas/${x.idea}/archive`,
    min: "editor",
    ok: 200,
  },
  {
    name: "I4 restore",
    method: "POST",
    path: (x) => `/api/v1/ideas/${x.idea}/restore`,
    min: "editor",
    ok: 200,
  },
  {
    name: "W3 DELETE",
    method: "DELETE",
    path: (x) => `/api/v1/workspaces/${x.ws}/members/${x.removableId}`,
    min: "owner",
    ok: 204,
  },
  {
    name: "W7",
    method: "DELETE",
    path: (x) => `/api/v1/invitations/${x.invitationId}`,
    min: "invitation",
    ok: 204,
  },
];

const REFUSED_BELOW: Record<Min, string[]> = {
  read: [],
  editor: ["grace"],
  owner: ["grace", "kenji"],
  invitation: ["grace", "kenji", "stranger"],
};
const ALLOWED: Record<Min, string> = {
  read: "grace",
  editor: "kenji",
  owner: "ana",
  invitation: "admin",
};

async function send(e: Endpoint, as: Record<string, string> | undefined) {
  const body = e.body ? await e.body(f) : undefined;
  return call(t.app, e.method, e.path(f), { as, body });
}

describe("SDD 7.1 authorization matrix", () => {
  test("every endpoint is listed once", () => {
    const names = endpoints.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("anonymous callers get 401 everywhere", async () => {
    for (const e of endpoints) {
      const res = await send(e, undefined);
      expect([e.name, res.status, res.body?.error?.code]).toEqual([e.name, 401, "UNAUTHENTICATED"]);
    }
  });

  test("roles below the minimum get 403 FORBIDDEN", async () => {
    for (const e of endpoints) {
      for (const role of REFUSED_BELOW[e.min]) {
        const res = await send(e, who[role]);
        expect([e.name, role, res.status]).toEqual([e.name, role, 403]);
      }
    }
  });

  test("a stranger and an operator who is not a member get 403 NO_ACCESS", async () => {
    for (const e of endpoints) {
      for (const role of ["stranger", "admin"]) {
        if (e.min === "invitation" && role === "admin") continue;
        const res = await send(e, who[role]);
        expect([e.name, role, res.status]).toEqual([e.name, role, 403]);
        if (e.min !== "invitation") expect(res.body.error.code).toBe("NO_ACCESS");
      }
    }
  });

  test("a resource that does not exist is 404 for a member", async () => {
    const res = await call(t.app, "GET", `/api/v1/ideas/${MISSING}`, { as: who.ana });
    expect(res.status).toBe(404);
  });

  test("any signed-in user may create a workspace (W0)", async () => {
    const res = await call(t.app, "POST", "/api/v1/workspaces", {
      as: who.stranger,
      body: { name: "Stranger's team" },
    });
    expect(res.status).toBe(201);
    expect(res.body.myRole).toBe("owner");
  });

  test("the lowest allowed role gets through", async () => {
    for (const e of endpoints) {
      const res = await send(e, who[ALLOWED[e.min]]);
      expect([e.name, res.status, res.body?.error?.code]).toEqual([e.name, e.ok, undefined]);
    }
  });

  test("the Owner of the workspace also reaches the invitation endpoints, an operator does not reach the members", async () => {
    const invite = await call(t.app, "POST", `/api/v1/workspaces/${BCDX}/invitations`, {
      as: who.ana,
      body: { email: "second@example.com", role: "member" },
    });
    expect(invite.status).toBe(201);
    const id = invite.body.invitation.id;
    expect(
      (await call(t.app, "POST", `/api/v1/invitations/${id}/link`, { as: who.ana })).status,
    ).toBe(200);
    expect(
      (await call(t.app, "GET", `/api/v1/workspaces/${BCDX}/members`, { as: who.admin })).status,
    ).toBe(403);
  });
});
