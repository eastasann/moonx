import {
  avatarSizes,
  breadcrumbsSizes,
  cardSizes,
  contextualHelpSizes,
  dialogWidths,
  dividerSizes,
  illustratedMessageSizes,
  moonGlyphSizes,
  progressCircleSizes,
  sizes,
  sizesWithXS,
  tagSizes,
} from "@moonx/ui-tokens";
import { User } from "@react-aria/test-utils";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import type { ReactElement } from "react";
import { describe, expect, expectTypeOf, test, vi } from "vitest";
import type { ChoiceItem } from "../internal/ChoiceListBox";
import type { ContainerProps } from "../layout/Container";
import type { FlexProps, StackProps } from "../layout/Flex";
import type { GridProps } from "../layout/Grid";
import { setPhoneWidth } from "../test/helpers";
import { ActionButton, ActionGroup } from "./ActionButton";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Breadcrumb, Breadcrumbs } from "./Breadcrumbs";
import { Button, ButtonGroup } from "./Button";
import { Card, CardView } from "./Card";
import { Checkbox, CheckboxGroup } from "./Checkbox";
import { CheckDots } from "./CheckDots";
import { ComboBox } from "./ComboBox";
import { ContextualHelp } from "./ContextualHelp";
import { DatePicker } from "./DatePicker";
import { AlertDialog } from "./Dialog";
import type { DiffTextProps } from "./DiffText";
import { Accordion, Disclosure } from "./Disclosure";
import { Divider } from "./Divider";
import { FauPicker } from "./FauPicker";
import { FileTrigger, type FileTriggerProps } from "./FileTrigger";
import { Form } from "./Form";
import type { HeadingProps } from "./Heading";
import { IllustratedMessage } from "./IllustratedMessage";
import type { InlineAlertProps } from "./InlineAlert";
import type { LinkProps } from "./Link";
import type { ListViewProps } from "./ListView";
import { MentionTextArea } from "./MentionTextArea";
import { ActionMenu, Menu, MenuItem, MenuTrigger } from "./Menu";
import { Meter } from "./Meter";
import type { MetricTileProps } from "./MetricTile";
import { MoonGlyph } from "./MoonGlyph";
import { NumberField } from "./NumberField";
import type { PanelProps } from "./Panel";
import { Picker } from "./Picker";
import { ProgressBar } from "./ProgressBar";
import { ProgressCircle } from "./ProgressCircle";
import type { QuestionCardProps } from "./QuestionCard";
import { Radio, RadioGroup } from "./RadioGroup";
import type { RowListItemProps, RowListProps } from "./RowList";
import { SearchField } from "./SearchField";
import { SegmentedControl, SegmentedControlItem } from "./SegmentedControl";
import type { SkeletonProps } from "./Skeleton";
import type { SlideProps } from "./Slide";
import { StatusLight } from "./StatusLight";
import type { StepsProps } from "./Steps";
import { Switch } from "./Switch";
import type { TableViewProps } from "./TableView";
import { Tab, TabList, TabPanel, Tabs } from "./Tabs";
import { TagGroup } from "./TagGroup";
import { Text, type TextProps } from "./Text";
import { TextArea, TextField } from "./TextField";
import type { ToastContainerProps, ToastOptions } from "./Toast";
import { ToggleButton, ToggleButtonGroup } from "./ToggleButtonGroup";
import type { TooltipProps, TooltipTriggerProps } from "./Tooltip";
import type { TrayProps } from "./Tray";
import type { TreeProps } from "./Tree";
import { Well, type WellProps } from "./Well";

const items: ChoiceItem[] = [
  { id: "a", label: "Ana" },
  { id: "b", label: "Ben" },
];

/** input → frame → the field's outer element. */
const fieldRoot = (input: Element) =>
  input.parentElement?.parentElement as HTMLElement;

interface SizeCase {
  name: string;
  steps: readonly string[];
  /** One instance per step. */
  render: () => ReactElement;
  /** The elements whose class carries the size, one per step. */
  targets: () => (Element | null)[];
}

// Every component that takes `size`, with its own steps (design-spec 4.5): each step must
// render and look different from the others.
const sizeCase = <S extends string>(
  name: string,
  steps: readonly S[],
  make: (size: S) => ReactElement,
  targets: () => (Element | null)[],
): SizeCase => ({
  name,
  steps,
  render: () => (
    <div>
      {steps.map((size) => (
        <div key={size}>{make(size)}</div>
      ))}
    </div>
  ),
  targets,
});

