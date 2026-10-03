import type { Comment, CommentThread } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { emptyDashboard, makeMe, renderApp, stubApi, WORKSPACE } from "./support";

const VALIDATION = "66666666-6666-4666-8666-666666666666";
const ME = makeMe();
const PAOLO = {
  id: "77777777-7777-4777-8777-777777777777",
  displayName: "Paolo Reyes",
  avatarUrl: null,
  badge: null,
};
const ANA = { id: ME.id, displayName: ME.displayName, avatarUrl: null, badge: null };
const TARGET = `validation_answer:${VALIDATION}:V.01.WHO`;
const OPEN = `/w/${WORKSPACE}?panel=comments&target=${TARGET}`;

// The panel is a column beside the page on a desktop-wide window and a modal tray below it.
beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: /min-width/.test(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

let counter = 0;
function comment(patch: Partial<Comment> & Pick<Comment, "body" | "author">): Comment {
  counter += 1;
  return {
    id: `c0000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    workspace: { id: WORKSPACE, name: "BCDX" },
    target: { type: "validation_answer", id: VALIDATION, key: "V.01.WHO" },
    parentId: null,
    mentions: [],
    resolvedAt: null,
    resolvedBy: null,
    editedAt: null,
    deleted: false,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    ...patch,
  };
}

const thread = (root: Comment, replies: Comment[] = []): CommentThread => ({ root, replies });

const members = {
  items: [
    {
      user: ANA,
      email: null,
      role: "owner",
      joinedAt: "2026-01-01T00:00:00Z",
      isPersonalOwner: false,
    },
    {
      user: PAOLO,
      email: null,
      role: "member",
      joinedAt: "2026-01-01T00:00:00Z",
      isPersonalOwner: false,
    },
  ],
};

function stubComments(
  state: { threads: CommentThread[] },
  extra: Parameters<typeof stubApi>[0] = {},
) {
  return stubApi({
    "GET /api/v1/me": () => ({ body: ME }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET /api/v1/workspaces/${WORKSPACE}/members`]: () => ({ body: members }),
    "GET /api/v1/comments": () => ({ body: { threads: state.threads } }),
    ...emptyDashboard(),
    ...extra,
  });
}

const panel = async () => screen.findByRole("complementary", { name: "Comments" });

test("shows threads with one level of replies, mentions, deleted comments and resolved ones collapsed", async () => {
  const root = comment({ author: PAOLO, body: "Who buys this? @Ana Villanueva", mentions: [ANA] });
  const reply = comment({ author: ANA, body: "Office workers.", parentId: root.id });
  const gone = comment({ author: PAOLO, body: "secret", deleted: true });
  const done = comment({
    author: PAOLO,
    body: "Already answered",
    resolvedAt: new Date().toISOString(),
    resolvedBy: ANA,
  });
  stubComments({ threads: [thread(root, [reply]), thread(gone), thread(done)] });
  await renderApp(OPEN);
  const view = within(await panel());
  expect(await view.findByText("Who buys this?")).toBeInTheDocument();
  expect(view.getByText("@Ana Villanueva")).toBeInTheDocument();
  expect(view.getByText("Office workers.")).toBeInTheDocument();
  expect(view.getByText("deleted")).toBeInTheDocument();
  expect(view.queryByText("secret")).toBeNull();
  const resolved = view.getByRole("button", { name: "Resolved (1)" });
  expect(resolved).toHaveAttribute("aria-expanded", "false");
  expect(view.getByText("Already answered")).not.toBeVisible();
  await userEvent.click(resolved);
  expect(view.getByText("Already answered")).toBeVisible();
  expect(view.getByText("Resolved by Ana Villanueva")).toBeInTheDocument();
});

test("an item with no comments says so and still offers the input", async () => {
  stubComments({ threads: [] });
  await renderApp(OPEN);
  const view = within(await panel());
  expect(await view.findByText("No comments yet")).toBeInTheDocument();
  expect(view.getByRole("textbox", { name: "Add a comment" })).toBeInTheDocument();
});

test("posting sends the text and the new comment appears", async () => {
  const state = { threads: [] as CommentThread[] };
  const api = stubComments(state, {
    "POST /api/v1/comments": ({ body }) => {
      const sent = body as { body: string };
      const created = comment({ author: ANA, body: sent.body });
      state.threads = [thread(created)];
      return { status: 201, body: created };
    },
  });
  await renderApp(OPEN);
  const view = within(await panel());
  await userEvent.type(
    await view.findByRole("textbox", { name: "Add a comment" }),
    "Check Lacson St.",
  );
  await userEvent.click(view.getByRole("button", { name: "Post" }));
  expect(await view.findByText("Check Lacson St.")).toBeInTheDocument();
  const post = api.calls.find((c) => c.method === "POST");
  expect(post?.body).toEqual({
    workspaceId: WORKSPACE,
    target: { type: "validation_answer", id: VALIDATION, key: "V.01.WHO" },
    body: "Check Lacson St.",
    mentionUserIds: [],
  });
  expect(view.getByRole("textbox", { name: "Add a comment" })).toHaveValue("");
});

