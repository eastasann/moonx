import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  changeHistory,
  comments,
  connectDatabase,
  type Database,
  type DatabaseConnection,
  decisionLogEntries,
  type ideas,
  memberships,
  selfAnalyses,
  selfAnalysisShares,
  users,
  validationAnswers,
  workspaces,
} from "@moonx/db";
import {
  prepareTestDatabase,
  quoteIdentifier,
  testDatabaseName,
} from "@moonx/db/test-database";
import type { CheckKey, CheckResult, CheckState, Role } from "@moonx/schemas";
import { SQL } from "bun";
import { testFixtures, uniqueEmail } from "./test-fixtures";

// The KPI counts as kpi.yml takes them (SDD 11章): the real Makefile's kpi with the psql
// on PATH, which must be PostgreSQL 17's (03_dev-setup.md 1章). The rows live in a
// database of this file's own, so the counts see nothing else. Every measure gets a known
// count with its edge cases beside it, and the same table must come out of a read-only
// role made the way 03_dev-setup.md 5.4 E makes moonx_backup_ro.

const repoRoot = join(import.meta.dir, "..", "..", "..");
const TIMEOUT_MS = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Asia/Manila keeps UTC+8 all year.
const MANILA_OFFSET = 8 * HOUR;
// The periods are those of now() when psql runs, so a Manila week or month must not turn
// between placing the rows and the last run: the fixture waits out a turn this close.
const SETTLE_MS = 2 * 60_000;

/** The Manila wall clock at `t`, read with the UTC getters. */
const manila = (t: number) => new Date(t + MANILA_OFFSET);

/** When the Manila week (Monday to Sunday) holding `t` starts. */
function weekStart(t: number): number {
  const local = manila(t);
  const midnight = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  return midnight - ((local.getUTCDay() + 6) % 7) * DAY - MANILA_OFFSET;
}

/** When the Manila month `back` months before the one holding `t` starts. */
function monthStart(t: number, back = 0): number {
  const local = manila(t);
  return (
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - back, 1) -
    MANILA_OFFSET
  );
}

const weekLabel = (t: number) =>
  manila(weekStart(t)).toISOString().slice(0, 10);
const monthLabel = (t: number) => manila(t).toISOString().slice(0, 7);

