/** Gallery section: status, progress, alerts, empty states and placeholders. */
import { BADGE_VARIANTS, INLINE_ALERT_VARIANTS, STATUS_LIGHT_VARIANTS } from "@moonx/ui-tokens";
import { Inbox, SearchX } from "lucide-react";
import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { IllustratedMessage } from "../components/IllustratedMessage";
import { InlineAlert } from "../components/InlineAlert";
import { Meter } from "../components/Meter";
import { ProgressBar } from "../components/ProgressBar";
import { ProgressCircle } from "../components/ProgressCircle";
import { Skeleton } from "../components/Skeleton";
import { StatusLight } from "../components/StatusLight";
import { Flex, Stack } from "../layout";
import { bySize, Case, Cases, Component, GallerySection, SIZES } from "./parts";
import { widthFull } from "./preview.css";

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
            <Case key={variant} label={variant}>
              <InlineAlert variant={variant} heading={`Heading ${variant}`}>
                The message that explains what happened and what to do next.
              </InlineAlert>
            </Case>
          ))}
        </Cases>
        <Cases label="Heading only and roles" layout="column">
          <Case label="Heading only">
            <InlineAlert variant="notice" heading="Latest decision is Hold" />
          </Case>
          <Case label="role note (present at load)">
            <InlineAlert variant="informative" heading="Archived" role="note">
              This idea is read only.
            </InlineAlert>
          </Case>
        </Cases>
      </Component>

      <Component name="ProgressBar">
        <Cases label="Determinate, by size" layout="column">
          {bySize((size) => (
            <div className={widthFull}>
              <ProgressBar label="Preparing PDF" value={40} valueLabel="40%" size={size} />
            </div>
          ))}
        </Cases>
        <Cases label="Other states" layout="column">
          <Case label="Indeterminate">
            <ProgressBar label="Preparing PDF" isIndeterminate />
          </Case>
          <Case label="Empty">
            <ProgressBar label="Uploading" value={0} valueLabel="0%" />
          </Case>
          <Case label="Complete">
            <ProgressBar label="Uploading" value={100} valueLabel="100%" />
          </Case>
          <Case label="Custom range">
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
            <Case key={size} label={`Size ${size}`}>
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
          <Case label="Legend hidden (screen reader only)">
            <Meter label="Answers, no legend" segments={SEGMENTS} showLegend={false} />
          </Case>
          <Case label="Larger maxValue leaves the band partly empty">
            <Meter
              label="Checks done"
              description="4 of 10"
              segments={[{ label: "Done", value: 4, variant: "done", valueLabel: "4" }]}
              maxValue={10}
            />
          </Case>
          <Case label="No data">
            <Meter label="Nothing yet" segments={[]} />
          </Case>
          <Case label="Zero-value part is not drawn">
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
            <div aria-busy="true" aria-label="Loading comments" role="status">
              <Flex gap="space-200" align="center">
                <Skeleton shape="circle" />
                <Stack gap="space-100">
                  <Skeleton shape="text" width="space-1000" />
                  <Skeleton shape="text" width="space-900" />
                </Stack>
              </Flex>
            </div>
          </Case>
        </Cases>
      </Component>

      <Component name="IllustratedMessage">
        <Cases layout="column">
          <Case label="With text and an action">
            <IllustratedMessage
              icon={Inbox}
              heading="No ideas yet"
              actions={<Button variant="accent">New idea</Button>}
            >
              Start with an idea you want to test.
            </IllustratedMessage>
          </Case>
          <Case label="Heading only, level 3">
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
        </Cases>
      </Component>
    </GallerySection>
  );
}
