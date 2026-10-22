import { formatDate, formatOverdue, formatRelativeTime } from "@moonx/i18n";
import {
  type Activity,
  type DueItem,
  decisionValueSchema,
  goNoGoValueSchema,
  type IdeaSummary,
  type Me,
} from "@moonx/schemas";
import {
  Avatar,
  Badge,
  Breadcrumb,
  Breadcrumbs,
  CheckDots,
  Flex,
  Heading,
  type HubBlock,
  HubPattern,
  Link,
  MoonGlyph,
  RowList,
  RowListItem,
  Skeleton,
  TaskMark,
  Text,
} from "@moonx/ui-web";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BlockBoundary, ModalBoundary } from "../components/ErrorBoundary";
import { HubBlock as Block } from "../components/HubBlock";
import { NewIdeaDialog } from "../components/IdeaDialogs";
import {
  checkDots,
  DecisionBadge,
  dotState,
  missingChecks,
} from "../components/ideaParts";
import {
  FailureState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { UserName } from "../components/UserName";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, useModal, useWorkspace } from "../components/workspace";
import {
  hrefOf,
  ideaHref,
  ideasHref,
  selfAnalysisHref,
  settingsHref,
  teamHref,
} from "../lib/links";
import {
  dashboardActivityQuery,
  dashboardDueSoonQuery,
  dashboardIdeasQuery,
  dashboardSelfAnalysesQuery,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

/**
 * What a block shows of its query (6.9: each block loads on its own, and one failing
 * leaves the others): its skeleton while it loads, "Taking longer than usual" after 10
 * seconds, its failure's state, or its data.
 */
function QueryContent<T>({
  query,
  skeleton,
  dashboard,
  children,
}: {
  query: UseQueryResult<T>;
  skeleton: ReactNode;
  dashboard: string | undefined;
  children: (data: T) => ReactNode;
}) {
  const isSlow = useIsSlow(query.isPending);
  const retry = () => void query.refetch();
  if (query.data !== undefined) return children(query.data);
  if (query.isError) {
    return (
      <FailureState
        error={query.error}
        onRetry={retry}
        dashboardHref={dashboard}
        headingLevel={3}
        size="S"
      />
    );
  }
  if (isSlow) {
    return <SlowLoadingState headingLevel={3} size="S" onRetry={retry} />;
  }
  return <Skeleton isLoading>{skeleton}</Skeleton>;
}

/** Rows of placeholder words in the shape of a block's list. */
function RowsSkeleton({ line, detail }: { line: string; detail: string }) {
  return (
    <RowList>
      {[0, 1, 2].map((row) => (
        <RowListItem key={row} description={<Text>{detail}</Text>}>
          <Text>{line}</Text>
        </RowListItem>
      ))}
    </RowList>
  );
}

function IdeasBlock({
  me,
  workspaceId,
  onFirstIdea,
}: {
  me: Me;
  workspaceId: string;
  onFirstIdea: () => void;
}) {
  const { t } = useTranslation(["dashboard", "app"]);
  const query = useQuery(dashboardIdeasQuery(workspaceId));
  const data = query.data;
  if (
    data !== undefined &&
    data.items.length === 0 &&
    data.droppedCount === 0
  ) {
    return <GettingStarted onFirstIdea={onFirstIdea} />;
  }
  return (
    <Block
      title={t("dashboard:ideas.title")}
      aside={
        data !== undefined && data.items.length > 0
          ? t("dashboard:ideas.legend")
          : undefined
      }
      isBusy={query.isPending}
    >
      <QueryContent
        query={query}
        dashboard={dashboardHref(me)}
        skeleton={
          <RowsSkeleton
            line={t("dashboard:gettingStarted.firstIdea")}
            detail={t("dashboard:lead")}
          />
        }
      >
        {({ items, droppedCount }) => (
          <>
            {items.length > 0 && (
              <RowList aria-label={t("dashboard:ideas.title")}>
                {items.map((idea) => (
                  <IdeaRow
                    key={idea.id}
                    idea={idea}
                    workspaceId={workspaceId}
                    timeZone={me.timezone}
                  />
                ))}
              </RowList>
            )}
            {droppedCount > 0 && (
              <Text variant="body-sm" tone="secondary">
                {t("dashboard:ideas.dropped", { count: droppedCount })}
                {t("app:separator")}
                <Link href={ideasHref(workspaceId, { decision: "drop" })}>
                  {t("dashboard:ideas.show")}
                </Link>
              </Text>
            )}
          </>
        )}
      </QueryContent>
    </Block>
  );
}

/**
 * An idea (design-spec 6.9): its stage, when it last moved and what it misses under the
 * name; its checks and its latest decision at the end. It opens its 13.
 */
function IdeaRow({
  idea,
  workspaceId,
  timeZone,
}: {
  idea: IdeaSummary;
  workspaceId: string;
  timeZone: string;
}) {
  const { t } = useTranslation(["dashboard", "common", "app"]);
  const missing = missingChecks(idea.checks);
  const parts = [
    t("dashboard:ideas.updated", {
      stage: t(`common:stage.${idea.stage}`),
      when: formatRelativeTime(idea.lastActivityAt, { timeZone }),
    }),
    ...(missing === null ? [] : [missing]),
  ];
  return (
    <RowListItem
      href={ideaHref(workspaceId, idea.id)}
      description={parts.join(t("app:separator"))}
      marks={<CheckDots checks={checkDots(idea.checks)} size="S" />}
      badge={<DecisionBadge decision={idea.latestDecision} />}
    >
      {idea.name}
    </RowListItem>
  );
}

/**
 * In the Ideas block's place while the workspace has no idea, dropped ones included
 * (design-spec 6.9): the first steps for those who may take them, one line for a Viewer.
 * The self analysis opens 10, inviting 9 and the first idea M1.
 */
export function GettingStarted({
  onFirstIdea,
}: {
  /** Opens M1 (design-spec 6.9 ③). */
  onFirstIdea: () => void;
}) {
  const { t } = useTranslation(["dashboard"]);
  const { workspace, role } = useWorkspace();
  if (role === "viewer") {
    return (
      <Block title={t("dashboard:gettingStarted.title")}>
        <Text tone="secondary" elementType="p">
          {t("dashboard:gettingStarted.leadViewer")}
        </Text>
      </Block>
    );
  }
  return (
    <Block title={t("dashboard:gettingStarted.title")}>
      <Text tone="secondary" elementType="p">
        {t("dashboard:gettingStarted.lead")}
      </Text>
      <RowList ordered aria-label={t("dashboard:gettingStarted.title")}>
        <RowListItem href={selfAnalysisHref(workspace.id)}>
          {t("dashboard:gettingStarted.selfAnalysis")}
        </RowListItem>
        {role === "owner" && (
          <RowListItem href={settingsHref(workspace.id)}>
            {t("dashboard:gettingStarted.invite")}
          </RowListItem>
        )}
        <RowListItem onPress={onFirstIdea}>
          {t("dashboard:gettingStarted.firstIdea")}
        </RowListItem>
      </RowList>
    </Block>
  );
}

function DueSoonBlock({ me, workspaceId }: { me: Me; workspaceId: string }) {
  const { t } = useTranslation(["dashboard"]);
  const query = useQuery(dashboardDueSoonQuery(workspaceId));
  return (
    <Block
      title={t("dashboard:due.title")}
      aside={t("dashboard:due.window")}
      isBusy={query.isPending}
    >
      <QueryContent
        query={query}
        dashboard={dashboardHref(me)}
        skeleton={
          <RowsSkeleton
            line={t("dashboard:gettingStarted.firstIdea")}
            detail={t("dashboard:due.window")}
          />
        }
      >
        {({ items }) =>
          items.length === 0 ? (
            <Text tone="secondary" elementType="p">
              {t("dashboard:due.empty")}
            </Text>
          ) : (
            <RowList aria-label={t("dashboard:due.title")}>
              {items.map((item) => (
                <DueRow key={item.id} item={item} timeZone={me.timezone} />
              ))}
            </RowList>
          )
        }
      </QueryContent>
    </Block>
  );
}

/**
 * An item of a plan's execution with a deadline (design-spec 6.9): "Yours" when it is
 * the user's, its idea and assignee under it, and its date, or how long it is overdue,
 * in figures at the end. Opening 22 joins when 22 is built.
 */
function DueRow({ item, timeZone }: { item: DueItem; timeZone: string }) {
  const { t } = useTranslation(["dashboard", "app"]);
  const overdue = item.overdue
    ? formatOverdue(item.dueDate, { timeZone })
    : null;
  const assignee =
    item.assignee === null ? null : "user" in item.assignee ? (
      <UserName user={item.assignee.user} />
    ) : (
      item.assignee.name
    );
  return (
    <RowListItem
      start={<TaskMark />}
      description={
        <>
          {item.idea.name}
          {assignee !== null && (
            <>
              {t("app:separator")}
              {assignee}
            </>
          )}
        </>
      }
      end={
        overdue === null ? (
          formatDate(item.dueDate, { timeZone })
        ) : (
          <Badge variant="notice">{overdue}</Badge>
        )
      }
      isEndNumeric={overdue === null}
    >
      {item.title}
      {item.isMine && (
        <>
          {" "}
          <Badge>{t("dashboard:due.yours")}</Badge>
        </>
      )}
    </RowListItem>
  );
}

function SelfAnalysesBlock({
  me,
  workspaceId,
}: {
  me: Me;
  workspaceId: string;
}) {
  const { t } = useTranslation(["dashboard", "common"]);
  const query = useQuery(dashboardSelfAnalysesQuery(workspaceId));
  return (
    <Block title={t("dashboard:selfAnalyses.title")} isBusy={query.isPending}>
      <QueryContent
        query={query}
        dashboard={dashboardHref(me)}
        skeleton={
          <RowsSkeleton
            line={t("dashboard:selfAnalyses.notShared")}
            detail={t("dashboard:selfAnalyses.notShared")}
          />
        }
      >
        {({ items }) => (
          <RowList aria-label={t("dashboard:selfAnalyses.title")}>
            {items.map(({ user, shared, status }) => (
              <RowListItem
                key={user.id}
                href={shared ? teamHref(workspaceId, user.id) : undefined}
                start={<Avatar name={user.displayName} src={user.avatarUrl} />}
                end={
                  shared && status !== null ? (
                    <Flex gap="space-75" alignItems="center">
                      <MoonGlyph
                        state={
                          dotState[
                            status === "in_progress" ? "partial" : status
                          ]
                        }
                        size="S"
                      />
                      {t("dashboard:selfAnalyses.shared", {
                        status: t(`common:selfAnalysisStatus.${status}`),
                      })}
                    </Flex>
                  ) : (
                    t("dashboard:selfAnalyses.notShared")
                  )
                }
              >
                <UserName user={user} />
              </RowListItem>
            ))}
          </RowList>
        )}
      </QueryContent>
    </Block>
  );
}

function ActivityBlock({ me, workspaceId }: { me: Me; workspaceId: string }) {
  const { t } = useTranslation(["dashboard"]);
  const query = useQuery(dashboardActivityQuery(workspaceId));
  return (
    <Block title={t("dashboard:activity.title")} isBusy={query.isPending}>
      <QueryContent
        query={query}
        dashboard={dashboardHref(me)}
        skeleton={
          <RowsSkeleton
            line={t("dashboard:activity.title")}
            detail={t("dashboard:due.window")}
          />
        }
      >
        {({ items }) =>
          items.length === 0 ? (
            <Text tone="secondary" elementType="p">
              {t("dashboard:activity.empty")}
            </Text>
          ) : (
            <RowList aria-label={t("dashboard:activity.title")}>
              {items.map((activity) => (
                <ActivityRow
                  // The feed has no ids. D4 makes one move of what one person did at
                  // one moment, so who, when and what tell the moves apart.
                  key={`${activity.actor.id}:${activity.at}:${activity.kind}:${activity.summary}`}
                  activity={activity}
                  timeZone={me.timezone}
                />
              ))}
            </RowList>
          )
        }
      </QueryContent>
    </Block>
  );
}

/**
 * One move (design-spec 6.9, s05-dashboard.html .activity): who in semibold and what in
 * a sentence, then where and when. It opens its item where that screen is built.
 */
function ActivityRow({
  activity,
  timeZone,
}: {
  activity: Activity;
  timeZone: string;
}) {
  const { t } = useTranslation(["dashboard", "common", "app"]);
  const what = {
    change: () => t("dashboard:activity.change", { summary: activity.summary }),
    comment: () =>
      t("dashboard:activity.comment", { summary: activity.summary }),
    decision: () =>
      t("dashboard:activity.decision", {
        value: t(
          `common:decision.${decisionValueSchema.parse(activity.summary)}`,
        ),
      }),
    go_no_go: () =>
      t("dashboard:activity.go_no_go", {
        value: t(`common:goNoGo.${goNoGoValueSchema.parse(activity.summary)}`),
      }),
    version_saved: () =>
      t("dashboard:activity.version_saved", { name: activity.summary }),
  }[activity.kind]();
  const where = [
    activity.idea?.name,
    activity.plan?.name,
    formatRelativeTime(activity.at, { timeZone }),
  ].filter((part) => part !== undefined);
  return (
    <RowListItem
      href={hrefOf(activity.link)}
      start={
        <Avatar
          name={activity.actor.displayName}
          src={activity.actor.avatarUrl}
        />
      }
      description={where.join(t("app:separator"))}
    >
      <Text variant="body-compact">
        <strong>
          <UserName user={activity.actor} />
        </strong>{" "}
        {what}
      </Text>
    </RowListItem>
  );
}

/**
 * 5 Dashboard's shape while its route loads (design-spec 6.0.6): the title, and the four
 * blocks' headings over rows of bars. Drawn inside a `Skeleton`, its words are bars.
 */
export function DashboardSkeleton() {
  const { t } = useTranslation(["dashboard"]);
  const rows = (
    <RowsSkeleton
      line={t("dashboard:gettingStarted.firstIdea")}
      detail={t("dashboard:due.window")}
    />
  );
  const skeletonBlock = (
    id: string,
    column: HubBlock["column"],
    title: string,
  ): HubBlock => ({
    id,
    column,
    content: <Block title={title}>{rows}</Block>,
  });
  return (
    <HubPattern
      header={
        <>
          <Heading level={1} variant="heading-1-hub">
            {t("dashboard:ideas.title")}
          </Heading>
          <Text tone="secondary">{t("dashboard:lead")}</Text>
        </>
      }
      blocks={[
        skeletonBlock("ideas", "main", t("dashboard:ideas.title")),
        skeletonBlock("due", "aside", t("dashboard:due.title")),
        skeletonBlock("self", "main", t("dashboard:selfAnalyses.title")),
        skeletonBlock("activity", "aside", t("dashboard:activity.title")),
      ]}
    />
  );
}

/**
 * 5 Dashboard (design-spec 6.9, s05-dashboard.html): pattern A without numbers. Ideas
 * and Self analyses in the main column, Due soon and Recent activity beside them; on a
 * phone Ideas, Due soon, Self analyses, Recent activity. A Viewer has no Self analyses.
 */
export function DashboardScreen({ modal: openModal }: { modal?: string }) {
  const { t } = useTranslation(["dashboard", "app"]);
  const { me, workspace, role } = useWorkspace();
  const modal = useModal();
  useDocumentTitle(t("app:nav.dashboard"), workspace.name);
  const isViewer = role === "viewer";
  const blocks: HubBlock[] = [
    {
      id: "ideas",
      column: "main",
      content: (
        <BlockBoundary>
          <IdeasBlock
            me={me}
            workspaceId={workspace.id}
            onFirstIdea={() => modal.open("new-idea")}
          />
        </BlockBoundary>
      ),
    },
    {
      id: "due",
      column: "aside",
      content: (
        <BlockBoundary>
          <DueSoonBlock me={me} workspaceId={workspace.id} />
        </BlockBoundary>
      ),
    },
    ...(isViewer
      ? []
      : [
          {
            id: "self",
            column: "main",
            content: (
              <BlockBoundary>
                <SelfAnalysesBlock me={me} workspaceId={workspace.id} />
              </BlockBoundary>
            ),
          } satisfies HubBlock,
        ]),
    {
      id: "activity",
      column: "aside",
      content: (
        <BlockBoundary>
          <ActivityBlock me={me} workspaceId={workspace.id} />
        </BlockBoundary>
      ),
    },
  ];
  return (
    <WorkspaceFrame
      current="dashboard"
      title={{
        label: workspace.name,
        onPress: () => modal.open("switch-workspace"),
      }}
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb>{t("app:nav.dashboard")}</Breadcrumb>
        </Breadcrumbs>
      }
    >
      <HubPattern
        header={
          <>
            <Heading level={1} variant="heading-1-hub">
              {workspace.name}
            </Heading>
            <Text tone="secondary">
              {isViewer ? t("dashboard:leadViewer") : t("dashboard:lead")}
            </Text>
          </>
        }
        blocks={blocks}
      />
      {openModal === "new-idea" && !isViewer && (
        <ModalBoundary key={openModal} onClose={modal.close}>
          <NewIdeaDialog onClose={modal.close} />
        </ModalBoundary>
      )}
    </WorkspaceFrame>
  );
}
