import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tag, TagGroup } from "../src/components/TagGroup";
import { expectNoAxeViolations } from "./axe";
import { expectPressedLifecycle } from "./pressed";

interface SupportsProps {
  description?: string;
  errorMessage?: string;
  isInvalid?: boolean;
  size?: "S" | "M" | "L" | "XL";
  onRemove?: (ids: string[]) => void;
}

function Supports({ onRemove, ...props }: SupportsProps) {
  const tags = [
    <Tag key="cost" id="cost">
      Cost
    </Tag>,
    <Tag key="demand" id="demand">
      Demand
    </Tag>,
  ];
  return onRemove ? (
    <TagGroup label="Supports" onRemove={onRemove} removeLabel="Remove" {...props}>
      {tags}
    </TagGroup>
  ) : (
    <TagGroup label="Supports" {...props}>
      {tags}
    </TagGroup>
  );
}

describe("TagGroup", () => {
  test.each(["S", "M", "L", "XL"] as const)(
    "renders a labelled list of tags at size %s",
    (size) => {
      render(<Supports size={size} />);
      const group = screen.getByRole("grid", { name: "Supports" });
      expect(within(group).getAllByRole("row")).toHaveLength(2);
    },
  );

  test("can be named with aria-label instead of a visible label", () => {
    render(
      <TagGroup aria-label="Filters">
        <Tag id="a">A</Tag>
      </TagGroup>,
    );
    expect(screen.getByRole("grid", { name: "Filters" })).toBeInTheDocument();
  });

  test("shows no remove buttons without onRemove", () => {
    render(<Supports />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("removes a tag with the pointer and reports its id", async () => {
    const onRemove = vi.fn();
    render(<Supports onRemove={onRemove} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName("Remove Cost");
    await userEvent.click(buttons[0] as HTMLElement);
    expect(onRemove).toHaveBeenCalledWith(["cost"]);
  });

  test("removes the focused tag with Delete and moves between tags with the arrow keys", async () => {
    const onRemove = vi.fn();
    render(<Supports onRemove={onRemove} />);
    await userEvent.tab();
    const rows = screen.getAllByRole("row");
    expect(rows[0]).toHaveFocus();
    expect(rows[0]).toHaveAttribute("data-focus-visible");
    await userEvent.keyboard("{ArrowRight}");
    expect(rows[1]).toHaveFocus();
    await userEvent.keyboard("{Delete}");
    expect(onRemove).toHaveBeenCalledWith(["demand"]);
  });

  test("shows description, and the error message only while invalid", () => {
    const { rerender } = render(
      <Supports description="Pick the items this log supports" errorMessage="Add at least one" />,
    );
    expect(screen.getByText("Pick the items this log supports")).toBeInTheDocument();
    expect(screen.queryByText("Add at least one")).not.toBeInTheDocument();
    rerender(
      <Supports
        description="Pick the items this log supports"
        errorMessage="Add at least one"
        isInvalid
      />,
    );
    expect(screen.getByText("Add at least one")).toBeInTheDocument();
  });

  test("a disabled tag is marked and keeps its remove button inert", () => {
    render(
      <TagGroup label="Supports" onRemove={() => {}} removeLabel="Remove">
        <Tag id="cost" isDisabled>
          Cost
        </Tag>
      </TagGroup>,
    );
    expect(screen.getByRole("row")).toHaveAttribute("data-disabled");
  });

  test("sets state attributes for hover", async () => {
    render(<Supports onRemove={() => {}} />);
    const button = screen.getAllByRole("button")[0] as HTMLElement;
    await userEvent.hover(button);
    expect(button).toHaveAttribute("data-hovered");
  });

  test("a remove button is pressed while held and released after, by pointer and keyboard", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<Supports onRemove={onRemove} />);
    const remove = screen.getByRole("button", { name: "Remove Cost" });
    await user.pointer({ keys: "[MouseLeft>]", target: remove });
    expect(remove).toHaveAttribute("data-pressed");
    await user.pointer({ keys: "[/MouseLeft]" });
    expect(remove).not.toHaveAttribute("data-pressed");
    expect(onRemove).toHaveBeenCalledWith(["cost"]);
  });

  // Why: the tag stays mounted here because onRemove is a mock, so the plain press lifecycle can
  // run on the button. In a real list the release removes the tag and the button with it.
  test("keyboard presses set and clear data-pressed on a remove button", async () => {
    const user = userEvent.setup();
    render(<Supports onRemove={vi.fn()} />);
    await expectPressedLifecycle(screen.getByRole("button", { name: "Remove Demand" }), user);
  });

  test("a disabled tag's remove button is disabled, not hovered and does not remove", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <TagGroup label="Supports" onRemove={onRemove} removeLabel="Remove">
        <Tag id="cost" isDisabled>
          Cost
        </Tag>
      </TagGroup>,
    );
    const remove = screen.getByRole("button", { name: "Remove Cost" });
    expect(remove).toHaveAttribute("data-disabled");
    await user.hover(remove);
    expect(remove).not.toHaveAttribute("data-hovered");
    await user.click(remove);
    expect(onRemove).not.toHaveBeenCalled();
  });

  test("a pointer click on a tag does not show data-focus-visible", async () => {
    const user = userEvent.setup();
    render(<Supports onRemove={vi.fn()} />);
    const row = screen.getAllByRole("row")[0] as HTMLElement;
    await user.click(row);
    expect(row).not.toHaveAttribute("data-focus-visible");
  });

  test("has no axe violations", async () => {
    const { container } = render(<Supports description="Hint" onRemove={() => {}} />);
    await expectNoAxeViolations(container);
  });
});
