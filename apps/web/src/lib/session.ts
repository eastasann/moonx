import type { Me } from "@moonx/schemas";
import { type QueryClient, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { api, call } from "./api";
import { isUnauthenticated } from "./api-error";

export const ME_KEY = ["me"] as const;

/** U1. Every signed-in screen reads the account from this one cached query. */
export const meQuery = queryOptions({
  queryKey: ME_KEY,
  queryFn: () => call(api().api.v1.me.get()),
});

/**
 * The signed-in user, or null when there is no session. Other failures (the server down) throw,
 * so a guard shows the error instead of sending a signed-in person to the login screen.
 */
export async function loadMe(queryClient: QueryClient): Promise<Me | null> {
  try {
    return await queryClient.fetchQuery(meQuery);
  } catch (error) {
    if (isUnauthenticated(error)) {
      queryClient.removeQueries({ queryKey: ME_KEY });
      return null;
    }
    throw error;
  }
}

/** The signed-in user. Only for screens under the `_authed` guard, which has loaded it. */
export function useMe(): Me {
  return useSuspenseQuery(meQuery).data;
}

/**
 * Where a signed-in person lands: the workspace they opened last, else their personal one
 * (design-spec 5, "after login"). An account always has one, so the fallback to the account
 * screen only covers an account whose memberships were all removed.
 */
export function homePath(me: Me): string {
  const workspace =
    me.memberships.find((m) => m.workspace.id === me.lastWorkspaceId) ??
    me.memberships.find((m) => m.workspace.isPersonal) ??
    me.memberships[0];
  return workspace ? `/w/${workspace.workspace.id}` : "/account";
}

const hasUnsafeCharacter = (path: string) =>
  [...path].some((char) => char === "\\" || char.charCodeAt(0) < 0x20);

/**
 * `next` comes from the URL, so only a path inside this app is followed; anything else (another
 * origin, `//host`, a backslash or a control character, which browsers drop from a URL) falls
 * back to `fallback`.
 */
export function safeNext(next: string | undefined, fallback: string): string {
  if (!next?.startsWith("/") || next.startsWith("//") || hasUnsafeCharacter(next)) {
    return fallback;
  }
  return next;
}
