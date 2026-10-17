import { History, MessageSquare } from "lucide-react";
import { useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Checkbox } from "../components/Checkbox";
import { CheckDots } from "../components/CheckDots";
import { DiffText } from "../components/DiffText";
import { Heading } from "../components/Heading";
import { InlineAlert } from "../components/InlineAlert";
import { Link } from "../components/Link";
import { Meter } from "../components/Meter";
import { MoonGlyph, MoonGlyphAt } from "../components/MoonGlyph";
import { Picker } from "../components/Picker";
import { Radio, RadioGroup } from "../components/RadioGroup";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../components/SegmentedControl";
import { Text } from "../components/Text";
import { TextField } from "../components/TextField";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "../components/ToggleButtonGroup";
import { Well } from "../components/Well";
import { Flex, Stack } from "../layout/Flex";
import { Section, Specimen } from "./parts";
import * as styles from "./preview.css";

const done = "done" as const;

/**
 * The parts Step 22c matched to docs/mockups, with the mockups' own words, to set beside
 * them (README.md there says how to open them).
 */
export function MockupBasicsSection() {
  const [invites, setInvites] = useState("pending");
  return (
    <Section title="Mockup parts: type, frames, marks and basic parts">
      <Specimen name="s05: the screen title, the block's heading, rows' text and badges">
        <Stack gap="space-200">
          <Heading level={3} variant="heading-1-hub">
            BCDX
          </Heading>
          <Text tone="secondary">
            Ideas, self analyses and what is due across the workspace.
          </Text>
          <Heading level={4} variant="label">
            Ideas
          </Heading>
          <Flex gap="space-300" wrap alignItems="center">
            <Text variant="label">Piaya Gift Box Delivery</Text>
            <CheckDots
              size="S"
              checks={[
                { name: "Competitors (3–5)", state: done },
                { name: "Local price range", state: done },
                { name: "Startup & monthly costs", state: "partial" },
                { name: "Break-even volume", state: done },
                { name: "Permits", state: "not-started" },
                { name: "Go / No-Go", state: done },
              ]}
            />
            <Badge>Proceed</Badge>
            <Badge fillStyle="dashed">Undecided</Badge>
            <Badge variant="notice">overdue 3d</Badge>
            <Text variant="caption" tone="secondary">
              Planning · updated 12h ago
            </Text>
          </Flex>
          <Flex gap="space-200" alignItems="center">
            <Avatar name="Ana Villanueva" size="M" />
            <Avatar name="Kenji Mori" size="S" />
            <Text variant="label">Ana Villanueva</Text>
          </Flex>
        </Stack>
      </Specimen>
      <Specimen name="moon-base.css: the header's tools, the ink tag of a count">
        <Flex gap="space-50" alignItems="center">
          <ActionButton isQuiet aria-label="Comments on this answer">
            <MessageSquare />
          </ActionButton>
          <ActionButton isQuiet aria-label="History of this answer">
            <History />
          </ActionButton>
          <Badge fillStyle="bold">3</Badge>
        </Flex>
      </Specimen>
      <Specimen name="s09: fields L, Buttons, the groove">
        <Stack gap="space-300">
          <Flex gap="space-200" wrap alignItems="end">
            <TextField label="Name" size="L" defaultValue="BCDX" />
            <Picker
              label="Role"
              size="L"
              defaultValue="member"
              items={[
                { id: "owner", label: "Owner" },
                { id: "member", label: "Member" },
                { id: "viewer", label: "Viewer" },
              ]}
            />
            <Button>Send invitation</Button>
          </Flex>
          <Flex gap="space-200" wrap alignItems="center">
            <Button variant="secondary" isQuiet>
              Resend
            </Button>
            <Button variant="secondary" isQuiet>
              Cancel
            </Button>
            <Button variant="secondary">Edit summary</Button>
            <SegmentedControl
              aria-label="Invitations"
              size="S"
              selectedKey={invites}
              onSelectionChange={setInvites}
            >
              <SegmentedControlItem id="pending">Pending</SegmentedControlItem>
              <SegmentedControlItem id="all">All</SegmentedControlItem>
            </SegmentedControl>
          </Flex>
        </Stack>
      </Specimen>
      <Specimen name="s01: the landing's Log in (XL)">
        <Flex>
          <Button size="XL">Log in</Button>
        </Flex>
      </Specimen>
      <Specimen name="s11: the question, F/A/U in the groove, Not classified yet">
        <Stack gap="space-200">
          <Heading level={3} variant="heading-question">
            How painful or costly is this problem for them today?
          </Heading>
          <ToggleButtonGroup aria-label="F/A/U of SEVERITY">
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
          <Flex gap="space-85" alignItems="center">
            <MoonGlyph state="unclassified" size="S" />
            <Text variant="body-sm" tone="notice">
              Not classified yet
            </Text>
          </Flex>
          <Flex gap="space-200" alignItems="center">
            <MoonGlyph value={0.7} />
            <Text variant="caption" tone="secondary">
              7/10 answered
            </Text>
          </Flex>
        </Stack>
      </Specimen>
      <Specimen name="d1: the F/A/U breakdown, a lone link">
        <Stack gap="space-200">
          <Meter
            label="Fact / Assumption / Unknown"
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
          <Link href="#decisions">See all decisions</Link>
        </Stack>
      </Specimen>
      <Specimen name="s19: the Well, the choice, the notice">
        <Stack gap="space-300">
          <Well
            density="spacious"
            role="region"
            aria-label="What you know so far"
          >
            <Stack gap="space-100">
              <Heading level={4} variant="label">
                Summary
              </Heading>
              <Text variant="body-sm">
                Healthy fast-casual bowls with standardized nutrition in
                Bacolod.
              </Text>
            </Stack>
          </Well>
          <RadioGroup
            label="Decision"
            defaultValue="hold"
            orientation="horizontal"
          >
            <Radio value="proceed">Proceed</Radio>
            <Radio value="hold">Hold</Radio>
            <Radio value="drop">Drop</Radio>
          </RadioGroup>
          <InlineAlert variant="notice">
            2 checks are missing. They will be recorded with this decision.
          </InlineAlert>
        </Stack>
      </Specimen>
      <Specimen name="s25: the checked box, removed and added text">
        <Stack gap="space-200">
          <Checkbox defaultSelected>Apply this change</Checkbox>
          <DiffText
            variant="before"
            before="Working professionals aged 25–40 in Bacolod who pay for convenient meals."
            after="Working professionals aged 25–45 in Bacolod who pay for convenient meals, mostly in BPO offices on Lacson St."
          />
          <DiffText
            variant="after"
            before="Working professionals aged 25–40 in Bacolod who pay for convenient meals."
            after="Working professionals aged 25–45 in Bacolod who pay for convenient meals, mostly in BPO offices on Lacson St."
          />
        </Stack>
      </Specimen>
      <Specimen name="s15: a card is framed, without a shadow">
        <div className={styles.popoverWidth}>
          <Card title="Salad Station" description="Direct competitor">
            <Text variant="body-sm">Build-your-own salad bowls</Text>
          </Card>
        </div>
      </Specimen>
    </Section>
  );
}
