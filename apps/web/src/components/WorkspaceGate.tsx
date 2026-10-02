import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Outlet, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { api, call } from "../lib/api";
import { ME_KEY, useMe } from "../lib/session";
import { NoAccessState } from "./states";

/**
 * Everything under `/w/$workspaceId`. A workspace the person does not belong to shows "You don't
 * have access to this" (design-spec 6.0.6); one they do belong to becomes the last opened, so the
 * next login lands in it.
 */
export function WorkspaceGate() {
  const { workspaceId } = useParams({ from: "/_authed/_frame/w/$workspaceId" });
  const me = useMe();
  const queryClient = useQueryClient();
  const isMember = me.memberships.some((m) => m.workspace.id === workspaceId);
  const isLast = me.lastWorkspaceId === workspaceId;

  const remember = useMutation({
    mutationFn: () => call(api().api.v1.me.patch({ lastWorkspaceId: workspaceId })),
    onSuccess: (updated) => queryClient.setQueryData(ME_KEY, updated),
  });
  const { mutate } = remember;
  useEffect(() => {
    if (isMember && !isLast) mutate();
  }, [isMember, isLast, mutate]);

  return isMember ? <Outlet /> : <NoAccessState />;
}
