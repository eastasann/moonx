import { CalendarDate, CalendarDateTime, getLocalTimeZone, today } from "@internationalized/date";
import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { DatePicker } from "../src/components/DatePicker";
import { styleOf } from "./fieldHelpers";

afterEach(resetMockUnistyles);

function Deadline(props: Partial<React.ComponentProps<typeof DatePicker>>) {
  return (
    <DatePicker
      label="Deadline"
      placeholder="Pick a date"
      openLabel="Open calendar"
      previousMonthLabel="Previous month"
      nextMonthLabel="Next month"
      {...props}
    />
  );
}

const october = new CalendarDate(2026, 10, 2);
const field = () => screen.getByRole("button", { name: "Deadline" });
const open = () => fireEvent.press(field());
const day = (name: RegExp) => screen.getByRole("button", { name });
const heading = () => screen.getByRole("heading");

test.each(COMPONENT_SIZES)("closed, it is a button at least 44 high at size %s", (size) => {
  render(<Deadline size={size} />);
  expect(styleOf(field(), "minHeight").minHeight).toBeGreaterThanOrEqual(44);
  expect(field().props.accessibilityHint).toBe("Open calendar");
  expect(field().props.accessibilityState).toMatchObject({ expanded: false });
  expect(screen.getByText("Pick a date")).toBeTruthy();
});

test("shows the value in en-PH format", () => {
  render(<Deadline defaultValue={october} />);
  expect(screen.getByText("Oct 2, 2026")).toBeTruthy();
  expect(field().props.accessibilityValue).toEqual({ text: "Oct 2, 2026" });
});