const sized: SizeCase[] = [
  sizeCase(
    "Button",
    sizes,
    (size) => <Button size={size}>Save</Button>,
    () => screen.getAllByRole("button"),
  ),
  sizeCase(
    "ButtonGroup",
    sizes,
    (size) => (
      <ButtonGroup aria-label={size} size={size}>
        <Button>Save</Button>
      </ButtonGroup>
    ),
    () => screen.getAllByRole("button"),
  ),
  sizeCase(
    "ActionButton",
    sizes,
    (size) => <ActionButton size={size}>Tool</ActionButton>,
    () => screen.getAllByRole("button"),
  ),
  sizeCase(
    "ActionGroup",
    sizes,
    (size) => (
      <ActionGroup aria-label={size} size={size}>
        <ActionButton>Tool</ActionButton>
      </ActionGroup>
    ),
    () => screen.getAllByRole("button"),
  ),
  sizeCase(
    "ToggleButtonGroup",
    sizesWithXS,
    (size) => (
      <ToggleButtonGroup aria-label={size} size={size}>
        <ToggleButton id="fact">Fact</ToggleButton>
      </ToggleButtonGroup>
    ),
    () => screen.getAllByRole("radio"),
  ),
  sizeCase(
    "SegmentedControl",
    sizes,
    (size) => (
      <SegmentedControl aria-label={size} size={size}>
        <SegmentedControlItem id="low">Low</SegmentedControlItem>
      </SegmentedControl>
    ),
    () => screen.getAllByRole("radio"),
  ),
  sizeCase(
    "Form",
    sizes,
    (size) => (
      <Form aria-label={size} size={size}>
        <TextField aria-label={`Field ${size}`} />
      </Form>
    ),
    () => screen.getAllByRole("textbox").map(fieldRoot),
  ),
  sizeCase(
    "TextField",
    sizes,
    (size) => <TextField aria-label={size} size={size} />,
    () => screen.getAllByRole("textbox").map(fieldRoot),
  ),
  sizeCase(
    "TextArea",
    sizes,
    (size) => <TextArea aria-label={size} size={size} />,
    () => screen.getAllByRole("textbox").map(fieldRoot),
  ),
  sizeCase(
    "NumberField",
    sizes,
    (size) => <NumberField aria-label={size} size={size} />,
    () => screen.getAllByRole("textbox").map(fieldRoot),
  ),
  sizeCase(
    "SearchField",
    sizes,
    (size) => <SearchField aria-label={size} size={size} />,
    () => screen.getAllByRole("searchbox").map(fieldRoot),
  ),
  sizeCase(
    "Picker",
    sizes,
    (size) => <Picker aria-label={size} size={size} items={items} />,
    () => screen.getAllByRole("button").map((button) => button.parentElement),
  ),
  sizeCase(
    "ComboBox",
    sizes,
    (size) => <ComboBox aria-label={size} size={size} items={items} />,
    () => screen.getAllByRole("combobox").map(fieldRoot),
  ),
  sizeCase(
    "DatePicker",
    sizes,
    (size) => <DatePicker aria-label={size} size={size} />,
    () => screen.getAllByRole("group").map((group) => group.parentElement),
  ),
  sizeCase(
    "RadioGroup",
    sizes,
    (size) => (
      <RadioGroup aria-label={size} size={size}>
        <Radio value="a">{size}</Radio>
      </RadioGroup>
    ),
    () =>
      screen
        .getAllByRole("radio")
        .map((radio) => radio.closest("label") as HTMLElement),
  ),
  sizeCase(
    "Checkbox",
    sizes,
    (size) => <Checkbox size={size}>{size}</Checkbox>,
    () =>
      screen
        .getAllByRole("checkbox")
        .map((box) => box.closest("label") as HTMLElement),
  ),
  sizeCase(
    "CheckboxGroup",
    sizes,
    (size) => (
      <CheckboxGroup aria-label={size} size={size}>
        <Checkbox value="x">{size}</Checkbox>
      </CheckboxGroup>
    ),
    () =>
      screen
        .getAllByRole("checkbox")
        .map((box) => box.closest("label") as HTMLElement),
  ),
  sizeCase(
    "Switch",
    sizes,
    (size) => <Switch size={size}>{size}</Switch>,
    () =>
      screen
        .getAllByRole("switch")
        .map((input) => input.closest("label") as HTMLElement),
  ),
  sizeCase(
    "TagGroup",
    tagSizes,
    (size) => (
      <TagGroup
        aria-label={size}
        size={size}
        items={[{ id: "t", label: size }]}
      />
    ),
    () => screen.getAllByRole("row"),
  ),
  sizeCase(
    "Divider",
    dividerSizes,
    (size) => <Divider size={size} />,
    () => screen.getAllByRole("separator"),
  ),
  sizeCase(
    "ActionMenu",
    sizesWithXS,
    (size) => (
      <ActionMenu size={size} aria-label={size}>
        <MenuItem id="a">A</MenuItem>
      </ActionMenu>
    ),
    () => screen.getAllByRole("button"),
  ),
  sizeCase(
    "ContextualHelp",
    contextualHelpSizes,
    (size) => (
      <ContextualHelp size={size} title={size}>
        Help
      </ContextualHelp>
    ),
    () => screen.getAllByRole("button"),
  ),
  sizeCase(
    "Disclosure",
    sizes,
    (size) => (
      <Disclosure size={size} title={size}>
        Body
      </Disclosure>
    ),
    () => screen.getAllByRole("button"),
  ),
  sizeCase(
    "Accordion",
    sizes,
    (size) => (
      <Accordion size={size}>
        <Disclosure id="a" title={size}>
          Body
        </Disclosure>
      </Accordion>
    ),
    () => screen.getAllByRole("button"),
  ),
  sizeCase(
    "Tabs",
    sizes,
    (size) => (
      <Tabs size={size}>
        <TabList aria-label={size}>
          <Tab id="a">{size}</Tab>
        </TabList>
        <TabPanel id="a">Panel</TabPanel>
      </Tabs>
    ),
    () => screen.getAllByRole("tab"),
  ),
  sizeCase(
    "Breadcrumbs",
    breadcrumbsSizes,
    (size) => (
      <Breadcrumbs size={size} aria-label={size}>
        <Breadcrumb href="#a">Ideas</Breadcrumb>
        <Breadcrumb>Here</Breadcrumb>
      </Breadcrumbs>
    ),
    () => screen.getAllByRole("list"),
  ),
  sizeCase(
    "IllustratedMessage",
    illustratedMessageSizes,
    (size) => (
      <IllustratedMessage size={size} icon={<Inbox />} heading={size}>
        Body
      </IllustratedMessage>
    ),
    () => screen.getAllByRole("heading"),
  ),
  sizeCase(
    "Badge",
    sizes,
    (size) => <Badge size={size}>{`badge-${size}`}</Badge>,
    // The text sits in the badge's ellipsis span; the size is on the badge.
    () => sizes.map((size) => screen.getByText(`badge-${size}`).parentElement),
  ),
  sizeCase(
    "StatusLight",
    sizes,
    (size) => (
      <StatusLight size={size} variant="partial">
        {`light-${size}`}
      </StatusLight>
    ),
    () => sizes.map((size) => screen.getByText(`light-${size}`).parentElement),
  ),
  sizeCase(
    "ProgressBar",
    sizes,
    (size) => <ProgressBar size={size} aria-label={size} value={10} />,
    () => screen.getAllByRole("progressbar"),
  ),
  sizeCase(
    "ProgressCircle",
    progressCircleSizes,
    (size) => <ProgressCircle size={size} aria-label={size} isIndeterminate />,
    () => screen.getAllByRole("progressbar"),
  ),
  sizeCase(
    "Meter",
    sizes,
    (size) => (
      <Meter
        size={size}
        label={`meter-${size}`}
        segments={[{ state: "fact", label: "Fact", count: 1 }]}
      />
    ),
    () => screen.getAllByRole("figure"),
  ),
  sizeCase(
    "Card",
    cardSizes,
    (size) => <Card size={size} title={`card-${size}`} />,
    () =>
      cardSizes.map((size) => screen.getByText(`card-${size}`).parentElement),
  ),
  sizeCase(
    "CardView",
    cardSizes,
    (size) => (
      <CardView aria-label={`view-${size}`} size={size}>
        <Card id="a" textValue="A" title="A" />
      </CardView>
    ),
    () => screen.getAllByRole("grid"),
  ),
  sizeCase(
    "Avatar",
    avatarSizes,
    (size) => <Avatar name="Ana Reyes" alt={`avatar-${size}`} size={size} />,
    () => screen.getAllByRole("img"),
  ),
  sizeCase(
    "MoonGlyph",
    moonGlyphSizes,
    (size) => <MoonGlyph state="partial" size={size} />,
    () => [...document.querySelectorAll("svg")],
  ),
  sizeCase(
    "CheckDots",
    moonGlyphSizes,
    (size) => (
      <CheckDots size={size} checks={[{ name: size, state: "done" }]} />
    ),
    () => [...document.querySelectorAll("svg")],
  ),
  sizeCase(
    "FauPicker",
    sizes,
    (size) => (
      <FauPicker
        aria-label={size}
        size={size}
        state="unclassified"
        confidence={null}
        hasValue
        onChange={() => {}}
        onFactPress={() => {}}
      />
    ),
    () => screen.getAllByRole("button"),
  ),
  sizeCase(
    "MentionTextArea",
    sizes,
    (size) => (
      <MentionTextArea
        aria-label={size}
        size={size}
        value=""
        onChange={() => {}}
        mentions={[]}
        onMentionsChange={() => {}}
        candidates={[]}
      />
    ),
    () => screen.getAllByRole("textbox").map(fieldRoot),
  ),
];

