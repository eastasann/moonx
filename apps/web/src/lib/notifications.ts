import { queryOptions } from "@tanstack/react-query";
import { api, call } from "./api";

/**
 * N2. Read when a screen opens, when the window comes back to the front, and every 60 seconds
 * while the page is visible (SDD 5.11). A hidden tab does not poll.
 */
export const unreadCountQuery = queryOptions({
  queryKey: ["notifications", "unread-count"],
  queryFn: () => call(api().api.v1.notifications["unread-count"].get()),
  staleTime: 0,
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
});
