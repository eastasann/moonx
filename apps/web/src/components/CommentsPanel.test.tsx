import type { Comment, CommentThread, UserRef } from "@moonx/schemas";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  answer,
  home,
  questionsRead,
  section01,
  validationId,
} from "../test/validation";

// PNL-1, the comments panel, on 11 (design-spec 6.0.4・6.0.1, SDD 4章・5.11 C1–C3).

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = `/w/${workspaceId}/ideas/${home.idea.id}/questions/01`;
const validationPath = `/api/v1/validations/${validationId}`;

const ref = (id: string, displayName: string): UserRef => ({
  id,
  displayName,
  avatarUrl: null,
  badge: null,
});
const anaRef = ref(ana.id, ana.displayName);
const paolo = ref("6f1c2b3a-0000-4000-8000-000000000002", "Paolo Gonzaga");
const kenji = ref("6f1c2b3a-0000-4000-8000-000000000003", "Kenji Mori");

const whoTarget = {
  type: "validation_answer",
  id: validationId,
  key: "V.01.WHO",
};

const comment = (id: string, extra: Partial<Comment> = {}): Comment => ({
  id,
  workspace: { id: workspaceId, name: "BCDX" },
  target: whoTarget as Comment["target"],
  parentId: null,
  author: paolo,
  body: "Is the airport kiosk open on Sundays?",
  mentions: [],
  resolvedAt: null,
  resolvedBy: null,
  editedAt: null,
  deleted: false,
  createdAt: "2026-10-20T01:00:00Z",
  ...extra,
});

const rootId = "c0000000-0000-4000-8000-000000000001";
const thread: CommentThread = {
  root: comment(rootId),
  label: "01 WHO",
  replies: [
    comment("c0000000-0000-4000-8000-000000000002", {
      parentId: rootId,
      author: anaRef,
      body: "Yes, from 9 to 5.",
    }),
  ],
};

/**
 * The API of 11 with C1–C3 and W8: `threads` answers C1, `write` the writes (C1 POST,
 * C2, C3), which a test may hold back or refuse.
 */
