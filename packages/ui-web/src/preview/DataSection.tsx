import type { FauState } from "@moonx/schemas";
import {
  avatarSizes,
  cardSizes,
  densities,
  moonGlyphSizes,
  sizes,
} from "@moonx/ui-tokens";
import { useState } from "react";
import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { Card, CardView } from "../components/Card";
import { CheckDots } from "../components/CheckDots";
import { FauPicker, fauLabel } from "../components/FauPicker";
import { ListView, ListViewItem } from "../components/ListView";
import { Meter } from "../components/Meter";
import { MoonGlyph, type MoonState } from "../components/MoonGlyph";
import { NumberField } from "../components/NumberField";
import { StatusLight } from "../components/StatusLight";
import { type TableColumn, TableView } from "../components/TableView";
import { Text } from "../components/Text";
import { TextField } from "../components/TextField";
import { Tree, TreeItem } from "../components/Tree";
import { Flex, Stack } from "../layout/Flex";
import { Section, Specimen } from "./parts";

const states: MoonState[] = [
  "fact",
  "assumption",
  "unknown",
  "unclassified",
  "empty",
  "done",
  "partial",
  "not-started",
];

export function MoonGlyphSection() {
  return (
    <Section title="MoonGlyph and CheckDots">
      {moonGlyphSizes.map((size) => (
        <Specimen key={size} name={`MoonGlyph state, size ${size}`}>
          <Flex gap="space-300" wrap alignItems="center">
            {states.map((state) => (
              <Flex key={state} gap="space-75" alignItems="center">
                <MoonGlyph state={state} size={size} />
                <Text variant="caption">{`${state} ${size}`}</Text>
              </Flex>
            ))}
          </Flex>
        </Specimen>
      ))}
      <Specimen name="value 0 / 0.25 / 0.5 / 0.8 / 1 (a section's progress)">
        <Flex gap="space-300" wrap alignItems="center">
          {[0, 0.25, 0.5, 0.8, 1].map((value) => (
            <Flex key={value} gap="space-75" alignItems="center">
              <MoonGlyph value={value} />
              <Text variant="caption">{`${value * 10}/10 answered`}</Text>
            </Flex>
          ))}
        </Flex>
      </Specimen>
      <Specimen name="isCurrent (11's dots on a phone)">
        <Flex gap="space-200" alignItems="center">
          <MoonGlyph state="fact" />
          <MoonGlyph state="fact" />
          <MoonGlyph state="empty" isCurrent />
          <MoonGlyph state="empty" />
        </Flex>
      </Specimen>
      {moonGlyphSizes.map((size) => (
        <Specimen key={size} name={`CheckDots size ${size}`}>
          <CheckDots
            size={size}
            checks={[
              { name: "Competitors (3–5)", state: "done" },
              { name: "Local price range", state: "done" },
              { name: "Startup & monthly costs", state: "partial" },
              { name: "Break-even volume", state: "done" },
              { name: "Permits", state: "not-started" },
              { name: `Demand or problem signal ${size}`, state: "done" },
            ]}
          />
        </Specimen>
      ))}
    </Section>
  );
}

