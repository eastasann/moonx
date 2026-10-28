import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { meQuery } from "../lib/queries";
import { ModalBoundary } from "./ErrorBoundary";
import { SwitchWorkspaceDialog } from "./SwitchWorkspaceDialog";
import { homeMembership, useModal, WorkspaceContext } from "./workspace";

/**
 * A screen that belongs to no workspace (4 Account, 26–28 Admin): the navigation stands
 * in the one the user last opened, as 5 would open it (design-spec 6.16 4), and M7
 * switches from here too.
 */
export function OutsideWorkspace({ children }: { children: ReactNode }) {
  const { modal } = useSearch({ strict: false });
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
      {children}
      {modal === "switch-workspace" && (
        <ModalBoundary key={modal} onClose={modals.close}>
          <SwitchWorkspaceDialog onClose={modals.close} />
        </ModalBoundary>
      )}
    </WorkspaceContext.Provider>
  );
}
