import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { answer } from "./question-fixtures";
import { renderApp } from "./support";
import { ANSWER, api, PATH, registerQuestionFormHooks } from "./support-questions";

registerQuestionFormHooks();

test("overwriting with mine sends the same input again with force", async () => {
  let attempt = 0;
  const { calls } = api({
    [ANSWER("V.01.WHY_THEM")]: () => {
      attempt += 1;
      if (attempt === 1) {
        return {
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
                updatedBy: null,
              },
            },
          },
        };
      }
      return { body: answer("V.01.WHY_THEM", { text: "My version", lockVersion: 5 }) };
    },
  });
  await renderApp(PATH("01", "?q=V.01.WHY_THEM"));
  const field = await screen.findByRole("textbox", { name: "Prompt of WHY THEM" });
  fireEvent.change(field, { target: { value: "My version" } });
  fireEvent.blur(screen.getByRole("textbox", { name: "Prompt of WHY THEM" }));
  const dialog = await screen.findByRole("dialog", { name: "Someone updated this first" });
  expect(within(dialog).getByText(/Someone updated this answer/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Overwrite with mine" }));
  await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(2));
  expect(calls.filter((c) => c.method === "PUT")[1]?.body).toEqual({
    text: "My version",
    lockVersion: 4,
    force: true,
  });
});
