import { Avatar, Flex, Link, RowList, RowListItem, Text } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { dashboardSelfAnalysesQuery } from "../../lib/dashboard";
import { proposerName } from "../ideas/ideaText";
import { DashboardBlock } from "./DashboardBlock";

/**
 * The Owners and Members and whether each shared their self analysis here. A person who did not
 * share shows "Not shared" and nothing of their progress (design-spec 6.9, 6.11).
 */
export function SelfAnalysesBlock({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["dashboard", "ideas", "common"]);
  const query = useQuery(dashboardSelfAnalysesQuery(workspaceId));
  return (
    <DashboardBlock title={t("dashboard:blocks.selfAnalyses")} query={query}>
      {({ items }) => (
        <RowList aria-label={t("dashboard:selfAnalyses.listLabel")}>
          {items.map(({ user, shared, status }) => {
            const name = proposerName(t, user);
            return (
              <RowListItem key={user.id}>
                <Flex gap="space-100" align="center" justify="between">
                  <Flex gap="space-100" align="center">
                    <Avatar name={name} src={user.avatarUrl} size="S" />
                    {shared ? (
                      <Link href={`/w/${workspaceId}/team/${user.id}`}>{name}</Link>
                    ) : (
                      <Text tone="secondary" as="span">
                        {name}
                      </Text>
                    )}
                  </Flex>
                  <Text variant="caption" tone="secondary" as="span">
                    {shared && status
                      ? t("dashboard:selfAnalyses.shared", {
                          status: t(`dashboard:selfAnalyses.status.${status}`),
                        })
                      : t("dashboard:selfAnalyses.notShared")}
                  </Text>
                </Flex>
              </RowListItem>
            );
          })}
        </RowList>
      )}
    </DashboardBlock>
  );
}
