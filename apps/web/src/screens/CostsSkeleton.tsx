import { costCategorySchema } from "@moonx/schemas";
import { Heading, Stack, Text, WorksheetPattern } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** The three tables in the order 17 shows them (design-spec 6.3「表と列」). */
export const CATEGORIES = costCategorySchema.options;

/** The tables' shape while the rows load (design-spec 6.0.6). */
export function TablesSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <Stack gap="space-500">
      {CATEGORIES.map((category) => (
        <Stack key={category} gap="space-100">
          <Heading level={2} variant="heading-4">
            {t(`validation:costs.table.${category}`)}
          </Heading>
          {[0, 1, 2, 3].map((row) => (
            <Text key={row}>{t(`validation:costs.table.${category}`)}</Text>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * 17's shape while its route loads (design-spec 6.0.6). Drawn inside a `Skeleton`, its
 * words are bars.
 */
export function CostsSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <WorksheetPattern
      header={<Heading level={1}>{t("validation:costs.title")}</Heading>}
      inputs={<TablesSkeleton />}
      resultsTitle={t("validation:costs.totals")}
      results={null}
      summary={null}
    />
  );
}
