import { eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { type Db, schema } from "../src/client";
import { addAccounts } from "./demo/accounts";
import { addCollaboration, addDecisions, addHistory } from "./demo/activity";
import { addIdeas } from "./demo/ideas";
import { BCDX, personalWorkspaceId, userId } from "./demo/ids";
import { addPlans } from "./demo/plans";
import { piayaExecution, piayaPlanBExecution, studyCafeExecution } from "./demo/plans-content";
import { addSelfAnalyses } from "./demo/self-analyses";
import { World } from "./lib/rows";
import { createClock } from "./lib/time";
import { addTemplates } from "./templates/load";

export type { IdeaKey, IdeaRecord } from "./demo/ideas";
export { ideaId } from "./demo/ideas";
export {
  BCDX,
  DEMO_INVITE_TOKENS,
  DEMO_PASSWORD,
  type PersonKey,
  people,
  personalWorkspaceId,
  userId,
} from "./demo/ids";
export { planId } from "./demo/plans";
export { hashPassword } from "./lib/password";
export { seedTemplates } from "./templates";

/** Everything the demo data is built from, so tests can recompute what the screens would show. */
export async function buildWorld(now: Date = new Date()) {
  const clock = createClock(now);
  const world = new World();
  await addAccounts(world, clock);
  addTemplates(world, clock, userId("admin"));
  addSelfAnalyses(world, clock);
  const ideas = addIdeas(world, clock);
  const plans = addPlans(world, clock, ideas, {
    "piaya-a": piayaExecution,
    "piaya-b": piayaPlanBExecution,
    "study-cafe-a": studyCafeExecution,
  });
  addDecisions(world, clock, ideas, plans);
  addCollaboration(world, clock, ideas, plans);
  addHistory(world, clock, ideas, plans);
  return { world, ideas, plans };
}

const CHUNK = 200;

async function insert(tx: Pick<Db, "insert">, table: PgTable, rows: object[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(table).values(rows.slice(i, i + CHUNK) as never);
  }
}

/**
 * Replaces every row of every table with the demo data of design-spec 8. Ids are derived from
 * names, so a second run gives the same rows and nothing is duplicated. Destructive: callers
 * decide where it may run. Sign-in sessions of people the demo data still contains survive, so
 * reseeding between tests, or while developing, does not log anybody out.
 */
export async function seedDemo(db: Db, now: Date = new Date()) {
  const { world, ideas, plans } = await buildWorld(now);

  await db.transaction(async (tx) => {
    const keptSessions = await tx.select().from(schema.sessions);
    const tables = await tx.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public'`,
    );
    const names = Array.from(tables, (t) => `"public"."${t.tablename}"`).join(", ");
    await tx.execute(sql.raw(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`));

    // users.last_workspace_id and business_plans.created_from_decision_id point forward, so they
    // are filled in after their targets exist.
    await insert(tx, schema.users, world.users);
    await insert(tx, schema.workspaces, world.workspaces);
    await insert(tx, schema.memberships, world.memberships);
    await insert(tx, schema.accounts, world.accounts);
    const demoUserIds = new Set(world.users.map((u) => u.id));
    await insert(
      tx,
      schema.sessions,
      keptSessions.filter((session) => demoUserIds.has(session.userId)),
    );
    await insert(tx, schema.invitations, world.invitations);
    await insert(tx, schema.templates, world.templates);
    await insert(tx, schema.templateVersions, world.templateVersions);
    await insert(tx, schema.templateSections, world.templateSections);
    await insert(tx, schema.templateQuestions, world.templateQuestions);
    await insert(tx, schema.templateCostDefaults, world.templateCostDefaults);
    await insert(tx, schema.templateCheckRules, world.templateCheckRules);
    await insert(tx, schema.templateExecutionPresets, world.templateExecutionPresets);
    await insert(tx, schema.selfAnalyses, world.selfAnalyses);
    await insert(tx, schema.selfAnalysisAnswers, world.selfAnalysisAnswers);
    await insert(tx, schema.selfAnalysisShares, world.selfAnalysisShares);
    await insert(tx, schema.ideas, world.ideas);
    await insert(tx, schema.validations, world.validations);
    await insert(tx, schema.validationAnswers, world.validationAnswers);
    await insert(tx, schema.researchLogEntries, world.researchLogEntries);
    await insert(tx, schema.competitors, world.competitors);
    await insert(tx, schema.assumptions, world.assumptions);
    await insert(tx, schema.risks, world.risks);
    await insert(tx, schema.costItems, world.costItems);
    await insert(tx, schema.economicsInputs, world.economicsInputs);
    await insert(tx, schema.evidenceLinks, world.evidenceLinks);
    await insert(
      tx,
      schema.businessPlans,
      world.businessPlans.map((p) => ({ ...p, createdFromDecisionId: null })),
    );
    await insert(tx, schema.planAnswers, world.planAnswers);
    await insert(tx, schema.planVersions, world.planVersions);
    await insert(tx, schema.executionItems, world.executionItems);
    await insert(tx, schema.decisionLogEntries, world.decisionLogEntries);
    for (const plan of world.businessPlans) {
      if (plan.createdFromDecisionId && plan.id) {
        await tx
          .update(schema.businessPlans)
          .set({ createdFromDecisionId: plan.createdFromDecisionId })
          .where(eq(schema.businessPlans.id, plan.id));
      }
    }
    for (const user of world.users) {
      if (!user.id) continue;
      await tx
        .update(schema.users)
        .set({
          lastWorkspaceId: user.isAdmin ? personalWorkspaceId("admin") : BCDX,
        })
        .where(eq(schema.users.id, user.id));
    }
    await insert(tx, schema.comments, world.comments);
    await insert(tx, schema.commentMentions, world.commentMentions);
    await insert(tx, schema.notifications, world.notifications);
    await insert(tx, schema.changeHistory, world.changeHistory);
  });

  return { ideas, plans, counts: countRows(world) };
}

function countRows(world: World): Record<string, number> {
  return Object.fromEntries(
    Object.entries(world)
      .filter(([, rows]) => Array.isArray(rows))
      .map(([name, rows]) => [name, (rows as unknown[]).length]),
  );
}
