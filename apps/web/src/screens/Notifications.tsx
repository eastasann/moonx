import { formatRelativeTime } from "@moonx/i18n";
import type { Notification } from "@moonx/schemas";
import {
  Avatar,
  Breadcrumb,
  Breadcrumbs,
  Button,
  Flex,
  Heading,
  IllustratedMessage,
  ListDetailPattern,
  ListView,
  ListViewItem,
  Picker,
  Skeleton,
  Stack,
  Text,
  ToastQueue,
} from "@moonx/ui-web";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCheck, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toastFailure } from "../components/ideaActions";
import {
  FailureState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, useWorkspace } from "../components/workspace";
import { api, inPath, unwrap } from "../lib/api";
import { hrefOf, notificationsHref } from "../lib/links";
import {
  notificationsKey,
  notificationsPage,
  unreadCountQuery,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

/** `/notifications`'s search parameters (SDD 4章). */
export interface NotificationsSearch {
  filter?: "unread";
}

/** How long the toast of a notification that can no longer be opened stays. */
const TOAST_MS = 5000;

type Page = Awaited<ReturnType<typeof notificationsPage>>;

const listKey = (filter: "all" | "unread") => [
  ...notificationsKey,
  "list",
  filter,
];

/** Marks `id` read in every list held, as N3 does, so the row turns light at once. */
function markRead(
  pages: InfiniteData<Page> | undefined,
  id: string | null,
  at: string,
): InfiniteData<Page> | undefined {
  if (pages === undefined) return pages;
  return {
    ...pages,
    pages: pages.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        (id === null || item.id === id) && item.readAt === null
          ? { ...item, readAt: at }
          : item,
      ),
    })),
  };
}

/**
 * One notification (design-spec 6.15): who did what and where, the start of the comment
 * or of the reason in a line or two, the workspace and when; unread in bold, and said so.
 */
function NotificationRow({ notification }: { notification: Notification }) {
  const { t } = useTranslation(["notifications", "app"]);
  const { me } = useWorkspace();
  const isUnread = notification.readAt === null;
  const meta = [
    ...(isUnread ? [t("notifications:screen.unreadMark")] : []),
    notification.workspace.name,
    formatRelativeTime(notification.createdAt, { timeZone: me.timezone }),
  ].join(t("app:separator"));
  return (
    <Flex gap="space-200" alignItems="start">
      {notification.actor !== null && (
        <Avatar
          name={notification.actor.displayName}
          src={notification.actor.avatarUrl}
        />
      )}
      <Stack gap="space-50">
        <Text variant={isUnread ? "label" : "body"}>{notification.title}</Text>
        {notification.excerpt !== null && (
          <Text variant="body-sm" tone="secondary" maxLines={2}>
            {notification.excerpt}
          </Text>
        )}
        <Text variant="caption" tone="secondary">
          {meta}
        </Text>
      </Stack>
    </Flex>
  );
}

/**
 * The list and its filter (design-spec 6.15, 4.1 D's note): pattern D with no detail,
 * the list in the reading column. A press marks the notification read and opens where it
 * happened, in its workspace; one the user can no longer read says so.
 */
