import type { Role } from "@moonx/schemas";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { api, call } from "./api";

/** Every query of screen 28 lives under this prefix, so one invalidation refreshes the three lists. */
export const ADMIN_KEY = ["admin"] as const;

export const ADMIN_TABS = ["users", "workspaces", "invitations"] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

export const ADMIN_SEARCH_DEFAULTS = { tab: "users" } as const;

/** Screen 28's search parameters (SDD 4). An unknown tab falls back to Users instead of failing the page. */
export const adminSearchSchema = z.object({
  tab: z.enum(ADMIN_TABS).catch(ADMIN_SEARCH_DEFAULTS.tab),
});

/** Rows per request; "Load more" asks for the next page of this size. */
const PAGE_SIZE = 50;

const fetchUsers = (q: string | undefined, cursor: string | undefined) =>
  call(api().api.v1.admin.users.get({ query: { q, cursor, limit: PAGE_SIZE } }));
const fetchWorkspaces = (q: string | undefined, cursor: string | undefined) =>
  call(api().api.v1.admin.workspaces.get({ query: { q, cursor, limit: PAGE_SIZE } }));
const fetchInvitations = (cursor: string | undefined) =>
  call(api().api.v1.admin.invitations.get({ query: { cursor, limit: PAGE_SIZE } }));

/** AD7 users, as the list returns them. */
export type AdminUserRow = Awaited<ReturnType<typeof fetchUsers>>["items"][number];
export type AdminWorkspaceRow = Awaited<ReturnType<typeof fetchWorkspaces>>["items"][number];
export type AdminInvitationRow = Awaited<ReturnType<typeof fetchInvitations>>["items"][number];

/** AD7 users. `enabled` is false while another tab is showing. */
export function useAdminUsers(q: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...ADMIN_KEY, "users", q ?? ""],
    queryFn: ({ pageParam }) => fetchUsers(q, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}

/** AD7 workspaces. */
export function useAdminWorkspaces(q: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...ADMIN_KEY, "workspaces", q ?? ""],
    queryFn: ({ pageParam }) => fetchWorkspaces(q, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}

/** AD7 invitations, newest first. */
export function useAdminInvitations(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...ADMIN_KEY, "invitations"],
    queryFn: ({ pageParam }) => fetchInvitations(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}

/**
 * Every workspace, for the invitation dialog's picker. The picker filters in the browser (the
 * phone's tray has no hook for a server-side search), so the pages are read to the end.
 */
export function useAllAdminWorkspaces(enabled: boolean) {
  const query = useInfiniteQuery({
    queryKey: [...ADMIN_KEY, "workspaces-all"],
    queryFn: ({ pageParam }) => fetchWorkspaces(undefined, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
  return query;
}

/** AD8 and the invitation actions W5 and W7 (an operator may use both on any workspace's invitation). */
export function useAdminActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
  return {
    suspend: useMutation({
      mutationFn: (userId: string) => call(api().api.v1.admin.users({ userId }).suspend.post()),
      onSuccess: refresh,
    }),
    reactivate: useMutation({
      mutationFn: (userId: string) => call(api().api.v1.admin.users({ userId }).reactivate.post()),
      onSuccess: refresh,
    }),
    resend: useMutation({
      mutationFn: (invitationId: string) =>
        call(api().api.v1.invitations({ invitationId }).resend.post()),
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: (invitationId: string) =>
        call(api().api.v1.invitations({ invitationId }).delete()),
      onSuccess: refresh,
    }),
    invite: useMutation({
      mutationFn: (body: { email: string; workspaceId?: string; role?: Role }) =>
        call(api().api.v1.admin.invitations.post(body)),
      onSuccess: refresh,
    }),
  };
}

/** A pending invitation and an expired one can be sent again or cancelled; the others are over. */
export const isOpenInvitation = (status: AdminInvitationRow["status"]) =>
  status === "pending" || status === "expired";
