import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { VALIDATION_ID } from "./question-fixtures";
import { renderApp } from "./support";
import { api, PATH, registerQuestionFormHooks } from "./support-questions";

registerQuestionFormHooks();

test("Fact opens the evidence sheet, and attaching a research log makes the answer Fact", async () => {
  const log = {
    id: "77777777-7777-4777-8777-777777777777",
    observedOn: "2026-09-12",
    topic: "Store observation: SM Bacolod",
  };
  const { calls } = api({
    [`GET /api/v1/validations/${VALIDATION_ID}/research-log`]: () => ({
      body: {
        items: [
          {
            ...log,
            observation: null,
            sourceType: null,
            sourceUrl: null,
            supportsChecks: [],
            supportsNote: null,
            lockVersion: 1,
            updatedAt: null,
            updatedBy: null,
            createdBy: null,
            usedAsEvidenceCount: 0,
            commentCount: 0,
          },
        ],
        nextCursor: null,
      },
    }),
    [`POST /api/v1/validations/${VALIDATION_ID}/evidence`]: () => ({
      status: 201,
      body: {
        evidence: { id: "e1" },
        lockVersion: 3,
        classification: {
          fau: "fact",
          confidence: null,
          state: "fact",
          evidence: [
            {
              id: "e1",
              kind: "research_log",
              researchLog: { ...log, sourceType: null, deleted: false },
              url: null,
              note: null,
            },
          ],
        },
      },
    }),
  });
  await renderApp(PATH("01", "?q=V.01.WHO"));
  await screen.findByRole("textbox", { name: "Prompt of WHO" });
  fireEvent.click(screen.getByRole("radio", { name: "Fact" }));
  const sheet = await screen.findByRole("dialog", { name: "Evidence" });
  fireEvent.click(await within(sheet).findByRole("checkbox", { name: /Store observation/ }));
  fireEvent.click(within(sheet).getByRole("button", { name: "Attach 1 entry" }));
  await waitFor(() =>
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      target: { type: "validation_answer", id: VALIDATION_ID, key: "V.01.WHO" },
      researchLogEntryId: log.id,
      setFact: true,
      lockVersion: 2,
    }),
  );
  expect(await within(sheet).findByText(/Store observation: SM Bacolod/)).toBeInTheDocument();
  fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));
  expect(await screen.findByText("Fact · 1 evidence")).toBeInTheDocument();
});
