import { createFileRoute } from "@tanstack/react-router";
import { notificationsSearchSchema } from "../../../lib/notifications";
import { Notifications } from "../../../screens/Notifications";

export const Route = createFileRoute("/_authed/_frame/notifications")({
  staticData: { crumb: "app:nav.notifications" },
  validateSearch: notificationsSearchSchema,
  component: NotificationsRoute,
});

function NotificationsRoute() {
  const { filter } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Notifications
      filter={filter}
      onFilterChange={(next) =>
        void navigate({ search: (previous) => ({ ...previous, filter: next }), replace: true })
      }
    />
  );
}
