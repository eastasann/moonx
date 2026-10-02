import type { LinkTarget } from "@moonx/schemas";
import { uid } from "../lib/ids";
import type { World } from "../lib/rows";
import type { Clock } from "../lib/time";
import type { IdeaKey, IdeaRecord } from "./ideas";
import { BCDX, type PersonKey, personKeys, userId } from "./ids";
import {
  answerAtRecord,
  executionItemId,
  type PlanKey,
  type PlanRecord,
  planId,
  planVersionId,
  versionSnapshot,
} from "./plans";
import { selfAnalysisId } from "./self-analyses";
import { decisionSnapshot, stateOf } from "./snapshot";
import { costRowId } from "./validation";

type HistoryRow = World["changeHistory"][number];
type Client = "web" | "ios" | "android";

const MEMBERS: PersonKey[] = ["ana", "kenji", "paolo", "grace"];

const link = (screen: number, extra: Partial<LinkTarget> = {}): LinkTarget => ({
  screen,
  workspaceId: BCDX,
  ...extra,
});

interface DecisionSpec {
  key: string;
  idea: IdeaKey;
  plan?: PlanKey;
  version?: number;
  kind: "validation_decision" | "go_no_go" | "version_saved";
  value: "proceed" | "hold" | "drop" | "launch" | "delay" | "stop" | null;
  reason: string | null;
  by: PersonKey;
  daysAgo: number;
}

const decisionId = (key: string) => uid("decision", key);

const DECISIONS: DecisionSpec[] = [
  {
    key: "piaya-proceed",
    idea: "piaya",
    kind: "validation_decision",
    value: "proceed",
    reason: "All six checks are met and the payback is under ten months. Develop a plan.",
    by: "ana",
    daysAgo: 28,
  },
  {
    key: "piaya-version",
    idea: "piaya",
    plan: "piaya-a",
    version: 1,
    kind: "version_saved",
    value: null,
    reason: null,
    by: "ana",
    daysAgo: 12,
  },
  {
    key: "piaya-delay",
    idea: "piaya",
    plan: "piaya-a",
    version: 1,
    kind: "go_no_go",
    value: "delay",
    reason: "Waiting for the supplier quote and the permit check.",
    by: "ana",
    daysAgo: 4,
  },
  {
    key: "health-hold",
    idea: "health-bowl",
    kind: "validation_decision",
    value: "hold",
    reason: "Startup and monthly costs and permits are still missing.",
    by: "kenji",
    daysAgo: 9,
  },
  {
    key: "study-proceed",
    idea: "study-cafe",
    kind: "validation_decision",
    value: "proceed",
    reason: "Every check is met and students already pay for seats elsewhere.",
    by: "paolo",
    daysAgo: 75,
  },
  {
    key: "study-version",
    idea: "study-cafe",
    plan: "study-cafe-a",
    version: 1,
    kind: "version_saved",
    value: null,
    reason: null,
    by: "paolo",
    daysAgo: 30,
  },
  {
    key: "study-launch",
    idea: "study-cafe",
    plan: "study-cafe-a",
    version: 1,
    kind: "go_no_go",
    value: "launch",
    reason: "The lease is signed and the permits are approved.",
    by: "paolo",
    daysAgo: 28,
  },
  {
    key: "laundry-drop",
    idea: "laundry",
    kind: "validation_decision",
    value: "drop",
    reason: "Contribution margin is negative",
    by: "paolo",
    daysAgo: 15,
  },
];

const VERSION_NAMES: Partial<Record<PlanKey, string>> = {
  "piaya-a": "v1 For advisors",
  "study-cafe-a": "v1 Launch review",
};

