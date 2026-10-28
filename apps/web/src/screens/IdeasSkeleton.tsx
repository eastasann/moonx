import {
  Heading,
  ListDetailPattern,
  Skeleton,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** Rows of placeholder words in the shape of the list (design-spec 6.0.6). */
export function IdeasListSkeleton() {
  const { t } = useTranslation(["ideas"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {[0, 1, 2].map((row) => (
          <Stack key={row} gap="space-50">
            <Text variant="label">{t("ideas:newIdea")}</Text>
            <Text variant="caption">{t("ideas:empty")}</Text>
          </Stack>
        ))}
      </Stack>
    </Skeleton>
  );
}

/** 6 Ideas' shape while its route loads (design-spec 6.0.6). */
export function IdeasSkeleton() {
  const { t } = useTranslation(["ideas"]);
  return (
    <ListDetailPattern
      header={
        <Heading level={1} variant="heading-1-list">
          {t("ideas:title")}
        </Heading>
      }
      list={<IdeasListSkeleton />}
      detail={null}
      listLabel={t("ideas:title")}
      onBack={() => {}}
    />
  );
}