test("opens a month grid at the value's month with the navigation buttons", () => {
  render(<Deadline defaultValue={october} />);
  open();
  expect(heading()).toHaveTextContent("October 2026");
  expect(screen.getByRole("button", { name: "Previous month" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next month" })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /day, .*2026$/ })).toHaveLength(31);
});

test("every day cell and navigation button is at least 44 high and wide", () => {
  render(<Deadline defaultValue={october} />);
  open();
  for (const cell of screen.getAllByRole("button", { name: /day, .*2026$/ })) {
    expect(styleOf(cell, "minHeight").minHeight).toBeGreaterThanOrEqual(44);
  }
  for (const name of ["Previous month", "Next month"]) {
    const button = screen.getByRole("button", { name });
    expect(styleOf(button, "minHeight").minHeight).toBeGreaterThanOrEqual(44);
    expect(styleOf(button, "minWidth").minWidth).toBeGreaterThanOrEqual(44);
  }
});

test("choosing a day reports a CalendarDate, closes the tray and shows it", () => {
  const onChange = jest.fn();
  render(<Deadline defaultValue={october} onChange={onChange} />);
  open();
  fireEvent.press(day(/October 15, 2026/));
  expect(onChange).toHaveBeenCalledWith(new CalendarDate(2026, 10, 15));
  expect(screen.queryByRole("heading")).toBeNull();
  expect(screen.getByText("Oct 15, 2026")).toBeTruthy();
});

test("with no value the day is reported as a CalendarDate; a date-time value keeps its time", () => {
  const onChange = jest.fn();
  const { unmount } = render(<Deadline placeholderValue={october} onChange={onChange} />);
  open();
  expect(heading()).toHaveTextContent("October 2026");
  fireEvent.press(day(/October 9, 2026/));
  expect(onChange).toHaveBeenLastCalledWith(new CalendarDate(2026, 10, 9));
  unmount();
  render(<Deadline defaultValue={new CalendarDateTime(2026, 10, 2, 14, 30)} onChange={onChange} />);
  open();
  fireEvent.press(day(/October 9, 2026/));
  expect(onChange).toHaveBeenLastCalledWith(new CalendarDateTime(2026, 10, 9, 14, 30));
});

test("the month buttons move between months", () => {
  render(<Deadline defaultValue={october} />);
  open();
  fireEvent.press(screen.getByRole("button", { name: "Next month" }));
  expect(heading()).toHaveTextContent("November 2026");
  expect(screen.getAllByRole("button", { name: /day, .*2026$/ })).toHaveLength(30);
  fireEvent.press(screen.getByRole("button", { name: "Previous month" }));
  fireEvent.press(screen.getByRole("button", { name: "Previous month" }));
  expect(heading()).toHaveTextContent("September 2026");
});

test("the selected day is marked selected and the others are not", () => {
  render(<Deadline defaultValue={october} />);
  open();
  expect(day(/October 2, 2026/).props.accessibilityState).toMatchObject({ selected: true });
  expect(day(/October 3, 2026/).props.accessibilityState).toMatchObject({ selected: false });
});

test("today is named in its label", () => {
  const now = today(getLocalTimeZone());
  render(<Deadline defaultValue={now} />);
  open();
  expect(screen.getAllByRole("button", { name: /^Today, / })).toHaveLength(1);
});

test("min and max disable the days outside and the month buttons at the edge", () => {
  const onChange = jest.fn();
  render(
    <Deadline
      defaultValue={october}
      minValue={new CalendarDate(2026, 10, 5)}
      maxValue={new CalendarDate(2026, 10, 20)}
      onChange={onChange}
    />,
  );
  open();
  expect(day(/October 4, 2026/).props.accessibilityState).toMatchObject({ disabled: true });
  expect(day(/October 21, 2026/).props.accessibilityState).toMatchObject({ disabled: true });
  expect(day(/October 5, 2026/).props.accessibilityState).toMatchObject({ disabled: false });
  fireEvent.press(day(/October 4, 2026/));
  expect(onChange).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Previous month" }).props.accessibilityState,
  ).toMatchObject({ disabled: true });
  expect(screen.getByRole("button", { name: "Next month" }).props.accessibilityState).toMatchObject(
    {
      disabled: true,
    },
  );
});

test("unavailable days cannot be chosen", () => {
  const onChange = jest.fn();
  render(
    <Deadline
      defaultValue={october}
      isDateUnavailable={(date) => date.day === 10}
      onChange={onChange}
    />,
  );
  open();
  const unavailable = day(/October 10, 2026/);
  expect(unavailable.props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(unavailable);
  expect(onChange).not.toHaveBeenCalled();
});

test("the week starts where firstDayOfWeek says", () => {
  render(<Deadline defaultValue={october} firstDayOfWeek="mon" />);
  open();
  const labelled = screen.UNSAFE_root.findAll(
    (node) => typeof node.type === "string" && node.props.children === "Mon",
  );
  expect(labelled.length).toBeGreaterThan(0);
});

test("a controlled value changes only through the screen", () => {
  const onChange = jest.fn();
  const { rerender } = render(<Deadline value={october} onChange={onChange} />);
  open();
  fireEvent.press(day(/October 15, 2026/));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Oct 2, 2026")).toBeTruthy();
  rerender(<Deadline value={null} onChange={onChange} />);
  expect(screen.getByText("Pick a date")).toBeTruthy();
});

test("disabled and read-only fields do not open", () => {
  const { rerender } = render(<Deadline isDisabled />);
  open();
  expect(screen.queryByRole("heading")).toBeNull();
  expect(field().props.accessibilityState).toMatchObject({ disabled: true });
  rerender(<Deadline isReadOnly />);
  open();
  expect(screen.queryByRole("heading")).toBeNull();
});

test("a controlled isOpen opens the tray and onOpenChange reports", () => {
  const onOpenChange = jest.fn();
  const { rerender } = render(<Deadline onOpenChange={onOpenChange} />);
  open();
  expect(onOpenChange).toHaveBeenCalledWith(true);
  rerender(<Deadline isOpen={false} />);
  rerender(<Deadline isOpen />);
  expect(heading()).toBeTruthy();
});

test("the error shows while invalid; dark theme renders with the selected day marked", () => {
  mockUnistyles({ theme: "dark" });
  render(<Deadline defaultValue={october} isInvalid errorMessage="Too late" />);
  expect(screen.getByRole("alert")).toHaveTextContent("Too late");
  open();
  expect(day(/October 2, 2026/).props.accessibilityState).toMatchObject({ selected: true });
});
