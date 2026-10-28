import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { useDropOtherUsersData } from "./session";

function Session({ userId }: { userId: string | null }) {
  useDropOtherUsersData(userId);
  return null;
}

test("another user's sign-in drops the cache but the new `me` (ADR-011)", () => {
  const queryClient = new QueryClient();
  const renderAs = (userId: string | null) => (
    <QueryClientProvider client={queryClient}>
      <Session userId={userId} />
    </QueryClientProvider>
  );
  const { rerender } = render(renderAs("ana"));
  queryClient.setQueryData(["me"], { id: "ana" });
  queryClient.setQueryData(["workspaces", "w1", "dashboard", "ideas"], {
    items: [],
  });
  queryClient.setQueryData(["me", "if-signed-in"], { id: "ana" });

  // The same user again, and a moment without a user, keep what is cached.
  rerender(renderAs("ana"));
  rerender(renderAs(null));
  rerender(renderAs("ana"));
  expect(
    queryClient.getQueryData(["workspaces", "w1", "dashboard", "ideas"]),
  ).toEqual({
    items: [],
  });

  queryClient.setQueryData(["me"], { id: "kenji" });
  rerender(renderAs(null));
  rerender(renderAs("kenji"));
  expect(
    queryClient.getQueryData(["workspaces", "w1", "dashboard", "ideas"]),
  ).toBeUndefined();
  expect(queryClient.getQueryData(["me", "if-signed-in"])).toBeUndefined();
  expect(queryClient.getQueryData(["me"])).toEqual({ id: "kenji" });
});
