import { schema } from "@moonx/db";
import type { Activity, LinkTarget, TargetType, UserRef } from "@moonx/schemas";
import { and, desc, eq, inArray, isNull, max, ne, or, sql } from "drizzle-orm";
import type { Executor } from "./db";
import { excerpt, loadDecisionSummaries } from "./decision-log";
import { iso } from "./dto";
import { i18n } from "./i18n";
import { loadUserRefs } from "./users";
import { QUESTION_SCREEN } from "./validation-data";

/** How many entries Recent activity shows (design-spec 6.9). */
const ACTIVITY_LIMIT = 20;

interface Target {
  type: TargetType;
  id: string;
  key: string | null;
}

interface Resolved {
  idea: { id: string; name: string } | null;
  plan: { id: string; name: string } | null;
  /** Name of the touched row, for the label. */
  name: string | null;
}

const targetKey = (t: Target) => `${t.type}:${t.id}:${t.key ?? ""}`;
const VALIDATION_ROWS = [
  "research_log_entry",
  "competitor",
  "assumption",
  "risk",
  "cost_item",
] as const satisfies TargetType[];
const PLAN_LEVEL = ["plan_answer", "pitch_slide", "business_plan"] as const;

/** The idea and plan a target sits under, and the name of a row target, in a fixed number of queries. */
async function resolveTargets(
  db: Executor,
  workspaceId: string,
  targets: Target[],
): Promise<Map<string, Resolved>> {
  const ids = (match: (t: Target) => boolean) => [
    ...new Set(targets.filter(match).map((t) => t.id)),
  ];
  const isValidationLevel = (t: Target) =>
    t.type === "validation_answer" ||
    t.type === "economics_input" ||
    (t.type === "template_version" && t.key === "validation");
  const isPlanLevel = (t: Target) =>
    (PLAN_LEVEL as readonly string[]).includes(t.type) ||
    (t.type === "template_version" && t.key === "business_plan");

  const rowNames = new Map<string, { validationId: string; name: string }>();
  const lookups: [(typeof VALIDATION_ROWS)[number], () => Promise<void>][] = [
    [
      "research_log_entry",
      async () => {
        const rows = await db
          .select({
            id: schema.researchLogEntries.id,
            v: schema.researchLogEntries.validationId,
            name: schema.researchLogEntries.topic,
          })
          .from(schema.researchLogEntries)
          .where(
            inArray(
              schema.researchLogEntries.id,
              ids((t) => t.type === "research_log_entry"),
            ),
          );
        for (const r of rows)
          rowNames.set(`research_log_entry:${r.id}`, { validationId: r.v, name: r.name });
      },
    ],
    [
      "competitor",
      async () => {
        const rows = await db
          .select({
            id: schema.competitors.id,
            v: schema.competitors.validationId,
            name: schema.competitors.name,
          })
          .from(schema.competitors)
          .where(
            inArray(
              schema.competitors.id,
              ids((t) => t.type === "competitor"),
            ),
          );
        for (const r of rows)
          rowNames.set(`competitor:${r.id}`, { validationId: r.v, name: r.name });
      },
    ],
    [
      "assumption",
      async () => {
        const rows = await db
          .select({
            id: schema.assumptions.id,
            v: schema.assumptions.validationId,
            name: schema.assumptions.statement,
          })
          .from(schema.assumptions)
          .where(
            inArray(
              schema.assumptions.id,
              ids((t) => t.type === "assumption"),
            ),
          );
        for (const r of rows)
          rowNames.set(`assumption:${r.id}`, { validationId: r.v, name: r.name });
      },
    ],
    [
      "risk",
      async () => {
        const rows = await db
          .select({
            id: schema.risks.id,
            v: schema.risks.validationId,
            name: schema.risks.statement,
          })
          .from(schema.risks)
          .where(
            inArray(
              schema.risks.id,
              ids((t) => t.type === "risk"),
            ),
          );
        for (const r of rows) rowNames.set(`risk:${r.id}`, { validationId: r.v, name: r.name });
      },
    ],
    [
      "cost_item",
      async () => {
        const rows = await db
          .select({
            id: schema.costItems.id,
            v: schema.costItems.validationId,
            name: schema.costItems.name,
          })
          .from(schema.costItems)
          .where(
            inArray(
              schema.costItems.id,
              ids((t) => t.type === "cost_item"),
            ),
          );
        for (const r of rows)
          rowNames.set(`cost_item:${r.id}`, { validationId: r.v, name: r.name });
      },
    ],
  ];
  await Promise.all(
    lookups.filter(([type]) => targets.some((t) => t.type === type)).map(([, run]) => run()),
  );

  const executionRows = targets.some((t) => t.type === "execution_item")
    ? await db
        .select({
          id: schema.executionItems.id,
          planId: schema.executionItems.businessPlanId,
          title: schema.executionItems.title,
        })
        .from(schema.executionItems)
        .where(
          inArray(
            schema.executionItems.id,
            ids((t) => t.type === "execution_item"),
          ),
        )
    : [];

  const validationIds = [
    ...new Set([...ids(isValidationLevel), ...[...rowNames.values()].map((r) => r.validationId)]),
  ];
  const planIds = [...new Set([...ids(isPlanLevel), ...executionRows.map((r) => r.planId)])];
  const validations =
    validationIds.length === 0
      ? []
      : await db
          .select({ id: schema.validations.id, ideaId: schema.validations.ideaId })
          .from(schema.validations)
          .where(inArray(schema.validations.id, validationIds));
  const plans =
    planIds.length === 0
      ? []
      : await db
          .select({
            id: schema.businessPlans.id,
            name: schema.businessPlans.name,
            ideaId: schema.businessPlans.ideaId,
          })
          .from(schema.businessPlans)
          .where(inArray(schema.businessPlans.id, planIds));
  const ideaIds = [
    ...new Set([
      ...validations.map((v) => v.ideaId),
      ...plans.map((p) => p.ideaId),
      ...ids((t) => t.type === "idea"),
    ]),
  ];
  const ideas =
    ideaIds.length === 0
      ? []
      : await db
          .select({ id: schema.ideas.id, name: schema.ideas.name })
          .from(schema.ideas)
          .where(and(inArray(schema.ideas.id, ideaIds), eq(schema.ideas.workspaceId, workspaceId)));
  const ideaOf = new Map(ideas.map((i) => [i.id, i]));
  const ideaOfValidation = new Map(validations.map((v) => [v.id, v.ideaId]));
  const planOf = new Map(plans.map((p) => [p.id, p]));
  const executionOf = new Map(executionRows.map((r) => [r.id, r]));

  const result = new Map<string, Resolved>();
  for (const t of targets) {
    let ideaId: string | undefined;
    let plan: { id: string; name: string } | null = null;
    let name: string | null = null;
    if (t.type === "idea") ideaId = t.id;
    else if (isValidationLevel(t)) ideaId = ideaOfValidation.get(t.id);
    else if (isPlanLevel(t)) {
      const p = planOf.get(t.id);
      ideaId = p?.ideaId;
      name = p?.name ?? null;
      plan = p ? { id: p.id, name: p.name } : null;
    } else if (t.type === "execution_item") {
      const row = executionOf.get(t.id);
      const p = row ? planOf.get(row.planId) : undefined;
      ideaId = p?.ideaId;
      plan = p ? { id: p.id, name: p.name } : null;
      name = row?.title ?? null;
    } else {
      const row = rowNames.get(`${t.type}:${t.id}`);
      ideaId = row ? ideaOfValidation.get(row.validationId) : undefined;
      name = row?.name ?? null;
    }
    const idea = ideaId ? ideaOf.get(ideaId) : undefined;
    result.set(targetKey(t), { idea: idea ?? null, plan, name });
  }
  return result;
}

