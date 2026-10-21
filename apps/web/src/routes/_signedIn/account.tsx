import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ModalBoundary } from "../../components/ErrorBoundary";
import { SwitchWorkspaceDialog } from "../../components/SwitchWorkspaceDialog";
import {
  homeMembership,
  useModal,
  WorkspaceContext,
} from "../../components/workspace";
import { meQuery } from "../../lib/queries";
import { AccountScreen, AccountSkeleton } from "../../screens/Account";

/**
 * `/account`: 4 Account (SDD 4章). It belongs to no workspace, so the navigation stands
 * in the one the user last opened, as 5 would open it (design-spec 6.16 4), and M7
 * switches from here too.
 */
export const Route = createFileRoute("/_signedIn/account")({
  staticData: { skeleton: AccountSkeleton },
  component: AccountRoute,
});

function AccountRoute() {
  const { modal } = Route.useSearch();
  const modals = useModal();
  // Present from the parent's load; gone only while a lost session leaves the page.
  const { data: me } = useQuery(meQuery());
  if (me === undefined) return null;
  const home = homeMembership(me);
  if (home === undefined) {
    // Every account has its personal workspace from sign-up on (SDD 5.4「登録の後」).
    throw new Error("The signed-in user belongs to no workspace");
  }
  return (
    <WorkspaceContext.Provider
      value={{ me, workspace: home.workspace, role: home.role }}
    >
      <AccountScreen />
      {modal === "switch-workspace" && (
        <ModalBoundary key={modal} onClose={modals.close}>
          <SwitchWorkspaceDialog onClose={modals.close} />
        </ModalBoundary>
      )}
    </WorkspaceContext.Provider>
  );
}
