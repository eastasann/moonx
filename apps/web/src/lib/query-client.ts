import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isApiError, isUnauthenticated } from "./api-error";
import { ME_KEY } from "./session";

/** Queries that failed for a reason a retry can fix: no answer, or the server's own failure. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  return !isApiError(error) || error.code === "NETWORK" || error.status >= 500;
}

/**
 * The shared client (SDD 7.3: lists stay fresh for 30 seconds). `onUnauthenticated` runs when any
 * query or mutation gets a 401, whichever screen made it (SDD 8.2).
 */
export function createQueryClient(onUnauthenticated: () => void): QueryClient {
  // The cached account is dropped first: the login screen asks for it and would send a person
  // whose session just ended straight back to the workspace.
  const handle = (error: unknown) => {
    if (!isUnauthenticated(error)) return;
    queryClient.removeQueries({ queryKey: ME_KEY });
    onUnauthenticated();
  };
  const queryClient = new QueryClient({
    // The account query is the guards' own probe for "is there a session": a 401 there is an
    // answer for them to act on, not a lost session to redirect from.
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.queryKey[0] !== ME_KEY[0]) handle(error);
      },
    }),
    mutationCache: new MutationCache({ onError: handle }),
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry },
      mutations: { retry: false },
    },
  });
  unauthenticatedHandlers.set(queryClient, handle);
  return queryClient;
}

const unauthenticatedHandlers = new WeakMap<QueryClient, (error: unknown) => void>();

/**
 * Tells the client's 401 handling about a 401 that came from outside its caches (the autosave
 * engine sends its own requests), so the person lands on the login screen like everywhere else.
 */
export function reportUnauthenticated(queryClient: QueryClient, error: unknown): void {
  unauthenticatedHandlers.get(queryClient)?.(error);
}
