import { createFileRoute } from "@tanstack/react-router";
import { decisionLogSearchSchema } from "../../../lib/decision-log";
import { DecisionLog } from "../../../screens/DecisionLog";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/decisions")({
  staticData: { crumb: "app:nav.decisions" },
  validateSearch: decisionLogSearchSchema,
  component: DecisionLogRoute,
});

function DecisionLogRoute() {
  const { workspaceId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <DecisionLog
      workspaceId={workspaceId}
      search={search}
      onSearchChange={(patch) =>
        // Opening an entry is a step Back returns from; a filter only refines the same page.
        void navigate({
          search: (previous) => ({ ...previous, ...patch }),
          replace: !("selected" in patch) || patch.selected === undefined,
        })
      }
    />
  );
}
