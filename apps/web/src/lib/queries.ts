import { queryOptions } from "@tanstack/react-query";
import { ApiError, api, inPath, unwrap } from "./api";

/** U1: the signed-in user, their memberships and last workspace (SDD 5.4). */
export const meQuery = () =>
  queryOptions({
    queryKey: ["me"],
    queryFn: () => unwrap(api().api.v1.me.get()),
  });

/**
 * U1 asked from a page that needs no session (1, 2, a path that is no screen): null when
 * no one is signed in. The 401 is an answer here, not a lost session, so it never leaves
 * for the sign-in screen.
 */
export const signedInQuery = () =>
  queryOptions({
    queryKey: ["me", "if-signed-in"],
    queryFn: () =>
      unwrap(api().api.v1.me.get()).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }),
    retry: false,
  });

/**
 * Whether `token` can be an invitation's: base64url (SDD 5.5), as the seed's are too. Any
 * other value names no invitation, and as a path segment (`..`) could name another route.
 */
export const isInvitationToken = (token: string) => /^[\w-]+$/.test(token);

/** U4: an invitation as its link shows it, whoever opens it (SDD 5.4). */
export const invitationQuery = (token: string) =>
  queryOptions({
    queryKey: ["invitations", token],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.invitations["by-token"]({ token: inPath(token) })
          .get(),
      ),
  });

const workspaceKey = (workspaceId: string) => ["workspaces", workspaceId];

/** D1: the ideas of 5 Dashboard, and how many Drop ideas it leaves out (SDD 5.6). */
export const dashboardIdeasQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: [...workspaceKey(workspaceId), "dashboard", "ideas"],
    queryFn: () =>
      unwrap(api().api.v1.workspaces({ workspaceId }).dashboard.ideas.get()),
  });

/** D2: the Owners' and Members' self analyses as this workspace sees them. */
export const dashboardSelfAnalysesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: [...workspaceKey(workspaceId), "dashboard", "self-analyses"],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.workspaces({ workspaceId })
          .dashboard["self-analyses"].get(),
      ),
  });

/** D3: what is overdue or due within the week, the user's own first. */
export const dashboardDueSoonQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: [...workspaceKey(workspaceId), "dashboard", "due-soon"],
    queryFn: () =>
      unwrap(
        api().api.v1.workspaces({ workspaceId }).dashboard["due-soon"].get(),
      ),
  });

/** D4: the latest moves in the workspace. */
export const dashboardActivityQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: [...workspaceKey(workspaceId), "dashboard", "activity"],
    queryFn: () =>
      unwrap(api().api.v1.workspaces({ workspaceId }).dashboard.activity.get()),
  });
