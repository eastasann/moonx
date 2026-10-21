import { breakpoints } from "@moonx/ui-tokens";
import { ArrowRight, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { ActionButton } from "../../components/ActionButton";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card, CardView } from "../../components/Card";
import { type CheckDotState, CheckDots } from "../../components/CheckDots";
import { Heading } from "../../components/Heading";
import { Link } from "../../components/Link";
import { ListView, ListViewItem } from "../../components/ListView";
import { ActionMenu, MenuItem } from "../../components/Menu";
import { MetricGroup, MetricTile } from "../../components/MetricTile";
import { MoonGlyph } from "../../components/MoonGlyph";
import { Picker } from "../../components/Picker";
import { QuestionCard } from "../../components/QuestionCard";
import { RowList, RowListItem } from "../../components/RowList";
import { SearchField } from "../../components/SearchField";
import { TableView } from "../../components/TableView";
import { Text } from "../../components/Text";
import { TextArea } from "../../components/TextField";
import { IconSlot } from "../../internal/IconSlot";
import { Flex, Stack } from "../../layout/Flex";
import { CardComparePattern } from "../../patterns/CardComparePattern";
import { ListDetailPattern } from "../../patterns/ListDetailPattern";
import { QuestionList, QuestionListItem } from "../../patterns/QuestionList";
import { WorksheetPattern } from "../../patterns/WorksheetPattern";
import { competitors } from "../MockupDataSection";
import { CostTable } from "./CostTables";
import { allChecks, checkNames, dots } from "./checks";
import { MockupFrame } from "./MockupFrame";

const endOf: Record<CheckDotState, string> = {
  done: "Done",
  partial: "Partial",
  "not-started": "Not started",
};

interface Idea {
  id: string;
  name: string;
  decision: "Proceed" | "Hold" | null;
  stage: string;
  proposer: string;
  updated: string;
  concept: string;
  checks: CheckDotState[];
  /** The ends s06 writes beside some checks ("Done (4)"); the rest say their state. */
  checkEnds?: Partial<Record<number, string>>;
  missing: string | null;
  /** The latest decision's date and reason; none for an undecided idea. */
  latest: { date: string; reason: string } | null;
  plans: string;
  /** The key numbers s06 shows; only Bacolod Health Bowl's are in the mockup. */
  hasNumbers?: boolean;
}

/** s06-ideas.html's ideas, with the detail s06 shows for the selected one. */
const ideas: Idea[] = [
  {
    id: "piaya",
    name: "Piaya Gift Box Delivery",
    decision: "Proceed",
    stage: "Planning",
    proposer: "Ana Villanueva",
    updated: "12h ago",
    concept: "Corporate gift boxes of Bacolod piaya, delivered the same day.",
    checks: allChecks("done"),
    missing: null,
    latest: {
      date: "Oct 9",
      reason: "Costs and demand are confirmed. Plan the launch.",
    },
    plans: "Plans: Plan A.",
  },
  {
    id: "bowl",
    name: "Bacolod Health Bowl",
    decision: "Hold",
    stage: "Validation",
    proposer: "Kenji Mori",
    updated: "yesterday",
    concept:
      "Healthy fast-casual bowls with standardized nutrition in Bacolod.",
    checks: ["done", "done", "partial", "done", "not-started", "done"],
    checkEnds: { 0: "Done (4)", 5: "Done (2)" },
    missing: "Missing: Startup & monthly costs, Permits",
    latest: {
      date: "Oct 2",
      reason: "Startup and monthly costs and permits are still missing.",
    },
    plans: "Plans: none yet.",
    hasNumbers: true,
  },
  {
    id: "corporate",
    name: "Piaya Gift Box (Corporate)",
    decision: null,
    stage: "Validation",
    proposer: "Kenji Mori",
    updated: "2 days ago",
    concept: "Piaya gift boxes for company events, ordered in bulk.",
    checks: allChecks("done"),
    missing: null,
    latest: null,
    plans: "Plans: none yet.",
  },
  {
    id: "bike",
    name: "Mobile Bike Repair",
    decision: null,
    stage: "Validation",
    proposer: "Ana Villanueva",
    updated: "3 days ago",
    concept: "Bike repairs at the rider's home or office.",
    checks: allChecks("not-started"),
    missing: "Missing: 6 checks",
    latest: null,
    plans: "Plans: none yet.",
  },
  {
    id: "cafe",
    name: "Student Study Café",
    decision: "Proceed",
    stage: "Launch prep",
    proposer: "Paolo Gonzaga",
    updated: "5 days ago",
    concept: "A quiet café near the universities for students to study.",
    checks: allChecks("done"),
    missing: null,
    latest: { date: "Sep 30", reason: "Students pay for quiet hours." },
    plans: "Plans: Plan A.",
  },
];

