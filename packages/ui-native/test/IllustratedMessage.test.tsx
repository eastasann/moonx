import { fireEvent, render, screen } from "@testing-library/react-native";
import { Inbox } from "lucide-react-native";
import { Button } from "../src/components/Button";
import { IllustratedMessage } from "../src/components/IllustratedMessage";

test("shows a heading, the description and the actions", () => {
  const onPress = jest.fn();
  render(
    <IllustratedMessage
      icon={Inbox}
      heading="No ideas yet"
      actions={<Button onPress={onPress}>Add an idea</Button>}
    >
      Start with one that comes to mind.
    </IllustratedMessage>,
  );
  expect(screen.getByRole("heading", { name: "No ideas yet" })).toBeTruthy();
  expect(screen.getByText("Start with one that comes to mind.")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Add an idea" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("the heading level defaults to 2 and can be 3 or 4", () => {
  const { rerender } = render(<IllustratedMessage icon={Inbox} heading="Empty" />);
  expect(screen.getByRole("heading").props["aria-level"]).toBe(2);
  rerender(<IllustratedMessage icon={Inbox} heading="Empty" headingLevel={4} />);
  expect(screen.getByRole("heading").props["aria-level"]).toBe(4);
});

test("the icon is decorative and the description and actions are optional", () => {
  render(<IllustratedMessage icon={Inbox} heading="Empty" />);
  expect(screen.UNSAFE_getAllByProps({ "aria-hidden": true }).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/./)).toHaveLength(1);
});
