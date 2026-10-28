import {
  hashKey,
  type QueryClient,
  type QueryKey,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * Drops every cached answer but those of `keep`, each matched exactly: the others may
 * hold another user's data, `me`'s neighbours under "me" included.
 */
export function dropAllBut(
  queryClient: QueryClient,
  keep: readonly QueryKey[],
) {
  const kept = new Set(keep.map((key) => hashKey(key)));
  queryClient.removeQueries({
    predicate: ({ queryKey }) => !kept.has(hashKey(queryKey)),
  });
}

/**
 * Drops what is cached when another account is signed in (ADR-011: the cache holds one
 * user's data). Another tab shares the session cookie, so signing in there as someone
 * else shows here only as `me` changing; `me` alone stays, being the new user's (not the
 * other queries keyed under "me", which may hold the previous user).
 */
export function useDropOtherUsersData(userId: string | null) {
  const queryClient = useQueryClient();
  const previous = useRef(userId);
  useEffect(() => {
    // A moment without a user (`me` gone from the cache) keeps the last one known.
    if (userId === null) return;
    if (previous.current !== null && previous.current !== userId) {
      // `me` itself is the user now signed in.
      dropAllBut(queryClient, [["me"]]);
    }
    previous.current = userId;
  }, [userId, queryClient]);
}