function panelApi({
  threads = [thread],
  archived = false,
  write = (_call: Call): Response | undefined => undefined,
}: {
  threads?: CommentThread[];
  archived?: boolean;
  write?: (call: Call) => Response | Promise<Response> | undefined;
} = {}) {
  return stubApi((call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(ana);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(ana);
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${home.idea.id}/validation`
    ) {
      return Response.json({ ...home, idea: { ...home.idea, archived } });
    }
    if (method === "GET" && path === `${validationPath}/questions/01`) {
      return Response.json(
        questionsRead(
          section01,
          section01.questions.map(({ key }) =>
            answer(key, key === "V.01.WHO" ? { commentCount: 2 } : {}),
          ),
        ),
      );
    }
    if (method === "GET" && path.startsWith("/api/v1/comments?")) {
      return Response.json({
        threads,
        unresolvedCount: threads.filter(({ root }) => root.resolvedAt === null)
          .length,
      });
    }
    if (method === "GET" && path.includes("/mention-candidates?")) {
      return Response.json({ items: [anaRef, kenji, paolo] });
    }
    if (path.startsWith("/api/v1/comments")) return write(call);
    return undefined;
  });
}

/** The panel: a column beside the body on a desktop, a dialog under it (4.5 Panel). */
const panel = () =>
  screen.queryByRole("complementary", { name: "Comments" }) ??
  screen.getByRole("dialog", { name: "Comments" });
const findPanel = () => waitFor(panel);

describe("PNL-1 Comments (design-spec 6.0.4)", () => {
  test("the header's 💬 counts the unresolved threads and opens the screen's, each under its item", async () => {
    const user = userEvent.setup();
    const calls = panelApi();
    renderApp(base);
    const open = await screen.findByRole("button", {
      name: "Comments, 1 unresolved thread",
    });
    await user.click(open);
    await within(await findPanel()).findByText(
      "Is the airport kiosk open on Sundays?",
    );
    expect(panel().textContent).toContain("01 WHO");
    expect(panel().textContent).toContain("Yes, from 9 to 5.");
    // The screen's list reads 11's section with the idea's comments (SDD 4章・6.3).
    expect(
      calls.some(
        ({ path }) =>
          path.startsWith("/api/v1/comments?") &&
          path.includes("containerType=validation") &&
          path.includes(`containerId=${validationId}`) &&
          path.includes("sectionKeys=01"),
      ),
    ).toBe(true);
    // A new thread from the header's 💬 goes on the idea.
    expect(
      within(panel()).getByRole("textbox", {
        name: `Comment on ${home.idea.name}`,
      }),
    ).toBeTruthy();
  });

  test("an answer's 💬 opens its thread; @ and a name mention a member, and Post sends it", async () => {
    const user = userEvent.setup();
    const calls = panelApi({
      threads: [],
      write: (call) =>
        call.method === "POST"
          ? Response.json(comment("c0000000-0000-4000-8000-000000000009"), {
              status: 201,
            })
          : undefined,
    });
    renderApp(base);
    await user.click(
      await screen.findByRole("button", {
        name: "Comments on 01 WHO, 2 comments",
      }),
    );
    await within(await findPanel()).findByText("No comments yet");
    expect(panel().textContent).toContain("On 01 WHO");
    const box = within(panel()).getByRole("textbox", { name: "Add a comment" });
    await user.type(box, "Ask @Pa");
    await user.click(
      await screen.findByRole("option", { name: "Paolo Gonzaga" }),
    );
    await user.type(box, "about Sundays");
    await user.click(within(panel()).getByRole("button", { name: "Post" }));
    await waitFor(() =>
      expect(
        calls.find(
          ({ method, path }) =>
            method === "POST" && path === "/api/v1/comments",
        )?.body,
      ).toEqual({
        workspaceId,
        target: {
          type: "validation_answer",
          id: validationId,
          key: "V.01.WHO",
        },
        body: "Ask @Paolo Gonzaga about Sundays",
        mentionUserIds: [paolo.id],
      }),
    );
    // Posted, the box is empty again for the next comment.
    await waitFor(() => expect(box).toHaveProperty("value", ""));
  });

  test("the URL opens the panel on an item; a target the screen does not show opens nothing", async () => {
    panelApi();
    renderApp(
      `${base}?panel=comments&target=validation_answer:${validationId}:V.01.WHO`,
    );
    await within(await findPanel()).findByText(
      "Is the airport kiosk open on Sundays?",
    );
    cleanup();
    vi.unstubAllGlobals();
    panelApi();
    renderApp(`${base}?panel=comments&target=cost_item:${validationId}`);
    await screen.findByRole("button", {
      name: "Comments, 1 unresolved thread",
    });
    expect(
      screen.queryByRole("complementary", { name: "Comments" }) ??
        screen.queryByRole("dialog", { name: "Comments" }),
    ).toBeNull();
  });

  test("Reply answers the thread; Resolve sends C3", async () => {
    const user = userEvent.setup();
    const calls = panelApi({
      write: (call) => {
        if (call.method === "POST" && call.path === "/api/v1/comments") {
          return Response.json(
            comment("c0000000-0000-4000-8000-000000000010"),
            {
              status: 201,
            },
          );
        }
        if (call.path.endsWith("/resolve")) return Response.json(thread.root);
        return undefined;
      },
    });
    renderApp(
      `${base}?panel=comments&target=validation_answer:${validationId}:V.01.WHO`,
    );
    await within(await findPanel()).findByText(
      "Is the airport kiosk open on Sundays?",
    );
    await user.click(within(panel()).getByRole("button", { name: "Reply" }));
    await user.type(
      within(panel()).getByRole("textbox", { name: "Reply to Paolo Gonzaga" }),
      "Checked on Sunday too.",
    );
    await user.click(
      within(panel())
        .getAllByRole("button", { name: "Reply" })
        .at(-1) as HTMLElement,
    );
    await waitFor(() =>
      expect(
        calls.find(
          ({ method, path }) =>
            method === "POST" && path === "/api/v1/comments",
        )?.body,
      ).toEqual({
        workspaceId,
        target: {
          type: "validation_answer",
          id: validationId,
          key: "V.01.WHO",
        },
        parentId: rootId,
        body: "Checked on Sunday too.",
        mentionUserIds: [],
      }),
    );
    await user.click(within(panel()).getByRole("button", { name: "Resolve" }));
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path }) =>
            method === "POST" && path === `/api/v1/comments/${rootId}/resolve`,
        ),
      ).toBe(true),
    );
  });

  test("a resolved thread folds into one line, and Reopen takes the resolution back", async () => {
    const user = userEvent.setup();
    const resolved: CommentThread = {
      ...thread,
      root: {
        ...thread.root,
        resolvedAt: "2026-10-21T01:00:00Z",
        resolvedBy: anaRef,
      },
    };
    const calls = panelApi({
      threads: [resolved],
      write: (call) =>
        call.path.endsWith("/resolve") ? Response.json(thread.root) : undefined,
    });
    renderApp(
      `${base}?panel=comments&target=validation_answer:${validationId}:V.01.WHO`,
    );
    const fold = await within(await findPanel()).findByRole("button", {
      name: "Resolved · Paolo Gonzaga: Is the airport kiosk open on Sundays?",
    });
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    await user.click(fold);
    expect(panel().textContent).toContain("Resolved by Ana Villanueva");
    await user.click(within(panel()).getByRole("button", { name: "Reopen" }));
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path }) =>
            method === "DELETE" &&
            path === `/api/v1/comments/${rootId}/resolve`,
        ),
      ).toBe(true),
    );
  });

  test("the writer edits their own comment in place and deletes it after asking", async () => {
    const user = userEvent.setup();
    const replyId = "c0000000-0000-4000-8000-000000000002";
    const calls = panelApi({
      write: (call) => {
        if (call.method === "PATCH") {
          return Response.json({ ...thread.replies[0], body: "Yes, 9 to 6." });
        }
        if (call.method === "DELETE")
          return new Response(null, { status: 204 });
        return undefined;
      },
    });
    renderApp(
      `${base}?panel=comments&target=validation_answer:${validationId}:V.01.WHO`,
    );
    await within(await findPanel()).findByText("Yes, from 9 to 5.");
    // Only Ana's own comment has its ⋯.
    expect(
      within(panel()).queryByRole("button", {
        name: "More for Paolo Gonzaga's comment",
      }),
    ).toBeNull();
    await user.click(
      within(panel()).getByRole("button", {
        name: "More for Ana Villanueva's comment",
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const box = within(panel()).getByRole("textbox", {
      name: "Edit your comment",
    });
    await user.clear(box);
    await user.type(box, "Yes, 9 to 6.");
    await user.click(within(panel()).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PATCH")?.body).toEqual({
        body: "Yes, 9 to 6.",
        mentionUserIds: [],
      }),
    );
    await user.click(
      within(panel()).getByRole("button", {
        name: "More for Ana Villanueva's comment",
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    const ask = await screen.findByRole("alertdialog", {
      name: "Delete this comment?",
    });
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path }) =>
            method === "DELETE" && path === `/api/v1/comments/${replyId}`,
        ),
      ).toBe(true),
    );
  });

  test("a deleted comment stays in its thread as “deleted”", async () => {
    panelApi({
      threads: [
        {
          ...thread,
          replies: [
            { ...(thread.replies[0] as Comment), deleted: true, body: "" },
          ],
        },
      ],
    });
    renderApp(
      `${base}?panel=comments&target=validation_answer:${validationId}:V.01.WHO`,
    );
    const region = await findPanel();
    await within(region).findByText("deleted");
    expect(region.textContent).not.toContain("Yes, from 9 to 5.");
  });

  describe("a write that fails (6.0.4: in place, or the small dialog of 6.0.6)", () => {
    const itemPath = `${base}?panel=comments&target=validation_answer:${validationId}:V.01.WHO`;
    const posted = () =>
      Response.json(comment("c0000000-0000-4000-8000-000000000011"), {
        status: 201,
      });
    const offline = () => Promise.reject(new TypeError("Failed to fetch"));

    /** Types into the new thread's box and presses Post. */
    async function post(user: ReturnType<typeof userEvent.setup>) {
      const region = await findPanel();
      const box = await within(region).findByRole("textbox", {
        name: "Add a comment",
      });
      await user.type(box, "Sunday hours?");
      await user.click(within(region).getByRole("button", { name: "Post" }));
      return { region, box };
    }

    const postCalls = (calls: Call[]) =>
      calls.filter(
        ({ method, path }) => method === "POST" && path === "/api/v1/comments",
      );

    test("the network: Couldn't post and Retry under the box, the text kept; Retry posts it", async () => {
      const user = userEvent.setup();
      let attempts = 0;
      const calls = panelApi({
        threads: [],
        write: () => {
          attempts += 1;
          return attempts === 1 ? offline() : posted();
        },
      });
      renderApp(itemPath);
      const { region, box } = await post(user);
      await within(region).findByText("Couldn't post");
      expect(box).toHaveProperty("value", "Sunday hours?");
      expect(screen.queryByRole("alertdialog")).toBeNull();
      await user.click(within(region).getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(box).toHaveProperty("value", ""));
      expect(postCalls(calls).map(({ body }) => body)).toEqual([
        expect.objectContaining({ body: "Sunday hours?" }),
        expect.objectContaining({ body: "Sunday hours?" }),
      ]);
    });

    test("unexpected: the small dialog with the Ref; Retry posts the same text", async () => {
      const user = userEvent.setup();
      let attempts = 0;
      const calls = panelApi({
        threads: [],
        write: () => {
          attempts += 1;
          return attempts === 1 ? apiError(500, "INTERNAL") : posted();
        },
      });
      renderApp(itemPath);
      const { region, box } = await post(user);
      const failed = await screen.findByRole("alertdialog", {
        name: /Something went wrong/,
      });
      expect(failed.textContent).toContain("Ref: 8f14e45f");
      expect(region.textContent).not.toContain("Couldn't post");
      expect(box).toHaveProperty("value", "Sunday hours?");
      await user.click(within(failed).getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(box).toHaveProperty("value", ""));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(postCalls(calls)).toHaveLength(2);
      expect(postCalls(calls)[1]?.body).toEqual(postCalls(calls)[0]?.body);
    });

    test("unexpected: Close closes only the dialog; the panel and the typed text stay", async () => {
      const user = userEvent.setup();
      let attempts = 0;
      const calls = panelApi({
        threads: [],
        write: () => {
          attempts += 1;
          return attempts === 1 ? apiError(500, "INTERNAL") : posted();
        },
      });
      const router = renderApp(itemPath);
      const { region, box } = await post(user);
      const failed = await screen.findByRole("alertdialog", {
        name: /Something went wrong/,
      });
      await user.click(within(failed).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(router.state.location.search).toMatchObject({
        panel: "comments",
      });
      expect(panel()).toBe(region);
      expect(box).toHaveProperty("value", "Sunday hours?");
      // The text goes as it was typed when Post is pressed again.
      await user.click(within(region).getByRole("button", { name: "Post" }));
      await waitFor(() => expect(box).toHaveProperty("value", ""));
      expect(postCalls(calls)).toHaveLength(2);
      expect(postCalls(calls)[1]?.body).toEqual(postCalls(calls)[0]?.body);
    });

    test("refused for good: Couldn't post with the reason in place", async () => {
      const user = userEvent.setup();
      panelApi({ threads: [], write: () => apiError(403, "NO_ACCESS") });
      renderApp(itemPath);
      const { region, box } = await post(user);
      await within(region).findByText("Couldn't post");
      expect(region.textContent).toContain("You don't have access to this");
      expect(region.textContent).not.toContain("Ref:");
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(box).toHaveProperty("value", "Sunday hours?");
    });

    test("a mention refused: its own words in place, and who can be mentioned is read again", async () => {
      const user = userEvent.setup();
      const calls = panelApi({
        threads: [],
        write: () => apiError(422, "INVALID_MENTION"),
      });
      renderApp(itemPath);
      const candidates = () =>
        calls.filter(({ path }) => path.includes("/mention-candidates?"))
          .length;
      await within(await findPanel()).findByRole("textbox", {
        name: "Add a comment",
      });
      await waitFor(() => expect(candidates()).toBeGreaterThan(0));
      const before = candidates();
      const { region } = await post(user);
      await within(region).findByText(
        "Someone you mentioned can't be mentioned here. Remove the mention and post again.",
      );
      expect(region.textContent).toContain("Couldn't post");
      expect(screen.queryByRole("alertdialog")).toBeNull();
      await waitFor(() => expect(candidates()).toBeGreaterThan(before));
    });

    test("the rate limit: the wait in place, the text kept", async () => {
      const user = userEvent.setup();
      panelApi({
        threads: [],
        write: () => apiError(429, "RATE_LIMITED", { retryAfterSeconds: 60 }),
      });
      renderApp(itemPath);
      const { region, box } = await post(user);
      await within(region).findByText(
        "Too many attempts. Try again in 1 minute.",
      );
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(box).toHaveProperty("value", "Sunday hours?");
    });

    /** Opens Ana's reply's ⋯ and deletes it after asking. */
    async function deleteReply(user: ReturnType<typeof userEvent.setup>) {
      const region = await findPanel();
      await within(region).findByText("Yes, from 9 to 5.");
      await user.click(
        within(region).getByRole("button", {
          name: "More for Ana Villanueva's comment",
        }),
      );
      await user.click(screen.getByRole("menuitem", { name: "Delete" }));
      const ask = await screen.findByRole("alertdialog", {
        name: "Delete this comment?",
      });
      await user.click(within(ask).getByRole("button", { name: "Delete" }));
      return region;
    }

    const replyId = "c0000000-0000-4000-8000-000000000002";
    const deletes = (calls: Call[]) =>
      calls.filter(
        ({ method, path }) =>
          method === "DELETE" && path === `/api/v1/comments/${replyId}`,
      );

    test("Delete, unexpected: the small dialog, not a toast; Retry deletes again", async () => {
      const user = userEvent.setup();
      let attempts = 0;
      const calls = panelApi({
        write: (call) => {
          if (call.method !== "DELETE") return undefined;
          attempts += 1;
          return attempts === 1
            ? apiError(500, "INTERNAL")
            : new Response(null, { status: 204 });
        },
      });
      renderApp(itemPath);
      await deleteReply(user);
      const failed = await screen.findByRole("alertdialog", {
        name: /Something went wrong/,
      });
      expect(failed.textContent).toContain("Ref: 8f14e45f");
      expect(screen.queryByText(/Something went wrong\. Ref/)).toBeNull();
      await user.click(within(failed).getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(deletes(calls)).toHaveLength(2));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    });

    test("Delete over the rate limit: the wait under the comment", async () => {
      const user = userEvent.setup();
      panelApi({
        write: (call) =>
          call.method === "DELETE"
            ? apiError(429, "RATE_LIMITED", { retryAfterSeconds: 60 })
            : undefined,
      });
      renderApp(itemPath);
      const region = await deleteReply(user);
      await within(region).findByText(
        "Too many attempts. Try again in 1 minute.",
      );
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    test("Resolve on the network: Couldn't save and Retry under the thread; Retry resolves it", async () => {
      const user = userEvent.setup();
      let attempts = 0;
      const calls = panelApi({
        write: (call) => {
          if (!call.path.endsWith("/resolve")) return undefined;
          attempts += 1;
          return attempts === 1 ? offline() : Response.json(thread.root);
        },
      });
      renderApp(itemPath);
      const region = await findPanel();
      await within(region).findByText("Yes, from 9 to 5.");
      await user.click(within(region).getByRole("button", { name: "Resolve" }));
      await within(region).findByText("Couldn't save");
      expect(screen.queryByRole("alertdialog")).toBeNull();
      await user.click(within(region).getByRole("button", { name: "Retry" }));
      await waitFor(() =>
        expect(
          calls.filter(
            ({ method, path }) =>
              method === "POST" &&
              path === `/api/v1/comments/${rootId}/resolve`,
          ),
        ).toHaveLength(2),
      );
      await waitFor(() =>
        expect(region.textContent).not.toContain("Couldn't save"),
      );
    });

    test("Reopen refused as gone: Couldn't save with the reason in place", async () => {
      const user = userEvent.setup();
      panelApi({
        threads: [
          {
            ...thread,
            root: {
              ...thread.root,
              resolvedAt: "2026-10-21T01:00:00Z",
              resolvedBy: anaRef,
            },
          },
        ],
        write: (call) =>
          call.path.endsWith("/resolve")
            ? apiError(404, "NOT_FOUND")
            : undefined,
      });
      renderApp(itemPath);
      const region = await findPanel();
      await user.click(
        await within(region).findByRole("button", {
          name: "Resolved · Paolo Gonzaga: Is the airport kiosk open on Sundays?",
        }),
      );
      await user.click(within(region).getByRole("button", { name: "Reopen" }));
      await within(region).findByText("Couldn't save");
      expect(region.textContent).toContain("It no longer exists");
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  test("an archived idea reads its threads with the notice and no way to write", async () => {
    panelApi({ archived: true });
    renderApp(
      `${base}?panel=comments&target=validation_answer:${validationId}:V.01.WHO`,
    );
    const region = await findPanel();
    await within(region).findByText("Is the airport kiosk open on Sundays?");
    expect(region.textContent).toContain(
      "This idea is archived. Restore it to make changes.",
    );
    expect(within(region).queryByRole("textbox")).toBeNull();
    expect(within(region).queryByRole("button", { name: "Reply" })).toBeNull();
    expect(
      within(region).queryByRole("button", { name: "Resolve" }),
    ).toBeNull();
  });

  test("a write refused as archived turns the panel read-only", async () => {
    const user = userEvent.setup();
    panelApi({ threads: [], write: () => apiError(409, "ARCHIVED") });
    renderApp(
      `${base}?panel=comments&target=validation_answer:${validationId}:V.01.WHO`,
    );
    const region = await findPanel();
    await user.type(
      await within(region).findByRole("textbox", { name: "Add a comment" }),
      "Sunday hours?",
    );
    await user.click(within(region).getByRole("button", { name: "Post" }));
    await within(region).findByText(
      "This idea is archived. Restore it to make changes.",
    );
    expect(within(region).queryByRole("textbox")).toBeNull();
    expect(region.textContent).not.toContain("Couldn't post");
  });

  test("a former member's names keep their name with “(former member)” (6.16)", async () => {
    const user = userEvent.setup();
    const former = (person: UserRef): UserRef => ({
      ...person,
      badge: "former_member",
    });
    const resolved: CommentThread = {
      ...thread,
      root: {
        ...thread.root,
        author: former(paolo),
        resolvedAt: "2026-10-21T01:00:00Z",
        resolvedBy: former(kenji),
      },
    };
    panelApi({
      threads: [
        resolved,
        {
          ...thread,
          root: {
            ...thread.root,
            id: "c0000000-0000-4000-8000-000000000020",
            author: former(paolo),
          },
        },
      ],
    });
    renderApp(
      `${base}?panel=comments&target=validation_answer:${validationId}:V.01.WHO`,
    );
    const region = await findPanel();
    const fold = await within(region).findByRole("button", {
      name: "Resolved · Paolo Gonzaga (former member): Is the airport kiosk open on Sundays?",
    });
    await user.click(fold);
    expect(region.textContent).toContain(
      "Resolved by Kenji Mori (former member)",
    );
    // The writer's line: the name with its badge.
    expect(
      within(region).getAllByText("(former member)").length,
    ).toBeGreaterThan(0);
    const replies = within(region).getAllByRole("button", { name: "Reply" });
    await user.click(replies.at(-1) as HTMLElement);
    expect(
      within(region).getByRole("textbox", {
        name: "Reply to Paolo Gonzaga (former member)",
      }),
    ).toBeTruthy();
  });

  describe("the panel in the history (SDD 4章)", () => {
    const index = (router: ReturnType<typeof renderApp>) =>
      router.state.location.state.__TSR_index;

    test("opened from the screen it adds an entry, and closing goes back over it", async () => {
      const user = userEvent.setup();
      panelApi();
      const router = renderApp(`${base}?q=V.01.WHO`);
      await user.click(
        await screen.findByRole("button", {
          name: "Comments on 01 WHO, 2 comments",
        }),
      );
      await findPanel();
      expect(index(router)).toBe(1);
      await user.click(within(panel()).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(index(router)).toBe(0));
      expect(router.state.location.search).toEqual({ q: "V.01.WHO" });
    });

    test("closing after a move on the screen keeps the move and drops only the panel", async () => {
      const user = userEvent.setup();
      panelApi();
      const router = renderApp(`${base}?q=V.01.WHO`);
      await user.click(
        await screen.findByRole("button", {
          name: "Comments on 01 WHO, 2 comments",
        }),
      );
      await findPanel();
      await router.navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => ({
          ...previous,
          q: "V.01.PROBLEM",
        }),
        replace: true,
      });
      await user.click(within(panel()).getByRole("button", { name: "Close" }));
      await waitFor(() =>
        expect(router.state.location.search).toEqual({ q: "V.01.PROBLEM" }),
      );
      expect(index(router)).toBe(1);
    });

    test("opened from its URL, closing takes the parameters off in place", async () => {
      const user = userEvent.setup();
      panelApi();
      const router = renderApp(
        `${base}?panel=comments&target=validation_answer:${validationId}:V.01.WHO`,
      );
      await within(await findPanel()).findByText(
        "Is the airport kiosk open on Sundays?",
      );
      await user.click(within(panel()).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(router.state.location.search).toEqual({}));
      expect(index(router)).toBe(0);
    });
  });
});
