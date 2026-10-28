import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as sentry from "../lib/sentry";
import { BlockBoundary, ModalBoundary } from "./ErrorBoundary";

afterEach(() => {
  vi.restoreAllMocks();
  isBroken = true;
});

// React renders again after a failure before it gives up, so a part that failed only
// once would never show its fallback: the test decides when the part is mended.
let isBroken = true;

function Breakable({ label }: { label: string }) {
  if (isBroken) throw new Error(`${label} broke`);
  return <p>{label}</p>;
}

// React logs what a boundary catches; the failure is the test's point.
const quietConsole = () =>
  vi.spyOn(console, "error").mockImplementation(() => {});

describe("BlockBoundary (SDD 8.2)", () => {
  test("a block that fails alone: Something went wrong with its Ref; the rest stays; Retry renders it again", async () => {
    quietConsole();
    vi.spyOn(sentry, "reportError").mockReturnValue(
      "3f2a9c1d0b8e4f5aa1b2c3d4e5f6a7b8",
    );
    const user = userEvent.setup();
    render(
      <>
        <BlockBoundary>
          <Breakable label="Ideas" />
        </BlockBoundary>
        <BlockBoundary>
          <p>Due soon</p>
        </BlockBoundary>
      </>,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Something went wrong" }),
    ).toBeTruthy();
    expect(screen.getByText("Ref: 3f2a9c1d")).toBeTruthy();
    expect(screen.getByText("Due soon")).toBeTruthy();
    expect(sentry.reportError).toHaveBeenCalledOnce();
    isBroken = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Ideas")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});

describe("ModalBoundary (design-spec 6.0.6)", () => {
  test("a modal that fails: a small dialog with Ref, Retry and Close", async () => {
    quietConsole();
    vi.spyOn(sentry, "reportError").mockReturnValue(
      "9d2b7c1a0b8e4f5aa1b2c3d4e5f6a7b8",
    );
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <>
        <p>Behind</p>
        <ModalBoundary onClose={onClose}>
          <Breakable label="Switch workspace" />
        </ModalBoundary>
      </>,
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: /Something went wrong/,
    });
    expect(dialog.textContent).toContain("Ref: 9d2b7c1a");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("Retry renders the modal again", async () => {
    quietConsole();
    vi.spyOn(sentry, "reportError").mockReturnValue(null);
    const user = userEvent.setup();
    render(
      <ModalBoundary onClose={() => {}}>
        <Breakable label="New workspace" />
      </ModalBoundary>,
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).not.toContain("Ref:");
    isBroken = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("New workspace")).toBeTruthy();
  });
});
