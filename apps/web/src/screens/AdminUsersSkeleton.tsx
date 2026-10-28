import { ListDetailPattern, Skeleton, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { AdminHeading } from "../components/admin";

/** Rows of placeholder words in the shape of a list (design-spec 6.0.6). */
export function ListSkeleton() {
  const { t } = useTranslation(["admin"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {[0, 1, 2, 3].map((row) => (
          <Stack key={row} gap="space-50">
            <Text variant="label">{t("admin:users.title")}</Text>
            <Text variant="caption">{t("admin:users.never")}</Text>
          </Stack>
        ))}
      </Stack>
    </Skeleton>
  );
}

/** 28's shape while its route loads (design-spec 6.0.6). */
export function AdminUsersSkeleton() {
  const { t } = useTranslation(["admin"]);
  return (
    <ListDetailPattern
      header={<AdminHeading />}
      list={<ListSkeleton />}
      detail={null}
      listLabel={t("admin:tabs.users")}
      onBack={() => {}}
    />
  );
}
