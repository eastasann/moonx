import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";

/** U1: the signed-in user, their memberships and last workspace (SDD 5.4). */
export const meQuery = () =>
  queryOptions({
    queryKey: ["me"],
    queryFn: () => unwrap(api().api.v1.me.get()),
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
