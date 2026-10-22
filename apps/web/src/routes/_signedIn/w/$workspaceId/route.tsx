import type { Me } from "@moonx/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { ModalBoundary } from "../../../../components/ErrorBoundary";
import { CreationUndoProvider } from "../../../../components/ideaActions";
import { PendingScreen } from "../../../../components/PendingScreen";
import { SwitchWorkspaceDialog } from "../../../../components/SwitchWorkspaceDialog";
import {
  NoAccessState,
  NotFoundState,
  reportOnce,
  StatePage,
} from "../../../../components/states";
import {
  dashboardHref,
  useModal,
  WorkspaceContext,
} from "../../../../components/workspace";
import { ApiError, api, unwrap } from "../../../../lib/api";
import { meQuery } from "../../../../lib/queries";
import { isTransient } from "../../../../lib/query";

const isMemberOf = (me: Me, workspaceId: string) =>
  me.memberships.some(({ workspace }) => workspace.id === workspaceId);

/**
 * `/w/$workspaceId`: the screens of one workspace (SDD 4章). The frame comes from the
 * user's membership, so the navigation stays usable whatever a screen's data does. Another
 * workspace's URL shows "You don't have access to this", one that does not exist "Not
 * found" (6.0.6): only the API can tell them apart.
 */
export const Route = createFileRoute("/_signedIn/w/$workspaceId")({
  loader: async ({ context: { queryClient }, params: { workspaceId } }) => {
    if (isMemberOf(await queryClient.ensureQueryData(meQuery()), workspaceId)) {
      return { verdict: "member" as const };
    }
    // A membership made since `me` was read (an invitation accepted in another tab).
    const fresh = await queryClient.fetchQuery({ ...meQuery(), staleTime: 0 });
    if (isMemberOf(fresh, workspaceId)) return { verdict: "member" as const };
    // Through the cache, so a lost session leaves for the sign-in screen like any query.
    try {
      await queryClient.fetchQuery({
        queryKey: ["workspaces", workspaceId],
        queryFn: () => unwrap(api().api.v1.workspaces({ workspaceId }).get()),
        retry: false,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        return { verdict: "noAccess" as const };
      }
      if (error instanceof ApiError && error.status === 404) {
        return { verdict: "notFound" as const };
      }
      throw error;
    }
    // Readable after all: a membership made between the two reads.
    await queryClient.fetchQuery({ ...meQuery(), staleTime: 0 });
    return { verdict: "member" as const };
  },
  pendingComponent: PendingScreen,
  component: WorkspaceLayout,
});

/**
 * Records the workspace as the one last opened (U2), where the next sign-in lands
 * (design-spec 5章「ログイン後」). Nothing on screen waits for it: if it fails, the
 * previous one stays and the next visit writes it again. The API reports its own 5xx;
 * a failure of the Web's code goes to Sentry.
 */
function useRecordLastWorkspace(me: Me, workspaceId: string | null) {
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: (lastWorkspaceId: string) =>
      unwrap(api().api.v1.me.patch({ lastWorkspaceId })),
    retry: (failures, error) => failures < 2 && isTransient(error),
    // Only the workspace: a save of 4 may answer after this, and its fields stay.
    onSuccess: ({ lastWorkspaceId }) =>
      queryClient.setQueryData(meQuery().queryKey, (me: Me | undefined) =>
        me === undefined ? me : { ...me, lastWorkspaceId },
      ),
    onError: (error) => {
      if (!(error instanceof ApiError)) reportOnce(error);
    },
  });
  const last = me.lastWorkspaceId;
  useEffect(() => {
    if (workspaceId !== null && workspaceId !== last) mutate(workspaceId);
  }, [workspaceId, last, mutate]);
}

function WorkspaceLayout() {
  const { workspaceId } = Route.useParams();
  const { verdict } = Route.useLoaderData();
  const { modal } = Route.useSearch();
  const modals = useModal();
  // Present from the parent's load; gone only while a lost session leaves the page.
  const { data: me } = useQuery(meQuery());
  if (me === undefined) return null;
  return (
    <WorkspaceRoutes
      me={me}
      workspaceId={workspaceId}
      verdict={verdict}
      modal={modal}
      onCloseModal={modals.close}
    />
  );
}

function WorkspaceRoutes({
  me,
  workspaceId,
  verdict,
  modal,
  onCloseModal,
}: {
  me: Me;
  workspaceId: string;
  verdict: "member" | "noAccess" | "notFound";
  modal: string | undefined;
  onCloseModal: () => void;
}) {
  const membership = me.memberships.find(
    ({ workspace }) => workspace.id === workspaceId,
  );
  useRecordLastWorkspace(me, membership === undefined ? null : workspaceId);
  if (membership === undefined) {
    const href = dashboardHref(me);
    return (
      <StatePage>
        {verdict === "notFound" ? (
          <NotFoundState dashboardHref={href} />
        ) : (
          <NoAccessState dashboardHref={href} />
        )}
      </StatePage>
    );
  }
  return (
    <WorkspaceContext.Provider
      value={{ me, workspace: membership.workspace, role: membership.role }}
    >
      <CreationUndoProvider>
        <Outlet />
      </CreationUndoProvider>
      {modal === "switch-workspace" && (
        <ModalBoundary key={modal} onClose={onCloseModal}>
          <SwitchWorkspaceDialog onClose={onCloseModal} />
        </ModalBoundary>
      )}
    </WorkspaceContext.Provider>
  );
}
