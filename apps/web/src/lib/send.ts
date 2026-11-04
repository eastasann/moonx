import { useMutation } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
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

/**
 * How long a send that holds its dialog open may take (M2, design-spec 6.0.3; the Reorder
 * dialog, 6.10). Cloud Run answers within 60 seconds (SDD ADR-007), so a send still open
 * after this lost the network: it then fails as the network does ("Couldn't save" and
 * Retry), and the dialog, held open while it sends, lets the user go.
 */
export const HELD_SEND_LIMIT_MS = 70_000;

/**
 * A signal that aborts once {@link HELD_SEND_LIMIT_MS} has passed. Made with `setTimeout`,
 * not `AbortSignal.timeout`, so a test's fake timers hold it as they hold the app's other
 * timers.
 */
export function heldSendSignal(): AbortSignal {
  const controller = new AbortController();
  setTimeout(
    () =>
      controller.abort(
        new DOMException("The send had no answer in time", "TimeoutError"),
      ),
    HELD_SEND_LIMIT_MS,
  );
  return controller.signal;
}

/** Rejects as the network does (an ApiError without an answer) once `signal` aborts. */
export const failsOnAbort = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    const fail = () =>
      reject(
        new ApiError({
          status: null,
          code: null,
          requestId: null,
          cause: signal.reason,
        }),
      );
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });

/**
 * Holds the screen while a dialog's send is on its way, for a dialog that does not close
 * then (M2, design-spec 6.0.3; the Reorder dialog, 6.10): browser Back or a link would
 * otherwise take the dialog away, and the send's failure with it. A reload is not asked
 * about. A lost session's move to the sign-in screen goes through (router.tsx).
 */
export function useHoldWhileSending(isSending: boolean): void {
  useBlocker({
    shouldBlockFn: () => true,
    disabled: !isSending,
    enableBeforeUnload: false,
  });
}
