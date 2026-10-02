import type { PitchVariant } from "@moonx/schemas";
import { PresentationPattern, Skeleton, Stack } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { NoAccessState, QueryBoundary } from "../components/states";
import { canEditIdeas, useWorkspaceCurrency, useWorkspaceRole } from "../lib/ideas";
import {
  type PitchSearch,
  type PlanHome,
  pitchDeckQuery,
  planHomeQuery,
  planPaths,
} from "../lib/plans";
import { DeckSlides } from "./pitch/DeckSlides";
import { PitchHeader } from "./pitch/PitchHeader";
import { Thumbnails } from "./pitch/Thumbnails";

function DeckSkeleton() {
  return (
    <Stack gap="space-400">
      {[0, 1, 2].map((n) => (
        <Skeleton key={n} shape="block" height="space-1000" />
      ))}
    </Stack>
  );
}

function PitchContent({
  home,
  workspaceId,
  ideaId,
  planId,
  variant,
  versionId,
  onSearchChange,
}: {
  home: PlanHome;
  workspaceId: string;
  ideaId: string;
  planId: string;
  variant: PitchVariant;
  versionId: string | undefined;
  onSearchChange: (patch: Partial<PitchSearch>) => void;
}) {
  const deck = useQuery(pitchDeckQuery(planId, variant, versionId));
  const role = useWorkspaceRole(workspaceId);
  const currency = useWorkspaceCurrency(workspaceId);
  const canEdit = canEditIdeas(role) && !versionId && !home.archived && !home.ideaArchived;
  return (
    <PresentationPattern
      header={
        <PitchHeader
          home={home}
          planId={planId}
          variant={variant}
          versionId={versionId}
          backHref={planPaths(workspaceId, ideaId, planId).home}
          onVariantChange={(next) => onSearchChange({ variant: next })}
          onVersionChange={(next) => onSearchChange({ version: next })}
        />
      }
      thumbnails={deck.data ? <Thumbnails deck={deck.data} /> : null}
    >
      <QueryBoundary query={deck} skeleton={<DeckSkeleton />}>
        {(data) => (
          <DeckSlides
            deck={data}
            workspaceId={workspaceId}
            ideaId={ideaId}
            planId={planId}
            currency={currency}
            canEdit={canEdit}
          />
        )}
      </QueryBoundary>
    </PresentationPattern>
  );
}

/** Screen 23, the Pitch Deck: the slides generated from the plan, and the PDF (design-spec 6.14). */
export function PitchDeckScreen({
  workspaceId,
  ideaId,
  planId,
  variant,
  versionId,
  onSearchChange,
}: {
  workspaceId: string;
  ideaId: string;
  planId: string;
  variant: PitchVariant;
  versionId?: string;
  onSearchChange: (patch: Partial<PitchSearch>) => void;
}) {
  const home = useQuery(planHomeQuery(planId));
  return (
    <QueryBoundary
      query={home}
      skeleton={
        <PresentationPattern thumbnails={null}>
          <DeckSkeleton />
        </PresentationPattern>
      }
    >
      {(data) =>
        // Another workspace's URL must not show the plan (SDD 4).
        data.workspaceId !== workspaceId || data.ideaId !== ideaId ? (
          <NoAccessState />
        ) : (
          <PitchContent
            home={data}
            workspaceId={workspaceId}
            ideaId={ideaId}
            planId={planId}
            variant={variant}
            versionId={versionId}
            onSearchChange={onSearchChange}
          />
        )
      }
    </QueryBoundary>
  );
}
