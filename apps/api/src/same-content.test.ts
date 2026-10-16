import { afterAll, describe, expect, test } from "bun:test";
import {
  assumptions,
  businessPlans,
  changeHistory,
  competitors,
  costItems,
  economicsInputs,
  executionItems,
  ideas,
  planAnswers,
  researchLogEntries,
  risks,
  selfAnalyses,
  selfAnalysisAnswers,
  validationAnswers,
} from "@moonx/db";
import { type ErrorCode, errorBodySchema } from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { buildTestApp, connectTestDatabase } from "./test-app";
import { apiRequest, teamWithNewIdea, testFixtures } from "./test-fixtures";

// SDD 5.1「同時編集」: a save whose content equals the stored item's passes whatever
// lockVersion it claims, with no version raised and no history written, on every API
// that updates an item under the optimistic lock. The same stale version with other
// content is refused, so the version sent is one the lock checks. V4 and V5 always
// attach or remove evidence, so no save of theirs leaves the item as it was.

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
const { app } = buildTestApp(database);

type Team = Awaited<ReturnType<typeof teamWithNewIdea>>;

/** Which of three contents a save sends. */
type Content = 1 | 2 | 3;

/** An item under the optimistic lock, which the team's Member saves. */
interface Item {
  save(content: Content, lockVersion: number): Promise<Response>;
  /** The stored version. */
  version(): Promise<number>;
}

interface Case {
  api: string;
  /**
   * A keyed item (an answer, a number), made by its first save at version 1. A save
   * claiming version 0 lost the race to make it (SDD 5.1).
   */
  keyed: boolean;
  /** The code of a stale save of other content. */
  conflict?: ErrorCode;
  item(team: Team): Promise<Item>;
}

const text = (content: Content) => `Content ${content}`;

const send = (
  team: Team,
  method: "PUT" | "PATCH" | "POST",
  path: string,
  body: Record<string, unknown>,
) => app.handle(apiRequest(method, path, { cookie: team.memberCookie, body }));

