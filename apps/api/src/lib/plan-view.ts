import { schema } from "@moonx/db";
import type {
  DecisionValue,
  KeyMetrics,
  ScenarioColumn,
  TemplateQuestion,
  TemplateRef,
  UserRef,
  Versioned,
} from "@moonx/schemas";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { ApiError } from "../errors";
import { addDays } from "./dashboard-data";
import type { Executor } from "./db";
import { iso, versionedOf } from "./dto";
import { buildExecutionItems, type ExecutionItem, sortExecutionItems } from "./execution";
import {
  itemKey,
  loadPlanVersion,
  type PlanBundle,
  type PlanSnapshot,
  type SnapshotExecutionItem,
} from "./plan-context";
import { buildReferences, type PlanReference, type ReferenceSpec } from "./plan-reference";
import { buildPlanAnswers, type PlanAnswer } from "./plan-write";
import { loadPlanSummaries, type PlanSummary } from "./plans";
import { loadTemplateRef } from "./template";
import { loadUserRefs } from "./users";
import { hasText, LIST_METRIC_KEYS, pickMetrics } from "./validation-data";

/** SDD 5.9 PlanVersionSummary. */
export interface PlanVersionSummary {
  id: string;
  versionNumber: number;
  name: string;
  savedBy: UserRef;
  savedAt: string;
}

/** SDD 5.9 PlanHome. */
export interface PlanHome extends PlanSummary, Versioned {
  ideaId: string;
  workspaceId: string;
  template: TemplateRef;
  businessName: string;
  preparedBy: string;
  date: string;
  latestDecision: DecisionValue | null;
  /** The idea is archived, which makes every plan screen of it read only (design-spec 6.12). */
  ideaArchived: boolean;
  /**
   * Nothing but the draft's own content is there: every answer is still the copy made by M5 and
   * no execution row was added, renamed or changed. Drives the "Start with the items marked [V]"
   * hint of screen 20, which never looks at the saved version being viewed.
   */
  draftOnly: boolean;
  viewingVersion: { id: string; name: string; savedAt: string } | null;
  keyMetrics: Pick<KeyMetrics, (typeof LIST_METRIC_KEYS)[number]>;
  versions: PlanVersionSummary[];
  execution: { dueSoon: number; overdue: number };
  parts: {
    part: "a" | "b";
    completeItems: number;
    totalItems: number;
    items: {
      itemNo: number;
      title: string;
      marks: ("V" | "S")[];
      filled: number;
      total: number;
      commentCount: number;
    }[];
  }[];
}

/** SDD 5.9 PlanItem. `scenarios` is the scenario table of the validation the item's numbers come from. */
export interface PlanItem {
  itemNo: number;
  title: string;
  guidance: string | null;
  readOnly: boolean;
  prompts: TemplateQuestion[];
  answers: PlanAnswer[];
  metrics: KeyMetrics;
  scenarios: ScenarioColumn[];
  execution: ExecutionItem[];
  references: PlanReference[];
}

/** Days ahead of today that "due soon" looks, as in the dashboard (design-spec 6.9). */
const DUE_SOON_DAYS = 7;

const VALIDATION_REFERENCES = new Set([
  "validation_answers",
  "competitors",
  "cost_rows",
  "research_log",
  "metrics",
  "assumptions",
  "risks",
]);

/** The viewer's context for a plan screen. */
export interface PlanViewer {
  role: "owner" | "member" | "viewer";
  today: string;
}

/** The plan as one version froze it, or as it is now: the data the two screens read. */
interface PlanState {
  header: { name: string; businessName: string; preparedBy: string };
  answers: { questionKey: string; text: string | null; rows: unknown[] | null }[];
  keyMetrics: KeyMetrics;
  scenarios: ScenarioColumn[];
  execution: Pick<SnapshotExecutionItem, "type">[];
}

