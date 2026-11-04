import { Heading, QuestionFormPattern, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/**
 * 21's shape while it loads (design-spec 6.0.6): the title and the sub-items' rows.
 * Drawn inside a `Skeleton`, its words are bars.
 */
export function PlanItemSkeleton() {
  const { t } = useTranslation(["plans", "validation"]);
  return (
    <QuestionFormPattern
      header={<Heading level={1}>{t("plans:item.references")}</Heading>}
      questionIds={["a", "b", "c", "d"]}
      currentId={null}
      onCurrentChange={() => {}}
      isReadOnly
      renderQuestion={() => (
        <Stack gap="space-100">
          <Text variant="caption">{t("plans:home.empty")}</Text>
          <Text>{t("validation:questions.placeholder")}</Text>
        </Stack>
      )}
    />
  );
}
