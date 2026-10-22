import type { AiScope } from "@moonx/domain";
import type {
  AdminUserStatus,
  CommentTargetType,
  DecisionLogKind,
  IdeaDecisionFilter,
  IdeaSort,
  SourceType,
  Stage,
  SupportsCheck,
  TemplateKind,
} from "@moonx/schemas";
import {
  type QueryClient,
  type QueryKey,
  queryOptions,
  skipToken,
} from "@tanstack/react-query";
import { scopeParam } from "./ai";
import { ApiError, api, inPath, unwrap } from "./api";
import { formatPanelTarget, type PanelTarget } from "./panel-target";

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

/**
 * What is cached of the user's own self-analysis (S1, S2): it is theirs in every
 * workspace (SDD 4章), so its keys name none.
 */
export const selfAnalysisKey = ["self-analysis"];

/**
 * S1 GET: 10's self-analysis, made on the template's latest version the first time it
 * is read (SDD 5.8). 10 and 11 read it before anything else of it.
 */
export const selfAnalysisHomeQuery = () =>
  queryOptions({
    queryKey: [...selfAnalysisKey, "home"],
    queryFn: () => unwrap(api().api.v1.me["self-analysis"].get()),
  });

/** S2: a section of the self-analysis, one answer per question (SDD 5.8). */
export const selfAnalysisSectionQuery = (sectionKey: string) =>
  queryOptions({
    queryKey: [...selfAnalysisKey, "sections", sectionKey],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.me["self-analysis"].sections({
            sectionKey: inPath(sectionKey),
          })
          .get(),
      ),
  });

/** What is cached of the self-analyses shared with a workspace (S6, S7). */
export const memberSelfAnalysesKey = (workspaceId: string) => [
  ...workspaceKey(workspaceId),
  "self-analyses",
];

/** S6: 12's Owners and Members, and whose self-analysis is shared here. */
export const memberSelfAnalysesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: [...memberSelfAnalysesKey(workspaceId), "list"],
    queryFn: () =>
      unwrap(api().api.v1.workspaces({ workspaceId })["self-analyses"].get()),
  });

/** S7: one member's self-analysis as shared with the workspace, read only. */
export const memberSelfAnalysisQuery = (workspaceId: string, userId: string) =>
  queryOptions({
    queryKey: [...memberSelfAnalysesKey(workspaceId), "member", userId],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.workspaces({ workspaceId })
          ["self-analyses"]({ userId: inPath(userId) })
          .get(),
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

/**
 * W4 GET: the workspace's invitations, newest first; `pending` those still open, `all`
 * the accepted, expired and cancelled too (design-spec 6.16 9).
 */
export const invitationsQuery = (
  workspaceId: string,
  status: "pending" | "all",
) =>
  queryOptions({
    queryKey: [...workspaceKey(workspaceId), "invitations", status],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.workspaces({ workspaceId })
          .invitations.get({ query: { status } }),
      ),
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

/** What is cached of one plan, under its idea's: the plan is read again with the idea. */
export const planKey = (ideaId: string, planId: string) => [
  ...ideaKey(ideaId),
  "plans",
  planId,
];

/** P2 GET: 20 Plan home, or a saved version of it read only (SDD 5.9). */
export const planHomeQuery = (
  ideaId: string,
  planId: string,
  versionId?: string,
) =>
  queryOptions({
    queryKey: [...planKey(ideaId, planId), "home", versionId ?? null],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.plans({ planId: inPath(planId) })
          .get({ query: versionId === undefined ? {} : { versionId } }),
      ),
  });

/**
 * P4: one plan item (21) as the plan has it now, or as a saved version keeps it. The
 * history panels read the items whose table answers they list, for the names and kinds
 * of their columns.
 */
export const planItemQuery = (
  ideaId: string,
  planId: string,
  itemNo: number,
  versionId?: string,
) =>
  queryOptions({
    queryKey: [...planKey(ideaId, planId), "items", itemNo, versionId ?? null],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.plans({ planId: inPath(planId) })
          .items({ itemNo: String(itemNo) })
          .get({ query: versionId === undefined ? {} : { versionId } }),
      ),
  });

/** P9 GET: the plan's execution items, by type in 22's order (SDD 5.9). */
export const executionItemsQuery = (ideaId: string, planId: string) =>
  queryOptions({
    queryKey: [...planKey(ideaId, planId), "execution"],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.plans({ planId: inPath(planId) })
          ["execution-items"].get({ query: {} }),
      ),
  });

