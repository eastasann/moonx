import type { Confidence, FauState, PitchSlide } from "@moonx/schemas";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { Card, CardView } from "../components/Card";
import {
  DescriptionList,
  DescriptionListItem,
} from "../components/DescriptionList";
import { FauPicker } from "../components/FauPicker";
import { ActionMenu, MenuItem } from "../components/Menu";
import { MetricGroup, MetricTile } from "../components/MetricTile";
import { MoonGlyph, type MoonState } from "../components/MoonGlyph";
import { NumberField } from "../components/NumberField";
import { Radio, RadioGroup } from "../components/RadioGroup";
import { RowList, RowListItem } from "../components/RowList";
import { Slide } from "../components/Slide";
import { Steps } from "../components/Steps";
import { type TableColumn, TableView } from "../components/TableView";
import { Text } from "../components/Text";
import { TextField } from "../components/TextField";
import { IconSlot } from "../internal/IconSlot";
import { Flex, Stack } from "../layout/Flex";
import { Section, Specimen } from "./parts";
import * as styles from "./preview.css";

interface StartupCost {
  id: string;
  name: string;
  amount: string;
  state: FauState;
  confidence: Confidence | null;
  note: string;
  reduce: string;
}

/** s17-costs.html's startup costs, with its columns' widths. */
const startupColumns: TableColumn[] = [
  { id: "mark", name: "State", isMark: true },
  { id: "name", name: "Item", isRowHeader: true, width: "31%" },
  { id: "amount", name: "Amount", numeric: true, width: 120 },
  { id: "fau", name: "F/A/U", width: 178, isBelowName: true },
  { id: "note", name: "Why needed", isHiddenOnPhone: true },
  { id: "reduce", name: "Can reduce?", width: 96, isHiddenOnPhone: true },
  { id: "more", name: "Row actions", isRowActions: true },
];

const startupRows: StartupCost[] = [
  {
    id: "equipment",
    name: "Equipment",
    amount: "60,000",
    state: "fact",
    confidence: null,
    note: "Blast chiller and prep tables",
    reduce: "Partly",
  },
  {
    id: "renovation",
    name: "Renovation",
    amount: "30,000",
    state: "assumption",
    confidence: "medium",
    note: "Counter and signage",
    reduce: "Yes",
  },
  {
    id: "deposit",
    name: "Lease Deposit",
    amount: "30,000",
    state: "assumption",
    confidence: "high",
    note: "",
    reduce: "No",
  },
  {
    id: "permits",
    name: "Permits",
    amount: "",
    state: "unknown",
    confidence: null,
    note: "",
    reduce: "",
  },
  {
    id: "buffer",
    name: "Working Capital Buffer",
    amount: "",
    state: "empty",
    confidence: null,
    note: "",
    reduce: "",
  },
];

const moonOf: Record<FauState, MoonState> = {
  fact: "fact",
  fact_no_evidence: "fact",
  assumption: "assumption",
  unknown: "unknown",
  unclassified: "unclassified",
  empty: "empty",
};

