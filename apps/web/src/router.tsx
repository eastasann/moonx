import { RouterProvider as AriaRouterProvider } from "@moonx/ui-web";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRouter,
  type RouterHistory,
  useRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PENDING_MS } from "./components/states";
import { createQueryClient } from "./lib/query";
import { routeTree } from "./routeTree.gen";

/** What every route's `beforeLoad` and `loader` receive. */
export interface RouterContext {
  queryClient: QueryClient;
}

/** The sign-in screen (SDD 4章), where a request without a session sends the user. */
const LOGIN_PATH = "/login";

/**
 * The screens anyone may open (design-spec 5章「認証」, SDD 4章): no session is lost there,
 * so a 401 that reaches them (one sent before signing out came back after it) stays put.
 */
const isOpenToAll = (pathname: string) =>
  pathname === "/" ||
  pathname === LOGIN_PATH ||
  pathname === "/forgot-password" ||
  pathname === "/reset-password" ||
  pathname.startsWith("/invite/");

/** The parts of packages/ui-web move through this router (design-spec 4.5). */
function AriaRouting({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <AriaRouterProvider navigate={(href) => router.navigate({ href })}>
      {children}
    </AriaRouterProvider>
  );
}

/**
 * The app's router with its query cache. A request that finds the session gone drops the
 * cache, which holds one user's data, and goes to `/login?next=<where it was>` (SDD 4章・
 * 8.2・ADR-011); the many queries a screen may lose at once go there once.
 *
 * @param history Tests pass a memory history.
 */
export function createAppRouter({ history }: { history?: RouterHistory } = {}) {
  const queryClient = createQueryClient(() => {
    const { pathname, searchStr } = router.latestLocation;
    if (isOpenToAll(pathname)) return;
    queryClient.clear();
    const next = new URLSearchParams({ next: `${pathname}${searchStr}` });
    // In place of the screen: Back must not lead into it again, only to leave again.
    void router.navigate({ href: `${LOGIN_PATH}?${next}`, replace: true });
  });
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient },
    scrollRestoration: true,
    // How long a load runs before its route shows the skeleton (states.tsx).
    defaultPendingMs: PENDING_MS,
    InnerWrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <AriaRouting>{children}</AriaRouting>
      </QueryClientProvider>
    ),
  });
  return router;
}

/** Creates the router; TanStack Start calls this once per page load. */
export function getRouter() {
  return createAppRouter();
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
