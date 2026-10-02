import { Outlet } from "@tanstack/react-router";
import { useMe } from "../lib/session";
import { NoAccessState } from "./states";

/**
 * Everything under `/admin` is for operators. Anyone else sees "You don't have access to this"
 * (design-spec 6.0.6), the same answer the API gives them (403 FORBIDDEN).
 */
export function AdminGate() {
  return useMe().isAdmin ? <Outlet /> : <NoAccessState />;
}
