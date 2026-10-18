import {
  AlertBanner,
  AppFrame,
  type AppFrameProps,
  MenuItem,
  type NavItem,
  SideNav,
  TabBar,
} from "@moonx/ui-web";
import { House } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useIsOnline } from "../lib/online";
import { useModal, useWorkspace } from "./workspace";

export interface WorkspaceFrameProps
  extends Pick<AppFrameProps, "breadcrumbs" | "back" | "title"> {
  /** The navigation item of the screen. */
  current: "dashboard";
  children: ReactNode;
}

/**
 * AppFrame for the screens of a workspace (design-spec 6.0.1): the workspace, the pages
 * the user may open and the account in the sidebar or the TabBar, and the offline band.
 * The pages appear here as their screens are built (docs/claude-code-prompts.md: no way
 * into a screen before it exists).
 */
export function WorkspaceFrame({
  current,
  children,
  ...header
}: WorkspaceFrameProps) {
  const { t } = useTranslation(["app"]);
  const { me, workspace } = useWorkspace();
  const modal = useModal();
  const isOnline = useIsOnline();
  const openSwitch = () => modal.open("switch-workspace");
  const pages: NavItem[] = [
    {
      id: "dashboard",
      label: t("app:nav.dashboard"),
      icon: <House />,
      href: `/w/${workspace.id}`,
    },
  ];
  return (
    <AppFrame
      {...header}
      sideNav={
        <SideNav
          workspaceName={workspace.name}
          onWorkspacePress={openSwitch}
          items={pages}
          currentId={current}
          user={{ name: me.displayName, avatarSrc: me.avatarUrl }}
        />
      }
      tabBar={
        <TabBar
          items={pages}
          currentId={current}
          more={
            <MenuItem id="switch-workspace" onAction={openSwitch}>
              {t("app:nav.switchWorkspace")}
            </MenuItem>
          }
        />
      }
      banners={
        isOnline
          ? undefined
          : {
              offline: (
                <AlertBanner variant="notice">
                  {t("app:state.offline")}
                </AlertBanner>
              ),
            }
      }
    >
      {children}
    </AppFrame>
  );
}