function StartupCosts() {
  const [rows, setRows] = useState(startupRows);
  // A phone opens a row's sheet; here the pressed row is shown instead.
  const [opened, setOpened] = useState<string | number | null>(null);
  const edit = (id: string, change: Partial<StartupCost>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...change } : row)),
    );
  return (
    <Stack gap="space-100">
      <TableView
        aria-label="Costs to open (s17)"
        columns={startupColumns}
        items={rows}
        isRowEditable={() => true}
        onRowAction={setOpened}
        renderCell={(row, column, { isEditing, isCard }) => {
          switch (column) {
            case "mark":
              return <MoonGlyph state={moonOf[row.state]} size="S" />;
            case "name":
              return isEditing ? (
                <TextField
                  aria-label={`Item ${row.name}`}
                  value={row.name}
                  onChange={(name) => edit(row.id, { name })}
                  width="full"
                />
              ) : (
                row.name
              );
            case "amount":
              if (isEditing) {
                return (
                  <NumberField
                    aria-label={`Amount of ${row.name}`}
                    currency="PHP"
                    value={row.amount}
                    onChange={(amount) => edit(row.id, { amount })}
                    width="full"
                  />
                );
              }
              return row.amount !== "" ? (
                `₱${row.amount}`
              ) : (
                <Text tone="tertiary">
                  {row.state === "unknown" ? "Unknown" : "Empty"}
                </Text>
              );
            case "fau":
              return (
                <FauPicker
                  aria-label={`F/A/U of ${row.name}`}
                  state={row.state}
                  confidence={row.confidence}
                  evidenceCount={row.state === "fact" ? 1 : 0}
                  hasValue={row.amount !== ""}
                  // A phone's row presses as a whole: its F/A/U is shown, and set in
                  // the row's sheet.
                  isReadOnly={isCard}
                  onChange={({ fau, confidence }) =>
                    edit(row.id, {
                      state:
                        fau === "unknown"
                          ? "unknown"
                          : fau === "assumption" && confidence !== null
                            ? "assumption"
                            : row.amount === ""
                              ? "empty"
                              : "unclassified",
                      confidence,
                      amount: fau === "unknown" ? "" : row.amount,
                    })
                  }
                  onFactPress={() =>
                    edit(row.id, { state: "fact", confidence: null })
                  }
                />
              );
            case "note":
              return (
                <Text variant="body-sm" tone="secondary">
                  {row.note}
                </Text>
              );
            case "reduce":
              return row.reduce === "" ? (
                <Text tone="tertiary">—</Text>
              ) : (
                row.reduce
              );
            default:
              return (
                <ActionMenu size="S" aria-label={`Row actions of ${row.name}`}>
                  <MenuItem id="rename">Rename</MenuItem>
                  <MenuItem id="lump">Lump sum</MenuItem>
                  <MenuItem id="delete">Delete</MenuItem>
                </ActionMenu>
              );
          }
        }}
        textValue={(row) => row.name}
      />
      <Text variant="caption" tone="secondary">
        {`Row opened on a phone: ${opened ?? "none"}`}
      </Text>
    </Stack>
  );
}

export const competitors = [
  {
    id: "salad",
    type: "Direct competitor",
    name: "Salad Station",
    price: "₱240",
    note: "per bowl",
    sources: "1 source",
    comments: 0,
    details: [
      ["Target customer", "Office workers"],
      ["Offering", "Build-your-own salad bowls"],
      ["Strength", "Prime location"],
      ["Weakness", "No nutrition information"],
      ["Why chosen", "Fast and fresh"],
      ["Why they survive", "Lunch rush volume"],
    ],
  },
  {
    id: "bowl",
    type: "Direct competitor",
    name: "Bowl & Co",
    price: "₱260",
    note: "per bowl",
    sources: "No sources",
    comments: 1,
    details: [
      ["Target customer", "Students and young professionals"],
      ["Offering", "Rice and protein bowls"],
      ["Strength", "Filling portions"],
      ["Weakness", "Small menu"],
      ["Why chosen", "Taste"],
      ["Why they survive", "Loyal regulars"],
    ],
  },
  {
    id: "fastfood",
    type: "Indirect competitor",
    name: "Fast-food chains",
    price: null,
    note: null,
    sources: "No sources",
    comments: 0,
    details: [
      ["Target customer", "Everyone"],
      ["Offering", "Burgers and chicken meals"],
      ["Strength", "Price and speed"],
      ["Weakness", "Not seen as healthy"],
      ["Why chosen", "Habit"],
      ["Why they survive", "Scale"],
    ],
  },
  {
    id: "homeprep",
    type: "Substitute",
    name: "Home meal prep",
    price: null,
    note: null,
    sources: "No sources",
    comments: 0,
    details: [
      ["Target customer", "People who cook on Sundays"],
      ["Offering", "Packed lunches from home"],
      ["Strength", "Cheap"],
      ["Weakness", "Takes planning"],
      ["Why chosen", "Control over ingredients"],
      ["Why they survive", null],
    ],
  },
];

