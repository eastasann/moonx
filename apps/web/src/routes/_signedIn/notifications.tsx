import { createFileRoute } from "@tanstack/react-router";
import { OutsideWorkspace } from "../../components/OutsideWorkspace";
import {
  NotificationsScreen,
  type NotificationsSearch,
  NotificationsSkeleton,
} from "../../screens/Notifications";

/**
 * `/notifications`: 8 Notifications (SDD 4章), across the workspaces. `filter` other than
 * `unread` is All.
 */
export const Route = createFileRoute("/_signedIn/notifications")({
  validateSearch: (search: Record<string, unknown>): NotificationsSearch =>
    search.filter === "unread" ? { filter: "unread" } : {},
  staticData: { skeleton: NotificationsSkeleton },
  component: NotificationsRoute,
});

function NotificationsRoute() {
  const search = Route.useSearch();
  return (
    <OutsideWorkspace>
      <NotificationsScreen
        search={search.filter === "unread" ? { filter: "unread" } : {}}
      />
    </OutsideWorkspace>
  );
}
