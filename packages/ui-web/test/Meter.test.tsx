import { COMPONENT_SIZES } from "@moonx/ui-tokens";
import { render, screen, within } from "@testing-library/react";
import { Meter, type MeterSegment } from "../src/components/Meter";
import { expectNoAxeViolations } from "./axe";

const segments: MeterSegment[] = [
  { label: "Fact", value: 6, variant: "fact", valueLabel: "6 answers" },
  { label: "Assumption", value: 3, variant: "assumption", valueLabel: "3 answers" },
  { label: "Unknown", value: 1, variant: "unknown", valueLabel: "1 answer" },
];

test("is a named group, not a meter, described by the summary", () => {
  render(<Meter label="Answers by F/A/U" description="10 answers" segments={segments} />);
  const group = screen.getByRole("group", { name: "Answers by F/A/U" });
  expect(group).toHaveAccessibleDescription("10 answers");
  expect(screen.queryByRole("meter")).toBeNull();
});

test("lists every part with its value text", () => {
  render(<Meter label="Answers" segments={segments} />);
  const items = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(items.map((i) => i.textContent)).toEqual([
    "Fact 6 answers",
    "Assumption 3 answers",
    "Unknown 1 answer",
  ]);
});

test("keeps the parts readable when the legend is not shown", () => {
  render(<Meter label="Answers" segments={segments} showLegend={false} />);
  expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(3);
});

test("sizes the band by share and skips empty parts", () => {
  const { container } = render(
    <Meter
      label="Answers"
      segments={[...segments, { label: "Empty", value: 0, variant: "empty" }]}
    />,
  );
  const widths = Array.from(
    container.querySelectorAll<HTMLElement>("[aria-hidden=true] > [style]"),
  ).map((el) => el.style.width);
  expect(widths).toEqual(["60%", "30%", "10%"]);
});

test("maxValue leaves the rest of the band empty", () => {
  const { container } = render(
    <Meter
      label="Checks"
      maxValue={20}
      segments={[{ label: "Done", value: 5, variant: "done" }]}
    />,
  );
  expect(container.querySelector<HTMLElement>("[aria-hidden=true] > [style]")?.style.width).toBe(
    "25%",
  );
});

test("segments that repeat label and variant render without a key warning", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(
      <Meter
        label="Repeats"
        segments={[
          { label: "Fact", value: 2, variant: "fact" },
          { label: "Fact", value: 3, variant: "fact" },
        ]}
      />,
    );
    expect(within(screen.getByRole("group")).getAllByRole("listitem")).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
  } finally {
    error.mockRestore();
  }
});

test("renders every size", () => {
  for (const size of COMPONENT_SIZES) {
    const { unmount } = render(<Meter label={size} size={size} segments={segments} />);
    expect(screen.getByRole("group", { name: size })).toBeInTheDocument();
    unmount();
  }
});

test("has no axe violations", async () => {
  const { container } = render(
    <>
      <Meter label="With legend" description="10 answers" segments={segments} />
      <Meter label="Without legend" segments={segments} showLegend={false} />
    </>,
  );
  await expectNoAxeViolations(container);
});
