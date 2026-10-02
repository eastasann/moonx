import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import {
  api,
  exportedFor,
  importPath,
  matchRows,
  paste,
  pressNext,
  registerAiHooks,
  selfAnalysisContext,
  VALIDATION,
  validationContext,
} from "./support-ai";

registerAiHooks();

async function toMatch(text: string, path: string) {
  await renderApp(path);
  await paste(text);
  await pressNext();
  await screen.findByRole("list", { name: "Match" });
}

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
