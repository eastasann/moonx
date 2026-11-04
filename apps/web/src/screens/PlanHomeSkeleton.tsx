import { Heading, HubPattern, RowList, RowListItem } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { HubBlock } from "../components/HubBlock";

/**
 * 20's shape while it loads (design-spec 6.0.6): the name, the key numbers and the items.
 * Drawn inside a `Skeleton`, its words are bars.
 */
export function PlanHomeSkeleton() {
  const { t } = useTranslation(["plans"]);
  const rows = (label: string) => (
    <RowList aria-label={label}>
      {[0, 1, 2, 3].map((row) => (
        <RowListItem
          key={row}
          end={t("plans:home.filled", { filled: 0, total: 0 })}
        >
          {label}
        </RowListItem>
      ))}
    </RowList>
  );
  return (
    <HubPattern
      header={
        <Heading level={1} variant="heading-1-hub">
          {t("plans:home.keyNumbers.title")}
        </Heading>
      }
      blocks={[
        {
          id: "numbers",
          column: "main",
          content: (
            <HubBlock title={t("plans:home.keyNumbers.title")}>
              {rows(t("plans:home.keyNumbers.title"))}
            </HubBlock>
          ),
        },
        {
          id: "part-a",
          column: "aside",
          content: (
            <HubBlock title={t("plans:home.part.a")}>
              {rows(t("plans:home.part.a"))}
            </HubBlock>
          ),
        },
      ]}
    />
  );
}