const humanize = (key: string) => {
  const text = key.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** The text that names a touched item: "01 WHO", "Costs · Rent", an idea's name (HistoryEntry.label). */
function labelOf(t: Target, resolved: Resolved): string {
  const named = (prefix: string) => `${prefix} · ${excerpt(resolved.name) ?? ""}`.trimEnd();
  switch (t.type) {
    case "validation_answer": {
      const [, section, ...rest] = (t.key ?? "").split(".");
      return [section, rest.join(".").replaceAll("_", " ")].filter(Boolean).join(" ");
    }
    case "economics_input":
      return `${i18n.t("common:target.economics")} · ${humanize(t.key ?? "")}`;
    case "research_log_entry":
      return named(i18n.t("common:target.researchLog"));
    case "competitor":
      return named(i18n.t("common:target.competitor"));
    case "assumption":
      return named(i18n.t("common:target.assumption"));
    case "risk":
      return named(i18n.t("common:target.risk"));
    case "cost_item":
      return named(i18n.t("common:target.cost"));
    case "plan_answer":
      return `${i18n.t("common:target.plan")} ${(t.key ?? "").replace(/^P\./, "")}`.trimEnd();
    case "pitch_slide":
      return `${i18n.t("common:target.pitchDeck")} · ${humanize((t.key ?? "").split(".").at(-1) ?? "")}`;
    case "execution_item":
      return named(i18n.t("common:target.execution"));
    case "business_plan":
      return named(i18n.t("common:target.plan"));
    case "template_version":
      return i18n.t("common:target.templateVersion");
    case "idea":
      return resolved.idea?.name ?? "";
    default:
      return "";
  }
}

/** Where tapping an activity entry goes, by the screen that shows the item (design-spec 3). */
function linkOf(
  workspaceId: string,
  t: Target,
  resolved: Resolved,
  panel?: "comments",
): LinkTarget {
  const base: LinkTarget = {
    screen: 13,
    workspaceId,
    ...(resolved.idea ? { ideaId: resolved.idea.id } : {}),
    ...(resolved.plan ? { planId: resolved.plan.id } : {}),
    target: { type: t.type, id: t.id, ...(t.key ? { key: t.key } : {}) },
    ...(panel ? { panel } : {}),
  };
  const row = (screen: number): LinkTarget => ({ ...base, screen, rowId: t.id });
  switch (t.type) {
    case "validation_answer": {
      const section = (t.key ?? "").split(".")[1] ?? "";
      return {
        ...base,
        screen: QUESTION_SCREEN[section] ?? 11,
        sectionKey: section,
        ...(t.key ? { questionKey: t.key } : {}),
      };
    }
    case "economics_input":
      return {
        ...base,
        screen: 18,
        ...(t.key ? { field: t.key as NonNullable<LinkTarget["field"]> } : {}),
      };
    case "research_log_entry":
      return row(14);
    case "competitor":
      return row(15);
    case "assumption":
    case "risk":
      return row(16);
    case "cost_item":
      return row(17);
    case "plan_answer": {
      const itemNo = Number((t.key ?? "").split(".")[1]);
      return {
        ...base,
        screen: 21,
        ...(t.key ? { questionKey: t.key } : {}),
        ...(Number.isInteger(itemNo) ? { itemNo } : {}),
      };
    }
    case "pitch_slide":
      return { ...base, screen: 23 };
    case "execution_item":
      return row(22);
    case "business_plan":
      return { ...base, screen: 20 };
    case "template_version":
      return { ...base, screen: t.key === "business_plan" ? 20 : 13 };
    default:
      return base;
  }
}

interface Entry {
  activity: Omit<Activity, "actor">;
  actorId: string;
  tie: string;
}

async function changeEntries(db: Executor, workspaceId: string): Promise<Entry[]> {
  // One entry per operation: rows that share a batch collapse into it.
  const key = sql<string>`coalesce(${schema.changeHistory.batchId}, ${schema.changeHistory.id})`;
  const scope = and(
    eq(schema.changeHistory.workspaceId, workspaceId),
    isNull(schema.changeHistory.ownerUserId),
    ne(schema.changeHistory.containerType, "self_analysis"),
  );
  const groups = await db
    .select({ key: key.as("group_key"), at: max(schema.changeHistory.changedAt) })
    .from(schema.changeHistory)
    .where(scope)
    .groupBy(key)
    .orderBy(desc(max(schema.changeHistory.changedAt)))
    .limit(ACTIVITY_LIMIT);
  if (groups.length === 0) return [];
  const keys = groups.map((g) => g.key);
  const rows = await db
    .select()
    .from(schema.changeHistory)
    .where(
      and(
        scope,
        or(inArray(schema.changeHistory.batchId, keys), inArray(schema.changeHistory.id, keys)),
      ),
    )
    .orderBy(desc(schema.changeHistory.changedAt), desc(schema.changeHistory.id));

  // A batch is shown by its idea row when it has one (a copy), else by its newest row.
  const chosen = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const k = row.batchId ?? row.id;
    const current = chosen.get(k);
    if (!current || (row.targetType === "idea" && current.targetType !== "idea"))
      chosen.set(k, row);
  }
  const picked = [...chosen.values()];
  const targets: Target[] = picked.map((r) => ({
    type: r.targetType as TargetType,
    id: r.targetId,
    key: r.targetKey,
  }));
  const resolved = await resolveTargets(db, workspaceId, targets);
  return picked.map((row, i) => {
    const target = targets[i] as Target;
    const info = resolved.get(targetKey(target)) as Resolved;
    const at = groups.find((g) => g.key === (row.batchId ?? row.id))?.at ?? row.changedAt;
    return {
      activity: {
        kind: "change",
        at: iso(at),
        summary: labelOf(target, info),
        idea: info.idea,
        plan: info.plan,
        link: linkOf(workspaceId, target, info),
      },
      actorId: row.changedById,
      tie: row.id,
    };
  });
}