/** Plan versions, decision log entries, and the plans' link back to the decision that started them. */
export function addDecisions(
  world: World,
  clock: Clock,
  ideas: Record<IdeaKey, IdeaRecord>,
  plans: Record<PlanKey, PlanRecord>,
) {
  for (const [planKey, name] of Object.entries(VERSION_NAMES) as [PlanKey, string][]) {
    const spec = DECISIONS.find((d) => d.plan === planKey && d.kind === "version_saved");
    if (!spec) throw new Error(`no version_saved decision for ${planKey}`);
    const plan = plans[planKey];
    const savedAt = clock.ago(spec.daysAgo);
    world.planVersions.push({
      id: planVersionId(planKey, 1),
      businessPlanId: plan.id,
      versionNumber: 1,
      name,
      snapshot: versionSnapshot(world, plan, ideas[plan.idea]),
      savedById: userId(spec.by),
      savedAt,
      createdAt: savedAt,
      updatedAt: savedAt,
    });
  }

  for (const d of DECISIONS) {
    const idea = ideas[d.idea];
    const state = stateOf(idea.validation, BCDX, idea.id);
    const at = clock.ago(d.daysAgo, 11);
    const snapshot: Record<string, unknown> = { ...decisionSnapshot(state) };
    if (d.kind === "go_no_go" && d.plan) {
      const answers = plans[d.plan].answers;
      const plan = plans[d.plan];
      const at = (key: string) => answerAtRecord(plan, key, answers[key]?.text ?? null);
      snapshot.conditions = { launchIf: at("P.24.1"), delayIf: at("P.24.2"), stopIf: at("P.24.3") };
    }
    if (d.plan && d.version) {
      snapshot.planVersion = { id: planVersionId(d.plan, d.version), name: VERSION_NAMES[d.plan] };
    }
    world.decisionLogEntries.push({
      id: decisionId(d.key),
      workspaceId: BCDX,
      ideaId: idea.id,
      businessPlanId: d.plan ? plans[d.plan].id : null,
      planVersionId: d.plan && d.version ? planVersionId(d.plan, d.version) : null,
      kind: d.kind,
      value: d.value,
      reason: d.reason,
      snapshot,
      recordedById: userId(d.by),
      recordedAt: at,
      createdAt: at,
    });
  }

  const start: Record<PlanKey, string> = {
    "piaya-a": "piaya-proceed",
    "piaya-b": "piaya-proceed",
    "study-cafe-a": "study-proceed",
  };
  for (const plan of world.businessPlans) {
    const key = (Object.keys(start) as PlanKey[]).find((k) => planId(k) === plan.id);
    if (key) plan.createdFromDecisionId = decisionId(start[key]);
  }
}

