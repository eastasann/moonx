import { Heading, QuestionFormPattern, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/**
 * 11's shape while it loads (design-spec 6.2「ローディング」): the title and the questions'
 * rows. Drawn inside a `Skeleton`, its words are bars.
 */
export function QuestionFormSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <QuestionFormPattern
      header={<Heading level={1}>{t("validation:questions.empty")}</Heading>}
      questionIds={["a", "b", "c", "d"]}
      currentId={null}
      onCurrentChange={() => {}}
      isReadOnly
      renderQuestion={() => (
        <Stack gap="space-100">
          <Text variant="caption">{t("validation:questions.empty")}</Text>
          <Text>{t("validation:questions.placeholder")}</Text>
        </Stack>
      )}
    />
  );
}
