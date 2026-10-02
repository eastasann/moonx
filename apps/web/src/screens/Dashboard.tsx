import { Heading, HubPattern, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { canEditIdeas, useWorkspaceRole } from "../lib/ideas";
import { useMe } from "../lib/session";
import { ActivityBlock } from "./dashboard/ActivityBlock";
import { DueSoonBlock } from "./dashboard/DueSoonBlock";
import { IdeasBlock } from "./dashboard/IdeasBlock";
import { SelfAnalysesBlock } from "./dashboard/SelfAnalysesBlock";

/**
 * Screen 5 (design-spec 6.9, pattern A): the ideas and the members' self analyses on the left, what
 * is due and what happened lately on the right. The blocks load separately. Self analyses are for
 * Owners and Members only.
 */
export function Dashboard({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation("dashboard");
  const me = useMe();
  const role = useWorkspaceRole(workspaceId);
  const workspace = me.memberships.find((m) => m.workspace.id === workspaceId)?.workspace;
  return (
    <HubPattern
      hasTabBar
      header={
        <>
          <Heading level={1}>{t("title")}</Heading>
          <Text tone="secondary">{workspace?.name}</Text>
        </>
      }
      status={
        <Stack gap="space-300">
          <IdeasBlock workspaceId={workspaceId} />
          {canEditIdeas(role) ? <SelfAnalysesBlock workspaceId={workspaceId} /> : null}
        </Stack>
      }
      entries={
        <Stack gap="space-300">
          <DueSoonBlock workspaceId={workspaceId} />
          <ActivityBlock workspaceId={workspaceId} />
        </Stack>
      }
    />
  );
}
