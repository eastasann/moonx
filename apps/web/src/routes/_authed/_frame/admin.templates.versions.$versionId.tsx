import { createFileRoute } from "@tanstack/react-router";
import { templateEditSearchSchema } from "../../../lib/admin-templates";
import { AdminTemplateEdit } from "../../../screens/AdminTemplateEdit";

export const Route = createFileRoute("/_authed/_frame/admin/templates/versions/$versionId")({
  staticData: { crumb: "admin:edit.crumb" },
  validateSearch: templateEditSearchSchema,
  component: AdminTemplateEditRoute,
});

function AdminTemplateEditRoute() {
  const { versionId } = Route.useParams();
  const { node } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AdminTemplateEdit
      versionId={versionId}
      node={node}
      onNodeChange={(next) => void navigate({ search: { node: next }, replace: true })}
    />
  );
}
