import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { AlertBanner } from "../../components/AlertBanner";
import { Avatar } from "../../components/Avatar";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { CheckDots } from "../../components/CheckDots";
import {
  DescriptionList,
  DescriptionListItem,
} from "../../components/DescriptionList";
import { Divider } from "../../components/Divider";
import { Heading } from "../../components/Heading";
import { Link } from "../../components/Link";
import { ActionMenu, MenuItem } from "../../components/Menu";
import { Meter } from "../../components/Meter";
import { MetricGroup, MetricTile } from "../../components/MetricTile";
import { MoonGlyph } from "../../components/MoonGlyph";
import { RowList, RowListItem, TaskMark } from "../../components/RowList";
import { Text } from "../../components/Text";
import { Flex, Stack } from "../../layout/Flex";
import { HubPattern } from "../../patterns/HubPattern";
import { allChecks, dots } from "./checks";
import { MockupFrame } from "./MockupFrame";

const allDone = dots(allChecks("done"));

/** s05-dashboard.html's ideas. */
const ideas = [
  {
    id: "piaya",
    name: "Piaya Gift Box Delivery",
    meta: "Planning · updated 12h ago",
    checks: allDone,
    decision: "Proceed",
  },
  {
    id: "bowl",
    name: "Bacolod Health Bowl",
    meta: "Validation · updated yesterday · Missing: Startup & monthly costs, Permits",
    checks: dots(["done", "done", "partial", "done", "not-started", "done"]),
    decision: "Hold",
  },
  {
    id: "corporate",
    name: "Piaya Gift Box (Corporate)",
    meta: "Validation · updated 2 days ago",
    checks: allDone,
    decision: null,
  },
  {
    id: "bike",
    name: "Mobile Bike Repair",
    meta: "Validation · updated 3 days ago · Missing: 6 checks",
    checks: dots([
      "not-started",
      "not-started",
      "not-started",
      "not-started",
      "not-started",
      "not-started",
    ]),
    decision: null,
  },
  {
    id: "cafe",
    name: "Student Study Café",
    meta: "Launch prep · updated 5 days ago",
    checks: allDone,
    decision: "Proceed",
  },
];

/** s05-dashboard.html's due soon and recent activity. */
const due = [
  {
    id: "quote",
    name: "Get the written supply quote from the bakery",
    meta: "Piaya Gift Box Delivery · Ana Villanueva",
    when: null,
    isYours: true,
  },
  {
    id: "permit",
    name: "Confirm permit requirements with City Hall",
    meta: "Bacolod Night Market Stall · Kenji Mori",
    when: "Oct 14",
    isYours: false,
  },
  {
    id: "first",
    name: "First 30 days",
    meta: "Student Study Café · Paolo Gonzaga",
    when: "Oct 16",
    isYours: false,
  },
  {
    id: "slots",
    name: "Test delivery slots with five offices",
    meta: "Piaya Gift Box Delivery · Paolo Gonzaga",
    when: "Oct 19",
    isYours: false,
  },
];

const activity = [
  [
    "Ana Villanueva",
    "changed 24.2 Milestones",
    "Piaya Gift Box Delivery · Plan A · 2 days ago",
  ],
  [
    "Paolo Gonzaga",
    "commented on 24.2 Milestones",
    "Piaya Gift Box Delivery · Plan A · 3 days ago",
  ],
  [
    "Ana Villanueva",
    "recorded Go / No-Go: Delay",
    "Piaya Gift Box Delivery · Plan A · 4 days ago",
  ],
  [
    "Ana Villanueva",
    "commented on Costs · Rent",
    "Piaya Gift Box Delivery · 6 days ago",
  ],
] as const;

function Block({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <Stack gap="space-100">
      <Flex
        alignItems="baseline"
        justifyContent="space-between"
        gap="space-100"
      >
        <Heading level={2} variant="label">
          {title}
        </Heading>
        {aside !== undefined && (
          <Text variant="caption" tone="tertiary">
            {aside}
          </Text>
        )}
      </Flex>
      {children}
    </Stack>
  );
}

