import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  History,
  MessageSquare,
} from "lucide-react";
import { useState } from "react";
import { ActionButton } from "../../components/ActionButton";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import {
  DescriptionList,
  DescriptionListItem,
} from "../../components/DescriptionList";
import { Disclosure } from "../../components/Disclosure";
import { Heading } from "../../components/Heading";
import { InlineAlert } from "../../components/InlineAlert";
import { Link } from "../../components/Link";
import { ActionMenu, MenuItem } from "../../components/Menu";
import { MetricGroup, MetricTile } from "../../components/MetricTile";
import { MoonGlyph, MoonGlyphAt } from "../../components/MoonGlyph";
import { Picker } from "../../components/Picker";
import { QuestionCard } from "../../components/QuestionCard";
import { Radio, RadioGroup } from "../../components/RadioGroup";
import { RowList, RowListItem } from "../../components/RowList";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../../components/SegmentedControl";
import { Text } from "../../components/Text";
import { TextArea, TextField } from "../../components/TextField";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "../../components/ToggleButtonGroup";
import { Well } from "../../components/Well";
import { Flex, Stack } from "../../layout/Flex";
import { FocusPattern } from "../../patterns/FocusPattern";
import { QuestionFormPattern } from "../../patterns/QuestionFormPattern";
import {
  SettingsFieldRow,
  SettingsList,
  SettingsListItem,
  SettingsPattern,
} from "../../patterns/SettingsPattern";
import { MockupFrame } from "./MockupFrame";

/** s19's F/A/U line: Unknown and Unclassified in the amber of attention. */
const fauCounts = [
  { state: "fact", label: "Fact", value: "3", needsAttention: false },
  {
    state: "assumption",
    label: "Assumption",
    value: "29",
    needsAttention: false,
  },
  { state: "unknown", label: "Unknown", value: "5", needsAttention: true },
  { state: null, label: "Unclassified", value: "3", needsAttention: true },
  { state: null, label: "Empty", value: "22", needsAttention: false },
] as const;

/** 19 Decision (s19-decision.html): pattern B. */
export function DecisionScreen() {
  return (
    <MockupFrame
      current="ideas"
      crumbs={["Ideas", "Bacolod Health Bowl", "Record decision"]}
      back="Validation"
    >
      <FocusPattern
        header={
          <Stack gap="space-75">
            <Text variant="caption" tone="secondary">
              Bacolod Health Bowl
            </Text>
            <Heading level={1}>Record a decision</Heading>
          </Stack>
        }
        actions={
          <>
            <Button variant="secondary" isQuiet>
              Cancel
            </Button>
            <Button variant="primary">Record decision</Button>
          </>
        }
      >
        <Well
          density="spacious"
          role="region"
          aria-label="What you know so far"
        >
          <Stack gap="space-300">
            <Stack gap="space-100">
              <Heading level={2} variant="label">
                Summary
              </Heading>
              <DescriptionList>
                <DescriptionListItem label="Concept">
                  Healthy fast-casual bowls with standardized nutrition in
                  Bacolod.
                </DescriptionListItem>
                <DescriptionListItem label="Customer">
                  Working professionals aged 25–40 in Bacolod who pay for
                  convenient meals.
                </DescriptionListItem>
                <DescriptionListItem label="Problem">
                  Healthy eating is hard to sustain because planning, cooking
                  and portion control take time.
                </DescriptionListItem>
                <DescriptionListItem label="Market type">
                  Red
                </DescriptionListItem>
                <DescriptionListItem label="Biggest opportunity">
                  Few healthy lunch options near the Lacson St. offices.
                </DescriptionListItem>
                <DescriptionListItem label="Biggest unknown">
                  How much more than ₱150 people will pay.
                </DescriptionListItem>
                <DescriptionListItem label="Biggest risk">
                  <Text tone="tertiary">Empty</Text>
                </DescriptionListItem>
              </DescriptionList>
            </Stack>
            <Stack gap="space-100">
              <Heading level={2} variant="label">
                Key numbers
              </Heading>
              <MetricGroup aria-label="Key numbers" variant="compact">
                <MetricTile label="Startup" value="₱145,000+" />
                <MetricTile label="Break-even" value="14.4+ / day" />
                <MetricTile label="Expected profit" value="≤ ₱37,000 / mo" />
                <MetricTile label="Payback" value="3.9+ mo" />
                <MetricTile label="ROI" value="≤ 306.2%" />
              </MetricGroup>
            </Stack>
            <Stack gap="space-100">
              <Flex justifyContent="space-between" alignItems="baseline">
                <Heading level={2} variant="label">
                  Checks
                </Heading>
                <Text variant="caption" tone="tertiary">
                  2 missing
                </Text>
              </Flex>
              <RowList aria-label="Missing checks">
                <RowListItem
                  start={<MoonGlyph state="partial" />}
                  end="Partial · 1 row is Empty"
                >
                  Startup & monthly costs
                </RowListItem>
                <RowListItem
                  start={<MoonGlyph state="not-started" />}
                  end="Not started"
                >
                  Permits
                </RowListItem>
              </RowList>
            </Stack>
            <Stack gap="space-100">
              <Heading level={2} variant="label">
                Fact / Assumption / Unknown
              </Heading>
              <Flex gap="space-200" alignItems="center" wrap>
                {fauCounts.map((count) => (
                  <Flex key={count.label} gap="space-75" alignItems="center">
                    {count.state !== null && (
                      <MoonGlyph state={count.state} size="S" />
                    )}
                    <Text
                      variant="body-sm"
                      tone={count.needsAttention ? "notice" : "secondary"}
                    >
                      {`${count.label} `}
                      <Text
                        variant="number"
                        tone={count.needsAttention ? "notice" : "primary"}
                      >
                        {count.value}
                      </Text>
                    </Text>
                  </Flex>
                ))}
              </Flex>
              <Text variant="body-sm" tone="secondary">
                Last decision: Hold · Oct 2 · Kenji Mori
              </Text>
            </Stack>
          </Stack>
        </Well>
        <Stack gap="space-300">
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
          <Text variant="body-sm" tone="secondary">
            You can decide again at any time. Every decision stays in the log.
          </Text>
          <TextArea
            label="Why?"
            isRequired
            isReason
            width="full"
            defaultValue="Permit costs are still unknown and one startup row is empty. Revisit after the City Hall visit."
          />
          <InlineAlert variant="notice">
            2 checks are missing. They will be recorded with this decision.
          </InlineAlert>
        </Stack>
      </FocusPattern>
    </MockupFrame>
  );
}

