import type { Me } from "@moonx/schemas";

export type NavId =
  | "dashboard"
  | "ideas"
  | "self-analysis"
  | "notifications"
  | "decisions"
  | "settings"
  | "admin";

export interface NavEntry {
  id: NavId;
  href: string;
  isCurrent: boolean;
}

export interface Navigation {
  /** The workspace the navigation points into. */
  workspaceId: string | null;
  role: Me["memberships"][number]["role"] | null;
  /** Sidebar, before the divider: Dashboard, Ideas, Self Analysis, Notifications, Decision Log. */
  main: NavEntry[];
  /** Sidebar, after the divider: Settings (Owner) and Admin (operators). */
  secondary: NavEntry[];
  /** The phone's tab bar: the main destinations without Decision Log (design-spec 5, common nav). */
  tabs: NavEntry[];
  /** The phone's More menu: what the tabs leave out. */
  more: NavEntry[];
}

const isUnder = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * Which destinations the frame shows for this person in this workspace, and which one the current
 * path is in. A Viewer gets no Self Analysis (design-spec 5, "Viewer"); Settings is for Owners and
 * Admin for operators.
 */
export function navigation(me: Me, workspaceId: string | null, pathname: string): Navigation {
  const membership = me.memberships.find((m) => m.workspace.id === workspaceId) ?? null;
  const base = membership ? `/w/${membership.workspace.id}` : null;
  const entry = (id: NavId, href: string, exact = false): NavEntry => ({
    id,
    href,
    isCurrent: exact ? pathname === href : isUnder(pathname, href),
  });

  const main: NavEntry[] = [];
  if (base) {
    main.push(entry("dashboard", base, true), entry("ideas", `${base}/ideas`));
    if (membership?.role !== "viewer") main.push(entry("self-analysis", `${base}/self-analysis`));
  }
  main.push(entry("notifications", "/notifications"));
  const decisions = base ? entry("decisions", `${base}/decisions`) : null;

  const secondary: NavEntry[] = [];
  if (base && membership?.role === "owner") secondary.push(entry("settings", `${base}/settings`));
  if (me.isAdmin) secondary.push(entry("admin", "/admin/templates"));

  return {
    workspaceId: membership?.workspace.id ?? null,
    role: membership?.role ?? null,
    main: decisions ? [...main, decisions] : main,
    secondary,
    tabs: main,
    more: [...(decisions ? [decisions] : []), ...secondary],
  };
}
