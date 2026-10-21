import {
  AppFrame,
  type AppFrameProps,
  MenuItem,
  type NavItem,
  SideNav,
  TabBar,
  useMoreMenu,
} from "@moonx/ui-web";
import { House, Lightbulb, Settings2, Shield } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAutosave, useSaveState } from "../lib/autosave-react";
import { adminTemplatesHref, settingsHref } from "../lib/links";
import { useLogOutRequest } from "./LogOutRequest";
import { useOfflineBanner } from "./StandaloneFrame";
import { useModal, useWorkspace } from "./workspace";

export interface WorkspaceFrameProps
  extends Pick<AppFrameProps, "breadcrumbs" | "back" | "title"> {
  /**
   * The navigation item of the screen; none for a screen whose item is not built yet.
   * `account`, `settings` and `admin` are opened from the More menu, so their phone
   * header reads "← More" (design-spec 6.0.1); a screen under one of them (27) passes its
   * own `back` instead.
   */
  current?: "dashboard" | "ideas" | "settings" | "account" | "admin";
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
 * AppFrame for the screens of a workspace, and for 4, which stands in the one last
 * opened (design-spec 6.0.1・6.16): the workspace, the pages the user may open (9 for an
 * Owner only, 26 Admin for an operator only), Account and Log out in the sidebar's account menu or in More, the
 * header's save state with its Retry, and the offline band. Logging out with unsaved
 * input asks first (5章「共通ナビ」). The pages appear here as their screens are built
 * (docs/claude-code-prompts.md: no way into a screen before it exists).
 */
export function WorkspaceFrame({
  current,
  saveScope,
  children,
  ...header
}: WorkspaceFrameProps) {
  const { t } = useTranslation(["app"]);
  const { me, workspace, role } = useWorkspace();
  const modal = useModal();
  const moreMenu = useMoreMenu();
  const isInMore =
    header.back === undefined &&
    (current === "account" || current === "settings" || current === "admin");
  const offline = useOfflineBanner();
  const autosave = useAutosave();
  const saveState = useSaveState(saveScope);
  const { requestLogOut, confirmation } = useLogOutRequest();
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
  // Only an Owner opens 9 and only an operator 26 (design-spec 2.2); the rest never see
  // the way in (1.3).
  const settings: NavItem[] =
    role === "owner"
      ? [
          {
            id: "settings",
            label: t("app:nav.settings"),
            icon: <Settings2 />,
            href: settingsHref(workspace.id),
          },
        ]
      : [];
  const admin: NavItem[] = me.isAdmin
    ? [
        {
          id: "admin",
          label: t("app:nav.admin"),
          icon: <Shield />,
          href: adminTemplatesHref(),
        },
      ]
    : [];
  return (
    <AppFrame
      {...header}
      back={isInMore ? moreMenu.back : header.back}
      saveState={saveState}
      onRetrySave={() => autosave.retry()}
      sideNav={
        <SideNav
          workspaceName={workspace.name}
          onWorkspacePress={openSwitch}
          items={pages}
          secondaryItems={[...settings, ...admin]}
          currentId={current}
          user={{ name: me.displayName, avatarSrc: me.avatarUrl }}
          userMenu={
            <>
              <MenuItem id="account" href="/account">
                {t("app:nav.account")}
              </MenuItem>
              <MenuItem id="log-out" onAction={requestLogOut}>
                {t("app:nav.logOut")}
              </MenuItem>
            </>
          }
        />
      }
      tabBar={
        <TabBar
          items={pages}
          currentId={current}
          moreMenu={isInMore ? moreMenu.tabBar : undefined}
          more={
            <>
              <MenuItem id="switch-workspace" onAction={openSwitch}>
                {t("app:nav.switchWorkspace")}
              </MenuItem>
              <MenuItem id="account" href="/account">
                {t("app:nav.account")}
              </MenuItem>
              {settings.map((item) => (
                <MenuItem key={item.id} id={item.id} href={item.href}>
                  {t("app:nav.workspaceSettings")}
                </MenuItem>
              ))}
              {admin.map((item) => (
                <MenuItem key={item.id} id={item.id} href={item.href}>
                  {item.label}
                </MenuItem>
              ))}
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
      {confirmation}
    </AppFrame>
  );
}
