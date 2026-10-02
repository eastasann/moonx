import type { HistoryEntry } from "@moonx/schemas";
import {
  infiniteQueryOptions,
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { SELF_ANALYSIS_KEY } from "./ai-exchange";
import { api, call } from "./api";
import { COMMENTS_KEY } from "./comments";
import { DASHBOARD_KEY } from "./dashboard";
import { IDEAS_KEY } from "./idea-actions";
import type { PanelTarget } from "./panel-target";

/** Every history query lives under this prefix. */
export const HISTORY_KEY = ["history"] as const;

/** Sources whose whole operation H3 can take back; the others touch records, not answers. */
export const BATCH_UNDOABLE_SOURCES: readonly HistoryEntry["source"][] = [
  "ai_import",
  "template_migration",
  "revert",
];

/** H1, newest first, a page at a time. */
export function historyQuery(target: PanelTarget) {
  const key =
    target.kind === "item"
      ? ["item", target.type, target.id, target.key]
      : ["container", target.containerType, target.id, target.sectionKey];
  return infiniteQueryOptions({
    queryKey: [...HISTORY_KEY, ...key],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call(
        api().api.v1.history.get({
          query: {
            ...(target.kind === "item"
              ? {
                  targetType: target.type,
                  targetId: target.id,
                  ...(target.key ? { targetKey: target.key } : {}),
                }
              : {
                  containerType: target.containerType,
                  containerId: target.id,
                  ...(target.sectionKey ? { sectionKey: target.sectionKey } : {}),
                }),
            limit: 50,
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * Refreshes everything a change to answers, rows or the pinned template version can touch: the
 * history and comments, the idea screens, the validation's sections, the self analysis, the
 * plans and the dashboard's activity.
 */
export function refreshAfterContentChange(queryClient: QueryClient) {
  return Promise.all(
    [
      HISTORY_KEY,
      COMMENTS_KEY,
      IDEAS_KEY,
      ["validations"],
      SELF_ANALYSIS_KEY,
      ["plans"],
      DASHBOARD_KEY,
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

/**
 * H2 and H3. Taking changes back rewrites item content, which the idea screens, the validation's
 * sections, the self analysis and the plans read, hides or shows the comments of a deleted or
 * restored row, and (for a template migration) moves the pinned template version.
 */
export function useRevertMutations() {
  const queryClient = useQueryClient();
  const refresh = () => refreshAfterContentChange(queryClient);
  return {
    entry: useMutation({
      mutationFn: (entryId: string) => call(api().api.v1.history({ entryId }).revert.post()),
      onSuccess: refresh,
    }),
    batch: useMutation({
      mutationFn: (batchId: string) =>
        call(api().api.v1.history.batches({ batchId }).revert.post()),
      onSuccess: refresh,
    }),
  };
}
