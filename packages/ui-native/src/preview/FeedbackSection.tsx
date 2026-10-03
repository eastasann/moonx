/** Gallery section: status, progress, alerts, empty states and placeholders. */
import { BADGE_VARIANTS, INLINE_ALERT_VARIANTS, STATUS_LIGHT_VARIANTS } from "@moonx/ui-tokens";
import { Inbox, SearchX } from "lucide-react-native";
import { View } from "react-native";
import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { CheckDots } from "../components/CheckDots";
import { Heading } from "../components/Heading";
import { IllustratedMessage } from "../components/IllustratedMessage";
import { InlineAlert } from "../components/InlineAlert";
import { Meter } from "../components/Meter";
import { MetricTile } from "../components/MetricTile";
import { ProgressBar } from "../components/ProgressBar";
import { ProgressCircle } from "../components/ProgressCircle";
import { Skeleton } from "../components/Skeleton";
import { StatusLight } from "../components/StatusLight";
import { Steps } from "../components/Steps";
import { Text } from "../components/Text";
import { Flex, Stack } from "../layout";
import { bySize, Case, Cases, Component, GallerySection, SIZES } from "./parts";

export const FEEDBACK_COVERAGE = [
  "StatusLight",
  "CheckDots",
  "Badge",
  "InlineAlert",
  "ProgressBar",
  "ProgressCircle",
  "Meter",
  "MetricTile",
  "Skeleton",
  "IllustratedMessage",
  "Avatar",
  "Heading",
  "Text",
  "Steps",
] as const;

const SEGMENTS = [
  { label: "Fact", value: 6, variant: "fact", valueLabel: "6 answers" },
  { label: "Assumption", value: 3, variant: "assumption", valueLabel: "3 answers" },
  { label: "Unknown", value: 1, variant: "unknown", valueLabel: "1 answer" },
] as const;

