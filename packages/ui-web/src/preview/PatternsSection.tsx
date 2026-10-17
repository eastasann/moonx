import type { PitchSlide } from "@moonx/schemas";
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "../components/Button";
import { Card, CardView } from "../components/Card";
import { fauLabel } from "../components/FauPicker";
import { Heading } from "../components/Heading";
import { Link } from "../components/Link";
import { ListView, ListViewItem } from "../components/ListView";
import { MetricGroup, MetricTile } from "../components/MetricTile";
import { MoonGlyph } from "../components/MoonGlyph";
import { QuestionCard } from "../components/QuestionCard";
import { Radio, RadioGroup } from "../components/RadioGroup";
import { RowList, RowListItem } from "../components/RowList";
import { Slide } from "../components/Slide";
import { Steps } from "../components/Steps";
import { TableView } from "../components/TableView";
import { Text } from "../components/Text";
import { TextArea, TextField } from "../components/TextField";
import { Well } from "../components/Well";
import { Stack } from "../layout/Flex";
import { CardComparePattern } from "../patterns/CardComparePattern";
import { FocusPattern } from "../patterns/FocusPattern";
import { HubPattern } from "../patterns/HubPattern";
import { ListDetailPattern } from "../patterns/ListDetailPattern";
import { PresentationPattern } from "../patterns/PresentationPattern";
import { PublicPattern, PublicSection } from "../patterns/PublicPattern";
import { QuestionFormPattern } from "../patterns/QuestionFormPattern";
import { SettingsPattern } from "../patterns/SettingsPattern";
import { StepsPattern } from "../patterns/StepsPattern";
import { WorksheetPattern } from "../patterns/WorksheetPattern";
import { footer, slides } from "./CustomSection";
import { Section, Specimen } from "./parts";
import * as styles from "./preview.css";

// The layout patterns of design-spec 4.1, each in a box of its own, with content shaped
// like the screens that use it. E2E measures where their parts land at each width.

/** A pattern's place in the gallery: a box the pattern fills, as it fills the body. */
function PatternBox({ children }: { children: ReactNode }) {
  return <div className={styles.patternBox}>{children}</div>;
}

export function HubPatternSection() {
  return (
    <Section title="HubPattern">
      <PatternBox>
        <HubPattern
          header={
            <>
              <Heading level={3}>Piaya Gift Box Delivery</Heading>
              <Text tone="secondary">
                Corporate gift boxes of Bacolod piaya, delivered same day.
              </Text>
            </>
          }
          actions={<Button variant="secondary">Edit summary</Button>}
          primaryAction={<Button variant="primary">Decide</Button>}
          metrics={
            <MetricGroup aria-label="Key numbers of the hub">
              <MetricTile label="Startup costs" value="₱169,500" />
              <MetricTile label="Break-even" value="6.9" unit="/ day" />
              <MetricTile label="Expected profit" value="₱18,490" unit="/ mo" />
              <MetricTile label="Payback" value="9.2" unit="months" />
            </MetricGroup>
          }
          blocks={[
            {
              id: "next",
              column: "main",
              content: (
                <Stack gap="space-100">
                  <Heading level={4} variant="label">
                    Next steps
                  </Heading>
                  <RowList ordered aria-label="Hub next steps">
                    <RowListItem href="#hub-next-1" isEmphasized>
                      Classify answers (3)
                    </RowListItem>
                    <RowListItem href="#hub-next-2">Check permits</RowListItem>
                  </RowList>
                </Stack>
              ),
            },
            {
              id: "checks",
              column: "main",
              content: (
                <Stack gap="space-100">
                  <Heading level={4} variant="label">
                    Checks
                  </Heading>
                  <Text>4 of 6 checks done</Text>
                </Stack>
              ),
            },
            {
              id: "sections",
              column: "aside",
              content: (
                <Stack gap="space-100">
                  <Heading level={4} variant="label">
                    Sections
                  </Heading>
                  <RowList aria-label="Hub sections">
                    <RowListItem
                      href="#hub-s01"
                      start={<MoonGlyph value={0.8} />}
                      end={<Text variant="number">8/10</Text>}
                    >
                      01 Customer & Problem
                    </RowListItem>
                  </RowList>
                </Stack>
              ),
            },
            {
              id: "summary",
              column: "main",
              content: (
                <Stack gap="space-100">
                  <Heading level={4} variant="label">
                    Summary
                  </Heading>
                  <Text>Customer / Problem / Solution / Market type</Text>
                </Stack>
              ),
            },
            {
              id: "decisions",
              column: "aside",
              content: (
                <Stack gap="space-100">
                  <Heading level={4} variant="label">
                    Decisions
                  </Heading>
                  <Text>Hold · Sep 30 · Ana</Text>
                </Stack>
              ),
            },
          ]}
        />
      </PatternBox>
    </Section>
  );
}