/** P7: what M4 records a Go / No-Go on (SDD 5.9). */
export const goNoGoContextQuery = (ideaId: string, planId: string) =>
  queryOptions({
    queryKey: [...planKey(ideaId, planId), "go-no-go"],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.plans({ planId: inPath(planId) })
          ["go-no-go-context"].get(),
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

/** What is cached of where an AI export or import goes: a self-analysis has no id. */
export const aiKey = (kind: TemplateKind, id: string | undefined) => [
  "ai",
  kind,
  id ?? "self",
];

/** X2: an import's target, its sections, and its questions with their answers now (SDD 5.10). */
export const importContextQuery = (
  kind: TemplateKind,
  id: string | undefined,
) =>
  queryOptions({
    queryKey: [...aiKey(kind, id), "context"],
    queryFn: () =>
      unwrap(
        api().api.v1.ai.import.context.get({
          query: { target: kind, ...(id === undefined ? {} : { id }) },
        }),
      ),
  });

/** What 24 exports (SDD 5.10 X1): the scope and the three options. */
export interface AiExportOptions {
  scope: AiScope;
  includeEmpty: boolean;
  includeExamples: boolean;
  includeReference: boolean;
}

/**
 * X1: an export. Each one counts against the user's AI round trips (SDD 7.2), so what was
 * exported is kept for the visit and not read again behind the screen.
 */
export const aiExportQuery = (
  kind: TemplateKind,
  id: string | undefined,
  options: AiExportOptions,
) => {
  const { scope } = options;
  return queryOptions({
    queryKey: [
      ...aiKey(kind, id),
      "export",
      scopeParam(scope),
      options.includeEmpty,
      options.includeExamples,
      options.includeReference,
    ],
    queryFn: () =>
      unwrap(
        api().api.v1.ai.export.get({
          query: {
            source: kind,
            ...(id === undefined ? {} : { id }),
            ...(scope.kind === "sections" ? { sections: [...scope.keys] } : {}),
            ...(scope.kind === "items" ? { items: [...scope.itemNos] } : {}),
            ...(scope.kind === "part" ? { part: scope.part } : {}),
            includeEmpty: options.includeEmpty,
            includeExamples: options.includeExamples,
            includeReference: options.includeReference,
          },
        }),
      ),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

/** What is cached of the operator's screens (26–28). */
export const adminKey = ["admin"];

/** AD1: the three templates and their versions (26). */
export const adminTemplatesQuery = () =>
  queryOptions({
    queryKey: [...adminKey, "templates"],
    queryFn: () => unwrap(api().api.v1.admin.templates.get()),
  });

/** What is cached of one template version: its detail and its check. */
export const templateVersionKey = (versionId: string) => [
  ...adminKey,
  "template-versions",
  versionId,
];

/** AD3 GET: a version as 27 shows it. */
export const templateVersionQuery = (versionId: string) =>
  queryOptions({
    queryKey: templateVersionKey(versionId),
    queryFn: () =>
      unwrap(
        api()
          .api.v1.admin["template-versions"]({ versionId: inPath(versionId) })
          .get(),
      ),
  });

/**
 * AD6 validate: what blocks publishing the version and what only warns (27). It writes
 * nothing, so it is read as the version is, and again once the version changes.
 */
export const templateCheckQuery = (versionId: string) =>
  queryOptions({
    queryKey: [...templateVersionKey(versionId), "check"],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.admin["template-versions"]({ versionId: inPath(versionId) })
          .validate.post(),
      ),
  });

/** The most AD7 gives at once (SDD 5.1「一覧」). */
const ADMIN_PAGE = 200;

/**
 * Every page of an AD7 list, one after another: 28 shows each list whole, as 6 does its
 * ideas, and its search narrows it.
 */
async function everyPage<T>(
  read: (cursor: number | undefined) => Promise<{
    items: T[];
    nextCursor: string | null;
  }>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: number | undefined;
  for (;;) {
    const page = await read(cursor);
    items.push(...page.items);
    if (page.nextCursor === null) return items;
    cursor = Number(page.nextCursor);
  }
}

/** 28's Users filters (AD7 users). */
export interface AdminUserFilters {
  q?: string;
  status?: AdminUserStatus;
}

/** AD7 users: the users of the whole service, deleted ones last (28). */
export const adminUsersQuery = (filters: AdminUserFilters) =>
  queryOptions({
    queryKey: [...adminKey, "users", filters],
    queryFn: () =>
      everyPage((cursor) =>
        unwrap(
          api().api.v1.admin.users.get({
            query: { ...filters, cursor, limit: ADMIN_PAGE },
          }),
        ),
      ),
  });

/** AD7 workspaces: every workspace, by name (28, and the invitation's workspace). */
export const adminWorkspacesQuery = (q?: string) =>
  queryOptions({
    queryKey: [...adminKey, "workspaces", q ?? ""],
    queryFn: () =>
      everyPage((cursor) =>
        unwrap(
          api().api.v1.admin.workspaces.get({
            query: {
              ...(q === undefined ? {} : { q }),
              cursor,
              limit: ADMIN_PAGE,
            },
          }),
        ),
      ),
  });

/**
 * AD7 invitations: those of every workspace and of none, newest first; `pending` the
 * ones still open, `all` the accepted, expired and cancelled too (28).
 */
export const adminInvitationsQuery = (status: "pending" | "all") =>
  queryOptions({
    queryKey: [...adminKey, "invitations", status],
    queryFn: () =>
      everyPage((cursor) =>
        unwrap(
          api().api.v1.admin.invitations.get({
            query: { status, cursor, limit: ADMIN_PAGE },
          }),
        ),
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

/** What is cached of comments (C1): every list of threads, an item's or a screen's. */
export const commentsKey = ["comments"];

/**
 * C1 GET: the threads of an item, or of a screen with the comments on its idea (design-spec
 * 6.0.1・6.0.4), as `workspaceId`, the workspace being viewed, sees them. Without a
 * target (a screen with nothing to comment on) it asks nothing.
 */
export const commentsQuery = (
  workspaceId: string,
  target: PanelTarget | undefined,
) =>
  queryOptions({
    queryKey: [
      ...commentsKey,
      workspaceId,
      target === undefined ? null : formatPanelTarget(target),
    ],
    queryFn:
      target === undefined
        ? skipToken
        : () =>
            unwrap(
              api().api.v1.comments.get({
                query:
                  target.kind === "item"
                    ? {
                        workspaceId,
                        targetType: target.item.type as CommentTargetType,
                        targetId: target.item.id,
                        ...(target.item.key == null
                          ? {}
                          : { targetKey: target.item.key }),
                      }
                    : {
                        workspaceId,
                        containerType: target.screen.containerType,
                        containerId: target.screen.containerId,
                        ...(target.screen.sectionKeys.length === 0
                          ? {}
                          : { sectionKeys: [...target.screen.sectionKeys] }),
                      },
              }),
            ),
  });

/** W8: who a comment on `target` can mention (design-spec 6.0.4), by display name. */
export const mentionCandidatesQuery = (
  workspaceId: string,
  target: { type: CommentTargetType; id: string; key?: string | null },
) =>
  queryOptions({
    queryKey: [
      ...workspaceKey(workspaceId),
      "mention-candidates",
      target.type,
      target.id,
      target.key ?? null,
    ],
    queryFn: () =>
      unwrap(
        api()
          .api.v1.workspaces({ workspaceId })
          ["mention-candidates"].get({
            query: {
              targetType: target.type,
              targetId: target.id,
              ...(target.key == null ? {} : { targetKey: target.key }),
            },
          }),
      ),
  });

/** What is cached of the user's notifications: the lists and the unread count. */
export const notificationsKey = ["notifications"];

/** How often the navigation asks for the unread count while the page shows (SDD 2章). */
const UNREAD_EVERY_MS = 60_000;

/**
 * N2: the unread count of the navigation's Notifications, asked when a screen opens, when
 * the page comes to the front and every 60 seconds while it shows (SDD 2章「通知の受け取り」).
 */
export const unreadCountQuery = () =>
  queryOptions({
    queryKey: [...notificationsKey, "unread-count"],
    queryFn: () => unwrap(api().api.v1.notifications["unread-count"].get()),
    refetchInterval: UNREAD_EVERY_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });

/** The most N1 gives at once (SDD 5.1「一覧」). */
const NOTIFICATIONS_PAGE = 50;

/** N1: the user's notifications across workspaces, newest first, a page at a time. */
export const notificationsPage = (
  filter: "all" | "unread",
  cursor: number | undefined,
) =>
  unwrap(
    api().api.v1.notifications.get({
      query: {
        filter,
        limit: NOTIFICATIONS_PAGE,
        ...(cursor === undefined ? {} : { cursor }),
      },
    }),
  );

/** L1's filters, as 7's URL holds them (SDD 4章). */
export interface DecisionLogFilters {
  kind?: DecisionLogKind;
  ideaId?: string;
  recordedBy?: string;
  from?: string;
  to?: string;
}

/** The most L1 gives at once (SDD 5.1「一覧」). */
const DECISIONS_PAGE = 200;

/**
 * L1: the workspace's decision log under `filters`, every page of it (a workspace records
 * tens of decisions; 7 lists them in one list), newest first.
 */
export const decisionLogQuery = (
  workspaceId: string,
  filters: DecisionLogFilters,
) =>
  queryOptions({
    queryKey: [...workspaceKey(workspaceId), "decision-log", filters],
    queryFn: () =>
      everyPage((cursor) =>
        unwrap(
          api()
            .api.v1.workspaces({ workspaceId })
            ["decision-log"].get({
              query: {
                ...filters,
                limit: DECISIONS_PAGE,
                ...(cursor === undefined ? {} : { cursor }),
              },
            }),
        ),
      ),
  });

/** L2: one entry of the decision log with what it kept at the time (SDD 5.11). */
export const decisionLogEntryQuery = (entryId: string) =>
  queryOptions({
    queryKey: ["decision-log", entryId],
    queryFn: () =>
      unwrap(
        api()
          .api.v1["decision-log"]({ entryId: inPath(entryId) })
          .get(),
      ),
  });

/** What is cached of change histories (H1): every item's and every screen's. */
export const historyKey = ["history"];

/** How many changes PNL-2 lists at once before "Show more", as 8 does notifications. */
const HISTORY_PAGE = 50;

/**
 * H1 GET: one page of the changes of an item, or of a screen (design-spec 6.0.5), newest
 * first, from `cursor` on.
 */
export const historyPage = (target: PanelTarget, cursor: number | undefined) =>
  unwrap(
    api().api.v1.history.get({
      query: {
        ...(target.kind === "item"
          ? {
              targetType: target.item.type,
              targetId: target.item.id,
              ...(target.item.key == null
                ? {}
                : { targetKey: target.item.key }),
            }
          : {
              containerType: target.screen.containerType,
              containerId: target.screen.containerId,
              ...(target.screen.sectionKeys.length === 0
                ? {}
                : { sectionKeys: [...target.screen.sectionKeys] }),
            }),
        limit: HISTORY_PAGE,
        ...(cursor === undefined ? {} : { cursor }),
      },
    }),
  );
