import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api, call } from "./api";
import { DECISION_LOG_KEY } from "./decision";

export const DECISION_KINDS = ["validation_decision", "go_no_go", "version_saved"] as const;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Screen 7's search parameters (SDD 4). A value that does not parse (an old or typed link) is
 * dropped. `from` and `to` are calendar days; the API reads them in the caller's time zone.
 */
export const decisionLogSearchSchema = z.object({
  kind: z.enum(DECISION_KINDS).optional().catch(undefined),
  idea: z.uuid().optional().catch(undefined),
  recordedBy: z.uuid().optional().catch(undefined),
  from: z.string().regex(DATE_ONLY).optional().catch(undefined),
  to: z.string().regex(DATE_ONLY).optional().catch(undefined),
  selected: z.uuid().optional().catch(undefined),
});
export type DecisionLogSearch = z.infer<typeof decisionLogSearchSchema>;
export type DecisionLogFilters = Omit<DecisionLogSearch, "selected">;

/** Entries per request; "Load more" asks for the next page of this size. */
const PAGE_SIZE = 50;

const fetchPage = (workspaceId: string, filters: DecisionLogFilters, cursor: string | undefined) =>
  call(
    api()
      .api.v1.workspaces({ workspaceId })
      ["decision-log"].get({
        query: {
          kind: filters.kind,
          ideaId: filters.idea,
          recordedBy: filters.recordedBy,
          from: filters.from,
          to: filters.to,
          cursor,
          limit: PAGE_SIZE,
        },
      }),
  );

/** L1: one entry of the list. */
export type DecisionLogSummary = Awaited<ReturnType<typeof fetchPage>>["items"][number];

/** L1, newest first, one page at a time. Under {@link DECISION_LOG_KEY} so a recorded decision refreshes it. */
export const decisionLogQuery = (workspaceId: string, filters: DecisionLogFilters) =>
  infiniteQueryOptions({
    queryKey: [...DECISION_LOG_KEY, "list", workspaceId, filters],
    queryFn: ({ pageParam }) => fetchPage(workspaceId, filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

const fetchEntry = (entryId: string) => call(api().api.v1["decision-log"]({ entryId }).get());

/** L2: the whole entry with the snapshot of what it rested on. */
export type DecisionLogEntry = Awaited<ReturnType<typeof fetchEntry>>;

export const decisionEntryQuery = (entryId: string) =>
  queryOptions({
    queryKey: [...DECISION_LOG_KEY, "entry", entryId],
    queryFn: () => fetchEntry(entryId),
  });

/**
 * Every idea of the workspace, archived and dropped ones included, for the idea filter. The
 * filter must name an idea even when it is far down a long list, so all pages are read.
 */
export const decisionIdeasQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: [...DECISION_LOG_KEY, "ideas", workspaceId],
    queryFn: async () => {
      const ideas: { id: string; name: string }[] = [];
      let cursor: string | undefined;
      do {
        const page = await call(
          api()
            .api.v1.workspaces({ workspaceId })
            .ideas.get({
              query: { decision: "all", includeArchived: "true", sort: "name", limit: 200, cursor },
            }),
        );
        ideas.push(...page.items.map(({ id, name }) => ({ id, name })));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return ideas;
    },
  });