const filters = [
  { id: "stage", label: "Stage", value: "all", items: ["All", "Validation"] },
  {
    id: "decision",
    label: "Decision",
    value: "not dropped",
    items: ["Not dropped", "All"],
  },
  { id: "proposer", label: "Proposer", value: "all", items: ["All", "Ana"] },
  { id: "sort", label: "Sort", value: "updated", items: ["Updated", "Name"] },
];

/** 6 Ideas (s06-ideas.html): pattern D with Bacolod Health Bowl selected. */
export function IdeasScreen() {
  // Where the list and the detail share the width, it opens with the item s06 shows
  // beside the list; in one pane (phone and tablet), with the list, as s06 does there.
  const [selected, setSelected] = useState<string | null>(() =>
    window.innerWidth < breakpoints.desktop ? null : "bowl",
  );
  const idea = ideas.find((item) => item.id === selected);
  return (
    <MockupFrame current="ideas" crumbs={["Ideas"]} title={{ label: "Ideas" }}>
      <ListDetailPattern
        header={
          <Heading level={1} variant="heading-1-list">
            Ideas
          </Heading>
        }
        newItem={{ label: "New idea", onPress: () => {} }}
        filters={
          <>
            {filters.map((filter) => (
              <Picker
                key={filter.id}
                label={filter.label}
                labelPosition="inside"
                size="S"
                items={filter.items.map((name) => ({
                  id: name.toLowerCase(),
                  label: name,
                }))}
                defaultValue={filter.value}
              />
            ))}
            <SearchField
              aria-label="Search ideas"
              placeholder="Search ideas"
              size="S"
              width="fill"
            />
          </>
        }
        list={
          <ListView
            aria-label="Ideas"
            items={ideas}
            selectionMode="single"
            selectedKeys={selected === null ? [] : [selected]}
            // Pressing the chosen idea again keeps it: the detail never goes blank. A
            // phone's ← clears the choice (onBack).
            onSelectionChange={(keys) => {
              const [key] = [...keys];
              if (key !== undefined) setSelected(String(key));
            }}
          >
            {(item) => (
              <ListViewItem id={item.id} textValue={item.name}>
                <Stack gap="space-50">
                  <Flex justifyContent="space-between" gap="space-200">
                    <Text variant="label">{item.name}</Text>
                    {item.decision === null ? (
                      <Badge fillStyle="dashed">Undecided</Badge>
                    ) : (
                      <Badge>{item.decision}</Badge>
                    )}
                  </Flex>
                  <Text variant="caption" tone="secondary">
                    {`${item.stage} · ${item.proposer} · ${item.updated}`}
                  </Text>
                  <Flex gap="space-100" alignItems="center">
                    <CheckDots checks={dots(item.checks)} size="S" />
                    <Text variant="caption" tone="secondary">
                      {item.missing ?? "All checks done"}
                    </Text>
                  </Flex>
                </Stack>
              </ListViewItem>
            )}
          </ListView>
        }
        listNote={
          <Text variant="body-sm" tone="secondary">
            {"1 dropped idea hidden · "}
            <Link href="#show-dropped">Show</Link>
          </Text>
        }
        detail={
          idea === undefined ? null : (
            <Stack gap="space-300">
              <Stack gap="space-100">
                <Flex gap="space-200" alignItems="center">
                  {idea.decision === null ? (
                    <Badge fillStyle="dashed">Undecided</Badge>
                  ) : (
                    <Badge>{idea.decision}</Badge>
                  )}
                  <Text variant="caption" tone="secondary">
                    {`${
                      idea.latest === null
                        ? ""
                        : `Latest decision ${idea.latest.date} · `
                    }Stage: ${idea.stage} · ${idea.proposer}`}
                  </Text>
                </Flex>
                <Heading level={2}>{idea.name}</Heading>
                <Text tone="secondary">{idea.concept}</Text>
              </Stack>
              {idea.hasNumbers === true && (
                <MetricGroup
                  aria-label={`Key numbers of ${idea.name}`}
                  variant="pair"
                >
                  <MetricTile label="Startup costs" value="₱145,000+" />
                  <MetricTile label="Break-even" value="14.4+" unit="/ day" />
                  <MetricTile
                    label="Expected profit"
                    value="≤ ₱37,000"
                    unit="/ mo"
                  />
                  <MetricTile label="Payback" value="3.9+" unit="months" />
                </MetricGroup>
              )}
              <Stack gap="space-100">
                <Heading level={3} variant="label">
                  Checks
                </Heading>
                <RowList aria-label={`Checks of ${idea.name}`}>
                  {idea.checks.map((state, index) => (
                    <RowListItem
                      key={checkNames[index]}
                      start={<MoonGlyph state={state} />}
                      end={idea.checkEnds?.[index] ?? endOf[state]}
                    >
                      {checkNames[index]}
                    </RowListItem>
                  ))}
                </RowList>
              </Stack>
              <Text variant="body-sm" tone="secondary">
                {idea.latest === null || idea.decision === null
                  ? idea.plans
                  : `${idea.plans} Latest decision: ${idea.decision} on ${idea.latest.date} — “${idea.latest.reason}”`}
              </Text>
              <Flex>
                <Button variant="primary">
                  Open validation
                  <ArrowRight />
                </Button>
              </Flex>
            </Stack>
          )
        }
        listLabel="Ideas"
        onBack={() => setSelected(null)}
      />
    </MockupFrame>
  );
}

