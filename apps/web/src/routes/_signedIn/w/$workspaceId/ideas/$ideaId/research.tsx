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
 * `presetSupports`: the checks, comma-separated (SDD 4章); any other value names none.
 */
const presetOf = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const parts = value.split(",");
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
  validateSearch: (
    search: Record<string, unknown>,
  ): Omit<ResearchSearch, "presetSupports"> & { presetSupports?: string } => ({
    supports: supportsCheckSchema.safeParse(search.supports).data,
    source: sourceTypeSchema.safeParse(search.source).data,
    entry: uuidSchema.safeParse(search.entry).data,
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
    // Kept as the comma-separated text: the router writes the validated search back to
    // the address, and would write a list there as JSON.
    presetSupports: presetOf(search.presetSupports)?.join(","),
  }),
  staticData: { skeleton: ResearchLogSkeleton },
  component: ResearchLogRoute,
});

function ResearchLogRoute() {
  const { ideaId } = Route.useParams();
  const { modal: _, about: __, presetSupports, ...search } = Route.useSearch();
  return (
    <ResearchLogScreen
      ideaId={ideaId}
      search={{ ...search, presetSupports: presetOf(presetSupports) }}
    />
  );
}
