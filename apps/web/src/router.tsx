import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, type RouterHistory } from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import { RouteError } from "./components/RouteError";
import { NotFoundState } from "./components/states";
import { i18n } from "./lib/i18n";
import { createQueryClient } from "./lib/query-client";
import { initSentry } from "./lib/sentry";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  queryClient: QueryClient;
}

/** The router, with its own query client. Tests pass a memory `history`; the app uses the browser's. */
export function getRouter(options: { history?: RouterHistory } = {}) {
  initSentry();
  const queryClient = createQueryClient(() => redirectToLogin());
  const router = createRouter({
    history: options.history,
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultNotFoundComponent: NotFoundState,
    defaultErrorComponent: RouteError,
    Wrap: ({ children }) => (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </I18nextProvider>
    ),
  });

  /** A 401 from any call while a signed-in screen is open means the session is gone (SDD 8.2). */
  function redirectToLogin() {
    const inApp = router.state.matches.some((match) => match.routeId.startsWith("/_authed"));
    if (!inApp) return;
    const { pathname, searchStr } = router.state.location;
    const next = `${pathname}${searchStr}`;
    router.navigate({ to: "/login", search: next === "/" ? {} : { next } });
  }
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