export function FocusPatternSection() {
  return (
    <Section title="FocusPattern">
      <PatternBox>
        <FocusPattern
          header={<Heading level={3}>Decide on Piaya Gift Box</Heading>}
          actions={
            <>
              <Button variant="secondary" isQuiet>
                Cancel
              </Button>
              <Button variant="primary">Save decision</Button>
            </>
          }
        >
          <Well aria-label="Focus material">
            <Text>Break-even 6.9 / day · 4 of 6 checks done</Text>
          </Well>
          <RadioGroup label="Focus decision" defaultValue="hold">
            <Radio value="proceed">Proceed</Radio>
            <Radio value="hold">Hold</Radio>
            <Radio value="drop">Drop</Radio>
          </RadioGroup>
        </FocusPattern>
      </PatternBox>
    </Section>
  );
}

const formQuestions = [
  {
    id: "WHO",
    question: "Who exactly is the customer?",
    answer: "Office workers in Bacolod who buy pasalubong for family.",
    state: "assumption" as const,
  },
  {
    id: "WHY THEM",
    question: "Why this customer first?",
    answer: "They travel often and bring gifts back home.",
    state: "fact" as const,
  },
  {
    id: "PROBLEM",
    question: "What problem do they have?",
    answer: "",
    state: "empty" as const,
  },
];

export function QuestionFormPatternSection() {
  const [current, setCurrent] = useState<string | null>("WHO");
  return (
    <Section title="QuestionFormPattern">
      <PatternBox>
        <QuestionFormPattern
          header={
            <Stack gap="space-100">
              <Heading level={3}>01 Customer & Problem</Heading>
              <Text tone="secondary">Be specific about who pays.</Text>
            </Stack>
          }
          questionIds={formQuestions.map((item) => item.id)}
          currentId={current}
          onCurrentChange={setCurrent}
          renderQuestion={(id, mode) => {
            const item = formQuestions.find((entry) => entry.id === id);
            if (item === undefined) return null;
            return (
              <QuestionCard
                title={`Form ${item.id}`}
                question={item.question}
                headingLevel={4}
                mode={mode}
                status={{
                  state: item.state,
                  label: fauLabel(item.state, {
                    confidence: "medium",
                    evidenceCount: 2,
                  }),
                }}
                excerpt={item.answer === "" ? null : item.answer}
                onFocusRequest={() => setCurrent(item.id)}
              >
                <TextArea
                  aria-label={`Form answer ${item.id}`}
                  defaultValue={item.answer}
                  placeholder="Write your answer…"
                  width="full"
                />
              </QuestionCard>
            );
          }}
          footer={
            <>
              <Button variant="secondary">Previous section</Button>
              <Button variant="secondary">Next: 02 Market</Button>
            </>
          }
          isAnswered={(id) =>
            formQuestions.find((item) => item.id === id)?.answer !== ""
          }
        />
      </PatternBox>
    </Section>
  );
}

const ideaList = [
  { id: "piaya", name: "Piaya Gift Box Delivery", meta: "Planning · Proceed" },
  { id: "bowl", name: "Bacolod Health Bowl", meta: "Validation · Hold" },
  { id: "bike", name: "Mobile Bike Repair", meta: "Validation · Undecided" },
];

