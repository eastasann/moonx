import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import {
  api,
  exportedFor,
  importPath,
  matchRows,
  paste,
  planContext,
  pressNext,
  registerAiHooks,
  rewrittenMarkdown,
  selfAnalysisContext,
  VALIDATION,
  validationContext,
} from "./support-ai";

registerAiHooks();

const PATH = importPath(`target=validation&id=${VALIDATION}`);

async function toMatch(text: string, path = PATH) {
  await renderApp(path);
  await paste(text);
  await pressNext();
  await screen.findByRole("list", { name: "Match" });
}

test("an exported Markdown pasted back is read block by block and each question is matched", async () => {
  api();
  await toMatch(
    rewrittenMarkdown(
      validationContext(),
      ["V.01.WHO", "V.01.PROBLEM"],
      [
        [
          "> HR teams of BPO companies in Bacolod",
          "> HR and admin teams of BPO companies in Bacolod",
        ],
      ],
    ),
  );
  const rows = matchRows();
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("Matched");
  expect(rows[0]).toHaveTextContent("[V.01.WHO] WHO");
  expect(rows[0]).toHaveTextContent("HR and admin teams of BPO companies in Bacolod");
  expect(rows[1]).toHaveTextContent("[V.01.PROBLEM] PROBLEM");
  expect(screen.getByText("2 blocks to review")).toBeInTheDocument();
});

test("a plain AI reply is matched by its IDs, in any letter case", async () => {
  api();
  await toMatch(
    "## [v.01.who]\nBPO HR teams\n\n## [V.10.WHY_WORK] Why it works\nSame-day delivery",
  );
  const rows = matchRows();
  expect(rows[0]).toHaveTextContent("Matched");
  expect(rows[0]).toHaveTextContent("[V.01.WHO] WHO");
  expect(rows[1]).toHaveTextContent("[V.10.WHY_WORK] WHY WORK");
});

test("text without an ID, an unknown ID and an ID outside the scope are not matched", async () => {
  api();
  await toMatch(
    [
      "Here are my thoughts first.",
      "## [] Customer segments\nBPO firms",
      "## [V.99.NOPE]\nunknown",
      "## [V.10.WHY_WORK]\nout of scope",
    ].join("\n\n"),
    importPath(`target=validation&id=${VALIDATION}&scope=01`),
  );
  const rows = matchRows();
  expect(rows).toHaveLength(4);
  expect(rows[0]).toHaveTextContent("Not matched");
  expect(rows[0]).toHaveTextContent("Block without a question ID");
  expect(rows[1]).toHaveTextContent("[Customer segments]");
  expect(rows[2]).toHaveTextContent("[V.99.NOPE]");
  expect(rows[3]).toHaveTextContent("[V.10.WHY_WORK]");
  for (const row of rows) expect(row).toHaveTextContent("Not matched");
  expect(screen.getByText("Nothing to import")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});

test("a hidden question is flagged and a question of a table section is out of range", async () => {
  api();
  await toMatch("## [V.02.RED_1]\nSurvivors\n\n## [V.05.COST_1]\n| a | b |\n\n## [V.01.WHO]\nok");
  const [hidden, cost, who] = matchRows();
  expect(hidden).toHaveTextContent("This question is hidden");
  expect(
    within(hidden as HTMLElement).getByRole("combobox", { name: "Choose question" }),
  ).toBeInTheDocument();
  expect(cost).toHaveTextContent("Not matched");
  expect(who).toHaveTextContent("Matched");
  expect(screen.getByText("1 block to review")).toBeInTheDocument();
});

test("a plan reply names the items of the plan and treats table items as not importable", async () => {
  api({}, { context: planContext() });
  await toMatch(
    "## [P.01.1]\nBoxes\n\n## [P.11.1]\ntable\n\n## [P.24.1]\nIf 5 clients sign",
    importPath("target=business_plan&id=cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
  );
  const [one, table, conditions] = matchRows();
  expect(one).toHaveTextContent("[P.01.1] What is the business?");
  expect(table).toHaveTextContent("Tables and numbers can't be imported");
  expect(within(table as HTMLElement).queryByRole("combobox")).toBeNull();
  expect(within(table as HTMLElement).getByRole("button", { name: "Discard" })).toBeInTheDocument();
  expect(conditions).toHaveTextContent("[P.24.1] We proceed to launch if");
});

test("a moonx-reply JSON is read answer by answer", async () => {
  api();
  await toMatch(
    JSON.stringify({
      format: "moonx-reply",
      version: 1,
      answers: [
        { id: "V.01.WHO", text: "BPO HR teams" },
        { id: "V.99.NOPE", text: "unknown" },
      ],
    }),
    importPath(`target=validation&id=${VALIDATION}`),
  );
  const [who, nope] = matchRows();
  expect(who).toHaveTextContent("[V.01.WHO] WHO");
  expect(who).toHaveTextContent("Matched");
  expect(nope).toHaveTextContent("Not matched");
});

test("the JSON an AI wraps in a code fence is read too", async () => {
  api({}, { context: selfAnalysisContext() });
  await toMatch(
    `\`\`\`json\n${JSON.stringify({
      format: "moonx-reply",
      version: 1,
      answers: [{ id: "SA.INCOME.1", amount: 35000, reason: "Rent and food" }],
    })}\n\`\`\``,
    importPath("target=self_analysis"),
  );
  const [income] = matchRows();
  expect(income).toHaveTextContent("[SA.INCOME.1] Income needed");
  expect(income).toHaveTextContent("Matched");
  expect(income).toHaveTextContent("Rent and food");
});

test("a moonx-export JSON pasted back brings its answered questions only", async () => {
  const context = validationContext();
  api({}, { context });
  const exported = exportedFor(context, ["V.01.WHO", "V.01.PROBLEM", "V.10.WHY_WORK"]).json;
  const questions = exported.questions as { id: string; answer: { text: string | null } }[];
  const who = questions.find((q) => q.id === "V.01.WHO");
  if (who) who.answer.text = "BPO HR teams";
  await toMatch(JSON.stringify(exported), importPath(`target=validation&id=${VALIDATION}`));
  // WHY_WORK has no answer in the export, so it carries nothing to import.
  const rows = matchRows();
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("[V.01.WHO] WHO");
  expect(rows[0]).toHaveTextContent("BPO HR teams");
  expect(rows[1]).toHaveTextContent("[V.01.PROBLEM] PROBLEM");
});

test("a discarded block drops out and can be restored", async () => {
  api();
  await toMatch("## [V.01.WHO]\nBPO HR teams\n\n## [] Customer segments\nBPO firms");
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

test("an unmatched block is sent to a chosen question and then imports like a matched one", async () => {
  api();
  await toMatch("## [V.01.WHO]\nBPO HR teams\n\n## [] Customer segments\nBPO firms in Bacolod");
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

test("the step indicator marks the finished step for assistive technology", async () => {
  api();
  await toMatch("## [V.01.WHO] WHO\nBPO HR teams");
  const done = screen
    .getAllByRole("listitem")
    .find((item) => item.getAttribute("data-status") === "done");
  expect(done).toHaveTextContent(/Paste, completed/);
});