describe.each(sized)("$name sizes", ({ steps, render: make, targets }) => {
  test(`${steps.join(", ")} each render with their own look`, () => {
    render(make());
    const classes = targets().map((element) => element?.className);
    expect(classes).toHaveLength(steps.length);
    expect(new Set(classes).size).toBe(steps.length);
  });
});

test("components Spectrum 2 gives no size take none (design-spec 4.5)", () => {
  expectTypeOf<HeadingProps>().not.toHaveProperty("size");
  expectTypeOf<TextProps>().not.toHaveProperty("size");
  expectTypeOf<LinkProps>().not.toHaveProperty("size");
  expectTypeOf<WellProps>().not.toHaveProperty("size");
  expectTypeOf<FileTriggerProps>().not.toHaveProperty("size");
  expectTypeOf<FlexProps>().not.toHaveProperty("size");
  expectTypeOf<StackProps>().not.toHaveProperty("size");
  expectTypeOf<GridProps>().not.toHaveProperty("size");
  expectTypeOf<ContainerProps>().not.toHaveProperty("size");
  expectTypeOf<TrayProps>().not.toHaveProperty("size");
  expectTypeOf<TooltipProps>().not.toHaveProperty("size");
  expectTypeOf<TooltipTriggerProps>().not.toHaveProperty("size");
  expectTypeOf<ToastContainerProps>().not.toHaveProperty("size");
  expectTypeOf<ToastOptions>().not.toHaveProperty("size");
  expectTypeOf<SkeletonProps>().not.toHaveProperty("size");
  expectTypeOf<InlineAlertProps>().not.toHaveProperty("size");
  // Lists and tables change by density instead; frames and displays have no size.
  expectTypeOf<TableViewProps<{ id: string }>>().not.toHaveProperty("size");
  expectTypeOf<ListViewProps<object>>().not.toHaveProperty("size");
  expectTypeOf<TreeProps<object>>().not.toHaveProperty("size");
  expectTypeOf<StepsProps>().not.toHaveProperty("size");
  expectTypeOf<PanelProps>().not.toHaveProperty("size");
  expectTypeOf<DiffTextProps>().not.toHaveProperty("size");
  expectTypeOf<QuestionCardProps>().not.toHaveProperty("size");
  expectTypeOf<MetricTileProps>().not.toHaveProperty("size");
  expectTypeOf<RowListProps>().not.toHaveProperty("size");
  expectTypeOf<RowListItemProps>().not.toHaveProperty("size");
  expectTypeOf<SlideProps>().not.toHaveProperty("size");
});

