import { HubPattern, Stack, useIsNarrow } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { NoAccessState, QueryBoundary } from "../../components/states";
import { formatContainerTarget, usePanelTarget } from "../../lib/panel-target";
import { type ValidationHomeData, validationHomeQuery } from "../../lib/validation-home";
import { useHomeAccess } from "./access";
import { Checks } from "./Checks";
import { Decisions } from "./Decisions";
import { EditSummaryDialog } from "./EditSummaryDialog";
import { FauBreakdownBand } from "./FauBreakdownBand";
import { HomeHeader, RecordDecision } from "./HomeHeader";
import { HomeSkeleton } from "./HomeSkeleton";
import { KeyNumbers } from "./KeyNumbers";
import { NextSteps } from "./NextSteps";
import { Plans } from "./Plans";
import { Sections } from "./Sections";
import { Summary } from "./Summary";

function HomeContent({ data, workspaceId }: { data: ValidationHomeData; workspaceId: string }) {
  const access = useHomeAccess(data, workspaceId);
  const narrow = useIsNarrow();
  const [editing, setEditing] = useState(false);
  usePanelTarget(formatContainerTarget("idea", data.idea.id), { archived: data.idea.archived });
  // Another workspace's URL must not show the idea (SDD 4).
  if (data.idea.workspaceId !== workspaceId) return <NoAccessState />;
  return (
    <>
      <HubPattern
        header={
          <HomeHeader
            data={data}
            workspaceId={workspaceId}
            access={access}
            onEdit={() => setEditing(true)}
          />
        }
        summary={<KeyNumbers data={data} workspaceId={workspaceId} currency={access.currency} />}
        nextSteps={<NextSteps data={data} workspaceId={workspaceId} canDecide={access.canChange} />}
        status={
          <Stack gap="space-400">
            <Checks data={data} workspaceId={workspaceId} />
            <FauBreakdownBand fau={data.fau} />
          </Stack>
        }
        entries={<Sections data={data} workspaceId={workspaceId} />}
        supplement={
          <Summary
            data={data}
            workspaceId={workspaceId}
            canChange={access.canChange}
            onEdit={() => setEditing(true)}
          />
        }
        history={
          <Stack gap="space-400">
            <Decisions data={data} workspaceId={workspaceId} timeZone={access.timeZone} />
            <Plans data={data} workspaceId={workspaceId} isEditor={access.isEditor} />
          </Stack>
        }
        actions={
          narrow && access.canChange ? (
            <RecordDecision data={data} workspaceId={workspaceId} />
          ) : null
        }
      />
      {editing ? <EditSummaryDialog idea={data.idea} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

/** Screen 13, the validation home: what the idea has and what it still needs (design-spec 6.1). */
export function ValidationHome({ workspaceId, ideaId }: { workspaceId: string; ideaId: string }) {
  const query = useQuery(validationHomeQuery(ideaId));
  return (
    <QueryBoundary query={query} skeleton={<HomeSkeleton />}>
      {(data) => <HomeContent data={data} workspaceId={workspaceId} />}
    </QueryBoundary>
  );
}
