import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { ItemPanelButtons } from "../src/components/ItemPanelButtons";
import { i18n } from "../src/lib/i18n";

const openPanel = vi.fn();
vi.mock("../src/lib/overlay", async (original) => ({
  ...(await original<typeof import("../src/lib/overlay")>()),
  useOverlay: () => ({ openPanel }),
}));

afterEach(() => openPanel.mockReset());

const renderButtons = (node: React.ReactNode) =>
  render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);

test("the buttons open the comments and the history of the item", async () => {
  renderButtons(<ItemPanelButtons target="cost_item:c1" commentCount={2} />);
  expect(screen.getByText("2")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Comments" }));
  expect(openPanel).toHaveBeenCalledWith("comments", "cost_item:c1");
  await userEvent.click(screen.getByRole("button", { name: "History" }));
  expect(openPanel).toHaveBeenCalledWith("history", "cost_item:c1");
});

test("no badge without comments, and the history button can be left out", () => {
  renderButtons(<ItemPanelButtons target="cost_item:c1" showHistory={false} />);
  expect(screen.queryByText("0")).toBeNull();
  expect(screen.queryByRole("button", { name: "History" })).toBeNull();
  expect(screen.getByRole("button", { name: "Comments" })).toBeInTheDocument();
});

test("a count above 99 is capped", () => {
  renderButtons(<ItemPanelButtons target="idea:i1" commentCount={150} />);
  expect(screen.getByText("99+")).toBeInTheDocument();
});
