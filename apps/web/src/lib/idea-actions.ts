import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, call } from "./api";

/**
 * Every idea query lives under this prefix (`["ideas", ...]`), so one invalidation after a
 * change refreshes the list, the detail pane and the validation home together.
 */
export const IDEAS_KEY = ["ideas"] as const;

/** I3, I4: the idea actions shared by the list (row menu) and the validation home (⋯ menu). */
export function useIdeaActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
  return {
    duplicate: useMutation({
      mutationFn: (ideaId: string) => call(api().api.v1.ideas({ ideaId }).duplicate.post({})),
      onSuccess: refresh,
    }),
    archive: useMutation({
      mutationFn: (ideaId: string) => call(api().api.v1.ideas({ ideaId }).archive.post()),
      onSuccess: refresh,
    }),
    restore: useMutation({
      mutationFn: (ideaId: string) => call(api().api.v1.ideas({ ideaId }).restore.post()),
      onSuccess: refresh,
    }),
  };
}
