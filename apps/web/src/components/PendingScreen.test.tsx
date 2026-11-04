import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createAppRouter } from "../router";
import { ana, apiError, renderApp, stubApi } from "../test/api";
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

  test("Retry drops the read the load waits for and asks again: the skeleton for 10 seconds more, then the screen", async () => {
    // The first U1 is answered only after the second has been asked, and too late: it
    // names someone else. The second does not come either; the third does.
    let asked = 0;
    let answerLate = () => {};
    stubApi(({ path }) => {
      if (path !== "/api/v1/me") return undefined;
      asked += 1;
      if (asked === 1) {
        return new Promise<Response>((resolve) => {
          answerLate = () =>
            resolve(Response.json({ ...ana, displayName: "Someone Else" }));
        });
      }
      if (asked === 2) return new Promise<Response>(() => {});
      return Response.json(ana);
    });
    renderApp(`/w/${workspaceId}`);
    await wait(SLOW_LOADING_MS);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await wait(0);
    expect(asked).toBe(2);
    expect(screen.queryByText("Taking longer than usual")).toBeNull();
    expect(isSkeleton("Due soon")).toBe(true);

    await wait(SLOW_LOADING_MS - PENDING_MS);
    expect(screen.queryByText("Taking longer than usual")).toBeNull();
    expect(isSkeleton("Due soon")).toBe(true);
    await wait(PENDING_MS);
    expect(
      screen.getByRole("heading", { name: "Taking longer than usual" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "BCDX" }),
    ).toBeTruthy();
    expect(screen.getAllByText(ana.displayName).length).toBeGreaterThan(0);
    await act(answerLate);
    await wait(0);
    expect(screen.queryByText("Someone Else")).toBeNull();
    expect(screen.getAllByText(ana.displayName).length).toBeGreaterThan(0);
  });

  test("Retry asks again for a fresh U1 the workspace's load waits for, though one is cached", async () => {
    // The first U1 lacks BCDX, so the workspace's route asks it again, and that answer
    // does not come; the next one has BCDX.
    let asked = 0;
    stubApi(({ path }) => {
      if (path !== "/api/v1/me") return undefined;
      asked += 1;
      if (asked === 1) return Response.json({ ...ana, memberships: [] });
      if (asked === 2) return new Promise<Response>(() => {});
      return Response.json(ana);
    });
    renderApp(`/w/${workspaceId}`);
    await wait(SLOW_LOADING_MS);
    expect(asked).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "BCDX" }),
    ).toBeTruthy();
    expect(screen.queryByText("You don't have access to this")).toBeNull();
  });

  test("a later load of the same entry counts its own 10 seconds: Retry after a failed load", async () => {
    // U1 fails after 2 seconds; asked again, it does not come.
    let asked = 0;
    stubApi(({ path }) => {
      if (path !== "/api/v1/me") return undefined;
      asked += 1;
      if (asked > 1) return new Promise<Response>(() => {});
      return new Promise<Response>((resolve) =>
        setTimeout(() => resolve(apiError(500, "INTERNAL")), 2000),
      );
    });
    renderApp(`/w/${workspaceId}`);
    await wait(2000);
    // Long after the first load began.
    await wait(SLOW_LOADING_MS);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await wait(PENDING_MS);
    expect(asked).toBe(2);
    expect(isSkeleton("Due soon")).toBe(true);
    expect(screen.queryByText("Taking longer than usual")).toBeNull();
    // Its 10 seconds count from Retry, though its skeleton showed at once.
    await wait(SLOW_LOADING_MS - PENDING_MS - 500);
    expect(screen.queryByText("Taking longer than usual")).toBeNull();
    await wait(500);
    expect(
      screen.getByRole("heading", { name: "Taking longer than usual" }),
    ).toBeTruthy();
  });

  test.each([
    [`/w/${workspaceId}`, "Due soon"],
    ["/welcome", "Invitation"],
  ])(
    "%s: a load that failed before any skeleton showed: Retry counts its 10 seconds from the press",
    async (url, skeletonText) => {
      // U1 fails at once, within the pending time; asked again, it does not come.
      let asked = 0;
      stubApi(({ path }) => {
        if (path !== "/api/v1/me") return undefined;
        asked += 1;
        return asked > 1
          ? new Promise<Response>(() => {})
          : apiError(500, "INTERNAL");
      });
      renderApp(url);
      fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
      await wait(0);
      expect(asked).toBe(2);
      // Its skeleton shows at once, the route's pending time not waited again.
      expect(isSkeleton(skeletonText)).toBe(true);
      await wait(SLOW_LOADING_MS - 500);
      expect(screen.queryByText("Taking longer than usual")).toBeNull();
      await wait(500);
      expect(
        screen.getByRole("heading", { name: "Taking longer than usual" }),
      ).toBeTruthy();
    },
  );

  test("a screen without the frame: Retry asks again and shows its skeleton for 10 seconds more", async () => {
    let asked = 0;
    stubApi(({ path }) => {
      if (path !== "/api/v1/me") return undefined;
      asked += 1;
      return new Promise<Response>(() => {});
    });
    renderApp("/welcome");
    await wait(SLOW_LOADING_MS);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await wait(0);
    expect(asked).toBe(2);
    expect(isSkeleton("Invitation")).toBe(true);
    await wait(SLOW_LOADING_MS - PENDING_MS);
    expect(screen.queryByText("Taking longer than usual")).toBeNull();
    await wait(PENDING_MS);
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

/**
 * A URL each route answers to, its parameters filled in: the workspace the user is in,
 * one id for every other record, the first section or item.
 */
const urlOf = (fullPath: string) =>
  fullPath
    .replace(/\{-\$[A-Za-z]+\}/g, "")
    .replace("$workspaceId", workspaceId)
    .replace(/\$(sectionKey)/, "why")
    .replace(/\$(itemNo)/, "1")
    .replace(/\$[A-Za-z]+/g, "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f")
    .replace(/\/+$/, "");

describe("every route's own skeleton (design-spec 6.0.6, SDD 7.3)", () => {
  // Each route names its screen's skeleton apart from the screen (PendingScreen.tsx).
  const routes = Object.values(createAppRouter().routesById).filter(
    (route) => route.options.staticData?.skeleton !== undefined,
  );

  test("all the screens with a skeleton name one", () => {
    expect(routes.length).toBeGreaterThanOrEqual(26);
  });

  test.each(routes.map((route) => [route.fullPath]))(
    "%s: its title in the skeleton while the route loads",
    async (fullPath) => {
      heldMe();
      renderApp(urlOf(fullPath));
      await wait(PENDING_MS);
      expect(document.querySelector("[inert] h1")?.textContent).toBeTruthy();
      cleanup();
    },
  );
});
