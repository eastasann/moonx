import { render, screen } from "@testing-library/react-native";
import { MetricTile } from "../src/components/MetricTile";

test("a labelled group with the label, the figure and the note", () => {
  render(<MetricTile label="Break-even" value="₱450,000+" note="per month" />);
  expect(screen.getByLabelText("Break-even").props.role).toBe("group");
  expect(screen.getByText("Break-even")).toBeTruthy();
  expect(screen.getByText("₱450,000+")).toBeTruthy();
  expect(screen.getByText("per month")).toBeTruthy();
});

test("the note is optional", () => {
  render(<MetricTile label="Break-even" value="Empty" />);
  expect(screen.getAllByText(/./)).toHaveLength(2);
});

test("the figure is larger than the label and uses tabular numbers", () => {
  render(<MetricTile label="Break-even" value="1,234" />);
  const label = screen.getByText("Break-even").props.style;
  const value = screen.getByText("1,234").props.style;
  expect(value.fontSize).toBeGreaterThan(label.fontSize);
  expect(value.fontVariant).toContain("tabular-nums");
});

test("the note can be rich content", () => {
  render(<MetricTile label="Gross profit" value="-₱20" note={<Text>Negative margin</Text>} />);
  expect(screen.getByText("Negative margin")).toBeTruthy();
});

import { Text } from "react-native";