/** s05's "● Shared · Done". */
const sharedDone = (
  <Flex gap="space-75" alignItems="center">
    <MoonGlyph state="done" size="S" />
    Shared · Done
  </Flex>
);

/** 5 Dashboard (s05-dashboard.html): pattern A without numbers. */
export function DashboardScreen() {
  return (
    <MockupFrame
      current="dashboard"
      crumbs={["Dashboard"]}
      title={{ label: "BCDX", isWorkspace: true }}
    >
      <HubPattern
        header={
          <>
            <Heading level={1} variant="heading-1-hub">
              BCDX
            </Heading>
            <Text tone="secondary">
              Ideas, self analyses and what is due across the workspace.
            </Text>
          </>
        }
        blocks={[
          {
            id: "ideas",
            column: "main",
            content: (
              <Block
                title="Ideas"
                aside="Checks: ● done · ◐ partial · ○ not started"
              >
                <RowList aria-label="Ideas">
                  {ideas.map((idea) => (
                    <RowListItem
                      key={idea.id}
                      href={`#idea-${idea.id}`}
                      description={idea.meta}
                      end={
                        <Flex gap="space-200" alignItems="center">
                          <CheckDots checks={idea.checks} size="S" />
                          {idea.decision === null ? (
                            <Badge fillStyle="dashed">Undecided</Badge>
                          ) : (
                            <Badge>{idea.decision}</Badge>
                          )}
                        </Flex>
                      }
                    >
                      {idea.name}
                    </RowListItem>
                  ))}
                </RowList>
                <Text variant="body-sm" tone="secondary">
                  {"1 dropped idea hidden · "}
                  <Link href="#show-dropped">Show</Link>
                </Text>
              </Block>
            ),
          },
          {
            id: "due",
            column: "aside",
            content: (
              <Block title="Due soon" aside="next 7 days">
                <RowList aria-label="Due soon">
                  {due.map((item) => (
                    <RowListItem
                      key={item.id}
                      href={`#due-${item.id}`}
                      start={<TaskMark />}
                      description={item.meta}
                      end={
                        item.when === null ? (
                          <Badge variant="notice">overdue 3d</Badge>
                        ) : (
                          item.when
                        )
                      }
                    >
                      {item.name}
                      {item.isYours && (
                        <>
                          {" "}
                          <Badge>Yours</Badge>
                        </>
                      )}
                    </RowListItem>
                  ))}
                </RowList>
              </Block>
            ),
          },
          {
            id: "self",
            column: "main",
            content: (
              <Block title="Self analyses">
                <RowList aria-label="Self analyses">
                  <RowListItem
                    href="#self-ana"
                    start={<Avatar name="Ana Villanueva" />}
                    end={sharedDone}
                  >
                    Ana Villanueva
                  </RowListItem>
                  <RowListItem
                    start={<Avatar name="Kenji Mori" />}
                    end="Not shared"
                  >
                    Kenji Mori
                  </RowListItem>
                  <RowListItem
                    href="#self-paolo"
                    start={<Avatar name="Paolo Gonzaga" />}
                    end={sharedDone}
                  >
                    Paolo Gonzaga
                  </RowListItem>
                </RowList>
              </Block>
            ),
          },
          {
            id: "activity",
            column: "aside",
            content: (
              <Block title="Recent activity">
                <RowList aria-label="Recent activity">
                  {activity.map(([who, what, where], index) => (
                    <RowListItem
                      // biome-ignore lint/suspicious/noArrayIndexKey: the mockup's fixed rows
                      key={index}
                      href={`#activity-${index}`}
                      start={<Avatar name={who} />}
                      description={where}
                    >
                      <strong>{who}</strong>
                      {` ${what}`}
                    </RowListItem>
                  ))}
                </RowList>
              </Block>
            ),
          },
        ]}
      />
    </MockupFrame>
  );
}