const sourceUrl = process.env.DATABASE_URL_TEST ?? "";
const kpiUrl = (() => {
  const url = new URL(sourceUrl);
  url.pathname = `/${testDatabaseName(sourceUrl).slice(0, -"_test".length)}_kpi_test`;
  return url.toString();
})();
const reader = {
  role: `kpi_reader_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
  password: crypto.randomUUID().replaceAll("-", ""),
};
const readerUrl = (() => {
  const url = new URL(kpiUrl);
  url.username = reader.role;
  url.password = reader.password;
  return url.toString();
})();

type Row = [kpi: string, period: string, measure: string, count: number];

let connection: DatabaseConnection | undefined;
let expected: Row[] = [];
let checkWorkspaceId = "";

beforeAll(async () => {
  await prepareTestDatabase(kpiUrl);
  connection = connectDatabase(kpiUrl);
  let now = Date.now();
  const turn = Math.min(weekStart(now) + 7 * DAY, monthStart(now, -1));
  if (turn - now < SETTLE_MS) await Bun.sleep(turn - now + 1000);
  now = Date.now();
  ({ expected, checkWorkspaceId } = await buildFixture(connection.db, now));
}, SETTLE_MS + TIMEOUT_MS);

afterAll(async () => {
  await connection?.close();
  const admin = new URL(sourceUrl);
  admin.pathname = "/postgres";
  const sql = new SQL(admin.toString());
  try {
    const name = quoteIdentifier(testDatabaseName(kpiUrl));
    await sql.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    // Its grants went with the database.
    await sql.unsafe(`DROP ROLE IF EXISTS ${quoteIdentifier(reader.role)}`);
  } finally {
    await sql.close();
  }
});

/**
 * make kpi from the repository's root, quiet as kpi.yml runs it, on the fixture's
 * database and check workspace unless `env` says otherwise.
 */
async function kpi(
  args: string[],
  env: { DATABASE_URL_DIRECT?: string; CHECK_WORKSPACE_ID?: string } = {},
) {
  const child = Bun.spawn(["make", "--silent", "kpi", ...args], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH ?? "",
      DATABASE_URL_DIRECT: kpiUrl,
      CHECK_WORKSPACE_ID: checkWorkspaceId,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

/** The rows of psql's aligned table, which must be all there is on stdout. */
function tableRows(stdout: string): Row[] {
  const lines = stdout.split("\n");
  const cells = (line: string) => line.split("|").map((cell) => cell.trim());
  expect(cells(lines[0] ?? "")).toEqual(["kpi", "period", "measure", "count"]);
  expect(lines[1] ?? "").toMatch(/^-+(\+-+){3}$/);
  const body = lines.slice(2, -3);
  expect(lines.slice(-3)).toEqual([`(${body.length} rows)`, "", ""]);
  return body.map((line) => {
    const [kpi = "", period = "", measure = "", count = ""] = cells(line);
    expect(count).toMatch(/^\d+$/);
    return [kpi, period, measure, Number(count)];
  });
}

/**
 * Makes the rows every measure counts, placed around `now`, and returns the table make
 * kpi must print for them with the check workspace it leaves out.
 */
async function buildFixture(
  db: Database,
  now: number,
): Promise<{ expected: Row[]; checkWorkspaceId: string }> {
  const fixtures = testFixtures(db);
  // Before every period of the table, and old enough for K-05 and K-14.
  const old = new Date(now - 200 * DAY);
  const at = (base: number, days: number, hours = 0) =>
    new Date(base + days * DAY + hours * HOUR);
  const m0 = monthStart(now);
  const m1 = monthStart(now, 1);
  const m2 = monthStart(now, 2);
  const m3 = monthStart(now, 3);
  const months = [m3, m2, m1, m0];
  const weeks = Array.from(
    { length: 13 },
    (_, index) => weekStart(now) - (12 - index) * 7 * DAY,
  );
  // The three weeks that lie wholly in the month before this one, so K-07's rows fall in
  // a known month of K-13 and every week holding them is in the past.
  const wa = weekStart(m1 + 6 * DAY);
  const wb = wa + 7 * DAY;
  const wc = wb + 7 * DAY;

  const one = async <T>(rows: Promise<T[]>): Promise<T> => {
    const [row] = await rows;
    if (row === undefined) throw new Error("no row");
    return row;
  };
  const user = async (createdAt: Date, isAdmin = false) =>
    (
      await one(
        db
          .insert(users)
          .values({
            email: uniqueEmail("kpi"),
            displayName: "KPI user",
            isAdmin,
            createdAt,
            updatedAt: createdAt,
          })
          .returning({ id: users.id }),
      )
    ).id;
  const workspace = async (
    createdById: string,
    isPersonal: boolean,
    createdAt = old,
  ) =>
    (
      await one(
        db
          .insert(workspaces)
          .values({
            name: isPersonal ? "Personal" : "Team",
            isPersonal,
            createdById,
            createdAt,
            updatedAt: createdAt,
          })
          .returning({ id: workspaces.id }),
      )
    ).id;
  const member = (
    workspaceId: string,
    userId: string,
    role: Role,
    createdAt = old,
  ) =>
    db
      .insert(memberships)
      .values({ workspaceId, userId, role, createdAt, updatedAt: createdAt });
  const analysisVersionId = await fixtures.selfAnalysisVersion();
  const selfAnalysis = async (
    userId: string,
    status: "not_started" | "in_progress" | "done",
    sharedWith: string[] = [],
  ) => {
    const { id } = await one(
      db
        .insert(selfAnalyses)
        .values({
          userId,
          templateVersionId: analysisVersionId,
          status,
          completedAt: status === "done" ? old : null,
        })
        .returning({ id: selfAnalyses.id }),
    );
    for (const workspaceId of sharedWith) {
      await db
        .insert(selfAnalysisShares)
        .values({ selfAnalysisId: id, workspaceId });
    }
    return id;
  };
  const answer = (validationId: string) =>
    db
      .insert(validationAnswers)
      .values({ validationId, questionKey: "V.01.WHO", text: "Commuters" });
  const history = (
    values: Pick<
      typeof changeHistory.$inferInsert,
      "changedById" | "containerType" | "targetType" | "changedAt"
    > &
      Partial<typeof changeHistory.$inferInsert>,
  ) =>
    one(
      db
        .insert(changeHistory)
        .values({
          containerId: crypto.randomUUID(),
          targetId: crypto.randomUUID(),
          action: "update",
          source: "manual",
          client: "web",
          ...values,
        })
        .returning({ id: changeHistory.id }),
    );
  // A save in `userId`'s self-analysis, whose history has no workspace.
  const selfAnalysisSave = (
    userId: string,
    containerId: string,
    values: Pick<typeof changeHistory.$inferInsert, "changedAt"> &
      Partial<typeof changeHistory.$inferInsert>,
  ) =>
    history({
      changedById: userId,
      ownerUserId: userId,
      containerType: "self_analysis",
      containerId,
      targetType: "self_analysis_answer",
      targetId: containerId,
      targetKey: "SA.WHY.1",
      ...values,
    });
  const comment = (
    authorId: string,
    workspaceId: string,
    createdAt: Date,
    deletedAt: Date | null = null,
  ) =>
    db.insert(comments).values({
      workspaceId,
      containerType: "idea",
      containerId: crypto.randomUUID(),
      targetType: "idea",
      targetId: crypto.randomUUID(),
      authorId,
      body: "Looks right",
      createdAt,
      updatedAt: createdAt,
      deletedAt,
    });
  const check = (key: CheckKey, state: CheckState): CheckResult => ({
    key,
    state,
    count: null,
    params: {},
    detail: null,
    link: null,
  });
  const decision = (
    idea: { id: string; workspaceId: string },
    recordedById: string,
    values: Pick<typeof decisionLogEntries.$inferInsert, "value"> &
      Partial<typeof decisionLogEntries.$inferInsert>,
    missingChecks: CheckResult[] = [],
  ) =>
    one(
      db
        .insert(decisionLogEntries)
        .values({
          workspaceId: idea.workspaceId,
          ideaId: idea.id,
          kind: "validation_decision",
          reason: "Decided in a test",
          snapshot: { missingChecks, keyMetrics: {} },
          recordedById,
          recordedAt: at(old.getTime(), 1),
          ...values,
        })
        .returning({ id: decisionLogEntries.id }),
    );

  // Team members (owner or member of a team workspace) A, B, C and D, viewers V1 to V3,
  // a viewer of a personal workspace V4, E and X who belong to no team, and F, whose
  // membership was removed but whose history stays.
  const a = await user(old);
  const b = await user(old);
  const c = await user(old);
  const d = await user(old);
  const v1 = await user(old);
  const v2 = await user(old);
  const v3 = await user(old);
  const v4 = await user(old);
  const e = await user(old);
  const f = await user(old);
  const x = await user(old);
  const t1 = await workspace(a, false);
  const t2 = await workspace(d, false);
  const personalA = await workspace(a, true);
  const personalC = await workspace(c, true);
  const personalE = await workspace(e, true);
  const personalX = await workspace(x, true);
  const personalV3 = await workspace(v3, true);
  await member(t1, a, "owner");
  await member(t1, b, "member");
  await member(t1, c, "member", at(wb, 2));
  await member(t1, v1, "viewer");
  await member(t1, v3, "viewer", at(m1, 15));
  await member(t2, d, "owner");
  await member(t2, a, "member");
  await member(t2, v2, "viewer");
  await member(personalA, a, "owner");
  await member(personalA, b, "member");
  await member(personalA, v4, "viewer");
  await member(personalC, c, "owner");
  await member(personalE, e, "owner");
  await member(personalX, x, "owner");
  await member(personalV3, v3, "owner");

  const analysisB = await selfAnalysis(b, "in_progress", [t1]);
  const analysisA = await selfAnalysis(a, "done", [t1, personalA]);
  await selfAnalysis(c, "done");
  await selfAnalysis(e, "not_started");
  const analysisX = await selfAnalysis(x, "in_progress");

  // Ideas made long ago, I6 undone and I4 archived, then I8 between 4 and 8 weeks old and
  // I9 made now.
  const idea = (
    workspaceId: string,
    proposerId: string,
    values: Partial<typeof ideas.$inferInsert> = {},
  ) =>
    fixtures.createIdea(workspaceId, proposerId, {
      createdAt: old,
      updatedAt: old,
      ...values,
    });
  const i1 = await idea(t1, a);
  const i2 = await idea(t1, a);
  const i3 = await idea(t2, d);
  const i4 = await idea(t1, a, { archivedAt: at(old.getTime(), 5) });
  await idea(t1, a);
  const i6 = await idea(t1, a, { deletedAt: at(old.getTime(), 0, 1) });
  const i8 = await idea(t1, a, { createdAt: new Date(now - 40 * DAY) });
  const i9 = await idea(t1, a, { createdAt: new Date(now) });
  for (const answered of [i1, i4, i6]) await answer(answered.validation.id);

  const p1 = await decision(i1.idea, a, { value: "proceed" }, [
    check("competitors", "not_started"),
    check("local_price", "partial"),
  ]);
  const p2 = await decision(i2.idea, b, { value: "proceed" }, [
    check("costs", "partial"),
    check("permits", "partial"),
  ]);
  await decision(i3.idea, d, { value: "proceed" });
  await decision(i4.idea, a, { value: "hold" });
  const plan = (
    ideaId: string,
    createdFromDecisionId: string | null,
    deletedAt: Date | null = null,
  ) =>
    fixtures.createPlan(ideaId, a, {
      createdFromDecisionId,
      deletedAt,
      createdAt: at(old.getTime(), 2),
    });
  const plan1 = await plan(i1.idea.id, p1.id);
  await plan(i1.idea.id, p1.id);
  await plan(i1.idea.id, p1.id, at(old.getTime(), 2, 1));
  await plan(i2.idea.id, p2.id, at(old.getTime(), 2, 1));
  await plan(i3.idea.id, null);
  await decision(i1.idea, a, {
    kind: "go_no_go",
    value: "launch",
    businessPlanId: plan1.id,
    recordedAt: at(old.getTime(), 3),
  });

  await history({
    changedById: a,
    workspaceId: t1,
    containerType: "validation",
    containerId: i1.validation.id,
    targetType: "validation_answer",
    targetId: i1.validation.id,
    targetKey: "V.01.WHO",
    source: "ai_import",
    batchId: crypto.randomUUID(),
    changedAt: at(old.getTime(), 2),
  });
  await selfAnalysisSave(b, analysisB, {
    source: "ai_import",
    batchId: crypto.randomUUID(),
    changedAt: at(old.getTime(), 2),
  });

  // K-07: A's merged row runs from Sunday night in WA to Monday morning in WB. B's
  // comment at 03:00 on WB's Monday is still Sunday in UTC. C recorded in WA but joined
  // T1 in WB. E is in no team.
  await history({
    changedById: a,
    workspaceId: t1,
    containerType: "validation",
    targetType: "competitor",
    firstChangedAt: at(wa, 6, 20),
    changedAt: at(wb, 0, 10),
  });
  await history({
    changedById: c,
    workspaceId: personalC,
    containerType: "validation",
    targetType: "competitor",
    changedAt: at(wa, 3),
  });
  await comment(b, personalA, at(wb, 0, 3));
  await history({
    changedById: a,
    workspaceId: personalA,
    containerType: "validation",
    targetType: "risk",
    changedAt: at(wc, 1),
  });
  await decision(i3.idea, d, { value: "hold", recordedAt: at(wc, 2) });
  await comment(b, personalA, at(wc, 4), at(wc, 4, 1));
  await comment(e, personalE, at(wc, 1));

  // K-08: X's answer saves. The merged one is counted once, in the month of its last
  // save. Not saves of an answer by hand: a competitor, an AI import and a revert.
  const answerSave = (
    targetType: string,
    client: "web" | "web_mobile" | "unknown",
    changedAt: Date,
    values: Partial<typeof changeHistory.$inferInsert> = {},
  ) =>
    targetType === "self_analysis_answer"
      ? selfAnalysisSave(x, analysisX, { client, changedAt, ...values })
      : history({
          changedById: x,
          workspaceId: personalX,
          containerType:
            targetType === "plan_answer" ? "business_plan" : "validation",
          targetType,
          targetKey: targetType === "plan_answer" ? "P.01.1" : "V.01.WHO",
          client,
          changedAt,
          ...values,
        });
  await answerSave("validation_answer", "web", old);
  await answerSave("self_analysis_answer", "web", at(m3, 2));
  await answerSave("plan_answer", "web_mobile", at(m1, 0, 1), {
    firstChangedAt: at(m1, 0, -1),
  });
  await answerSave("validation_answer", "web_mobile", at(m1, 5));
  await answerSave("self_analysis_answer", "unknown", at(m1, 6));
  await answerSave("plan_answer", "web", at(m1, 7));
  await answerSave("validation_answer", "web_mobile", new Date(now));
  await answerSave("competitor", "web", at(m1, 5));
  await answerSave("validation_answer", "web_mobile", at(m1, 5), {
    source: "ai_import",
    batchId: crypto.randomUUID(),
  });
  await answerSave("self_analysis_answer", "web_mobile", at(m1, 6), {
    source: "revert",
  });

  // K-10 and K-13: F's merged row in T1 runs across the turn of the month. V2 is alone
  // in T2 in M-2, and their comment in M-1 was deleted. V3, a viewer of T1, comments only
  // in their own workspace, and V4 is a viewer only of a personal workspace.
  await history({
    changedById: f,
    workspaceId: t1,
    containerType: "validation",
    targetType: "risk",
    firstChangedAt: at(m1, 0, -2),
    changedAt: at(m1, 0, 2),
  });
  await comment(v1, t1, at(m2, 10));
  await comment(v1, t1, at(m1, 8));
  await comment(v2, t2, at(m2, 12));
  await comment(v2, t2, at(m1, 9), at(m1, 9, 1));
  await comment(v3, personalV3, at(m1, 20));
  await comment(v4, personalA, at(m1, 10));

  // K-11 and K-12: users who signed up within the periods. Each tells whether their 30
  // days and their weeks 5 to 8 are over, and whether they started within 30 days and
  // recorded in weeks 5 to 8.
  interface Signup {
    createdAt: Date;
    past30Days: boolean;
    past8Weeks: boolean;
    started: boolean;
    recorded: boolean;
  }
  const signups: Signup[] = [];
  const signUp = async (
    createdAt: Date,
    outcome: Omit<Signup, "createdAt">,
  ) => {
    signups.push({ createdAt, ...outcome });
    return user(createdAt);
  };
  const after = (from: Date, days: number, hours = 0) =>
    at(from.getTime(), days, hours);
  const ago = (days: number, hours = 0) => at(now, -days, -hours);
  // Signed up in M-3 or early in M-2, so at least 57 days ago whatever the date.
  const both = { past30Days: true, past8Weeks: true };

  // S1 starts with a save by hand, which K-08 counts in M-2.
  const s1At = at(m2, 2);
  const s1 = await signUp(s1At, { ...both, started: true, recorded: false });
  await selfAnalysisSave(s1, await selfAnalysis(s1, "in_progress"), {
    changedAt: after(s1At, 5),
  });

  // S2 starts by creating an idea, and S3, a member of S2's personal workspace, by
  // duplicating it. S2's comment on day 30 falls in weeks 5 to 8.
  const s2At = at(m2, 0, 12);
  const s2 = await signUp(s2At, { ...both, started: true, recorded: true });
  const personalS2 = await workspace(s2, true, s2At);
  await member(personalS2, s2, "owner", s2At);
  const s2Idea = await fixtures.createIdea(personalS2, s2, {
    createdAt: after(s2At, 0, 12),
  });
  await answer(s2Idea.validation.id);
  await history({
    changedById: s2,
    workspaceId: personalS2,
    containerType: "idea",
    containerId: s2Idea.idea.id,
    targetType: "idea",
    targetId: s2Idea.idea.id,
    action: "create",
    changedAt: s2Idea.idea.createdAt,
  });
  await comment(s2, personalS2, after(s2At, 30));
  const s3At = at(m2, 1);
  const s3 = await signUp(s3At, { ...both, started: true, recorded: false });
  await member(personalS2, s3, "member", s3At);
  const s3Copy = await fixtures.createIdea(personalS2, s3, {
    createdAt: after(s3At, 1),
    duplicatedFromId: s2Idea.idea.id,
  });
  await answer(s3Copy.validation.id);
  await history({
    changedById: s3,
    workspaceId: personalS2,
    containerType: "idea",
    containerId: s3Copy.idea.id,
    targetType: "idea",
    targetId: s3Copy.idea.id,
    action: "create",
    source: "duplicate",
    batchId: crypto.randomUUID(),
    changedAt: s3Copy.idea.createdAt,
  });

  // S4's first save, on day 31, is outside K-11's 30 days but inside K-12's weeks 5 to 8.
  const s4At = at(m3, 1, 12);
  const s4 = await signUp(s4At, { ...both, started: false, recorded: true });
  await selfAnalysisSave(s4, await selfAnalysis(s4, "in_progress"), {
    source: "ai_import",
    batchId: crypto.randomUUID(),
    changedAt: after(s4At, 31),
  });

  // S5's only idea had its creation undone, so S5 has not started.
  const s5At = at(m2, 1, 12);
  const s5 = await signUp(s5At, { ...both, started: false, recorded: false });
  const personalS5 = await workspace(s5, true, s5At);
  await member(personalS5, s5, "owner", s5At);
  const s5Idea = await fixtures.createIdea(personalS5, s5, {
    createdAt: after(s5At, 1),
    deletedAt: after(s5At, 1, 1),
  });
  const s5Created = await history({
    changedById: s5,
    workspaceId: personalS5,
    containerType: "idea",
    containerId: s5Idea.idea.id,
    targetType: "idea",
    targetId: s5Idea.idea.id,
    action: "create",
    changedAt: after(s5At, 1),
  });
  await history({
    changedById: s5,
    workspaceId: personalS5,
    containerType: "idea",
    containerId: s5Idea.idea.id,
    targetType: "idea",
    targetId: s5Idea.idea.id,
    action: "delete",
    source: "revert",
    revertedFromId: s5Created.id,
    changedAt: after(s5At, 1, 1),
  });

  // S7's merged save (day 20 to day 35) starts them by its first change and reaches
  // weeks 5 to 8 by its last. K-08 counts it in M-1, the month of the last.
  const s7At = at(m2, 1, 6);
  const s7 = await signUp(s7At, { ...both, started: true, recorded: true });
  await selfAnalysisSave(s7, await selfAnalysis(s7, "in_progress"), {
    firstChangedAt: after(s7At, 20),
    changedAt: after(s7At, 35),
  });

  // S8's comments, just before day 28 and on day 56, both fall outside weeks 5 to 8.
  const s8At = at(m3, 15);
  const s8 = await signUp(s8At, { ...both, started: false, recorded: false });
  const personalS8 = await workspace(s8, true, s8At);
  await member(personalS8, s8, "owner", s8At);
  await comment(s8, personalS8, after(s8At, 27, 23));
  await comment(s8, personalS8, after(s8At, 56));

  // S9 starts with an AI import. At 40 days old they count in K-11, not yet in K-12.
  const s9At = ago(40);
  const s9 = await signUp(s9At, {
    past30Days: true,
    past8Weeks: false,
    started: true,
    recorded: false,
  });
  await selfAnalysisSave(s9, await selfAnalysis(s9, "in_progress"), {
    source: "ai_import",
    batchId: crypto.randomUUID(),
    changedAt: after(s9At, 2),
  });

  // An hour either side of 30 days old, both started on day 1: only the first is counted.
  for (const [createdAt, past30Days] of [
    [ago(30, 1), true],
    [ago(30, -1), false],
  ] as const) {
    const id = await signUp(createdAt, {
      past30Days,
      past8Weeks: false,
      started: true,
      recorded: false,
    });
    await selfAnalysisSave(id, await selfAnalysis(id, "in_progress"), {
      source: "ai_import",
      batchId: crypto.randomUUID(),
      changedAt: after(createdAt, 1),
    });
  }

  // An hour either side of 8 weeks old, both with a comment on day 30: only the first is
  // counted.
  for (const [createdAt, past8Weeks] of [
    [ago(56, 1), true],
    [ago(56, -1), false],
  ] as const) {
    const id = await signUp(createdAt, {
      past30Days: true,
      past8Weeks,
      started: false,
      recorded: true,
    });
    const personal = await workspace(id, true, createdAt);
    await member(personal, id, "owner", createdAt);
    await comment(id, personal, after(createdAt, 30));
  }

  // An operator who would count in both if operators counted.
  const opAt = at(m2, 1);
  const op = await user(opAt, true);
  const personalOp = await workspace(op, true, opAt);
  await member(personalOp, op, "owner", opAt);
  await selfAnalysisSave(op, await selfAnalysis(op, "in_progress"), {
    source: "ai_import",
    batchId: crypto.randomUUID(),
    changedAt: after(opAt, 1),
  });
  await comment(op, personalOp, after(opAt, 30));

  // The workspace of the post-deploy checks, run by K, who signed up for them. Each row
  // here would change some count if it were not left out: memberships of every role
  // (A and C are team members elsewhere), A's share of the done self-analysis, an old
  // idea with an answer, a Proceed with nothing missing and a plan from it, K's idea
  // archived after the check, an AI import by C, A's save by hand now, and comments by K
  // (day 30) and by the viewer V5 now.
  const kAt = at(m2, 1, 12);
  const k = await signUp(kAt, { ...both, started: false, recorded: false });
  const v5 = await user(old);
  const checks = await workspace(a, false);
  await member(checks, a, "owner");
  await member(checks, c, "member");
  await member(checks, k, "member", kAt);
  await member(checks, v5, "viewer");
  await db
    .insert(selfAnalysisShares)
    .values({ selfAnalysisId: analysisA, workspaceId: checks });
  const checked = await idea(checks, a);
  await answer(checked.validation.id);
  const checkedProceed = await decision(checked.idea, a, { value: "proceed" });
  await plan(checked.idea.id, checkedProceed.id);
  const kIdea = await idea(checks, k, {
    createdAt: after(kAt, 1),
    archivedAt: after(kAt, 1, 1),
  });
  await history({
    changedById: k,
    workspaceId: checks,
    containerType: "idea",
    containerId: kIdea.idea.id,
    targetType: "idea",
    targetId: kIdea.idea.id,
    action: "create",
    changedAt: after(kAt, 1),
  });
  await history({
    changedById: c,
    workspaceId: checks,
    containerType: "validation",
    containerId: checked.validation.id,
    targetType: "validation_answer",
    targetId: checked.validation.id,
    targetKey: "V.01.WHO",
    source: "ai_import",
    batchId: crypto.randomUUID(),
    changedAt: at(old.getTime(), 2),
  });
  await history({
    changedById: a,
    workspaceId: checks,
    containerType: "validation",
    containerId: checked.validation.id,
    targetType: "validation_answer",
    targetId: checked.validation.id,
    targetKey: "V.01.WHO",
    client: "web_mobile",
    changedAt: new Date(now),
  });
  await comment(k, checks, after(kAt, 30));
  await comment(v5, checks, new Date(now));

  const liveIdeasMade = [i8.idea, i9.idea, s2Idea.idea, s3Copy.idea].map(
    (made) => monthLabel(made.createdAt.getTime()),
  );
  const rows = (kpi: string, period: string, counts: [string, number][]) =>
    counts.map(([measure, count]): Row => [kpi, period, measure, count]);
  const byMonth = (
    kpi: string,
    counts: (start: number) => [string, number][],
  ) => months.flatMap((start) => rows(kpi, monthLabel(start), counts(start)));
  const byWeek = (kpi: string, counts: (start: number) => [string, number][]) =>
    weeks.flatMap((start) => rows(kpi, weekLabel(start), counts(start)));
  const inMonth = (start: number, ...counts: number[]) =>
    counts[months.indexOf(start)] ?? 0;
  const signupWeeks = Array.from(
    { length: 13 },
    (_, index) => weekStart(now) - (20 - index) * 7 * DAY,
  );
  const signedUpIn = (
    period: (t: number) => string,
    start: number,
    over: "past30Days" | "past8Weeks",
  ) =>
    signups.filter(
      (signup) =>
        signup[over] && period(signup.createdAt.getTime()) === period(start),
    );

  const expected = [
    // A, B, C, X, S1, S4, S7, S9, the two near 30 days and the operator have started; E
    // has not.
    ...rows("K-01", "all", [
      ["self-analyses started", 11],
      ["ideas", 9],
      ["ideas with a validation answer", 4],
    ]),
    ...byMonth("K-02", (start) => [
      [
        "ideas created",
        liveIdeasMade.filter((label) => label === monthLabel(start)).length,
      ],
    ]),
    // A is in both teams and has shared with T1 of them; C is done but has not shared.
    ...rows("K-03", "all", [
      ["team memberships", 5],
      ["self-analysis done", 3],
      ["done and shared with the workspace", 1],
    ]),
    ...rows("K-04 K-15", "all", [
      ["proceed decisions", 3],
      ["with no check not started", 2],
    ]),
    ...rows("K-05", "all", [
      ["ideas 4+ weeks old", 7],
      ["with a decision", 3],
    ]),
    // Of P1's three plans one was undone; P2's only plan was undone.
    ...rows("K-06", "all", [
      ["proceed decisions", 3],
      ["with a plan made from it", 1],
      ["plans made from proceed decisions", 2],
    ]),
    ...byWeek("K-07", (start) => [
      ["team members", start < wb ? 3 : 4],
      [
        "who recorded",
        start === wa ? 1 : start === wb ? 2 : start === wc ? 3 : 0,
      ],
    ]),
    ...rows("K-08 K-16", "all", [
      ["manual answer saves", 9],
      ["from a phone-width screen", 3],
      ["client unknown", 1],
    ]),
    // S1's save in M-2 and S7's merged save, which ends in M-1, count with X's.
    ...byMonth("K-08 K-16", (start) => [
      ["manual answer saves", inMonth(start, 1, 1, 5, 1)],
      ["from a phone-width screen", inMonth(start, 0, 0, 2, 1)],
      ["client unknown", inMonth(start, 0, 0, 1, 0)],
    ]),
    ...rows("K-09", "all", [
      ["team members", 4],
      ["with an AI import", 2],
    ]),
    ...byMonth("K-10", (start) => [
      ["viewers", inMonth(start, 2, 2, 3, 3)],
      ["who commented", inMonth(start, 0, 2, 2, 0)],
    ]),
    ...byMonth("K-11", (start) => [
      [
        "signed up 30+ days ago",
        signedUpIn(monthLabel, start, "past30Days").length,
      ],
      [
        "started within 30 days",
        signedUpIn(monthLabel, start, "past30Days").filter(
          (signup) => signup.started,
        ).length,
      ],
    ]),
    ...signupWeeks.flatMap((start) =>
      rows("K-12", weekLabel(start), [
        [
          "signed up 8+ weeks ago",
          signedUpIn(weekLabel, start, "past8Weeks").length,
        ],
        [
          "recorded in weeks 5-8",
          signedUpIn(weekLabel, start, "past8Weeks").filter(
            (signup) => signup.recorded,
          ).length,
        ],
      ]),
    ),
    // T1 in M-2 (F and V1) and in M-1 (A, F and V1), T2 in M-1 (D and V2) but not in M-2
    // (V2 alone). Personal workspace A's three recorders in M-1 do not count.
    ...byMonth("K-13", (start) => [
      ["workspaces with 2+ recorders", inMonth(start, 0, 1, 2, 0)],
    ]),
    ...rows("K-14", "all", [
      ["ideas 8+ weeks old", 6],
      ["with a decision", 3],
    ]),
  ];
  return { expected, checkWorkspaceId: checks };
}

describe("make kpi", () => {
  test(
    "prints the count of every measure for each period, 0 for an empty one",
    async () => {
      const result = await kpi(["ENV=production"]);

      expect(result).toMatchObject({ exitCode: 0, stderr: "" });
      expect(tableRows(result.stdout)).toEqual(expected);
    },
    TIMEOUT_MS,
  );

  test(
    "prints the same table on a role that can only read",
    async () => {
      const admin = new SQL(kpiUrl);
      try {
        const role = quoteIdentifier(reader.role);
        await admin.unsafe(
          `CREATE ROLE ${role} WITH LOGIN PASSWORD '${reader.password}'`,
        );
        await admin.unsafe(
          `GRANT CONNECT ON DATABASE ${quoteIdentifier(testDatabaseName(kpiUrl))} TO ${role}`,
        );
        await admin.unsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
        await admin.unsafe(
          `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`,
        );
      } finally {
        await admin.close();
      }
      const readOnly = new SQL(readerUrl);
      try {
        // expect().rejects never settles on a Bun SQL query, so then() takes the outcome.
        const attempt = (query: string) =>
          readOnly.unsafe(query).then(
            () => "written",
            (error: Error) => error.message,
          );
        expect(await attempt("CREATE TABLE ro_check (x int)")).toContain(
          "permission denied",
        );
        expect(
          await attempt("UPDATE users SET display_name = display_name"),
        ).toContain("permission denied");
      } finally {
        await readOnly.close();
      }

      const result = await kpi(["ENV=production"], {
        DATABASE_URL_DIRECT: readerUrl,
      });

      expect(result).toMatchObject({ exitCode: 0, stderr: "" });
      expect(tableRows(result.stdout)).toEqual(expected);
    },
    TIMEOUT_MS,
  );

  test.each([
    ["without ENV", []],
    ["with ENV=local", ["ENV=local"]],
  ])(
    "refuses to run %s",
    async (_, args) => {
      const result = await kpi(args);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("ENV must be one of: staging production");
      expect(result.stdout).toBe("");
    },
    TIMEOUT_MS,
  );

  test(
    "refuses to run without the check workspace, which the setup names",
    async () => {
      const result = await kpi(["ENV=production"], { CHECK_WORKSPACE_ID: "" });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("CHECK_WORKSPACE_ID is required");
      expect(result.stderr).toContain("03_dev-setup.md 5.4 K");
      expect(result.stdout).toBe("");
    },
    TIMEOUT_MS,
  );

  test(
    "stops with nothing printed when the check workspace is not a UUID",
    async () => {
      const result = await kpi(["ENV=production"], {
        CHECK_WORKSPACE_ID: "checks",
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("invalid input syntax for type uuid");
      expect(result.stdout).toBe("");
    },
    TIMEOUT_MS,
  );
});
