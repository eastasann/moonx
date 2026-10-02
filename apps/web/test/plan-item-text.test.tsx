import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import { conflictBody, registerPlanHooks, writes } from "./support-execution";
import { ANSWER, answer, ITEM_PATH, planItemApi } from "./support-plan-item";

registerPlanHooks();

const putsOf = (calls: { method: string; body: unknown }[]) =>
  writes(calls as never).filter((call) => call.method === "PUT");

test("an item shows its title with the guidance and counts the answered sub-items, numbers left out", async () => {
  planItemApi();
  await renderApp(ITEM_PATH(1));
  expect(
    await screen.findByRole("heading", { level: 1, name: "1. Executive Summary" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Summarise the plan in one page.")).toBeInTheDocument();
  expect(screen.getByText("1/3 answered")).toBeInTheDocument();
});

test("the first unanswered sub-item is open, and the answered one shows its start", async () => {
  planItemApi();
  await renderApp(ITEM_PATH(1));
  expect(
    await screen.findByRole("textbox", { name: "Prompt of Who is the primary customer?" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Prompt of What is the business?" })).toBeNull();
  expect(screen.getByText("Piaya gift boxes")).toBeInTheDocument();
});

test("?q opens that sub-item with its Example, and an answer drafted from validation says so", async () => {
  planItemApi();
  await renderApp(ITEM_PATH(1, "?q=P.01.1"));
  const field = await screen.findByRole("textbox", { name: "Prompt of What is the business?" });
  expect(field).toHaveValue("Piaya gift boxes");
  expect(screen.getByText("A gift box shop for Bacolod.")).toBeInTheDocument();
  expect(screen.getByText("Copied from validation on Sep 20, 2026")).toBeInTheDocument();
});

test("typing saves the text with the answer's version, then the version the save returned", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(1, "?q=P.01.1"));
  const field = await screen.findByRole("textbox", { name: "Prompt of What is the business?" });
  await user.type(field, "!");
  await user.tab();
  await waitFor(() => expect(putsOf(calls)).toHaveLength(1));
  expect(putsOf(calls)[0]?.body).toEqual({ text: "Piaya gift boxes!", lockVersion: 2 });
  await user.type(field, "?");
  await user.tab();
  await waitFor(() => expect(putsOf(calls)).toHaveLength(2));
  expect(putsOf(calls)[1]?.body).toEqual({ text: "Piaya gift boxes!?", lockVersion: 3 });
});

test("a sub-item nobody answered yet saves with version 0 and counts as answered", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(1));
  const field = await screen.findByRole("textbox", {
    name: "Prompt of Who is the primary customer?",
  });
  await user.type(field, "Offices");
  await user.tab();
  await waitFor(() => expect(putsOf(calls)).toHaveLength(1));
  expect(putsOf(calls)[0]?.body).toEqual({ text: "Offices", lockVersion: 0 });
  expect(await screen.findByText("2/3 answered")).toBeInTheDocument();
});

test("a choice saves when picked", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(1, "?q=P.01.5"));
  await user.click(await screen.findByRole("radio", { name: "Not yet" }));
  await waitFor(() => expect(putsOf(calls)).toHaveLength(1));
  expect(putsOf(calls)[0]?.body).toEqual({ text: "Not yet", lockVersion: 0 });
});

test("each sub-item has Comments and History for its own target", async () => {
  planItemApi();
  const user = userEvent.setup();
  const { router } = await renderApp(ITEM_PATH(1, "?q=P.01.1"));
  await screen.findByRole("textbox", { name: "Prompt of What is the business?" });
  const main = within(screen.getByRole("main"));
  expect(main.getByText("2")).toBeInTheDocument();
  await user.click(main.getByRole("button", { name: "Comments" }));
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      panel: "comments",
      target: "plan_answer:77777777-7777-4777-8777-777777777777:P.01.1",
    }),
  );
});

test("a 409 asks what to do and loading theirs replaces the field", async () => {
  planItemApi({
    [ANSWER("P.01.1")]: () =>
      conflictBody(answer("P.01.1", { text: "Paolo's version", lockVersion: 4 }), 4),
  });
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(1, "?q=P.01.1"));
  const field = await screen.findByRole("textbox", { name: "Prompt of What is the business?" });
  await user.clear(field);
  await user.type(field, "My version");
  await user.tab();
  const dialog = await screen.findByRole("dialog", { name: "Someone updated this first" });
  expect(within(dialog).getByText(/Paolo Reyes updated this answer/)).toBeInTheDocument();
  expect(within(dialog).getByText("Paolo's version")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Load theirs" }));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Prompt of What is the business?" })).toHaveValue(
      "Paolo's version",
    ),
  );
});

test("overwriting with mine sends the same input again with force", async () => {
  let attempt = 0;
  const { calls } = planItemApi({
    [ANSWER("P.01.1")]: ({ body }) => {
      attempt += 1;
      if (attempt === 1)
        return conflictBody(answer("P.01.1", { text: "Paolo's", lockVersion: 4 }), 4);
      return { body: answer("P.01.1", { text: (body as { text: string }).text, lockVersion: 5 }) };
    },
  });
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(1, "?q=P.01.1"));
  const field = await screen.findByRole("textbox", { name: "Prompt of What is the business?" });
  await user.clear(field);
  await user.type(field, "Mine");
  await user.tab();
  const dialog = await screen.findByRole("dialog", { name: "Someone updated this first" });
  await user.click(within(dialog).getByRole("button", { name: "Overwrite with mine" }));
  await waitFor(() => expect(putsOf(calls)).toHaveLength(2));
  expect(putsOf(calls)[1]?.body).toEqual({ text: "Mine", lockVersion: 4, force: true });
});

test("a refused save says why and Retry sends the sub-item again", async () => {
  let failing = true;
  const { calls } = planItemApi({
    [ANSWER("P.01.2")]: ({ body }) =>
      failing
        ? {
            status: 422,
            body: { error: { code: "VALIDATION_FAILED", message: "x", requestId: "r" } },
          }
        : { body: answer("P.01.2", { text: (body as { text: string }).text, lockVersion: 1 }) },
  });
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(1));
  await user.type(
    await screen.findByRole("textbox", { name: "Prompt of Who is the primary customer?" }),
    "Offices",
  );
  await user.tab();
  await waitFor(() => expect(putsOf(calls)).toHaveLength(1));
  await user.click(await screen.findByRole("button", { name: /Who is the primary customer/ }));
  expect(await screen.findByText(/Some values are not valid/)).toBeInTheDocument();
  failing = false;
  const retry = (await screen.findAllByRole("button", { name: "Retry" })).at(-1) as HTMLElement;
  await user.click(retry);
  await waitFor(() => expect(putsOf(calls)).toHaveLength(2));
  expect(putsOf(calls)[1]?.body).toEqual({ text: "Offices", lockVersion: 0 });
});
