import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { pendingQueue } from "../src/lib/pending-queue";
import { answer } from "./question-fixtures";
import { renderApp } from "./support";
import { ANSWER, api, ME, PATH, registerQuestionFormHooks } from "./support-questions";

registerQuestionFormHooks();

test("a 409 asks what to do; loading theirs replaces the field", async () => {
  api({
    [ANSWER("V.01.WHY_THEM")]: () => ({
      status: 409,
      body: {
        error: {
          code: "CONFLICT",
          message: "x",
          requestId: "abcdef12",
          current: {
            value: answer("V.01.WHY_THEM", { text: "Paolo's version", lockVersion: 4 }),
            lockVersion: 4,
            updatedAt: new Date().toISOString(),
            updatedBy: { id: "u2", displayName: "Paolo", avatarUrl: null, badge: null },
          },
        },
      },
    }),
  });
  await renderApp(PATH("01", "?q=V.01.WHY_THEM"));
  const field = await screen.findByRole("textbox", { name: "Prompt of WHY THEM" });
  fireEvent.change(field, { target: { value: "My version" } });
  fireEvent.blur(screen.getByRole("textbox", { name: "Prompt of WHY THEM" }));
  const dialog = await screen.findByRole("dialog", { name: "Someone updated this first" });
  expect(within(dialog).getByText(/Paolo updated this answer/)).toBeInTheDocument();
  expect(within(dialog).getByText("Paolo's version")).toBeInTheDocument();
  expect(within(dialog).getByText("My version")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Load theirs" }));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Prompt of WHY THEM" })).toHaveValue(
      "Paolo's version",
    ),
  );
  expect(await pendingQueue.list(ME.id)).toEqual([]);
});