/** Comments (design-spec 8.4: six threads) and the notifications they and everything else raise. */
export function addCollaboration(
  world: World,
  clock: Clock,
  ideas: Record<IdeaKey, IdeaRecord>,
  plans: Record<PlanKey, PlanRecord>,
) {
  const piaya = ideas.piaya;
  const comment = (
    key: string,
    c: {
      target: Pick<World["comments"][number], "targetType" | "targetId" | "targetKey">;
      author: PersonKey;
      body: string;
      daysAgo: number;
      parent?: string;
      resolvedBy?: PersonKey;
      mentions?: PersonKey[];
    },
  ) => {
    const id = uid("comment", key);
    const at = clock.ago(c.daysAgo, 14);
    world.comments.push({
      id,
      workspaceId: BCDX,
      ...c.target,
      parentId: c.parent ? uid("comment", c.parent) : null,
      authorId: userId(c.author),
      body: c.body,
      resolvedAt: c.resolvedBy ? clock.ago(c.daysAgo - 1, 9) : null,
      resolvedById: c.resolvedBy ? userId(c.resolvedBy) : null,
      createdAt: at,
      updatedAt: at,
    });
    for (const m of c.mentions ?? []) {
      world.commentMentions.push({
        id: uid("mention", key, m),
        commentId: id,
        userId: userId(m),
        createdAt: at,
      });
    }
    return { id, at };
  };

  const notify = (
    key: string,
    n: {
      user: PersonKey;
      kind: "mention" | "comment" | "decision" | "due";
      actor?: PersonKey;
      commentId?: string;
      decisionId?: string;
      executionItemId?: string;
      dueStage?: "three_days_before" | "due_day" | "overdue";
      dueDate?: string;
      link: LinkTarget;
      at: Date;
      read: boolean;
    },
  ) => {
    world.notifications.push({
      id: uid("notification", key),
      userId: userId(n.user),
      workspaceId: BCDX,
      kind: n.kind,
      actorId: n.actor ? userId(n.actor) : null,
      commentId: n.commentId ?? null,
      decisionLogEntryId: n.decisionId ?? null,
      executionItemId: n.executionItemId ?? null,
      dueStage: n.dueStage ?? null,
      dueDate: n.dueDate ?? null,
      link: n.link,
      readAt: n.read ? new Date(n.at.getTime() + 3600_000) : null,
      createdAt: n.at,
    });
  };

  const whoLink = link(11, {
    ideaId: piaya.id,
    sectionKey: "01",
    questionKey: "V.01.WHO",
    panel: "comments",
    target: { type: "validation_answer", id: piaya.validation.validationId, key: "V.01.WHO" },
  });
  const t1 = comment("who", {
    target: {
      targetType: "validation_answer",
      targetId: piaya.validation.validationId,
      targetKey: "V.01.WHO",
    },
    author: "paolo",
    body: "Do we have a source for the number of offices? @Kenji Mori can you check the BCDX contact list?",
    daysAgo: 11,
    mentions: ["kenji"],
  });
  notify("who-mention", {
    user: "kenji",
    kind: "mention",
    actor: "paolo",
    commentId: t1.id,
    link: whoLink,
    at: t1.at,
    read: false,
  });
  notify("who-comment", {
    user: "ana",
    kind: "comment",
    actor: "paolo",
    commentId: t1.id,
    link: whoLink,
    at: t1.at,
    read: true,
  });
  const t1r = comment("who-reply", {
    target: {
      targetType: "validation_answer",
      targetId: piaya.validation.validationId,
      targetKey: "V.01.WHO",
    },
    author: "ana",
    body: "I will add the research log with the contact list this week.",
    daysAgo: 10,
    parent: "who",
  });
  notify("who-reply", {
    user: "paolo",
    kind: "comment",
    actor: "ana",
    commentId: t1r.id,
    link: whoLink,
    at: t1r.at,
    read: true,
  });

  const rentId = costRowId("piaya", "monthly.rent");
  const rentLink = link(17, {
    ideaId: piaya.id,
    rowId: rentId,
    panel: "comments",
    target: { type: "cost_item", id: rentId },
  });
  const t2 = comment("rent", {
    target: { targetType: "cost_item", targetId: rentId, targetKey: null },
    author: "ana",
    body: "The landlord may drop the rent to ₱10,000 if we sign for a year. @Kenji Mori what do you think?",
    daysAgo: 6,
    mentions: ["kenji"],
  });
  notify("rent-mention", {
    user: "kenji",
    kind: "mention",
    actor: "ana",
    commentId: t2.id,
    link: rentLink,
    at: t2.at,
    read: false,
  });

  const bowl = ideas["health-bowl"];
  const competitorId = uid("competitor", "health-bowl", "1");
  const t3 = comment("bowl-price", {
    target: { targetType: "competitor", targetId: competitorId, targetKey: null },
    author: "ana",
    body: "The Bowl & Co price is for a regular bowl. Check the large size too.",
    daysAgo: 8,
    resolvedBy: "kenji",
  });
  notify("bowl-price", {
    user: "kenji",
    kind: "comment",
    actor: "ana",
    commentId: t3.id,
    link: link(15, {
      ideaId: bowl.id,
      rowId: competitorId,
      panel: "comments",
      target: { type: "competitor", id: competitorId },
    }),
    at: t3.at,
    read: true,
  });

  const planA = plans["piaya-a"];
  const t4 = comment("delay-if", {
    target: { targetType: "plan_answer", targetId: planA.id, targetKey: "P.24.2" },
    author: "paolo",
    body: "Should five pilot offices be the threshold, or ten?",
    daysAgo: 3,
  });
  notify("delay-if", {
    user: "ana",
    kind: "comment",
    actor: "paolo",
    commentId: t4.id,
    link: link(21, {
      ideaId: piaya.id,
      planId: planA.id,
      itemNo: 24,
      questionKey: "P.24.2",
      panel: "comments",
      target: { type: "plan_answer", id: planA.id, key: "P.24.2" },
    }),
    at: t4.at,
    read: false,
  });

  const saId = selfAnalysisId("ana");
  const t5 = comment("sa-why", {
    target: { targetType: "self_analysis_answer", targetId: saId, targetKey: "SA.WHY.1" },
    author: "paolo",
    body: "I see ownership the same way. Let us compare our answers on how much time we can give.",
    daysAgo: 9,
  });
  notify("sa-why", {
    user: "ana",
    kind: "comment",
    actor: "paolo",
    commentId: t5.id,
    link: link(11, {
      questionKey: "SA.WHY.1",
      panel: "comments",
      target: { type: "self_analysis_answer", id: saId, key: "SA.WHY.1" },
    }),
    at: t5.at,
    read: false,
  });

  const cafe = ideas["study-cafe"];
  const t6 = comment("cafe-launch", {
    target: { targetType: "idea", targetId: cafe.id, targetKey: null },
    author: "ana",
    body: "Congratulations on the launch. Share the first month of numbers when you have them.",
    daysAgo: 27,
  });
  notify("cafe-launch", {
    user: "paolo",
    kind: "comment",
    actor: "ana",
    commentId: t6.id,
    link: link(13, { ideaId: cafe.id, panel: "comments", target: { type: "idea", id: cafe.id } }),
    at: t6.at,
    read: true,
  });

  // Decisions: everyone in the workspace but the recorder. Only the newest stay unread.
  for (const d of world.decisionLogEntries) {
    const idea = Object.values(ideas).find((i) => i.id === d.ideaId);
    if (!idea) continue;
    const recent = clock.now.getTime() - (d.recordedAt?.getTime() ?? 0) < 10 * 86400_000;
    for (const member of MEMBERS) {
      if (userId(member) === d.recordedById) continue;
      notify(`decision-${d.id}-${member}`, {
        user: member,
        kind: "decision",
        actor: personKeys.find((p) => userId(p) === d.recordedById),
        decisionId: d.id,
        link: link(d.kind === "validation_decision" ? 13 : 20, {
          ideaId: idea.id,
          ...(d.businessPlanId ? { planId: d.businessPlanId } : {}),
        }),
        at: d.recordedAt ?? clock.now,
        read: !(recent && member !== "grace"),
      });
    }
  }

  // Due dates: Ana's overdue action (three notices) and Kenji's action due in two days.
  const overdue = executionItemId("piaya-a", "next_action", 0);
  const soon = executionItemId("piaya-a", "next_action", 1);
  const execLink = (id: string) =>
    link(22, { ideaId: piaya.id, planId: planA.id, tab: "actions", rowId: id });
  notify("due-ana-3d", {
    user: "ana",
    kind: "due",
    executionItemId: overdue,
    dueStage: "three_days_before",
    dueDate: clock.date(-3),
    link: execLink(overdue),
    at: clock.ago(6, 8),
    read: true,
  });
  notify("due-ana-day", {
    user: "ana",
    kind: "due",
    executionItemId: overdue,
    dueStage: "due_day",
    dueDate: clock.date(-3),
    link: execLink(overdue),
    at: clock.ago(3, 8),
    read: true,
  });
  notify("due-ana-overdue", {
    user: "ana",
    kind: "due",
    executionItemId: overdue,
    dueStage: "overdue",
    dueDate: clock.date(-3),
    link: execLink(overdue),
    at: clock.ago(2, 8),
    read: false,
  });
  notify("due-kenji-3d", {
    user: "kenji",
    kind: "due",
    executionItemId: soon,
    dueStage: "three_days_before",
    dueDate: clock.date(2),
    link: execLink(soon),
    at: clock.ago(0, 8),
    read: false,
  });
}

