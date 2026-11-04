import type { Notification } from "@moonx/schemas";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ana,
  type Call,
  renderApp,
  stubApi,
  toastAfter,
  toastPlacements,
  toastRegion,
} from "../test/api";
import { workspaceId } from "../test/ideas";
import { home, validationId } from "../test/validation";

// 8 Notifications and the navigation's unread count (design-spec 6.15・5章, SDD 5.11 N1–N3).

/** happy-dom's window, whose viewport a test sets. */
const setViewport = (width: number) =>
  act(() =>
    (
      window as unknown as {
        happyDOM: {
          setViewport: (size: { width: number; height: number }) => void;
        };
      }
    ).happyDOM.setViewport({ width, height: 900 }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  setViewport(1024);
});

const paolo = {
  id: "6f1c2b3a-0000-4000-8000-000000000002",
  displayName: "Paolo Gonzaga",
  avatarUrl: null,
  badge: null,
};

const notification = (
  id: string,
  extra: Partial<Notification> = {},
): Notification => ({
  id,
  kind: "mention",
  workspace: { id: workspaceId, name: "BCDX" },
  actor: paolo,
  title: `Paolo Gonzaga mentioned you on 01 WHO · ${home.idea.name}`,
  excerpt: "@Ana Villanueva is the kiosk open on Sundays?",
  link: {
    screen: 11,
    workspaceId,
    ideaId: home.idea.id,
    sectionKey: "01",
    questionKey: "V.01.WHO",
    panel: "comments",
    target: { type: "validation_answer", id: validationId, key: "V.01.WHO" },
  },
  accessible: true,
  readAt: null,
  createdAt: "2026-10-21T01:00:00Z",
  ...extra,
});

const mention = notification("a0000000-0000-4000-8000-000000000001");
const decided = notification("a0000000-0000-4000-8000-000000000002", {
  kind: "decision",
  title: `Paolo Gonzaga recorded Hold on ${home.idea.name}`,
  excerpt: "Costs are not in yet.",
  link: { screen: 13, workspaceId, ideaId: home.idea.id },
  readAt: "2026-10-20T01:00:00Z",
});
const gone = notification("a0000000-0000-4000-8000-000000000003", {
  title: "Paolo Gonzaga mentioned you",
  excerpt: null,
  accessible: false,
});

function notificationsApi({
  items = [mention, decided],
  more = [],
  unread = 1,
}: {
  items?: Notification[];
  /** N1's second page, after "Show more". */
  more?: Notification[];
  unread?: number;
} = {}) {
  return stubApi((call: Call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(ana);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(ana);
    if (method === "GET" && path === "/api/v1/notifications/unread-count") {
      return Response.json({ total: unread });
    }
    if (method === "GET" && path.startsWith("/api/v1/notifications?")) {
      const onlyUnread = path.includes("filter=unread");
      if (path.includes("cursor=50")) {
        return Response.json({ items: more, nextCursor: null });
      }
      return Response.json({
        items: onlyUnread
          ? items.filter(({ readAt }) => readAt === null)
          : items,
        nextCursor: more.length === 0 ? null : "50",
      });
    }
    if (method === "POST" && path.startsWith("/api/v1/notifications/")) {
      return new Response(null, { status: 204 });
    }
    return undefined;
  });
}

