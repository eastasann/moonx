import {
  sourceTypeSchema,
  supportsCheckSchema,
  uuidSchema,
} from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import {
  ResearchLogScreen,
  ResearchLogSkeleton,
  type ResearchSearch,
} from "../../../../../../screens/ResearchLog";

/**
 * `presetSupports`: the checks, comma-separated as links write them, or the list a search
 * read before holds (the router validates it again as it builds the location); any other
 * value names none.
 */
const presetOf = (value: unknown) => {
  const parts =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value)
        ? value
        : undefined;
  if (parts === undefined) return undefined;
  const checks = parts.map((part) => supportsCheckSchema.safeParse(part));
  return checks.every((check) => check.success)
    ? [...new Set(checks.map((check) => check.data))]
    : undefined;
};

/**
 * `/w/$workspaceId/ideas/$ideaId/research`: 14 Research log (SDD 4章). Values it cannot
 * read are left out.
 */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/ideas/$ideaId/research",
)({
  validateSearch: (search: Record<string, unknown>): ResearchSearch => ({
    supports: supportsCheckSchema.safeParse(search.supports).data,
    source: sourceTypeSchema.safeParse(search.source).data,
    entry: uuidSchema.safeParse(search.entry).data,
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
    presetSupports: presetOf(search.presetSupports),
  }),
  staticData: { skeleton: ResearchLogSkeleton },
  component: ResearchLogRoute,
});

function ResearchLogRoute() {
  const { ideaId } = Route.useParams();
  const { modal: _, about: __, ...search } = Route.useSearch();
  return <ResearchLogScreen ideaId={ideaId} search={search} />;
}
