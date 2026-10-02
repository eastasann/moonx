import { schema } from "@moonx/db";
import {
  buildPitchDeck,
  type PitchDeckCompetitor,
  type PitchDeckExecutionItem,
} from "@moonx/domain";
import type { PitchDeck, PitchVariant } from "@moonx/schemas";
import { and, count, eq, isNull } from "drizzle-orm";
import type { Executor } from "./db";
import { iso } from "./dto";
import { loadPlanVersion, type PlanBundle } from "./plan-context";
import { snapshotExecutionRows } from "./plan-view";
import { loadUserRefs } from "./users";

const dateOf = (date: Date) => iso(date).slice(0, 10);

/**
 * P12: the Pitch Deck of the plan's latest content or of one saved version, built by the same
 * `buildPitchDeck()` the apps and the PDF use. Numbers follow the source: today's validation for
 * Latest, the snapshot's values for a version (design-spec 6.14).
 */
export async function loadPitchDeck(
  db: Executor,
  bundle: PlanBundle,
  p: { variant: PitchVariant; versionId?: string; now: Date },
): Promise<{ deck: PitchDeck; currency: string; versionName: string | null }> {
  const viewing = p.versionId ? await loadPlanVersion(db, bundle.plan.id, p.versionId) : null;
  const snapshot = viewing?.snapshot ?? null;
  const executionRows = snapshot ? snapshotExecutionRows(bundle, snapshot) : bundle.execution;
  const [refs, comments] = await Promise.all([
    loadUserRefs(
      db,
      executionRows.map((e) => e.assigneeUserId),
      bundle.workspaceId,
    ),
    db
      .select({ key: schema.comments.targetKey, n: count() })
      .from(schema.comments)
      .where(
        and(
          eq(schema.comments.workspaceId, bundle.workspaceId),
          eq(schema.comments.targetType, "pitch_slide"),
          eq(schema.comments.targetId, bundle.plan.id),
          isNull(schema.comments.deletedAt),
        ),
      )
      .groupBy(schema.comments.targetKey),
  ]);

  const execution: PitchDeckExecutionItem[] = executionRows.map((e) => ({
    type: e.type,
    title: e.title,
    status: e.status ?? null,
    dueDate: e.dueDate ?? null,
    assigneeName:
      (e.assigneeUserId ? refs.get(e.assigneeUserId)?.displayName : null) ?? e.assigneeName ?? null,
    goal: e.goal,
    exitCondition: e.exitCondition,
    launchTiming: e.launchTiming,
    actions: e.actions,
    completionCriteria: e.completionCriteria,
  }));
  const competitors: PitchDeckCompetitor[] = snapshot
    ? snapshot.competitors
    : bundle.validation.data.competitors.slice(0, 5).map((c) => ({
        name: c.name,
        type: c.type ?? null,
        typicalPrice: c.typicalPrice ?? null,
        strength: c.strength ?? null,
        weakness: c.weakness ?? null,
      }));
  const header = snapshot?.header ?? bundle.plan;
  const answers = Object.fromEntries(
    (snapshot
      ? snapshot.answers
      : bundle.answers.map((a) => ({ questionKey: a.questionKey, text: a.text, rows: a.rows }))
    ).map((a) => [
      a.questionKey,
      { text: a.text, rows: a.rows as Record<string, string | number | null>[] | null },
    ]),
  );
  const deck = buildPitchDeck({
    variant: p.variant,
    source: viewing
      ? {
          kind: "version",
          versionId: viewing.id,
          name: viewing.name,
          savedAt: iso(viewing.savedAt),
        }
      : { kind: "latest" },
    generatedAt: iso(p.now),
    header: {
      businessName: header.businessName,
      preparedBy: header.preparedBy,
      versionLabel: viewing ? viewing.name : "Draft",
      date: dateOf(viewing ? viewing.savedAt : bundle.plan.lastActivityAt),
    },
    currency: bundle.workspace.currency,
    answers,
    keyMetrics: snapshot?.keyMetrics ?? bundle.validation.state.keyMetrics,
    scenarios: snapshot?.scenarios ?? bundle.validation.state.economics.scenarios,
    competitors,
    execution,
    commentCounts: Object.fromEntries(comments.flatMap((c) => (c.key ? [[c.key, c.n]] : []))),
  });
  return { deck, currency: bundle.workspace.currency, versionName: viewing?.name ?? null };
}

/**
 * The download name of P13: `{businessName}-{one|five}-{version name|draft}-{date}.pdf` (SDD 5.9).
 * A header value is ASCII, so `filename` keeps ASCII letters and digits and `filename*` carries
 * the original name for clients that read it.
 */
export function pdfContentDisposition(deck: PitchDeck, versionName: string | null): string {
  const base = [deck.businessName, deck.variant, versionName ?? "draft", deck.footer.date].join(
    "-",
  );
  const ascii = `${base
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")}.pdf`;
  const encoded = encodeURIComponent(`${base}.pdf`).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
