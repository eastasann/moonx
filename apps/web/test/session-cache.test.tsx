import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { ApiError } from "../src/lib/api-error";
import { createQueryClient } from "../src/lib/query-client";
import { makeMe, renderApp, stubApi, unauthenticated } from "./support";

const UNREAD = ["notifications", "unread-count"] as const;

test("a 401 from any query empties every cached query", async () => {
  const redirects: string[] = [];
  const client = createQueryClient(() => redirects.push("login"));
  client.setQueryData(UNREAD, { total: 3 });
  client.setQueryData(["me"], makeMe());
  client.setQueryData(["ideas", "w1"], { items: [] });
  await client
    .fetchQuery({
      queryKey: ["dashboard"],
      queryFn: () => Promise.reject(new ApiError("UNAUTHENTICATED", 401, "gone")),
      retry: false,
    })
    .catch(() => {});
  await waitFor(() => expect(redirects).toEqual(["login"]));
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});

test("a 401 from a mutation empties the cache too", async () => {
  const client = createQueryClient(() => {});
  client.setQueryData(UNREAD, { total: 3 });
  await client
    .getMutationCache()
    .build(client, {
      mutationFn: () => Promise.reject(new ApiError("UNAUTHENTICATED", 401, "gone")),
    })
    .execute(undefined)
    .catch(() => {});
  expect(client.getQueryData(UNREAD)).toBeUndefined();
});

test("signing in drops what the last person's session left in the cache", async () => {
  let session = false;
  stubApi({
    "GET /api/v1/me": () => (session ? { body: makeMe() } : unauthenticated()),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    "POST /api/auth/sign-in/email": () => {
      session = true;
      return { body: { redirect: false, token: "t", user: { id: "u" } } };
    },
  });
  const { router } = await renderApp("/login?next=%2Faccount");
  const client = router.options.context.queryClient;
  client.setQueryData(UNREAD, { total: 42 });
  client.setQueryData(["ideas", "someone-else"], { items: ["private"] });
  await userEvent.type(await screen.findByLabelText(/^Email/), "ana@example.com");
  await userEvent.type(screen.getByLabelText(/^Password/), "moonx-demo-2026");
  await userEvent.click(screen.getByRole("button", { name: "Log in" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/account"));
  expect(client.getQueryData(["ideas", "someone-else"])).toBeUndefined();
  expect(client.getQueryData(UNREAD)).not.toEqual({ total: 42 });
});
