import { Badge, Flex, Link, RowList, RowListItem, Stack, Text } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { assigneeOf, dashboardDueSoonQuery, daysUntil, EXECUTION_TAB } from "../../lib/dashboard";
import { linkTargetPath } from "../../lib/link-target";
import { useMe } from "../../lib/session";
import { DashboardBlock } from "./DashboardBlock";

/**
 * Execution items that are overdue or due within a week, the person's own first. A row opens the
 * item on screen 22 (design-spec 6.9).
 */
export function DueSoonBlock({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["dashboard", "common"]);
  const me = useMe();
  const query = useQuery(dashboardDueSoonQuery(workspaceId));
  const now = new Date();
  return (
    <DashboardBlock title={t("dashboard:blocks.dueSoon")} query={query}>
      {({ items }) =>
        items.length === 0 ? (
          <Text tone="secondary">{t("dashboard:dueSoon.empty")}</Text>
        ) : (
          <RowList aria-label={t("dashboard:dueSoon.listLabel")}>
            {items.map((item) => {
              const days = daysUntil(item.dueDate, now, me.timezone);
              const assignee = assigneeOf(item);
              const when = item.overdue
                ? t("dashboard:dueSoon.overdue", { days: Math.abs(days) })
                : days === 0
                  ? t("dashboard:dueSoon.today")
                  : t("dashboard:dueSoon.inDays", { days });
              const who = !assignee
                ? t("dashboard:dueSoon.unassigned")
                : "displayName" in assignee
                  ? assignee.badge === "deleted"
                    ? t("common:deletedUser")
                    : assignee.displayName
                  : assignee.name;
              const path = linkTargetPath({
                screen: 22,
                workspaceId,
                ideaId: item.idea.id,
                planId: item.plan.id,
                tab: EXECUTION_TAB[item.type],
                rowId: item.id,
              });
              return (
                <RowListItem key={item.id}>
                  <Stack gap="space-50">
                    {path ? <Link href={path}>{item.title}</Link> : <Text>{item.title}</Text>}
                    <Flex gap="space-100" align="center" wrap>
                      {item.overdue ? (
                        <>
                          <Text variant="caption" tone="secondary" as="span">
                            {t("dashboard:dueSoon.assignee", { who })}
                          </Text>
                          <Badge size="S" variant="negative">
                            {when}
                          </Badge>
                        </>
                      ) : (
                        <Text variant="caption" tone="secondary" as="span">
                          {t("dashboard:dueSoon.assigneeWhen", { who, when })}
                        </Text>
                      )}
                      {item.isMine ? <Badge size="S">{t("dashboard:dueSoon.mine")}</Badge> : null}
                    </Flex>
                  </Stack>
                </RowListItem>
              );
            })}
          </RowList>
        )
      }
    </DashboardBlock>
  );
}
