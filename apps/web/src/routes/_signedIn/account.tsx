import { createFileRoute } from "@tanstack/react-router";
import { OutsideWorkspace } from "../../components/OutsideWorkspace";
import { AccountScreen, AccountSkeleton } from "../../screens/Account";

/** `/account`: 4 Account (SDD 4章), outside any workspace. */
export const Route = createFileRoute("/_signedIn/account")({
  staticData: { skeleton: AccountSkeleton },
  component: AccountRoute,
});

function AccountRoute() {
  return (
    <OutsideWorkspace>
      <AccountScreen />
    </OutsideWorkspace>
  );
}
