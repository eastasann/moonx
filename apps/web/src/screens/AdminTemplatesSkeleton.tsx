import { ListDetailPattern, Skeleton, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { AdminHeading } from "../components/admin";

/** Rows of placeholder words in the shape of the list (design-spec 6.0.6). */
export function TemplatesListSkeleton() {
  const { t } = useTranslation(["admin"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {(["self_analysis", "validation", "business_plan"] as const).map(
          (kind) => (
            <Stack key={kind} gap="space-50">
              <Text variant="label">{t(`admin:kind.${kind}`)}</Text>
              <Text variant="caption">{t("admin:templates.noVersions")}</Text>
            </Stack>
          ),
        )}
      </Stack>
    </Skeleton>
  );
}

/** 26's shape while its route loads (design-spec 6.0.6). */
export function AdminTemplatesSkeleton() {
  const { t } = useTranslation(["admin"]);
  return (
    <ListDetailPattern
      header={<AdminHeading />}
      list={<TemplatesListSkeleton />}
      detail={null}
      listLabel={t("admin:templates.title")}
      onBack={() => {}}
    />
  );
}
