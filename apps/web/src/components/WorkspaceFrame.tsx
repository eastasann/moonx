import {
  AppFrame,
  type AppFrameProps,
  MenuItem,
  type NavItem,
  Panel,
  SideNav,
  TabBar,
  useMoreMenu,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Compass,
  House,
  Lightbulb,
  ScrollText,
  Settings2,
  Shield,
} from "lucide-react";
import { type ReactNode, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAutosave, useSaveState } from "../lib/autosave-react";
import {
  adminTemplatesHref,
  decisionsHref,
  notificationsHref,
  selfAnalysisHref,
  settingsHref,
} from "../lib/links";
import { commentsQuery, unreadCountQuery } from "../lib/queries";
import {
  CommentsPanelBody,
  type ScreenComments,
  screenAccepts,
} from "./CommentsPanel";
import { ModalBoundary } from "./ErrorBoundary";
import {
  HistoryPanelBody,
  historyAccepts,
  type ScreenHistory,
} from "./HistoryPanel";
import { useLogOutRequest } from "./LogOutRequest";
import { useOfflineBanner } from "./StandaloneFrame";
import { useModal, usePanel, useWorkspace } from "./workspace";

export interface WorkspaceFrameProps
  extends Pick<AppFrameProps, "breadcrumbs" | "back" | "title"> {
  /**
   * The navigation item of the screen; none for a screen whose item is not built yet.
   * `decisions`, `account`, `settings` and `admin` are opened from the More menu, so
   * their phone header reads "← More" (design-spec 6.0.1); a screen under one of them
   * (27) passes its own `back` instead.
   */
  current?:
    | "dashboard"
    | "ideas"
    | "selfAnalysis"
    | "notifications"
    | "decisions"
    | "settings"
    | "account"
    | "admin";
  /**
   * The screen's saved items, by key prefix (`idea:<id>`), or prefixes for a screen of
   * several kinds of item: "Saved" shows once one of them saved on this visit. Failures
   * and saves on their way show on every screen (design-spec 6.0.2: they go on wherever
   * the user moves).
   */
  saveScope?: string | readonly string[];
  /**
   * The screen's comments (PNL-1): the header's 💬 with its unresolved threads, and the
   * panel that `?panel=comments&target=` opens on it or on one of its items (SDD 4章).
   * None on a screen with nothing to comment on (design-spec 6.0.1).
   */
  comments?: ScreenComments;
  /**
   * The screen's history (PNL-2): the header's 🕘, and the panel that
   * `?panel=history&target=` opens on it or on one of its items (SDD 4章). None on a
   * screen without a history (design-spec 6.0.5).
   */
  history?: ScreenHistory;
  /**
   * 10, 13 and 20: "A newer template is available." with Update template, under the
   * other bands (design-spec 6.0.1・6.0.7).
   */
  templateBanner?: ReactNode;
  children: ReactNode;
}

/**
 * AppFrame for the screens of a workspace, and for 4 and 8, which stand in the one last
 * opened (design-spec 6.0.1・6.16): the workspace, the pages the user may open (Self
 * Analysis not for a Viewer, 9 for an Owner only, 26 Admin for an operator only),
 * Notifications with the unread count,
 * Account and Log out in the sidebar's account menu or in More, the header's save state
 * with its Retry, 💬 and 🕘 with their panels, and the bands: offline, then the screen's
 * newer template. Logging out with unsaved input asks first (5章「共通ナビ」). The pages
 * appear here as their screens are built (docs/claude-code-prompts.md: no way into a
 * screen before it exists).
 */
