import {
  type Database,
  type DatabaseTransaction,
  users,
  workspaces,
} from "@moonx/db";
import {
  buildPitchDeck,
  fitPitchDeck,
  type MeasureText,
  type PitchExecutionItem,
} from "@moonx/domain";
import { formatIsoDate } from "@moonx/i18n";
import {
  errorBodySchema,
  type PitchDeck,
  type PitchVariant,
  type PlanTableRow,
  pitchDeckQuerySchema,
  pitchDeckSchema,
  pitchSlideKeySchema,
} from "@moonx/schemas";
import { print } from "@moonx/ui-tokens/print";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import type { AccessPlugin } from "./access";
import { ApiError } from "./errors";
import { findIdea, loadIdeaContexts } from "./idea-views";
import { loadPitchFonts } from "./pitch-fonts";
import { renderPitchPdf } from "./pitch-pdf";
import {
  findVersion,
  lastContentChange,
  loadExecutionRows,
  loadPlanAnswers,
  loadPlanTemplate,
  loadTopCompetitors,
  requirePlan,
  TOP_COMPETITORS,
} from "./plan-views";
import type { Limit, RateLimiter } from "./rate-limit";
import type { Scope } from "./scope";
import { loadUserRefs } from "./user-refs";
import { loadCommentCounts } from "./validation-items";

type Executor = Database | DatabaseTransaction;

/** P13 per user (SDD 7.2「レート制限」). */
export const PITCH_PDF_LIMIT: Limit = {
  name: "pitch-pdf",
  max: 30,
  windowMs: 60 * 60 * 1000,
};

/** What a deck is made from besides its slides: what the PDF and its name need. */
interface LoadedDeck {
  deck: PitchDeck;
  /** The plan's name, which names the file when the Business Name is blank. */
  planName: string;
  currency: string;
  timeZone: string;
}

/**
 * P12: the deck of `variant` from the plan of `scope` now, or from its saved version
 * `versionId` (design-spec 6.14), fitted to the slides.
 *
 * @throws {ApiError} NOT_FOUND when `versionId` is not a version of the plan
 */
async function loadPitchDeck(
  db: Executor,
  options: {
    scope: Scope;
    callerId: string;
    variant: PitchVariant;
    versionId: string | undefined;
    now: Date;
    measure: MeasureText;
  },
): Promise<LoadedDeck> {
  const { scope, variant } = options;
  const planId = scope.planId as string;
  const plan = await requirePlan(db, planId);
  const version =
    options.versionId === undefined
      ? null
      : await findVersion(db, planId, options.versionId);
  const idea = await findIdea(db, plan.ideaId);
  if (idea === undefined) throw new ApiError("NOT_FOUND", "No such idea");
  const [context] = await loadIdeaContexts(db, [idea], scope.role);
  if (context === undefined) throw new Error(`No context for ${idea.id}`);
  const [workspace] = await db
    .select({ currency: workspaces.currency })
    .from(workspaces)
    .where(eq(workspaces.id, scope.workspaceId));
  if (workspace === undefined) throw new Error("No workspace");
  const [me] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, options.callerId));
  const timeZone = me?.timezone ?? "UTC";

  const answers =
    version === null
      ? new Map(
          [...(await loadPlanAnswers(db, planId))].map(([key, row]) => [
            key,
            { text: row.text, rows: row.rows as PlanTableRow[] | null },
          ]),
        )
      : new Map(
          version.snapshot.answers.map((answer) => [
            answer.questionKey,
            { text: answer.text, rows: answer.rows },
          ]),
        );
  const execution =
    version === null
      ? (await loadExecutionRows(db, planId)).filter(
          (row) => row.deletedAt === null,
        )
      : version.snapshot.execution;
  const assignees = await loadUserRefs(
    db,
    execution.flatMap((row) =>
      row.assigneeUserId === null ? [] : [row.assigneeUserId],
    ),
    scope.workspaceId,
  );
  const competitors =
    version?.snapshot.competitors ??
    (await loadTopCompetitors(
      db,
      context.loaded.validationId,
      TOP_COMPETITORS,
    ));
  const sections = await loadPlanTemplate(db, plan.templateVersionId);
  const comments = await loadCommentCounts(
    db,
    pitchSlideKeySchema.options.map((key) => ({
      type: "pitch_slide",
      id: planId,
      key: `${variant}.${key}`,
    })),
  );
  const contentAt = version?.row.savedAt ?? (await lastContentChange(db, plan));

  const deck = buildPitchDeck({
    variant,
    source:
      version === null
        ? { kind: "latest" }
        : {
            kind: "version",
            versionId: version.row.id,
            name: version.row.name,
            savedAt: version.row.savedAt.toISOString(),
          },
    header: version?.snapshot.header ?? plan,
    date: formatIsoDate(contentAt, { timeZone }),
    generatedAt: options.now,
    timeZone,
    currency: workspace.currency,
    sections: sections.map((section) => ({
      key: section.key,
      questions: section.questions,
    })),
    answers,
    keyMetrics: version?.snapshot.keyMetrics ?? context.evaluation.keyMetrics,
    scenarios:
      version?.snapshot.scenarios ?? context.evaluation.economics.scenarios,
    execution: execution.map(
      (row): PitchExecutionItem => ({
        type: row.type,
        title: row.title,
        status: row.status,
        dueDate: row.dueDate,
        goal: row.goal,
        launchTiming: row.launchTiming,
        actions: row.actions,
        assignee:
          row.assigneeUserId === null
            ? row.assigneeName
            : (assignees.get(row.assigneeUserId)?.displayName ?? null),
        sortOrder: row.sortOrder,
      }),
    ),
    competitors,
    // The links lead to screens a version, an archive or a Viewer cannot edit (6.14).
    canEdit:
      version === null &&
      scope.role !== "viewer" &&
      !scope.planArchived &&
      !scope.ideaArchived,
    commentCount: (key) => comments({ type: "pitch_slide", id: planId, key }),
  });
  return {
    deck: fitPitchDeck(deck, {
      print,
      measure: options.measure,
      currency: workspace.currency,
    }),
    planName: plan.name,
    currency: workspace.currency,
    timeZone,
  };
}

