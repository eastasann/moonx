import type { Invitation, Role } from "@moonx/schemas";
import { queryOptions } from "@tanstack/react-query";
import { api, call } from "./api";

/** Highest first: the order the role pickers and menus list them in. */
export const ROLES: readonly Role[] = ["owner", "member", "viewer"];

export type InvitationFilter = "pending" | "all";

export const membersKey = (workspaceId: string) => ["workspace", workspaceId, "members"] as const;

/** Prefix of every invitation list of the workspace, whatever its filter. */
export const invitationsKey = (workspaceId: string) =>
  ["workspace", workspaceId, "invitations"] as const;

/** W2. */
export const membersQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: membersKey(workspaceId),
    queryFn: async () => (await call(api().api.v1.workspaces({ workspaceId }).members.get())).items,
  });

/** W4 GET. `pending` leaves out what can no longer be accepted; `all` also lists the rest. */
export const invitationsQuery = (workspaceId: string, filter: InvitationFilter) =>
  queryOptions({
    queryKey: [...invitationsKey(workspaceId), filter] as const,
    queryFn: async () =>
      (
        await call(
          api()
            .api.v1.workspaces({ workspaceId })
            .invitations.get({ query: { status: filter } }),
        )
      ).items,
  });

/**
 * Whether the invitation can still be copied, resent or cancelled (W5-W7): pending and expired
 * ones. An accepted one is done and a cancelled one cannot be brought back.
 */
export const isOpenInvitation = (invitation: Invitation) =>
  invitation.status === "pending" || invitation.status === "expired";
