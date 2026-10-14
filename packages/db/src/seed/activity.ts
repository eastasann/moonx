import { buildDecisionSnapshot, evaluateValidation } from "@moonx/domain";
import type { LinkTarget, TargetRef } from "@moonx/schemas";
import { eq, sql } from "drizzle-orm";
import {
  businessPlans,
  commentMentions,
  comments,
  decisionLogEntries,
  notifications,
} from "../schema";
import {
  BCDX_MEMBERS,
  BCDX_WORKSPACE_ID,
  type SeedContext,
  type UserKey,
  userId,
} from "./context";
import { validationStateAt, type WrittenIdea } from "./ideas";
import { seedId } from "./ids";
import type { WrittenPlan } from "./plans";
import { loadValidation, writerView } from "./validation-state";

const HOUR = 60 * 60 * 1000;
/** How long after a notification arrived its reader opened it. */
const READ_AFTER_HOURS = 3;

export type DecisionSpec =
  | {
      kind: "validation_decision";
      value: "proceed" | "hold" | "drop";
      reason: string;
    }
  | {
      kind: "go_no_go";
      value: "launch" | "delay" | "stop";
      reason: string;
      plan: WrittenPlan;
    }
  | { kind: "version_saved"; plan: WrittenPlan };

/** When a decision was recorded and by whom, in days (and hours) before the run. */
export interface DecisionWhen {
  daysAgo: number;
  hoursAgo?: number;
  by: UserKey;
}

/**
 * Records one decision log entry with the snapshot of the validation as it stood then
 * (SDD 5.11), and notifies every other BCDX member (design-spec 6.15). A saved version is
 * recorded at the moment and by the person the plan writer saved it with.
 *
 * @param label Names the entry among the idea's entries, for its id.
 */
export async function recordDecision(
  ctx: SeedContext,
  idea: WrittenIdea,
  label: string,
  decision: DecisionSpec,
  when?: DecisionWhen,
): Promise<string> {
  const { tx, clock, activity } = ctx;
  const plan = decision.kind === "validation_decision" ? null : decision.plan;
  const version = plan?.version ?? null;
  let recordedAt: Date;
  let by: UserKey;
  if (decision.kind === "version_saved") {
    if (version === null)
      throw new Error(`${idea.spec.key}: ${plan?.name} has no saved version`);
    recordedAt = version.savedAt;
    by = version.by;
  } else {
    if (when === undefined)
      throw new Error(`${idea.spec.key} ${label}: no time or recorder`);
    recordedAt = clock.ago(when.daysAgo, when.hoursAgo);
    by = when.by;
  }

  const loaded = await loadValidation(tx, idea.validationId);
  const evaluation = evaluateValidation(
    validationStateAt(loaded.state, idea, recordedAt),
    writerView(loaded),
  );
  const planVersion =
    version !== null && version.savedAt <= recordedAt
      ? { id: version.id, name: version.name }
      : null;
  const snapshot = buildDecisionSnapshot(
    evaluation,
    decision.kind === "go_no_go" && plan !== null
      ? { conditions: plan.conditionsAt(recordedAt), planVersion }
      : decision.kind === "version_saved"
        ? { planVersion }
        : {},
  );
  const id = seedId("decision", idea.spec.key, label);
  await tx.insert(decisionLogEntries).values({
    id,
    workspaceId: BCDX_WORKSPACE_ID,
    ideaId: idea.ideaId,
    businessPlanId: plan?.planId ?? null,
    planVersionId: planVersion?.id ?? null,
    kind: decision.kind,
    value: decision.kind === "version_saved" ? null : decision.value,
    reason: decision.kind === "version_saved" ? null : decision.reason,
    snapshot,
    recordedById: userId(by),
    recordedAt,
    createdAt: recordedAt,
  });

  const link: LinkTarget =
    plan === null
      ? { screen: 13, workspaceId: BCDX_WORKSPACE_ID, ideaId: idea.ideaId }
      : {
          screen: 20,
          workspaceId: BCDX_WORKSPACE_ID,
          ideaId: idea.ideaId,
          planId: plan.planId,
        };
  const recipients = BCDX_MEMBERS.filter((member) => member !== by);
  await tx.insert(notifications).values(
    recipients.map((recipient) => ({
      id: seedId("notification", id, recipient),
      userId: userId(recipient),
      workspaceId: BCDX_WORKSPACE_ID,
      kind: "decision" as const,
      actorId: userId(by),
      decisionLogEntryId: id,
      link,
      readAt: new Date(recordedAt.getTime() + READ_AFTER_HOURS * HOUR),
      createdAt: recordedAt,
    })),
  );
  activity.touch(BCDX_WORKSPACE_ID, idea.ideaId, recordedAt);
  if (plan !== null)
    await tx
      .update(businessPlans)
      .set({
        // A raw parameter has no column type to serialize a Date by.
        lastActivityAt: sql`greatest(${businessPlans.lastActivityAt}, ${recordedAt.toISOString()}::timestamptz)`,
      })
      .where(eq(businessPlans.id, plan.planId));
  return id;
}

