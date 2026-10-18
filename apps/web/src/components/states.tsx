import {
  Button,
  IllustratedMessage,
  Link,
  PageFrame,
  Text,
} from "@moonx/ui-web";
import {
  CloudOff,
  Hourglass,
  Lock,
  SearchX,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../lib/api";
import { useIsOnline } from "../lib/online";
import { reportError } from "../lib/sentry";

/** Where a state stands: a whole page, or one block of a screen (its heading's level). */
export interface StatePlacement {
  /** @default 1: the state is all the page shows. */
  headingLevel?: 1 | 2 | 3 | 4;
  /** @default "M"; "S" in a block. */
  size?: "S" | "M";
}

const placed = ({ headingLevel = 1, size = "M" }: StatePlacement) => ({
  headingLevel,
  size,
});

/** "Couldn't load this page" and Retry, in the place of the content (6.0.6). */
export function LoadErrorState({
  onRetry,
  ...placement
}: StatePlacement & { onRetry: () => void }) {
  const { t } = useTranslation(["app"]);
  return (
    <IllustratedMessage
      {...placed(placement)}
      icon={<CloudOff />}
      heading={t("app:state.loadError")}
      actions={
        <Button variant="secondary" onPress={onRetry}>
          {t("app:state.retry")}
        </Button>
      }
    />
  );
}

/** A page that was not loaded while offline cannot open (6.0.2・6.0.6). */
export function OfflineState(placement: StatePlacement) {
  const { t } = useTranslation(["app"]);
  return (
    <IllustratedMessage
      {...placed(placement)}
      icon={<WifiOff />}
      heading={t("app:state.offlinePage")}
    />
  );
}

/** "You don't have access to this" and the way to the dashboard (6.0.6). */
export function NoAccessState({
  dashboardHref,
  ...placement
}: StatePlacement & { dashboardHref?: string }) {
  const { t } = useTranslation(["app"]);
  return (
    <IllustratedMessage
      {...placed(placement)}
      icon={<Lock />}
      heading={t("app:state.noAccess")}
      actions={
        dashboardHref === undefined ? undefined : (
          <Link href={dashboardHref}>{t("app:state.toDashboard")}</Link>
        )
      }
    />
  );
}

/**
 * "Not found. Check the link." and the way to the dashboard (6.0.6); signed out, the way
 * to 1 instead, which takes a signed-in user on to their dashboard (5章「認証」).
 */
export function NotFoundState({
  dashboardHref,
  isSignedOut = false,
  ...placement
}: StatePlacement & { dashboardHref?: string; isSignedOut?: boolean }) {
  const { t } = useTranslation(["app"]);
  return (
    <IllustratedMessage
      {...placed(placement)}
      icon={<SearchX />}
      heading={t("app:state.notFound")}
      actions={
        dashboardHref !== undefined ? (
          <Link href={dashboardHref}>{t("app:state.toDashboard")}</Link>
        ) : isSignedOut ? (
          <Link href="/">{t("app:state.toHome")}</Link>
        ) : undefined
      }
    />
  );
}

/**
 * "Something went wrong", Retry, and the small `Ref` someone asking for help quotes
 * (6.0.6): the request's id from the API, or the Sentry event's of the Web's own failure
 * (SDD 8.2), its first 8 characters. Without either, no Ref.
 */
export function UnexpectedState({
  reference,
  onRetry,
  ...placement
}: StatePlacement & { reference: string | null; onRetry: () => void }) {
  const { t } = useTranslation(["app"]);
  return (
    <IllustratedMessage
      {...placed(placement)}
      icon={<TriangleAlert />}
      heading={t("app:state.unexpected")}
      actions={
        <Button variant="secondary" onPress={onRetry}>
          {t("app:state.retry")}
        </Button>
      }
    >
      {reference === null ? undefined : (
        <Text variant="caption" tone="secondary">
          {t("app:state.ref", { ref: reference.slice(0, 8) })}
        </Text>
      )}
    </IllustratedMessage>
  );
}

// An error is reported once, though React may render its state more than once.
const reported = new WeakMap<object, string | null>();

/**
 * Sends a failure of the Web itself to Sentry, once per error, and returns the event id.
 * Failures of the API are not sent: the API reports its own (SDD 8.3).
 */
export function reportOnce(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return reportError(error);
  if (!reported.has(error)) reported.set(error, reportError(error));
  return reported.get(error) ?? null;
}

/**
 * The state of 6.0.6 for a failure to load (SDD 8.2): the network (offline or not), an
 * API that is not up, no access, nothing there, or else unexpected.
 */
export function FailureState({
  error,
  onRetry,
  dashboardHref,
  ...placement
}: StatePlacement & {
  error: unknown;
  onRetry: () => void;
  dashboardHref?: string;
}) {
  const isOnline = useIsOnline();
  // Reported as it is rendered, so its id is there to show; once per error, however
  // often it is rendered, and again for the next error a Retry may bring.
  const eventId = useMemo(
    () => (error instanceof ApiError ? null : reportOnce(error)),
    [error],
  );
  if (error instanceof ApiError) {
    if (error.status === null) {
      return isOnline ? (
        <LoadErrorState {...placement} onRetry={onRetry} />
      ) : (
        <OfflineState {...placement} />
      );
    }
    if (error.code === "UPSTREAM_UNAVAILABLE") {
      return <LoadErrorState {...placement} onRetry={onRetry} />;
    }
    if (error.status === 403) {
      return <NoAccessState {...placement} dashboardHref={dashboardHref} />;
    }
    if (error.status === 404) {
      return <NotFoundState {...placement} dashboardHref={dashboardHref} />;
    }
    return (
      <UnexpectedState
        {...placement}
        reference={error.requestId}
        onRetry={onRetry}
      />
    );
  }
  return (
    <UnexpectedState {...placement} reference={eventId} onRetry={onRetry} />
  );
}

/** How long loading may take before the screen says so (6.0.6). */
export const SLOW_LOADING_MS = 10_000;

/**
 * How long a route's load runs before its skeleton replaces the page (the router's
 * `defaultPendingMs`): a quick load goes straight to the screen.
 */
export const PENDING_MS = 1000;

/**
 * Whether `isLoading` has lasted {@link SLOW_LOADING_MS}.
 *
 * @param since How long the loading had lasted already when this started counting: a
 * route's skeleton appears {@link PENDING_MS} after its load began.
 */
export function useIsSlow(isLoading: boolean, since = 0): boolean {
  const [isSlow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!isLoading) return;
    const timer = setTimeout(
      () => setSlow(true),
      Math.max(0, SLOW_LOADING_MS - since),
    );
    return () => clearTimeout(timer);
  }, [isLoading, since]);
  return isLoading && isSlow;
}

/** "Taking longer than usual" and Retry, after 10 seconds of loading (6.0.6). */
export function SlowLoadingState({
  onRetry,
  ...placement
}: StatePlacement & { onRetry: () => void }) {
  const { t } = useTranslation(["app"]);
  return (
    <IllustratedMessage
      {...placed(placement)}
      icon={<Hourglass />}
      heading={t("app:state.slow")}
      actions={
        <Button variant="secondary" onPress={onRetry}>
          {t("app:state.retry")}
        </Button>
      }
    />
  );
}

/** A state that is all a page shows, without the frame: before the user is known. */
export function StatePage({ children }: { children: ReactNode }) {
  return <PageFrame>{children}</PageFrame>;
}
