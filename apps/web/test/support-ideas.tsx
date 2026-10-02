import type { Me } from "@moonx/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { i18n } from "../src/lib/i18n";
import type { IdeaSummary, IdeasSearch } from "../src/lib/ideas";
import { ME_KEY } from "../src/lib/session";
import { Ideas } from "../src/screens/Ideas";
import { makeMe, WORKSPACE } from "./support";

export const ANA = "44444444-4444-4444-8444-444444444444";
export const KENJI = "66666666-6666-4666-8666-666666666666";

export const IDEA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const IDEA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/** An IdeaSummary as I1 returns it, with every check done unless `checks` says otherwise. */
export function makeIdea(overrides: Partial<IdeaSummary> = {}): IdeaSummary {
  return {
    id: IDEA_A,
    name: "Piaya Gift Box Delivery",
    oneLineConcept: "Boxed piaya delivered to Manila offices",
    proposer: { id: ANA, displayName: "Ana Villanueva", avatarUrl: null, badge: null },
    stage: "planning",
    latestDecision: "proceed",
    archived: false,
    checks: [
      { key: "competitors", state: "done" },
      { key: "local_price", state: "done" },
      { key: "costs", state: "done" },
      { key: "break_even", state: "done" },
      { key: "permits", state: "done" },
      { key: "demand_signal", state: "done" },
    ],
    keyMetrics: {
      initial_cost_total: { value: 450000, bound: "lower", reason: null },
      break_even_units_day: { value: 13, bound: "exact", reason: null },
      expected_operating_profit: { value: null, bound: "exact", reason: "needs_price" },
      payback_months: { value: 9.2, bound: "exact", reason: null },
    },
    plans: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "Gift box plan",
        latestVersionName: "v1 For advisors",
        latestGoNoGo: "launch",
      },
    ],
    lastActivityAt: hoursAgo(2),
    createdAt: hoursAgo(48),
    ...overrides,
  };
}

export const BACOLOD = makeIdea({
  id: IDEA_B,
  name: "Bacolod Health Bowl",
  oneLineConcept: "Healthy rice bowls for office lunch",
  proposer: { id: KENJI, displayName: "Kenji Ito", avatarUrl: null, badge: null },
  stage: "validation",
  latestDecision: "hold",
  checks: [
    { key: "competitors", state: "done" },
    { key: "local_price", state: "done" },
    { key: "costs", state: "partial" },
    { key: "break_even", state: "done" },
    { key: "permits", state: "not_started" },
    { key: "demand_signal", state: "done" },
  ],
  plans: [],
  lastActivityAt: hoursAgo(26),
});

export const IDEAS_PATH = `/api/v1/workspaces/${WORKSPACE}/ideas`;

export const MEMBERS = {
  items: [
    {
      user: { id: ANA, displayName: "Ana Villanueva", avatarUrl: null, badge: null },
      email: null,
      role: "owner",
      joinedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      user: { id: KENJI, displayName: "Kenji Ito", avatarUrl: null, badge: null },
      email: null,
      role: "member",
      joinedAt: "2026-01-02T00:00:00.000Z",
    },
  ],
};

/**
 * Renders screen 6 without the app frame, with the account already cached. Popovers and menus
 * cannot be opened inside the full frame under jsdom (the test never returns), so the tests that
 * open one use this harness; `onSearchChange` records what the screen asks the URL to become.
 */
export function renderIdeasScreen(
  options: {
    me?: Me;
    search?: Partial<IdeasSearch>;
    onSearchChange?: (patch: Partial<IdeasSearch>) => void;
  } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(ME_KEY, options.me ?? makeMe());
  const search: IdeasSearch = {
    decision: "not_dropped",
    archived: false,
    sort: "updated",
    q: undefined,
    ...options.search,
  };
  const root = createRootRoute({
    component: () => (
      <Ideas
        workspaceId={WORKSPACE}
        search={search}
        onSearchChange={options.onSearchChange ?? (() => {})}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([]),
    defaultNotFoundComponent: () => null,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const view = render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { router, queryClient, ...view };
}
