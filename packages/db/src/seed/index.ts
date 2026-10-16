import type { MeasureText } from "@moonx/domain";
import { and, eq, getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { Database, DatabaseTransaction } from "../client";
import * as schema from "../schema";
import { changeHistory, economicsInputs, ideas, workspaces } from "../schema";
import { recordDecision, writeThread } from "./activity";
import { seedClock } from "./clock";
import {
  ActivityLog,
  BCDX_WORKSPACE_ID,
  HistoryLog,
  type SeedContext,
  type UserKey,
  userId,
} from "./context";
import { HEALTH_BOWL } from "./data/health-bowl";
import { NIGHT_MARKET, NIGHT_MARKET_PLAN_A } from "./data/night-market";
import { PIAYA, PIAYA_PLAN_A, PIAYA_PLAN_B } from "./data/piaya";
import { BIKE_REPAIR, LAUNDRY, SARI_SARI } from "./data/smaller-ideas";
import {
  STUDY_CAFE,
  STUDY_CAFE_PLAN_A,
  STUDY_CAFE_PLAN_B,
} from "./data/study-cafe";
import { type WrittenIdea, writeIdea } from "./ideas";
import { seedPeople } from "./people";
import { writePlan } from "./plans";
import { seedSelfAnalyses, selfAnalysisId } from "./self-analyses";
import { seedTemplates } from "./templates";

export { BCDX_WORKSPACE_ID, personalWorkspaceId, userId } from "./context";
export { seedId } from "./ids";
export {
  SEED_INVITATION_TOKENS,
  SEED_PASSWORD,
  SEED_USERS,
} from "./people";
export { selfAnalysisId } from "./self-analyses";

/** Every table of the schema, emptied together so no foreign key is left dangling. */
const truncateAll = async (tx: DatabaseTransaction) => {
  const names = (Object.values(schema) as unknown[]).flatMap((value) =>
    is(value, PgTable) ? [`"${getTableName(value)}"`] : [],
  );
  await tx.execute(sql.raw(`truncate table ${names.join(", ")}`));
};

const HISTORY_ROWS_PER_INSERT = 500;

export interface SeedOptions {
  /** The moment every relative time counts from. Defaults to now. */
  now?: Date;
  /** The PDF's fonts, for the check that publishes the plan template (AD6). */
  measure: MeasureText;
}

/**
 * Empties every table and writes the demo data of design-spec 8 in one transaction, so
 * a failure leaves the database as it was. Row ids come from names (SDD 6.5): a second
 * run gives every row the same id; password hashes change and times follow the run.
 * Callers decide where it may run: `make db-seed` only with APP_ENV=local.
 */
export async function seedDatabase(
  db: Database,
  { now = new Date(), measure }: SeedOptions,
): Promise<void> {
  await db.transaction(async (tx) => {
    await truncateAll(tx);
    const clock = seedClock(now);
    const ctx: SeedContext = {
      tx,
      clock,
      templates: await seedTemplates(tx, clock, measure),
      history: new HistoryLog(),
      activity: new ActivityLog(),
    };
    await seedPeople(ctx);
    await seedSelfAnalyses(ctx);
    const decisions = new Map<string, "proceed" | "hold" | "drop">();
    const decide = async (
      idea: WrittenIdea,
      label: string,
      value: "proceed" | "hold" | "drop",
      reason: string,
      when: { daysAgo: number; by: UserKey },
    ) => {
      decisions.set(idea.ideaId, value);
      return recordDecision(
        ctx,
        idea,
        label,
        { kind: "validation_decision", value, reason },
        when,
      );
    };

    const piaya = await writeIdea(ctx, PIAYA);
    const piayaProceed = await decide(
      piaya,
      "proceed",
      "proceed",
      "All six checks are done and the expected case pays back in about 9 months. Draft a plan and pilot with five offices.",
      { daysAgo: 28, by: "ana" },
    );
    const piayaA = await writePlan(ctx, piaya, PIAYA_PLAN_A, piayaProceed);
    await writePlan(ctx, piaya, PIAYA_PLAN_B, piayaProceed);
    await recordDecision(ctx, piaya, "plan-a/version-1", {
      kind: "version_saved",
      plan: piayaA,
    });
    await recordDecision(
      ctx,
      piaya,
      "plan-a/go-no-go",
      {
        kind: "go_no_go",
        value: "delay",
        reason:
          "The advisors want a four-week pilot with five offices before we sign the kitchen lease. Launch waits for the pilot results.",
        plan: piayaA,
      },
      { daysAgo: 9, by: "ana" },
    );

    const corporate = await writeIdea(
      ctx,
      {
        ...PIAYA,
        key: "corporate",
        name: "Piaya Gift Box Delivery (copy)",
        proposer: "kenji",
      },
      { ideaId: piaya.ideaId, by: "kenji", daysAgo: 6, hoursAgo: 3 },
    );
    await renameIdea(ctx, corporate, "Piaya Gift Box (Corporate)", {
      daysAgo: 6,
      hoursAgo: 2,
      by: "kenji",
    });
    await changeNumber(
      ctx,
      corporate,
      "selling_price",
      { value: 650, fau: "assumption", confidence: "high" },
      { daysAgo: 6, hoursAgo: 1, by: "kenji" },
    );

    const healthBowl = await writeIdea(ctx, HEALTH_BOWL);
    await decide(
      healthBowl,
      "hold",
      "hold",
      "Startup costs are incomplete (three Unknown rows and the working capital) and permits are not checked yet. Revisit after the city hall visit.",
      { daysAgo: 8, by: "kenji" },
    );

    const studyCafe = await writeIdea(ctx, STUDY_CAFE);
    const studyProceed = await decide(
      studyCafe,
      "proceed",
      "proceed",
      "Students already pay for café seats, the survey supports the price, and the numbers pay back within a year.",
      { daysAgo: 60, by: "paolo" },
    );
    const studyA = await writePlan(
      ctx,
      studyCafe,
      STUDY_CAFE_PLAN_A,
      studyProceed,
    );
    await writePlan(ctx, studyCafe, STUDY_CAFE_PLAN_B, studyProceed);
    await recordDecision(ctx, studyCafe, "plan-a/version-1", {
      kind: "version_saved",
      plan: studyA,
    });
    await recordDecision(
      ctx,
      studyCafe,
      "plan-a/go-no-go",
      {
        kind: "go_no_go",
        value: "launch",
        reason:
          "Lease signed, renovation done and 120 students pre-registered. Launching on schedule.",
        plan: studyA,
      },
      { daysAgo: 29, by: "paolo" },
    );

    const nightMarket = await writeIdea(ctx, NIGHT_MARKET);
    const nightProceed = await decide(
      nightMarket,
      "proceed",
      "proceed",
      "The expected case works with a small stall fee, and testing it takes little capital.",
      { daysAgo: 33, by: "ana" },
    );
    await writePlan(ctx, nightMarket, NIGHT_MARKET_PLAN_A, nightProceed);
    await decide(
      nightMarket,
      "hold",
      "hold",
      "Stall fees go up next quarter, and the strong case is already beyond what one grill can make. Holding until we test a second grill.",
      { daysAgo: 14, by: "ana" },
    );

    const laundry = await writeIdea(ctx, LAUNDRY);
    await decide(laundry, "drop", "drop", "Contribution margin is negative", {
      daysAgo: 55,
      by: "paolo",
    });

    await writeIdea(ctx, SARI_SARI);
    await writeIdea(ctx, BIKE_REPAIR);

    // design-spec 8.4: 6 threads, 7 comments; 2 mention Kenji and stay unread; 1 resolved.
    const commentsPanel = "comments" as const;
    const answerThread = (idea: WrittenIdea, key: string) => ({
      target: {
        type: "validation_answer" as const,
        id: idea.validationId,
        key,
      },
      place: {
        containerType: "validation" as const,
        containerId: idea.validationId,
        sectionKey: key.split(".")[1] ?? null,
        ideaId: idea.ideaId,
      },
      link: {
        screen: 11,
        workspaceId: BCDX_WORKSPACE_ID,
        ideaId: idea.ideaId,
        sectionKey: key.split(".")[1],
        questionKey: key,
        panel: commentsPanel,
        target: {
          type: "validation_answer" as const,
          id: idea.validationId,
          key,
        },
      },
    });
    await writeThread(ctx, {
      ...answerThread(piaya, "V.01.WHO"),
      owners: ["ana"],
      root: {
        key: "piaya-who",
        author: "paolo",
        body: "Do we count the BPO night-shift teams as well? They order for 3 a.m. birthdays too.",
        daysAgo: 20,
      },
      replies: [
        {
          key: "piaya-who-reply",
          author: "ana",
          body: "Yes, but only offices within 5 km for now. I'll add them to the pilot list.",
          daysAgo: 19,
        },
      ],
    });
    await writeThread(ctx, {
      ...answerThread(piaya, "V.02.SHARE"),
      owners: ["ana"],
      root: {
        key: "piaya-share",
        author: "ana",
        body: "@Kenji Mori can you check how many offices on Lacson St. order gifts every month? We need about 15 accounts for this to work.",
        daysAgo: 3,
        mentions: ["kenji"],
      },
      unreadBy: ["kenji"],
    });
    const permitsRow = healthBowl.costRowId("initial.permits");
    const permitsTarget = { type: "cost_item" as const, id: permitsRow };
    await writeThread(ctx, {
      target: permitsTarget,
      place: {
        containerType: "validation",
        containerId: healthBowl.validationId,
        sectionKey: "costs",
        ideaId: healthBowl.ideaId,
      },
      link: {
        screen: 17,
        workspaceId: BCDX_WORKSPACE_ID,
        ideaId: healthBowl.ideaId,
        rowId: permitsRow,
        panel: commentsPanel,
        target: permitsTarget,
      },
      owners: ["kenji"],
      root: {
        key: "health-bowl-permits",
        author: "ana",
        body: "@Kenji Mori the permits row is still Unknown. Can you ask at city hall this week? It is what keeps check 5 from starting.",
        daysAgo: 2,
        mentions: ["kenji"],
      },
      unreadBy: ["kenji"],
    });
    const planTarget = {
      type: "plan_answer" as const,
      id: piayaA.planId,
      key: "P.01.6",
    };
    await writeThread(ctx, {
      target: planTarget,
      place: {
        containerType: "business_plan",
        containerId: piayaA.planId,
        sectionKey: "01",
        ideaId: piaya.ideaId,
      },
      link: {
        screen: 21,
        workspaceId: BCDX_WORKSPACE_ID,
        ideaId: piaya.ideaId,
        planId: piayaA.planId,
        itemNo: 1,
        questionKey: "P.01.6",
        panel: commentsPanel,
        target: planTarget,
      },
      // The plan's creator and the idea's proposer, both Ana.
      owners: ["ana"],
      root: {
        key: "piaya-plan-why",
        author: "paolo",
        body: "Should we mention the pilot here? The advisors will ask how we know offices reorder.",
        daysAgo: 11,
      },
      resolved: { by: "ana", daysAgo: 3 },
    });
    const selfAnalysisTarget = {
      type: "self_analysis_answer" as const,
      id: selfAnalysisId("ana"),
      key: "SA.WHY.1",
    };
    await writeThread(ctx, {
      target: selfAnalysisTarget,
      place: {
        containerType: "self_analysis",
        containerId: selfAnalysisId("ana"),
        sectionKey: "WHY",
        ideaId: null,
      },
      link: {
        screen: 11,
        workspaceId: BCDX_WORKSPACE_ID,
        sectionKey: "WHY",
        questionKey: "SA.WHY.1",
        panel: commentsPanel,
        target: selfAnalysisTarget,
      },
      owners: ["ana"],
      root: {
        key: "ana-self-analysis-why",
        author: "paolo",
        body: "This is a strong reason. It belongs in the Vision section of the Piaya plan.",
        daysAgo: 60,
      },
    });
    const ideaTarget = { type: "idea" as const, id: studyCafe.ideaId };
    await writeThread(ctx, {
      target: ideaTarget,
      place: {
        containerType: "idea",
        containerId: studyCafe.ideaId,
        sectionKey: null,
        ideaId: studyCafe.ideaId,
      },
      link: {
        screen: 13,
        workspaceId: BCDX_WORKSPACE_ID,
        ideaId: studyCafe.ideaId,
        panel: commentsPanel,
        target: ideaTarget,
      },
      owners: ["paolo"],
      root: {
        key: "study-cafe-visit",
        author: "ana",
        body: "Congratulations on the launch! Can we visit with the advisors next week?",
        daysAgo: 25,
      },
    });

    for (const [ideaId, value] of decisions)
      await tx
        .update(ideas)
        .set({ latestDecision: value })
        .where(eq(ideas.id, ideaId));
    for (const [ideaId, at] of ctx.activity.ideas)
      await tx
        .update(ideas)
        .set({ lastActivityAt: at })
        .where(eq(ideas.id, ideaId));
    for (const [workspaceId, at] of ctx.activity.workspaces)
      await tx
        .update(workspaces)
        .set({ lastActiveAt: at })
        .where(eq(workspaces.id, workspaceId));

    // A revert points at an earlier row, so the rows it points at go in first.
    const rows = ctx.history.rows.toSorted(
      (a, b) =>
        Number(a.revertedFromId != null) - Number(b.revertedFromId != null),
    );
    for (let start = 0; start < rows.length; start += HISTORY_ROWS_PER_INSERT)
      await tx
        .insert(changeHistory)
        .values(rows.slice(start, start + HISTORY_ROWS_PER_INSERT));
  });
}

/** Renames an idea on 13 (a manual change of the overview). */
async function renameIdea(
  { tx, clock, history, activity }: SeedContext,
  idea: WrittenIdea,
  name: string,
  when: { daysAgo: number; hoursAgo?: number; by: UserKey },
) {
  const at = clock.ago(when.daysAgo, when.hoursAgo);
  const overview = {
    oneLineConcept: idea.spec.oneLineConcept,
    proposedSolution: idea.spec.proposedSolution,
  };
  await tx
    .update(ideas)
    .set({
      name,
      lockVersion: sql`${ideas.lockVersion} + 1`,
      updatedById: userId(when.by),
      updatedAt: at,
    })
    .where(eq(ideas.id, idea.ideaId));
  history.add({
    container: {
      type: "idea",
      id: idea.ideaId,
      workspaceId: BCDX_WORKSPACE_ID,
      ownerUserId: null,
    },
    sectionKey: null,
    target: { type: "idea", id: idea.ideaId },
    action: "update",
    before: { name: idea.spec.name, ...overview },
    after: { name, ...overview },
    source: "manual",
    by: when.by,
    at,
  });
  activity.touch(BCDX_WORKSPACE_ID, idea.ideaId, at);
}

/** Changes one number of 18 that the idea already has. */
async function changeNumber(
  { tx, clock, history, activity }: SeedContext,
  idea: WrittenIdea,
  field: keyof NonNullable<WrittenIdea["spec"]["economics"]>,
  state: {
    value: number;
    fau: "assumption";
    confidence: "low" | "medium" | "high";
  },
  when: { daysAgo: number; hoursAgo?: number; by: UserKey },
) {
  const before = idea.spec.economics[field];
  if (before === undefined || (before.evidence ?? []).length > 0)
    throw new Error(`${idea.spec.key}: ${field} must exist without evidence`);
  const at = clock.ago(when.daysAgo, when.hoursAgo);
  await tx
    .update(economicsInputs)
    .set({
      ...state,
      lockVersion: sql`${economicsInputs.lockVersion} + 1`,
      updatedById: userId(when.by),
      updatedAt: at,
    })
    .where(
      and(
        eq(economicsInputs.validationId, idea.validationId),
        eq(economicsInputs.fieldKey, field),
      ),
    );
  history.add({
    container: {
      type: "validation",
      id: idea.validationId,
      workspaceId: BCDX_WORKSPACE_ID,
      ownerUserId: null,
    },
    sectionKey: "economics",
    target: { type: "economics_input", id: idea.validationId, key: field },
    action: "update",
    before: {
      value: before.value,
      fau: before.fau ?? null,
      confidence: before.confidence ?? null,
      evidenceIds: [],
    },
    after: { ...state, evidenceIds: [] },
    source: "manual",
    by: when.by,
    at,
  });
  activity.touch(BCDX_WORKSPACE_ID, idea.ideaId, at);
}
