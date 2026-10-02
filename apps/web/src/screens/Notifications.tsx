import { formatRelativeTime } from "@moonx/i18n";
import {
  Avatar,
  Badge,
  Button,
  Flex,
  Heading,
  IllustratedMessage,
  InlineAlert,
  ListView,
  ListViewItem,
  SegmentedControl,
  SegmentedControlItem,
  SettingsPattern,
  Skeleton,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ErrorState, LoadingState } from "../components/states";
import { errorText } from "../lib/error-text";
import { linkTargetPath } from "../lib/link-target";
import { useGoTo } from "../lib/navigate";
import {
  type NotificationFilter,
  type NotificationItem,
  notificationsQuery,
  unreadCountQuery,
  useNotificationActions,
} from "../lib/notifications";
import { useMe } from "../lib/session";
import { toasts } from "../lib/toast";
import { proposerName } from "./ideas/ideaText";

function ListSkeleton() {
  return (
    <Stack gap="space-200">
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} shape="block" height="space-800" />
      ))}
    </Stack>
  );
}

function NotificationRow({
  item,
  now,
  timeZone,
}: {
  item: NotificationItem;
  now: Date;
  timeZone: string;
}) {
  const { t } = useTranslation(["notifications", "ideas", "common"]);
  const unread = item.readAt === null;
  return (
    <Flex gap="space-200" align="start" grow>
      {item.actor ? (
        <Avatar name={proposerName(t, item.actor)} src={item.actor.avatarUrl} size="S" />
      ) : null}
      <Flex direction="column" gap="space-50" grow>
        <Text
          variant={unread ? "label" : "body-sm"}
          tone={item.accessible ? "primary" : "secondary"}
        >
          {item.title}
        </Text>
        {item.excerpt ? (
          <Text variant="body-sm" tone="secondary">
            {item.excerpt}
          </Text>
        ) : null}
        <Flex gap="space-100" align="center" wrap>
          <Badge size="S">{item.workspace.name}</Badge>
          <Text variant="caption" tone="secondary" as="span">
            {formatRelativeTime(item.createdAt, now, timeZone)}
          </Text>
          {unread ? (
            <Badge size="S" variant="informative">
              {t("notifications:unreadMark")}
            </Badge>
          ) : null}
          {item.accessible ? null : (
            <Text variant="caption" tone="secondary" as="span">
              {t("notifications:noAccess")}
            </Text>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
}

export interface NotificationsProps {
  filter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
}

/**
 * Screen 8, the notifications of every workspace in one list (design-spec 6.15). Pressing one
 * marks it read and opens the item it is about in its workspace; one the person can no longer
 * reach says so instead. Unread ones are bold.
 */
export function Notifications({ filter, onFilterChange }: NotificationsProps) {
  const { t } = useTranslation(["notifications", "app", "errors"]);
  const me = useMe();
  const goTo = useGoTo();
  const list = useInfiniteQuery(notificationsQuery(filter));
  const unread = useQuery(unreadCountQuery);
  const { markRead, markAllRead } = useNotificationActions();
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const now = new Date();

  const open = (item: NotificationItem) => {
    if (item.readAt === null) {
      markRead.mutate(item.id, {
        onError: (error) => toasts.add({ title: errorText(t, error), variant: "negative" }),
      });
    }
    if (!item.accessible) {
      toasts.add({ title: t("notifications:noAccess"), variant: "informative" });
      return;
    }
    const path = linkTargetPath(item.link, { workspaceId: item.workspace.id });
    goTo(path ?? `/w/${item.workspace.id}`);
  };

  const rows = () => {
    if (list.isPending) {
      return <LoadingState skeleton={<ListSkeleton />} onRetry={() => void list.refetch()} />;
    }
    if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
    if (items.length === 0) {
      return <IllustratedMessage icon={BellOff} heading={t("notifications:empty")} />;
    }
    return (
      <Stack gap="space-200">
        <ListView
          aria-label={t("notifications:listLabel")}
          selectionMode="none"
          onAction={(key) => {
            const item = items.find((candidate) => candidate.id === key);
            if (item) open(item);
          }}
        >
          {items.map((item) => (
            <ListViewItem key={item.id} id={item.id} textValue={item.title}>
              <NotificationRow item={item} now={now} timeZone={me.timezone} />
            </ListViewItem>
          ))}
        </ListView>
        {list.isFetchNextPageError ? (
          <InlineAlert variant="negative" heading={t("notifications:loadMoreFailed")} />
        ) : null}
        {list.hasNextPage ? (
          <Flex justify="center">
            <Button
              variant="secondary"
              isPending={list.isFetchingNextPage}
              pendingLabel={t("notifications:loadingMore")}
              onPress={() => void list.fetchNextPage()}
            >
              {t("notifications:loadMore")}
            </Button>
          </Flex>
        ) : null}
      </Stack>
    );
  };

  return (
    <SettingsPattern header={<Heading level={1}>{t("notifications:title")}</Heading>}>
      <Flex gap="space-200" justify="between" align="center" wrap>
        <SegmentedControl
          aria-label={t("notifications:filter.label")}
          value={filter}
          onChange={(value) => onFilterChange(value === "unread" ? "unread" : "all")}
        >
          <SegmentedControlItem value="all">{t("notifications:filter.all")}</SegmentedControlItem>
          <SegmentedControlItem value="unread">
            {t("notifications:filter.unread")}
          </SegmentedControlItem>
        </SegmentedControl>
        <Button
          variant="secondary"
          isDisabled={(unread.data?.total ?? 0) === 0}
          isPending={markAllRead.isPending}
          pendingLabel={t("app:saving")}
          onPress={() =>
            markAllRead.mutate(undefined, {
              onError: (error) => toasts.add({ title: errorText(t, error), variant: "negative" }),
            })
          }
        >
          {t("notifications:markAllRead")}
        </Button>
      </Flex>
      {rows()}
    </SettingsPattern>
  );
}
