import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import {
  api,
  importPath,
  matchRows,
  paste,
  pressNext,
  registerAiHooks,
  VALIDATION,
} from "./support-ai";

registerAiHooks();

const PATH = importPath(`target=validation&id=${VALIDATION}`);

async function toMatch(text: string) {
  await renderApp(PATH);
  await paste(text);
  await pressNext();
  await screen.findByRole("list", { name: "Match" });
}

test("a discarded block drops out and can be restored", async () => {
  api();
  await toMatch("## [V.01.WHO]\nBPO HR teams\n\n## Customer segments\nBPO firms");
  const [, loose] = matchRows();
  await userEvent.click(within(loose as HTMLElement).getByRole("button", { name: "Discard" }));
  expect(matchRows()[1]).toHaveTextContent("Discarded");
  expect(within(matchRows()[1] as HTMLElement).queryByRole("combobox")).toBeNull();
  await userEvent.click(
    within(matchRows()[1] as HTMLElement).getByRole("button", { name: "Restore" }),
  );
  expect(matchRows()[1]).toHaveTextContent("Not matched");
});

test("discarding every matched block leaves nothing to import and goes back to the paste", async () => {
  api();
  await toMatch("## [V.01.WHO]\nBPO HR teams");
  await userEvent.click(
    within(matchRows()[0] as HTMLElement).getByRole("button", { name: "Discard" }),
  );
  expect(screen.getByText("Nothing to import")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Back to paste" }));
  expect(await screen.findByRole("textbox", { name: "AI reply" })).toHaveValue(
    "## [V.01.WHO]\nBPO HR teams",
  );
});

test("two blocks for one question ask which to use, the first by default", async () => {
  api();
  await toMatch("## [V.01.WHO]\nFirst draft\n\n## [V.01.WHO]\nSecond draft");
  const rows = matchRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toHaveTextContent("More than one block uses this ID. Choose which to use.");
  const first = screen.getByRole("radio", { name: /First draft/ });
  const second = screen.getByRole("radio", { name: /Second draft/ });
  expect(first).toBeChecked();
  await userEvent.click(second);
  expect(second).toBeChecked();
  expect(screen.getByText("1 block to review")).toBeInTheDocument();

  await pressNext();
  expect(await screen.findByRole("textbox", { name: "WHO" })).toHaveValue("Second draft");
});
