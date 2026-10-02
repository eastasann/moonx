import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
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

/** Every notification query lives under this prefix, the unread count included. */
export const NOTIFICATIONS_KEY = ["notifications"] as const;

const FILTERS = ["all", "unread"] as const;
export type NotificationFilter = (typeof FILTERS)[number];

/** Screen 8's search parameters (SDD 4). A value that does not parse falls back to All. */
export const notificationsSearchSchema = z.object({
  filter: z.enum(FILTERS).catch("all"),
});

/** Notifications per request; "Load more" asks for the next page of this size. */
const PAGE_SIZE = 30;

const fetchPage = (filter: NotificationFilter, cursor: string | undefined) =>
  call(api().api.v1.notifications.get({ query: { filter, cursor, limit: PAGE_SIZE } }));

/** SDD 5.11 Notification, as N1 returns it. */
export type NotificationItem = Awaited<ReturnType<typeof fetchPage>>["items"][number];

/** N1: the notifications of every workspace of the person, newest first. */
export const notificationsQuery = (filter: NotificationFilter) =>
  infiniteQueryOptions({
    queryKey: [...NOTIFICATIONS_KEY, "list", filter],
    queryFn: ({ pageParam }) => fetchPage(filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 0,
  });

/** N3: one notification read, or all of them. The list and the badge are read again after either. */
export function useNotificationActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
  return {
    markRead: useMutation({
      mutationFn: (id: string) => call(api().api.v1.notifications({ id }).read.post()),
      onSuccess: refresh,
    }),
    markAllRead: useMutation({
      mutationFn: () => call(api().api.v1.notifications["read-all"].post()),
      onSuccess: refresh,
    }),
  };
}
