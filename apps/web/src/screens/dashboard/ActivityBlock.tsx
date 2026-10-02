import { formatRelativeTime } from "@moonx/i18n";
import type { Activity } from "@moonx/schemas";
import { Link, RowList, RowListItem, Stack, Text } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { dashboardActivityQuery } from "../../lib/dashboard";
import { linkTargetPath } from "../../lib/link-target";
import { useMe } from "../../lib/session";
import { proposerName } from "../ideas/ideaText";
import { decisionText } from "../validation-home/decision-text";
import { DashboardBlock } from "./DashboardBlock";

type DecisionKey = Parameters<typeof decisionText>[1];

/** The sentence of one entry, built from its kind, actor and what it touched (SDD 5.6 Activity). */
function sentence(t: TFunction, entry: Activity): string {
  const actor = proposerName(t, entry.actor);
  switch (entry.kind) {
    case "decision":
    case "go_no_go":
      return t(`dashboard:activity.${entry.kind}`, {
        actor,
        value: decisionText(t, entry.summary as DecisionKey),
      });
    default:
      return t(`dashboard:activity.${entry.kind}`, { actor, summary: entry.summary });
  }
}

/**
 * The latest 20 entries. A row opens the item it is about; a comment opens it with the comments
 * panel (design-spec 6.9). Nothing of any self analysis appears here, which the API guarantees.
 */
export function ActivityBlock({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["dashboard", "ideas", "validation", "common"]);
  const me = useMe();
  const query = useQuery(dashboardActivityQuery(workspaceId));
  const now = new Date();
  return (
    <DashboardBlock title={t("dashboard:blocks.activity")} query={query}>
      {({ items }) =>
        items.length === 0 ? (
          <Text tone="secondary">{t("dashboard:activity.empty")}</Text>
        ) : (
          <RowList aria-label={t("dashboard:activity.listLabel")}>
            {items.map((entry) => {
              const path = linkTargetPath(entry.link, { workspaceId });
              const text = sentence(t, entry);
              const place = [entry.idea?.name, entry.plan?.name].filter(Boolean).join(" / ");
              return (
                <RowListItem key={`${entry.kind}:${entry.at}:${entry.link.target?.id ?? text}`}>
                  <Stack gap="space-50">
                    {path ? <Link href={path}>{text}</Link> : <Text>{text}</Text>}
                    <Text variant="caption" tone="secondary" as="span">
                      {t("dashboard:activity.context", {
                        place,
                        when: formatRelativeTime(entry.at, now, me.timezone),
                      })}
                    </Text>
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
