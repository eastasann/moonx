import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { ImportFromAi } from "../src/screens/ai/ImportFromAi";
import { WORKSPACE } from "./support";
import { api, matchRows, paste, pressNext, registerAiHooks, VALIDATION } from "./support-ai";
import { renderBare } from "./support-bare";

registerAiHooks();

// One overlay test per file, rendered without the app frame (see support-bare).
test("an unmatched block is sent to a chosen question and then imports like a matched one", async () => {
  api();
  renderBare(<ImportFromAi workspaceId={WORKSPACE} target="validation" id={VALIDATION} />);
  await paste("## [V.01.WHO]\nBPO HR teams\n\n## Customer segments\nBPO firms in Bacolod");
  await pressNext();
  await screen.findByRole("list", { name: "Match" });
  expect(matchRows()[1]).toHaveTextContent("Not matched");
  expect(screen.getByText("1 block to review")).toBeInTheDocument();

  await userEvent.click(
    within(matchRows()[1] as HTMLElement).getByRole("button", { name: /^Show questions/ }),
  );
  await userEvent.click(await screen.findByRole("option", { name: "[V.01.PROBLEM] PROBLEM" }));
  expect(matchRows()[1]).toHaveTextContent("Matched");
  expect(matchRows()[1]).toHaveTextContent("[V.01.PROBLEM] PROBLEM");
  expect(screen.getByText("2 blocks to review")).toBeInTheDocument();

  await pressNext();
  expect(await screen.findByRole("textbox", { name: "PROBLEM" })).toHaveValue(
    "BPO firms in Bacolod",
  );
});
