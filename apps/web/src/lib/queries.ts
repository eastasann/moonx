import type { IdeaDecisionFilter, IdeaSort, Stage } from "@moonx/schemas";
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

/** What is cached of one workspace: its dashboard, ideas and members. */
export const workspaceKey = (workspaceId: string) => [
  "workspaces",
  workspaceId,
];

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

/** I1 GET's filters, as the ideas list's URL holds them (SDD 4章). */
export interface IdeaFilters {
  stage?: Stage;
  decision: IdeaDecisionFilter;
  proposerId?: string;
  includeArchived: boolean;
  sort: IdeaSort;
  q?: string;
}

/** The most I1 gives at once (SDD 5.1「一覧」). */
const IDEAS_PAGE = 200;

/**
 * I1 GET: the workspace's ideas under `filters`, every page of them (a workspace holds a
 * few dozen; 6 shows them in one list), and the Drop ideas the default filter hid.
 */
export const ideasQuery = (workspaceId: string, filters: IdeaFilters) =>
  queryOptions({
    queryKey: [...workspaceKey(workspaceId), "ideas", filters],
    queryFn: async () => {
      const query = {
        ...(filters.stage === undefined ? {} : { stage: filters.stage }),
        decision: filters.decision,
        ...(filters.proposerId === undefined
          ? {}
          : { proposerId: filters.proposerId }),
        includeArchived: filters.includeArchived,
        sort: filters.sort,
        ...(filters.q === undefined ? {} : { q: filters.q }),
        limit: IDEAS_PAGE,
      };
      const ideas = api().api.v1.workspaces({ workspaceId }).ideas;
      const first = await unwrap(ideas.get({ query }));
      const items = [...first.items];
      let cursor = first.nextCursor;
      while (cursor !== null) {
        const page = await unwrap(
          ideas.get({ query: { ...query, cursor: Number(cursor) } }),
        );
        items.push(...page.items);
        cursor = page.nextCursor;
      }
      return { items, hiddenDroppedCount: first.hiddenDroppedCount };
    },
  });

/** W2: the workspace's members, whose Owners and Members can propose ideas. */
export const membersQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: [...workspaceKey(workspaceId), "members"],
    queryFn: () =>
      unwrap(api().api.v1.workspaces({ workspaceId }).members.get()),
  });

/** What is cached of one idea: its validation home and plans (SDD 5.6・5.7・5.9). */
export const ideaKey = (ideaId: string) => ["ideas", ideaId];

/** V1: 13 Validation home, also the detail beside 6's list (SDD 5.7). */
export const validationHomeQuery = (ideaId: string) =>
  queryOptions({
    queryKey: [...ideaKey(ideaId), "validation"],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.ideas({ ideaId: inPath(ideaId) })
          .validation.get(),
      ),
  });

/** P1 GET with the archived plans, which 13 lists once "Show" is pressed (6.1). */
export const archivedPlansQuery = (ideaId: string) =>
  queryOptions({
    queryKey: [...ideaKey(ideaId), "plans", "with-archived"],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.ideas({ ideaId: inPath(ideaId) })
          .plans.get({ query: { includeArchived: true } }),
      ),
  });
