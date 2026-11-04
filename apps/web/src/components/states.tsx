import {
  Button,
  IllustratedMessage,
  Link,
  Skeleton,
  Text,
} from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import {
  CloudOff,
  Hourglass,
  Lock,
  SearchX,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../lib/api";
import { useUnexpectedReference } from "../lib/failure";
import { useIsOnline } from "../lib/online";
import { askAgain, type WaitedQuery } from "../lib/query";
import { rateLimitWords } from "./SendFailure";
import { StandaloneFrame } from "./StandaloneFrame";

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

/**
 * "Too many attempts. Try again in …" and Retry, in the place of the content (6.0.6
 * 「回数の上限」, SDD 8.2「回数制限」): the rate limit of a load, not an unexpected error.
 */
function RateLimitedState({
  words,
  onRetry,
  ...placement
}: StatePlacement & { words: string; onRetry: () => void }) {
  const { t } = useTranslation(["app"]);
  return (
    <IllustratedMessage
      {...placed(placement)}
      icon={<Hourglass />}
      heading={words}
      actions={
        <Button variant="secondary" onPress={onRetry}>
          {t("app:state.retry")}
        </Button>
      }
    />
  );
}

/** The state of 6.0.6 a failure to load takes (SDD 8.2). */
function failureKind(error: unknown) {
  if (!(error instanceof ApiError)) return "unexpected";
  if (error.status === null) return "network";
  if (error.code === "UPSTREAM_UNAVAILABLE") return "loadError";
  if (error.status === 401) return "signedOut";
  if (error.status === 403) return "noAccess";
  if (error.status === 404) return "notFound";
  return "unexpected";
}

/**
 * The state of 6.0.6 for a failure to load (SDD 8.2): the network (offline or not), an
 * API that is not up, no access, nothing there, a rate limit with its wait, or else
 * unexpected. A lost session shows nothing: the app is on its way to M9 or the sign-in
 * screen (router.tsx).
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
  const kind = failureKind(error);
  const rateLimited = rateLimitWords(error);
  const isUnexpected = kind === "unexpected" && rateLimited === null;
  // Once per error, however often it is rendered, and again for the next error a Retry
  // may bring.
  const reference = useUnexpectedReference(error, isUnexpected);
  if (rateLimited !== null) {
    return (
      <RateLimitedState {...placement} words={rateLimited} onRetry={onRetry} />
    );
  }
  switch (kind) {
    case "network":
      return isOnline ? (
        <LoadErrorState {...placement} onRetry={onRetry} />
      ) : (
        <OfflineState {...placement} />
      );
    case "loadError":
      return <LoadErrorState {...placement} onRetry={onRetry} />;
    case "signedOut":
      return null;
    case "noAccess":
      return <NoAccessState {...placement} dashboardHref={dashboardHref} />;
    case "notFound":
      return <NotFoundState {...placement} dashboardHref={dashboardHref} />;
    case "unexpected":
      return (
        <UnexpectedState
          {...placement}
          reference={reference}
          onRetry={onRetry}
        />
      );
  }
}

/** How long loading may take before the screen says so (6.0.6). */
export const SLOW_LOADING_MS = 10_000;

/**
 * How long a route's load runs before its skeleton replaces the page (the router's
 * `defaultPendingMs`): a quick load goes straight to the screen.
 */
export const PENDING_MS = 1000;

/** A loading state's "Taking longer than usual" and the Retry it shows (6.0.6). */
export interface SlowLoading {
  /** Whether the loading has lasted {@link SLOW_LOADING_MS}, since it began or Retry. */
  isSlow: boolean;
  /** Asks again for what the state waits for; the skeleton shows again and counts anew. */
  retry: () => void;
}

/**
 * Whether `isLoading` has lasted {@link SLOW_LOADING_MS}, and its Retry, which calls
 * `askAgain` and counts the 10 seconds again from the press.
 *
 * @param since How long the loading had lasted already when this started counting: a
 * route's skeleton appears {@link PENDING_MS} after its load began.
 */
export function useSlowRetry(
  isLoading: boolean,
  askAgain: () => void,
  since = 0,
): SlowLoading {
  const [isSlow, setSlow] = useState(false);
  // Each Retry counts the whole wait again.
  const [tries, setTries] = useState(0);
  useEffect(() => {
    setSlow(false);
    if (!isLoading) return;
    const timer = setTimeout(
      () => setSlow(true),
      Math.max(0, SLOW_LOADING_MS - (tries === 0 ? since : 0)),
    );
    return () => clearTimeout(timer);
  }, [isLoading, since, tries]);
  return {
    isSlow: isLoading && isSlow,
    retry: () => {
      setSlow(false);
      setTries((count) => count + 1);
      askAgain();
    },
  };
}

/**
 * {@link useSlowRetry} for a state that waits for the first reads of `waitsFor`: its Retry
 * drops those still under way and asks again ({@link askAgain}).
 */
export function useSlowLoading(
  isLoading: boolean,
  waitsFor: readonly WaitedQuery[],
): SlowLoading {
  const queryClient = useQueryClient();
  return useSlowRetry(isLoading, () => askAgain(queryClient, waitsFor));
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

/**
 * What a block of a modal, a panel or a screen shows while its content loads (6.0.6, whose
 * table holds for every modal): `children` as its skeleton, then "Taking longer than
 * usual" and Retry once it has loaded for {@link SLOW_LOADING_MS}, which Retry counts
 * again. Rendered only while loading, so the count starts as it appears.
 */
export function LoadingBlock({
  waitsFor,
  headingLevel = 3,
  children,
}: {
  /** The queries whose first reads the content waits for, which Retry asks again. */
  waitsFor: readonly WaitedQuery[];
  /** The state's heading: @default 3, under a modal's or a panel's title. */
  headingLevel?: 2 | 3;
  children: ReactNode;
}) {
  const { isSlow, retry } = useSlowLoading(true, waitsFor);
  return isSlow ? (
    <SlowLoadingState onRetry={retry} headingLevel={headingLevel} size="S" />
  ) : (
    <Skeleton isLoading>{children}</Skeleton>
  );
}

/**
 * A state that is all a page shows, without the frame: before the user is known. The
 * bands of a page without the frame stand over it (design-spec 4.5 PageFrame): offline
 * is how a page that cannot load while offline says so in full (6.0.6).
 */
export function StatePage({ children }: { children: ReactNode }) {
  return <StandaloneFrame>{children}</StandaloneFrame>;
}