function stateOf(bundle: PlanBundle, snapshot: PlanSnapshot | null): PlanState {
  if (snapshot) return snapshot;
  return {
    header: {
      name: bundle.plan.name,
      businessName: bundle.plan.businessName,
      preparedBy: bundle.plan.preparedBy,
    },
    answers: bundle.answers.map((a) => ({
      questionKey: a.questionKey,
      text: a.text,
      rows: a.rows as unknown[] | null,
    })),
    keyMetrics: bundle.validation.state.keyMetrics,
    scenarios: bundle.validation.state.economics.scenarios,
    execution: bundle.execution,
  };
}

/** The version being viewed (`?versionId=`) with its snapshot, or null for the latest content. */
export async function loadViewedVersion(
  db: Executor,
  planId: string,
  versionId: string | undefined,
) {
  return versionId ? loadPlanVersion(db, planId, versionId) : null;
}

const sectionMarks = (rows: PlanBundle["sections"][number]["rows"]): ("V" | "S")[] => {
  const marks: ("V" | "S")[] = [];
  const usesValidation = rows.some(
    (q) =>
      q.answerType === "linked_metric" ||
      q.copyFrom?.some(
        (s) => s.startsWith("V.") || s.startsWith("IDEA.") || s.startsWith("LIST."),
      ) ||
      (q.reference as ReferenceSpec[] | null)?.some((r) => VALIDATION_REFERENCES.has(r.kind)),
  );
  if (usesValidation) marks.push("V");
  if (
    rows.some((q) =>
      (q.reference as ReferenceSpec[] | null)?.some((r) => r.kind === "self_analysis"),
    )
  ) {
    marks.push("S");
  }
  return marks;
};

/** Comments on a plan's answers per question key, and on its execution items per item id. */
async function loadPlanCommentCounts(db: Executor, bundle: PlanBundle) {
  const executionIds = bundle.execution.map((e) => e.id);
  const rows = await db
    .select({
      type: schema.comments.targetType,
      id: schema.comments.targetId,
      key: schema.comments.targetKey,
      n: count(),
    })
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.workspaceId, bundle.workspaceId),
        isNull(schema.comments.deletedAt),
        inArray(schema.comments.targetId, [bundle.plan.id, ...executionIds]),
        inArray(schema.comments.targetType, ["plan_answer", "execution_item"]),
      ),
    )
    .groupBy(schema.comments.targetType, schema.comments.targetId, schema.comments.targetKey);
  const byKey = new Map<string, number>();
  const byExecution = new Map<string, number>();
  for (const row of rows) {
    if (row.type === "plan_answer" && row.key) byKey.set(row.key, row.n);
    if (row.type === "execution_item") byExecution.set(row.id, row.n);
  }
  return { byKey, byExecution };
}

/** P1 GET rows to P2: the summary of this plan among its idea's plans. */
async function summaryOf(db: Executor, bundle: PlanBundle): Promise<PlanSummary> {
  const all = await loadPlanSummaries(db, bundle.workspaceId, [bundle.idea.id]);
  const found = all.get(bundle.idea.id)?.find((p) => p.id === bundle.plan.id);
  if (!found) throw new ApiError("NOT_FOUND", "Resource not found");
  return found;
}

/** P6 rows with the people who saved them. */
export async function buildVersionSummaries(
  db: Executor,
  bundle: PlanBundle,
): Promise<PlanVersionSummary[]> {
  const refs = await loadUserRefs(
    db,
    bundle.versions.map((v) => v.savedById),
    bundle.workspaceId,
  );
  return bundle.versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    name: v.name,
    savedBy: refs.get(v.savedById) as UserRef,
    savedAt: iso(v.savedAt),
  }));
}

