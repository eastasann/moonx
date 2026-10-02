import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { pendingQueue } from "../src/lib/pending-queue";
import { answer, VALIDATION_ID } from "./question-fixtures";
import { renderApp } from "./support";
import { api, ME, PATH, registerQuestionFormHooks } from "./support-questions";

registerQuestionFormHooks();

test("a queued input that conflicts comes back into the field with the choice", async () => {
  await pendingQueue.put({
    userId: ME.id,
    itemKey: `answer:${VALIDATION_ID}:V.01.BEHAVIOR`,
    request: {
      method: "PUT",
      url: `/api/v1/validations/${VALIDATION_ID}/answers/V.01.BEHAVIOR`,
      body: { text: "Left unsent", lockVersion: 0 },
    },
    conflict: {
      value: answer("V.01.BEHAVIOR", { text: "Paolo's version", lockVersion: 3 }),
      lockVersion: 3,
      updatedAt: new Date().toISOString(),
      updatedBy: { id: "u2", displayName: "Paolo", avatarUrl: null, badge: null },
    },
    queuedAt: 1,
  });
  const { calls } = api();
  await renderApp(PATH());
  const dialog = await screen.findByRole("dialog", { name: "Someone updated this first" });
  expect(within(dialog).getByText("Paolo's version")).toBeInTheDocument();
  expect(within(dialog).getByText("Left unsent")).toBeInTheDocument();
  expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
});