const decisionChecks = [
  {
    id: "competitors",
    state: "done" as const,
    name: "Competitors (3–5)",
    end: "Done (4)",
  },
  {
    id: "costs",
    state: "partial" as const,
    name: "Startup & monthly costs",
    end: "Partial",
    description: "1 row is Empty",
  },
  {
    id: "permits",
    state: "not-started" as const,
    name: "Permits",
    end: "Not started",
    description: "Fill the Permits cost row, or log what you found",
  },
];

const exact = (value: number) => ({
  value,
  bound: "exact" as const,
  reason: null,
});

/** s23-deck.html's slide: the five-minute Business model with its notes. */
export const businessModel: PitchSlide = {
  key: "business_model",
  type: "number",
  title: { text: "Business model", empty: false },
  subtitle: null,
  bullets: [
    {
      label: "Primary revenue stream",
      text: "Corporate gift boxes of Bacolod piaya, ordered online and delivered the same day.",
      empty: false,
    },
    {
      label: "Repeat customers",
      text: "Offices order for client visits and holidays; repeat orders come from HR teams.",
      empty: false,
    },
  ],
  numbers: [
    { label: "Price", metricKey: "selling_price", value: exact(450) },
    {
      label: "Variable cost / sale",
      metricKey: "variable_cost_per_unit",
      value: exact(218.5),
    },
    {
      label: "Contribution / sale",
      metricKey: "contribution_margin",
      value: exact(231.5),
    },
    {
      label: "Contribution margin",
      metricKey: "contribution_margin_rate",
      value: exact(0.514),
    },
  ],
  table: null,
  emptySources: [],
  shrink: 0,
  overflow: false,
  editSource: null,
  editInValidation: null,
  commentCount: 0,
};

export const importSteps = [
  { id: "paste", label: "Paste" },
  { id: "match", label: "Match" },
  { id: "review", label: "Review" },
  { id: "apply", label: "Apply" },
];

/**
 * The parts Step 22d matched to docs/mockups (13 d1-moon・17 s17-costs・15 s15-competitors・
 * 19 s19-decision・25 s25-import), with the mockups' own words, to set beside them.
 */