/** d1-moon.html's checks and sections. */
const checks = [
  {
    id: "competitors",
    state: "done",
    name: "Competitors (3–5)",
    end: "Done (4)",
  },
  { id: "price", state: "done", name: "Local price range", end: "Done" },
  {
    id: "costs",
    state: "partial",
    name: "Startup & monthly costs",
    end: "Partial",
    description: "1 row is Empty",
  },
  { id: "breakeven", state: "done", name: "Break-even volume", end: "Done" },
  {
    id: "permits",
    state: "not-started",
    name: "Permits",
    end: "Not started",
    description: "Fill the Permits cost row, or log what you found",
  },
  {
    id: "demand",
    state: "done",
    name: "Demand or problem signal",
    end: "Done (2)",
  },
] as const;

const sections = [
  { id: "s01", value: 0.7, name: "01 Customer & Problem", end: "7/10" },
  { id: "s02", value: 0.5, name: "02 Market", end: "6/12" },
  { id: "s03", value: null, name: "03 Research Log", end: "5 entries" },
  { id: "s04", value: null, name: "04 Competitors", end: "4 (3–5)" },
  { id: "s05", value: 0.833, name: "05 Costs", end: "20/24 rows" },
  { id: "s06", value: 0.714, name: "06–08 Unit Economics", end: "5/7 inputs" },
  { id: "s09", value: null, name: "09 Assumptions & Risks", end: "2 · 2" },
  { id: "s10", value: 0.333, name: "10 Final Assessment", end: "2/6" },
] as const;

