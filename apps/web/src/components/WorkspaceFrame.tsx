import {
  AlertDialog,
  AppFrame,
  type AppFrameProps,
  MenuItem,
  type NavItem,
  SideNav,
  TabBar,
} from "@moonx/ui-web";
import { House, Lightbulb } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAutosave, useSaveState } from "../lib/autosave-react";
import { useLogOut } from "./logOut";
import { useOfflineBanner } from "./StandaloneFrame";
import { useModal, useWorkspace } from "./workspace";

export interface WorkspaceFrameProps
  extends Pick<AppFrameProps, "breadcrumbs" | "back" | "title"> {
  /** The navigation item of the screen; none for a screen whose item is not built yet. */
  current?: "dashboard" | "ideas";
  /**
   * The screen's saved items, by key prefix (`idea:<id>`), or prefixes for a screen of
   * several kinds of item: "Saved" shows once one of them saved on this visit. Failures
   * and saves on their way show on every screen (design-spec 6.0.2: they go on wherever
   * the user moves).
   */
  saveScope?: string | readonly string[];
  children: ReactNode;
}

/**
 * AppFrame for the screens of a workspace (design-spec 6.0.1): the workspace, the pages
 * the user may open and the account in the sidebar or the TabBar, the header's save state
 * with its Retry, and the offline band. Logging out with unsaved input asks first
 * (5章「共通ナビ」). The pages appear here as their screens are built
 * (docs/claude-code-prompts.md: no way into a screen before it exists).
 */
export function WorkspaceFrame({
  current,
  saveScope,
  children,
  ...header
}: WorkspaceFrameProps) {
  const { t } = useTranslation(["app"]);
  const { me, workspace } = useWorkspace();
  const modal = useModal();
  const offline = useOfflineBanner();
  const autosave = useAutosave();
  const saveState = useSaveState(saveScope);
  const logOut = useLogOut();
  const [isConfirmingLogOut, setConfirmingLogOut] = useState(false);
  const requestLogOut = () => {
    if (autosave.hasUnsaved()) setConfirmingLogOut(true);
    else logOut();
  };
  const openSwitch = () => modal.open("switch-workspace");
  const pages: NavItem[] = [
    {
      id: "dashboard",
      label: t("app:nav.dashboard"),
      icon: <House />,
      href: `/w/${workspace.id}`,
    },
    {
      id: "ideas",
      label: t("app:nav.ideas"),
      icon: <Lightbulb />,
      href: `/w/${workspace.id}/ideas`,
    },
  ];
  return (
    <AppFrame
      {...header}
      saveState={saveState}
      onRetrySave={() => autosave.retry()}
      sideNav={
        <SideNav
          workspaceName={workspace.name}
          onWorkspacePress={openSwitch}
          items={pages}
          currentId={current}
          user={{ name: me.displayName, avatarSrc: me.avatarUrl }}
          userMenu={
            <MenuItem id="log-out" onAction={requestLogOut}>
              {t("app:nav.logOut")}
            </MenuItem>
          }
        />
      }
      tabBar={
        <TabBar
          items={pages}
          currentId={current}
          more={
            <>
              <MenuItem id="switch-workspace" onAction={openSwitch}>
                {t("app:nav.switchWorkspace")}
              </MenuItem>
              <MenuItem id="log-out" onAction={requestLogOut}>
                {t("app:nav.logOut")}
              </MenuItem>
            </>
          }
        />
      }
      banners={offline === undefined ? undefined : { offline }}
    >
      {children}
      {isConfirmingLogOut && (
        <AlertDialog
          isOpen
          variant="warning"
          size="S"
          title={t("app:unsaved.logOutTitle")}
          primaryActionLabel={t("app:nav.logOut")}
          cancelLabel={t("app:unsaved.cancel")}
          onPrimaryAction={() => {
            setConfirmingLogOut(false);
            logOut();
          }}
          onCancel={() => setConfirmingLogOut(false)}
        >
          {t("app:unsaved.message")}
        </AlertDialog>
      )}
    </AppFrame>
  );
}
