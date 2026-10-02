import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isApiError } from "../lib/api-error";
import { captureClientError } from "../lib/sentry";
import { ErrorState, UnexpectedErrorState } from "./states";

/**
 * The page-level error component: a failed call shows its own state, anything else (a render
 * error) is reported to Sentry and shown as "Something went wrong" (SDD 8.2).
 */
export function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  const [reference, setReference] = useState<string | null>(null);
  const router = useRouter();
  const known = isApiError(error);
  // `reset` only clears the boundary; the route has to load again for a retry to mean anything.
  const retry = () => {
    reset();
    void router.invalidate();
  };
  useEffect(() => {
    if (!known) setReference(captureClientError(error).slice(0, 8));
  }, [error, known]);
  return known ? (
    <ErrorState error={error} onRetry={retry} />
  ) : (
    <UnexpectedErrorState reference={reference} onRetry={retry} />
  );
}
