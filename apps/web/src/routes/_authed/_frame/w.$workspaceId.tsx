import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceGate } from "../../../components/WorkspaceGate";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId")({
  component: WorkspaceGate,
});