export function WorkspaceFrame({
  current,
  saveScope,
  comments,
  history,
  templateBanner,
  children,
  ...header
}: WorkspaceFrameProps) {
  const { t } = useTranslation(["app", "panels"]);
  const { me, workspace, role } = useWorkspace();
  const modal = useModal();
  const panel = usePanel();
  const moreMenu = useMoreMenu();
  const unread = useQuery(unreadCountQuery());
  const isInMore =
    header.back === undefined &&
    (current === "decisions" ||
      current === "account" ||
      current === "settings" ||
      current === "admin");
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
    // A Viewer has no tab for it (5章「Viewer」): their own opens in their personal
    // workspace.
    ...(role === "viewer"
      ? []
      : [
          {
            id: "selfAnalysis",
            label: t("app:nav.selfAnalysis"),
            icon: <Compass />,
            href: selfAnalysisHref(workspace.id),
          },
        ]),
    {
      id: "notifications",
      label: t("app:nav.notifications"),
      icon: <Bell />,
      href: notificationsHref(),
      badge: unread.data?.total ?? 0,
    },
  ];
  const decisionLog: NavItem = {
    id: "decisions",
    label: t("app:nav.decisionLog"),
    icon: <ScrollText />,
    href: decisionsHref(workspace.id),
  };
  // Only an Owner opens 9 and only an operator 26 (design-spec 2.2); the rest never see
  // the way in (1.3).
  const settings: NavItem[] =
    role === "owner"
      ? [
          {
            id: "settings",
            label: t("app:nav.workspaceSettings"),
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
  const screenTarget =
    comments === undefined
      ? undefined
      : ({ kind: "screen", screen: comments.screen } as const);
  const screenThreads = useQuery(commentsQuery(workspace.id, screenTarget));
  const openComments =
    comments !== undefined &&
    panel.open !== null &&
    panel.open.name === "comments" &&
    screenAccepts(comments, panel.open.target)
      ? panel.open.target
      : undefined;
  const historyTarget =
    history === undefined
      ? undefined
      : ({ kind: "screen", screen: history.screen } as const);
  const openHistory =
    history !== undefined &&
    panel.open !== null &&
    panel.open.name === "history" &&
    historyAccepts(history, panel.open.target)
      ? panel.open.target
      : undefined;
  const openPanel =
    openComments !== undefined && comments !== undefined
      ? {
          title: t("panels:comments.title"),
          key: `comments:${JSON.stringify(openComments)}`,
          body: <CommentsPanelBody target={openComments} comments={comments} />,
        }
      : openHistory !== undefined && history !== undefined
        ? {
            title: t("panels:history.title"),
            key: `history:${JSON.stringify(openHistory)}`,
            body: <HistoryPanelBody target={openHistory} history={history} />,
          }
        : undefined;
  // A closing drawer or tray keeps the name of the panel it held as it goes.
  const panelTitle = useRef(t("panels:comments.title"));
  if (openPanel !== undefined) panelTitle.current = openPanel.title;
  return (
    <AppFrame
      {...header}
      back={isInMore ? moreMenu.back : header.back}
      saveState={saveState}
      onRetrySave={() => autosave.retry()}
      comments={
        screenTarget === undefined
          ? undefined
          : {
              count: screenThreads.data?.unresolvedCount ?? 0,
              isOpen: openComments !== undefined,
              // The screen's list from an item's thread; pressed again, it closes.
              onPress: () =>
                openComments?.kind === "screen"
                  ? panel.close()
                  : panel.show("comments", screenTarget),
            }
      }
      history={
        historyTarget === undefined
          ? undefined
          : {
              isOpen: openHistory !== undefined,
              // The screen's changes from an item's; pressed again, it closes.
              onPress: () =>
                openHistory?.kind === "screen"
                  ? panel.close()
                  : panel.show("history", historyTarget),
            }
      }
      panel={
        comments === undefined && history === undefined ? undefined : (
          <Panel
            title={panelTitle.current}
            isOpen={openPanel !== undefined}
            onOpenChange={(isOpen) => {
              if (!isOpen) panel.close();
            }}
          >
            {openPanel !== undefined && (
              <ModalBoundary key={openPanel.key} onClose={panel.close}>
                {openPanel.body}
              </ModalBoundary>
            )}
          </Panel>
        )
      }
      sideNav={
        <SideNav
          workspaceName={workspace.name}
          onWorkspacePress={openSwitch}
          items={[...pages, decisionLog]}
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
              <MenuItem id={decisionLog.id} href={decisionLog.href}>
                {decisionLog.label}
              </MenuItem>
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
      banners={{ offline, template: templateBanner }}
    >
      {children}
      {confirmation}
    </AppFrame>
  );
}
