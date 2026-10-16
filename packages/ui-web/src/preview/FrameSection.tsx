import type { SaveState } from "@moonx/ui-tokens";
import {
  Bell,
  Compass,
  House,
  Lightbulb,
  ScrollText,
  Settings,
  Shield,
} from "lucide-react";
import { useState } from "react";
import { AppFrame } from "../components/AppFrame";
import { Breadcrumb, Breadcrumbs } from "../components/Breadcrumbs";
import { Button } from "../components/Button";
import { Heading } from "../components/Heading";
import { InlineAlert } from "../components/InlineAlert";
import { MenuItem } from "../components/Menu";
import { PageFrame } from "../components/PageFrame";
import { Panel } from "../components/Panel";
import { QuestionCard } from "../components/QuestionCard";
import { RouterProvider } from "../components/RouterProvider";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../components/SegmentedControl";
import { type NavItem, SideNav } from "../components/SideNav";
import { TabBar } from "../components/TabBar";
import { Text } from "../components/Text";
import { TextArea, TextField } from "../components/TextField";
import { Stack } from "../layout/Flex";
import { FocusPattern } from "../patterns/FocusPattern";
import { QuestionFormPattern } from "../patterns/QuestionFormPattern";
import { Section, Specimen } from "./parts";
import * as styles from "./preview.css";

const base = "/w/demo";

const pages: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <House />,
    href: base,
  },
  { id: "ideas", label: "Ideas", icon: <Lightbulb />, href: `${base}/ideas` },
  {
    id: "self",
    label: "Self Analysis",
    icon: <Compass />,
    href: `${base}/self-analysis`,
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: <Bell />,
    href: "/notifications",
    badge: 3,
  },
];

const decisionLog: NavItem = {
  id: "decisions",
  label: "Decision Log",
  icon: <ScrollText />,
  href: `${base}/decisions`,
};

const settings: NavItem[] = [
  {
    id: "settings",
    label: "Settings",
    icon: <Settings />,
    href: `${base}/settings`,
  },
  { id: "admin", label: "Admin", icon: <Shield />, href: "/admin/templates" },
];

const frameQuestions = [
  { id: "WHO", question: "Who exactly is the customer?" },
  { id: "WHY THEM", question: "Why this customer first?" },
];

export function FrameSection() {
  const [moved, setMoved] = useState("nothing yet");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [panel, setPanel] = useState<"comments" | "history" | null>(null);
  const [current, setCurrent] = useState<string | null>("WHO");
  const toggle = (name: "comments" | "history") =>
    setPanel(panel === name ? null : name);

  return (
    <Section title="SideNav, TabBar, AppFrame and RouterProvider">
      <Specimen name="the save state in the header">
        <SegmentedControl
          aria-label="Save state"
          selectedKey={saveState}
          onSelectionChange={(key) => setSaveState(key as SaveState)}
        >
          <SegmentedControlItem id="saving">Saving</SegmentedControlItem>
          <SegmentedControlItem id="saved">Saved</SegmentedControlItem>
          <SegmentedControlItem id="save-failed">Failed</SegmentedControlItem>
        </SegmentedControl>
      </Specimen>
      <Text elementType="p" tone="secondary">
        {`RouterProvider moved to: ${moved}`}
      </Text>
      <div className={styles.patternBox}>
        <RouterProvider navigate={(href) => setMoved(href)}>
          <AppFrame
            sideNav={
              <SideNav
                workspaceName="BCDX"
                onWorkspacePress={() => setMoved("Switch workspace")}
                items={[...pages, decisionLog]}
                secondaryItems={settings}
                currentId="ideas"
                user={{ name: "Ana Reyes" }}
                userMenu={
                  <>
                    <MenuItem id="account" href="/account">
                      Account
                    </MenuItem>
                    <MenuItem id="logout" onAction={() => setMoved("Log out")}>
                      Log out
                    </MenuItem>
                  </>
                }
              />
            }
            tabBar={
              <TabBar
                items={pages}
                currentId="ideas"
                more={
                  <>
                    <MenuItem id="decisions" href={decisionLog.href}>
                      Decision Log
                    </MenuItem>
                    <MenuItem
                      id="switch"
                      onAction={() => setMoved("Switch workspace")}
                    >
                      Switch workspace
                    </MenuItem>
                    <MenuItem id="account" href="/account">
                      Account
                    </MenuItem>
                    <MenuItem id="settings" href={`${base}/settings`}>
                      Workspace Settings
                    </MenuItem>
                    <MenuItem id="admin" href="/admin/templates">
                      Admin
                    </MenuItem>
                    <MenuItem id="logout" onAction={() => setMoved("Log out")}>
                      Log out
                    </MenuItem>
                  </>
                }
              />
            }
            breadcrumbs={
              <Breadcrumbs aria-label="Frame breadcrumbs">
                <Breadcrumb href={`${base}/ideas`}>Ideas</Breadcrumb>
                <Breadcrumb href={`${base}/ideas/piaya`}>
                  Piaya Gift Box
                </Breadcrumb>
                <Breadcrumb>01 Customer & Problem</Breadcrumb>
              </Breadcrumbs>
            }
            back={{ href: `${base}/ideas/piaya`, label: "Validation" }}
            saveState={saveState}
            onRetrySave={() => setSaveState("saving")}
            comments={{
              count: 2,
              isOpen: panel === "comments",
              onPress: () => toggle("comments"),
            }}
            history={{
              isOpen: panel === "history",
              onPress: () => toggle("history"),
            }}
            banners={{
              offline: (
                <InlineAlert variant="notice">
                  You're offline. Changes can't be saved until you reconnect.
                </InlineAlert>
              ),
            }}
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
                    ? "Ana changed WHO 3m ago."
                    : "Paolo: Is the airport kiosk open on Sundays?"}
                </Text>
              </Panel>
            }
          >
            <QuestionFormPattern
              header={<Heading level={3}>01 Customer & Problem</Heading>}
              questionIds={frameQuestions.map((item) => item.id)}
              currentId={current}
              onCurrentChange={setCurrent}
              renderQuestion={(id, mode) => (
                <QuestionCard
                  title={`Frame ${id}`}
                  question={
                    frameQuestions.find((item) => item.id === id)?.question
                  }
                  headingLevel={4}
                  mode={mode}
                  excerpt={null}
                  onFocusRequest={() => setCurrent(id)}
                >
                  <TextArea
                    aria-label={`Frame answer ${id}`}
                    placeholder="Write your answer…"
                    width="full"
                  />
                </QuestionCard>
              )}
            />
          </AppFrame>
        </RouterProvider>
      </div>
    </Section>
  );
}

export function PageFrameSection() {
  return (
    <Section title="PageFrame">
      <div className={styles.patternBox}>
        <PageFrame>
          <FocusPattern
            header={<Heading level={3}>Sign in to moonx</Heading>}
            primaryAction={<Button variant="primary">Continue</Button>}
          >
            <Stack gap="space-300">
              <TextField label="Email" type="email" />
            </Stack>
          </FocusPattern>
        </PageFrame>
      </div>
    </Section>
  );
}