/** What a file name may not hold on the common systems, and control characters. */
const UNSAFE_IN_FILE_NAME = /[\\/:*?"<>|\p{Cc}]/gu;

/**
 * The PDF's `Content-Disposition` (SDD 5.9 P13): `{businessName}-{one|five}-{version
 * name|draft}-{date}.pdf`, with the plan's name for a blank Business Name. `filename*`
 * carries it in UTF-8 (RFC 6266), and `filename` an ASCII fallback for clients without it.
 */
function pitchFileName(loaded: LoadedDeck): string {
  const { deck } = loaded;
  const name = hasValue(deck.businessName)
    ? deck.businessName.trim()
    : loaded.planName;
  const version =
    deck.source.kind === "version" ? deck.source.name.trim() : "draft";
  const file = `${name}-${deck.variant}-${version}-${deck.footer.date}.pdf`
    .replace(UNSAFE_IN_FILE_NAME, "-")
    .replace(/\s+/gu, " ");
  // NFKD turns full-width signs into ASCII ones, so the unsafe ones go again after it.
  const ascii = file
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x20-\x7e]/gu, "_")
    .replace(UNSAFE_IN_FILE_NAME, "-");
  // RFC 5987 leaves out the quote and parentheses encodeURIComponent keeps.
  const encoded = encodeURIComponent(file).replace(
    /['()]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

const hasValue = (text: string) => text.trim().length > 0;

/** What the Pitch Deck routes need from the app. */
export interface PitchDeckRoutesOptions {
  access: AccessPlugin;
  db: Database;
  limiter: RateLimiter;
  now: () => number;
}

const readErrors = {
  401: errorBodySchema,
  403: errorBodySchema,
  404: errorBodySchema,
  422: errorBodySchema,
} as const;

/** P12 and P13 (SDD 5.9): the Pitch Deck (23) and its PDF. */
export function pitchDeckRoutes({
  access,
  db,
  limiter,
  now,
}: PitchDeckRoutesOptions) {
  const measured = loadPitchFonts();
  const load = async (
    scope: Scope,
    callerId: string,
    query: { variant: PitchVariant; versionId?: string | undefined },
  ) =>
    loadPitchDeck(db, {
      scope,
      callerId,
      variant: query.variant,
      versionId: query.versionId,
      now: new Date(now()),
      measure: await measured,
    });

  return new Elysia()
    .use(access)
    .get(
      "/api/v1/plans/:planId/pitch-deck",
      async ({ scope, caller, query }) =>
        (await load(scope, caller.id, query)).deck,
      {
        scoped: { to: "planId", need: "read" },
        query: pitchDeckQuerySchema,
        response: { 200: pitchDeckSchema, ...readErrors },
        detail: {
          summary: "P12 The Pitch Deck (23)",
          description:
            "The one-minute (8) or five-minute (12) slides from the plan now, or from the saved version versionId, fitted to the slide: font sizes down by shrink steps, then texts cut with an ellipsis (overflow). Edit source links only for Owners and Members on the plan now, neither plan nor idea archived.",
        },
      },
    )
    .get(
      "/api/v1/plans/:planId/pitch-deck.pdf",
      async ({ scope, caller, query }) => {
        // A missing version is refused before the count (404s are not counted, SDD
        // 5.9), and the count comes before the deck's fitting, so a caller over the
        // limit costs no more than this.
        if (query.versionId !== undefined) {
          await findVersion(db, scope.planId as string, query.versionId);
        }
        const counted = await limiter.consume(
          "user",
          PITCH_PDF_LIMIT,
          caller.id,
        );
        if (!counted.allowed) {
          throw new ApiError("RATE_LIMITED", "Too many PDFs made", {
            retryAfterSeconds: counted.retryAfterSeconds,
          });
        }
        const loaded = await load(scope, caller.id, query);
        const pdf = await renderPitchPdf(loaded.deck, {
          measure: await measured,
          currency: loaded.currency,
          timeZone: loaded.timeZone,
        });
        return new Response(new Uint8Array(pdf), {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": pitchFileName(loaded),
          },
        });
      },
      {
        scoped: { to: "planId", need: "read" },
        query: pitchDeckQuerySchema,
        // No `response` schemas: the OpenAPI plugin can write a declared response only
        // as JSON or text, and then replaces `detail.responses` with them, so the PDF
        // and the errors (the entry plugin's, in the shape of SDD 8.1) are documented
        // in `detail.responses` alone.
        detail: {
          summary: "P13 The Pitch Deck as a PDF",
          description:
            "The slides of P12 on landscape pages, always light, with the Business Name, the version (or Draft) and the date at the foot of each; the speaker notes stay out. 30 per user per hour (429 RATE_LIMITED).",
          responses: {
            200: {
              description: "The PDF, as an attachment",
              content: {
                "application/pdf": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
            ...Object.fromEntries(
              [401, 403, 404, 422, 429].map((status) => [
                status,
                {
                  description: `Response for status ${status}`,
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorBody" },
                    },
                  },
                },
              ]),
            ),
          },
        },
      },
    );
}