describe("sizes of the overlays, one open at a time", () => {
  test("Menu: S, M, L and XL items each have their own look", async () => {
    const user = userEvent.setup();
    const looks = new Set<string>();
    for (const size of sizes) {
      const { unmount } = render(
        <MenuTrigger>
          <Button>Open</Button>
          <Menu size={size}>
            <MenuItem id="a">Item</MenuItem>
          </Menu>
        </MenuTrigger>,
      );
      await user.click(screen.getByRole("button", { name: "Open" }));
      looks.add(screen.getByRole("menuitem").className);
      unmount();
    }
    expect(looks.size).toBe(sizes.length);
  });

  test("AlertDialog: S, M and L each take their own width", () => {
    const looks = new Set<string>();
    for (const size of dialogWidths) {
      const { unmount } = render(
        <AlertDialog isOpen size={size} title={size} primaryActionLabel="OK">
          Body
        </AlertDialog>,
      );
      const frame = screen.getByRole("alertdialog").parentElement;
      looks.add(frame?.className ?? "");
      unmount();
    }
    expect(looks.size).toBe(dialogWidths.length);
  });
});

test("ButtonGroup: a Button's own size wins over the group's", () => {
  render(
    <div>
      <ButtonGroup aria-label="Group" size="S">
        <Button size="XL">Own</Button>
        <Button>Group's</Button>
      </ButtonGroup>
      <Button size="XL">Alone XL</Button>
      <Button size="S">Alone S</Button>
    </div>,
  );
  const look = (name: string) => screen.getByRole("button", { name }).className;
  expect(look("Own")).toBe(look("Alone XL"));
  expect(look("Group's")).toBe(look("Alone S"));
});

