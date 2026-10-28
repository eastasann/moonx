import {
  Heading,
  ListDetailPattern,
  Skeleton,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** Rows of placeholder words in the shape of the list (design-spec 6.0.6). */
export function ListSkeleton() {
  const { t } = useTranslation(["decisions"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {[0, 1, 2].map((row) => (
          <Stack key={row} gap="space-50">
            <Text variant="label">{t("decisions:title")}</Text>
            <Text variant="caption">{t("decisions:empty")}</Text>
          </Stack>
        ))}
      </Stack>
    </Skeleton>
  );
}

/** 7's shape while its route loads (design-spec 6.0.6). */
export function DecisionLogSkeleton() {
  const { t } = useTranslation(["decisions"]);
  return (
    <ListDetailPattern
      header={
        <Heading level={1} variant="heading-1-list">
          {t("decisions:title")}
        </Heading>
      }
      list={<ListSkeleton />}
      detail={null}
      listLabel={t("decisions:title")}
      onBack={() => {}}
    />
  );
}