/** A photo that needs no request: a filled circle, as an image. */
const photo = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#555d72"/><circle cx="5" cy="4" r="2" fill="#f4f5f8"/><rect x="2" y="7" width="6" height="3" rx="1.5" fill="#f4f5f8"/></svg>',
)}`;

export function AvatarSection() {
  return (
    <Section title="Avatar">
      {avatarSizes.map((size) => (
        <Specimen key={size} name={`size ${size}: initials, a photo`}>
          <Flex gap="space-200" alignItems="center">
            <Avatar name="Ana Reyes" size={size} />
            <Avatar name="Kenji" size={size} />
            <Avatar
              name="Paolo Gonzaga"
              src={photo}
              alt={`Paolo Gonzaga ${size}`}
              size={size}
            />
            <Text>Ana Reyes</Text>
          </Flex>
        </Specimen>
      ))}
    </Section>
  );
}

export function MeterSection() {
  return (
    <Section title="Meter">
      {sizes.map((size) => (
        <Specimen key={size} name={`size ${size}`}>
          <Meter
            size={size}
            label={`Fact / Assumption / Unknown ${size}`}
            segments={[
              { state: "fact", label: "Fact", count: 12 },
              {
                state: "assumption",
                label: "Assumption",
                count: 9,
                detail: "(L3 M4 H2)",
              },
              { state: "unknown", label: "Unknown", count: 2 },
              { state: "unclassified", label: "Unclassified", count: 3 },
              { state: "empty", label: "Empty", count: 18 },
            ]}
          />
        </Specimen>
      ))}
      <Specimen name="a new idea: Empty only">
        <Meter
          label="Fact / Assumption / Unknown (new)"
          segments={[{ state: "empty", label: "Empty", count: 26 }]}
        />
      </Specimen>
    </Section>
  );
}

interface CostRow {
  id: string;
  name: string;
  amount: string;
  state: FauState;
  note: string;
}

const costColumns: TableColumn[] = [
  { id: "mark", name: "State", isMark: true },
  { id: "name", name: "Item", isRowHeader: true },
  { id: "amount", name: "Amount", numeric: true },
  { id: "fau", name: "F/A/U" },
  { id: "note", name: "Note" },
];

export function TableViewSection() {
  const [rows, setRows] = useState<CostRow[]>([
    {
      id: "rent",
      name: "Rent",
      amount: "15,000",
      state: "assumption",
      note: "Lacson St. stall",
    },
    {
      id: "permits",
      name: "Permits / Registration",
      amount: "4,500",
      state: "fact",
      note: "",
    },
    {
      id: "packaging",
      name: "Packaging",
      amount: "",
      state: "empty",
      note: "",
    },
  ]);
  const [chosen, setChosen] = useState<Set<string | number>>(new Set(["d2"]));
  // A phone opens a row's sheet; here the pressed row is shown instead.
  const [opened, setOpened] = useState<string | number | null>(null);
  const edit = (id: string, change: Partial<CostRow>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...change } : row)),
    );
  return (
    <Section title="TableView">
      <Specimen name="editable rows: press a row or Enter on a cell to edit; Escape returns">
        <TableView
          aria-label="Startup costs"
          columns={costColumns}
          items={rows}
          isRowEditable={() => true}
          onRowAction={setOpened}
          renderCell={(row, column, { isEditing, isCard }) => {
            if (column === "mark") {
              // A FauPicker's cell shows its label; the row's moon is here.
              return (
                <MoonGlyph
                  state={row.state === "fact_no_evidence" ? "fact" : row.state}
                  size="S"
                />
              );
            }
            if (column === "name") {
              return isEditing ? (
                <TextField
                  aria-label={`Item ${row.id}`}
                  value={row.name}
                  onChange={(name) => edit(row.id, { name })}
                  width="full"
                />
              ) : (
                row.name
              );
            }
            if (column === "amount") {
              return isEditing ? (
                <NumberField
                  aria-label={`Amount of ${row.name}`}
                  currency="PHP"
                  value={row.amount}
                  onChange={(amount) => edit(row.id, { amount })}
                  width="full"
                />
              ) : row.amount === "" ? (
                "—"
              ) : (
                `₱${row.amount}`
              );
            }
            if (column === "fau") {
              return (
                <FauPicker
                  aria-label={`F/A/U of ${row.name}`}
                  state={row.state}
                  confidence={row.state === "assumption" ? "medium" : null}
                  evidenceCount={row.state === "fact" ? 1 : 0}
                  hasValue={row.amount !== ""}
                  // A phone's row presses as a whole: its F/A/U is shown, and set in
                  // the row's sheet.
                  isReadOnly={isCard}
                  size="S"
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
                      amount: fau === "unknown" ? "" : row.amount,
                    })
                  }
                  onFactPress={() => edit(row.id, { state: "fact" })}
                />
              );
            }
            return isEditing ? (
              <TextField
                aria-label={`Note of ${row.name}`}
                value={row.note}
                onChange={(note) => edit(row.id, { note })}
                width="full"
              />
            ) : (
              row.note
            );
          }}
        />
        <Text variant="caption" tone="secondary">
          {`Row opened on a phone: ${opened ?? "none"}`}
        </Text>
      </Specimen>
      {densities.map((density) => (
        <Specimen key={density} name={`density="${density}", single selection`}>
          <TableView
            aria-label={`Decision log ${density}`}
            density={density}
            selectionMode="single"
            selectedKeys={chosen}
            onSelectionChange={setChosen}
            columns={[
              { id: "date", name: "Date", isRowHeader: true },
              { id: "decision", name: "Decision" },
              { id: "by", name: "By" },
            ]}
            items={[
              { id: "d1", date: "Sep 30", decision: "Hold", by: "Ana" },
              { id: "d2", date: "Sep 12", decision: "Proceed", by: "Kenji" },
            ]}
            renderCell={(row, column) =>
              column === "decision" ? (
                <Badge>{row.decision}</Badge>
              ) : (
                row[column as "date" | "by"]
              )
            }
            textValue={(row) => row.date}
          />
        </Specimen>
      ))}
      <Specimen name='layout="cards"'>
        <TableView
          aria-label="Scenarios as cards"
          layout="cards"
          columns={[
            { id: "scenario", name: "Scenario", isRowHeader: true },
            { id: "units", name: "Units / day", numeric: true },
            { id: "profit", name: "Operating profit / month", numeric: true },
          ]}
          items={[
            {
              id: "c",
              scenario: "Conservative",
              units: "8",
              profit: "₱-2,400",
            },
            { id: "e", scenario: "Expected", units: "15", profit: "₱18,490" },
          ]}
          renderCell={(row, column) => row[column as "scenario"]}
        />
      </Specimen>
      <Specimen name="renderEmptyState">
        <TableView
          aria-label="No rows"
          columns={costColumns}
          items={[]}
          renderCell={() => null}
          renderEmptyState={() => <Text tone="secondary">No costs yet.</Text>}
        />
      </Specimen>
    </Section>
  );
}

const ideas = [
  {
    id: "piaya",
    name: "Piaya Gift Box Delivery",
    meta: "Planning · Ana · updated 2h ago",
  },
  {
    id: "bowl",
    name: "Bacolod Health Bowl",
    meta: "Validation · Kenji · 1d ago",
  },
];

export function ListViewSection() {
  const [chosen, setChosen] = useState<Set<string | number>>(
    new Set(["piaya"]),
  );
  return (
    <Section title="ListView">
      {densities.map((density) => (
        <Specimen key={density} name={`density="${density}", single selection`}>
          <ListView
            aria-label={`Ideas ${density}`}
            density={density}
            items={ideas}
            selectionMode="single"
            selectedKeys={chosen}
            onSelectionChange={setChosen}
          >
            {(idea) => (
              <ListViewItem id={idea.id} textValue={idea.name}>
                <Text variant="label">{idea.name}</Text>
                <Text variant="caption" tone="secondary">
                  {idea.meta}
                </Text>
              </ListViewItem>
            )}
          </ListView>
        </Specimen>
      ))}
      <Specimen name="onAction: rows end in ›">
        <ListView aria-label="Notifications" onAction={() => {}}>
          <ListViewItem id="n1" textValue="Paolo mentioned you">
            <Text>Paolo mentioned you on 01 WHO · Piaya Gift Box</Text>
          </ListViewItem>
          <ListViewItem id="n2" textValue="Ana recorded Hold">
            <Text>Ana recorded Hold on Piaya Gift Box</Text>
          </ListViewItem>
        </ListView>
      </Specimen>
    </Section>
  );
}

const competitors = [
  { id: "a", name: "Airport kiosk", type: "Direct Competitor", price: "₱450" },
  {
    id: "b",
    name: "Bakeshop boxes",
    type: "Indirect Competitor",
    price: "₱380",
  },
  { id: "c", name: "Home bakers", type: "Substitute", price: "₱300" },
];

export function CardSection() {
  const [slide, setSlide] = useState<Set<string | number>>(new Set(["s1"]));
  return (
    <Section title="Card and CardView">
      <Specimen name="Card size XS / S / M / L / XL">
        <Flex gap="space-300" wrap alignItems="start">
          {cardSizes.map((size) => (
            <Card
              key={size}
              size={size}
              title={`Airport kiosk ${size}`}
              description="Direct Competitor"
            >
              <Text variant="number">₱450</Text>
            </Card>
          ))}
        </Flex>
      </Specimen>
      <Specimen name='CardView size="M", onAction (15)'>
        <CardView
          aria-label="Competitors"
          items={competitors}
          onAction={() => {}}
        >
          {(competitor) => (
            <Card
              id={competitor.id}
              textValue={competitor.name}
              title={competitor.name}
              description={competitor.type}
            >
              <Stack gap="space-75">
                <Text variant="number">{competitor.price}</Text>
                <StatusLight variant="fact" size="S">
                  {fauLabel("fact", { evidenceCount: 2 })}
                </StatusLight>
              </Stack>
            </Card>
          )}
        </CardView>
      </Specimen>
      <Specimen name='CardView size="S", single selection (23 thumbnails)'>
        <CardView
          aria-label="Slides"
          size="S"
          selectionMode="single"
          selectedKeys={slide}
          onSelectionChange={setSlide}
          items={[
            { id: "s1", title: "1 Title" },
            { id: "s2", title: "2 Problem" },
          ]}
        >
          {(slide) => (
            <Card id={slide.id} textValue={slide.title} title={slide.title} />
          )}
        </CardView>
      </Specimen>
    </Section>
  );
}

export function TreeSection() {
  const [chosen, setChosen] = useState<Set<string | number>>(
    new Set(["01-who"]),
  );
  const [opened, setOpened] = useState("none");
  return (
    <Section title="Tree">
      {densities.map((density) => (
        <Specimen key={density} name={`density="${density}"`}>
          <Tree
            aria-label={`Template ${density}`}
            density={density}
            selectionMode="single"
            defaultExpandedKeys={["01"]}
            selectedKeys={chosen}
            onSelectionChange={setChosen}
          >
            <TreeItem
              id="01"
              textValue="01 Customer & Problem"
              title="01 Customer & Problem"
            >
              <TreeItem id="01-who" textValue="WHO" title="WHO" />
              <TreeItem id="01-why" textValue="WHY THEM" title="WHY THEM" />
            </TreeItem>
            <TreeItem id="02" textValue="02 Market" title="02 Market">
              <TreeItem id="02-ocean" textValue="OCEAN" title="OCEAN" />
            </TreeItem>
            <TreeItem id="costs" textValue="Cost rows" title="Cost rows" />
          </Tree>
        </Specimen>
      ))}
      <Specimen name="onAction: items end in ›">
        <Tree
          aria-label="Template sections"
          onAction={(key) => setOpened(String(key))}
        >
          <TreeItem
            id="s01"
            textValue="01 Customer & Problem"
            title="01 Customer & Problem"
          />
          <TreeItem id="s02" textValue="02 Market" title="02 Market" />
        </Tree>
        <Text variant="caption" tone="secondary">{`Opened: ${opened}`}</Text>
      </Specimen>
    </Section>
  );
}

export function FauPickerSection() {
  const [state, setState] = useState<FauState>("unclassified");
  const [confidence, setConfidence] = useState<
    "low" | "medium" | "high" | null
  >(null);
  const [amount, setAmount] = useState("15,000");
  const shown: [FauState, boolean][] = [
    ["empty", false],
    ["unclassified", true],
    ["fact", true],
    ["fact_no_evidence", true],
    ["assumption", true],
    ["unknown", false],
  ];
  return (
    <Section title="FauPicker">
      <Specimen name="a working cell: Fact opens M2 (here it attaches one source)">
        <Flex gap="space-300" wrap alignItems="center">
          <NumberField
            label="Rent"
            currency="PHP"
            value={amount}
            onChange={(text) => {
              setAmount(text);
              if (text === "") {
                setState(state === "unknown" ? "unknown" : "empty");
              } else if (state === "empty" || state === "unknown") {
                setState("unclassified");
              }
            }}
          />
          <FauPicker
            aria-label="F/A/U of Rent"
            state={state}
            confidence={confidence}
            evidenceCount={1}
            hasValue={amount !== ""}
            onChange={(change) => {
              setConfidence(change.confidence);
              if (change.fau === "unknown") {
                setAmount("");
                setState("unknown");
              } else if (change.fau === "assumption") {
                setState("assumption");
              } else {
                setState(amount === "" ? "empty" : "unclassified");
              }
            }}
            onFactPress={() => {
              setConfidence(null);
              setState("fact");
            }}
          />
        </Flex>
      </Specimen>
      <Specimen name="states, size S / M / L / XL">
        <Stack gap="space-200">
          {sizes.map((size) => (
            <Flex key={size} gap="space-200" wrap alignItems="center">
              {shown.map(([each, hasValue]) => (
                <FauPicker
                  key={each}
                  aria-label={`${each} ${size}`}
                  size={size}
                  state={each}
                  confidence={each === "assumption" ? "medium" : null}
                  evidenceCount={2}
                  hasValue={hasValue}
                  onChange={() => {}}
                  onFactPress={() => {}}
                />
              ))}
            </Flex>
          ))}
        </Stack>
      </Specimen>
      <Specimen name="isReadOnly (Viewer)">
        <FauPicker
          aria-label="Read only"
          isReadOnly
          state="assumption"
          confidence="high"
          hasValue
          onChange={() => {}}
          onFactPress={() => {}}
        />
      </Specimen>
    </Section>
  );
}
