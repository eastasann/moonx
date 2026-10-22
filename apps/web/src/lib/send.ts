import { useMutation } from "@tanstack/react-query";
import { ApiError } from "./api";

export interface SendOptions {
  /**
   * Whether the open history panels read their changes again as soon as the send goes
   * through (lib/query.ts). A send that removes what the screen shows reads them itself,
   * once the screen is left.
   */
  readsHistoryAgain?: boolean;
}

/**
 * Sends through the query client's mutations, so a lost session takes the app's way
 * (M9 with unsaved input, else the sign-in screen; router.tsx) and NO_ACCESS reads the
 * user again (lib/query.ts) before the caller hears of the failure.
 */
export function useSendThrough(
  options: SendOptions = {},
): <T>(send: () => Promise<T>) => Promise<T> {
  const { mutateAsync } = useMutation({
    mutationFn: (send: () => Promise<unknown>) => send(),
    meta: { readsHistoryAgain: options.readsHistoryAgain ?? true },
  });
  return mutateAsync as <T>(send: () => Promise<T>) => Promise<T>;
}

/**
 * The session ended (401): the app is on its way to M9 or the sign-in screen, so the
 * screen says nothing of the failure itself.
 */
export const isSessionLost = (error: unknown) =>
  error instanceof ApiError && error.status === 401;
