import { ErrorBoundary as SentryErrorBoundary } from "@sentry/react";
import type { ReactNode } from "react";
import { UnexpectedErrorState } from "./states";

/**
 * A block's error boundary: a render error shows "Something went wrong" in place of the block and
 * is sent to Sentry, and the rest of the page keeps working (SDD 8.2). `Ref` is the Sentry event id.
 */
export function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <SentryErrorBoundary
      fallback={({ eventId, resetError }) => (
        <UnexpectedErrorState
          reference={eventId ? eventId.slice(0, 8) : null}
          onRetry={resetError}
        />
      )}
    >
      {children}
    </SentryErrorBoundary>
  );
}
