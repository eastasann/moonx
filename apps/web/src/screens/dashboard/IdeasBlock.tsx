import { formatRelativeTime } from "@moonx/i18n";
import { Badge, Flex, Link, RowList, RowListItem, Stack, Text } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { dashboardIdeasQuery } from "../../lib/dashboard";
import { useMe } from "../../lib/session";
import { missingChecks } from "../ideas/ideaText";
import { DashboardBlock } from "./DashboardBlock";
import { GettingStarted } from "./GettingStarted";

/** The names of what is missing as the block shows them: a dash, the names, or a count of checks. */
function missingText(t: ReturnType<typeof useTranslation>["t"], names: string[]): string {
  if (names.length === 0) return t("dashboard:ideas.noMissing");
  if (names.length <= 2) return t("dashboard:ideas.missing", { names: names.join(", ") });
  return t("dashboard:ideas.missing", {
    names: t("dashboard:ideas.missingCount", { count: names.length }),
  });
}

/**
 * Ideas that are neither archived nor dropped, with their stage, latest decision and what is
 * missing. Dropped ones are a count that opens screen 6 filtered to them (design-spec 6.9). A
 * workspace with no ideas at all shows Getting started instead.
 */
export function IdeasBlock({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["dashboard", "ideas", "validation", "common"]);
  const me = useMe();
  const query = useQuery(dashboardIdeasQuery(workspaceId));
  const now = new Date();
  return (
    <DashboardBlock title={t("dashboard:blocks.ideas")} query={query}>
      {({ items, droppedCount }) =>
        items.length === 0 && droppedCount === 0 ? (
          <GettingStarted workspaceId={workspaceId} />
        ) : (
          <Stack gap="space-100">
            {items.length === 0 ? (
              <Text tone="secondary">{t("dashboard:ideas.none")}</Text>
            ) : (
              <RowList aria-label={t("dashboard:ideas.listLabel")}>
                {items.map((idea) => {
                  const decision = idea.latestDecision ?? "undecided";
                  return (
                    <RowListItem key={idea.id}>
                      <Flex gap="space-200" justify="between" align="start">
                        <Stack gap="space-50">
                          <Link href={`/w/${workspaceId}/ideas/${idea.id}`}>{idea.name}</Link>
                          <Text variant="caption" tone="secondary" as="span">
                            {t("dashboard:ideas.meta", {
                              stage: t(`validation:stage.${idea.stage}`),
                              updated: t("ideas:row.updated", {
                                when: formatRelativeTime(idea.lastActivityAt, now, me.timezone),
                              }),
                            })}
                          </Text>
                          <Text variant="caption" tone="secondary" as="span">
                            {missingText(t, missingChecks(t, idea))}
                          </Text>
                        </Stack>
                        <Badge size="S" variant={decision}>
                          {t(`ideas:decision.${decision}`)}
                        </Badge>
                      </Flex>
                    </RowListItem>
                  );
                })}
              </RowList>
            )}
            {droppedCount > 0 ? (
              <Flex gap="space-100" align="center" wrap>
                <Text variant="caption" tone="secondary" as="span">
                  {t("dashboard:ideas.droppedHidden", { count: droppedCount })}
                </Text>
                <Link href={`/w/${workspaceId}/ideas?decision=drop`}>
                  {t("dashboard:ideas.showDropped")}
                </Link>
              </Flex>
            ) : null}
          </Stack>
        )
      }
    </DashboardBlock>
  );
}
