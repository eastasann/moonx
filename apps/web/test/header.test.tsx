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

let commentCount = 0;
vi.mock("../src/lib/comments", () => ({ useCommentCount: () => commentCount }));

afterEach(() => {
  commentCount = 0;
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

function Screen({
  target,
  options,
}: {
  target: string | null;
  options?: Parameters<typeof usePanelTarget>[1];
}) {
  usePanelTarget(target, options);
  return null;
}

const renderHeader = (target: string, options?: Parameters<typeof usePanelTarget>[1]) =>
  render(
    wrap(
      <PanelTargetProvider>
        <Screen target={target} options={options} />
        <PanelEntries />
      </PanelTargetProvider>,
    ),
  );

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

test("the Comments button shows how many comments the target has", () => {
  commentCount = 3;
  renderHeader("validation_answer:abc:V.01.WHO");
  expect(screen.getByRole("button", { name: "Comments" }).parentElement).toHaveTextContent("3");
});

test("a whole-screen target opens its history, and comments only for an idea", async () => {
  renderHeader("container:validation:abc");
  expect(screen.queryByRole("button", { name: "Comments" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "History" }));
  expect(openPanel).toHaveBeenCalledWith("history", "container:validation:abc");
});

test("an idea screen comments on the idea itself", async () => {
  renderHeader("container:idea:abc");
  await userEvent.click(screen.getByRole("button", { name: "Comments" }));
  expect(openPanel).toHaveBeenCalledWith("comments", "idea:abc");
});

test("a screen can name its own comment target and drop the History button", async () => {
  renderHeader("container:validation:abc", { comments: "idea:xyz", history: false });
  expect(screen.queryByRole("button", { name: "History" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Comments" }));
  expect(openPanel).toHaveBeenCalledWith("comments", "idea:xyz");
});
