import type { Notification } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import { home, validationId } from "../test/validation";

// 8 Notifications and the navigation's unread count (design-spec 6.15・5章, SDD 5.11 N1–N3).

afterEach(() => {
  vi.unstubAllGlobals();
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
  unread = 1,
}: {
  items?: Notification[];
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
      return Response.json({
        items: onlyUnread
          ? items.filter(({ readAt }) => readAt === null)
          : items,
        nextCursor: null,
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

  test("one the user can no longer read says so and stays", async () => {
    const user = userEvent.setup();
    notificationsApi({ items: [gone] });
    const router = renderApp("/notifications");
    const list = await screen.findByRole("grid", { name: "Notifications" });
    await user.click(within(list).getByText("Paolo Gonzaga mentioned you"));
    expect(await screen.findByText("You no longer have access")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/notifications");
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