/** 13 Validation home (d1-moon.html): pattern A with the numbers and the template band. */
export function ValidationHomeScreen() {
  return (
    <MockupFrame
      current="ideas"
      crumbs={["Ideas", "Bacolod Health Bowl"]}
      back="Ideas"
      comments={2}
      hasHistory
      banners={{
        template: (
          <AlertBanner
            title="A newer template is available."
            action={<Link href="#update">Update template</Link>}
          >
            Your answers stay on v3 until you update.
          </AlertBanner>
        ),
      }}
    >
      <HubPattern
        header={
          <>
            <Flex gap="space-200" alignItems="center" wrap>
              <Badge>Hold</Badge>
              <Text variant="caption" tone="secondary">
                Latest decision Oct 2 · Stage: Validation
              </Text>
            </Flex>
            <Heading level={1} variant="heading-1-hub">
              Bacolod Health Bowl
            </Heading>
            <Text tone="secondary">
              {
                "Healthy fast-casual bowls with standardized nutrition in Bacolod. "
              }
              <Text tone="tertiary">— Kenji Mori</Text>
            </Text>
          </>
        }
        actions={
          <>
            <Button variant="secondary" isQuiet>
              Edit summary
            </Button>
            <Button variant="secondary">
              AI
              <ChevronDown />
            </Button>
            <ActionMenu aria-label="More for Bacolod Health Bowl">
              <MenuItem id="duplicate">Duplicate</MenuItem>
              <MenuItem id="archive">Archive</MenuItem>
            </ActionMenu>
          </>
        }
        primaryAction={<Button variant="primary">Record decision</Button>}
        metrics={
          <MetricGroup aria-label="Key numbers">
            <MetricTile
              label="Startup costs"
              value="₱145,000+"
              supplement="Lower bound · 3 Unknown, 1 Empty"
            />
            <MetricTile
              label="Break-even"
              value="14.4+"
              unit="/ day"
              supplement="Lower bound"
            />
            <MetricTile
              label="Expected profit"
              value="≤ ₱37,000"
              unit="/ mo"
              supplement="Upper bound"
            />
            <MetricTile
              label="Payback"
              value="3.9+"
              unit="months"
              supplement="Lower bound"
            />
          </MetricGroup>
        }
        blocks={[
          {
            id: "next",
            column: "main",
            content: (
              <Block title="Next steps">
                <RowList ordered aria-label="Next steps">
                  <RowListItem
                    href="#next-1"
                    isEmphasized
                    description="A Fact in 01 Customer & Problem lost its research log."
                  >
                    Add evidence (1)
                  </RowListItem>
                  <RowListItem href="#next-2">Classify answers (3)</RowListItem>
                  <RowListItem href="#next-3">
                    Fill or mark 1 empty cost row
                  </RowListItem>
                </RowList>
              </Block>
            ),
          },
          {
            id: "checks",
            column: "main",
            content: (
              <Block title="Checks" aside="● done · ◐ partial · ○ not started">
                <RowList aria-label="Checks">
                  {checks.map((check) => (
                    <RowListItem
                      key={check.id}
                      href={`#check-${check.id}`}
                      start={<MoonGlyph state={check.state} />}
                      end={check.end}
                      description={
                        "description" in check ? check.description : undefined
                      }
                    >
                      {check.name}
                    </RowListItem>
                  ))}
                </RowList>
              </Block>
            ),
          },
          {
            id: "fau",
            column: "main",
            content: (
              <Block title="Fact / Assumption / Unknown" aside="62 items">
                <Meter
                  label="Answers by F/A/U"
                  segments={[
                    { state: "fact", label: "Fact", count: 3 },
                    {
                      state: "assumption",
                      label: "Assumption",
                      count: 29,
                      detail: "L9 M17 H3",
                    },
                    { state: "unknown", label: "Unknown", count: 5 },
                    { state: "unclassified", label: "Unclassified", count: 3 },
                    { state: "empty", label: "Empty", count: 22 },
                  ]}
                />
              </Block>
            ),
          },
          {
            id: "sections",
            column: "aside",
            content: (
              <Block title="Sections">
                <RowList aria-label="Sections">
                  {sections.map((section) => (
                    <RowListItem
                      key={section.id}
                      href={`#${section.id}`}
                      start={
                        section.value === null ? undefined : (
                          <MoonGlyph value={section.value} />
                        )
                      }
                      end={section.end}
                      isEndNumeric
                    >
                      {section.name}
                    </RowListItem>
                  ))}
                </RowList>
              </Block>
            ),
          },
          {
            id: "summary",
            column: "main",
            content: (
              <Block title="Summary">
                <DescriptionList>
                  <DescriptionListItem label="Customer">
                    Working professionals aged 25–40 in Bacolod who pay for
                    convenient meals.
                  </DescriptionListItem>
                  <DescriptionListItem label="Problem">
                    Healthy eating is hard to sustain because planning, cooking
                    and portion control take time.
                  </DescriptionListItem>
                  <DescriptionListItem label="Solution">
                    A focused menu with consistent portions and clearly
                    communicated nutrition.
                  </DescriptionListItem>
                  <DescriptionListItem label="Market type">
                    Red
                  </DescriptionListItem>
                </DescriptionList>
              </Block>
            ),
          },
          {
            id: "decisions",
            column: "aside",
            content: (
              <Block title="Decisions">
                <Stack gap="space-100">
                  <Divider size="S" />
                  <Text variant="caption" tone="secondary">
                    <Text variant="caption" tone="primary">
                      <strong>Hold</strong>
                    </Text>
                    {" · Oct 2 · Kenji Mori"}
                  </Text>
                  <Text>
                    “Startup and monthly costs and permits are still missing.”
                  </Text>
                  <Divider size="S" />
                  <Flex>
                    <Link href="#decisions">See all decisions</Link>
                  </Flex>
                </Stack>
              </Block>
            ),
          },
          {
            id: "plans",
            column: "aside",
            content: (
              <Block title="Plans">
                <Text tone="secondary">
                  No plans yet. A plan can start after a Proceed decision.
                </Text>
              </Block>
            ),
          },
        ]}
      />
    </MockupFrame>
  );
}
