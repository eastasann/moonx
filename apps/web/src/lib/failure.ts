import { useLayoutEffect, useState } from "react";
import { ApiError } from "./api";
import { AuthError } from "./auth";
import { reportError } from "./sentry";

/**
 * A failure that may pass next time (SDD 8.2「一時的な失敗」): no answer came (the network),
 * or the API is not up (`UPSTREAM_UNAVAILABLE`, a bare 502・503・504 included). A load
 * reads these again by itself, and a form's or a modal's send shows them as "Couldn't
 * save" and Retry; any other 5xx is unexpected there. Autosave sends again after every
 * 5xx and a 429 too (ADR-021), which it decides itself.
 */
export const isTransient = (error: unknown) =>
  (error instanceof ApiError || error instanceof AuthError) &&
  (error.status === null || error.code === "UPSTREAM_UNAVAILABLE");

// An error is reported once, though React may render its state more than once.
const reported = new WeakMap<object, string | null>();

const once = (error: object, report: () => string | null) => {
  if (!reported.has(error)) reported.set(error, report());
  return reported.get(error) ?? null;
};

/**
 * Sends a failure of the Web itself to Sentry, once per error, and returns the event id.
 * A failure of the API's goes through {@link unexpectedReference} instead.
 */
export function reportOnce(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return reportError(error);
  return once(error, () => reportError(error));
}

/**
 * The `Ref` of a failure the screen shows as unexpected (SDD 8.2), which is what tells it
 * to Sentry (8.3): an answer of the API's carries its request id; a 4xx of it, which a
 * screen shows as unexpected only when it should not have come, goes to Sentry with that
 * id as its `requestId` tag, as a 5xx is sent by the API itself. A failure of the Web's
 * own is sent as it is and is referred to by the event's id. Null when there is neither.
 * Call it only for a failure shown as unexpected: the expected ones are not reported.
 */
export function unexpectedReference(error: unknown): string | null {
  if (!(error instanceof ApiError || error instanceof AuthError)) {
    return reportOnce(error);
  }
  // A lost session (401) is never shown as unexpected: it opens M9 or the sign-in screen.
  if (error.status !== null && error.status !== 401 && error.status < 500) {
    const { requestId } = error;
    once(error, () =>
      reportError(error, requestId === null ? {} : { requestId }),
    );
  }
  return error.requestId;
}

/**
 * {@link unexpectedReference} for a failure a component shows (SDD 8.2), told to Sentry
 * once the component that shows it is committed: React renders a failed screen again
 * before it gives up, each attempt with an error of its own, and an attempt it throws
 * away must not send an event whose Ref nobody sees. An API answer's request id shows at
 * once; a failure of the Web's own shows its event id right after the commit.
 *
 * @param isUnexpected Whether the component shows `error` as unexpected; when it does
 * not, there is no Ref (null) and nothing is sent.
 */
export function useUnexpectedReference(
  error: unknown,
  isUnexpected: boolean,
): string | null {
  const [reported, setReported] = useState<{
    error: unknown;
    reference: string | null;
  } | null>(null);
  useLayoutEffect(() => {
    if (!isUnexpected) return;
    setReported({ error, reference: unexpectedReference(error) });
  }, [isUnexpected, error]);
  if (!isUnexpected) return null;
  if (error instanceof ApiError || error instanceof AuthError) {
    return error.requestId;
  }
  return reported !== null && reported.error === error
    ? reported.reference
    : null;
}
