import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { DatePicker } from "./DatePicker";
import { ProgressCircle } from "./ProgressCircle";

// Text that React Aria would format itself but the components can replace comes from
// @moonx/i18n's formatters (SDD 9章「書式」). The formatters here return markers, so text
// formatted by React Aria would show up as a plain date or number instead.
vi.mock("@moonx/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@moonx/i18n")>()),
  formatCalendarMonth: (date: string) => `[month ${date}]`,
  formatWeekdayInitial: (date: string) => `[weekday ${date}]`,
  formatDayOfMonth: (date: string) => `[day ${date}]`,
  formatProgress: (fraction: number) => `[progress ${fraction}]`,
}));

describe("text from the shared formatters", () => {
  test("DatePicker's calendar: the month, the weekdays and the days", async () => {
    const user = userEvent.setup();
    render(<DatePicker label="Deadline" defaultValue="2026-10-16" />);
    await user.click(
      within(screen.getByRole("group", { name: "Deadline" })).getByRole(
        "button",
      ),
    );
    const dialog = screen.getByRole("dialog");
    // The visible heading; React Aria adds a hidden one for screen readers, with its own
    // text (SDD 9章「React Aria の文言」).
    const visible = within(dialog)
      .getAllByRole("heading", { hidden: true })
      .filter((heading) => heading.getAttribute("aria-hidden") === "true");
    expect(visible.map((heading) => heading.textContent)).toEqual([
      "[month 2026-10-01]",
    ]);
    const grid = within(dialog).getByRole("grid");
    const header = grid.querySelector("thead");
    // Hidden from screen readers as React Aria's own header is.
    expect(header?.getAttribute("aria-hidden")).toBe("true");
    const weekdays = [...(header?.querySelectorAll("th") ?? [])].map(
      (cell) => cell.textContent ?? "",
    );
    expect(weekdays).toHaveLength(7);
    for (const weekday of weekdays) {
      expect(weekday).toMatch(/^\[weekday \d{4}-\d{2}-\d{2}\]$/);
    }
    // Seven days in a row: the dates step by one.
    const dates = weekdays.map((weekday) => weekday.slice(9, 19));
    for (let index = 1; index < dates.length; index++) {
      const step =
        Date.parse(dates[index] ?? "") - Date.parse(dates[index - 1] ?? "");
      expect(step).toBe(24 * 60 * 60 * 1000);
    }
    // Each column's weekday is the weekday of the days under it, starting on Sunday as
    // React Aria lays out en-PH weeks.
    const week = within(grid)
      .getByText("[day 2026-10-16]")
      .closest("tr") as HTMLElement;
    const days = within(week)
      .getAllByRole("gridcell")
      .map((cell) => (cell.textContent ?? "").slice(5, 15));
    const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
    expect(days.map(weekday)).toEqual(dates.map(weekday));
    expect(weekday(dates[0] ?? "")).toBe(0);
  });

  test("ProgressCircle reads its value out through formatProgress", () => {
    render(
      <>
        <ProgressCircle value={40} aria-label="Uploading" />
        <ProgressCircle
          value={3}
          minValue={1}
          maxValue={5}
          aria-label="Steps"
        />
        <ProgressCircle value={140} aria-label="Over" />
        <ProgressCircle
          value={2}
          minValue={2}
          maxValue={2}
          aria-label="Empty range"
        />
        <ProgressCircle isIndeterminate aria-label="Loading" />
      </>,
    );
    const text = (name: string) =>
      screen.getByRole("progressbar", { name }).getAttribute("aria-valuetext");
    expect(text("Uploading")).toBe("[progress 0.4]");
    expect(text("Steps")).toBe("[progress 0.5]");
    expect(text("Over")).toBe("[progress 1]");
    expect(text("Empty range")).toBe("[progress 0]");
    expect(text("Loading")).toBeNull();
  });
});
