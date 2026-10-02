import { screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { makeMe, renderApp, stubApi, WORKSPACE } from "./support";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("?modal=new-idea shows nothing to a Viewer of the workspace", async () => {
  const me = makeMe();
  stubApi({
    "GET /api/v1/me": () => ({
      body: makeMe({
        memberships: me.memberships.map((m) =>
          m.workspace.id === WORKSPACE ? { ...m, role: "viewer" as const } : m,
        ),
      }),
    }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET /api/v1/workspaces/${WORKSPACE}/ideas`]: () => ({
      body: { items: [], nextCursor: null, hiddenDroppedCount: 0 },
    }),
    [`GET /api/v1/workspaces/${WORKSPACE}/members`]: () => ({ body: { items: [] } }),
  });
  await renderApp(`/w/${WORKSPACE}/ideas?modal=new-idea`);
  await screen.findByRole("heading", { name: "Ideas" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
