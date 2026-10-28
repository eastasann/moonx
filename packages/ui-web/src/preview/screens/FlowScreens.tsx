import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { ActionButton } from "../../components/ActionButton";
import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Checkbox";
import { CostPreview } from "../../components/CostPreview";
import {
  DescriptionList,
  DescriptionListItem,
} from "../../components/DescriptionList";
import { DiffText } from "../../components/DiffText";
import { DiffTextArea } from "../../components/DiffTextArea";
import { Disclosure } from "../../components/Disclosure";
import { Heading } from "../../components/Heading";
import { IdeaPreview } from "../../components/IdeaPreview";
import { Link } from "../../components/Link";
import { MoonGlyph, MoonGlyphAt } from "../../components/MoonGlyph";
import { PageFrame } from "../../components/PageFrame";
import { PhaseRoute } from "../../components/PhaseRoute";
import { Picker } from "../../components/Picker";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../../components/SegmentedControl";
import { Slide } from "../../components/Slide";
import { Steps } from "../../components/Steps";
import { Text } from "../../components/Text";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "../../components/ToggleButtonGroup";
import { Flex, Stack } from "../../layout/Flex";
import { PresentationPattern } from "../../patterns/PresentationPattern";
import { PublicPattern, PublicSection } from "../../patterns/PublicPattern";
import { StepsPattern } from "../../patterns/StepsPattern";
import { businessModel, importSteps } from "../MockupDataSection";
import { deckFooter, deckSlides } from "./deckSlides";
import { MockupFrame } from "./MockupFrame";

/** s25-import.html's two changes. */
const changes = [
  {
    id: "who",
    code: "01 · WHO",
    question: "Who is the primary paying customer?",
    meta: "Updated by Kenji just now",
    before:
      "Working professionals aged 25–40 in Bacolod who pay for convenient meals.",
    beforeState: "assumption" as const,
    beforeLabel: "Assumption · Medium",
    after:
      "Working professionals aged 25–45 in Bacolod who pay for convenient meals, mostly in BPO offices on Lacson St.",
  },
  {
    id: "severity",
    code: "01 · SEVERITY",
    question: "How painful or costly is it?",
    before: "",
    beforeState: "empty" as const,
    beforeLabel: "Empty",
    after:
      "Office workers lose 30 to 45 minutes on lunch runs. On busy days many skip lunch and snack in the afternoon.",
  },
];

/** The answers the import leaves as they are (s25's "3 unchanged answers"). */
const unchanged = [
  ["01 · WHY THEM", "They have disposable income and little time to cook."],
  [
    "01 · BEHAVIOR",
    "They order rice meals or fast food at the office and skip lunch on busy days.",
  ],
  ["01 · FREQUENCY", "Every working day."],
] as const;

