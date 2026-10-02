import { Divider, Heading, SettingsPattern } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { NoAccessState } from "../components/states";
import { useMe } from "../lib/session";
import { GeneralSection } from "./workspace-settings/GeneralSection";
import { InvitationsSection } from "./workspace-settings/InvitationsSection";
import { MembersSection } from "./workspace-settings/MembersSection";

/**
 * Screen 9, workspace settings (design-spec 6.16): name, currency, members and invitations, for
 * Owners only. The API refuses everyone else, so the screen does not ask it.
 */
export function WorkspaceSettings({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation("workspaceSettings");
  const membership = useMe().memberships.find((m) => m.workspace.id === workspaceId);
  if (membership?.role !== "owner") return <NoAccessState />;
  return (
    <SettingsPattern header={<Heading level={1}>{t("title")}</Heading>}>
      <GeneralSection
        workspaceId={workspaceId}
        name={membership.workspace.name}
        currency={membership.workspace.currency}
      />
      <Divider />
      <MembersSection workspaceId={workspaceId} />
      <Divider />
      <InvitationsSection workspaceId={workspaceId} />
    </SettingsPattern>
  );
}
