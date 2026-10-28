import { templateKindSchema, uuidSchema } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { searchText } from "../../../../../lib/ai";
import {
  AiExportScreen,
  type AiExportSearch,
  AiExportSkeleton,
} from "../../../../../screens/AiExport";

/**
 * `/w/$workspaceId/ai/export`: 24 Export for AI (SDD 4章). Values it cannot read are left
 * out.
 */
export const Route = createFileRoute("/_signedIn/w/$workspaceId/ai/export")({
  validateSearch: (search: Record<string, unknown>): AiExportSearch => ({
    source: templateKindSchema.safeParse(search.source).data,
    id: uuidSchema.safeParse(search.id).data,
    scope: searchText(search.scope),
    returnTo: searchText(search.returnTo),
  }),
  staticData: { skeleton: AiExportSkeleton },
  component: AiExportRoute,
});

function AiExportRoute() {
  const { modal: _, about: __, ...search } = Route.useSearch();
  return <AiExportScreen search={search} />;
}