describe("8 Notifications (design-spec 6.15)", () => {
  test("lists who did what and where with its excerpt, the unread bold and said so", async () => {
    notificationsApi();
    renderApp("/notifications");
    const list = await screen.findByRole("grid", { name: "Notifications" });
    const rows = within(list).getAllByRole("row");
    expect(rows[0]?.textContent).toContain(mention.title);
    expect(rows[0]?.textContent).toContain(
      "@Ana Villanueva is the kiosk open on Sundays?",
    );
    expect(rows[0]?.textContent).toContain("Unread · BCDX");
    expect(rows[1]?.textContent).not.toContain("Unread");
    // The navigation counts the unread, and says so (6.0.1).
    expect(
      screen.getAllByRole("link", { name: "Notifications, 1 unread" }).length,
    ).toBeGreaterThan(0);
  });

  test("a press marks it read and opens the item with its comments panel", async () => {
    const user = userEvent.setup();
    const calls = notificationsApi();
    const router = renderApp("/notifications");
    const list = await screen.findByRole("grid", { name: "Notifications" });
    await user.click(within(list).getByText(mention.title));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${home.idea.id}/questions/01`,
      ),
    );
    expect(router.state.location.search).toMatchObject({
      q: "V.01.WHO",
      panel: "comments",
      target: `validation_answer:${validationId}:V.01.WHO`,
    });
    expect(
      calls.some(
        ({ method, path }) =>
          method === "POST" &&
          path === `/api/v1/notifications/${mention.id}/read`,
      ),
    ).toBe(true);
  });

  test("a comment on a member's self analysis opens 12 on them with its thread", async () => {
    const user = userEvent.setup();
    const selfAnalysisId = "5a5a5a5a-0000-4000-8000-000000000001";
    const onShared = notification("a0000000-0000-4000-8000-000000000004", {
      kind: "comment",
      title:
        "Paolo Gonzaga commented on WHY Q1 · Paolo Gonzaga's self-analysis",
      link: {
        screen: 12,
        workspaceId,
        userId: paolo.id,
        sectionKey: "WHY",
        questionKey: "SA.WHY.1",
        panel: "comments",
        target: {
          type: "self_analysis_answer",
          id: selfAnalysisId,
          key: "SA.WHY.1",
        },
      },
    });
    notificationsApi({ items: [onShared] });
    const router = renderApp("/notifications");
    const list = await screen.findByRole("grid", { name: "Notifications" });
    await user.click(within(list).getByText(onShared.title));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/team/${paolo.id}`,
      ),
    );
    expect(router.state.location.search).toMatchObject({
      panel: "comments",
      target: `self_analysis_answer:${selfAnalysisId}:SA.WHY.1`,
    });
  });

  test("one the user can no longer read says so and stays", async () => {
    const user = userEvent.setup();
    notificationsApi({ items: [gone] });
    const router = renderApp("/notifications");
    const list = await screen.findByRole("grid", { name: "Notifications" });
    await user.click(within(list).getByText("Paolo Gonzaga mentioned you"));
    expect(await screen.findByText("You no longer have access")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/notifications");
  });

  test("on a phone, its toast sits above the TabBar, as on a workspace's screen (4.5 Toast)", async () => {
    const user = userEvent.setup();
    setViewport(390);
    notificationsApi({ items: [gone] });
    renderApp("/notifications");
    // 8 stands in the workspace last opened, with its TabBar (6.16).
    expect(
      await screen.findAllByRole("link", { name: "Notifications, 1 unread" }),
    ).not.toHaveLength(0);
    const list = await screen.findByRole("grid", { name: "Notifications" });
    const toast = await toastAfter("You no longer have access", () =>
      user.click(within(list).getByText("Paolo Gonzaga mentioned you")),
    );
    expect(toastRegion().contains(toast)).toBe(true);
    const placed = toastRegion().className;
    cleanup();
    const placements = toastPlacements();
    expect(placements.aboveTabBar).not.toBe(placements.atBottom);
    expect(placed).toBe(placements.aboveTabBar);
  });

  test("Unread shows the unread only; Mark all as read reads them all", async () => {
    const user = userEvent.setup();
    const calls = notificationsApi();
    const router = renderApp("/notifications?filter=unread");
    const list = await screen.findByRole("grid", { name: "Notifications" });
    expect(within(list).getAllByRole("row")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path }) =>
            method === "POST" && path === "/api/v1/notifications/read-all",
        ),
      ).toBe(true),
    );
    expect(router.state.location.search).toMatchObject({ filter: "unread" });
  });

  test("none unread: Nothing matches these filters, and Clear filters shows them all (6.0.6)", async () => {
    const user = userEvent.setup();
    notificationsApi({ items: [decided], unread: 0 });
    const router = renderApp("/notifications?filter=unread");
    expect(
      await screen.findByText("Nothing matches these filters"),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(
      await screen.findByRole("grid", { name: "Notifications" }),
    ).toBeTruthy();
  });

  test("reads 50 at a time; Show more reads the rest and adds it under them", async () => {
    const user = userEvent.setup();
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) =>
        notification(
          `a0000000-0000-4000-8000-${String(100 + from + index).padStart(12, "0")}`,
          {
            title: `Paolo Gonzaga mentioned you, #${from + index + 1}`,
            readAt: "2026-10-20T01:00:00Z",
          },
        ),
      );
    const calls = notificationsApi({ items: page(0, 50), more: page(50, 3) });
    renderApp("/notifications");
    const list = await screen.findByRole("grid", { name: "Notifications" });
    expect(within(list).getAllByRole("row")).toHaveLength(50);
    const reads = () =>
      calls
        .filter(({ path }) => path.startsWith("/api/v1/notifications?"))
        .map(({ path }) => new URL(path, "http://localhost").searchParams);
    expect(reads()[0]?.get("limit")).toBe("50");
    expect(reads()[0]?.has("cursor")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() =>
      expect(within(list).getAllByRole("row")).toHaveLength(53),
    );
    expect(reads().at(-1)?.get("cursor")).toBe("50");
    expect(reads().at(-1)?.get("limit")).toBe("50");
    const rows = within(list).getAllByRole("row");
    expect(rows[0]?.textContent).toContain("Paolo Gonzaga mentioned you, #1");
    expect(rows[50]?.textContent).toContain("Paolo Gonzaga mentioned you, #51");
    expect(rows[52]?.textContent).toContain("Paolo Gonzaga mentioned you, #53");
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  test("none: You're all caught up, and nothing to mark", async () => {
    notificationsApi({ items: [], unread: 0 });
    renderApp("/notifications");
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Mark all as read" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