export function FeedbackSection() {
  return (
    <GallerySection id="feedback" title="Status and feedback">
      <Component name="StatusLight" note="The dot never carries the meaning alone; the label does.">
        <Cases label="Variants (size M)">
          {STATUS_LIGHT_VARIANTS.map((variant) => (
            <Case key={variant} label={variant}>
              <StatusLight variant={variant}>{variant}</StatusLight>
            </Case>
          ))}
        </Cases>
        <Cases label="Sizes">
          {bySize((size) => (
            <StatusLight variant="positive" size={size}>
              Saved
            </StatusLight>
          ))}
        </Cases>
      </Component>

      <Component
        name="CheckDots"
        note="The shape carries the state; assistive technology reads every check and its state."
      >
        <Cases label="Sizes S and M" layout="column">
          {(["S", "M"] as const).map((size) => (
            <Case key={size} label={`Size ${size}: done, partial, not started`}>
              <CheckDots
                size={size}
                items={[
                  { label: "Competitors", state: "done", stateLabel: "Done" },
                  { label: "Local price range", state: "partial", stateLabel: "Partial" },
                  {
                    label: "Startup & monthly costs",
                    state: "not-started",
                    stateLabel: "Not started",
                  },
                ]}
              />
            </Case>
          ))}
        </Cases>
      </Component>

      <Component name="Badge" note="Drop uses its own color and is never negative.">
        <Cases label="Variants (size M)">
          {BADGE_VARIANTS.map((variant) => (
            <Case key={variant} label={variant}>
              <Badge variant={variant}>{variant}</Badge>
            </Case>
          ))}
        </Cases>
        <Cases label="Sizes">
          {bySize((size) => (
            <Badge variant="informative" size={size}>
              12
            </Badge>
          ))}
        </Cases>
      </Component>

      <Component name="InlineAlert">
        <Cases label="Variants, with a message" layout="column">
          {INLINE_ALERT_VARIANTS.map((variant) => (
            <Case key={variant} label={variant} fill>
              <InlineAlert variant={variant} heading={`Heading ${variant}`}>
                The message that explains what happened and what to do next.
              </InlineAlert>
            </Case>
          ))}
        </Cases>
        <Cases label="Heading only and roles" layout="column">
          <Case label="Heading only" fill>
            <InlineAlert variant="notice" heading="Latest decision is Hold" />
          </Case>
          <Case label="role note (present at load)" fill>
            <InlineAlert variant="informative" heading="Archived" role="note">
              This idea is read only.
            </InlineAlert>
          </Case>
        </Cases>
      </Component>

      <Component name="ProgressBar">
        <Cases label="Determinate, by size" layout="column">
          {SIZES.map((size) => (
            <Case key={size} label={`Size ${size}`} fill>
              <ProgressBar label="Preparing PDF" value={40} valueLabel="40%" size={size} />
            </Case>
          ))}
        </Cases>
        <Cases label="Other states" layout="column">
          <Case label="Indeterminate" fill>
            <ProgressBar label="Preparing PDF" isIndeterminate />
          </Case>
          <Case label="Empty" fill>
            <ProgressBar label="Uploading" value={0} valueLabel="0%" />
          </Case>
          <Case label="Complete" fill>
            <ProgressBar label="Uploading" value={100} valueLabel="100%" />
          </Case>
          <Case label="Custom range" fill>
            <ProgressBar
              label="Step 2 of 4"
              value={2}
              minValue={0}
              maxValue={4}
              valueLabel="2 of 4"
            />
          </Case>
        </Cases>
      </Component>

      <Component name="ProgressCircle">
        <Cases label="Determinate and indeterminate, S / M / L">
          {(["S", "M", "L"] as const).map((size) => (
            <Case key={size} label={`Determinate ${size}`}>
              <ProgressCircle
                aria-label={`Progress ${size}`}
                value={40}
                valueLabel="40%"
                size={size}
              />
            </Case>
          ))}
          {(["S", "M", "L"] as const).map((size) => (
            <Case key={`i-${size}`} label={`Indeterminate ${size}`}>
              <ProgressCircle aria-label={`Working ${size}`} isIndeterminate size={size} />
            </Case>
          ))}
        </Cases>
      </Component>

      <Component name="Meter" note="One band split into the parts of a whole.">
        <Cases label="By size" layout="column">
          {SIZES.map((size) => (
            <Case key={size} label={`Size ${size}`} fill>
              <Meter
                label={`Answers by F/A/U (${size})`}
                description="10 answers"
                segments={SEGMENTS}
                size={size}
              />
            </Case>
          ))}
        </Cases>
        <Cases label="Other states" layout="column">
          <Case label="Legend hidden (screen reader only)" fill>
            <Meter label="Answers, no legend" segments={SEGMENTS} showLegend={false} />
          </Case>
          <Case label="Larger maxValue leaves the band partly empty" fill>
            <Meter
              label="Checks done"
              description="4 of 10"
              segments={[{ label: "Done", value: 4, variant: "done", valueLabel: "4" }]}
              maxValue={10}
            />
          </Case>
          <Case label="No data" fill>
            <Meter label="Nothing yet" segments={[]} />
          </Case>
          <Case label="Zero-value part is not drawn" fill>
            <Meter
              label="Zero part"
              segments={[
                { label: "Fact", value: 5, variant: "fact" },
                { label: "Unknown", value: 0, variant: "unknown" },
              ]}
            />
          </Case>
        </Cases>
      </Component>

      <Component name="MetricTile" note="One key number: label, figure and an optional note.">
        <Cases label="States">
          <Case label="Amount">
            <MetricTile label="Startup" value="₱169,500" />
          </Case>
          <Case label="Lower bound with a note">
            <MetricTile label="Startup" value="₱450,000+" note="Some rows are Empty or Unknown" />
          </Case>
          <Case label="Missing, with the reason">
            <MetricTile label="Break-even" value="Empty" note="Needs price" />
          </Case>
        </Cases>
      </Component>

      <Component name="Skeleton">
        <Cases label="Shapes">
          <Case label="text">
            <Stack gap="space-100">
              <Skeleton shape="text" width="space-1000" />
              <Skeleton shape="text" />
            </Stack>
          </Case>
          <Case label="block">
            <Skeleton shape="block" width="space-1000" height="space-800" />
          </Case>
          <Case label="circle">
            <Skeleton shape="circle" />
          </Case>
        </Cases>
        <Cases label="A loading region (aria-busy)">
          <Case label="Row of avatar and two lines">
            <View aria-busy aria-label="Loading comments" role="status">
              <Flex gap="space-200" align="center">
                <Skeleton shape="circle" />
                <Stack gap="space-100">
                  <Skeleton shape="text" width="space-1000" />
                  <Skeleton shape="text" width="space-900" />
                </Stack>
              </Flex>
            </View>
          </Case>
        </Cases>
      </Component>

      <Component name="IllustratedMessage">
        <Cases layout="column">
          <Case label="With text and an action" fill>
            <IllustratedMessage
              icon={Inbox}
              heading="No ideas yet"
              actions={<Button variant="accent">New idea</Button>}
            >
              Start with an idea you want to test.
            </IllustratedMessage>
          </Case>
          <Case label="Heading only, level 3" fill>
            <IllustratedMessage icon={SearchX} heading="No results" headingLevel={3} />
          </Case>
        </Cases>
      </Component>

      <Component name="Avatar">
        <Cases label="Sizes S / M, and name shapes">
          {(["S", "M"] as const).map((size) => (
            <Case key={size} label={`Size ${size}`}>
              <Avatar name="Maria Santos" size={size} />
            </Case>
          ))}
          <Case label="One word">
            <Avatar name="Juan" />
          </Case>
          <Case label="Three words (first two initials)">
            <Avatar name="Ana Maria Reyes" />
          </Case>
          <Case label="Japanese name">
            <Avatar name="山田 太郎" />
          </Case>
          <Case label="Photo that cannot be loaded (initials stay)">
            <Avatar name="Maria Santos" src="https://example.invalid/missing-photo.webp" />
          </Case>
        </Cases>
      </Component>

      <Component
        name="Heading"
        note="The display typeface. The level sets the outline, the variant the look."
      >
        <Cases label="Levels 1 to 4, and display" layout="column">
          <Case label="display">
            <Heading level={1} variant="display">
              Start a local business
            </Heading>
          </Case>
          {([1, 2, 3, 4] as const).map((level) => (
            <Case key={level} label={`Level ${level}`}>
              <Heading level={level}>Validate the idea</Heading>
            </Case>
          ))}
        </Cases>
      </Component>

      <Component name="Text">
        <Cases label="Variants and tones" layout="column">
          {(["body", "body-long", "body-sm", "caption", "label"] as const).map((variant) => (
            <Case key={variant} label={variant}>
              <Text variant={variant}>Bread is sold out by 9 am.</Text>
            </Case>
          ))}
          <Case label="secondary">
            <Text tone="secondary">The nearest bakery is 3 km away.</Text>
          </Case>
          <Case label="negative">
            <Text tone="negative">Enter a number greater than 0.</Text>
          </Case>
        </Cases>
      </Component>

      <Component name="Steps">
        <Cases label="Current step 1, 2 and 3" layout="column">
          {(["invite", "profile", "done"] as const).map((current) => (
            <Case key={current} label={`current = ${current}`} fill>
              <Steps
                aria-label={`Progress, ${current}`}
                current={current}
                items={[
                  { id: "invite", label: "Invitation" },
                  { id: "profile", label: "Profile" },
                  { id: "done", label: "Done" },
                ]}
              />
            </Case>
          ))}
        </Cases>
      </Component>
    </GallerySection>
  );
}