/** P2 GET: the plan home, from the latest content or from one saved version (read only). */
export async function buildPlanHome(
  db: Executor,
  bundle: PlanBundle,
  viewer: PlanViewer,
  viewing: Awaited<ReturnType<typeof loadViewedVersion>>,
): Promise<PlanHome> {
  const state = stateOf(bundle, viewing?.snapshot ?? null);
  const [summary, template, versions, comments, refs, executionItems] = await Promise.all([
    summaryOf(db, bundle),
    loadTemplateRef(db, bundle.plan.templateVersionId),
    buildVersionSummaries(db, bundle),
    loadPlanCommentCounts(db, bundle),
    loadUserRefs(db, [bundle.plan.updatedById], bundle.workspaceId),
    buildExecutionItems(
      db,
      { workspaceId: bundle.workspaceId, today: viewer.today },
      bundle.execution,
    ),
  ]);
  const answerOf = new Map(state.answers.map((a) => [a.questionKey, a]));
  const executionByType = new Map<string, number>();
  for (const item of state.execution) {
    executionByType.set(item.type, (executionByType.get(item.type) ?? 0) + 1);
  }
  const countByType = new Map<string, number>();
  for (const item of executionItems) {
    countByType.set(item.type, (countByType.get(item.type) ?? 0) + item.commentCount);
  }

  const parts = (["a", "b"] as const).map((part) => {
    const items = bundle.sections
      .filter(({ section }) => section.part === part)
      .map(({ section, rows }) => {
        let filled = 0;
        let total = 0;
        let commentCount = 0;
        for (const q of rows) {
          commentCount += comments.byKey.get(q.key) ?? 0;
          if (q.answerType === "linked_metric") continue;
          total += 1;
          if (q.answerType === "execution_view" && q.options?.kind === "execution_view") {
            commentCount += countByType.get(q.options.executionType) ?? 0;
            if ((executionByType.get(q.options.executionType) ?? 0) > 0) filled += 1;
          } else if (q.answerType === "table") {
            if ((answerOf.get(q.key)?.rows?.length ?? 0) > 0) filled += 1;
          } else if (hasText(answerOf.get(q.key)?.text)) {
            filled += 1;
          }
        }
        return {
          itemNo: Number(section.key),
          title: section.title,
          marks: sectionMarks(rows),
          filled,
          total,
          commentCount,
        };
      });
    return {
      part,
      completeItems: items.filter((i) => i.total > 0 && i.filled === i.total).length,
      totalItems: items.length,
      items,
    };
  });

  const horizon = addDays(viewer.today, DUE_SOON_DAYS);
  const open = bundle.execution.filter(
    (e) => e.dueDate != null && !(e.status === "done" || e.status === "resolved"),
  );
  return {
    ...summary,
    ...versionedOf(bundle.plan, refs),
    name: state.header.name,
    ideaId: bundle.idea.id,
    workspaceId: bundle.workspaceId,
    template,
    businessName: state.header.businessName,
    preparedBy: state.header.preparedBy,
    date: iso(viewing ? viewing.savedAt : bundle.plan.lastActivityAt),
    latestDecision: bundle.idea.latestDecision,
    ideaArchived: bundle.idea.archivedAt != null,
    draftOnly:
      bundle.answers.every((a) => a.copiedFrom != null && a.lockVersion <= 1) &&
      !bundle.presetRowDeleted &&
      bundle.execution.every((e) => e.fromPreset && e.lockVersion === 0),
    viewingVersion: viewing
      ? { id: viewing.id, name: viewing.name, savedAt: iso(viewing.savedAt) }
      : null,
    keyMetrics: pickMetrics(state.keyMetrics, LIST_METRIC_KEYS),
    versions,
    execution: {
      overdue: open.filter((e) => (e.dueDate as string) < viewer.today).length,
      dueSoon: open.filter(
        (e) => (e.dueDate as string) >= viewer.today && (e.dueDate as string) <= horizon,
      ).length,
    },
    parts,
  };
}