/**
 * The template's two questions under s15's cards (V.04.SURVIVOR_PATTERNS and
 * V.04.FAILURE_PATTERNS in data/templates/bcdx/validation.json).
 */
const patternQuestions = [
  { id: "survivor", title: "Survivor Patterns", question: "Survivor Patterns" },
  { id: "failure", title: "Failure Patterns", question: "Failure Patterns" },
];

/** 15 Competitors (s15-competitors.html): pattern E. */
export function CompetitorsScreen() {
  const [view, setView] = useState<"cards" | "table">("cards");
  const [current, setCurrent] = useState<string | null>(null);
  return (
    <MockupFrame
      current="ideas"
      crumbs={["Ideas", "Bacolod Health Bowl", "04 Competitors"]}
      back="Validation"
      saveState="saved"
      comments={1}
      hasHistory
    >
      <CardComparePattern
        header={<Heading level={1}>04 Competitors</Heading>}
        count={
          <>
            <MoonGlyph state="fact" />
            {`${competitors.length} competitors · aim for 3–5`}
          </>
        }
        primaryAction={
          <Button variant="secondary">
            <Plus />
            Add competitor
          </Button>
        }
        view={view}
        onViewChange={setView}
        cards={
          <CardView
            aria-label="Competitors"
            items={competitors}
            onAction={() => {}}
            addItem={{ label: "Add competitor", onAction: () => {} }}
          >
            {(competitor) => (
              <Card
                id={competitor.id}
                textValue={competitor.name}
                eyebrow={competitor.type}
                title={competitor.name}
                figure={competitor.price ?? "No price"}
                figureDescription={competitor.note}
                isFigurePlaceholder={competitor.price === null}
                details={competitor.details.map(([label, value]) => ({
                  id: String(label),
                  label,
                  value: value ?? (
                    <Text variant="body-sm" tone="tertiary">
                      Empty
                    </Text>
                  ),
                }))}
                footer={competitor.sources}
                openThreadCount={competitor.comments}
                actions={
                  <ActionMenu aria-label={`Card actions of ${competitor.name}`}>
                    <MenuItem id="edit">Edit</MenuItem>
                    <MenuItem id="delete">Delete</MenuItem>
                  </ActionMenu>
                }
              />
            )}
          </CardView>
        }
        table={
          <TableView
            aria-label="Competitors in a table"
            columns={[
              { id: "field", name: "Field", isRowHeader: true },
              ...competitors.map((item) => ({ id: item.id, name: item.name })),
            ]}
            items={[
              { id: "type", name: "Type" },
              { id: "price", name: "Price" },
            ]}
            renderCell={(field, column) => {
              if (column === "field") return field.name;
              const item = competitors.find((rival) => rival.id === column);
              return field.id === "type" ? item?.type : (item?.price ?? "—");
            }}
          />
        }
      >
        <Stack gap="space-100">
          <Heading level={2} variant="label">
            Patterns
          </Heading>
          <QuestionList>
            {patternQuestions.map((item) => (
              <QuestionListItem key={item.id}>
                <QuestionCard
                  title={item.title}
                  question={item.question}
                  headingLevel={3}
                  mode={current === item.id ? "focused" : "quiet"}
                  status={{ state: "empty", label: "Empty" }}
                  onFocusRequest={() => setCurrent(item.id)}
                >
                  <TextArea
                    aria-label={`Answer to ${item.title}`}
                    width="full"
                  />
                </QuestionCard>
              </QuestionListItem>
            ))}
          </QuestionList>
        </Stack>
      </CardComparePattern>
    </MockupFrame>
  );
}

