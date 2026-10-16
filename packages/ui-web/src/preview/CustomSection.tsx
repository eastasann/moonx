import type { PitchSlide } from "@moonx/schemas";
import { History, MessageSquare } from "lucide-react";
import { useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { Button } from "../components/Button";
import { DiffText } from "../components/DiffText";
import { Disclosure } from "../components/Disclosure";
import { fauLabel } from "../components/FauPicker";
import {
  type MentionCandidate,
  MentionTextArea,
} from "../components/MentionTextArea";
import { MetricTile } from "../components/MetricTile";
import { MoonGlyph } from "../components/MoonGlyph";
import { Panel } from "../components/Panel";
import { QuestionCard } from "../components/QuestionCard";
import { RowList, RowListItem } from "../components/RowList";
import { Slide } from "../components/Slide";
import { Steps } from "../components/Steps";
import { Text } from "../components/Text";
import { TextArea } from "../components/TextField";
import { Flex, Stack } from "../layout/Flex";
import { Grid } from "../layout/Grid";
import { Section, Specimen } from "./parts";
import * as styles from "./preview.css";

export function MetricTileSection() {
  return (
    <Section title="MetricTile">
      <Specimen name="a value, a placeholder, a notice supplement">
        <Grid columns={{ mobile: 2, tablet: 4 }} gap="space-400">
          <MetricTile label="Startup cost" value="₱169,500+" />
          <MetricTile label="Break-even" value="6.9 / day" />
          <MetricTile
            label="Expected profit"
            value="Needs price"
            isPlaceholder
          />
          <MetricTile
            label="Payback"
            value="9.2 months"
            supplement="Contribution margin is zero or negative"
            supplementTone="notice"
          />
        </Grid>
      </Specimen>
    </Section>
  );
}

export function RowListSection() {
  return (
    <Section title="RowList">
      <Specimen name="ordered, the first emphasized (13's Next steps)">
        <RowList ordered aria-label="Next steps">
          <RowListItem
            href="#next-1"
            isEmphasized
            description="3 answers have content but no Fact, Assumption or Unknown."
          >
            Classify answers (3)
          </RowListItem>
          <RowListItem href="#next-2">
            Fill or mark 2 empty cost rows
          </RowListItem>
          <RowListItem>Check permits</RowListItem>
        </RowList>
      </Specimen>
      <Specimen name="start and end (13's sections)">
        <RowList aria-label="Sections">
          <RowListItem
            href="#s01"
            start={<MoonGlyph value={0.8} />}
            end={<Text variant="number">8/10</Text>}
          >
            01 Customer & Problem
          </RowListItem>
          <RowListItem
            href="#s02"
            start={<MoonGlyph value={0} />}
            end={<Text variant="number">0/8</Text>}
          >
            02 Market
          </RowListItem>
          <RowListItem end="7 entries">03 Research Log</RowListItem>
        </RowList>
      </Specimen>
    </Section>
  );
}

const questions = [
  {
    key: "WHO",
    question: "Who exactly is the customer?",
    excerpt: "Office workers in Bacolod who buy pasalubong for family.",
    state: "assumption" as const,
  },
  {
    key: "WHY THEM",
    question: "Why this customer first?",
    excerpt: "They travel often and bring gifts back home.",
    state: "fact" as const,
  },
  {
    key: "PROBLEM",
    question: "What problem do they have?",
    excerpt: null,
    state: "empty" as const,
  },
];

export function QuestionCardSection() {
  const [focused, setFocused] = useState("WHO");
  const [answer, setAnswer] = useState(
    "Office workers in Bacolod who buy pasalubong for family.",
  );
  return (
    <Section title="QuestionCard">
      <Specimen name='mode="focused" and "quiet": press a quiet one to answer it'>
        <Stack gap="space-200">
          {questions.map((item) => (
            <QuestionCard
              key={item.key}
              title={item.key}
              question={item.question}
              headingLevel={3}
              mode={focused === item.key ? "focused" : "quiet"}
              status={{
                state: item.state,
                label: fauLabel(item.state, {
                  confidence: "medium",
                  evidenceCount: 2,
                }),
              }}
              excerpt={item.excerpt}
              commentCount={item.key === "WHO" ? 1 : 0}
              onFocusRequest={() => setFocused(item.key)}
              actions={
                <>
                  <ActionButton isQuiet aria-label={`Comments ${item.key}`}>
                    <MessageSquare />
                  </ActionButton>
                  <ActionButton isQuiet aria-label={`History ${item.key}`}>
                    <History />
                  </ActionButton>
                </>
              }
            >
              <TextArea
                aria-label={`Answer ${item.key}`}
                value={item.key === "WHO" ? answer : (item.excerpt ?? "")}
                onChange={item.key === "WHO" ? setAnswer : undefined}
                placeholder="Write your answer…"
                width="full"
              />
              <Disclosure
                title={`EXAMPLE ${item.key}`}
                headingLevel={4}
                isQuiet
                defaultExpanded
              >
                They buy boxed piaya at the airport.
              </Disclosure>
            </QuestionCard>
          ))}
        </Stack>
      </Specimen>
      <Specimen name='mode="open" (Focus off, Viewer), no F/A/U (self-analysis)'>
        <QuestionCard
          title="WHY"
          question="Why do you want to start this business?"
          headingLevel={3}
          mode="open"
        >
          <Text variant="body-long">To work near my family in Bacolod.</Text>
        </QuestionCard>
      </Specimen>
    </Section>
  );
}

export function DiffTextSection() {
  const before = "Office workers who buy pasalubong.";
  const after = "Office workers in Bacolod who buy pasalubong for family.";
  return (
    <Section title="DiffText">
      <Specimen name='variant="before" / "after"'>
        <Stack gap="space-100">
          <DiffText before={before} after={after} variant="before" />
          <DiffText before={before} after={after} variant="after" />
        </Stack>
      </Specimen>
    </Section>
  );
}

const members: MentionCandidate[] = [
  { id: "u1", name: "Ana Reyes" },
  { id: "u2", name: "Kenji Sato" },
  { id: "u3", name: "Paolo Gonzaga" },
];

export function MentionTextAreaSection() {
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<MentionCandidate[]>([]);
  return (
    <Section title="MentionTextArea">
      <Specimen name="type @ and a few letters">
        <MentionTextArea
          label="Comment"
          value={text}
          onChange={setText}
          mentions={mentions}
          onMentionsChange={setMentions}
          candidates={members}
          placeholder="Write a comment…"
        />
        <Text variant="caption" tone="secondary">
          {`Mentions: ${mentions.map((mention) => mention.name).join(", ") || "none"}`}
        </Text>
      </Specimen>
    </Section>
  );
}

export function PanelSection() {
  const [isOpen, setOpen] = useState(false);
  return (
    <Section title="Panel">
      <Specimen name="a column on a desktop, a drawer on a tablet, a tray on a phone">
        <Flex gap="space-300" alignItems="start" wrap>
          <Button variant="secondary" onPress={() => setOpen(!isOpen)}>
            {isOpen ? "Close comments" : "Open comments"}
          </Button>
          <div className={styles.panelPlace}>
            <Panel title="Comments" isOpen={isOpen} onOpenChange={setOpen}>
              <Text variant="body-sm">
                Paolo: Is the airport kiosk open on Sundays?
              </Text>
              <Text variant="body-sm" tone="secondary">
                No comments yet on the other answers.
              </Text>
            </Panel>
          </div>
        </Flex>
      </Specimen>
    </Section>
  );
}

const footer = "Piaya Gift Box Co. · Draft · Oct 16";

const exact = (value: number) => ({
  value,
  bound: "exact" as const,
  reason: null,
});

const slides: PitchSlide[] = [
  {
    key: "title",
    type: "title",
    title: { text: "Piaya Gift Box Co.", empty: false },
    subtitle: {
      text: "Corporate gift boxes of Bacolod piaya, delivered the same day.",
      empty: false,
    },
    bullets: [
      { label: "Prepared by", text: "Ana Reyes", empty: false },
      { label: "Date", text: "Oct 16", empty: false },
      { label: "Version", text: "Draft", empty: false },
    ],
    numbers: [],
    table: null,
    emptySources: [],
    shrink: 0,
    overflow: false,
    editSource: null,
    editInValidation: null,
    commentCount: 0,
  },
  {
    key: "problem",
    type: "text",
    title: { text: "Problem", empty: false },
    subtitle: null,
    bullets: [
      {
        label: "Primary problem",
        text: "Gift boxes bought at the airport are crushed and stale.",
        empty: false,
      },
      { label: "Frequency", text: "Not written yet", empty: true },
    ],
    numbers: [],
    table: null,
    emptySources: ["Frequency"],
    shrink: 0,
    overflow: false,
    editSource: null,
    editInValidation: null,
    commentCount: 0,
  },
  {
    key: "business_model",
    type: "number",
    title: { text: "Business model", empty: false },
    subtitle: null,
    bullets: [],
    numbers: [
      { label: "Price", metricKey: "selling_price", value: exact(450) },
      {
        label: "Contribution / sale",
        metricKey: "contribution_margin",
        value: exact(210),
      },
      {
        label: "Break-even / day",
        metricKey: "break_even_units_day",
        value: { value: null, bound: "exact", reason: "needs_price" },
      },
    ],
    table: null,
    emptySources: [],
    shrink: 0,
    overflow: false,
    editSource: null,
    editInValidation: null,
    commentCount: 0,
  },
  {
    key: "competition",
    type: "table",
    title: { text: "Competition", empty: false },
    subtitle: null,
    bullets: [
      {
        label: "What must we do differently or better?",
        text: "Deliver fresh boxes the same day.",
        empty: false,
      },
    ],
    numbers: [],
    table: {
      columns: [
        { label: "Name", numeric: false, width: 0.25 },
        { label: "Type", numeric: false, width: 0.18 },
        { label: "Price", numeric: true, width: 0.15 },
        { label: "Strength", numeric: false, width: 0.42 },
      ],
      rows: [
        ["Airport kiosk", "Direct", "₱450", "Open every day"],
        ["Bakeshop boxes", "Indirect", "₱380", null],
      ],
    },
    emptySources: [],
    shrink: 0,
    overflow: false,
    editSource: null,
    editInValidation: null,
    commentCount: 0,
  },
];

export function SlideSection() {
  return (
    <Section title="Slide">
      {slides.map((slide) => (
        <Specimen key={slide.key} name={`type="${slide.type}"`}>
          <div className={styles.slidePlace}>
            <Slide slide={slide} footer={footer} currency="PHP" />
          </div>
        </Specimen>
      ))}
      <Specimen name="a thumbnail: the same slide, smaller">
        <div className={styles.thumbnailPlace}>
          <Slide
            slide={slides[2] as PitchSlide}
            footer={footer}
            currency="PHP"
          />
        </div>
      </Specimen>
    </Section>
  );
}

const importSteps = [
  { id: "paste", label: "Paste" },
  { id: "sort", label: "Sort" },
  { id: "review", label: "Review" },
  { id: "apply", label: "Apply" },
];

export function StepsSection() {
  return (
    <Section title="Steps">
      <Specimen name="the third step current">
        <Steps
          aria-label="Import from AI"
          steps={importSteps}
          currentId="review"
          doneLabel="completed"
        />
      </Specimen>
    </Section>
  );
}