describe("ComboBox sizes on a phone", () => {
  test("S, M, L and XL each render with their own look", () => {
    setPhoneWidth();
    render(
      <div>
        {sizes.map((size) => (
          <ComboBox key={size} aria-label={size} size={size} items={items} />
        ))}
      </div>,
    );
    const classes = sizes.map(
      (size) => screen.getByRole("button", { name: size }).className,
    );
    expect(new Set(classes).size).toBe(sizes.length);
  });
});

describe("other variants", () => {
  test("Divider sizes and Well densities", () => {
    render(
      <div>
        <Divider size="S" />
        <Divider size="M" />
        <Divider size="L" />
        <Well aria-label="Regular" role="region">
          a
        </Well>
        <Well aria-label="Spacious" role="region" density="spacious">
          b
        </Well>
      </div>,
    );
    const dividers = screen.getAllByRole("separator").map((d) => d.className);
    expect(new Set(dividers).size).toBe(3);
    expect(screen.getByRole("region", { name: "Regular" }).className).not.toBe(
      screen.getByRole("region", { name: "Spacious" }).className,
    );
  });

  test("Text: every variant and every tone has its own look", () => {
    const variants = [
      "body",
      "body-long",
      "body-sm",
      "caption",
      "label",
      "number",
    ] as const;
    const tones = ["primary", "secondary", "tertiary", "negative"] as const;
    render(
      <div>
        {variants.map((variant) => (
          <Text key={variant} variant={variant}>{`v-${variant}`}</Text>
        ))}
        {tones.map((tone) => (
          <Text key={tone} tone={tone}>{`t-${tone}`}</Text>
        ))}
      </div>,
    );
    const looks = (prefix: string, names: readonly string[]) =>
      new Set(
        names.map((name) => screen.getByText(`${prefix}${name}`).className),
      ).size;
    expect(looks("v-", variants)).toBe(variants.length);
    expect(looks("t-", tones)).toBe(tones.length);
  });

  test("ButtonGroup align and orientation, ActionGroup density and orientation", () => {
    render(
      <div>
        <ButtonGroup aria-label="start">
          <Button>a</Button>
        </ButtonGroup>
        <ButtonGroup aria-label="end" align="end">
          <Button>b</Button>
        </ButtonGroup>
        <ButtonGroup aria-label="vertical" orientation="vertical">
          <Button>c</Button>
        </ButtonGroup>
        <ActionGroup aria-label="regular">
          <ActionButton>d</ActionButton>
        </ActionGroup>
        <ActionGroup aria-label="compact" density="compact">
          <ActionButton>e</ActionButton>
        </ActionGroup>
        <ActionGroup aria-label="column" orientation="vertical">
          <ActionButton>f</ActionButton>
        </ActionGroup>
      </div>,
    );
    const looks = (role: string, names: string[]) =>
      new Set(names.map((name) => screen.getByRole(role, { name }).className))
        .size;
    expect(looks("group", ["start", "end", "vertical"])).toBe(3);
    expect(looks("toolbar", ["regular", "compact", "column"])).toBe(3);
    expect(
      screen
        .getByRole("toolbar", { name: "column" })
        .getAttribute("aria-orientation"),
    ).toBe("vertical");
  });

  test("CheckboxGroup orientations differ", () => {
    render(
      <div>
        <CheckboxGroup label="Column">
          <Checkbox value="a">a</Checkbox>
        </CheckboxGroup>
        <CheckboxGroup label="Row" orientation="horizontal">
          <Checkbox value="b">b</Checkbox>
        </CheckboxGroup>
      </div>,
    );
    const list = (name: string) =>
      screen.getByRole("group", { name }).querySelector("label")?.parentElement
        ?.className;
    expect(list("Column")).not.toBe(list("Row"));
  });

  test("ToggleButtonGroup: quiet looks different; multiple selection keeps several", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ToggleButtonGroup aria-label="plain">
          <ToggleButton id="p">Plain</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup aria-label="quiet" isQuiet>
          <ToggleButton id="q">Quiet</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup aria-label="Filters" selectionMode="multiple">
          <ToggleButton id="open">Open</ToggleButton>
          <ToggleButton id="mine">Mine</ToggleButton>
        </ToggleButtonGroup>
      </div>,
    );
    expect(screen.getByRole("radio", { name: "Plain" }).className).not.toBe(
      screen.getByRole("radio", { name: "Quiet" }).className,
    );
    const open = screen.getByRole("button", { name: "Open" });
    const mine = screen.getByRole("button", { name: "Mine" });
    await user.click(open);
    await user.click(mine);
    expect(open.getAttribute("aria-pressed")).toBe("true");
    expect(mine.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("disabled fields", () => {
  test("text-like fields cannot be edited", () => {
    render(
      <div>
        <TextArea label="Area" isDisabled />
        <NumberField label="Number" isDisabled />
        <SearchField label="Search" isDisabled />
        <ComboBox label="Combo" items={items} isDisabled />
      </div>,
    );
    for (const name of ["Area", "Number"]) {
      expect(
        screen.getByRole("textbox", { name }).hasAttribute("disabled"),
      ).toBe(true);
    }
    expect(
      screen
        .getByRole("searchbox", { name: "Search" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("combobox", { name: "Combo" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  test("ComboBox on a phone: the disabled trigger does not open", async () => {
    setPhoneWidth();
    const user = userEvent.setup();
    render(<ComboBox label="Combo" items={items} isDisabled />);
    const trigger = screen.getByRole("button", { name: /Combo/ });
    expect(trigger.hasAttribute("disabled")).toBe(true);
    await user.click(trigger);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("DatePicker and CheckboxGroup", () => {
    render(
      <div>
        <DatePicker label="Date" defaultValue="2026-01-05" isDisabled />
        <CheckboxGroup label="Scope" isDisabled>
          <Checkbox value="a">Answers</Checkbox>
        </CheckboxGroup>
      </div>,
    );
    const date = screen.getByRole("group", { name: "Date" });
    for (const segment of within(date).getAllByRole("spinbutton")) {
      expect(segment.getAttribute("aria-disabled")).toBe("true");
    }
    expect(within(date).getByRole("button").hasAttribute("disabled")).toBe(
      true,
    );
    expect(
      screen
        .getByRole("checkbox", { name: "Answers" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("keyboard", () => {
  test("ComboBox on tablet and wider: arrows and Enter choose an item", async () => {
    const onChange = vi.fn();
    render(<ComboBox label="Assignee" items={items} onChange={onChange} />);
    const comboBox = new User({ interactionType: "keyboard" }).createTester(
      "ComboBox",
      { root: screen.getByRole("combobox") },
    );
    await comboBox.toggleOptionSelection({ option: "Ben" });
    expect(onChange).toHaveBeenLastCalledWith("b");
    expect((comboBox.getCombobox() as HTMLInputElement).value).toBe("Ben");
  });

  test("TagGroup: arrows move between tags", async () => {
    const user = userEvent.setup();
    render(
      <TagGroup
        aria-label="Supports"
        items={[
          { id: "a", label: "Local price" },
          { id: "b", label: "Permits" },
        ]}
        onRemove={() => {}}
      />,
    );
    await user.tab();
    expect(document.activeElement?.textContent).toContain("Local price");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.textContent).toContain("Permits");
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement?.textContent).toContain("Local price");
  });

  test("FileTrigger opens the chooser from Enter and Space", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FileTrigger>
        <Button variant="secondary">Choose file</Button>
      </FileTrigger>,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(click).toHaveBeenCalledTimes(2);
  });

  test("ActionGroup vertical moves with ArrowDown", async () => {
    const user = userEvent.setup();
    render(
      <ActionGroup aria-label="Tools" orientation="vertical">
        <ActionButton>One</ActionButton>
        <ActionButton>Two</ActionButton>
      </ActionGroup>,
    );
    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Two");
  });

  test("ToggleButtonGroup: arrows skip a disabled button", async () => {
    const user = userEvent.setup();
    render(
      <ToggleButtonGroup aria-label="F/A/U">
        <ToggleButton id="fact">Fact</ToggleButton>
        <ToggleButton id="assumption" isDisabled>
          Assumption
        </ToggleButton>
        <ToggleButton id="unknown">Unknown</ToggleButton>
      </ToggleButtonGroup>,
    );
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.textContent).toBe("Unknown");
  });
});