/** 25 Import from AI (s25-import.html): pattern G at ③ Review. */
export function ImportScreen() {
  const [imported, setImported] = useState(
    Object.fromEntries(changes.map((change) => [change.id, change.after])),
  );
  return (
    <MockupFrame
      current="ideas"
      crumbs={["Ideas", "Bacolod Health Bowl", "Import from AI"]}
      back="Validation"
    >
      <StepsPattern
        header={
          <Stack gap="space-75">
            <Text variant="caption" tone="secondary">
              Bacolod Health Bowl · validation questions
            </Text>
            <Heading level={1} variant="heading-1-steps">
              Import from AI
            </Heading>
          </Stack>
        }
        steps={
          <Steps
            aria-label="Steps"
            steps={importSteps}
            currentId="review"
            doneLabel="completed"
          />
        }
        comparisons={changes.map((change) => ({
          id: change.id,
          select: (
            <Checkbox
              aria-label={`Apply the change to ${change.code}`}
              defaultSelected
            />
          ),
          code: change.code,
          question: change.question,
          meta: change.meta,
          before: (
            <>
              <Flex gap="space-100" alignItems="center">
                <Text variant="caption" tone="secondary">
                  Current
                </Text>
                <MoonGlyph state={change.beforeState} size="S" />
                <Text variant="caption" tone="secondary">
                  {change.beforeLabel}
                </Text>
              </Flex>
              {change.before === "" ? (
                <Text variant="body-long" tone="tertiary">
                  Empty
                </Text>
              ) : (
                <DiffText
                  variant="before"
                  before={change.before}
                  after={imported[change.id] ?? ""}
                />
              )}
            </>
          ),
          after: (
            <>
              <Text variant="caption" tone="secondary">
                Imported · you can edit
              </Text>
              <DiffTextArea
                aria-label={`Imported answer to ${change.code}`}
                before={change.before}
                value={imported[change.id] ?? ""}
                onChange={(value) =>
                  setImported((current) => ({ ...current, [change.id]: value }))
                }
              />
              <Flex gap="space-200" alignItems="center" wrap>
                <Flex gap="space-85" alignItems="center">
                  <MoonGlyph state="unclassified" size="S" />
                  <Text variant="body-sm" tone="notice">
                    Unclassified
                  </Text>
                </Flex>
                <ToggleButtonGroup
                  aria-label={`F/A/U of ${change.code}`}
                  size="S"
                >
                  <ToggleButton id="fact">
                    <MoonGlyphAt state="fact" size="S" />
                    Fact
                  </ToggleButton>
                  <ToggleButton id="assumption">
                    <MoonGlyphAt state="assumption" size="S" />
                    Assumption
                  </ToggleButton>
                  <ToggleButton id="unknown">
                    <MoonGlyphAt state="unknown" size="S" />
                    Unknown
                  </ToggleButton>
                </ToggleButtonGroup>
              </Flex>
            </>
          ),
        }))}
        footer={
          <Disclosure title="3 unchanged answers" headingLevel={2}>
            <DescriptionList>
              {unchanged.map(([code, answer]) => (
                <DescriptionListItem key={code} label={code}>
                  {answer}
                </DescriptionListItem>
              ))}
            </DescriptionList>
          </Disclosure>
        }
        note="Each change is saved in history as an AI import."
        actions={
          <>
            <Button variant="secondary" isQuiet>
              Cancel
            </Button>
            <Button variant="primary">Apply 2 changes</Button>
          </>
        }
      >
        <Text variant="body-sm" tone="secondary">
          <strong>2 changes</strong>
          {
            " to apply. Changed answers go back to Unclassified so you can check them."
          }
        </Text>
      </StepsPattern>
    </MockupFrame>
  );
}

const versions = [{ id: "v1", label: "v1 For advisors" }];

/** 23 Pitch Deck (s23-deck.html): pattern I at Business model. */
export function DeckScreen() {
  const [current, setCurrent] = useState<string>(businessModel.key);
  const slide =
    deckSlides.find((item) => item.key === current) ?? businessModel;
  const count = slide.commentCount;
  return (
    <MockupFrame
      current="ideas"
      crumbs={["Ideas", "Piaya Gift Box Delivery", "Plan A", "Pitch Deck"]}
      back="Plan A"
      comments={0}
    >
      <PresentationPattern
        header={
          <Heading level={1} variant="heading-1-toolbar">
            Pitch Deck
          </Heading>
        }
        tools={
          <>
            <SegmentedControl aria-label="Length" defaultSelectedKey="five">
              <SegmentedControlItem id="one">One-minute</SegmentedControlItem>
              <SegmentedControlItem id="five">Five-minute</SegmentedControlItem>
            </SegmentedControl>
            <Picker
              label="From"
              labelPosition="inside"
              items={versions}
              defaultValue="v1"
            />
          </>
        }
        primaryAction={<Button variant="primary">Download PDF</Button>}
        slides={deckSlides.map((item) => ({
          id: item.key,
          // The title slide's title is the business's name; its thumbnail says its type.
          title: item.type === "title" ? "Title" : item.title.text,
          thumbnail: (
            <Slide
              slide={item}
              footer={deckFooter}
              currency="PHP"
              isThumbnail
            />
          ),
        }))}
        currentId={slide.key}
        onCurrentChange={setCurrent}
        slideTools={
          <>
            <Link href="#edit-source" isQuiet>
              Edit source
            </Link>
            <Link href="#edit-validation" isQuiet>
              Edit in validation
            </Link>
            <ActionButton
              isQuiet
              size="S"
              aria-label={`Comments on ${slide.title.text}, ${count}`}
            >
              <MessageSquare />
              {count}
            </ActionButton>
          </>
        }
        slide={
          <Slide
            slide={slide}
            footer={deckFooter}
            currency="PHP"
            headingLevel={2}
          />
        }
        notes={
          <>
            <Heading level={2} variant="label">
              What to say
            </Heading>
            <Text variant="body-long">
              Every box we sell at ₱450 costs about ₱218 to make, pack and
              deliver, so each one leaves ₱231 toward rent and salaries. We need
              about seven boxes a day to cover the month.
            </Text>
          </>
        }
      />
    </MockupFrame>
  );
}