function NotificationsBody({ search }: { search: NotificationsSearch }) {
  const { t } = useTranslation(["notifications"]);
  const { me } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const filter = search.filter ?? "all";
  const query = useInfiniteQuery({
    queryKey: listKey(filter),
    queryFn: ({ pageParam }) => notificationsPage(filter, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) =>
      last.nextCursor === null ? undefined : Number(last.nextCursor),
  });
  const unread = useQuery(unreadCountQuery());
  const isSlow = useIsSlow(query.isPending);
  const settle = () =>
    void queryClient.invalidateQueries({ queryKey: notificationsKey });

  const read = useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api()
          .api.v1.notifications({ id: inPath(id) })
          .read.post({}),
      ),
    onMutate: (id) => {
      const at = new Date().toISOString();
      for (const key of [listKey("all"), listKey("unread")]) {
        queryClient.setQueryData<InfiniteData<Page>>(key, (pages) =>
          markRead(pages, id, at),
        );
      }
    },
    // The user has moved on to the item: the failure says so where they are, with Retry.
    onError: (error, id) => toastFailure(error, () => read.mutate(id)),
    onSettled: settle,
  });
  const readAll = useMutation({
    mutationFn: () => unwrap(api().api.v1.notifications["read-all"].post({})),
    onSuccess: () => {
      const at = new Date().toISOString();
      for (const key of [listKey("all"), listKey("unread")]) {
        queryClient.setQueryData<InfiniteData<Page>>(key, (pages) =>
          markRead(pages, null, at),
        );
      }
    },
    onError: (error) => toastFailure(error, () => readAll.mutate()),
    onSettled: settle,
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  /**
   * What pressing a notification does: open where it happened, or say it can no longer
   * be read; none while its screen is not built (docs/claude-code-prompts.md: no way
   * into a screen before it exists), and the row stays still.
   */
  const actionOf = (notification: Notification) => {
    const href = hrefOf(notification.link);
    if (notification.accessible && href === undefined) return undefined;
    return () => {
      if (notification.readAt === null) read.mutate(notification.id);
      if (href === undefined || !notification.accessible) {
        ToastQueue.neutral(t("notifications:screen.noAccess"), {
          timeout: TOAST_MS,
        });
        return;
      }
      void navigate({ href });
    };
  };

  let list: ReactNode;
  if (query.isError) {
    list = (
      <FailureState
        error={query.error}
        onRetry={() => void query.refetch()}
        dashboardHref={dashboardHref(me)}
        headingLevel={2}
        size="S"
      />
    );
  } else if (query.data === undefined) {
    list = isSlow ? (
      <SlowLoadingState
        headingLevel={2}
        size="S"
        onRetry={() => void query.refetch()}
      />
    ) : (
      <NotificationsListSkeleton />
    );
  } else if (items.length === 0) {
    list =
      filter === "unread" ? (
        <IllustratedMessage
          headingLevel={2}
          size="S"
          icon={<SearchX />}
          heading={t("notifications:screen.emptyFiltered")}
          actions={
            <Button
              variant="secondary"
              onPress={() =>
                void navigate({ href: notificationsHref(), replace: true })
              }
            >
              {t("notifications:screen.clear")}
            </Button>
          }
        />
      ) : (
        <IllustratedMessage
          headingLevel={2}
          size="S"
          icon={<CheckCheck />}
          heading={t("notifications:screen.empty")}
        />
      );
  } else {
    list = (
      <ListView
        aria-label={t("notifications:screen.list")}
        items={items}
        dependencies={[me.timezone]}
      >
        {(notification) => (
          <ListViewItem
            id={notification.id}
            textValue={notification.title}
            onAction={actionOf(notification)}
          >
            <NotificationRow notification={notification} />
          </ListViewItem>
        )}
      </ListView>
    );
  }

  return (
    <ListDetailPattern
      hasDetail={false}
      header={
        <Heading level={1} variant="heading-1-list">
          {t("notifications:screen.title")}
        </Heading>
      }
      filters={
        <>
          <Picker
            label={t("notifications:screen.show")}
            labelPosition="inside"
            size="S"
            items={[
              { id: "all", label: t("notifications:screen.all") },
              { id: "unread", label: t("notifications:screen.unread") },
            ]}
            value={filter}
            onChange={(value) =>
              void navigate({
                href: notificationsHref(
                  value === "unread" ? "unread" : undefined,
                ),
                replace: true,
              })
            }
          />
          <Button
            variant="secondary"
            isQuiet
            size="S"
            isDisabled={(unread.data?.total ?? 0) === 0}
            isPending={readAll.isPending}
            onPress={() => readAll.mutate()}
          >
            {t("notifications:screen.markAllRead")}
          </Button>
        </>
      }
      list={list}
      listNote={
        query.hasNextPage ? (
          <Flex>
            <Button
              variant="secondary"
              size="S"
              isPending={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            >
              {t("notifications:screen.more")}
            </Button>
          </Flex>
        ) : undefined
      }
    />
  );
}

/** Rows of placeholder words in the shape of the list (design-spec 6.0.6). */
function NotificationsListSkeleton() {
  const { t } = useTranslation(["notifications"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {[0, 1, 2].map((row) => (
          <Stack key={row} gap="space-50">
            <Text variant="label">{t("notifications:screen.markAllRead")}</Text>
            <Text variant="caption">{t("notifications:screen.empty")}</Text>
          </Stack>
        ))}
      </Stack>
    </Skeleton>
  );
}

/** 8 Notifications' shape while its route loads (design-spec 6.0.6). */
export function NotificationsSkeleton() {
  const { t } = useTranslation(["notifications"]);
  return (
    <ListDetailPattern
      hasDetail={false}
      header={
        <Heading level={1} variant="heading-1-list">
          {t("notifications:screen.title")}
        </Heading>
      }
      list={<NotificationsListSkeleton />}
    />
  );
}

/**
 * 8 Notifications (design-spec 6.15): every workspace's notifications in one list, newest
 * first, with All / Unread and Mark all as read. Outside any workspace, the navigation
 * stands in the one last opened, as 4 does.
 */
export function NotificationsScreen({
  search,
}: {
  search: NotificationsSearch;
}) {
  const { t } = useTranslation(["notifications"]);
  useDocumentTitle(t("notifications:screen.title"));
  return (
    <WorkspaceFrame
      current="notifications"
      title={{ label: t("notifications:screen.title") }}
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb>{t("notifications:screen.title")}</Breadcrumb>
        </Breadcrumbs>
      }
    >
      <NotificationsBody search={search} />
    </WorkspaceFrame>
  );
}