export function ListDetailPatternSection() {
  const [selected, setSelected] = useState<string | null>("piaya");
  const idea = ideaList.find((item) => item.id === selected);
  return (
    <Section title="ListDetailPattern">
      <PatternBox>
        <ListDetailPattern
          header={<Heading level={3}>Ideas</Heading>}
          list={
            <ListView
              aria-label="Pattern ideas"
              items={ideaList}
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
                <Text tone="secondary">{idea.meta}</Text>
              </Stack>
            )
          }
          listLabel="Ideas"
          onBack={() => setSelected(null)}
          newItem={{ label: "New idea", onPress: () => {} }}
        />
      </PatternBox>
      <Specimen name="hasDetail={false}: 8 Notifications, the list alone">
        <PatternBox>
          <ListDetailPattern
            hasDetail={false}
            header={<Heading level={3}>Notifications</Heading>}
            list={
              <ListView aria-label="Pattern notifications" onAction={() => {}}>
                <ListViewItem id="n1" textValue="Paolo mentioned you">
                  <Text>Paolo mentioned you on 01 WHO · Piaya Gift Box</Text>
                </ListViewItem>
                <ListViewItem id="n2" textValue="Ana recorded Hold">
                  <Text>Ana recorded Hold on Piaya Gift Box</Text>
                </ListViewItem>
              </ListView>
            }
          />
        </PatternBox>
      </Specimen>
    </Section>
  );
}

const rivals = [
  { id: "kiosk", name: "Airport kiosk", type: "Direct", price: "₱450" },
  { id: "bakeshop", name: "Bakeshop boxes", type: "Indirect", price: "₱380" },
  { id: "home", name: "Home bakers", type: "Substitute", price: "₱300" },
];

const comparedFields = [
  { id: "type", name: "Type" },
  { id: "price", name: "Price" },
];

export function CardComparePatternSection() {
  const [view, setView] = useState<"cards" | "table">("cards");
  return (
    <Section title="CardComparePattern">
      <PatternBox>
        <CardComparePattern
          header={<Heading level={3}>Competitors & alternatives</Heading>}
          count={
            <>
              <MoonGlyph state="fact" />
              <Text tone="secondary">3 competitors · aim for 3–5</Text>
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
            <CardView aria-label="Compared rivals" items={rivals}>
              {(rival) => (
                <Card
                  id={rival.id}
                  textValue={rival.name}
                  title={rival.name}
                  description={rival.type}
                >
                  <Text variant="number">{rival.price}</Text>
                </Card>
              )}
            </CardView>
          }
          table={
            <TableView
              aria-label="Compared in a table"
              columns={[
                { id: "field", name: "Field", isRowHeader: true },
                ...rivals.map((rival) => ({ id: rival.id, name: rival.name })),
              ]}
              items={comparedFields}
              renderCell={(field, column) => {
                if (column === "field") return field.name;
                const rival = rivals.find((item) => item.id === column);
                return field.id === "type" ? rival?.type : rival?.price;
              }}
            />
          }
        />
      </PatternBox>
    </Section>
  );
}

const costs = [
  { id: "rent", name: "Rent", amount: "₱15,000" },
  { id: "permits", name: "Permits / Registration", amount: "₱4,500" },
];

export function WorksheetPatternSection() {
  return (
    <Section title="WorksheetPattern">
      <PatternBox>
        <WorksheetPattern
          header={<Heading level={3}>05 Costs</Heading>}
          inputs={
            <TableView
              aria-label="Worksheet costs"
              columns={[
                { id: "name", name: "Item", isRowHeader: true },
                { id: "amount", name: "Amount", numeric: true },
              ]}
              items={costs}
              renderCell={(row, column) =>
                column === "name" ? row.name : row.amount
              }
            />
          }
          resultsTitle="Totals"
          results={
            <Stack gap="space-300">
              <MetricTile label="Startup total" value="₱19,500" />
              <MetricTile label="Monthly fixed" value="₱32,000" />
            </Stack>
          }
          summary={<Text variant="number">Startup total ₱19,500</Text>}
        />
      </PatternBox>
    </Section>
  );
}

