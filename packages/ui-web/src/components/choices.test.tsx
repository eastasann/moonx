import { sizes } from "@moonx/ui-tokens";
import { User } from "@react-aria/test-utils";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { Button } from "./Button";
import { Checkbox, CheckboxGroup } from "./Checkbox";
import { FileTrigger } from "./FileTrigger";
import { Form } from "./Form";
import { Radio, RadioGroup } from "./RadioGroup";
import { Switch } from "./Switch";
import { TagGroup, type TagItem } from "./TagGroup";
import * as styles from "./TagGroup.css";

describe("RadioGroup", () => {
  test("arrows choose; a disabled radio is skipped", async () => {
    const onChange = vi.fn();
    render(
      <RadioGroup label="Decision" onChange={onChange}>
        <Radio value="proceed">Proceed</Radio>
        <Radio value="hold" isDisabled>
          Hold
        </Radio>
        <Radio value="drop">Drop</Radio>
      </RadioGroup>,
    );
    const group = new User({ interactionType: "keyboard" }).createTester(
      "RadioGroup",
      { root: screen.getByRole("radiogroup", { name: "Decision" }) },
    );
    await group.triggerRadio({ radio: "Drop" });
    expect(onChange).toHaveBeenLastCalledWith("drop");
    expect(group.getSelectedRadio()?.getAttribute("value")).toBe("drop");
    expect(
      screen.getByRole("radio", { name: "Hold" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  test("ArrowDown passes over the disabled radio", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <RadioGroup label="Decision" defaultValue="proceed" onChange={onChange}>
        <Radio value="proceed">Proceed</Radio>
        <Radio value="hold" isDisabled>
          Hold
        </Radio>
        <Radio value="drop">Drop</Radio>
      </RadioGroup>,
    );
    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith("drop");
  });

  test("the error marks the group invalid and is read with it", () => {
    render(
      <RadioGroup label="Go / No-Go" errorMessage="Choose one.">
        <Radio value="launch">Launch</Radio>
      </RadioGroup>,
    );
    const group = screen.getByRole("radiogroup", { name: "Go / No-Go" });
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(group.getAttribute("aria-describedby")).toBe(
      screen.getByText("Choose one.").closest("[id]")?.id,
    );
  });

  test("sizes reach the radios", () => {
    render(
      <div>
        {sizes.map((size) => (
          <RadioGroup key={size} label={size} size={size}>
            <Radio value="a">{`Radio ${size}`}</Radio>
          </RadioGroup>
        ))}
      </div>,
    );
    const looks = sizes.map(
      (size) =>
        screen.getByText(`Radio ${size}`).closest("label")?.className ?? "",
    );
    expect(new Set(looks).size).toBe(4);
  });
});

describe("RadioGroup cards", () => {
  test("each choice is a radio named by its title and its line; arrows choose", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RadioGroup
        label="Should we develop this into a full Business Plan?"
        variant="cards"
        onChange={onChange}
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
      </RadioGroup>,
    );
    const group = screen.getByRole("radiogroup", {
      name: "Should we develop this into a full Business Plan?",
    });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    // The line sits in the radio's label, so it is read with the title.
    expect(
      within(group).getByRole("radio", { name: "Hold Come back later" }),
    ).toBeTruthy();
    await user.click(screen.getByText("Hold"));
    expect(onChange).toHaveBeenLastCalledWith("hold");
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("drop");
  });
});

describe("Checkbox", () => {
  test("Space toggles; mixed is announced; disabled does not change", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <Checkbox onChange={onChange}>Apply</Checkbox>
        <Checkbox isIndeterminate>Some</Checkbox>
        <Checkbox isDisabled>Locked</Checkbox>
      </>,
    );
    await user.tab();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(
      (screen.getByRole("checkbox", { name: "Some" }) as HTMLInputElement)
        .indeterminate,
    ).toBe(true);
    const locked = screen.getByRole("checkbox", { name: "Locked" });
    await user.click(locked);
    expect((locked as HTMLInputElement).checked).toBe(false);
  });

  test("a group reports the values that are ticked", async () => {
    function Scope() {
      const [value, setValue] = useState(["answers"]);
      return (
        <>
          <CheckboxGroup label="Scope" value={value} onChange={setValue}>
            <Checkbox value="answers">Answers</Checkbox>
            <Checkbox value="numbers">Numbers</Checkbox>
          </CheckboxGroup>
          <output>{value.join(",")}</output>
        </>
      );
    }
    render(<Scope />);
    const group = new User().createTester("CheckboxGroup", {
      root: screen.getByRole("group", { name: "Scope" }),
    });
    await group.toggleCheckbox({ checkbox: "Numbers" });
    expect(screen.getByRole("status").textContent).toBe("answers,numbers");
    await group.toggleCheckbox({ checkbox: "Answers" });
    expect(screen.getByRole("status").textContent).toBe("numbers");
  });

  test("a lone box ignores a Form error for its name (it could not say why)", () => {
    render(
      <Form validationErrors={{ agree: "Tick the box." }}>
        <Checkbox name="agree">Agree</Checkbox>
      </Form>,
    );
    expect(
      screen
        .getByRole("checkbox", { name: "Agree" })
        .getAttribute("aria-invalid"),
    ).toBeNull();
  });

  test("a group's error marks its boxes invalid and is read with the group", () => {
    render(
      <CheckboxGroup label="Share with" errorMessage="Choose at least one.">
        <Checkbox value="ana">Ana</Checkbox>
      </CheckboxGroup>,
    );
    expect(
      screen
        .getByRole("checkbox", { name: "Ana" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      screen
        .getByRole("group", { name: "Share with" })
        .getAttribute("aria-describedby"),
    ).toBe(screen.getByText("Choose at least one.").closest("[id]")?.id);
  });
});

describe("Switch", () => {
  test("is a switch that keyboard and pointer turn on and off", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch onChange={onChange}>Focus</Switch>);
    const toggle = screen.getByRole("switch", { name: "Focus" });
    await user.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(true);
    await user.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  test("sizes differ; disabled ignores presses", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <Switch size="S">Small</Switch>
        <Switch size="XL">Large</Switch>
        <Switch isDisabled onChange={onChange}>
          Locked
        </Switch>
      </>,
    );
    const label = (name: string) =>
      screen.getByRole("switch", { name }).closest("label")?.className;
    expect(label("Small")).not.toBe(label("Large"));
    await user.click(screen.getByRole("switch", { name: "Locked" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("FileTrigger", () => {
  test("the wrapped button opens the chooser and reports the files", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <FileTrigger acceptedFileTypes={[".md", ".json"]} onSelect={onSelect}>
        <Button variant="secondary">Choose file</Button>
      </FileTrigger>,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.getAttribute("accept")).toBe(".md,.json");
    const click = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "Choose file" }));
    expect(click).toHaveBeenCalled();
    const file = new File(["# reply"], "reply.md", { type: "text/markdown" });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect([...(onSelect.mock.calls[0]?.[0] ?? [])][0]?.name).toBe("reply.md");
  });
});

describe("TagGroup", () => {
  const items: TagItem[] = [
    { id: "local_price", label: "Local price" },
    { id: "permits", label: "Permits" },
  ];

  function Supports() {
    const [tags, setTags] = useState(items);
    return (
      <TagGroup
        label="Supports"
        items={tags}
        onRemove={(ids) =>
          setTags((all) => all.filter((tag) => !ids.has(tag.id)))
        }
        renderEmptyState={() => "No checks"}
      />
    );
  }

  test("the × button removes a tag", async () => {
    const user = userEvent.setup();
    render(<Supports />);
    const removeButtons = screen.getAllByRole("button");
    expect(removeButtons).toHaveLength(2);
    await user.click(removeButtons[0] as HTMLElement);
    expect(screen.queryByText("Local price")).toBeNull();
  });

  test("Delete removes the focused tag; the empty state replaces the last", async () => {
    const user = userEvent.setup();
    render(<Supports />);
    await user.tab();
    await user.keyboard("{Delete}");
    await user.tab({ shift: true });
    await user.tab();
    await user.keyboard("{Backspace}");
    expect(screen.getByText("No checks")).toBeTruthy();
  });

  test("without onRemove there are no remove buttons", () => {
    render(<TagGroup aria-label="Filters" items={items} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  test("a suffix stands outside the label a narrow tag cuts, and is in its name", () => {
    render(
      <TagGroup
        aria-label="Attached"
        items={[
          { id: "log", label: "Sep 22 Clinic summary", suffix: "(deleted)" },
        ]}
      />,
    );
    const tag = screen.getByRole("row", {
      name: "Sep 22 Clinic summary (deleted)",
    });
    const suffix = within(tag).getByText("(deleted)");
    expect(suffix.closest(`.${styles.tagLabel}`)).toBeNull();
    expect(suffix.className).toContain(styles.tagSuffix);
  });
});
