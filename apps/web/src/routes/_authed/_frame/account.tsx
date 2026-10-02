import { createFileRoute } from "@tanstack/react-router";
import { Account } from "../../../screens/Account";

export const Route = createFileRoute("/_authed/_frame/account")({
  staticData: { crumb: "app:nav.account" },
  component: Account,
});
