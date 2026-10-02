import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import {
  api,
  importPath,
  matchRows,
  paste,
  planContext,
  pressNext,
  registerAiHooks,
  rewrittenMarkdown,
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
      "## Customer segments\nBPO firms",
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
