import type { Me } from "@moonx/schemas";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { getRouter } from "../src/router";

export const WORKSPACE = "11111111-1111-4111-8111-111111111111";
export const PERSONAL = "22222222-2222-4222-8222-222222222222";
export const OTHER = "33333333-3333-4333-8333-333333333333";

export function makeMe(overrides: Partial<Me> = {}): Me {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    email: "ana@example.com",
    displayName: "Ana Villanueva",
    avatarUrl: null,
    timezone: "Asia/Manila",
    theme: "system",
    isAdmin: false,
    hasPassword: true,
    lastWorkspaceId: WORKSPACE,
    memberships: [
      {
        workspace: { id: WORKSPACE, name: "BCDX", isPersonal: false, currency: "PHP" },
        role: "owner",
      },
      {
        workspace: { id: PERSONAL, name: "Ana's workspace", isPersonal: true, currency: "PHP" },
        role: "owner",
      },
    ],
    ...overrides,
  };
}

export interface StubRequest {
  url: URL;
  method: string;
  body: unknown;
}

export type Handler = (request: StubRequest) => { status?: number; body?: unknown } | undefined;

/**
 * Replaces `fetch` with a table of `"METHOD /path"` handlers. A request nobody handles answers
 * 404 and is recorded in `unhandled`, so a test notices a call it did not expect.
 */
export function stubApi(handlers: Record<string, Handler>) {
  const calls: StubRequest[] = [];
  const unhandled: string[] = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
      "http://localhost",
    );
    const method = (init?.method ?? "GET").toUpperCase();
    const raw = typeof init?.body === "string" ? init.body : undefined;
    const request = { url, method, body: raw ? JSON.parse(raw) : undefined };
    calls.push(request);
    const key = `${method} ${url.pathname}`;
    const answer = handlers[key]?.(request);
    if (!answer) {
      unhandled.push(key);
      return Response.json(
        { error: { code: "NOT_FOUND", message: "no stub", requestId: "stub" } },
        { status: 404 },
      );
    }
    return Response.json(answer.body ?? null, { status: answer.status ?? 200 });
  });
  vi.stubGlobal("fetch", fetchStub);
  return { calls, unhandled, fetchStub };
}

export const unauthenticated = (): { status: number; body: unknown } => ({
  status: 401,
  body: { error: { code: "UNAUTHENTICATED", message: "no session", requestId: "abcdef12-0000" } },
});

/** Renders the whole app at `path`, with the API stubbed, and waits for the first load to settle. */
export async function renderApp(path: string) {
  const router = getRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  const view = render(<RouterProvider router={router} />);
  await router.load();
  await waitFor(() => expect(router.state.isLoading).toBe(false));
  return { router, ...view };
}
