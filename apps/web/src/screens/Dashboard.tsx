import { Heading, HubPattern, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { useMe } from "../lib/session";

/**
 * Screen 5 as far as the app frame needs it: the route, the title and the workspace it is for.
 * The blocks of design-spec 6.9 come with the dashboard step.
 */
export function Dashboard({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation("app");
  const me = useMe();
  const workspace = me.memberships.find((m) => m.workspace.id === workspaceId)?.workspace;
  return (
    <HubPattern
      hasTabBar
      header={
        <>
          <Heading level={1}>{t("nav.dashboard")}</Heading>
          <Text tone="secondary">{workspace?.name}</Text>
        </>
      }
      status={null}
      entries={null}
    />
  );
}