/** Excludes comments whose target row (a research log entry, competitor, ...) was soft-deleted. */
const notOnDeletedRow = () => {
  const deleted = (type: string, table: string) =>
    sql`not (${schema.comments.targetType} = ${type} and exists (select 1 from ${sql.raw(table)} where id = ${schema.comments.targetId} and deleted_at is not null))`;
  return and(
    deleted("research_log_entry", "research_log_entries"),
    deleted("competitor", "competitors"),
    deleted("assumption", "assumptions"),
    deleted("risk", "risks"),
    deleted("cost_item", "cost_items"),
    deleted("execution_item", "execution_items"),
  );
};

async function commentEntries(db: Executor, workspaceId: string): Promise<Entry[]> {
  const rows = await db
    .select()
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.workspaceId, workspaceId),
        isNull(schema.comments.deletedAt),
        ne(schema.comments.targetType, "self_analysis_answer"),
        // Comments on a deleted row stay hidden with it (design-spec 6.0.4).
        notOnDeletedRow(),
      ),
    )
    .orderBy(desc(schema.comments.createdAt), desc(schema.comments.id))
    .limit(ACTIVITY_LIMIT);
  const targets: Target[] = rows.map((r) => ({
    type: r.targetType as TargetType,
    id: r.targetId,
    key: r.targetKey,
  }));
  const resolved = await resolveTargets(db, workspaceId, targets);
  return rows.map((row, i) => {
    const target = targets[i] as Target;
    const info = resolved.get(targetKey(target)) as Resolved;
    return {
      activity: {
        kind: "comment",
        at: iso(row.createdAt),
        summary: labelOf(target, info),
        idea: info.idea,
        plan: info.plan,
        link: linkOf(workspaceId, target, info, "comments"),
      },
      actorId: row.authorId,
      tie: row.id,
    };
  });
}

