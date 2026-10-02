import {
  Button,
  Flex,
  Heading,
  ListDetailPattern,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  useBelowDesktop,
} from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ADMIN_TABS,
  type AdminTab,
  useAdminInvitations,
  useAdminUsers,
  useAdminWorkspaces,
} from "../lib/admin";
import { AdminTabs } from "./admin/AdminTabs";
import { InvitationDetail, InvitationsList } from "./admin/InvitationsPane";
import { ListSearch } from "./admin/ListSearch";
import { NewInvitationDialog } from "./admin/NewInvitationDialog";
import { rowsOf } from "./admin/PagedList";
import { UserDetail, UsersList } from "./admin/UsersPane";
import { WorkspaceDetail, WorkspacesList } from "./admin/WorkspacesPane";

function tabLabel(t: TFunction, tab: AdminTab): string {
  switch (tab) {
    case "users":
      return t("tabs.users");
    case "workspaces":
      return t("tabs.workspaces");
    case "invitations":
      return t("tabs.invitations");
  }
}

/**
 * Screen 28, Users & Workspaces (design-spec 6.17, pattern D): three tabs, each a list on the
 * left and the chosen row's usage and actions on the right. Below desktop one pane shows at a
 * time. The page itself is reached by operators only; the route's gate answers everyone else.
 */
export function AdminUsers({
  tab,
  onTabChange,
}: {
  tab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}) {
  const { t } = useTranslation("admin");
  const compact = useBelowDesktop();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [inviting, setInviting] = useState(false);

  const q = search || undefined;
  const users = useAdminUsers(q, tab === "users");
  const workspaces = useAdminWorkspaces(q, tab === "workspaces");
  const invitations = useAdminInvitations(tab === "invitations");

  const changeTab = (next: AdminTab) => {
    setSearch("");
    setSelectedId(undefined);
    onTabChange(next);
  };

  const user = rowsOf(users).find((row) => row.id === selectedId);
  const workspace = rowsOf(workspaces).find((row) => row.id === selectedId);
  const invitation = rowsOf(invitations).find((row) => row.id === selectedId);

  let list: ReactNode;
  let detail: ReactNode;
  let hasSelection: boolean;
  if (tab === "users") {
    hasSelection = user !== undefined;
    list = (
      <>
        <ListSearch
          label={t("users.search")}
          placeholder={t("users.searchPlaceholder")}
          clearLabel={t("users.clearSearch")}
          value={search}
          onChange={setSearch}
        />
        <UsersList
          query={users}
          searching={Boolean(q)}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </>
    );
    detail = user ? (
      <UserDetail user={user} />
    ) : (
      <Text tone="secondary">{t("users.detail.none")}</Text>
    );
  } else if (tab === "workspaces") {
    hasSelection = workspace !== undefined;
    list = (
      <>
        <ListSearch
          label={t("workspaces.search")}
          placeholder={t("workspaces.searchPlaceholder")}
          clearLabel={t("workspaces.clearSearch")}
          value={search}
          onChange={setSearch}
        />
        <WorkspacesList
          query={workspaces}
          searching={Boolean(q)}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </>
    );
    detail = workspace ? (
      <WorkspaceDetail workspace={workspace} />
    ) : (
      <Text tone="secondary">{t("workspaces.detail.none")}</Text>
    );
  } else {
    hasSelection = invitation !== undefined;
    list = (
      <InvitationsList
        query={invitations}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNew={() => setInviting(true)}
      />
    );
    detail = invitation ? (
      <InvitationDetail invitation={invitation} />
    ) : (
      <Text tone="secondary">{t("invitations.detail.none")}</Text>
    );
  }

  const showDetail = compact && hasSelection;

  return (
    <>
      <ListDetailPattern
        header={
          <Stack gap="space-200">
            <Flex justify="between" align="center" gap="space-200">
              <Heading level={1}>{t("title")}</Heading>
              {tab === "invitations" && !compact ? (
                <Button variant="accent" onPress={() => setInviting(true)}>
                  {t("invitations.new")}
                </Button>
              ) : null}
            </Flex>
            <AdminTabs current="users" />
          </Stack>
        }
        detailOpen={showDetail}
        list={
          // Tabs render their children twice (once to collect the tab list), so only the list
          // sits inside; the detail's dialogs must exist once.
          <Tabs selectedKey={tab} onSelectionChange={(key) => changeTab(key as AdminTab)}>
            <TabList aria-label={t("tabsLabel")}>
              {ADMIN_TABS.map((id) => (
                <Tab key={id} id={id}>
                  {tabLabel(t, id)}
                </Tab>
              ))}
            </TabList>
            <TabPanel id={tab}>
              <Flex direction="column" gap="space-200">
                {list}
              </Flex>
            </TabPanel>
          </Tabs>
        }
        detail={
          <>
            {showDetail ? (
              <Flex>
                <Button variant="secondary" size="S" onPress={() => setSelectedId(undefined)}>
                  {t("list.backToList")}
                </Button>
              </Flex>
            ) : null}
            {detail}
          </>
        }
        floatingAction={
          tab === "invitations" && compact ? (
            <Button
              variant="accent"
              aria-label={t("invitations.new")}
              onPress={() => setInviting(true)}
            >
              <Plus aria-hidden="true" />
            </Button>
          ) : null
        }
      />
      {inviting ? <NewInvitationDialog onClose={() => setInviting(false)} /> : null}
    </>
  );
}
