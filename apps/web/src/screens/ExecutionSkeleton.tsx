import {
  Heading,
  ListDetailPattern,
  Skeleton,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** 22's list while its rows load (design-spec 6.0.6): three rows of bars. */
export function ListSkeleton() {
  const { t } = useTranslation(["plans"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {[0, 1, 2].map((row) => (
          <Stack key={row} gap="space-50">
            <Text variant="label">{t("plans:execution.title")}</Text>
            <Text variant="caption">
              {t("plans:execution.empty.milestones")}
            </Text>
          </Stack>
        ))}
      </Stack>
    </Skeleton>
  );
}

/** 22's shape while its route loads (design-spec 6.0.6). */
export function ExecutionSkeleton() {
  const { t } = useTranslation(["plans"]);
  return (
    <ListDetailPattern
      header={
        <Heading level={1} variant="heading-1-list">
          {t("plans:execution.title")}
        </Heading>
      }
      list={<ListSkeleton />}
      detail={null}
      listLabel={t("plans:execution.title")}
      onBack={() => {}}
    />
  );
}