test("a reply is posted under the first comment of its thread", async () => {
  const root = comment({ author: PAOLO, body: "Who buys this?" });
  const state = { threads: [thread(root)] };
  const api = stubComments(state, {
    "POST /api/v1/comments": ({ body }) => {
      const sent = body as { body: string };
      const created = comment({ author: ANA, body: sent.body, parentId: root.id });
      state.threads = [thread(root, [created])];
      return { status: 201, body: created };
    },
  });
  await renderApp(OPEN);
  const view = within(await panel());
  await userEvent.click(await view.findByRole("button", { name: "Reply" }));
  await userEvent.type(
    view.getAllByRole("textbox", { name: "Reply" })[0] as HTMLElement,
    "Students",
  );
  await userEvent.click(view.getAllByRole("button", { name: "Reply" }).at(-1) as HTMLElement);
  expect(await view.findByText("Students")).toBeInTheDocument();
  expect(api.calls.find((c) => c.method === "POST")?.body).toMatchObject({ parentId: root.id });
});

test("a thread can be resolved and then sits in the collapsed group", async () => {
  const root = comment({ author: PAOLO, body: "Who buys this?" });
  const state = { threads: [thread(root)] };
  const api = stubComments(state, {
    [`POST /api/v1/comments/${root.id}/resolve`]: () => {
      state.threads = [thread({ ...root, resolvedAt: new Date().toISOString(), resolvedBy: ANA })];
      return { body: state.threads[0]?.root };
    },
  });
  await renderApp(OPEN);
  const view = within(await panel());
  await userEvent.click(await view.findByRole("button", { name: "Resolve" }));
  expect(await view.findByRole("button", { name: "Resolved (1)" })).toBeInTheDocument();
  expect(view.getByText("Who buys this?")).not.toBeVisible();
  expect(api.unhandled).toEqual([]);
});

test("a failed post keeps the input and Retry sends it again", async () => {
  const state = { threads: [] as CommentThread[] };
  let fail = true;
  stubComments(state, {
    "POST /api/v1/comments": ({ body }) => {
      if (fail) {
        return {
          status: 503,
          body: { error: { code: "UPSTREAM_UNAVAILABLE", message: "down", requestId: "abcdef12" } },
        };
      }
      const created = comment({ author: ANA, body: (body as { body: string }).body });
      state.threads = [thread(created)];
      return { status: 201, body: created };
    },
  });
  await renderApp(OPEN);
  const view = within(await panel());
  const input = await view.findByRole("textbox", { name: "Add a comment" });
  await userEvent.type(input, "Will it work?");
  await userEvent.click(view.getByRole("button", { name: "Post" }));
  expect(await view.findByText("Couldn't post")).toBeInTheDocument();
  expect(input).toHaveValue("Will it work?");
  fail = false;
  await userEvent.click(view.getByRole("button", { name: "Retry" }));
  expect(await view.findByText("Will it work?", { selector: "div *" })).toBeInTheDocument();
  await waitFor(() => expect(view.queryByText("Couldn't post")).toBeNull());
});

test("a mention the server refuses is explained", async () => {
  stubComments(
    { threads: [] },
    {
      "POST /api/v1/comments": () => ({
        status: 422,
        body: { error: { code: "INVALID_MENTION", message: "no", requestId: "abcdef12" } },
      }),
    },
  );
  await renderApp(OPEN);
  const view = within(await panel());
  await userEvent.type(await view.findByRole("textbox", { name: "Add a comment" }), "Hi");
  await userEvent.click(view.getByRole("button", { name: "Post" }));
  expect(
    await view.findByText("You can only mention members of this workspace."),
  ).toBeInTheDocument();
});

test("an archived idea refuses the post and the panel stops offering the input", async () => {
  stubComments(
    { threads: [] },
    {
      "POST /api/v1/comments": () => ({
        status: 409,
        body: { error: { code: "ARCHIVED", message: "archived", requestId: "abcdef12" } },
      }),
    },
  );
  await renderApp(OPEN);
  const view = within(await panel());
  await userEvent.type(await view.findByRole("textbox", { name: "Add a comment" }), "Hi");
  await userEvent.click(view.getByRole("button", { name: "Post" }));
  await waitFor(() => expect(view.queryByRole("textbox", { name: "Add a comment" })).toBeNull());
  expect(view.getAllByText("This is archived. Restore it to make changes.").length).toBeGreaterThan(
    0,
  );
});

test("only your own comments can be edited or deleted", async () => {
  const mine = comment({ author: ANA, body: "Mine" });
  const theirs = comment({ author: PAOLO, body: "Theirs" });
  stubComments({ threads: [thread(mine), thread(theirs)] });
  await renderApp(OPEN);
  const view = within(await panel());
  await view.findByText("Mine");
  expect(view.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
  expect(view.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
});