/**
 * s11-form.html's answers to 01 Customer & Problem, with the questions as
 * data/templates/bcdx/validation.json asks them (V.01.*).
 */
const questions = [
  {
    id: "WHO",
    question: "Who is the primary paying customer?",
    excerpt:
      "Working professionals aged 25–40 in Bacolod who pay for convenient meals.",
    state: "assumption" as const,
    label: "Assumption · Medium",
  },
  {
    id: "WHY THEM",
    question: "Why is this customer attractive?",
    excerpt: "They have disposable income and little time to cook.",
    state: "assumption" as const,
    label: "Assumption · Low",
  },
  {
    id: "BEHAVIOR",
    question: "What do they do today instead?",
    excerpt:
      "They order rice meals or fast food at the office and skip lunch on busy days.",
    state: "unclassified" as const,
    label: "Unclassified",
  },
  {
    id: "PROBLEM",
    question: "What problem are we solving?",
    excerpt:
      "Healthy eating is hard to sustain because planning, cooking and portion control take time.",
    state: "fact" as const,
    label: "Fact · 2 sources",
    comments: 1,
  },
  {
    id: "FREQUENCY",
    question: "How often does the problem occur?",
    excerpt: "Every working day.",
    state: "assumption" as const,
    label: "Assumption · Medium",
  },
  {
    id: "SEVERITY",
    question: "How painful or costly is it?",
    excerpt:
      "Office workers lose 30 to 45 minutes on lunch runs. On busy days many skip lunch and snack in the afternoon.",
    state: "unclassified" as const,
    label: "Unclassified",
  },
  {
    id: "PAYMENT",
    question: "Why would the customer pay?",
    excerpt: "We do not know how much more than ₱150 they will pay.",
    state: "unknown" as const,
    label: "Unknown",
  },
  {
    id: "SWITCHING",
    question: "What would make them switch from current alternatives?",
    excerpt:
      "Clear calories and macros on every bowl, and a price close to a fast-food meal.",
    state: "unclassified" as const,
    label: "Unclassified",
  },
  {
    id: "NON-CUSTOMER",
    question: "Who is probably NOT the customer?",
    excerpt: null,
    state: "empty" as const,
    label: "Empty",
  },
  {
    id: "PROOF",
    question: "What evidence suggests this customer and problem exist?",
    excerpt: null,
    state: "empty" as const,
    label: "Empty",
  },
];

