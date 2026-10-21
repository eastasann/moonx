import type {
  IdeaDecisionFilter,
  IdeaSort,
  SourceType,
  Stage,
  SupportsCheck,
} from "@moonx/schemas";
import {
  type QueryClient,
  type QueryKey,
  queryOptions,
} from "@tanstack/react-query";
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

/** V2: a validation section's questions, one answer per question (SDD 5.7). */
export const validationQuestionsQuery = (
  ideaId: string,
  validationId: string,
  sectionKey: string,
) =>
  queryOptions({
    queryKey: [...ideaKey(ideaId), "questions", sectionKey],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.validations({ validationId: inPath(validationId) })
          .questions({ sectionKey: inPath(sectionKey) })
          .get(),
      ),
  });

/** V6 GET's filters, as 14's URL holds them (SDD 4章・5.7). */
export interface ResearchFilters {
  supports?: SupportsCheck;
  sourceType?: SourceType;
}

/** The most V6 gives at once (SDD 5.1「一覧」). */
const RESEARCH_PAGE = 200;

/** What is cached of an idea's research log: its lists and its entries. */
export const researchLogKey = (ideaId: string) => [
  ...ideaKey(ideaId),
  "research-log",
];

/**
 * V6 GET: the research log under `filters`, every page of it (an idea holds tens of
 * entries; 14 and M2 list them in one list), newest observation first.
 */
export const researchLogQuery = (
  ideaId: string,
  validationId: string,
  filters: ResearchFilters,
) =>
  queryOptions({
    queryKey: [...researchLogKey(ideaId), "list", filters],
    queryFn: async () => {
      const query = {
        ...(filters.supports === undefined
          ? {}
          : { supports: filters.supports }),
        ...(filters.sourceType === undefined
          ? {}
          : { sourceType: filters.sourceType }),
        limit: RESEARCH_PAGE,
      };
      const log = api().api.v1.validations({
        validationId: inPath(validationId),
      })["research-log"];
      const first = await unwrap(log.get({ query }));
      const items = [...first.items];
      let cursor = first.nextCursor;
      while (cursor !== null) {
        const page = await unwrap(
          log.get({ query: { ...query, cursor: Number(cursor) } }),
        );
        items.push(...page.items);
        cursor = page.nextCursor;
      }
      return items;
    },
  });

/** V7 GET: one research log entry and the items that cite it (SDD 5.7). */
export const researchLogEntryQuery = (ideaId: string, entryId: string) =>
  queryOptions({
    queryKey: [...researchLogKey(ideaId), "entry", entryId],
    queryFn: () =>
      unwrap(
        api()
          .api.v1["research-log"]({ entryId: inPath(entryId) })
          .get(),
      ),
  });

/** V8 GET: 15's competitors in their order, the pattern questions and the aim (SDD 5.7). */
export const competitorsQuery = (ideaId: string, validationId: string) =>
  queryOptions({
    queryKey: [...ideaKey(ideaId), "competitors"],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.validations({ validationId: inPath(validationId) })
          .competitors.get(),
      ),
  });

/** V10 GET: 16's assumptions in their order (SDD 5.7). */
export const assumptionsQuery = (ideaId: string, validationId: string) =>
  queryOptions({
    queryKey: [...ideaKey(ideaId), "assumptions"],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.validations({ validationId: inPath(validationId) })
          .assumptions.get(),
      ),
  });

/** V10 GET: 16's risks in the order the API sets them (SDD 5.7). */
export const risksQuery = (ideaId: string, validationId: string) =>
  queryOptions({
    queryKey: [...ideaKey(ideaId), "risks"],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.validations({ validationId: inPath(validationId) })
          .risks.get(),
      ),
  });

/** V12 GET: 17's cost rows by table, with the results and 18's numbers (SDD 5.7). */
export const costsQuery = (ideaId: string, validationId: string) =>
  queryOptions({
    queryKey: [...ideaKey(ideaId), "costs"],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.validations({ validationId: inPath(validationId) })
          .costs.get(),
      ),
  });

/** V15 GET: 18's seven numbers, V.08.WORTH, the results and the cost rows (SDD 5.7). */
export const economicsQuery = (ideaId: string, validationId: string) =>
  queryOptions({
    queryKey: [...ideaKey(ideaId), "economics"],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.validations({ validationId: inPath(validationId) })
          .economics.get(),
      ),
  });

/** V18: what 19 shows to decide on (SDD 5.7). */
export const decisionContextQuery = (ideaId: string) =>
  queryOptions({
    queryKey: [...ideaKey(ideaId), "decision-context"],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.ideas({ ideaId: inPath(ideaId) })
          ["decision-context"].get(),
      ),
  });

/**
 * Puts what a save answered in a query's data (ADR-011). A read of it already on its way
 * holds an older version and must not land over this one, so it is dropped; a read that
 * was asked for (a list's order to be read again, someone else's version to load) is then
 * asked for again, and reads the save too.
 */
export function putSaved<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: (data: TData | undefined) => TData | undefined,
) {
  const wasReading =
    queryClient.getQueryState(queryKey)?.fetchStatus === "fetching";
  void queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.setQueryData<TData>(queryKey, updater);
  if (wasReading) {
    void queryClient.invalidateQueries({ queryKey, exact: true });
  }
}