/** 17 Costs (s17-costs.html): pattern F. */
export function CostsScreen() {
  return (
    <MockupFrame
      current="ideas"
      crumbs={["Ideas", "Bacolod Health Bowl", "05 Costs"]}
      back="Validation"
      saveState="saved"
      comments={0}
      hasHistory
    >
      <WorksheetPattern
        header={
          <Flex gap="space-300" alignItems="baseline" wrap>
            <Flex gap="space-50" alignItems="center">
              <Heading level={1}>05 Costs</Heading>
              <ActionButton isQuiet aria-label="Switch section">
                <ChevronDown />
              </ActionButton>
            </Flex>
            <Text tone="secondary">
              What it takes to open, to run each month, and to make each sale.
            </Text>
          </Flex>
        }
        inputs={
          <>
            <CostTable
              kind="startup"
              title="Startup costs"
              unit="one time"
              total={{
                label: "Subtotal",
                value: "₱145,000+",
                note: "3 Unknown, 1 Empty",
              }}
            />
            <CostTable
              kind="monthly"
              title="Monthly fixed costs"
              unit="every month"
              total={{ label: "Subtotal", value: "₱50,000" }}
            />
            <CostTable
              kind="variable"
              title="Variable costs"
              unit="per sale"
              total={{ label: "Per sale", value: "₱104.00+", note: "3 Empty" }}
            />
          </>
        }
        resultsTitle="Totals"
        results={
          <Stack gap="space-200">
            <MetricGroup aria-label="Totals" variant="column">
              <MetricTile
                label="Startup"
                value="₱145,000+"
                supplement="Lower bound · 3 Unknown, 1 Empty"
              />
              <MetricTile label="Monthly fixed" value="₱50,000" />
              <MetricTile
                label="Variable"
                value="₱104.00+"
                unit="/ sale"
                supplement="Lower bound · 3 Empty"
              />
              <MetricTile
                label="Break-even"
                value="14.4+"
                unit="/ day"
                supplement="At ₱220 a sale"
              />
            </MetricGroup>
            <Link href="#scenarios">
              <Flex gap="space-50" alignItems="center">
                Unit Economics & Scenarios
                <IconSlot size="XS">
                  <ArrowRight />
                </IconSlot>
              </Flex>
            </Link>
          </Stack>
        }
        summary={
          <Flex columnGap="space-100" alignItems="baseline" wrap>
            {[
              ["Startup", "₱145,000+", ""],
              ["Monthly", "₱50,000", ""],
              ["BE", "14.4+", "/day"],
            ].map(([label, value, unit]) => (
              <Text key={label} variant="caption" tone="secondary">
                {`${label} `}
                <Text variant="number-sm" tone="primary">
                  <strong>{value}</strong>
                </Text>
                {unit}
              </Text>
            ))}
          </Flex>
        }
      />
    </MockupFrame>
  );
}