/** P4 GET: one plan item with its sub-items, answers, numbers, execution rows and references. */
export async function buildPlanItem(
  db: Executor,
  bundle: PlanBundle,
  itemNo: number,
  viewer: PlanViewer,
  viewing: Awaited<ReturnType<typeof loadViewedVersion>>,
): Promise<PlanItem> {
  const found = bundle.sections.find(({ section }) => section.key === itemKey(itemNo));
  if (!found || itemNo < 1 || itemNo > 30) throw new ApiError("NOT_FOUND", "No such item");
  const state = stateOf(bundle, viewing?.snapshot ?? null);
  const { section, rows } = found;

  const editable = rows.filter(
    (q) => q.answerType !== "linked_metric" && q.answerType !== "execution_view",
  );
  const liveAnswers = await buildPlanAnswers(
    db,
    bundle.workspaceId,
    bundle.plan.id,
    viewing
      ? viewing.snapshot.answers.map((a) => ({
          ...(bundle.answers.find((live) => live.questionKey === a.questionKey) ?? {
            id: "",
            businessPlanId: bundle.plan.id,
            copiedFrom: null,
            lockVersion: 0,
            updatedById: null,
            createdAt: viewing.savedAt,
            updatedAt: viewing.savedAt,
          }),
          questionKey: a.questionKey,
          text: a.text,
          rows: a.rows,
        }))
      : bundle.answers,
    editable.map((q) => q.key),
  );

  const executionTypes = rows.flatMap((q) =>
    q.options?.kind === "execution_view" ? [q.options.executionType] : [],
  );
  const executionRows = viewing
    ? snapshotExecutionRows(bundle, viewing.snapshot).filter((e) => executionTypes.includes(e.type))
    : bundle.execution.filter((e) => executionTypes.includes(e.type));
  const execution = sortExecutionItems(
    await buildExecutionItems(
      db,
      { workspaceId: bundle.workspaceId, today: viewer.today },
      executionRows,
    ),
  );

  const specs = rows.flatMap((q) => (q.reference as ReferenceSpec[] | null) ?? []);
  const references = await buildReferences(db, bundle, specs, viewer.role);
  const archived = bundle.plan.archivedAt != null || bundle.idea.archivedAt != null;
  return {
    itemNo,
    title: section.title,
    guidance: section.guidance,
    readOnly: viewing != null || archived || viewer.role === "viewer",
    prompts: section.questions,
    answers: liveAnswers,
    metrics: state.keyMetrics,
    scenarios: state.scenarios,
    execution,
    references,
  };
}

/** A snapshot's execution rows in the shape of the live rows, so one builder renders both. */
function snapshotExecutionRows(bundle: PlanBundle, snapshot: PlanSnapshot) {
  const at = (value: string | null | undefined) => (value ? new Date(value) : null);
  return snapshot.execution.map((e, index) => ({
    id: e.id ?? `${bundle.plan.id}:${index}`,
    businessPlanId: bundle.plan.id,
    type: e.type,
    title: e.title,
    assigneeUserId: e.assigneeUserId ?? null,
    assigneeName: e.assigneeName ?? null,
    dueDate: e.dueDate ?? null,
    status: e.status ?? null,
    goal: e.goal ?? null,
    exitCondition: e.exitCondition ?? null,
    launchTiming: e.launchTiming ?? null,
    actions: e.actions ?? null,
    completionCriteria: e.completionCriteria ?? null,
    kpiArea: e.kpiArea ?? null,
    kpiTarget: e.kpiTarget ?? null,
    kpiReviewFrequency: e.kpiReviewFrequency ?? null,
    kpiActual: e.kpiActual ?? null,
    kpiActualUpdatedAt: at(e.kpiActualUpdatedAt),
    whyItMatters: e.whyItMatters ?? null,
    answer: e.answer ?? null,
    fromPreset: e.fromPreset ?? false,
    completedAt: at(e.completedAt),
    sortOrder: e.sortOrder ?? index,
    deletedAt: null,
    lockVersion: 0,
    updatedById: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
}

export { snapshotExecutionRows };
