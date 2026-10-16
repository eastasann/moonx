import { sizes } from "@moonx/ui-tokens";
import { User } from "@react-aria/test-utils";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vitest";
import type { ChoiceItem } from "../internal/ChoiceListBox";
import { setPhoneWidth } from "../test/helpers";
import { ActionButton, ActionGroup } from "./ActionButton";
import { Button, ButtonGroup } from "./Button";
import { Checkbox, CheckboxGroup } from "./Checkbox";
import { ComboBox } from "./ComboBox";
import { DatePicker } from "./DatePicker";
import { Divider } from "./Divider";
import { FileTrigger } from "./FileTrigger";
import { NumberField } from "./NumberField";
import { Picker } from "./Picker";
import { SearchField } from "./SearchField";
import { TagGroup } from "./TagGroup";
import { Text } from "./Text";
import { TextArea } from "./TextField";
import { ToggleButton, ToggleButtonGroup } from "./ToggleButtonGroup";
import { Well } from "./Well";

const items: ChoiceItem[] = [
  { id: "a", label: "Ana" },
  { id: "b", label: "Ben" },
];

/** input → frame → the field's outer element. */
const fieldRoot = (input: Element) =>
  input.parentElement?.parentElement as HTMLElement;

// Each case renders one instance per size and returns the element whose class carries
// the size; every size must look different.
const sized: [
  string,
  (size: (typeof sizes)[number]) => ReactElement,
  () => (Element | null)[],
][] = [
  [
    "ActionButton",
    (size) => <ActionButton size={size}>Tool</ActionButton>,
    () => screen.getAllByRole("button"),
  ],
  [
    "ToggleButtonGroup",
    (size) => (
      <ToggleButtonGroup aria-label={size} size={size}>
        <ToggleButton id="fact">Fact</ToggleButton>
      </ToggleButtonGroup>
    ),
    () => screen.getAllByRole("radio"),
  ],
  [
    "TextArea",
    (size) => <TextArea aria-label={size} size={size} />,
    () => screen.getAllByRole("textbox").map(fieldRoot),
  ],
  [
    "NumberField",
    (size) => <NumberField aria-label={size} size={size} />,
    () => screen.getAllByRole("textbox").map(fieldRoot),
  ],
  [
    "SearchField",
    (size) => <SearchField aria-label={size} size={size} />,
    () => screen.getAllByRole("searchbox").map(fieldRoot),
  ],
  [
    "Picker",
    (size) => <Picker aria-label={size} size={size} items={items} />,
    () => screen.getAllByRole("button").map((button) => button.parentElement),
  ],
  [
    "ComboBox",
    (size) => <ComboBox aria-label={size} size={size} items={items} />,
    () => screen.getAllByRole("combobox").map(fieldRoot),
  ],
  [
    "DatePicker",
    (size) => <DatePicker aria-label={size} size={size} />,
    () => screen.getAllByRole("group").map((group) => group.parentElement),
  ],
  [
    "CheckboxGroup",
    (size) => (
      <CheckboxGroup aria-label={size} size={size}>
        <Checkbox value="x">{size}</Checkbox>
      </CheckboxGroup>
    ),
    () =>
      screen
        .getAllByRole("checkbox")
        .map((box) => box.closest("label") as HTMLElement),
  ],
  [
    "TagGroup",
    (size) => (
      <TagGroup
        aria-label={size}
        size={size}
        items={[{ id: "t", label: size }]}
      />
    ),
    () => screen.getAllByRole("row"),
  ],
];

describe.each(sized)("%s sizes", (_, make, targets) => {
  test("S, M, L and XL look different", () => {
    render(
      <div>
        {sizes.map((size) => (
          <div key={size}>{make(size)}</div>
        ))}
      </div>,
    );
    const classes = targets().map((element) => element?.className);
    expect(classes).toHaveLength(4);
    expect(new Set(classes).size).toBe(4);
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