async function decisionEntries(db: Executor, workspaceId: string): Promise<Entry[]> {
  const summaries = await loadDecisionSummaries(
    db,
    workspaceId,
    eq(schema.decisionLogEntries.workspaceId, workspaceId),
    ACTIVITY_LIMIT,
  );
  return summaries.map((s) => ({
    activity: {
      kind: s.kind === "validation_decision" ? "decision" : s.kind,
      at: s.recordedAt,
      summary: (s.kind === "version_saved" ? s.versionName : s.value) ?? "",
      idea: s.idea,
      plan: s.plan,
      link:
        s.kind === "validation_decision" || !s.plan
          ? { screen: 13, workspaceId, ideaId: s.idea.id }
          : { screen: 20, workspaceId, ideaId: s.idea.id, planId: s.plan.id },
    },
    actorId: s.recordedBy.id,
    tie: s.id,
  }));
}

/**
 * D4. The newest `ACTIVITY_LIMIT` movements of the workspace: changes (one per operation),
 * comments and decision-log entries. Self analysis never appears: its history has no workspace
 * and its comments are filtered out (design-spec 6.9).
 */
export async function loadActivity(db: Executor, workspaceId: string): Promise<Activity[]> {
  const [changes, comments, decisions] = await Promise.all([
    changeEntries(db, workspaceId),
    commentEntries(db, workspaceId),
    decisionEntries(db, workspaceId),
  ]);
  const newest = [...changes, ...comments, ...decisions]
    .sort((a, b) => b.activity.at.localeCompare(a.activity.at) || b.tie.localeCompare(a.tie))
    .slice(0, ACTIVITY_LIMIT);
  const refs = await loadUserRefs(
    db,
    newest.map((e) => e.actorId),
    workspaceId,
  );
  return newest.map((e) => ({ ...e.activity, actor: refs.get(e.actorId) as UserRef }));
}
