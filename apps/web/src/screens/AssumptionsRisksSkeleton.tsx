import {
  Heading,
  ListDetailPattern,
  Skeleton,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** 16's list while its rows load (design-spec 6.0.6): three rows of bars. */
export function ListSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {[0, 1, 2].map((row) => (
          <Stack key={row} gap="space-50">
            <Text variant="label">{t("validation:assumptions.title")}</Text>
            <Text variant="caption">
              {t("validation:assumptions.empty.assumptions")}
            </Text>
          </Stack>
        ))}
      </Stack>
    </Skeleton>
  );
}

/** 16's shape while its route loads (design-spec 6.0.6). */
export function AssumptionsSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <ListDetailPattern
      header={
        <Heading level={1} variant="heading-1-list">
          {t("validation:assumptions.title")}
        </Heading>
      }
      list={<ListSkeleton />}
      detail={null}
      listLabel={t("validation:assumptions.title")}
      onBack={() => {}}
    />
  );
}
