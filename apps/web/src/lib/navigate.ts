import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

/**
 * Goes to a path that is only known at run time (`?next=`, a link from a response). The router's
 * typed `navigate` takes route names; this takes the path with its search string as one piece.
 * `replace` leaves no history entry, for a redirect the Back button must not return to.
 */
export function useGoTo() {
  const router = useRouter();
  return useCallback(
    (path: string, options: { replace?: boolean } = {}) =>
      options.replace ? router.history.replace(path) : router.history.push(path),
    [router],
  );
}
