import { i18n } from "@moonx/i18n";
import { ToastContainer } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { FailureState, NotFoundState, StatePage } from "../components/states";
import { dashboardHref } from "../components/workspace";
import { signedInQuery } from "../lib/queries";
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
  component: RootLayout,
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

/** The screens of a workspace, which show the TabBar on a phone (design-spec 6.0.1). */
const WORKSPACE_ROUTE = "/_signedIn/w/$workspaceId";

/**
 * Every screen, and the one place their toasts appear (design-spec 4.5 Toast): above the
 * TabBar where a workspace's screen shows one.
 */
function RootLayout() {
  const hasTabBar = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === WORKSPACE_ROUTE),
  });
  const hasOwnToasts = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.staticData.hasOwnToasts === true),
  });
  return (
    <>
      <Outlet />
      {!hasOwnToasts && <ToastContainer aboveTabBar={hasTabBar} />}
    </>
  );
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

/**
 * A path that is no screen (6.0.6「見つからない」): the way to the dashboard of whoever is
 * signed in, and signed out the way to 1. If asking fails, 1 still opens (5章「認証」).
 */
function RootNotFound() {
  const { data: me, isError } = useQuery(signedInQuery());
  const href = me == null ? undefined : dashboardHref(me);
  return (
    <StatePage>
      <NotFoundState
        dashboardHref={href}
        isSignedOut={me === null || isError}
      />
    </StatePage>
  );
}
