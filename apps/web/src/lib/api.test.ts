import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, api, apiErrorOf, unwrap } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiErrorOf (SDD 8.1)", () => {
  test("reads the code, the request id and the code's own fields", () => {
    const error = apiErrorOf(429, {
      error: {
        code: "RATE_LIMITED",
        message: "Too many",
        requestId: "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c",
        retryAfterSeconds: 42,
      },
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.requestId).toBe("8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c");
    expect(error.detail.retryAfterSeconds).toBe(42);
  });

  test("a bare 502, 503 or 504 from Cloud Run's front is UPSTREAM_UNAVAILABLE", () => {
    for (const status of [502, 503, 504]) {
      expect(apiErrorOf(status, "<html>Service Unavailable</html>").code).toBe(
        "UPSTREAM_UNAVAILABLE",
      );
    }
    expect(apiErrorOf(500, null).code).toBeNull();
    expect(apiErrorOf(400, { error: { code: "NOPE" } }).code).toBeNull();
  });
});

/** Answers every fetch with `response`, keeping the requests. */
function stubFetch(response: () => Response) {
  const requests: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return response();
    }),
  );
  return requests;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("the client (ADR-006)", () => {
  test("a body-less POST still says JSON, as the API requires (SDD 7.2 CSRF)", async () => {
    const requests = stubFetch(() => new Response(null, { status: 204 }));
    await unwrap(api().api.v1.notifications["read-all"].post());
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.headers.get("content-type")).toBe("application/json");
    expect(new URL(requests[0]?.url ?? "").origin).toBe(window.location.origin);
  });

  test("a file goes as multipart, its boundary written by the browser", async () => {
    const requests = stubFetch(() =>
      json(200, {
        avatarUrl: "/api/avatars/0123456789abcdef0123456789abcdef.webp",
      }),
    );
    await unwrap(
      api().api.v1.me.avatar.put({
        file: new File([new Uint8Array([1, 2, 3])], "me.png", {
          type: "image/png",
        }),
      }),
    );
    expect(requests[0]?.headers.get("content-type")).toMatch(
      /^multipart\/form-data; boundary=/,
    );
  });

  test("a JSON body is JSON", async () => {
    const requests = stubFetch(() =>
      json(201, {
        id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        name: "BCDX",
        currency: "PHP",
        isPersonal: false,
        myRole: "owner",
        memberCount: 1,
      }),
    );
    await unwrap(api().api.v1.workspaces.post({ name: "BCDX" }));
    expect(requests[0]?.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]?.json()).toEqual({ name: "BCDX" });
  });

  test("a GET carries no type", async () => {
    const requests = stubFetch(() => json(200, { count: 0 }));
    await unwrap(api().api.v1.notifications["unread-count"].get());
    expect(requests[0]?.headers.has("content-type")).toBe(false);
  });

  test("dates stay the strings the API sends", async () => {
    stubFetch(() =>
      json(200, {
        items: [
          {
            id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
            type: "milestone",
            title: "2026-10-14",
            dueDate: "2026-10-14",
            overdue: false,
            assignee: null,
            isMine: false,
            idea: { id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", name: "Piaya" },
            plan: {
              id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
              name: "Plan A",
            },
          },
        ],
      }),
    );
    const { items } = await unwrap(
      api().api.v1.workspaces({ workspaceId: "w" }).dashboard["due-soon"].get(),
    );
    expect(items[0]?.dueDate).toBe("2026-10-14");
    expect(items[0]?.title).toBe("2026-10-14");
  });

  test("an error response is an ApiError with its code", async () => {
    stubFetch(() =>
      json(403, {
        error: {
          code: "NO_ACCESS",
          message: "Not a member",
          requestId: "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c",
        },
      }),
    );
    const error = await unwrap(api().api.v1.me.get()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).code).toBe("NO_ACCESS");
  });

  test("no response at all is the network: no status, no code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const error = await unwrap(api().api.v1.me.get()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBeNull();
    expect((error as ApiError).code).toBeNull();
  });
});
