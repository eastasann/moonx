import { DEFAULT_CURRENCY } from "@moonx/i18n";
import { ideaDecisionFilterSchema, type Role, stageSchema } from "@moonx/schemas";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api, call } from "./api";
import { IDEAS_KEY } from "./idea-actions";
import { useMe } from "./session";

/** The defaults of screen 6's filters; a value equal to its default is left out of the URL. */
export const IDEAS_SEARCH_DEFAULTS = {
  decision: "not_dropped",
  archived: false,
  sort: "updated",
} as const;

/**
 * Screen 6's search parameters (SDD 4). A value that does not parse (an old or typed link) falls
 * back to its default instead of failing the page.
 */
export const ideasSearchSchema = z.object({
  stage: stageSchema.optional().catch(undefined),
  decision: ideaDecisionFilterSchema.catch(IDEAS_SEARCH_DEFAULTS.decision),
  proposer: z.uuid().optional().catch(undefined),
  archived: z.boolean().catch(IDEAS_SEARCH_DEFAULTS.archived),
  sort: z.enum(["updated", "created", "name"]).catch(IDEAS_SEARCH_DEFAULTS.sort),
  q: z
    .string()
    .max(200)
    .optional()
    .catch(undefined)
    .transform((q) => (q ? q : undefined)),
  selected: z.uuid().optional().catch(undefined),
});

export type IdeasSearch = z.infer<typeof ideasSearchSchema>;
/** The part of the search the list query depends on; the selection is not part of it. */
export type IdeaFilters = Omit<IdeasSearch, "selected">;

/** Ideas per request; "Load more" asks for the next page of this size. */
const PAGE_SIZE = 50;

const fetchIdeaPage = (workspaceId: string, filters: IdeaFilters, cursor: string | undefined) =>
  call(
    api()
      .api.v1.workspaces({ workspaceId })
      .ideas.get({
        query: {
          stage: filters.stage,
          decision: filters.decision,
          proposerId: filters.proposer,
          includeArchived: filters.archived ? "true" : undefined,
          sort: filters.sort,
          q: filters.q,
          cursor,
          limit: PAGE_SIZE,
        },
      }),
  );

export type IdeaPage = Awaited<ReturnType<typeof fetchIdeaPage>>;
/** SDD 5.6 IdeaSummary, as the list returns it. */
export type IdeaSummary = IdeaPage["items"][number];

/** I1 GET, one page at a time: "Load more" asks for the next cursor. */
export function useIdeaList(workspaceId: string, filters: IdeaFilters) {
  return useInfiniteQuery({
    queryKey: [...IDEAS_KEY, "list", workspaceId, filters],
    queryFn: ({ pageParam }) => fetchIdeaPage(workspaceId, filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

/** I2 GET, for a selected idea the loaded pages do not hold (a link with `?selected=`). */
export function useIdeaSummary(ideaId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...IDEAS_KEY, "detail", ideaId],
    queryFn: () =>
      call(
        api()
          .api.v1.ideas({ ideaId: ideaId as string })
          .get(),
      ),
    enabled: enabled && ideaId !== undefined,
  });
}

/** Members of the workspace, for the proposer filter (W2; a Viewer may read it). */
export function useWorkspaceMembers(workspaceId: string) {
  return useQuery({
    queryKey: ["workspaces", workspaceId, "members"],
    queryFn: () => call(api().api.v1.workspaces({ workspaceId }).members.get()),
  });
}

/** The signed-in person's role in a workspace, or null when they do not belong to it. */
export function useWorkspaceRole(workspaceId: string): Role | null {
  const me = useMe();
  return me.memberships.find((m) => m.workspace.id === workspaceId)?.role ?? null;
}

/** The currency of a workspace the signed-in person belongs to. */
export function useWorkspaceCurrency(workspaceId: string): string {
  const me = useMe();
  return (
    me.memberships.find((m) => m.workspace.id === workspaceId)?.workspace.currency ??
    DEFAULT_CURRENCY
  );
}

/** Owners and Members create, duplicate and archive; a Viewer sees no such button (design-spec 2.2). */
export const canEditIdeas = (role: Role | null) => role === "owner" || role === "member";
