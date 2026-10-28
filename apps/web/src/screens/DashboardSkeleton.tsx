import {
  Heading,
  type HubBlock,
  HubPattern,
  RowList,
  RowListItem,
  Text,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { HubBlock as Block } from "../components/HubBlock";

/** Rows of placeholder words in the shape of a block's list. */
export function RowsSkeleton({
  line,
  detail,
}: {
  line: string;
  detail: string;
}) {
  return (
    <RowList>
      {[0, 1, 2].map((row) => (
        <RowListItem key={row} description={<Text>{detail}</Text>}>
          <Text>{line}</Text>
        </RowListItem>
      ))}
    </RowList>
  );
}

/**
 * 5 Dashboard's shape while its route loads (design-spec 6.0.6): the title, and the four
 * blocks' headings over rows of bars. Drawn inside a `Skeleton`, its words are bars.
 */
export function DashboardSkeleton() {
  const { t } = useTranslation(["dashboard"]);
  const rows = (
    <RowsSkeleton
      line={t("dashboard:gettingStarted.firstIdea")}
      detail={t("dashboard:due.window")}
    />
  );
  const skeletonBlock = (
    id: string,
    column: HubBlock["column"],
    title: string,
  ): HubBlock => ({
    id,
    column,
    content: <Block title={title}>{rows}</Block>,
  });
  return (
    <HubPattern
      header={
        <>
          <Heading level={1} variant="heading-1-hub">
            {t("dashboard:ideas.title")}
          </Heading>
          <Text tone="secondary">{t("dashboard:lead")}</Text>
        </>
      }
      blocks={[
        skeletonBlock("ideas", "main", t("dashboard:ideas.title")),
        skeletonBlock("due", "aside", t("dashboard:due.title")),
        skeletonBlock("self", "main", t("dashboard:selfAnalyses.title")),
        skeletonBlock("activity", "aside", t("dashboard:activity.title")),
      ]}
    />
  );
}
