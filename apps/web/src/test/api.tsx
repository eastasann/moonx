import type { Me } from "@moonx/schemas";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { createAppRouter } from "../router";

const workspace = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  name: "BCDX",
  isPersonal: false,
  currency: "PHP",
};

/** A signed-in user of BCDX, as U1 answers (SDD 5.4). */
export const ana: Me = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  email: "ana@bcdx.example",
  displayName: "Ana Villanueva",
  avatarUrl: null,
  timezone: "Asia/Manila",
  theme: "system",
  isAdmin: false,
  hasPassword: true,
  lastWorkspaceId: workspace.id,
  memberships: [{ workspace, role: "owner" }],
};

const jsonOr = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/** One call the app made: its method, its path with its search, and its JSON body. */
export interface Call {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Stands in for the API: `answer` gets each call and returns the Response (a promise of
 * it holds the answer back while the test acts), or undefined for a 404. Returns the
 * calls made, in order.
 */
export function stubApi(
  answer: (call: Call) => Response | Promise<Response> | undefined,
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(
        input instanceof Request
          ? input
          : new URL(String(input), "http://localhost"),
        init,
      );
      const url = new URL(request.url);
      const text = await request.text();
      const call: Call = {
        method: request.method,
        path: `${url.pathname}${url.search}`,
        body: text === "" ? null : jsonOr(text),
      };
      calls.push(call);
      return (await answer(call)) ?? new Response(null, { status: 404 });
    }),
  );
  return calls;
}

/** Better Auth's error body (SDD 8.1) with the given status. */
export const authError = (
  status: number,
  code: string,
  headers: Record<string, string> = {},
) => Response.json({ code, message: code }, { status, headers });

/** The API's error body (SDD 8.1) with the given status. */
export const apiError = (
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
) =>
  Response.json(
    { error: { code, message: code, requestId: "8f14e45f-0000", ...extra } },
    { status },
  );

/** Renders the whole app at `path`, as the root route renders <html> into the document. */
export function renderApp(path: string) {
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />, { container: document });
  return router;
}