/** Which screen a comment's target sits on (SDD 6.3「画面と節の対応」). */
export interface CommentPlace {
  containerType: "self_analysis" | "validation" | "business_plan" | "idea";
  containerId: string;
  sectionKey: string | null;
  /** In the idea it belongs to, if any, for the idea's last activity. */
  ideaId: string | null;
}

export interface CommentSpec {
  key: string;
  author: UserKey;
  body: string;
  daysAgo: number;
  hoursAgo?: number;
  /** People named with @ in the body. */
  mentions?: UserKey[];
}

export interface ThreadSpec {
  target: TargetRef;
  place: CommentPlace;
  /** Where its notifications open: the item, with the comment panel open. */
  link: LinkTarget;
  /**
   * Who hears of every comment besides the thread's own commenters (design-spec 6.15):
   * the idea's proposer, the plan's creator, or the self-analysis's owner.
   */
  owners: UserKey[];
  root: CommentSpec;
  replies?: CommentSpec[];
  resolved?: { by: UserKey; daysAgo: number };
  /** Notifications these people have not opened yet. Everything else has been read. */
  unreadBy?: UserKey[];
}

/**
 * Writes a comment thread with its mentions and the notifications design-spec 6.15
 * sends: a mention to each person named, and a comment notice to the owners and earlier
 * commenters. A person gets one notification per comment, a mention if named.
 */
export async function writeThread(
  { tx, clock, activity }: SeedContext,
  thread: ThreadSpec,
): Promise<void> {
  const rootId = seedId("comment", thread.root.key);
  const commenters: UserKey[] = [];
  for (const comment of [thread.root, ...(thread.replies ?? [])]) {
    const id = seedId("comment", comment.key);
    const createdAt = clock.ago(comment.daysAgo, comment.hoursAgo);
    const isRoot = comment === thread.root;
    await tx.insert(comments).values({
      id,
      workspaceId: BCDX_WORKSPACE_ID,
      containerType: thread.place.containerType,
      containerId: thread.place.containerId,
      sectionKey: thread.place.sectionKey,
      targetType: thread.target
        .type as (typeof comments.$inferInsert)["targetType"],
      targetId: thread.target.id,
      targetKey: thread.target.key ?? null,
      parentId: isRoot ? null : rootId,
      authorId: userId(comment.author),
      body: comment.body,
      resolvedAt:
        isRoot && thread.resolved ? clock.ago(thread.resolved.daysAgo) : null,
      resolvedById:
        isRoot && thread.resolved ? userId(thread.resolved.by) : null,
      createdAt,
      updatedAt: createdAt,
    });
    const mentioned = comment.mentions ?? [];
    if (mentioned.length > 0)
      await tx.insert(commentMentions).values(
        mentioned.map((user) => ({
          id: seedId("comment_mention", comment.key, user),
          commentId: id,
          userId: userId(user),
          createdAt,
        })),
      );
    const told = new Set<UserKey>([comment.author]);
    const notices: { user: UserKey; kind: "mention" | "comment" }[] = [];
    for (const user of mentioned)
      if (!told.has(user)) {
        told.add(user);
        notices.push({ user, kind: "mention" });
      }
    for (const user of [...thread.owners, ...commenters])
      if (!told.has(user)) {
        told.add(user);
        notices.push({ user, kind: "comment" });
      }
    if (notices.length > 0)
      await tx.insert(notifications).values(
        notices.map(({ user, kind }) => ({
          id: seedId("notification", id, user),
          userId: userId(user),
          workspaceId: BCDX_WORKSPACE_ID,
          kind,
          actorId: userId(comment.author),
          commentId: id,
          link: thread.link,
          readAt: thread.unreadBy?.includes(user)
            ? null
            : new Date(createdAt.getTime() + READ_AFTER_HOURS * HOUR),
          createdAt,
        })),
      );
    commenters.push(comment.author);
    activity.touch(BCDX_WORKSPACE_ID, thread.place.ideaId, createdAt);
  }
}
