import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../../components/AppShell";
import { RouteError } from "../../components/RouteError";
import { NotFoundState } from "../../components/states";

export const Route = createFileRoute("/_authed/_frame")({
  component: AppShell,
  notFoundComponent: NotFoundState,
  errorComponent: RouteError,
});
