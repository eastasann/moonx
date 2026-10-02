import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { History, MessageSquare } from "lucide-react";
import { ActionGroup, ActionGroupItem } from "../src/components/ActionGroup";
import { expectNoAxeViolations } from "./axe";
import { expectPressedLifecycle } from "./pressed";

describe("ActionGroup", () => {
  test.each(["S", "M", "L", "XL"] as const)("renders a toolbar at size %s", (size) => {
    render(
      <ActionGroup aria-label="Tools" size={size}>
        <ActionGroupItem id="comments">Comments</ActionGroupItem>
      </ActionGroup>,
    );
    expect(screen.getByRole("toolbar", { name: "Tools" })).toBeInTheDocument();
  });

  test.each(["none", "single", "multiple"] as const)(
    "isDisabled disables every item in %s mode",
    async (selectionMode) => {
      const onPress = vi.fn();
      const onChange = vi.fn();
      render(
        <ActionGroup
          aria-label="Tools"
          selectionMode={selectionMode}
          isDisabled
          onChange={onChange}
        >
          <ActionGroupItem id="a" onPress={onPress}>
            A
          </ActionGroupItem>
          <ActionGroupItem id="b" onPress={onPress}>
            B
          </ActionGroupItem>
        </ActionGroup>,
      );
      const items = screen.getAllByRole(
        { none: "button", single: "radio", multiple: "button" }[selectionMode],
      );
      expect(items).toHaveLength(2);
      for (const button of items) {
        expect(button).toHaveAttribute("data-disabled");
        await userEvent.click(button);
      }
      expect(onPress).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  test("none mode presses plain buttons, including quiet icon-only ones", async () => {
    const onComments = vi.fn();
    render(
      <ActionGroup aria-label="Tools" isQuiet>
        <ActionGroupItem
          id="comments"
          icon={<MessageSquare />}
          aria-label="Comments"
          onPress={onComments}
        />
        <ActionGroupItem id="history" icon={<History />} aria-label="History" isDisabled />
      </ActionGroup>,
    );
    const comments = screen.getByRole("button", { name: "Comments" });
    await userEvent.click(comments);
    expect(onComments).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "History" })).toHaveAttribute("data-disabled");
  });

  test("moves between items with the arrow keys", async () => {
    render(
      <ActionGroup aria-label="Tools">
        <ActionGroupItem id="a">A</ActionGroupItem>
        <ActionGroupItem id="b">B</ActionGroupItem>
      </ActionGroup>,
    );
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "A" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "A" })).toHaveAttribute("data-focus-visible");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "B" })).toHaveFocus();
  });

  test("single mode reports the selected id and sets data-selected", async () => {
    const onChange = vi.fn();
    render(
      <ActionGroup aria-label="View" selectionMode="single" onChange={onChange}>
        <ActionGroupItem id="cards">Cards</ActionGroupItem>
        <ActionGroupItem id="table">Table</ActionGroupItem>
      </ActionGroup>,
    );
    const table = screen.getByRole("radio", { name: "Table" });
    await userEvent.click(table);
    expect(onChange).toHaveBeenLastCalledWith(["table"]);
    expect(table).toHaveAttribute("data-selected");
  });

  test("multiple mode keeps several selected", async () => {
    const onChange = vi.fn();
    render(
      <ActionGroup
        aria-label="Filters"
        selectionMode="multiple"
        defaultValue={["a"]}
        onChange={onChange}
      >
        <ActionGroupItem id="a">A</ActionGroupItem>
        <ActionGroupItem id="b">B</ActionGroupItem>
      </ActionGroup>,
    );
    await userEvent.click(screen.getByRole("button", { name: "B" }));
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    expect(screen.getByRole("button", { name: "A" })).toHaveAttribute("aria-pressed", "true");
  });

  test("a disabled group blocks selection", async () => {
    const onChange = vi.fn();
    render(
      <ActionGroup aria-label="View" selectionMode="single" isDisabled onChange={onChange}>
        <ActionGroupItem id="cards">Cards</ActionGroupItem>
      </ActionGroup>,
    );
    await userEvent.click(screen.getByRole("radio", { name: "Cards" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("hover is shown through data-hovered on an item and clears on leaving", async () => {
    const user = userEvent.setup();
    render(
      <ActionGroup aria-label="Tools">
        <ActionGroupItem id="a">A</ActionGroupItem>
        <ActionGroupItem id="b" isDisabled>
          B
        </ActionGroupItem>
      </ActionGroup>,
    );
    const a = screen.getByRole("button", { name: "A" });
    await user.hover(a);
    expect(a).toHaveAttribute("data-hovered");
    await user.unhover(a);
    expect(a).not.toHaveAttribute("data-hovered");
    await user.hover(screen.getByRole("button", { name: "B" }));
    expect(screen.getByRole("button", { name: "B" })).not.toHaveAttribute("data-hovered");
  });

  test.each([
    ["none", "button"],
    ["single", "radio"],
    ["multiple", "button"],
  ] as const)(
    "an item is pressed while held and released after, in %s mode",
    async (mode, role) => {
      const user = userEvent.setup();
      render(
        <ActionGroup aria-label="Tools" selectionMode={mode}>
          <ActionGroupItem id="a">A</ActionGroupItem>
          <ActionGroupItem id="b">B</ActionGroupItem>
        </ActionGroup>,
      );
      await expectPressedLifecycle(screen.getByRole(role, { name: "A" }), user);
    },
  );

  test("has no axe violations", async () => {
    const { container } = render(
      <ActionGroup aria-label="Tools" isQuiet>
        <ActionGroupItem id="comments" icon={<MessageSquare />} aria-label="Comments" />
        <ActionGroupItem id="history">History</ActionGroupItem>
      </ActionGroup>,
    );
    await expectNoAxeViolations(container);
  });
});
