import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError, onWrite } from "./api";
import { historyKey, isList } from "./queries";

/** Tries again only what may pass next time: the network, and an API that is not up. */
export const isTransient = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === null || error.code === "UPSTREAM_UNAVAILABLE");

/**
 * The client's cache of API data (ADR-011): a screen shows what it has at once and takes
 * it again behind (stale-while-revalidate; a list only once it is 30 seconds old, or the
 * page has changed something since, SDD 7.3). Every failed query or mutation passes here
 * first: a 401 means the session is gone, and NO_ACCESS that the user's memberships
 * changed, so `me` is taken again and the screens follow it (SDD 8.2). Every write that
 * went through has a line in the change history (ADR-020), so an open history panel
 * reads it again.
 *
 * @param onUnauthenticated Leaves for the sign-in screen, the cache dropped (SDD 8.2).
 */
export function createQueryClient(onUnauthenticated: () => void): QueryClient {
  const onError = (error: unknown) => {
    if (!(error instanceof ApiError)) return;
    if (error.status === 401) {
      onUnauthenticated();
    } else if (error.code === "NO_ACCESS") {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  };
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({
      onError,
      onSuccess: (_data, _variables, _context, mutation) => {
        if (mutation.meta?.readsHistoryAgain === false) return;
        void queryClient.invalidateQueries({ queryKey: historyKey });
      },
    }),
    defaultOptions: {
      // Offline, a request fails as the network (an ApiError without a status) instead
      // of waiting, so a screen shows that it is offline (6.0.6) and a send does not go
      // out later, after its screen is gone.
      queries: {
        networkMode: "always",
        retry: (failures, error) => failures < 2 && isTransient(error),
      },
      mutations: { networkMode: "always", retry: false },
    },
  });
  // A read under way may bring what the list was before the change: it is dropped, and
  // a list on screen is read again at once; the others when next shown.
  onWrite(() => {
    void queryClient
      .cancelQueries({ predicate: isList })
      .then(() => queryClient.invalidateQueries({ predicate: isList }));
  });
  return queryClient;
}
