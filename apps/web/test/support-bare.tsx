import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { i18n } from "../src/lib/i18n";
import { ME_KEY } from "../src/lib/session";
import { makeMe } from "./support";

/**
 * Renders one screen without the app frame, with the account already cached. Overlays cannot be
 * opened inside the full frame under jsdom (the test never returns), so the tests that open a
 * menu or a list use this harness, one overlay test per file.
 */
export function renderBare(screen: ReactNode, me = makeMe()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(ME_KEY, me);
  const root = createRootRoute({ component: () => <>{screen}</> });
  const router = createRouter({
    routeTree: root.addChildren([]),
    defaultNotFoundComponent: () => null,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}
