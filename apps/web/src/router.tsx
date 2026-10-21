import { RouterProvider as AriaRouterProvider } from "@moonx/ui-web";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRouter,
  type RouterHistory,
  useRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PENDING_MS } from "./components/states";
import { createAutosave } from "./lib/autosave";
import { AutosaveProvider } from "./lib/autosave-react";
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
 * The app's router with its query cache and the page's saves. A request that finds the
 * session gone opens M9 while input is unsaved, to sign in again without leaving
 * (design-spec 5章「認証」); otherwise it drops the cache, which holds one user's data, and
 * goes to `/login?next=<where it was>` (SDD 4章・8.2・ADR-011); the many queries a screen
 * may lose at once go there once.
 *
 * @param history Tests pass a memory history.
 */
export function createAppRouter({ history }: { history?: RouterHistory } = {}) {
  const autosave = createAutosave({
    // The screen reloads to show why a save was refused: archived, read only (SDD 8.2).
    onRejected: () => void queryClient.invalidateQueries(),
  });
  const queryClient = createQueryClient(() => {
    const { pathname, searchStr } = router.latestLocation;
    if (isOpenToAll(pathname)) return;
    if (autosave.hasUnsaved()) {
      autosave.requireSignIn();
      return;
    }
    autosave.discardAll();
    queryClient.clear();
    const next = new URLSearchParams({ next: `${pathname}${searchStr}` });
    // In place of the screen: Back must not lead into it again, only to leave again. A
    // screen that holds the user meanwhile (M2 while it sends) does not hold an ended
    // session.
    void router.navigate({
      href: `${LOGIN_PATH}?${next}`,
      replace: true,
      ignoreBlocker: true,
    });
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
        <AutosaveProvider autosave={autosave}>
          <AriaRouting>{children}</AriaRouting>
        </AutosaveProvider>
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
