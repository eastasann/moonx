import type { SaveState } from "@moonx/ui-tokens";
import {
  Bell,
  Compass,
  House,
  Lightbulb,
  ScrollText,
  Settings2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { AppFrame } from "../../components/AppFrame";
import { Breadcrumb, Breadcrumbs } from "../../components/Breadcrumbs";
import { MenuItem } from "../../components/Menu";
import { Panel } from "../../components/Panel";
import { RouterProvider } from "../../components/RouterProvider";
import { type NavItem, SideNav } from "../../components/SideNav";
import { TabBar } from "../../components/TabBar";
import { Text } from "../../components/Text";
import type { FrameBanners } from "../../internal/frame";

// The frame of docs/mockups (moon-base.css, moon-frame.js): BCDX, Ana Villanueva and the
// mockups' pages, around a mockup screen of /dev/components?screen=.

const pages: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <House />, href: "#dashboard" },
  { id: "ideas", label: "Ideas", icon: <Lightbulb />, href: "#ideas" },
  { id: "self", label: "Self Analysis", icon: <Compass />, href: "#self" },
  {
    id: "notifications",
    label: "Notifications",
    icon: <Bell />,
    href: "#notifications",
    badge: 3,
  },
];

const decisionLog: NavItem = {
  id: "decisions",
  label: "Decision Log",
  icon: <ScrollText />,
  href: "#decisions",
};

const settings: NavItem = {
  id: "settings",
  label: "Workspace Settings",
  icon: <Settings2 />,
  href: "#settings",
};

export interface MockupFrameProps {
  /** The page of the navigation the screen belongs to. */
  current: "dashboard" | "ideas" | "settings";
  /** The breadcrumbs' levels; the last is the screen. */
  crumbs: string[];
  /** ← on a phone, or the title of a screen the TabBar or its More menu opens. */
  back?: string;
  title?: { label: string; isWorkspace?: boolean };
  saveState?: SaveState;
  /** The count of unresolved threads, when the screen has 💬. */
  comments?: number;
  hasHistory?: boolean;
  banners?: FrameBanners;
  children: ReactNode;
}

/** A mockup screen in AppFrame, its links going nowhere. */
export function MockupFrame({
  current,
  crumbs,
  back,
  title,
  saveState,
  comments,
  hasHistory = false,
  banners,
  children,
}: MockupFrameProps) {
  const [panel, setPanel] = useState<"comments" | "history" | null>(null);
  const toggle = (name: "comments" | "history") =>
    setPanel(panel === name ? null : name);
  const ignore = () => {};
  return (
    <RouterProvider navigate={ignore}>
      <AppFrame
        sideNav={
          <SideNav
            workspaceName="BCDX"
            onWorkspacePress={ignore}
            items={[...pages, decisionLog]}
            secondaryItems={[settings]}
            currentId={current}
            user={{ name: "Ana Villanueva" }}
            userMenu={
              <>
                <MenuItem id="account">Account</MenuItem>
                <MenuItem id="logout">Log out</MenuItem>
              </>
            }
          />
        }
        tabBar={
          <TabBar
            items={pages}
            currentId={current}
            more={
              <>
                <MenuItem id="decisions">Decision Log</MenuItem>
                <MenuItem id="settings">Workspace Settings</MenuItem>
                <MenuItem id="logout">Log out</MenuItem>
              </>
            }
          />
        }
        breadcrumbs={
          <Breadcrumbs>
            {crumbs.map((crumb, index) => (
              <Breadcrumb
                key={crumb}
                href={index < crumbs.length - 1 ? `#crumb-${index}` : undefined}
              >
                {crumb}
              </Breadcrumb>
            ))}
          </Breadcrumbs>
        }
        back={back === undefined ? undefined : { href: "#back", label: back }}
        title={
          title === undefined
            ? undefined
            : {
                label: title.label,
                onPress: title.isWorkspace ? ignore : undefined,
              }
        }
        saveState={saveState}
        comments={
          comments === undefined
            ? undefined
            : {
                count: comments,
                isOpen: panel === "comments",
                onPress: () => toggle("comments"),
              }
        }
        history={
          hasHistory
            ? { isOpen: panel === "history", onPress: () => toggle("history") }
            : undefined
        }
        banners={banners}
        panel={
          <Panel
            title={panel === "history" ? "History" : "Comments"}
            isOpen={panel !== null}
            onOpenChange={(isOpen) => {
              if (!isOpen) setPanel(null);
            }}
          >
            <Text variant="body-sm">
              {panel === "history"
                ? "Ana Villanueva changed SEVERITY 3m ago."
                : "Paolo Gonzaga: Is the Lacson St. office lunch rush daily?"}
            </Text>
          </Panel>
        }
      >
        {children}
      </AppFrame>
    </RouterProvider>
  );
}
