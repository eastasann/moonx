import type { Me } from "@moonx/schemas";
import { Button, IllustratedMessage, Link, Stack, Text } from "@moonx/ui-web";
import { type UseQueryResult, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Clock, Lock, SearchX, ShieldAlert, WifiOff } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isApiError } from "../lib/api-error";
import { errorReference, errorText } from "../lib/error-text";
import { homePath, ME_KEY } from "../lib/session";

/** Where the "Dashboard" link of a state points: the signed-in person's home, else the landing page. */
function useHomeHref(): string {
  const me = useQueryClient().getQueryData<Me>(ME_KEY);
  return me ? homePath(me) : "/";
}

/** "You don't have access to this" (design-spec 6.0.6). */
export function NoAccessState() {
  const { t } = useTranslation("app");
  return (
    <IllustratedMessage
      icon={Lock}
      heading={t("states.noAccess.heading")}
      actions={<Link href={useHomeHref()}>{t("states.dashboardLink")}</Link>}
    />
  );
}

/** "Not found. Check the link." (design-spec 6.0.6). */
export function NotFoundState() {
  const { t } = useTranslation("app");
  return (
    <IllustratedMessage
      icon={SearchX}
      heading={t("states.notFound.heading")}
      actions={<Link href={useHomeHref()}>{t("states.dashboardLink")}</Link>}
    />
  );
}

/** "Couldn't load this page" with a retry (design-spec 6.0.6). The navigation stays usable. */
export function LoadErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("app");
  return (
    <IllustratedMessage
      icon={WifiOff}
      heading={t("states.loadError.heading")}
      actions={<Button onPress={onRetry}>{t("states.retry")}</Button>}
    />
  );
}

/** "Something went wrong" with the `Ref` a person reads out when they report it. */
export function UnexpectedErrorState({
  reference,
  onRetry,
}: {
  reference: string | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation("app");
  return (
    <IllustratedMessage
      icon={CircleAlert}
      heading={t("states.unexpected.heading")}
      actions={
        <Stack gap="space-100">
          <Button onPress={onRetry}>{t("states.retry")}</Button>
          {reference ? (
            <Text variant="caption" tone="secondary" as="span">
              {t("states.unexpected.reference", { reference })}
            </Text>
          ) : null}
        </Stack>
      }
    />
  );
}

/**
 * The state for a failed read, by the kind of error (SDD 8.2): no access, not found, the app too
 * old, too many requests, a connection or server problem, or something unexpected.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation(["app", "errors", "auth"]);
  if (isApiError(error)) {
    switch (error.code) {
      case "NO_ACCESS":
      case "FORBIDDEN":
        return <NoAccessState />;
      case "NOT_FOUND":
        return <NotFoundState />;
      case "APP_UPDATE_REQUIRED":
        return (
          <IllustratedMessage icon={ShieldAlert} heading={t("states.updateRequired.heading")} />
        );
      case "RATE_LIMITED":
        return (
          <IllustratedMessage
            icon={Clock}
            heading={t("states.rateLimited.heading")}
            actions={<Button onPress={onRetry}>{t("states.retry")}</Button>}
          />
        );
      case "NETWORK":
      case "UPSTREAM_UNAVAILABLE":
        return <LoadErrorState onRetry={onRetry} />;
    }
    // Any other refusal (a used-up invitation, say) carries its own catalog text.
    if (error.status >= 400 && error.status < 500) {
      return <IllustratedMessage icon={CircleAlert} heading={errorText(t, error)} />;
    }
  }
  return <UnexpectedErrorState reference={errorReference(error)} onRetry={onRetry} />;
}

/** How long a skeleton may show before the screen admits it is slow (design-spec 6.0.6). */
export const SLOW_LOADING_MS = 10_000;

/** The skeleton of a screen, and after ten seconds "Taking longer than usual" with a retry. */
export function LoadingState({ skeleton, onRetry }: { skeleton: ReactNode; onRetry: () => void }) {
  const { t } = useTranslation("app");
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_LOADING_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Stack gap="space-300">
      <div aria-busy="true" aria-label={t("states.loading")} role="status">
        {skeleton}
      </div>
      {slow ? (
        <Stack gap="space-100" align="start">
          <Text tone="secondary">{t("states.slow")}</Text>
          <Button variant="secondary" onPress={onRetry}>
            {t("states.retry")}
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}

/** Shows the skeleton while a query loads, the matching state if it fails, else the data. */
export function QueryBoundary<Data>({
  query,
  skeleton,
  children,
}: {
  query: UseQueryResult<Data>;
  skeleton: ReactNode;
  children: (data: Data) => ReactNode;
}) {
  if (query.isPending) {
    return <LoadingState skeleton={skeleton} onRetry={() => void query.refetch()} />;
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return children(query.data);
}
