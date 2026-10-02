import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Card } from "../src/components/Card";
import { CardView } from "../src/components/CardView";
import { expectNoAxeViolations } from "./axe";
import {
  expectKeyPressedLifecycle,
  expectPointerPressedLifecycle,
  expectPressedLifecycle,
} from "./pressed";

test("renders its content inside the card row", () => {
  render(
    <CardView aria-label="Blocks">
      <Card id="a" textValue="Margin">
        <strong>Margin</strong>
        <span>32%</span>
      </Card>
    </CardView>,
  );
  const row = screen.getByRole("row");
  expect(row).toHaveTextContent("Margin32%");
});

test("a link card has the href and opens with Enter", async () => {
  const onAction = vi.fn();
  render(
    <CardView aria-label="Competitors">
      <Card id="a" textValue="Alpha" href="/a" onAction={onAction}>
        Alpha
      </Card>
    </CardView>,
  );
  const row = screen.getByRole("row");
  expect(row).toHaveAttribute("data-href", "/a");
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  expect(onAction).toHaveBeenCalledTimes(1);
});

test("a disabled card sets data-disabled and ignores presses", async () => {
  const onAction = vi.fn();
  render(
    <CardView aria-label="Blocks">
      <Card id="a" textValue="Alpha" isDisabled onAction={onAction}>
        Alpha
      </Card>
    </CardView>,
  );
  const row = screen.getByRole("row");
  expect(row).toHaveAttribute("data-disabled");
  await userEvent.click(row);
  expect(onAction).not.toHaveBeenCalled();
});

test.each([
  ["with an action", { onAction: () => {} }, {}],
  ["that is selectable", { selectionMode: "single" as const }, {}],
])(
  "a card %s is pressed while held and released after, by pointer and keyboard",
  async (_name, viewProps, cardProps) => {
    const user = userEvent.setup();
    render(
      <CardView aria-label="Blocks" {...viewProps}>
        <Card id="a" textValue="Alpha" {...cardProps}>
          Alpha
        </Card>
      </CardView>,
    );
    await expectPressedLifecycle(screen.getByRole("row"), user);
  },
);

// Why: each way gets its own render. Enter on a link card activates the link, and in jsdom a Space
// press that follows in the same render is not reported as pressed. Each way passes on its own.
test.each(["pointer", "Enter", "Space"] as const)(
  "a link card is pressed while held and released after, by %s",
  async (way) => {
    const user = userEvent.setup();
    render(
      <CardView aria-label="Competitors">
        <Card id="a" textValue="Alpha" href="/a">
          Alpha
        </Card>
      </CardView>,
    );
    const row = screen.getByRole("row");
    if (way === "pointer") {
      await expectPointerPressedLifecycle(row, user);
    } else {
      row.focus();
      await expectKeyPressedLifecycle(row, user, way);
    }
  },
);

test("a card shows data-hovered on hover and clears on leaving", async () => {
  const user = userEvent.setup();
  render(
    <CardView aria-label="Blocks" onAction={() => {}}>
      <Card id="a" textValue="Alpha">
        Alpha
      </Card>
    </CardView>,
  );
  const row = screen.getByRole("row");
  await user.hover(row);
  expect(row).toHaveAttribute("data-hovered");
  await user.unhover(row);
  expect(row).not.toHaveAttribute("data-hovered");
});

test("keyboard focus shows data-focus-visible on a card, a pointer click does not", async () => {
  const user = userEvent.setup();
  render(
    <CardView aria-label="Blocks" onAction={() => {}}>
      <Card id="a" textValue="Alpha">
        Alpha
      </Card>
    </CardView>,
  );
  const row = screen.getByRole("row");
  await user.tab();
  expect(row).toHaveFocus();
  expect(row).toHaveAttribute("data-focus-visible");
  await user.tab();
  expect(row).not.toHaveAttribute("data-focus-visible");
  await user.click(row);
  expect(row).toHaveFocus();
  expect(row).not.toHaveAttribute("data-focus-visible");
});

test("has no axe violations", async () => {
  const { container } = render(
    <CardView aria-label="Competitors">
      <Card id="a" textValue="Alpha" href="/a">
        Alpha
      </Card>
      <Card id="b" textValue="Beta">
        Beta
      </Card>
    </CardView>,
  );
  await expectNoAxeViolations(container);
});
