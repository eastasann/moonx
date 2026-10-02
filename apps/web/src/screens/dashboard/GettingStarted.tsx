import { Button, Link, RowList, RowListItem, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { canEditIdeas, useWorkspaceRole } from "../../lib/ideas";
import { useOverlay } from "../../lib/overlay";

/**
 * The first screen of a workspace with no ideas: the three steps of design-spec 6.9. Each step
 * shows only for a role that can take it; a Viewer reads a sentence and has nothing to start.
 */
export function GettingStarted({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation("dashboard");
  const role = useWorkspaceRole(workspaceId);
  const { openModal } = useOverlay();
  const editable = canEditIdeas(role);
  if (!editable) return <Text tone="secondary">{t("gettingStarted.viewerBody")}</Text>;
  return (
    <Stack gap="space-100">
      <Text variant="label">{t("gettingStarted.title")}</Text>
      <Text tone="secondary">{t("gettingStarted.body")}</Text>
      <RowList ordered aria-label={t("gettingStarted.listLabel")}>
        <RowListItem>
          <Link href={`/w/${workspaceId}/self-analysis`}>{t("gettingStarted.selfAnalysis")}</Link>
        </RowListItem>
        {role === "owner" ? (
          <RowListItem>
            <Link href={`/w/${workspaceId}/settings`}>{t("gettingStarted.invite")}</Link>
          </RowListItem>
        ) : null}
        <RowListItem>
          <Button variant="accent" onPress={() => openModal("new-idea")}>
            {t("gettingStarted.idea")}
          </Button>
        </RowListItem>
      </RowList>
    </Stack>
  );
}