/** Change history (design-spec 8.4): manual edits, AI imports, a revert, and the batches behind drafts and duplicates. */
export function addHistory(
  world: World,
  clock: Clock,
  ideas: Record<IdeaKey, IdeaRecord>,
  plans: Record<PlanKey, PlanRecord>,
) {
  const entry = (
    h: Pick<HistoryRow, "containerType" | "containerId" | "targetType" | "targetId"> & {
      workspaceId?: string | null;
      ownerUserId?: string | null;
      sectionKey?: string | null;
      targetKey?: string | null;
      action: "create" | "update" | "delete" | "restore";
      before?: unknown;
      after?: unknown;
      source?: HistoryRow["source"];
      batchId?: string | null;
      client?: Client;
      by: PersonKey;
      daysAgo: number;
      hour?: number;
      revertedFromId?: string | null;
    },
  ) => {
    const id = uid("history", String(world.changeHistory.length));
    world.changeHistory.push({
      id,
      workspaceId: h.workspaceId === undefined ? BCDX : h.workspaceId,
      ownerUserId: h.ownerUserId ?? null,
      containerType: h.containerType,
      containerId: h.containerId,
      sectionKey: h.sectionKey ?? null,
      targetType: h.targetType,
      targetId: h.targetId,
      targetKey: h.targetKey ?? null,
      action: h.action,
      before: h.before ?? null,
      after: h.after ?? null,
      source: h.source ?? "manual",
      batchId: h.batchId ?? null,
      client: h.client ?? "web",
      revertedFromId: h.revertedFromId ?? null,
      changedById: userId(h.by),
      changedAt: clock.ago(h.daysAgo, h.hour ?? 10),
    });
    return id;
  };
  const answerOf = (idea: IdeaRecord, key: string) => {
    const a = idea.validation.spec.answers.find((x) => x.key === key);
    return {
      text: a?.text ?? null,
      fau: a?.fau ?? null,
      confidence: a?.fau === "assumption" ? (a.confidence ?? "medium") : null,
    };
  };
  const validationEntry = (
    idea: IdeaRecord,
    key: string,
    rest: Omit<
      Parameters<typeof entry>[0],
      "containerType" | "containerId" | "targetType" | "targetId" | "targetKey" | "sectionKey"
    >,
  ) =>
    entry({
      containerType: "validation",
      containerId: idea.validation.validationId,
      sectionKey: key.split(".")[1],
      targetType: "validation_answer",
      targetId: idea.validation.validationId,
      targetKey: key,
      ...rest,
    });

  // Piaya: WHO edited by two people, PROBLEM from an AI import, Rent reverted once.
  const piaya = ideas.piaya;
  validationEntry(piaya, "V.01.WHO", {
    action: "create",
    after: { text: "Office workers in Bacolod", fau: null, confidence: null },
    by: "ana",
    daysAgo: 44,
  });
  validationEntry(piaya, "V.01.WHO", {
    action: "update",
    before: { text: "Office workers in Bacolod", fau: null, confidence: null },
    after: {
      text: "Office workers and families sending gifts abroad",
      fau: null,
      confidence: null,
    },
    by: "paolo",
    daysAgo: 30,
  });
  validationEntry(piaya, "V.01.WHO", {
    action: "update",
    before: {
      text: "Office workers and families sending gifts abroad",
      fau: null,
      confidence: null,
    },
    after: answerOf(piaya, "V.01.WHO"),
    by: "ana",
    daysAgo: 28,
    client: "ios",
  });
  const importBatch = uid("batch", "piaya-import");
  for (const key of ["V.01.PROBLEM", "V.01.FREQUENCY", "V.01.PAYMENT"]) {
    validationEntry(piaya, key, {
      action: "create",
      after: { text: answerOf(piaya, key).text, fau: null, confidence: null },
      source: "ai_import",
      batchId: importBatch,
      by: "ana",
      daysAgo: 43,
    });
  }
  validationEntry(piaya, "V.01.PROBLEM", {
    action: "update",
    before: { text: answerOf(piaya, "V.01.PROBLEM").text, fau: null, confidence: null },
    after: answerOf(piaya, "V.01.PROBLEM"),
    by: "ana",
    daysAgo: 42,
  });

  const rentId = costRowId("piaya", "monthly.rent");
  const rent = (
    extra: Omit<
      Parameters<typeof entry>[0],
      "containerType" | "containerId" | "targetType" | "targetId" | "sectionKey"
    >,
  ) =>
    entry({
      containerType: "validation",
      containerId: piaya.validation.validationId,
      sectionKey: "costs",
      targetType: "cost_item",
      targetId: rentId,
      ...extra,
    });
  rent({ action: "create", after: { amount: 10000, fau: null }, by: "ana", daysAgo: 36 });
  const rentUpdate = rent({
    action: "update",
    before: { amount: 10000, fau: null },
    after: { amount: 15000, fau: null },
    by: "kenji",
    daysAgo: 20,
  });
  rent({
    action: "update",
    before: { amount: 15000, fau: null },
    after: { amount: 10000, fau: null },
    source: "revert",
    revertedFromId: rentUpdate,
    by: "ana",
    daysAgo: 19,
  });
  rent({
    action: "update",
    before: { amount: 10000, fau: null },
    after: { amount: 12000, fau: "fact" },
    by: "ana",
    daysAgo: 18,
    client: "ios",
  });

  // Health Bowl: three answers left Unclassified by an AI import, Permits marked Unknown, OCEAN reverted.
  const bowl = ideas["health-bowl"];
  const bowlBatch = uid("batch", "bowl-import");
  for (const key of ["V.01.BEHAVIOR", "V.01.SWITCHING", "V.02.DRIVERS"]) {
    validationEntry(bowl, key, {
      action: "create",
      after: { text: answerOf(bowl, key).text, fau: null, confidence: null },
      source: "ai_import",
      batchId: bowlBatch,
      by: "kenji",
      daysAgo: 8,
      client: "ios",
    });
  }
  const permitsId = costRowId("health-bowl", "initial.permits");
  entry({
    containerType: "validation",
    containerId: bowl.validation.validationId,
    sectionKey: "costs",
    targetType: "cost_item",
    targetId: permitsId,
    action: "update",
    before: { amount: null, fau: null },
    after: { amount: null, fau: "unknown" },
    by: "kenji",
    daysAgo: 12,
  });
  validationEntry(bowl, "V.02.OCEAN", {
    action: "create",
    after: { text: "Red", fau: "assumption", confidence: "medium" },
    by: "kenji",
    daysAgo: 29,
  });
  const oceanUpdate = validationEntry(bowl, "V.02.OCEAN", {
    action: "update",
    before: { text: "Red", fau: "assumption", confidence: "medium" },
    after: { text: "Mixed", fau: "assumption", confidence: "medium" },
    by: "kenji",
    daysAgo: 20,
  });
  validationEntry(bowl, "V.02.OCEAN", {
    action: "update",
    before: { text: "Mixed", fau: "assumption", confidence: "medium" },
    after: { text: "Red", fau: "assumption", confidence: "medium" },
    source: "revert",
    revertedFromId: oceanUpdate,
    by: "kenji",
    daysAgo: 19,
  });

  // Laundry: the price fell from ₱70 to ₱60.
  const laundry = ideas.laundry;
  const priceId = laundry.validation.validationId;
  entry({
    containerType: "validation",
    containerId: priceId,
    sectionKey: "economics",
    targetType: "economics_input",
    targetId: priceId,
    targetKey: "selling_price",
    action: "create",
    after: { value: 70, fau: "assumption", confidence: "medium" },
    by: "paolo",
    daysAgo: 42,
  });
  entry({
    containerType: "validation",
    containerId: priceId,
    sectionKey: "economics",
    targetType: "economics_input",
    targetId: priceId,
    targetKey: "selling_price",
    action: "update",
    before: { value: 70, fau: "assumption", confidence: "medium" },
    after: { value: 60, fau: "assumption", confidence: "medium" },
    by: "paolo",
    daysAgo: 36,
  });

  // Study Café: WHO written and then reworded.
  const cafe = ideas["study-cafe"];
  validationEntry(cafe, "V.01.WHO", {
    action: "create",
    after: { text: "Students", fau: null, confidence: null },
    by: "paolo",
    daysAgo: 88,
  });
  validationEntry(cafe, "V.01.WHO", {
    action: "update",
    before: { text: "Students", fau: null, confidence: null },
    after: answerOf(cafe, "V.01.WHO"),
    by: "paolo",
    daysAgo: 86,
  });

  // The corporate variant was made by duplicating Piaya: one batch of creates.
  const corp = ideas["piaya-corp"];
  const dupBatch = uid("batch", "piaya-corp-duplicate");
  const dup = (
    target: { type: string; id: string; key?: string },
    section: string,
    after: unknown,
  ) =>
    entry({
      containerType: "validation",
      containerId: corp.validation.validationId,
      sectionKey: section,
      targetType: target.type,
      targetId: target.id,
      targetKey: target.key ?? null,
      action: "create",
      after,
      source: "duplicate",
      batchId: dupBatch,
      by: "kenji",
      daysAgo: 8,
      client: "web",
    });
  const vid = corp.validation.validationId;
  for (const a of world.validationAnswers.filter((r) => r.validationId === vid)) {
    dup(
      { type: "validation_answer", id: vid, key: a.questionKey },
      a.questionKey.split(".")[1] ?? "01",
      { text: a.text, fau: a.fau, confidence: a.confidence },
    );
  }
  for (const r of world.researchLogEntries.filter((x) => x.validationId === vid))
    dup({ type: "research_log_entry", id: r.id ?? "" }, "research_log", { topic: r.topic });
  for (const c of world.competitors.filter((x) => x.validationId === vid))
    dup({ type: "competitor", id: c.id ?? "" }, "competitors", {
      name: c.name,
      typicalPrice: c.typicalPrice,
    });
  for (const c of world.costItems.filter((x) => x.validationId === vid))
    dup({ type: "cost_item", id: c.id ?? "" }, "costs", {
      name: c.name,
      amount: c.amount,
      percent: c.percent,
      fau: c.fau,
    });
  for (const e of world.economicsInputs.filter((x) => x.validationId === vid))
    dup({ type: "economics_input", id: vid, key: e.fieldKey }, "economics", {
      value: e.value,
      fau: e.fau,
    });
  for (const a of world.assumptions.filter((x) => x.validationId === vid))
    dup({ type: "assumption", id: a.id ?? "" }, "assumptions_risks", { statement: a.statement });
  for (const r of world.risks.filter((x) => x.validationId === vid))
    dup({ type: "risk", id: r.id ?? "" }, "assumptions_risks", { statement: r.statement });

  // Plan drafts: the copied answers and the preset execution rows, one batch per plan.
  const drafted: Record<PlanKey, { by: PersonKey; daysAgo: number }> = {
    "piaya-a": { by: "ana", daysAgo: 24 },
    "piaya-b": { by: "ana", daysAgo: 6 },
    "study-cafe-a": { by: "paolo", daysAgo: 60 },
  };
  for (const [key, { by, daysAgo }] of Object.entries(drafted) as [
    PlanKey,
    (typeof drafted)[PlanKey],
  ][]) {
    const plan = plans[key];
    const batch = uid("batch", `${key}-draft`);
    for (const a of world.planAnswers.filter(
      (r) => r.businessPlanId === plan.id && r.copiedFrom != null,
    )) {
      entry({
        containerType: "business_plan",
        containerId: plan.id,
        sectionKey: a.questionKey.split(".")[1],
        targetType: "plan_answer",
        targetId: plan.id,
        targetKey: a.questionKey,
        action: "create",
        after: { text: a.text, rows: a.rows },
        source: "plan_draft",
        batchId: batch,
        by,
        daysAgo,
      });
    }
    for (const item of world.executionItems.filter(
      (r) => r.businessPlanId === plan.id && r.fromPreset,
    )) {
      entry({
        containerType: "business_plan",
        containerId: plan.id,
        sectionKey: "execution",
        targetType: "execution_item",
        targetId: item.id ?? "",
        action: "create",
        after: { type: item.type, title: item.title },
        source: "plan_draft",
        batchId: batch,
        by,
        daysAgo,
      });
    }
  }

  // Piaya Plan A: the Delay condition was reworded after the version and the Go / No-Go were recorded.
  const planA = plans["piaya-a"];
  const delayIf = planA.answers["P.24.2"];
  entry({
    containerType: "business_plan",
    containerId: planA.id,
    sectionKey: "24",
    targetType: "plan_answer",
    targetId: planA.id,
    targetKey: "P.24.2",
    action: "update",
    before: { text: delayIf?.previousText },
    after: { text: delayIf?.text },
    by: "ana",
    daysAgo: 2,
  });

  // Ana's self analysis: first answers typed, then a few from an AI conversation.
  const sa = selfAnalysisId("ana");
  const saEntry = (
    key: string,
    extra: Partial<Parameters<typeof entry>[0]> &
      Pick<Parameters<typeof entry>[0], "action" | "daysAgo">,
  ) =>
    entry({
      workspaceId: null,
      ownerUserId: userId("ana"),
      containerType: "self_analysis",
      containerId: sa,
      sectionKey: key.split(".")[1],
      targetType: "self_analysis_answer",
      targetId: sa,
      targetKey: key,
      by: "ana",
      ...extra,
    });
  saEntry("SA.WHY.1", { action: "create", after: { text: "I want more control." }, daysAgo: 58 });
  const why = world.selfAnalysisAnswers.find((a) => a.id === uid("sa-answer", "ana", "SA.WHY.1"));
  saEntry("SA.WHY.1", {
    action: "update",
    before: { text: "I want more control." },
    after: { text: why?.text },
    daysAgo: 57,
  });
  const saBatch = uid("batch", "ana-sa-import");
  for (const key of ["SA.BE.1", "SA.BE.2", "SA.DO.1"]) {
    const a = world.selfAnalysisAnswers.find((x) => x.id === uid("sa-answer", "ana", key));
    saEntry(key, {
      action: "create",
      after: { text: a?.text },
      source: "ai_import",
      batchId: saBatch,
      daysAgo: 55,
      client: "web",
    });
  }
}
