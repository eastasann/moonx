import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, test } from "vitest";
import { ActionButton } from "./ActionButton";
import { Breadcrumb, Breadcrumbs } from "./Breadcrumbs";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Disclosure } from "./Disclosure";
import { Link } from "./Link";
import { Picker } from "./Picker";
import { Radio, RadioGroup } from "./RadioGroup";
import { SegmentedControl, SegmentedControlItem } from "./SegmentedControl";
import { Switch } from "./Switch";
import { Tab, TabList, TabPanel, Tabs } from "./Tabs";
import { TagGroup } from "./TagGroup";
import { ToggleButton, ToggleButtonGroup } from "./ToggleButtonGroup";

// The looks of hover, press, keyboard focus and disabled hang on React Aria's data-*
// attributes (ADR-025); this checks each interactive component sets them on the element
// its styles select. For the controls in a <label>, that element is the label.

interface Case {
  name: string;
  render: (disabled: boolean) => ReactElement;
  /** The element the styles read the attributes from. */
  target: () => HTMLElement;
  pressable?: boolean;
  /** Tags only take hover when they can be selected, which moonx's cannot. */
  hoverable?: boolean;
  /** TagGroup has no disabled tags (design-spec 4.5 gives none). */
  canBeDisabled?: boolean;
}

const labelOf = (role: string, name: string) =>
  screen.getByRole(role, { name }).closest("label") as HTMLElement;

const cases: Case[] = [
  {
    name: "Button",
    render: (disabled) => <Button isDisabled={disabled}>Go</Button>,
    target: () => screen.getByRole("button"),
    pressable: true,
  },
  {
    name: "ActionButton",
    render: (disabled) => (
      <ActionButton isDisabled={disabled}>Tool</ActionButton>
    ),
    target: () => screen.getByRole("button"),
    pressable: true,
  },
  {
    name: "ToggleButton",
    render: (disabled) => (
      <ToggleButtonGroup aria-label="F/A/U">
        <ToggleButton id="fact" isDisabled={disabled}>
          Fact
        </ToggleButton>
      </ToggleButtonGroup>
    ),
    target: () => screen.getByRole("radio"),
    pressable: true,
  },
  {
    name: "SegmentedControlItem",
    render: (disabled) => (
      <SegmentedControl aria-label="Format" isDisabled={disabled}>
        <SegmentedControlItem id="md">Markdown</SegmentedControlItem>
      </SegmentedControl>
    ),
    target: () => screen.getByRole("radio"),
    pressable: true,
  },
  {
    name: "Link",
    render: (disabled) => <Link isDisabled={disabled}>Open</Link>,
    target: () => screen.getByRole("link"),
    pressable: true,
  },
  {
    name: "Checkbox",
    render: (disabled) => <Checkbox isDisabled={disabled}>Apply</Checkbox>,
    target: () => labelOf("checkbox", "Apply"),
    pressable: true,
  },
  {
    name: "Radio",
    render: (disabled) => (
      <RadioGroup aria-label="Decision" isDisabled={disabled}>
        <Radio value="hold">Hold</Radio>
      </RadioGroup>
    ),
    target: () => labelOf("radio", "Hold"),
    pressable: true,
  },
  {
    name: "Switch",
    render: (disabled) => <Switch isDisabled={disabled}>Focus</Switch>,
    target: () => labelOf("switch", "Focus"),
    pressable: true,
  },
  {
    name: "Picker",
    render: (disabled) => (
      <Picker
        aria-label="Role"
        items={[{ id: "owner", label: "Owner" }]}
        isDisabled={disabled}
      />
    ),
    target: () => screen.getByRole("button"),
  },
  {
    name: "Tag",
    render: () => (
      <TagGroup
        aria-label="Filters"
        items={[{ id: "a", label: "Permits" }]}
        onRemove={() => {}}
      />
    ),
    target: () => screen.getByRole("row"),
    hoverable: false,
    canBeDisabled: false,
  },
  {
    name: "Disclosure title",
    render: (disabled) => (
      <Disclosure title="EXAMPLE" isDisabled={disabled}>
        Body
      </Disclosure>
    ),
    target: () => screen.getByRole("button"),
    pressable: true,
  },
  {
    name: "Tab",
    render: (disabled) => (
      <Tabs isDisabled={disabled}>
        <TabList aria-label="Views">
          <Tab id="a">Assumptions</Tab>
        </TabList>
        <TabPanel id="a">Rows</TabPanel>
      </Tabs>
    ),
    target: () => screen.getByRole("tab"),
    pressable: true,
  },
  {
    name: "Breadcrumb link",
    render: () => (
      <Breadcrumbs>
        <Breadcrumb href="#ideas">Ideas</Breadcrumb>
        <Breadcrumb>05 Costs</Breadcrumb>
      </Breadcrumbs>
    ),
    target: () => screen.getByRole("link"),
    pressable: true,
    // A crumb is a level above the page: it is always a link (design-spec 6.0.1).
    canBeDisabled: false,
  },
];

describe.each(cases)(
  "$name",
  ({
    render: make,
    target,
    pressable,
    hoverable = true,
    canBeDisabled = true,
  }) => {
    test("hover, keyboard focus and press set the attributes the styles use", async () => {
      const user = userEvent.setup();
      render(make(false));
      const element = target();
      await user.hover(element);
      expect(element.hasAttribute("data-hovered")).toBe(hoverable);
      await user.tab();
      expect(element.hasAttribute("data-focus-visible")).toBe(true);
      if (pressable) {
        await user.pointer({ keys: "[MouseLeft>]", target: element });
        expect(element.hasAttribute("data-pressed")).toBe(true);
        await user.pointer({ keys: "[/MouseLeft]", target: element });
      }
    });

    if (canBeDisabled) {
      test("disabled sets data-disabled", () => {
        render(make(true));
        expect(target().hasAttribute("data-disabled")).toBe(true);
      });
    }
  },
);