/** 11 Question form (s11-form.html): pattern C with SEVERITY being answered. */
export function QuestionFormScreen() {
  const [current, setCurrent] = useState<string | null>("SEVERITY");
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((item) => [item.id, item.excerpt ?? ""])),
  );
  return (
    <MockupFrame
      current="ideas"
      crumbs={["Ideas", "Bacolod Health Bowl", "01 Customer & Problem"]}
      back="Validation"
      saveState="saved"
      comments={1}
      hasHistory
    >
      <QuestionFormPattern
        header={
          <Stack gap="space-100">
            <Flex
              alignItems="end"
              justifyContent="space-between"
              gap="space-300"
              wrap
            >
              <Flex gap="space-50" alignItems="center">
                <Heading level={1}>01 Customer & Problem</Heading>
                <ActionButton isQuiet aria-label="Switch section">
                  <ChevronDown />
                </ActionButton>
              </Flex>
              <Flex gap="space-100" alignItems="center">
                <MoonGlyph value={0.7} />
                <Text tone="secondary">
                  <Text variant="number" tone="secondary">
                    7/10
                  </Text>
                  {" answered"}
                </Text>
              </Flex>
            </Flex>
            <Text tone="secondary">
              Define exactly who pays, what problem recurs, and why they would
              change behavior. Use evidence where possible.
            </Text>
          </Stack>
        }
        questionIds={questions.map((item) => item.id)}
        currentId={current}
        onCurrentChange={setCurrent}
        renderQuestion={(id, mode) => {
          const item = questions.find((question) => question.id === id);
          if (item === undefined) return null;
          return (
            <QuestionCard
              title={item.id}
              question={item.question}
              mode={mode}
              status={{ state: item.state, label: item.label }}
              excerpt={
                (answers[item.id] ?? "") === "" ? null : answers[item.id]
              }
              commentCount={item.comments ?? 0}
              onFocusRequest={() => setCurrent(id)}
              actions={
                <>
                  <ActionButton isQuiet aria-label={`Comments on ${item.id}`}>
                    <MessageSquare />
                  </ActionButton>
                  <ActionButton isQuiet aria-label={`History of ${item.id}`}>
                    <History />
                  </ActionButton>
                </>
              }
            >
              <TextArea
                aria-label={`Answer to ${item.id}`}
                width="full"
                value={answers[item.id] ?? ""}
                onChange={(text) =>
                  setAnswers((current) => ({ ...current, [item.id]: text }))
                }
              />
              <Flex gap="space-200" alignItems="center" wrap>
                <ToggleButtonGroup aria-label={`F/A/U of ${item.id}`}>
                  <ToggleButton id="fact">
                    <MoonGlyphAt state="fact" size="M" />
                    Fact
                  </ToggleButton>
                  <ToggleButton id="assumption">
                    <MoonGlyphAt state="assumption" size="M" />
                    Assumption
                  </ToggleButton>
                  <ToggleButton id="unknown">
                    <MoonGlyphAt state="unknown" size="M" />
                    Unknown
                  </ToggleButton>
                </ToggleButtonGroup>
                {item.state === "unclassified" && (
                  <Text variant="body-sm" tone="notice">
                    Not classified yet
                  </Text>
                )}
              </Flex>
              <Disclosure title="Related research" defaultExpanded>
                <Stack gap="space-100">
                  <Text variant="body-sm" tone="secondary">
                    No research linked to this answer. Mark it Fact to attach a
                    source.
                  </Text>
                  <Flex>
                    <Link href="#log-research">Log research</Link>
                  </Flex>
                </Stack>
              </Disclosure>
            </QuestionCard>
          );
        }}
        previousSection={
          <Button variant="secondary" isQuiet>
            <ArrowLeft />
            Previous section
          </Button>
        }
        footer={
          <Button variant="secondary">
            AI
            <ChevronDown />
          </Button>
        }
        nextSection={
          <Button variant="secondary">
            Next: 02 Market
            <ArrowRight />
          </Button>
        }
        isAnswered={(id) => (answers[id] ?? "").trim() !== ""}
      />
    </MockupFrame>
  );
}

