import { createFileRoute } from "@tanstack/react-router";
import { OutsideWorkspace } from "../../../../components/OutsideWorkspace";
import {
  TemplateVersionScreen,
  type TemplateVersionSearch,
  TemplateVersionSkeleton,
} from "../../../../screens/TemplateVersion";

/**
 * `/admin/templates/versions/$versionId`: 27 Admin: Edit Template (SDD 4章). `node` is
 * kept as given; one the version does not hold selects nothing.
 */
export const Route = createFileRoute(
  "/_signedIn/admin/templates/versions/$versionId",
)({
  validateSearch: (search: Record<string, unknown>): TemplateVersionSearch => ({
    node:
      typeof search.node === "string" && search.node !== ""
        ? search.node
        : undefined,
  }),
  staticData: { skeleton: TemplateVersionSkeleton },
  component: TemplateVersionRoute,
});

function TemplateVersionRoute() {
  const { versionId } = Route.useParams();
  const { modal: _, ...search } = Route.useSearch();
  return (
    <OutsideWorkspace>
      <TemplateVersionScreen versionId={versionId} search={search} />
    </OutsideWorkspace>
  );
}
