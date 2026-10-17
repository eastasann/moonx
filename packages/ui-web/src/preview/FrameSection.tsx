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
import { useId, useState } from "react";
import { AlertBanner } from "../components/AlertBanner";
import { AppFrame } from "../components/AppFrame";
import { Breadcrumb, Breadcrumbs } from "../components/Breadcrumbs";
import { Button } from "../components/Button";
import { Heading } from "../components/Heading";
import { ListView, ListViewItem } from "../components/ListView";
import { MenuItem } from "../components/Menu";
import { MetricTile } from "../components/MetricTile";
import { PageFrame } from "../components/PageFrame";
import { Panel } from "../components/Panel";
import { QuestionCard } from "../components/QuestionCard";
import { RouterProvider } from "../components/RouterProvider";
import { SearchField } from "../components/SearchField";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../components/SegmentedControl";
import { type NavItem, SideNav } from "../components/SideNav";
import { TabBar } from "../components/TabBar";
import { TableView } from "../components/TableView";
import { Text } from "../components/Text";
import { TextArea, TextField } from "../components/TextField";
import { Container } from "../layout/Container";
import { Stack } from "../layout/Flex";
import { FocusPattern } from "../patterns/FocusPattern";
import { ListDetailPattern } from "../patterns/ListDetailPattern";
import { QuestionFormPattern } from "../patterns/QuestionFormPattern";
import { WorksheetPattern } from "../patterns/WorksheetPattern";
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

/** The sidebar of the gallery's frames; `onMove` shows where a press would lead. */
function gallerySideNav(onMove: (target: string) => void) {
  return (
    <SideNav
      workspaceName="BCDX"
      onWorkspacePress={() => onMove("Switch workspace")}
      items={[...pages, decisionLog]}
      secondaryItems={settings}
      currentId="ideas"
      user={{ name: "Ana Reyes" }}
      userMenu={
        <>
          <MenuItem id="account" href="/account">
            Account
          </MenuItem>
          <MenuItem id="logout" onAction={() => onMove("Log out")}>
            Log out
          </MenuItem>
        </>
      }
    />
  );
}

/** The TabBar of the gallery's frames, with the More menu of 6.0.1. */
function galleryTabBar(onMove: (target: string) => void) {
  return (
    <TabBar
      items={pages}
      currentId="ideas"
      more={
        <>
          <MenuItem id="decisions" href={decisionLog.href}>
            Decision Log
          </MenuItem>
          <MenuItem id="switch" onAction={() => onMove("Switch workspace")}>
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
          <MenuItem id="logout" onAction={() => onMove("Log out")}>
            Log out
          </MenuItem>
        </>
      }
    />
  );
}

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
            sideNav={gallerySideNav(setMoved)}
            tabBar={galleryTabBar(setMoved)}
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
                <AlertBanner variant="notice">
                  You're offline. Changes can't be saved until you reconnect.
                </AlertBanner>
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

/**
 * More ideas than a window holds: the list's height changes the body's when it gives way
 * to a short detail, which E2E needs to see raise no error.
 */
const panelIdeas = [
  { id: "piaya", name: "Piaya Gift Box Delivery", meta: "Planning · Proceed" },
  { id: "bowl", name: "Bacolod Health Bowl", meta: "Validation · Hold" },
  ...[
    "Mobile Bike Repair",
    "Silay Heritage Walks",
    "Talisay Coffee Cart",
    "Sugarland Laundry Pickup",
    "Lacson Street Food Tour",
    "Barangay Tutoring Hub",
    "Inasal Meal Kits",
    "Bamboo Furniture Studio",
    "Ruins Wedding Photos",
    "Murcia Farm Stay",
    "Napoleones Bakery Stall",
    "Banago Fish Market Run",
  ].map((name, index) => ({
    id: `idea-${index}`,
    name,
    meta: "Validation · Undecided",
  })),
];

const panelCosts = [
  { id: "rent", name: "Rent", amount: "₱15,000" },
  { id: "oven", name: "Oven", amount: "₱4,500" },
];

/**
 * A frame as wide as the window, holding pattern D or F, whose 💬 docks the comments
 * panel beside the body: while the body is narrower than `layout.two-column-min-width`,
 * D and F take their tablet arrangement (design-spec 4.1). E2E opens it at 1024px and
 * 1440px. The gallery puts it after its column, so it is not a `Section` in it.
 */
