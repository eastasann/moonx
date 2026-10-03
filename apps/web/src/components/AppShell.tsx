import { formatCount } from "@moonx/i18n";
import {
  ActionButton,
  AppFrame,
  Avatar,
  Badge,
  Breadcrumb,
  Breadcrumbs,
  Button,
  Dialog,
  Flex,
  Link,
  Menu,
  MenuItem,
  SideNav,
  type SideNavItem,
  Stack,
  TabBar,
  type TabBarItem,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation, useMatches, useParams } from "@tanstack/react-router";
import {
  Bell,
  Ellipsis,
  LayoutDashboard,
  Lightbulb,
  type LucideIcon,
  ScrollText,
  Settings,
  ShieldCheck,
  UserSearch,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { crumbsOf } from "../lib/crumbs";
import { useLogout } from "../lib/logout";
import { type NavEntry, type NavId, navigation } from "../lib/navigation";
import { unreadCountQuery } from "../lib/notifications";
import { useOverlay } from "../lib/overlay";
import { PanelTargetProvider } from "../lib/panel-target";
import { homePath, useMe } from "../lib/session";
import { AutosaveRuntime } from "./AutosaveRuntime";
import { ErrorBoundary } from "./ErrorBoundary";
import { ModalHost } from "./ModalHost";
import { OfflineNotice } from "./OfflineNotice";
import { PanelEntries } from "./PanelEntries";
import { PanelHost } from "./PanelHost";
import { SaveStatus } from "./SaveStatus";

const ICONS: Record<NavId, LucideIcon> = {
  dashboard: LayoutDashboard,
  ideas: Lightbulb,
  "self-analysis": UserSearch,
  notifications: Bell,
  decisions: ScrollText,
  settings: Settings,
  admin: ShieldCheck,
};

function UnreadBadge() {
  const { data } = useQuery(unreadCountQuery);
  if (!data || data.total <= 0) return null;
  return (
    <Badge variant="informative" size="S">
      {formatCount(data.total)}
    </Badge>
  );
}

function WorkspaceSwitcher({ name, collapsed }: { name: string; collapsed: boolean }) {
  const { t } = useTranslation("app");
  const { openModal } = useOverlay();
  return (
    <Button
      variant="secondary"
      aria-label={t("nav.switchWorkspace", { name })}
      onPress={() => openModal("switch-workspace")}
    >
      {collapsed ? <Avatar name={name} size="S" /> : name}
    </Button>
  );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation("app");
  const me = useMe();
  const logout = useLogout();
  return (
    <Menu
      trigger={
        <Button variant="secondary" aria-label={t("nav.userMenu", { name: me.displayName })}>
          <Flex gap="space-100" align="center">
            <Avatar name={me.displayName} size="S" src={me.avatarUrl} />
            {collapsed ? null : me.displayName}
          </Flex>
        </Button>
      }
      onAction={(key) => {
        if (key === "logout") void logout();
      }}
    >
      <MenuItem id="account" href="/account">
        {t("nav.account")}
      </MenuItem>
      <MenuItem id="logout">{t("nav.logout")}</MenuItem>
    </Menu>
  );
}

/**
 * The phone's More menu (design-spec 5), in its order: Decision Log, the workspace switcher,
 * Account, Settings and Admin where allowed, and Log out.
 */
function MoreSheet({
  entries,
  workspaceName,
  isOpen,
  onOpenChange,
}: {
  entries: NavEntry[];
  workspaceName: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("app");
  const { openModal } = useOverlay();
  const logout = useLogout();
  const close = () => onOpenChange(false);
  const link = (entry: NavEntry | undefined) =>
    entry ? (
      <Link key={entry.id} href={entry.href} onPress={close}>
        {t(`nav.${entry.id}`)}
      </Link>
    ) : null;
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      size="small"
      title={t("nav.more")}
      closeLabel={t("close")}
    >
      <Stack gap="space-100">
        {link(entries.find((entry) => entry.id === "decisions"))}
        {workspaceName ? (
          <ActionButton
            onPress={() => {
              close();
              openModal("switch-workspace");
            }}
          >
            {t("nav.switchWorkspaceNamed", { name: workspaceName })}
          </ActionButton>
        ) : null}
        <Link href="/account" onPress={close}>
          {t("nav.account")}
        </Link>
        {entries.filter((entry) => entry.id !== "decisions").map((entry) => link(entry))}
        <ActionButton
          onPress={() => {
            close();
            void logout();
          }}
        >
          {t("nav.logout")}
        </ActionButton>
      </Stack>
    </Dialog>
  );
}

function Shell() {
  const { t } = useTranslation("app");
  const me = useMe();
  const location = useLocation();
  const matches = useMatches();
  const params = useParams({ strict: false }) as { workspaceId?: string };
  const [moreOpen, setMoreOpen] = useState(false);

  const homeHref = homePath(me);
  const nav = navigation(
    me,
    params.workspaceId ?? me.lastWorkspaceId ?? me.memberships[0]?.workspace.id ?? null,
    location.pathname,
  );
  const workspace = me.memberships.find((m) => m.workspace.id === nav.workspaceId)?.workspace;
  const crumbs = crumbsOf(matches, t);
  const current = crumbs.at(-1);
  // A screen with no parent in the trail goes back to the dashboard, and the dashboard has no back.
  const backHref = crumbs.at(-2)?.href ?? (location.pathname === homeHref ? undefined : homeHref);

  const toItem = (entry: NavEntry): SideNavItem => ({
    id: entry.id,
    label: t(`nav.${entry.id}`),
    href: entry.href,
    icon: ICONS[entry.id],
    isCurrent: entry.isCurrent,
    badge: entry.id === "notifications" ? <UnreadBadge /> : undefined,
  });

  const tabs: TabBarItem[] = [
    ...nav.tabs.map((entry) => {
      const item = toItem(entry);
      return {
        id: item.id,
        label: item.label,
        href: item.href,
        icon: item.icon,
        isCurrent: item.isCurrent,
        badge: item.badge,
      };
    }),
    {
      id: "more",
      label: t("nav.more"),
      icon: Ellipsis,
      isExpanded: moreOpen,
      onPress: () => setMoreOpen(true),
    },
  ];

  return (
    <AppFrame
      skipLabel={t("skipToContent")}
      banner={<OfflineNotice />}
      sideNav={
        <SideNav
          aria-label={t("nav.label")}
          items={nav.main.map(toItem)}
          secondaryItems={nav.secondary.map(toItem)}
          workspaceSwitcher={({ isCollapsed }) =>
            workspace ? <WorkspaceSwitcher name={workspace.name} collapsed={isCollapsed} /> : null
          }
          userMenu={({ isCollapsed }) => <UserMenu collapsed={isCollapsed} />}
        />
      }
      tabBar={
        <>
          <TabBar aria-label={t("nav.tabsLabel")} items={tabs} />
          <MoreSheet
            entries={nav.more}
            workspaceName={workspace?.name ?? null}
            isOpen={moreOpen}
            onOpenChange={setMoreOpen}
          />
        </>
      }
      breadcrumbs={
        crumbs.length > 0 ? (
          <Breadcrumbs aria-label={t("header.trail")}>
            {crumbs.map((crumb, index) => (
              <Breadcrumb
                key={crumb.href}
                id={crumb.href}
                href={index === crumbs.length - 1 ? undefined : crumb.href}
              >
                {crumb.label}
              </Breadcrumb>
            ))}
          </Breadcrumbs>
        ) : undefined
      }
      backLink={backHref ? <Link href={backHref}>{t("back")}</Link> : undefined}
      title={current?.label}
      status={<SaveStatus key={location.pathname} />}
      actions={<PanelEntries />}
      panel={<PanelHost />}
    >
      <ErrorBoundary resetKey={location.pathname}>
        <Outlet />
      </ErrorBoundary>
      <ModalHost />
      <AutosaveRuntime />
    </AppFrame>
  );
}

/** The frame of every signed-in screen (design-spec 6.0.1). */
export function AppShell() {
  return (
    <PanelTargetProvider>
      <Shell />
    </PanelTargetProvider>
  );
}
