import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { Button } from "../src";
import { IllustratedMessage } from "../src/components/IllustratedMessage";
import { expectNoAxeViolations } from "./axe";

test("renders heading, description and the actions slot", async () => {
  const onPress = vi.fn();
  render(
    <IllustratedMessage
      icon={Inbox}
      heading="No ideas yet"
      actions={<Button onPress={onPress}>New idea</Button>}
    >
      Start with one you can test.
    </IllustratedMessage>,
  );
  expect(screen.getByRole("heading", { level: 2, name: "No ideas yet" })).toBeInTheDocument();
  expect(screen.getByText("Start with one you can test.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "New idea" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("the actions are reachable with the keyboard", async () => {
  render(
    <IllustratedMessage icon={Inbox} heading="Nothing here" actions={<Button>Go back</Button>} />,
  );
  await userEvent.tab();
  expect(screen.getByRole("button", { name: "Go back" })).toHaveFocus();
});

test("heading level is configurable and the icon is decorative", () => {
  const { container } = render(
    <IllustratedMessage icon={Inbox} heading="Empty" headingLevel={3} />,
  );
  expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
  expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});

test("has no axe violations", async () => {
  const { container } = render(
    <IllustratedMessage icon={Inbox} heading="No ideas yet" actions={<Button>New idea</Button>}>
      Start with one you can test.
    </IllustratedMessage>,
  );
  await expectNoAxeViolations(container);
});
