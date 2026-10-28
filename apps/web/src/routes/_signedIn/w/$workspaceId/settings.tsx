import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceSettingsScreen } from "../../../../screens/WorkspaceSettings";
import { WorkspaceSettingsSkeleton } from "../../../../screens/WorkspaceSettingsSkeleton";

/** `/w/$workspaceId/settings`: 9 Workspace Settings (SDD 4章), for its Owners. */
export const Route = createFileRoute("/_signedIn/w/$workspaceId/settings")({
  staticData: { skeleton: WorkspaceSettingsSkeleton },
  component: WorkspaceSettingsScreen,
});