const roles = [
  { id: "owner", label: "Owner" },
  { id: "member", label: "Member" },
  { id: "viewer", label: "Viewer" },
];

const currencies = [{ id: "PHP", label: "PHP · Philippine peso" }];

/** s09-settings.html's members after Ana, who is the last Owner. */
const members = [
  {
    name: "Kenji Mori",
    email: "kenji@bcdx.example",
    role: "member",
  },
  {
    name: "Paolo Gonzaga",
    email: "paolo@bcdx.example",
    role: "member",
  },
  {
    name: "Grace Tan",
    email: "grace@advisor.example",
    role: "viewer",
  },
];

/** 9 Workspace Settings (s09-settings.html): pattern H. */
export function SettingsScreen() {
  return (
    <MockupFrame
      current="settings"
      crumbs={["Workspace Settings"]}
      isInMore
      saveState="saved"
    >
      <SettingsPattern
        header={
          <Heading level={1} variant="heading-1-settings">
            Workspace Settings
          </Heading>
        }
        groups={[
          {
            id: "workspace",
            title: "Workspace",
            description: (
              <Text variant="body-sm" tone="secondary">
                Changes save on their own.
              </Text>
            ),
            content: (
              <>
                <TextField label="Name" defaultValue="BCDX" />
                <Picker
                  label="Currency"
                  items={currencies}
                  defaultValue="PHP"
                  description="Changing the currency does not convert amounts you already entered."
                  descriptionTone="notice"
                />
              </>
            ),
          },
          {
            id: "members",
            title: "Members",
            description: (
              <Text variant="body-sm" tone="secondary">
                4 people. Owners can invite and change roles.
              </Text>
            ),
            content: (
              <SettingsList aria-label="Members">
                <SettingsListItem
                  avatar={<Avatar name="Ana Villanueva" size="M" />}
                  title="Ana Villanueva"
                  titleNote="(you)"
                  description="ana@bcdx.example"
                  control={
                    <Picker
                      aria-label="Role of Ana Villanueva"
                      items={roles}
                      defaultValue="owner"
                      size="S"
                      isDisabled
                    />
                  }
                  actions={
                    <ActionMenu
                      aria-label="Member actions of Ana Villanueva"
                      isDisabled
                    >
                      <MenuItem id="remove">Remove</MenuItem>
                    </ActionMenu>
                  }
                  note="This workspace needs at least one Owner"
                />
                {members.map((member) => (
                  <SettingsListItem
                    key={member.email}
                    avatar={<Avatar name={member.name} size="M" />}
                    title={member.name}
                    description={member.email}
                    control={
                      <Picker
                        aria-label={`Role of ${member.name}`}
                        items={roles}
                        defaultValue={member.role}
                        size="S"
                      />
                    }
                    actions={
                      <ActionMenu
                        aria-label={`Member actions of ${member.name}`}
                      >
                        <MenuItem id="remove">Remove</MenuItem>
                      </ActionMenu>
                    }
                  />
                ))}
              </SettingsList>
            ),
          },
          {
            id: "invitations",
            title: "Invitations",
            description: (
              <Text variant="body-sm" tone="secondary">
                Links expire after 7 days and go only to the invited email.
              </Text>
            ),
            content: (
              <>
                <SettingsFieldRow>
                  <TextField
                    aria-label="Email to invite"
                    placeholder="name@example.com"
                  />
                  <Picker
                    aria-label="Role of the invited"
                    items={roles}
                    defaultValue="member"
                  />
                  <Button variant="primary">Send invitation</Button>
                </SettingsFieldRow>
                <SegmentedControl
                  aria-label="Show"
                  defaultSelectedKey="pending"
                >
                  <SegmentedControlItem id="pending">
                    Pending
                  </SegmentedControlItem>
                  <SegmentedControlItem id="all">All</SegmentedControlItem>
                </SegmentedControl>
                <SettingsList aria-label="Invitations">
                  <SettingsListItem
                    title="new.member@bcdx.example"
                    description="Member · sent Oct 9 · expires Oct 16"
                    actions={
                      <>
                        <Button variant="secondary" isQuiet>
                          Resend
                        </Button>
                        <Button variant="secondary" isQuiet>
                          Cancel
                        </Button>
                      </>
                    }
                  />
                </SettingsList>
              </>
            ),
          },
        ]}
      />
    </MockupFrame>
  );
}
