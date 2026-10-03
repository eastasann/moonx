import { Button, Dialog } from "@moonx/ui-web";
import { ErrorBoundary as SentryErrorBoundary } from "@sentry/react";
import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { UnexpectedErrorState } from "./states";

const reference = (eventId: string) => (eventId ? eventId.slice(0, 8) : null);

/** Clears the boundary once `resetKey` differs from the value it had when the error was shown. */
function ResetOnChange({ resetKey, resetError }: { resetKey?: string; resetError: () => void }) {
  const shownAt = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== shownAt.current) resetError();
  }, [resetKey, resetError]);
  return null;
}

/**
 * A block's error boundary: a render error shows "Something went wrong" in place of the block and
 * is sent to Sentry, and the rest of the page keeps working (SDD 8.2). `Ref` is the Sentry event id.
 * `resetKey` (the path, for the screen's boundary) lets the next navigation clear the error without
 * a `key` on the boundary: a `key` would remount every healthy screen on each navigation, which
 * starts its queries and drafts over.
 */
export function ErrorBoundary({ children, resetKey }: { children: ReactNode; resetKey?: string }) {
  return (
    <SentryErrorBoundary
      fallback={({ eventId, resetError }) => (
        <>
          <ResetOnChange resetKey={resetKey} resetError={resetError} />
          <UnexpectedErrorState reference={reference(eventId)} onRetry={resetError} />
        </>
      )}
    >
      {children}
    </SentryErrorBoundary>
  );
}

function OverlayFallback({
  eventId,
  resetError,
  onClose,
}: {
  eventId: string;
  resetError: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("app");
  return (
    <Dialog
      isOpen
      isDismissable
      size="small"
      title={t("states.unexpected.heading")}
      closeLabel={t("close")}
      onOpenChange={(open) => !open && onClose()}
      actions={
        <>
          <Button variant="secondary" onPress={onClose}>
            {t("close")}
          </Button>
          <Button onPress={resetError}>{t("states.retry")}</Button>
        </>
      }
    >
      {reference(eventId)
        ? t("states.unexpected.reference", { reference: reference(eventId) })
        : null}
    </Dialog>
  );
}

/**
 * The boundary of a modal or a panel. A failure inside it is shown in a small dialog that can be
 * closed, so the frame, the navigation and the screen behind keep working (design-spec 6.0.6).
 * Give it a `key` that changes with what is open so a new modal starts fresh.
 */
export function OverlayErrorBoundary({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <SentryErrorBoundary
      fallback={({ eventId, resetError }) => (
        <OverlayFallback eventId={eventId} resetError={resetError} onClose={onClose} />
      )}
    >
      {children}
    </SentryErrorBoundary>
  );
}
