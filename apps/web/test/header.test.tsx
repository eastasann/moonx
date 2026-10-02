import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { PanelEntries } from "../src/components/PanelEntries";
import { SaveStatus } from "../src/components/SaveStatus";
import { i18n } from "../src/lib/i18n";
import { PanelTargetProvider, usePanelTarget } from "../src/lib/panel-target";
import { saveStatus } from "../src/lib/save-status";

const openPanel = vi.fn();
vi.mock("../src/lib/overlay", async (original) => ({
  ...(await original<typeof import("../src/lib/overlay")>()),
  useOverlay: () => ({ openPanel }),
}));

afterEach(() => {
  openPanel.mockReset();
  act(() => saveStatus.reset());
});

const wrap = (node: React.ReactNode) => <I18nextProvider i18n={i18n}>{node}</I18nextProvider>;

test("the header shows Saving…, then Saved, and a new screen clears it", async () => {
  render(wrap(<SaveStatus />));
  expect(screen.queryByText("Saved")).toBeNull();
  let finish: () => void = () => {};
  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = saveStatus.track(() => new Promise<void>((resolve) => (finish = resolve)));
  });
  expect(await screen.findByText("Saving…")).toBeInTheDocument();
  await act(async () => {
    finish();
    await pending;
  });
  expect(await screen.findByText("Saved")).toBeInTheDocument();
  act(() => saveStatus.reset());
  expect(screen.queryByText("Saved")).toBeNull();
});

test("two saves at once show Saved only when both are done", async () => {
  render(wrap(<SaveStatus />));
  const finishers: (() => void)[] = [];
  const pending: Promise<void>[] = [];
  act(() => {
    for (let i = 0; i < 2; i++) {
      pending.push(saveStatus.track(() => new Promise<void>((resolve) => finishers.push(resolve))));
    }
  });
  await act(async () => {
    finishers[0]?.();
    await pending[0];
  });
  expect(screen.getByText("Saving…")).toBeInTheDocument();
  await act(async () => {
    finishers[1]?.();
    await pending[1];
  });
  expect(await screen.findByText("Saved")).toBeInTheDocument();
});

test("a failed save says so and Retry runs the same request again", async () => {
  render(wrap(<SaveStatus />));
  const run = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("ok");
  await act(async () => {
    await saveStatus.track(run).catch(() => {});
  });
  expect(await screen.findByText("Couldn't save")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("Saved")).toBeInTheDocument();
});

function Screen({ target }: { target: string | null }) {
  usePanelTarget(target);
  return null;
}

test("the Comments and History buttons appear for the item a screen registers", async () => {
  const { rerender } = render(
    wrap(
      <PanelTargetProvider>
        <Screen target={null} />
        <header>
          <PanelEntries />
        </header>
      </PanelTargetProvider>,
    ),
  );
  expect(screen.queryByRole("button", { name: "Comments" })).toBeNull();
  rerender(
    wrap(
      <PanelTargetProvider>
        <Screen target="validation_answer:abc:V.01.WHO" />
        <header>
          <PanelEntries />
        </header>
      </PanelTargetProvider>,
    ),
  );
  const header = screen.getByRole("banner", { hidden: true }).parentElement ?? document.body;
  await userEvent.click(within(header).getByRole("button", { name: "Comments" }));
  expect(openPanel).toHaveBeenCalledWith("comments", "validation_answer:abc:V.01.WHO");
  await userEvent.click(within(header).getByRole("button", { name: "History" }));
  expect(openPanel).toHaveBeenCalledWith("history", "validation_answer:abc:V.01.WHO");
});

test("a later save that works does not hide an earlier one that failed", async () => {
  render(wrap(<SaveStatus />));
  const failing = vi.fn().mockRejectedValue(new Error("offline"));
  await act(async () => {
    await saveStatus.track(failing).catch(() => {});
    await saveStatus.track(async () => "ok");
  });
  expect(await screen.findByText("Couldn't save")).toBeInTheDocument();
  expect(screen.queryByText("Saved")).toBeNull();
});
