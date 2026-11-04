import {
  Heading,
  ListDetailPattern,
  Skeleton,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** The tree's pane while the version loads (design-spec 6.0.6). */
export function TreeSkeleton() {
  const { t } = useTranslation(["admin"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-200">
        {[0, 1, 2, 3].map((row) => (
          <Text key={row}>{t("admin:version.choose")}</Text>
        ))}
      </Stack>
    </Skeleton>
  );
}

/** 27's shape while its route loads (design-spec 6.0.6). */
export function TemplateVersionSkeleton() {
  const { t } = useTranslation(["admin"]);
  return (
    <ListDetailPattern
      header={
        <Skeleton isLoading>
          <Heading level={1} variant="heading-1-list">
            {t("admin:version.title")}
          </Heading>
        </Skeleton>
      }
      list={<TreeSkeleton />}
      detail={null}
      listLabel={t("admin:templates.title")}
      onBack={() => {}}
    />
  );
}
