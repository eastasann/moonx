import {
  Heading,
  ListDetailPattern,
  Skeleton,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** 12's list while it loads: rows of names and their sharing. */
export function ListSkeleton() {
  const { t } = useTranslation(["selfAnalysis"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {[0, 1, 2].map((row) => (
          <Stack key={row} gap="space-50">
            <Text>{t("selfAnalysis:team.members")}</Text>
            <Text variant="caption">{t("selfAnalysis:team.notShared")}</Text>
          </Stack>
        ))}
      </Stack>
    </Skeleton>
  );
}

/** 12's shape while its route loads (design-spec 6.0.6). */
export function TeamSelfAnalysesSkeleton() {
  const { t } = useTranslation(["selfAnalysis"]);
  return (
    <ListDetailPattern
      header={
        <Heading level={1} variant="heading-1-list">
          {t("selfAnalysis:team.title")}
        </Heading>
      }
      list={<ListSkeleton />}
      detail={null}
      listLabel={t("selfAnalysis:team.title")}
      onBack={() => {}}
    />
  );
}
