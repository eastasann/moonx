import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ADMIN_SEARCH_DEFAULTS, adminSearchSchema } from "../../../lib/admin";
import { AdminUsers } from "../../../screens/AdminUsers";

export const Route = createFileRoute("/_authed/_frame/admin/users")({
  staticData: { crumb: "admin:title" },
  validateSearch: adminSearchSchema,
  search: { middlewares: [stripSearchParams(ADMIN_SEARCH_DEFAULTS)] },
  component: AdminUsersRoute,
});

function AdminUsersRoute() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AdminUsers
      tab={tab}
      onTabChange={(next) =>
        void navigate({ search: (previous) => ({ ...previous, tab: next }), replace: true })
      }
    />
  );
}
