import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AdminTemplates } from "../../../screens/AdminTemplates";

const searchSchema = z.object({ kind: z.string().optional().catch(undefined) });

export const Route = createFileRoute("/_authed/_frame/admin/templates/")({
  staticData: { crumb: "admin:templates.crumb" },
  validateSearch: searchSchema,
  component: AdminTemplatesRoute,
});

function AdminTemplatesRoute() {
  const { kind } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AdminTemplates
      kind={kind}
      onKindChange={(next) => void navigate({ search: { kind: next }, replace: true })}
    />
  );
}
