import { i18n } from "@moonx/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  HeadContent,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { FailureState, NotFoundState, StatePage } from "../components/states";
import { dashboardHref } from "../components/workspace";
import { ApiError, api, unwrap } from "../lib/api";
import type { RouterContext } from "../router";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // What the tab reads where a screen names itself no further (useDocumentTitle).
      { title: i18n.t("app:name") },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: RootError,
  notFoundComponent: RootNotFound,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* The screens and the parts take their words from the shared catalogs (ADR-026). */}
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
        <Scripts />
      </body>
    </html>
  );
}

/**
 * The dashboard to offer from a page outside the workspaces, when someone is signed in.
 * Signed out there is none: the 401 is an answer here, not a lost session.
 */
function useSignedInDashboard(): string | undefined {
  const { data } = useQuery({
    queryKey: ["me", "if-signed-in"],
    queryFn: () =>
      unwrap(api().api.v1.me.get()).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }),
    retry: false,
  });
  return data == null ? undefined : dashboardHref(data);
}

/** A failure no route below handled: the whole page shows its state (6.0.6). */
function RootError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <StatePage>
      <FailureState
        error={error}
        onRetry={() => {
          reset();
          void router.invalidate();
        }}
      />
    </StatePage>
  );
}

/** A path that is no screen (6.0.6「見つからない」). */
function RootNotFound() {
  const href = useSignedInDashboard();
  return (
    <StatePage>
      <NotFoundState dashboardHref={href} />
    </StatePage>
  );
}
