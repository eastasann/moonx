import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Panel } from "../src/components/Panel";

function Harness({
  onOpenChange = () => {},
  isOpen = true,
}: {
  onOpenChange?: (o: boolean) => void;
  isOpen?: boolean;
}) {
  return (
    <Panel
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Comments"
      closeLabel="Close comments"
      footer={<Text>Comment input</Text>}
    >
      <Text>Thread one</Text>
    </Panel>
  );
}

test("while open it shows the title, body and footer in a tray named by the title", () => {
  render(<Harness />);
  act(() => {});
  expect(screen.getByLabelText("Comments", { exact: true })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Comments" })).toBeTruthy();
  expect(screen.getByText("Thread one")).toBeTruthy();
  expect(screen.getByText("Comment input")).toBeTruthy();
});

test("closed it renders nothing", () => {
  render(<Harness isOpen={false} />);
  expect(screen.queryByText("Thread one")).toBeNull();
});

test("opening and closing follows isOpen", () => {
  const { rerender } = render(<Harness isOpen={false} />);
  rerender(<Harness isOpen />);
  act(() => {});
  expect(screen.getByText("Thread one")).toBeTruthy();
  rerender(<Harness isOpen={false} />);
  act(() => {});
  expect(screen.queryByText("Thread one")).toBeNull();
});

test("the close button has its own name, a 44 touch target and reports false", () => {
  const onOpenChange = jest.fn();
  render(<Harness onOpenChange={onOpenChange} />);
  act(() => {});
  const close = screen.getByRole("button", { name: "Close comments" });
  expect(close.props.style.minHeight).toBeGreaterThanOrEqual(44);
  fireEvent.press(close);
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("the footer is optional", () => {
  render(
    <Panel isOpen onOpenChange={() => {}} title="History" closeLabel="Close history">
      <Text>Change one</Text>
    </Panel>,
  );
  act(() => {});
  expect(screen.getByText("Change one")).toBeTruthy();
  expect(screen.queryByText("Comment input")).toBeNull();
});