export function MockupDataSection() {
  const [opened, setOpened] = useState("none");
  return (
    <Section title="Mockup parts: tables, cards, metrics, rows and steps">
      <Specimen name="s17: the startup costs, the F/A/U label and its popover">
        <StartupCosts />
      </Specimen>
      <Specimen name="d1: the key numbers">
        <MetricGroup aria-label="d1 numbers">
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
      </Specimen>
      <Specimen name="s19: the key numbers in the Well">
        <MetricGroup aria-label="s19 numbers" variant="compact">
          <MetricTile label="Startup" value="₱145,000+" />
          <MetricTile label="Break-even" value="14.4+ / day" />
          <MetricTile label="Expected profit" value="≤ ₱37,000 / mo" />
          <MetricTile label="Payback" value="3.9+ mo" />
          <MetricTile label="ROI" value="≤ 306.2%" />
        </MetricGroup>
      </Specimen>
      <Specimen name="d1: Next steps, Checks and Sections">
        <Stack gap="space-400">
          <RowList ordered aria-label="d1 next list">
            <RowListItem
              href="#mock-next-1"
              isEmphasized
              description="A Fact in 01 Customer & Problem lost its research log."
            >
              Add evidence (1)
            </RowListItem>
            <RowListItem href="#mock-next-2">Classify answers (3)</RowListItem>
            <RowListItem href="#mock-next-3">
              Fill or mark 1 empty cost row
            </RowListItem>
          </RowList>
          <RowList aria-label="d1 check list">
            {decisionChecks.map((check) => (
              <RowListItem
                key={check.id}
                href={`#mock-check-${check.id}`}
                start={<MoonGlyph state={check.state} />}
                end={check.end}
                description={check.description}
              >
                {check.name}
              </RowListItem>
            ))}
          </RowList>
          <RowList aria-label="d1 section list">
            <RowListItem
              href="#mock-s01"
              start={<MoonGlyph value={0.7} />}
              end="7/10"
            >
              01 Customer & Problem
            </RowListItem>
            <RowListItem href="#mock-s03" end="5 entries">
              03 Research Log
            </RowListItem>
            <RowListItem href="#mock-s04" end="4 (3–5)">
              04 Competitors
            </RowListItem>
          </RowList>
        </Stack>
      </Specimen>
      <Specimen name="d1 and s19: the Summary">
        <DescriptionList>
          <DescriptionListItem label="Customer">
            Working professionals aged 25–40 in Bacolod who pay for convenient
            meals.
          </DescriptionListItem>
          <DescriptionListItem label="Problem">
            Healthy eating is hard to sustain because planning, cooking and
            portion control take time.
          </DescriptionListItem>
          <DescriptionListItem label="Market type">Red</DescriptionListItem>
          <DescriptionListItem label="Biggest risk">
            <Text tone="tertiary">Empty</Text>
          </DescriptionListItem>
        </DescriptionList>
      </Specimen>
      <Specimen name="s15: the competitors' cards">
        <Stack gap="space-100">
          <CardView
            aria-label="s15 cards"
            items={competitors}
            onAction={(key) => setOpened(String(key))}
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
                footer={
                  <>
                    <span>{competitor.sources}</span>
                    {competitor.comments > 0 && (
                      <Flex gap="space-50" alignItems="center">
                        <IconSlot size="XS">
                          <MessageSquare />
                        </IconSlot>
                        <span>{competitor.comments}</span>
                      </Flex>
                    )}
                  </>
                }
                actions={
                  <ActionMenu aria-label={`Card actions of ${competitor.name}`}>
                    <MenuItem id="edit">Edit</MenuItem>
                    <MenuItem id="reorder">Reorder</MenuItem>
                    <MenuItem id="delete">Delete</MenuItem>
                  </ActionMenu>
                }
              />
            )}
          </CardView>
          <Text variant="caption" tone="secondary">
            {`Card opened: ${opened}`}
          </Text>
        </Stack>
      </Specimen>
      <Specimen name="s19: the decision's choices">
        <RadioGroup
          label="Should we develop this into a full Business Plan?"
          variant="cards"
          defaultValue="hold"
        >
          <Radio value="proceed" description="Worth planning">
            Proceed
          </Radio>
          <Radio value="hold" description="Come back later">
            Hold
          </Radio>
          <Radio value="drop" description="Hide from lists">
            Drop
          </Radio>
        </RadioGroup>
      </Specimen>
      <Specimen name="s23: the slide, white with a soft shadow, and its thumbnail">
        <Stack gap="space-300">
          <div className={styles.slidePlace}>
            <Slide
              slide={businessModel}
              footer="Piaya Gift Box Delivery · v1 For advisors · Oct 12, 2026"
              currency="PHP"
            />
          </div>
          <div className={styles.thumbnailPlace}>
            <Slide
              slide={{
                ...businessModel,
                title: { text: "Business model (thumbnail)", empty: false },
              }}
              footer="Piaya Gift Box Delivery · v1 For advisors · Oct 12, 2026"
              currency="PHP"
              isThumbnail
            />
          </div>
        </Stack>
      </Specimen>
      <Specimen name="s25: the steps">
        <Steps
          aria-label="s25 steps"
          steps={importSteps}
          currentId="review"
          doneLabel="completed"
        />
      </Specimen>
    </Section>
  );
}
