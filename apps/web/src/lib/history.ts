import type { HistoryEntry } from "@moonx/schemas";
import { infiniteQueryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, call } from "./api";
import { COMMENTS_KEY } from "./comments";
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
 * H2 and H3. Taking changes back rewrites item content, which the idea screens and the
 * validation's sections read, and hides or shows the comments of a deleted or restored row.
 */
export function useRevertMutations() {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all(
      [HISTORY_KEY, COMMENTS_KEY, IDEAS_KEY, ["validations"]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
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
