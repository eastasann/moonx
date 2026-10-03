import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions, Text } from "react-native";
import { Button } from "../src/components/Button";
import { ResponsivePopover, useIsNarrow } from "../src/components/ResponsivePopover";

const setWidth = (width: number) =>
  act(() => {
    Dimensions.set({
      window: { width, height: 800, scale: 2, fontScale: 1 },
      screen: { width, height: 800, scale: 2, fontScale: 1 },
    });
  });

afterEach(() => setWidth(390));

function Probe() {
  return <Text>{useIsNarrow() ? "narrow" : "wide"}</Text>;
}

test("useIsNarrow is true below the tablet breakpoint and false from it", () => {
  setWidth(390);
  render(<Probe />);
  expect(screen.getByText("narrow")).toBeTruthy();
  setWidth(767);
  expect(screen.getByText("narrow")).toBeTruthy();
  setWidth(768);
  expect(screen.getByText("wide")).toBeTruthy();
});

test("opens a tray from its trigger, at phone and at tablet width", () => {
  for (const width of [390, 1024]) {
    setWidth(width);
    const { unmount } = render(
      <ResponsivePopover trigger={<Button>Open</Button>} aria-label="Details" placement="top end">
        <Text>Inside</Text>
      </ResponsivePopover>,
    );
    expect(screen.queryByText("Inside")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("Inside")).toBeTruthy();
    expect(screen.getByLabelText("Details")).toBeTruthy();
    unmount();
  }
});

test("close from the render function closes it and reports through onOpenChange", () => {
  const onOpenChange = jest.fn();
  render(
    <ResponsivePopover
      trigger={<Button>Open</Button>}
      aria-label="Details"
      onOpenChange={onOpenChange}
    >
      {({ close }) => <Button onPress={close}>Done</Button>}
    </ResponsivePopover>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Open" }));
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

test("defaultOpen and a controlled isOpen", () => {
  const { rerender } = render(
    <ResponsivePopover aria-label="Details" defaultOpen>
      <Text>Inside</Text>
    </ResponsivePopover>,
  );
  act(() => {});
  expect(screen.getByText("Inside")).toBeTruthy();
  rerender(
    <ResponsivePopover aria-label="Details" isOpen={false}>
      <Text>Inside</Text>
    </ResponsivePopover>,
  );
  act(() => {});
  expect(screen.queryByText("Inside")).toBeNull();
});
