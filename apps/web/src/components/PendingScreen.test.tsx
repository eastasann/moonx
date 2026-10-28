import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ana, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import { PENDING_MS, SLOW_LOADING_MS } from "./states";

// A signed-in screen while its route loads (design-spec 6.0.6「ローディング」).

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** U1, which answers only when the test lets it; other calls are not found. */
function heldMe() {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  stubApi(({ path }) =>
    path === "/api/v1/me" ? held.then(() => Response.json(ana)) : undefined,
  );
  return { release: () => act(release) };
}

const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

/** Whether `text` is drawn as a skeleton's bars: inert, under its placeholder. */
const isSkeleton = (text: string) =>
  screen.getByText(text).closest("[inert]") !== null;

describe("PendingScreen", () => {
  test("the frame and the screen's skeleton, then Taking longer than usual with Retry, then the screen once the load ends", async () => {
    const { release } = heldMe();
    renderApp(`/w/${workspaceId}`);
    await wait(PENDING_MS);
    // 5's skeleton (DashboardSkeleton) in the frame's skeleton.
    expect(isSkeleton("Due soon")).toBe(true);
    expect(isSkeleton("Recent activity")).toBe(true);
    expect(screen.queryByText("Taking longer than usual")).toBeNull();

    await wait(SLOW_LOADING_MS - PENDING_MS);
    expect(
      screen.getByRole("heading", { name: "Taking longer than usual" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    await release();
    expect(
      await screen.findByRole("heading", { level: 1, name: "BCDX" }),
    ).toBeTruthy();
  });

  test("the workspace's load after the session's goes on counting the same 10 seconds", async () => {
    // U1 answers after 4 seconds without BCDX, so the workspace's route asks it again,
    // and that answer does not come.
    let asked = 0;
    stubApi(({ path }) => {
      if (path !== "/api/v1/me") return undefined;
      asked += 1;
      if (asked > 1) return new Promise<Response>(() => {});
      return new Promise<Response>((resolve) =>
        setTimeout(
          () => resolve(Response.json({ ...ana, memberships: [] })),
          4000,
        ),
      );
    });
    renderApp(`/w/${workspaceId}`);
    await wait(4000 + PENDING_MS);
    expect(asked).toBe(2);
    expect(isSkeleton("Due soon")).toBe(true);

    await wait(SLOW_LOADING_MS - 4000 - PENDING_MS);
    expect(
      screen.getByRole("heading", { name: "Taking longer than usual" }),
    ).toBeTruthy();
  });

  test("a screen without the frame: its skeleton alone, then Taking longer than usual", async () => {
    heldMe();
    renderApp("/welcome");
    await wait(PENDING_MS);
    expect(isSkeleton("Invitation")).toBe(true);
    expect(screen.queryByRole("navigation")).toBeNull();

    await wait(SLOW_LOADING_MS - PENDING_MS);
    expect(
      screen.getByRole("heading", { name: "Taking longer than usual" }),
    ).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
