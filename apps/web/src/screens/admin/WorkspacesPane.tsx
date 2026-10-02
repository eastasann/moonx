import { formatDate } from "@moonx/i18n";
import { Badge, Flex, Heading, IllustratedMessage, Stack, Text } from "@moonx/ui-web";
import { SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminWorkspaceRow } from "../../lib/admin";
import { useMe } from "../../lib/session";
import { DetailRow, DetailRows } from "./DetailRows";
import { DirectoryTable } from "./DirectoryTable";
import { PagedList, type PagedQuery } from "./PagedList";

const ownerNames = (workspace: AdminWorkspaceRow) =>
  workspace.owners.map((owner) => owner.displayName).join(", ");

/** Screen 28, Workspaces tab: the list pane (design-spec 6.17). */
export function WorkspacesList({
  query,
  searching,
  selectedId,
  onSelect,
}: {
  query: PagedQuery<AdminWorkspaceRow>;
  searching: boolean;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation(["admin"]);
  const me = useMe();
  const columns = [
    { id: "name", label: t("admin:workspaces.columns.name"), isRowHeader: true },
    { id: "owners", label: t("admin:workspaces.columns.owners") },
    { id: "members", label: t("admin:workspaces.columns.members"), isNumeric: true },
    { id: "ideas", label: t("admin:workspaces.columns.ideas"), isNumeric: true },
    { id: "lastUsed", label: t("admin:workspaces.columns.lastUsed") },
  ];
  return (
    <PagedList query={query}>
      {(workspaces) => (
        <DirectoryTable
          label={t("admin:workspaces.listLabel")}
          columns={columns}
          selectedId={selectedId}
          onSelect={onSelect}
          emptyState={
            searching ? (
              <IllustratedMessage icon={SearchX} heading={t("admin:workspaces.noMatch")} />
            ) : undefined
          }
          rows={workspaces.map((workspace) => ({
            id: workspace.id,
            textValue: workspace.name,
            cells: {
              name: workspace.name,
              owners: ownerNames(workspace) || t("admin:none"),
              members: workspace.memberCount,
              ideas: workspace.ideaCount,
              lastUsed: workspace.lastActiveAt
                ? formatDate(workspace.lastActiveAt, me.timezone)
                : t("admin:never"),
            },
          }))}
        />
      )}
    </PagedList>
  );
}

/** Screen 28, Workspaces tab: counts and the last-used date of the chosen workspace, nothing from inside it. */
export function WorkspaceDetail({ workspace }: { workspace: AdminWorkspaceRow }) {
  const { t } = useTranslation(["admin"]);
  const me = useMe();
  return (
    <Stack gap="space-300">
      <Flex gap="space-200" align="center" wrap>
        <Heading level={2}>{workspace.name}</Heading>
        {workspace.isPersonal ? <Badge size="S">{t("admin:workspaces.personal")}</Badge> : null}
      </Flex>
      <DetailRows>
        <DetailRow label={t("admin:workspaces.columns.owners")}>
          {ownerNames(workspace) || t("admin:none")}
        </DetailRow>
        <DetailRow label={t("admin:workspaces.columns.members")}>{workspace.memberCount}</DetailRow>
        <DetailRow label={t("admin:workspaces.columns.ideas")}>{workspace.ideaCount}</DetailRow>
        <DetailRow label={t("admin:workspaces.columns.lastUsed")}>
          {workspace.lastActiveAt
            ? formatDate(workspace.lastActiveAt, me.timezone)
            : t("admin:never")}
        </DetailRow>
      </DetailRows>
      <Text variant="caption" tone="secondary">
        {t("admin:workspaces.detail.usageNote")}
      </Text>
    </Stack>
  );
}
