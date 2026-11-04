import { Heading, Stack, Text, WorksheetPattern } from "@moonx/ui-web";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * 18's shape while it loads (design-spec 6.0.6). Drawn inside a `Skeleton`, its words are
 * bars.
 */
export function EconomicsSkeleton({ header }: { header?: ReactNode } = {}) {
  const { t } = useTranslation(["validation"]);
  return (
    <WorksheetPattern
      header={
        header ?? <Heading level={1}>{t("validation:economics.title")}</Heading>
      }
      inputs={
        <Stack gap="space-500">
          {[
            t("validation:economics.inputs"),
            t("validation:economics.dailySales"),
          ].map((label) => (
            <Stack key={label} gap="space-100">
              <Heading level={2} variant="heading-4">
                {label}
              </Heading>
              {[0, 1, 2].map((row) => (
                <Text key={row}>{label}</Text>
              ))}
            </Stack>
          ))}
        </Stack>
      }
      resultsTitle={t("validation:economics.results")}
      results={null}
      summary={null}
    />
  );
}
