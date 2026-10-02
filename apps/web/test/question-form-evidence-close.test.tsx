import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import { api, PATH, registerQuestionFormHooks } from "./support-questions";

registerQuestionFormHooks();

test("closing the evidence sheet without evidence changes nothing", async () => {
  const { calls } = api();
  await renderApp(PATH("01", "?q=V.01.WHO"));
  await screen.findByRole("textbox", { name: "Prompt of WHO" });
  fireEvent.click(screen.getByRole("radio", { name: "Fact" }));
  const sheet = await screen.findByRole("dialog", { name: "Evidence" });
  fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Evidence" })).toBeNull());
  expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  expect(screen.getByRole("radio", { name: "Assumption" })).toBeChecked();
});
