import { createFileRoute } from "@tanstack/react-router";
import { AdminGate } from "../../../components/AdminGate";

/** The operator's branch: every screen under `/admin` sits behind this gate. */
export const Route = createFileRoute("/_authed/_frame/admin")({
  component: AdminGate,
});
