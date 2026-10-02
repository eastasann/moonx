import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { makeMe, OTHER, renderApp, stubApi, WORKSPACE } from "./support";
import { IDEA_A } from "./support-ideas";

const ANA = {
  id: "44444444-4444-4444-8444-444444444444",
  displayName: "Ana Villanueva",
  avatarUrl: null,
  badge: null,
};
const PAOLO = {
  id: "77777777-7777-4777-8777-777777777777",
  displayName: "Paolo Gonzaga",
  avatarUrl: null,
  badge: null,
};
const VALIDATION = "66666666-6666-4666-8666-666666666666";

const at = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

const MENTION = {
  id: "a0000000-0000-4000-8000-000000000001",
  kind: "mention",
  workspace: { id: WORKSPACE, name: "BCDX" },
  actor: PAOLO,
  title: "Paolo mentioned you on 01 WHO",
  excerpt: "@Kenji can you check this?",
  link: {
    screen: 11,
    workspaceId: WORKSPACE,
    ideaId: IDEA_A,
    sectionKey: "01",
    questionKey: "V.01.WHO",
    panel: "comments",
    target: { type: "validation_answer", id: VALIDATION, key: "V.01.WHO" },
  },
  accessible: true,
  readAt: null,
  createdAt: at(1),
};
const DECISION = {
  id: "a0000000-0000-4000-8000-000000000002",
  kind: "decision",
  workspace: { id: OTHER, name: "Side project" },
  actor: ANA,
  title: "Ana recorded Hold on Bacolod Health Bowl",
  excerpt: null,
  link: { screen: 13, workspaceId: OTHER, ideaId: IDEA_A },
  accessible: true,
  readAt: at(3),
  createdAt: at(5),
};
const GONE = {
  id: "a0000000-0000-4000-8000-000000000003",
  kind: "comment",
  workspace: { id: "99999999-9999-4999-8999-999999999999", name: "Old team" },
  actor: PAOLO,
  title: "Paolo commented on 02 CATEGORY",
  excerpt: "Looks fine",
  link: { screen: 13, workspaceId: "99999999-9999-4999-8999-999999999999", ideaId: IDEA_A },
  accessible: false,
  readAt: null,
  createdAt: at(30),
};

function notificationsApi(items = [MENTION, DECISION, GONE], unread = 2) {
  let total = unread;
  const stub = stubApi({
    "GET /api/v1/me": () => ({ body: makeMe() }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total } }),
    "GET /api/v1/notifications": ({ url }) => ({
      body: {
        items:
          url.searchParams.get("filter") === "unread"
            ? items.filter((item) => item.readAt === null)
            : items,
        nextCursor: null,
      },
    }),
    [`POST /api/v1/notifications/${MENTION.id}/read`]: () => {
      total = Math.max(0, total - 1);
      return { status: 204 };
    },
    [`POST /api/v1/notifications/${GONE.id}/read`]: () => ({ status: 204 }),
    "POST /api/v1/notifications/read-all": () => {
      total = 0;
      return { status: 204 };
    },
  });
  return stub;
}

const list = () => screen.findByRole("grid", { name: "Notifications" });

test("notifications of every workspace come in one list, each with its workspace and an unread mark", async () => {
  notificationsApi();
  await renderApp("/notifications");
  const rows = within(await list()).getAllByRole("row");
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent("Paolo mentioned you on 01 WHO");
  expect(rows[0]).toHaveTextContent("@Kenji can you check this?");
  expect(rows[0]).toHaveTextContent("BCDX");
  expect(rows[0]).toHaveTextContent("Unread");
  expect(rows[1]).toHaveTextContent("Side project");
  expect(rows[1]).not.toHaveTextContent("Unread");
});

test("pressing a mention marks it read and opens the item with its comments panel", async () => {
  const { calls } = notificationsApi();
  const user = userEvent.setup();
  const { router } = await renderApp("/notifications");
  const rows = within(await list()).getAllByRole("row");
  await user.click(rows[0] as HTMLElement);
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/ideas/${IDEA_A}/questions/01`),
  );
  expect(router.state.location.search).toMatchObject({
    q: "V.01.WHO",
    panel: "comments",
    target: `validation_answer:${VALIDATION}:V.01.WHO`,
  });
  expect(
    calls.some((c) => c.method === "POST" && c.url.pathname.endsWith(`${MENTION.id}/read`)),
  ).toBe(true);
});

test("a notification of another workspace opens in that workspace", async () => {
  notificationsApi();
  const user = userEvent.setup();
  const { router } = await renderApp("/notifications");
  const rows = within(await list()).getAllByRole("row");
  await user.click(rows[1] as HTMLElement);
  await waitFor(() => expect(router.state.location.pathname).toBe(`/w/${OTHER}/ideas/${IDEA_A}`));
});

test("one the person lost access to says so, is marked read, and goes nowhere", async () => {
  const { calls } = notificationsApi();
  const user = userEvent.setup();
  const { router } = await renderApp("/notifications");
  const rows = within(await list()).getAllByRole("row");
  expect(rows[2]).toHaveTextContent("You no longer have access");
  expect(rows[0]).not.toHaveTextContent("You no longer have access");
  await user.click(rows[2] as HTMLElement);
  // The row keeps saying it, and a message says it where the person pressed.
  expect((await screen.findAllByText("You no longer have access")).length).toBeGreaterThan(1);
  expect(router.state.location.pathname).toBe("/notifications");
  await waitFor(() =>
    expect(
      calls.some((c) => c.method === "POST" && c.url.pathname.endsWith(`${GONE.id}/read`)),
    ).toBe(true),
  );
});

test("Unread shows only the unread ones and the filter lives in the URL", async () => {
  const { calls } = notificationsApi();
  const user = userEvent.setup();
  const { router } = await renderApp("/notifications");
  await list();
  await user.click(screen.getByRole("radio", { name: "Unread" }));
  await waitFor(() =>
    expect(
      calls.some(
        (c) =>
          c.url.pathname === "/api/v1/notifications" &&
          c.url.searchParams.get("filter") === "unread",
      ),
    ).toBe(true),
  );
  await waitFor(() => expect(router.state.location.search).toMatchObject({ filter: "unread" }));
  await waitFor(() => expect(within(screen.getByRole("grid")).getAllByRole("row")).toHaveLength(2));
});

test("?filter=unread opens on the unread list", async () => {
  const { calls } = notificationsApi();
  await renderApp("/notifications?filter=unread");
  await list();
  expect(
    calls.some(
      (c) =>
        c.url.pathname === "/api/v1/notifications" && c.url.searchParams.get("filter") === "unread",
    ),
  ).toBe(true);
});

test("Mark all as read sends one request and is disabled when nothing is unread", async () => {
  const { calls } = notificationsApi();
  const user = userEvent.setup();
  await renderApp("/notifications");
  await list();
  const button = screen.getByRole("button", { name: "Mark all as read" });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  await waitFor(() =>
    expect(calls.some((c) => c.method === "POST" && c.url.pathname.endsWith("/read-all"))).toBe(
      true,
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled(),
  );
});

test("an empty list says the person is caught up", async () => {
  notificationsApi([], 0);
  await renderApp("/notifications");
  expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
});
