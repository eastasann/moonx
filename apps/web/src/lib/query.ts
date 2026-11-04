import {
  CancelledError,
  MutationCache,
  type Query,
  QueryCache,
  QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { ApiError, onWrite } from "./api";
import { isTransient } from "./failure";
import { historyKey, isList } from "./queries";

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
        // Tries again only what may pass next time (SDD 8.2「一時的な失敗」).
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

/** A query a loading state waits for: its options as `useQuery` takes them, or its key. */
export interface WaitedQuery {
  queryKey: QueryKey;
}

/** Whether `query` has not answered its first read yet, which is under way. */
const isFirstRead = (query: Query) =>
  query.state.data === undefined && query.state.fetchStatus !== "idle";

/**
 * Drops the first reads of `waitsFor` still under way and asks again (design-spec 6.0.6:
 * Retry on "Taking longer than usual"). `refetch` cannot: without data it joins the read
 * under way (`cancelRefetch` only drops a read that would replace data), so a read that
 * hangs would stay hung. The dropped read's own answer, if it comes, is ignored. A
 * `useQuery` follows the new read. Code that awaits the read itself (`fetchQuery`,
 * `ensureQueryData`) is rejected with a silent `CancelledError`: by the first Retry if it
 * joined a read already under way (a `useQuery`'s, say), as it awaits that read alone; by
 * the second if it started the read, as the first hands it the new read. Such code awaits
 * through {@link readThroughRetries}. A query with data, or not reading, is left as it
 * is: the state does not wait for it, or `refetch` drops its read.
 */
export function askAgain(
  queryClient: QueryClient,
  waitsFor: readonly WaitedQuery[],
): void {
  const cache = queryClient.getQueryCache();
  for (const { queryKey } of waitsFor) {
    for (const query of cache.findAll({ queryKey, exact: true })) {
      if (!isFirstRead(query)) continue;
      // Silent, as `cancelRefetch` drops a read: the query is not put in an error state,
      // and what the dropped read's starter awaits takes the one that starts next, here.
      void query.cancel({ revert: true, silent: true });
      // As `refetchQueries` reads, without its skipping a query no screen observes: a
      // failure is the query's state, which the screen shows.
      query.fetch().catch(() => {});
    }
  }
}

/**
 * What `read` answers, through the Retries that drop it: `read` is the cache's
 * `fetchQuery` or `ensureQueryData` of the query under `queryKey`, awaited by code rather
 * than shown by a `useQuery`. A Retry on a loading state that waits for the same query
 * ({@link askAgain}) or on a route's ({@link dropRouteReads}) rejects what awaits the
 * read it drops with a silent `CancelledError` (for askAgain, from the first Retry if
 * `read` joined a read already under way, such as a `useQuery`'s, and from the second if
 * it started the read), which is no failure: this reads again, joining the read the Retry
 * started or starting one. A query taken out of the cache meanwhile (signing out, another
 * user) is not read again: its `CancelledError` is the caller's, as without this.
 */
export async function readThroughRetries<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  read: () => Promise<T>,
): Promise<T> {
  const cache = queryClient.getQueryCache();
  for (;;) {
    const reading = read();
    // The read has built its query in the cache.
    const query = cache.find({ queryKey, exact: true });
    try {
      return await reading;
    } catch (error) {
      const isDropped =
        error instanceof CancelledError &&
        error.silent === true &&
        query !== undefined &&
        cache.get(query.queryHash) === query;
      if (!isDropped) throw error;
    }
  }
}

/** How many route loads await each query's read (routeQueries). */
const awaitedByRoutes = new WeakMap<Query, number>();

/**
 * The cache's `ensureQueryData` and `fetchQuery` for a route's `beforeLoad` and `loader`:
 * the query each reads is held as one the route's load waits for until it settles, so
 * Retry on the route's "Taking longer than usual" can drop that read (dropRouteReads).
 */
export function routeQueries(
  queryClient: QueryClient,
): Pick<QueryClient, "ensureQueryData" | "fetchQuery"> {
  const awaited = async <T>(queryKey: QueryKey, read: Promise<T>) => {
    // The read has built its query in the cache.
    const query = queryClient.getQueryCache().find({ queryKey, exact: true });
    if (query === undefined) return read;
    awaitedByRoutes.set(query, (awaitedByRoutes.get(query) ?? 0) + 1);
    try {
      return await read;
    } finally {
      const left = (awaitedByRoutes.get(query) ?? 1) - 1;
      if (left === 0) {
        awaitedByRoutes.delete(query);
      } else {
        awaitedByRoutes.set(query, left);
      }
    }
  };
  return {
    ensureQueryData: (options) =>
      awaited(options.queryKey, queryClient.ensureQueryData(options)),
    fetchQuery: (options) =>
      awaited(options.queryKey, queryClient.fetchQuery(options)),
  };
}

/**
 * Drops the reads the routes' loads await ({@link routeQueries}), with data or without:
 * the loads, run again, read again instead of joining them (PendingScreen's Retry). A
 * load that awaited a dropped read is the router's to discard, as one superseded.
 */
export function dropRouteReads(queryClient: QueryClient): void {
  for (const query of queryClient.getQueryCache().getAll()) {
    if (awaitedByRoutes.has(query)) {
      void query.cancel({ revert: true, silent: true });
    }
  }
}
