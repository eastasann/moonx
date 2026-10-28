import { pitchVariantSchema, uuidSchema } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import {
  PitchDeckRouteSkeleton,
  PitchDeckScreen,
  type PitchSearch,
} from "../../../../../../../../screens/PitchDeck";

/**
 * `/w/$workspaceId/ideas/$ideaId/plans/$planId/pitch`: 23 Pitch Deck (SDD 4章). A
 * `variant` that is neither length and a `version` that is no id are left out: the
 * one-minute deck of the plan now.
 */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/ideas/$ideaId/plans/$planId/pitch",
)({
  validateSearch: (search: Record<string, unknown>): PitchSearch => ({
    variant: pitchVariantSchema.safeParse(search.variant).data,
    version: uuidSchema.safeParse(search.version).data,
  }),
  staticData: { skeleton: PitchDeckRouteSkeleton },
  component: PitchDeckRoute,
});

function PitchDeckRoute() {
  const { ideaId, planId } = Route.useParams();
  const { modal: _, about: __, ...search } = Route.useSearch();
  return <PitchDeckScreen ideaId={ideaId} planId={planId} search={search} />;
}
