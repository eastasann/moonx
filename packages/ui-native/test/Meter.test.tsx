import { COMPONENT_SIZES, FAU_VARIANTS } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { Meter, type MeterSegment } from "../src/components/Meter";

type Json = ReactTestRendererJSON;
const root = () => screen.toJSON() as Json;
const band = () => (root().children as Json[])[1] as Json;
const flat = (element: Json) =>
  StyleSheet.flatten(element.props.style as never) as Record<string, unknown>;

const segments: MeterSegment[] = [
  { label: "Fact", value: 6, variant: "fact", valueLabel: "6 answers" },
  { label: "Assumption", value: 3, variant: "assumption", valueLabel: "3 answers" },
  { label: "Unknown", value: 1, variant: "unknown" },
];

afterEach(resetMockUnistyles);

test("is one group that reads the label, the description and every part", () => {
  render(
    <Meter label="Answers by F/A/U" description="10 answers" segments={segments} testID="meter" />,
  );
  const group = screen.getByRole("group");
  expect(group.props["aria-label"]).toBe(
    "Answers by F/A/U, 10 answers, Fact 6 answers, Assumption 3 answers, Unknown",
  );
});

test("a node description is drawn but not spoken", () => {
  render(<Meter label="Mix" description={<>ten</>} segments={segments.slice(0, 1)} />);
  expect(screen.getByRole("group").props["aria-label"]).toBe("Mix, Fact 6 answers");
});

test("the legend names each part with its value text", () => {
  render(<Meter label="Mix" segments={segments} />);
  expect(screen.getByText(/Fact/)).toBeTruthy();
  expect(screen.getByText(/6 answers/)).toBeTruthy();
  expect(screen.getByText(/Unknown/)).toBeTruthy();
});

test("showLegend false hides the legend and keeps the spoken parts", () => {
  render(<Meter label="Mix" segments={segments} showLegend={false} />);
  expect(screen.queryByText(/Assumption/)).toBeNull();
  expect(screen.getByRole("group").props["aria-label"]).toContain("Assumption 3 answers");
});

test("draws one band part per positive value, sized by its share of the sum", () => {
  render(
    <Meter
      label="Mix"
      segments={[
        { label: "A", value: 1, variant: "fact" },
        { label: "B", value: 0, variant: "assumption" },
        { label: "C", value: -4, variant: "unknown" },
        { label: "D", value: Number.NaN, variant: "empty" },
        { label: "E", value: 3, variant: "unclassified" },
      ]}
      showLegend={false}
    />,
  );
  const parts = band().children as Json[];
  expect(parts.map((part) => flat(part).width)).toEqual(["25%", "75%"]);
});

test("maxValue larger than the sum leaves room for the rest", () => {
  render(<Meter label="Mix" maxValue={10} segments={segments.slice(0, 2)} showLegend={false} />);
  const parts = band().children as Json[];
  expect(parts.map((part) => flat(part).width)).toEqual(["60%", "30%"]);
});

test("maxValue smaller than the sum does not overflow the band", () => {
  render(<Meter label="Mix" maxValue={2} segments={segments.slice(0, 2)} showLegend={false} />);
  const parts = band().children as Json[];
  expect(parts.map((part) => flat(part).width)).toEqual([`${(6 / 9) * 100}%`, `${(3 / 9) * 100}%`]);
});

test.each(FAU_VARIANTS)("the %s part takes its F/A/U strong color", (variant) => {
  render(<Meter label="Mix" segments={[{ label: "x", value: 1, variant }]} showLegend={false} />);
  expect(flat((band().children as Json[])[0] as Json).backgroundColor).toBe(
    themes.light.color.fau[variant].strong,
  );
});

test("a status family and a check state resolve to their strong colors too", () => {
  render(
    <Meter
      label="Mix"
      segments={[
        { label: "x", value: 1, variant: "positive" },
        { label: "y", value: 1, variant: "partial" },
      ]}
      showLegend={false}
    />,
  );
  const parts = band().children as Json[];
  expect(flat(parts[0] as Json).backgroundColor).toBe(themes.light.color.positive.strong);
  expect(flat(parts[1] as Json).backgroundColor).toBe(themes.light.color.check.partial.strong);
});

test.each(COMPONENT_SIZES)("size %s sets the band to the meter thickness", (size) => {
  render(<Meter label="Mix" segments={segments} size={size} />);
  expect(flat(band()).height).toBe(themes.light.scale.component.meter.thickness[size]);
});

test("the dark theme recolors the track and the parts", () => {
  mockUnistyles({ theme: "dark" });
  render(<Meter label="Mix" segments={segments} showLegend={false} />);
  expect(flat(band()).backgroundColor).toBe(themes.dark.color.control.track);
  expect(flat((band().children as Json[])[0] as Json).backgroundColor).toBe(
    themes.dark.color.fau.fact.strong,
  );
});
