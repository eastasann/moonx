import { createFileRoute } from "@tanstack/react-router";
import { OutsideWorkspace } from "../../../components/OutsideWorkspace";
import type { AdminUsersTab } from "../../../lib/links";
import {
  AdminUsersScreen,
  type AdminUsersSearch,
  AdminUsersSkeleton,
} from "../../../screens/AdminUsers";

const TABS: readonly AdminUsersTab[] = ["users", "workspaces", "invitations"];

/** `/admin/users`: 28 Admin: Users & Workspaces (SDD 4章). A tab it cannot read is left out. */
export const Route = createFileRoute("/_signedIn/admin/users")({
  validateSearch: (search: Record<string, unknown>): AdminUsersSearch => ({
    tab: TABS.find((tab) => tab === search.tab),
  }),
  staticData: { skeleton: AdminUsersSkeleton },
  component: AdminUsersRoute,
});

function AdminUsersRoute() {
  const { modal: _, ...search } = Route.useSearch();
  return (
    <OutsideWorkspace>
      <AdminUsersScreen search={search} />
    </OutsideWorkspace>
  );
}
