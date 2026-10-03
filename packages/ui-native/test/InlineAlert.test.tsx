import { INLINE_ALERT_VARIANTS } from "@moonx/ui-tokens";
import { themes } from "@moonx/ui-tokens/native";
import { render, screen } from "@testing-library/react-native";
import { mockUnistyles, resetMockUnistyles } from "../jest/unistyles-mock";
import { InlineAlert } from "../src/components/InlineAlert";

afterEach(resetMockUnistyles);

interface AlertProps {
  role: string;
  accessibilityLiveRegion: string;
  style: { backgroundColor: string; borderColor: string };
}

/** The alert's own box is the root of the rendered tree. */
const box = () => (screen.toJSON() as unknown as { props: AlertProps }).props;

test.each(INLINE_ALERT_VARIANTS)("variant %s shows the heading and the body", (variant) => {
  render(
    <InlineAlert variant={variant} heading="Capacity exceeded">
      Reduce the planned orders.
    </InlineAlert>,
  );
  expect(screen.getByText("Capacity exceeded")).toBeTruthy();
  expect(screen.getByText("Reduce the planned orders.")).toBeTruthy();
  expect(box().style.backgroundColor).toBe(themes.light.color[variant].bg);
  expect(box().style.borderColor).toBe(themes.light.color[variant].strong);
});

test("negative is an alert, the others are status", () => {
  const { rerender } = render(<InlineAlert variant="negative" heading="Failed" />);
  expect(box().role).toBe("alert");
  expect(box().accessibilityLiveRegion).toBe("assertive");
  rerender(<InlineAlert variant="notice" heading="Careful" />);
  expect(box().role).toBe("status");
  expect(box().accessibilityLiveRegion).toBe("polite");
});

test("role overrides the default; note is not announced", () => {
  render(<InlineAlert heading="Archived" role="note" />);
  expect(box().role).toBe("note");
  expect(box().accessibilityLiveRegion).toBe("none");
});

test("without children only the heading is drawn", () => {
  render(<InlineAlert heading="Only a heading" />);
  expect(screen.getByText("Only a heading")).toBeTruthy();
  expect(screen.toJSON()).toMatchObject({ type: "View" });
  expect(screen.getAllByText(/./)).toHaveLength(1);
});

test("the dark theme uses the dark colors", () => {
  mockUnistyles({ theme: "dark" });
  render(<InlineAlert variant="notice" heading="Careful" />);
  expect(box().style.backgroundColor).toBe(themes.dark.color.notice.bg);
});
