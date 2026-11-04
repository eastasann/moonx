import {
  Heading,
  ListDetailPattern,
  Skeleton,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** Rows of placeholder words in the shape of the list (design-spec 6.0.6). */
export function NotificationsListSkeleton() {
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
