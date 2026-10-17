import { sizes, sizesWithXS } from "@moonx/ui-tokens";
import { History, MessageSquare, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { ActionButton, ActionGroup } from "../components/ActionButton";
import { Button, ButtonGroup } from "../components/Button";
import { MoonGlyphAt } from "../components/MoonGlyph";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../components/SegmentedControl";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "../components/ToggleButtonGroup";
import { Flex, Stack } from "../layout/Flex";
import { Section, Specimen } from "./parts";
import * as styles from "./preview.css";

const variants = ["primary", "secondary", "negative"] as const;

export function ButtonSection() {
  const [isPending, setPending] = useState(false);
  return (
    <Section title="Button">
      {variants.map((variant) => (
        <Specimen
          key={variant}
          name={`variant="${variant}" size S / M / L / XL`}
        >
          <Flex gap="space-200" wrap alignItems="center">
            {sizes.map((size) => (
              <Button key={size} variant={variant} size={size}>
                {variant === "negative" ? "Delete" : "Record decision"}
              </Button>
            ))}
          </Flex>
        </Specimen>
      ))}
      <Specimen name="isQuiet">
        <Flex gap="space-200" wrap>
          <Button variant="secondary" isQuiet>
            Cancel
          </Button>
          <Button variant="negative" isQuiet>
            Remove
          </Button>
        </Flex>
      </Specimen>
      <Specimen name="with icon, isDisabled, isPending">
        <Flex gap="space-200" wrap>
          <Button variant="secondary">
            <Plus />
            New idea
          </Button>
          <Button isDisabled>Apply 2 changes</Button>
          <Button
            isPending={isPending}
            onPress={() => {
              setPending(true);
              setTimeout(() => setPending(false), 2000);
            }}
          >
            Save version
          </Button>
          <Button isPending>Sending</Button>
        </Flex>
      </Specimen>
      <Specimen name='ButtonGroup align="start" / "center" / "end"'>
        <Stack gap="space-200">
          {(["start", "center", "end"] as const).map((align) => (
            <ButtonGroup
              key={align}
              align={align}
              aria-label={`Align ${align}`}
            >
              <Button variant="secondary">Cancel</Button>
              <Button>Apply</Button>
            </ButtonGroup>
          ))}
        </Stack>
      </Specimen>
      <Specimen name='ButtonGroup orientation="vertical"'>
        <ButtonGroup orientation="vertical" aria-label="Stacked">
          <Button>Record decision</Button>
          <Button variant="secondary">Cancel</Button>
        </ButtonGroup>
      </Specimen>
      <Specimen name="ButtonGroup size S / M / L / XL">
        <Stack gap="space-200">
          {sizes.map((size) => (
            <ButtonGroup key={size} size={size} aria-label={`Group ${size}`}>
              <Button variant="secondary">Cancel</Button>
              <Button>Apply</Button>
            </ButtonGroup>
          ))}
        </Stack>
      </Specimen>
    </Section>
  );
}

export function ActionButtonSection() {
  return (
    <Section title="ActionButton">
      <Specimen name="size S / M / L / XL">
        <Flex gap="space-200" wrap alignItems="center">
          {sizes.map((size) => (
            <ActionButton key={size} size={size}>
              <MessageSquare />
              Comments
            </ActionButton>
          ))}
        </Flex>
      </Specimen>
      <Specimen name="isQuiet, icon only, isDisabled">
        <Flex gap="space-200" wrap alignItems="center">
          <ActionButton isQuiet>Filter</ActionButton>
          <ActionButton aria-label="History">
            <History />
          </ActionButton>
          <ActionButton isQuiet aria-label="More actions">
            <MoreHorizontal />
          </ActionButton>
          <ActionButton isDisabled>Disabled</ActionButton>
        </Flex>
      </Specimen>
      <Specimen name="ActionGroup isQuiet (toolbar)">
        <ActionGroup isQuiet aria-label="Panel tools">
          <ActionButton aria-label="Comments">
            <MessageSquare />
          </ActionButton>
          <ActionButton aria-label="History">
            <History />
          </ActionButton>
          <ActionButton aria-label="More actions">
            <MoreHorizontal />
          </ActionButton>
        </ActionGroup>
      </Specimen>
      <Specimen name="ActionGroup size S / M / L / XL">
        <Stack gap="space-200">
          {sizes.map((size) => (
            <ActionGroup key={size} size={size} aria-label={`Tools ${size}`}>
              <ActionButton>Duplicate</ActionButton>
              <ActionButton>Archive</ActionButton>
            </ActionGroup>
          ))}
        </Stack>
      </Specimen>
      <Specimen name='ActionGroup density="compact" size="S", orientation="vertical"'>
        <Flex gap="space-600" wrap alignItems="start">
          <ActionGroup density="compact" size="S" aria-label="Compact tools">
            <ActionButton>Bold</ActionButton>
            <ActionButton>Italic</ActionButton>
            <ActionButton isDisabled>Link</ActionButton>
          </ActionGroup>
          <ActionGroup orientation="vertical" aria-label="Vertical tools">
            <ActionButton>Duplicate</ActionButton>
            <ActionButton>Archive</ActionButton>
          </ActionGroup>
        </Flex>
      </Specimen>
    </Section>
  );
}

export function ToggleSection() {
  const [fau, setFau] = useState<Set<string | number>>(new Set(["assumption"]));
  const [confidence, setConfidence] = useState("medium");
  return (
    <Section title="ToggleButtonGroup and SegmentedControl">
      <Specimen name="ToggleButtonGroup (F/A/U; pressing the chosen one clears it)">
        <ToggleButtonGroup
          aria-label="F/A/U"
          selectedKeys={fau}
          onSelectionChange={setFau}
        >
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
      </Specimen>
      <Specimen name="ToggleButtonGroup isJustified (as wide as FauPicker's popover)">
        <div className={styles.popoverWidth}>
          <ToggleButtonGroup aria-label="F/A/U justified" isJustified>
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
        </div>
      </Specimen>
      <Specimen name="ToggleButtonGroup without a value: Fact and Assumption disabled">
        <ToggleButtonGroup aria-label="F/A/U for an empty answer" size="S">
          <ToggleButton id="fact" isDisabled>
            Fact
          </ToggleButton>
          <ToggleButton id="assumption" isDisabled>
            Assumption
          </ToggleButton>
          <ToggleButton id="unknown">Unknown</ToggleButton>
        </ToggleButtonGroup>
      </Specimen>
      <Specimen name="ToggleButtonGroup size XS / S / M / L / XL">
        <Stack gap="space-200">
          {sizesWithXS.map((size) => (
            <ToggleButtonGroup
              key={size}
              size={size}
              aria-label={`F/A/U ${size}`}
              defaultSelectedKeys={["fact"]}
            >
              <ToggleButton id="fact">Fact</ToggleButton>
              <ToggleButton id="assumption">Assumption</ToggleButton>
              <ToggleButton id="unknown">Unknown</ToggleButton>
            </ToggleButtonGroup>
          ))}
        </Stack>
      </Specimen>
      <Specimen name='ToggleButtonGroup isQuiet, selectionMode="multiple", orientation="vertical"'>
        <Flex gap="space-600" wrap alignItems="start">
          <ToggleButtonGroup
            aria-label="Quiet"
            isQuiet
            defaultSelectedKeys={["cards"]}
          >
            <ToggleButton id="cards">Cards</ToggleButton>
            <ToggleButton id="table">Table</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup
            aria-label="Filters"
            selectionMode="multiple"
            defaultSelectedKeys={["open", "mine"]}
          >
            <ToggleButton id="open">Open</ToggleButton>
            <ToggleButton id="mine">Mine</ToggleButton>
            <ToggleButton id="overdue">Overdue</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup aria-label="Vertical" orientation="vertical">
            <ToggleButton id="a">Fact</ToggleButton>
            <ToggleButton id="b">Unknown</ToggleButton>
          </ToggleButtonGroup>
        </Flex>
      </Specimen>
      <Specimen name="SegmentedControl size S / M / L / XL">
        <Stack gap="space-200">
          {sizes.map((size) => (
            <SegmentedControl
              key={size}
              size={size}
              aria-label={`Confidence ${size}`}
              selectedKey={confidence}
              onSelectionChange={setConfidence}
            >
              <SegmentedControlItem id="low">Low</SegmentedControlItem>
              <SegmentedControlItem id="medium">Medium</SegmentedControlItem>
              <SegmentedControlItem id="high">High</SegmentedControlItem>
            </SegmentedControl>
          ))}
        </Stack>
      </Specimen>
      <Specimen name="SegmentedControl isJustified, isDisabled">
        <Stack gap="space-200">
          <SegmentedControl
            aria-label="Pitch length"
            defaultSelectedKey="one"
            isJustified
          >
            <SegmentedControlItem id="one">1 min</SegmentedControlItem>
            <SegmentedControlItem id="five">5 min</SegmentedControlItem>
          </SegmentedControl>
          <SegmentedControl
            aria-label="Format"
            defaultSelectedKey="markdown"
            isDisabled
          >
            <SegmentedControlItem id="markdown">Markdown</SegmentedControlItem>
            <SegmentedControlItem id="json">JSON</SegmentedControlItem>
          </SegmentedControl>
        </Stack>
      </Specimen>
    </Section>
  );
}
