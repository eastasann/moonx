import { Heading, HubPattern, RowList, RowListItem } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { HubBlock } from "../components/HubBlock";

/**
 * 10's shape while it loads (design-spec 6.0.6): the title, the status and the sections.
 * Drawn inside a `Skeleton`, its words are bars.
 */
export function SelfAnalysisHomeSkeleton() {
  const { t } = useTranslation(["selfAnalysis"]);
  const rows = (
    <RowList aria-label={t("selfAnalysis:home.sections.title")}>
      {[0, 1, 2, 3].map((row) => (
        <RowListItem key={row} end={t("selfAnalysis:home.sections.count")}>
          {t("selfAnalysis:home.sections.title")}
        </RowListItem>
      ))}
    </RowList>
  );
  return (
    <HubPattern
      header={
        <Heading level={1} variant="heading-1-hub">
          {t("selfAnalysis:home.title")}
        </Heading>
      }
      blocks={[
        {
          id: "status",
          column: "main",
          content: (
            <HubBlock title={t("selfAnalysis:home.state.title")}>
              {rows}
            </HubBlock>
          ),
        },
        {
          id: "sections",
          column: "aside",
          content: (
            <HubBlock title={t("selfAnalysis:home.sections.title")}>
              {rows}
            </HubBlock>
          ),
        },
      ]}
    />
  );
}