export function FramePanelSection() {
  const [pattern, setPattern] = useState<"list" | "worksheet">("list");
  const [isPanelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>("piaya");
  const idea = panelIdeas.find((item) => item.id === selected);
  const ignore = () => {};
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={styles.section}>
      <Container>
        <Stack gap="space-400">
          <Heading level={2} id={titleId}>
            AppFrame with a panel beside D and F
          </Heading>
          <SegmentedControl
            aria-label="Pattern D or F beside the panel"
            selectedKey={pattern}
            onSelectionChange={(key) => setPattern(key as "list" | "worksheet")}
          >
            <SegmentedControlItem id="list">D</SegmentedControlItem>
            <SegmentedControlItem id="worksheet">F</SegmentedControlItem>
          </SegmentedControl>
        </Stack>
      </Container>
      <div className={styles.windowBox}>
        <RouterProvider navigate={ignore}>
          <AppFrame
            sideNav={gallerySideNav(ignore)}
            tabBar={galleryTabBar(ignore)}
            breadcrumbs={
              <Breadcrumbs aria-label="Panel frame breadcrumbs">
                <Breadcrumb href={`${base}/ideas`}>Ideas</Breadcrumb>
                <Breadcrumb>
                  {pattern === "list" ? "All ideas" : "05 Costs"}
                </Breadcrumb>
              </Breadcrumbs>
            }
            back={{ href: `${base}/ideas`, label: "Ideas" }}
            comments={{
              count: 1,
              isOpen: isPanelOpen,
              onPress: () => setPanelOpen(!isPanelOpen),
            }}
            panel={
              <Panel
                title="Comments"
                isOpen={isPanelOpen}
                onOpenChange={setPanelOpen}
              >
                <Text variant="body-sm">
                  Paolo: Is the airport kiosk open on Sundays?
                </Text>
              </Panel>
            }
          >
            {pattern === "list" ? (
              <ListDetailPattern
                header={<Heading level={3}>Ideas</Heading>}
                filters={
                  <SearchField label="Panel frame search" width="fill" />
                }
                list={
                  <ListView
                    aria-label="Panel frame ideas"
                    items={panelIdeas}
                    selectionMode="single"
                    selectedKeys={selected === null ? [] : [selected]}
                    onSelectionChange={(keys) =>
                      setSelected(([...keys][0] as string | undefined) ?? null)
                    }
                  >
                    {(item) => (
                      <ListViewItem id={item.id} textValue={item.name}>
                        <Text variant="label">{item.name}</Text>
                        <Text variant="caption" tone="secondary">
                          {item.meta}
                        </Text>
                      </ListViewItem>
                    )}
                  </ListView>
                }
                detail={
                  idea === undefined ? null : (
                    <Stack gap="space-200">
                      <Heading level={4}>{idea.name}</Heading>
                      <TextField
                        label="Panel frame summary"
                        width="full"
                        placeholder="One line about the idea"
                      />
                    </Stack>
                  )
                }
                listLabel="Ideas"
                onBack={() => setSelected(null)}
              />
            ) : (
              <WorksheetPattern
                header={<Heading level={3}>05 Costs</Heading>}
                inputs={
                  <Stack gap="space-300">
                    <TableView
                      aria-label="Panel frame costs"
                      columns={[
                        { id: "name", name: "Item", isRowHeader: true },
                        { id: "amount", name: "Amount", numeric: true },
                      ]}
                      items={panelCosts}
                      renderCell={(row, column) =>
                        column === "name" ? row.name : row.amount
                      }
                    />
                    <TextField label="Panel frame cost note" width="full" />
                  </Stack>
                }
                resultsTitle="Panel frame totals"
                results={<MetricTile label="Startup total" value="₱19,500" />}
                summary={<Text variant="number">Startup total ₱19,500</Text>}
              />
            )}
          </AppFrame>
        </RouterProvider>
      </div>
    </section>
  );
}

export function PageFrameSection() {
  return (
    <Section title="PageFrame">
      <div className={styles.patternBox}>
        <PageFrame>
          <FocusPattern
            header={<Heading level={3}>Log in to moonx</Heading>}
            actions={<Button variant="primary">Continue</Button>}
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
