import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { DECISION_LOG_KEY } from "../src/lib/decision";
import { usePlanRefresh } from "../src/lib/plans";

test("a change to a plan marks the decision log queries stale so screen 7 shows the new entry", async () => {
  const queryClient = new QueryClient();
  const key = [...DECISION_LOG_KEY, "idea-1"];
  queryClient.setQueryData(key, { items: [] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => usePlanRefresh(), { wrapper });
  await result.current("plan-1");
  expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
});
