import { Heading, HubPattern, RowList, RowListItem } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { HubBlock } from "../components/HubBlock";

/**
 * 13 Validation home's shape while it loads (design-spec 6.0.6・6.1「ローディング」): the
 * title, the key numbers, the checks and the sections. Drawn inside a `Skeleton`, its
 * words are bars.
 */
export function ValidationHomeSkeleton() {
  const { t } = useTranslation(["validation"]);
  const rows = (label: string) => (
    <RowList aria-label={label}>
      {[0, 1, 2, 3].map((row) => (
        <RowListItem key={row} end={t("validation:home.summary.empty")}>
          {label}
        </RowListItem>
      ))}
    </RowList>
  );
  return (
    <HubPattern
      header={
        <Heading level={1} variant="heading-1-hub">
          {t("validation:home.keyNumbers")}
        </Heading>
      }
      blocks={[
        {
          id: "checks",
          column: "main",
          content: (
            <HubBlock title={t("validation:home.checks.title")}>
              {rows(t("validation:home.checks.title"))}
            </HubBlock>
          ),
        },
        {
          id: "sections",
          column: "aside",
          content: (
            <HubBlock title={t("validation:home.sections.title")}>
              {rows(t("validation:home.sections.title"))}
            </HubBlock>
          ),
        },
      ]}
    />
  );
}
