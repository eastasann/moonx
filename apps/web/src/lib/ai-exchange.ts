import type { AiImportApplyBody, TemplateKind } from "@moonx/schemas";
import { queryOptions } from "@tanstack/react-query";
import { exportScopeQuery, type ScopeSection } from "./ai-scope";
import { api, call, sendJson } from "./api";
import { validationKey } from "./validation-keys";

/**
 * Every query that reads a self analysis starts with this key, so the import refreshes them all
 * with one invalidation (the same rule as {@link validationKey}).
 */
export const SELF_ANALYSIS_KEY = ["self-analysis"] as const;

/** Every query that reads one plan starts with `["plans", planId]`. */
export const planKey = (planId: string) => ["plans", planId] as const;

/** Where the queries of the thing an exchange works on live, so a change there refreshes them. */
export function targetKey(kind: TemplateKind, id: string | undefined) {
  if (kind === "self_analysis") return SELF_ANALYSIS_KEY;
  if (kind === "validation") return validationKey(id as string);
  return planKey(id as string);
}

/** The kind of a `?source=` / `?target=` value, which names the plan `business_plan`. */
export const AI_KINDS = ["self_analysis", "validation", "business_plan"] as const;

type Client = ReturnType<typeof api>["api"]["v1"]["ai"];
type DataOf<Get extends (...args: never[]) => Promise<{ data: unknown }>> = NonNullable<
  Awaited<ReturnType<Get>>["data"]
>;

/** X2: the target's sections and questions with what they hold now. */
export type ImportContext = DataOf<Client["import"]["context"]["get"]>;
export type ContextQuestion = ImportContext["questions"][number];

/**
 * Read with plain `fetch` rather than Treaty: Treaty turns every string that looks like a date
 * into a `Date`, which would change an answer that is a date and the `exportedAt` of an export.
 */
const fetchContext = (kind: TemplateKind, id: string | undefined) =>
  sendJson<ImportContext>(
    "GET",
    `/api/v1/ai/import/context?${new URLSearchParams({ target: kind, ...(id ? { id } : {}) })}`,
  );

/** X2. Both screens read it: 24 for the sections to choose from, 25 to match and diff. */
export const importContextQuery = (kind: TemplateKind, id: string | undefined) =>
  queryOptions({
    queryKey: [...targetKey(kind, id), "ai-context", kind, id ?? null],
    queryFn: () => fetchContext(kind, id),
  });

/** What the person chose on the Scope step of 24. */
export interface ExportOptions {
  includeEmpty: boolean;
  includeExamples: boolean;
  includeReference: boolean;
}

export interface ExportRequest {
  kind: TemplateKind;
  id: string | undefined;
  selected: readonly string[];
  sections: readonly ScopeSection[];
  options: ExportOptions;
}

/** X1's answer (SDD 5.10). */
export interface ExportResult {
  markdown: string;
  json: Record<string, unknown>;
  fileBaseName: string;
  questionCount: number;
  allEmpty: boolean;
}

const fetchExport = (request: ExportRequest) =>
  sendJson<ExportResult>(
    "GET",
    `/api/v1/ai/export?${new URLSearchParams({
      source: request.kind,
      ...(request.id ? { id: request.id } : {}),
      ...exportScopeQuery(request.kind, request.selected, request.sections),
      includeEmpty: String(request.options.includeEmpty),
      includeExamples: String(request.options.includeExamples),
      includeReference: String(request.options.includeReference),
    })}`,
  );

/**
 * X1. An export is never kept: the answers it prints change, and each build counts against the
 * rate limit (SDD 7.4), so it is read again whenever the Review step is opened.
 */
export const exportQuery = (request: ExportRequest) =>
  queryOptions({
    queryKey: [
      ...targetKey(request.kind, request.id),
      "ai-export",
      exportScopeQuery(request.kind, request.selected, request.sections),
      request.options,
    ],
    queryFn: () => fetchExport(request),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    // Coming back from the AI's tab must not rebuild the text (X1 is rate limited and the preview
    // would change under the person's hands).
    refetchOnWindowFocus: false,
  });

/** X3. */
export const applyImportChanges = (body: AiImportApplyBody) =>
  call(api().api.v1.ai.import.apply.post(body));

/** X3's answer. */
export type ApplyResult = Awaited<ReturnType<typeof applyImportChanges>>;

/**
 * A `returnTo` that stays inside the app: a path of its own origin. Anything else (another site,
 * a protocol-relative `//host`) is dropped so a crafted link cannot send a person away.
 */
export function safeReturnTo(value: string | undefined): string | undefined {
  // The URL parser drops control characters, so "/\t/host" would turn into "//host".
  const unsafe = value !== undefined && [...value].some((char) => char <= " " || char === "\\");
  if (!value?.startsWith("/") || value.startsWith("//") || unsafe) {
    return undefined;
  }
  return value;
}

/**
 * The link from a form screen (10 / 11 / 21) into an AI exchange. Export starts from the section
 * on screen; import takes the whole of the kind (design-spec 6.7), so it carries no scope. Both
 * carry the screen as `returnTo`, so Back and a finished import land where the person came from.
 */
export function exchangeHref(
  direction: "export" | "import",
  params: {
    workspaceId: string;
    kind: TemplateKind;
    id?: string;
    /** The export's starting scope: a section key, or `scope=` text such as a plan item. */
    scope: string;
    returnTo: string;
  },
): string {
  const query = new URLSearchParams({
    [direction === "export" ? "source" : "target"]: params.kind,
    ...(params.id ? { id: params.id } : {}),
    ...(direction === "export" ? { scope: params.scope } : {}),
    returnTo: params.returnTo,
  });
  return `/w/${params.workspaceId}/ai/${direction}?${query}`;
}

/** The screen an exchange works on (10 / 11 / 13 / 20 / 21): where Back and a finished import go. */
export function sourcePath(workspaceId: string, target: ImportContext["target"]): string {
  const { type, ideaId, id } = target;
  if (type === "self_analysis") return `/w/${workspaceId}/self-analysis`;
  if (!ideaId) return `/w/${workspaceId}/ideas`;
  return type === "validation"
    ? `/w/${workspaceId}/ideas/${ideaId}`
    : `/w/${workspaceId}/ideas/${ideaId}/plans/${id}`;
}

/** A validation or plan of another workspace than the URL's must not open there (SDD 4). */
export const isOtherWorkspace = (workspaceId: string, target: ImportContext["target"]) =>
  target.workspaceId !== null && target.workspaceId !== workspaceId;