export function StepsPatternSection() {
  return (
    <Section title="StepsPattern">
      <PatternBox>
        <StepsPattern
          header={<Heading level={3}>Import from AI</Heading>}
          steps={
            <Steps
              aria-label="Pattern import steps"
              steps={[
                { id: "paste", label: "Paste" },
                { id: "sort", label: "Sort" },
                { id: "review", label: "Review" },
                { id: "apply", label: "Apply" },
              ]}
              currentId="review"
              doneLabel="completed"
            />
          }
          comparisons={[
            {
              id: "who",
              code: "01 · WHO",
              question: "Who is the primary paying customer?",
              before: (
                <Stack gap="space-100">
                  <Heading level={4} variant="label">
                    Current
                  </Heading>
                  <Text>Office workers who buy pasalubong.</Text>
                </Stack>
              ),
              after: (
                <Stack gap="space-100">
                  <Heading level={4} variant="label">
                    From AI
                  </Heading>
                  <Text>Office workers in Bacolod who buy pasalubong.</Text>
                </Stack>
              ),
            },
          ]}
          actions={
            <>
              <Button variant="secondary">Back</Button>
              <Button variant="primary">Apply 1 change</Button>
            </>
          }
        />
      </PatternBox>
    </Section>
  );
}

export function SettingsPatternSection() {
  return (
    <Section title="SettingsPattern">
      <PatternBox>
        <SettingsPattern
          header={<Heading level={3}>Account</Heading>}
          groups={[
            {
              id: "profile",
              title: "Profile",
              description: (
                <Text variant="body-sm" tone="secondary">
                  Shown to your teammates.
                </Text>
              ),
              content: (
                <TextField label="Display name" defaultValue="Ana Reyes" />
              ),
            },
            {
              id: "display",
              title: "Display",
              content: (
                <RadioGroup label="Appearance" defaultValue="system">
                  <Radio value="system">System</Radio>
                  <Radio value="light">Light</Radio>
                  <Radio value="dark">Dark</Radio>
                </RadioGroup>
              ),
            },
          ]}
        />
      </PatternBox>
    </Section>
  );
}

export function PresentationPatternSection() {
  const [current, setCurrent] = useState("business_model");
  const slide =
    slides.find((item) => item.key === current) ?? (slides[0] as PitchSlide);
  return (
    <Section title="PresentationPattern">
      <PatternBox>
        <PresentationPattern
          header={
            <Heading level={3} variant="heading-1-toolbar">
              Pitch Deck
            </Heading>
          }
          primaryAction={<Button variant="primary">Download PDF</Button>}
          slides={slides.map((item) => ({
            id: item.key,
            title: item.title.text,
            thumbnail: (
              <Slide slide={item} footer={footer} currency="PHP" isThumbnail />
            ),
          }))}
          currentId={slide.key}
          onCurrentChange={setCurrent}
          slide={<Slide slide={slide} footer={footer} currency="PHP" />}
          notes={
            <Text variant="body-long" tone="secondary">
              Say: one box sells for ₱450 and leaves ₱210.
            </Text>
          }
        />
      </PatternBox>
    </Section>
  );
}

export function PublicPatternSection() {
  return (
    <Section title="PublicPattern">
      <PatternBox>
        <PublicPattern
          action={<Button variant="secondary">Log in</Button>}
          footerLinks={
            <>
              <Link href="#public-privacy" isQuiet>
                Privacy
              </Link>
              <Link href="#public-support" isQuiet>
                Support
              </Link>
            </>
          }
        >
          <PublicSection
            layout="hero"
            aside={
              <Well aria-label="Public example">
                <Text>Validate an idea before you spend on it.</Text>
              </Well>
            }
          >
            <Stack gap="space-200">
              <Heading level={3} variant="display">
                Start a local business, one step at a time
              </Heading>
              <Text variant="body-long">
                From knowing yourself to a plan you can show.
              </Text>
            </Stack>
          </PublicSection>
        </PublicPattern>
      </PatternBox>
    </Section>
  );
}
