import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { ConflictDialog } from "../src/components/ConflictDialog";
import { i18n } from "../src/lib/i18n";
import { ME_KEY } from "../src/lib/session";
import { makeMe } from "./support";

const current = {
  value: { text: "Paolo's version" },
  lockVersion: 4,
  updatedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  updatedBy: { id: "u2", displayName: "Paolo", avatarUrl: null, badge: null },
};

function renderDialog(props: Partial<Parameters<typeof ConflictDialog>[0]> = {}) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(ME_KEY, makeMe());
  const onLoadTheirs = vi.fn();
  const onKeepMine = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ConflictDialog
          current={current}
          itemName="answer"
          theirText="Paolo's version"
          mineText="My version"
          onLoadTheirs={onLoadTheirs}
          onKeepMine={onKeepMine}
          {...props}
        />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { onLoadTheirs, onKeepMine };
}

test("the dialog names who updated the item and shows both copies", () => {
  renderDialog();
  const dialog = screen.getByRole("dialog", { name: "Someone updated this first" });
  expect(within(dialog).getByText(/Paolo updated this answer/)).toBeInTheDocument();
  expect(within(dialog).getByText("Paolo's version")).toBeInTheDocument();
  expect(within(dialog).getByText("My version")).toBeInTheDocument();
});

test("without a name it says someone", () => {
  renderDialog({ current: { ...current, updatedBy: null } });
  expect(screen.getByText(/Someone updated this answer/)).toBeInTheDocument();
});

test("each button reports the choice", async () => {
  const user = userEvent.setup();
  const { onLoadTheirs, onKeepMine } = renderDialog();
  await user.click(screen.getByRole("button", { name: "Load theirs" }));
  expect(onLoadTheirs).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Overwrite with mine" }));
  expect(onKeepMine).toHaveBeenCalledTimes(1);
});

test("the input can be copied before it is dropped", async () => {
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, "writeText");
  renderDialog();
  await user.click(screen.getByRole("button", { name: "Copy my input" }));
  expect(writeText).toHaveBeenCalledWith("My version");
});

test("Escape does not close it: closing is not a choice", async () => {
  const user = userEvent.setup();
  const { onLoadTheirs, onKeepMine } = renderDialog();
  await user.click(screen.getByRole("dialog"));
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(onLoadTheirs).not.toHaveBeenCalled();
  expect(onKeepMine).not.toHaveBeenCalled();
});

test("there is no close button: the two choices are the only way out", () => {
  renderDialog();
  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
});

test("nothing shows while there is no conflict", () => {
  renderDialog({ current: null });
  expect(screen.queryByRole("dialog")).toBeNull();
});
