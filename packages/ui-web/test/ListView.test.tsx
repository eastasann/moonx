import { User } from "@react-aria/test-utils";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListView, ListViewItem, type ListViewProps } from "../src/components/ListView";
import { expectNoAxeViolations } from "./axe";
import { expectPressedLifecycle } from "./pressed";

interface Idea {
  id: string;
  name: string;
}

const ideas: Idea[] = [
  { id: "1", name: "Piaya Gift Box" },
  { id: "2", name: "Bacolod Coffee Cart" },
  { id: "3", name: "Archived idea" },
];

type IdeasProps = Omit<ListViewProps<Idea>, "aria-label" | "items" | "children">;

function Ideas(props: IdeasProps) {
  return (
    <ListView<Idea> aria-label="Ideas" items={ideas} disabledKeys={["3"]} {...props}>
      {(idea) => (
        <ListViewItem id={idea.id} textValue={idea.name}>
          {idea.name}
        </ListViewItem>
      )}
    </ListView>
  );
}

const user = new User({ interactionType: "mouse" });

describe("ListView", () => {
  test.each(["compact", "regular", "spacious"] as const)(
    "renders rows at %s density",
    (density) => {
      render(<Ideas density={density} />);
      const grid = screen.getByRole("grid", { name: "Ideas" });
      expect(within(grid).getAllByRole("row")).toHaveLength(3);
    },
  );

  test("shows the empty state", () => {
    render(
      <ListView aria-label="Ideas" items={[]} emptyState="No ideas">
        {() => <ListViewItem textValue="x">x</ListViewItem>}
      </ListView>,
    );
    expect(screen.getByText("No ideas")).toBeInTheDocument();
  });

  test("single selection marks the row and reports the key", async () => {
    const onChange = vi.fn();
    render(<Ideas selectionMode="single" onSelectionChange={onChange} />);
    await userEvent.click(screen.getByRole("row", { name: "Bacolod Coffee Cart" }));
    expect(Array.from(onChange.mock.calls[0]?.[0] ?? [])).toEqual(["2"]);
    expect(screen.getByRole("row", { name: "Bacolod Coffee Cart" })).toHaveAttribute(
      "data-selected",
    );
  });

  test("multiple selection renders checkboxes and toggles with them", async () => {
    render(<Ideas selectionMode="multiple" />);
    const tester = user.createTester("GridList", { root: screen.getByRole("grid") });
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    await tester.toggleRowSelection({ row: 0 });
    expect(screen.getAllByRole("row")[0]).toHaveAttribute("aria-selected", "true");
  });

  test("hover is reflected as a data attribute, disabled rows reject input", async () => {
    const onAction = vi.fn();
    render(<Ideas onAction={onAction} />);
    const first = screen.getByRole("row", { name: "Piaya Gift Box" });
    await userEvent.hover(first);
    expect(first).toHaveAttribute("data-hovered");
    const disabled = screen.getByRole("row", { name: "Archived idea" });
    expect(disabled).toHaveAttribute("data-disabled");
    await userEvent.click(disabled);
    expect(onAction).not.toHaveBeenCalled();
  });

  test.each([
    ["with an action", { onAction: () => {} }],
    ["in single selection", { selectionMode: "single" as const }],
  ])(
    "a row %s is pressed while held and released after, by pointer and keyboard",
    async (_name, props) => {
      const ue = userEvent.setup();
      render(<Ideas {...props} />);
      await expectPressedLifecycle(screen.getByRole("row", { name: "Piaya Gift Box" }), ue);
    },
  );

  test("a disabled row is never pressed", async () => {
    const ue = userEvent.setup();
    render(<Ideas onAction={() => {}} />);
    const disabled = screen.getByRole("row", { name: "Archived idea" });
    await ue.pointer({ keys: "[MouseLeft>]", target: disabled });
    expect(disabled).not.toHaveAttribute("data-pressed");
    await ue.pointer({ keys: "[/MouseLeft]" });
  });

  test("a pointer click does not show data-focus-visible", async () => {
    const ue = userEvent.setup();
    render(<Ideas />);
    const first = screen.getByRole("row", { name: "Piaya Gift Box" });
    await ue.click(first);
    expect(first).toHaveFocus();
    expect(first).not.toHaveAttribute("data-focus-visible");
  });

  test("arrow keys move focus and show the focus ring attribute", async () => {
    render(<Ideas />);
    await userEvent.tab();
    expect(screen.getByRole("row", { name: "Piaya Gift Box" })).toHaveAttribute(
      "data-focus-visible",
    );
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("row", { name: "Bacolod Coffee Cart" })).toHaveAttribute(
      "data-focus-visible",
    );
  });

  test("Enter runs the row action", async () => {
    const onAction = vi.fn();
    render(<Ideas onAction={onAction} />);
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledWith("1");
  });

  test("has no axe violations", async () => {
    const { container } = render(<Ideas selectionMode="multiple" />);
    await expectNoAxeViolations(container);
  });
});