/** A row the Member makes through its list's POST, at version 0. */
async function created(team: Team, path: string, body: unknown) {
  const response = await app.handle(
    apiRequest("POST", path, { cookie: team.memberCookie, body }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

const versionOf = async (rows: Promise<{ lockVersion: number }[]>) =>
  (await rows)[0]?.lockVersion ?? 0;

const planOf = async (team: Team) =>
  fixtures.createPlan(team.idea.id, team.owner.id);

/** The Member's self-analysis, which S1 makes. */
async function selfAnalysisOf(team: Team) {
  await fixtures.selfAnalysisVersion();
  const home = await app.handle(
    apiRequest("GET", "/api/v1/me/self-analysis", {
      cookie: team.memberCookie,
    }),
  );
  expect(home.status).toBe(200);
  const [analysis] = await db
    .select({ id: selfAnalyses.id })
    .from(selfAnalyses)
    .where(eq(selfAnalyses.userId, team.member.id));
  if (analysis === undefined) throw new Error("No self-analysis");
  return analysis.id;
}

const validationAnswerVersion = (validationId: string, key: string) =>
  versionOf(
    db
      .select({ lockVersion: validationAnswers.lockVersion })
      .from(validationAnswers)
      .where(
        and(
          eq(validationAnswers.validationId, validationId),
          eq(validationAnswers.questionKey, key),
        ),
      ),
  );

const selfAnalysisAnswerVersion = (selfAnalysisId: string, key: string) =>
  versionOf(
    db
      .select({ lockVersion: selfAnalysisAnswers.lockVersion })
      .from(selfAnalysisAnswers)
      .where(
        and(
          eq(selfAnalysisAnswers.selfAnalysisId, selfAnalysisId),
          eq(selfAnalysisAnswers.questionKey, key),
        ),
      ),
  );

const planAnswerVersion = (planId: string, key: string) =>
  versionOf(
    db
      .select({ lockVersion: planAnswers.lockVersion })
      .from(planAnswers)
      .where(
        and(
          eq(planAnswers.businessPlanId, planId),
          eq(planAnswers.questionKey, key),
        ),
      ),
  );

/** X3 of one answer of `target`, as 25 sends it. */
const imported = (
  team: Team,
  target: { type: string; id?: string },
  questionKey: string,
) => ({
  save: (content: Content, lockVersion: number) =>
    send(team, "POST", "/api/v1/ai/import/apply", {
      target,
      changes: [
        { questionKey, text: text(content), baseLockVersion: lockVersion },
      ],
    }),
});

const CASES: Case[] = [
  {
    api: "I2 PATCH",
    keyed: false,
    async item(team) {
      const id = team.idea.id;
      return {
        save: (content, lockVersion) =>
          send(team, "PATCH", `/api/v1/ideas/${id}`, {
            name: text(content),
            lockVersion,
          }),
        version: () =>
          versionOf(
            db
              .select({ lockVersion: ideas.lockVersion })
              .from(ideas)
              .where(eq(ideas.id, id)),
          ),
      };
    },
  },
  {
    api: "V3",
    keyed: true,
    async item(team) {
      const path = `/api/v1/validations/${team.validationId}/answers/V.01.WHO`;
      return {
        save: (content, lockVersion) =>
          send(team, "PUT", path, { text: text(content), lockVersion }),
        version: () => validationAnswerVersion(team.validationId, "V.01.WHO"),
      };
    },
  },
  {
    api: "V7 PATCH",
    keyed: false,
    async item(team) {
      const id = await created(
        team,
        `/api/v1/validations/${team.validationId}/research-log`,
        { topic: "Price check" },
      );
      return {
        save: (content, lockVersion) =>
          send(team, "PATCH", `/api/v1/research-log/${id}`, {
            topic: text(content),
            lockVersion,
          }),
        version: () =>
          versionOf(
            db
              .select({ lockVersion: researchLogEntries.lockVersion })
              .from(researchLogEntries)
              .where(eq(researchLogEntries.id, id)),
          ),
      };
    },
  },
  {
    api: "V9 PATCH",
    keyed: false,
    async item(team) {
      const id = await created(
        team,
        `/api/v1/validations/${team.validationId}/competitors`,
        { name: "Rival" },
      );
      return {
        save: (content, lockVersion) =>
          send(team, "PATCH", `/api/v1/competitors/${id}`, {
            name: text(content),
            lockVersion,
          }),
        version: () =>
          versionOf(
            db
              .select({ lockVersion: competitors.lockVersion })
              .from(competitors)
              .where(eq(competitors.id, id)),
          ),
      };
    },
  },
  {
    api: "V11 PATCH (an assumption)",
    keyed: false,
    async item(team) {
      const id = await created(
        team,
        `/api/v1/validations/${team.validationId}/assumptions`,
        { statement: "Offices order monthly" },
      );
      return {
        save: (content, lockVersion) =>
          send(team, "PATCH", `/api/v1/assumptions/${id}`, {
            statement: text(content),
            lockVersion,
          }),
        version: () =>
          versionOf(
            db
              .select({ lockVersion: assumptions.lockVersion })
              .from(assumptions)
              .where(eq(assumptions.id, id)),
          ),
      };
    },
  },
  {
    api: "V11 PATCH (a risk)",
    keyed: false,
    async item(team) {
      const id = await created(
        team,
        `/api/v1/validations/${team.validationId}/risks`,
        { statement: "Supplier raises prices" },
      );
      return {
        save: (content, lockVersion) =>
          send(team, "PATCH", `/api/v1/risks/${id}`, {
            statement: text(content),
            lockVersion,
          }),
        version: () =>
          versionOf(
            db
              .select({ lockVersion: risks.lockVersion })
              .from(risks)
              .where(eq(risks.id, id)),
          ),
      };
    },
  },
  {
    api: "V14 PATCH",
    keyed: false,
    async item(team) {
      // A starting row I1 made.
      const [row] = await db
        .select({ id: costItems.id })
        .from(costItems)
        .where(eq(costItems.validationId, team.validationId))
        .limit(1);
      if (row === undefined) throw new Error("No cost row");
      return {
        save: (content, lockVersion) =>
          send(team, "PATCH", `/api/v1/cost-items/${row.id}`, {
            name: text(content),
            lockVersion,
          }),
        version: () =>
          versionOf(
            db
              .select({ lockVersion: costItems.lockVersion })
              .from(costItems)
              .where(eq(costItems.id, row.id)),
          ),
      };
    },
  },
  {
    api: "V16",
    keyed: true,
    async item(team) {
      return {
        save: (content, lockVersion) =>
          send(
            team,
            "PUT",
            `/api/v1/validations/${team.validationId}/economics/selling_price`,
            { value: 100 * content, lockVersion },
          ),
        version: () =>
          versionOf(
            db
              .select({ lockVersion: economicsInputs.lockVersion })
              .from(economicsInputs)
              .where(
                and(
                  eq(economicsInputs.validationId, team.validationId),
                  eq(economicsInputs.fieldKey, "selling_price"),
                ),
              ),
          ),
      };
    },
  },
  {
    api: "S3",
    keyed: true,
    async item(team) {
      const id = await selfAnalysisOf(team);
      return {
        save: (content, lockVersion) =>
          send(team, "PUT", "/api/v1/me/self-analysis/answers/SA.WHY.1", {
            text: text(content),
            lockVersion,
          }),
        version: () => selfAnalysisAnswerVersion(id, "SA.WHY.1"),
      };
    },
  },
  {
    api: "P2 PATCH",
    keyed: false,
    async item(team) {
      const plan = await planOf(team);
      return {
        save: (content, lockVersion) =>
          send(team, "PATCH", `/api/v1/plans/${plan.id}`, {
            businessName: text(content),
            lockVersion,
          }),
        version: () =>
          versionOf(
            db
              .select({ lockVersion: businessPlans.lockVersion })
              .from(businessPlans)
              .where(eq(businessPlans.id, plan.id)),
          ),
      };
    },
  },
  {
    api: "P5",
    keyed: true,
    async item(team) {
      const plan = await planOf(team);
      return {
        save: (content, lockVersion) =>
          send(team, "PUT", `/api/v1/plans/${plan.id}/answers/P.01.1`, {
            text: text(content),
            lockVersion,
          }),
        version: () => planAnswerVersion(plan.id, "P.01.1"),
      };
    },
  },
  {
    api: "P10 PATCH",
    keyed: false,
    async item(team) {
      const plan = await planOf(team);
      const row = await fixtures.createExecutionItem(plan.id);
      return {
        save: (content, lockVersion) =>
          send(team, "PATCH", `/api/v1/execution-items/${row.id}`, {
            title: text(content),
            lockVersion,
          }),
        version: () =>
          versionOf(
            db
              .select({ lockVersion: executionItems.lockVersion })
              .from(executionItems)
              .where(eq(executionItems.id, row.id)),
          ),
      };
    },
  },
  {
    api: "X3 (a validation)",
    keyed: true,
    conflict: "CONFLICT_MULTI",
    async item(team) {
      return {
        ...imported(
          team,
          { type: "validation", id: team.validationId },
          "V.01.WHO",
        ),
        version: () => validationAnswerVersion(team.validationId, "V.01.WHO"),
      };
    },
  },
  {
    api: "X3 (a self-analysis)",
    keyed: true,
    conflict: "CONFLICT_MULTI",
    async item(team) {
      const id = await selfAnalysisOf(team);
      return {
        ...imported(team, { type: "self_analysis" }, "SA.WHY.1"),
        version: () => selfAnalysisAnswerVersion(id, "SA.WHY.1"),
      };
    },
  },
  {
    api: "X3 (a plan)",
    keyed: true,
    conflict: "CONFLICT_MULTI",
    async item(team) {
      const plan = await planOf(team);
      return {
        ...imported(team, { type: "business_plan", id: plan.id }, "P.01.1"),
        version: () => planAnswerVersion(plan.id, "P.01.1"),
      };
    },
  },
];

const historyBy = (userId: string) =>
  db.$count(changeHistory, eq(changeHistory.changedById, userId));

describe("a save of the stored content with a stale lockVersion (SDD 5.1「同時編集」)", () => {
  for (const row of CASES) {
    test(`${row.api} passes it without a write, and refuses other content`, async () => {
      const team = await teamWithNewIdea(app, fixtures);
      const item = await row.item(team);
      expect((await item.save(1, await item.version())).status).toBe(200);
      // What a client that read the item before the second save holds.
      const read = await item.version();
      expect((await item.save(2, read)).status).toBe(200);
      const stored = await item.version();
      expect(stored).toBe(read + 1);
      const written = await historyBy(team.member.id);

      const stale = row.keyed ? [read, 0] : [read];
      for (const lockVersion of stale) {
        const same = await item.save(2, lockVersion);
        expect({ lockVersion, status: same.status }).toEqual({
          lockVersion,
          status: 200,
        });
      }
      expect(await item.version()).toBe(stored);
      expect(await historyBy(team.member.id)).toBe(written);

      for (const lockVersion of stale) {
        const other = await item.save(3, lockVersion);
        expect({
          lockVersion,
          status: other.status,
          code: errorBodySchema.parse(await other.json()).error.code,
        }).toEqual({
          lockVersion,
          status: 409,
          code: row.conflict ?? "CONFLICT",
        });
      }
      expect(await item.version()).toBe(stored);
    });
  }
});
