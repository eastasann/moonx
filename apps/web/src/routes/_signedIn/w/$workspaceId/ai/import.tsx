import { templateKindSchema, uuidSchema } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import { searchText } from "../../../../../lib/ai";
import {
  AiImportScreen,
  type AiImportSearch,
  AiImportSkeleton,
} from "../../../../../screens/AiImport";

/**
 * `/w/$workspaceId/ai/import`: 25 Import from AI (SDD 4章). Values it cannot read are left
 * out.
 */
export const Route = createFileRoute("/_signedIn/w/$workspaceId/ai/import")({
  validateSearch: (search: Record<string, unknown>): AiImportSearch => ({
    target: templateKindSchema.safeParse(search.target).data,
    id: uuidSchema.safeParse(search.id).data,
    scope: searchText(search.scope),
    returnTo: searchText(search.returnTo),
  }),
  staticData: { skeleton: AiImportSkeleton },
  component: AiImportRoute,
});

function AiImportRoute() {
  const { modal, about, ...search } = Route.useSearch();
  return <AiImportScreen search={search} modal={modal} about={about} />;
}