/** 1 Landing (s01-landing.html): pattern J. */
export function LandingScreen() {
  return (
    <PageFrame>
      <PublicPattern
        action={<Button variant="secondary">Log in</Button>}
        footerLinks={
          <>
            <Link href="#privacy" isQuiet>
              Privacy Policy
            </Link>
            <Link href="#support" isQuiet>
              Support
            </Link>
          </>
        }
      >
        <PublicSection
          layout="hero"
          aside={
            <IdeaPreview
              name="Office Lunch Bowls"
              stage="Validation"
              metrics={[
                { label: "Startup costs", value: "₱145,000+" },
                { label: "Break-even", value: "14.4+ / day" },
              ]}
              checks={[
                {
                  state: "done",
                  label: "Competitors (3–5)",
                  status: "Done (4)",
                },
                { state: "done", label: "Local price range", status: "Done" },
                {
                  state: "partial",
                  label: "Startup and monthly costs",
                  status: "Partial",
                },
                {
                  state: "not-started",
                  label: "Permits",
                  status: "Not started",
                },
              ]}
              caption="An example idea in validation."
            />
          }
        >
          <Stack gap="space-400">
            <Heading level={1} variant="display">
              From idea to a plan you can show.
            </Heading>
            <Text variant="lead">
              Know yourself, test a local business idea, then write the plan.
              moonx does the math and shows what is missing.
            </Text>
            <Flex>
              <Button variant="primary" size="XL">
                Log in
              </Button>
            </Flex>
          </Stack>
        </PublicSection>
        <PublicSection isFullBleed>
          <Stack gap="space-600">
            <Stack gap="space-200">
              <Heading level={2} variant="display-2">
                Three parts, in the order founders need them.
              </Heading>
              <Text tone="secondary">
                Each part asks one question at a time and saves as you write, on
                your phone or on a bigger screen.
              </Text>
            </Stack>
            <PhaseRoute
              phases={[
                {
                  value: 0,
                  title: "Self Analysis",
                  description:
                    "Your strengths, your values and what you want from a business.",
                },
                {
                  value: 0.5,
                  title: "Validation",
                  description:
                    "Research, competitors and costs, then decide whether to go ahead, wait or drop it.",
                },
                {
                  value: 1,
                  title: "Business plan",
                  description:
                    "Milestones, risks and a pitch deck built from what you validated.",
                },
              ]}
            />
          </Stack>
        </PublicSection>
        <PublicSection
          layout="pair"
          aside={
            <CostPreview
              aria-label="Example startup costs with two known rows, one Unknown row and one Empty row, and totals"
              rows={[
                { state: "fact", name: "Equipment", amount: "₱60,000" },
                {
                  state: "assumption",
                  name: "Lease Deposit",
                  amount: "₱30,000",
                },
                {
                  state: "unknown",
                  name: "Permits",
                  amount: "Unknown",
                  isMuted: true,
                },
                {
                  state: "empty",
                  name: "Working Capital Buffer",
                  amount: "Empty",
                  isMuted: true,
                },
              ]}
              totals={[
                { label: "Startup", value: "₱145,000+" },
                { label: "Break-even", value: "14.4+ / day" },
              ]}
            />
          }
        >
          <Stack gap="space-200">
            <Heading level={2} variant="display-2">
              The numbers move as you type.
            </Heading>
            <Text tone="secondary">
              Enter costs and a price. Break-even, four scenarios and payback
              update on the spot.
            </Text>
            <Text tone="secondary">
              Unknown and empty rows stay in view, and a total that is only a
              lower bound shows a +.
            </Text>
          </Stack>
        </PublicSection>
        <PublicSection
          layout="close"
          action={
            <Button variant="primary" size="XL">
              Log in
            </Button>
          }
        >
          <Stack gap="space-200">
            <Heading level={2} variant="display-2">
              moonx is by invitation.
            </Heading>
            <Text tone="secondary">
              Ask the person who invited you for your link. If you already have
              an account, log in.
            </Text>
          </Stack>
        </PublicSection>
      </PublicPattern>
    </PageFrame>
  );
}
