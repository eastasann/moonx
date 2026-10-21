import { templateKindSchema } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { OutsideWorkspace } from "../../../../components/OutsideWorkspace";
import {
  AdminTemplatesScreen,
  type AdminTemplatesSearch,
  AdminTemplatesSkeleton,
} from "../../../../screens/AdminTemplates";

/** `/admin/templates`: 26 Admin: Templates (SDD 4章). A kind it cannot read is left out. */
export const Route = createFileRoute("/_signedIn/admin/templates/")({
  validateSearch: (search: Record<string, unknown>): AdminTemplatesSearch => ({
    kind: templateKindSchema.safeParse(search.kind).data,
  }),
  staticData: { skeleton: AdminTemplatesSkeleton },
  component: AdminTemplatesRoute,
});

function AdminTemplatesRoute() {
  const { modal: _, ...search } = Route.useSearch();
  return (
    <OutsideWorkspace>
      <AdminTemplatesScreen search={search} />
    </OutsideWorkspace>
  );
}
