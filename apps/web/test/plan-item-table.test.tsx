import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import { conflictBody, registerPlanHooks, viewerMe, writes } from "./support-execution";
import { ANSWER, answer, ITEM_13, ITEM_PATH, planItemApi } from "./support-plan-item";

registerPlanHooks();

const putsOf = (calls: { method: string; body: unknown }[]) =>
  writes(calls as never).filter((call) => call.method === "PUT");
const rowsOf = (call: { body: unknown } | undefined) =>
  (call?.body as { rows: unknown[] } | undefined)?.rows ?? [];

test("the table lists its rows with percent as 40% and money in the workspace currency, and sums them", async () => {
  planItemApi();
  await renderApp(ITEM_PATH(13, "?q=P.13.1"));
  const names = await screen.findAllByRole("textbox", { name: "Name" });
  expect(names.map((field) => (field as HTMLTextAreaElement).value)).toEqual(["Ana", "Paolo"]);
  const shares = screen.getAllByRole("textbox", { name: "Initial ownership (%)" });
  expect(shares.map((field) => (field as HTMLInputElement).value)).toEqual(["40%", "60%"]);
  const capital = screen.getAllByRole("textbox", { name: "Initial capital contribution" });
  expect(capital.map((field) => (field as HTMLInputElement).value)).toEqual([
    "₱100,000",
    "₱50,000",
  ]);
  expect(screen.getByText("Ownership total: 100%")).toBeInTheDocument();
  expect(screen.getByText("Capital total: ₱150,000")).toBeInTheDocument();
  expect(screen.getByText("1/2 answered")).toBeInTheDocument();
});

test("a total that is not 100% is shown without any warning", async () => {
  planItemApi(
    {},
    {
      planItems: {
        13: {
          ...ITEM_13,
          answers: [
            answer("P.13.1", {
              lockVersion: 3,
              rows: [{ name: "Ana", ownership: 0.7, capital: null }],
            }),
            answer("P.13.2"),
          ],
          references: [
            { kind: "totals", title: "Totals", data: { ownership: 0.7, capital: 0 }, link: null },
          ],
        },
      },
    },
  );
  await renderApp(ITEM_PATH(13, "?q=P.13.1"));
  expect(await screen.findByText("Ownership total: 70%")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("editing a cell saves the whole rows array with the answer's version", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(13, "?q=P.13.1"));
  const [first] = await screen.findAllByRole("textbox", { name: "Initial capital contribution" });
  await user.clear(first as HTMLElement);
  await user.type(first as HTMLElement, "200000");
  await user.tab();
  await waitFor(() => expect(putsOf(calls)).toHaveLength(1));
  expect(putsOf(calls)[0]?.body).toEqual({
    rows: [
      { name: "Ana", ownership: 0.4, capital: 200_000 },
      { name: "Paolo", ownership: 0.6, capital: 50_000 },
    ],
    lockVersion: 3,
  });
  expect(await screen.findByText("Capital total: ₱250,000")).toBeInTheDocument();
});

test("a percent is typed as 30 and stored as 0.3", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(13, "?q=P.13.1"));
  const [first] = await screen.findAllByRole("textbox", { name: "Initial ownership (%)" });
  await user.clear(first as HTMLElement);
  await user.type(first as HTMLElement, "30");
  await user.tab();
  await waitFor(() => expect(putsOf(calls)).toHaveLength(1));
  expect(rowsOf(putsOf(calls)[0])[0]).toEqual({ name: "Ana", ownership: 0.3, capital: 100_000 });
});

test("a share over 100% is not sent and says why until it is fixed", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(13, "?q=P.13.1"));
  const [first] = await screen.findAllByRole("textbox", { name: "Initial ownership (%)" });
  await user.clear(first as HTMLElement);
  await user.type(first as HTMLElement, "150");
  await user.tab();
  expect(await screen.findByText("Enter a share from 0% to 100%")).toBeInTheDocument();
  expect(putsOf(calls)).toHaveLength(0);
  await user.clear(first as HTMLElement);
  await user.type(first as HTMLElement, "50");
  await user.tab();
  await waitFor(() => expect(putsOf(calls)).toHaveLength(1));
  expect(rowsOf(putsOf(calls)[0])[0]).toMatchObject({ ownership: 0.5 });
  await waitFor(() => expect(screen.queryByText("Enter a share from 0% to 100%")).toBeNull());
});

test("a negative amount is not sent", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(13, "?q=P.13.1"));
  const [first] = await screen.findAllByRole("textbox", { name: "Initial capital contribution" });
  await user.clear(first as HTMLElement);
  await user.type(first as HTMLElement, "-5");
  await user.tab();
  expect(await screen.findByText("Enter an amount of 0 or more")).toBeInTheDocument();
  expect(putsOf(calls)).toHaveLength(0);
});

test("+ Add row appends an empty row and removing a row sends the rest", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(13, "?q=P.13.1"));
  await user.click(await screen.findByRole("button", { name: "+ Add row" }));
  await waitFor(() => expect(putsOf(calls)).toHaveLength(1));
  expect(rowsOf(putsOf(calls)[0])).toHaveLength(3);
  expect(rowsOf(putsOf(calls)[0])[2]).toEqual({ name: null, ownership: null, capital: null });
  expect(screen.getAllByRole("heading", { level: 3, name: /^Row/ })).toHaveLength(3);
  await user.click(screen.getByRole("button", { name: "Remove row 1" }));
  await waitFor(() => expect(putsOf(calls)).toHaveLength(2));
  expect(rowsOf(putsOf(calls)[1])).toEqual([
    { name: "Paolo", ownership: 0.6, capital: 50_000 },
    { name: null, ownership: null, capital: null },
  ]);
  expect(putsOf(calls)[1]?.body).toMatchObject({ lockVersion: 4 });
});

test("a text cell saves as typed", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(13, "?q=P.13.1"));
  const [first] = await screen.findAllByRole("textbox", { name: "Name" });
  await user.clear(first as HTMLElement);
  await user.type(first as HTMLElement, "Ana V.");
  await user.tab();
  await waitFor(() => expect(putsOf(calls)).toHaveLength(1));
  expect(rowsOf(putsOf(calls)[0])[0]).toMatchObject({ name: "Ana V." });
});

test("an empty table says No rows with + Add row, and a plain number column takes plain numbers", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(11));
  expect(await screen.findByText("No rows")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "+ Add row" }));
  await waitFor(() => expect(putsOf(calls)).toHaveLength(1));
  expect(putsOf(calls)[0]?.body).toEqual({ rows: [{ name: null, time: null }], lockVersion: 0 });
  const time = await screen.findByRole("textbox", { name: "Time (days per week)" });
  await user.type(time, "3");
  await user.tab();
  await waitFor(() => expect(putsOf(calls)).toHaveLength(2));
  expect(rowsOf(putsOf(calls)[1])).toEqual([{ name: null, time: 3 }]);
  expect(screen.queryByText(/Ownership total/)).toBeNull();
});

test("a Viewer reads the table as a table, with no way to add or remove rows", async () => {
  planItemApi({}, { me: viewerMe() });
  await renderApp(ITEM_PATH(13));
  const table = await screen.findByRole("grid", { name: "Prompt of Ownership and capital" });
  expect(within(table).getAllByRole("row")).toHaveLength(3);
  expect(table).toHaveTextContent("40%");
  expect(table).toHaveTextContent("₱100,000");
  expect(screen.queryByRole("button", { name: "+ Add row" })).toBeNull();
  expect(screen.getByText("Ownership total: 100%")).toBeInTheDocument();
});

test("a 409 on a table names the other copy's rows and loading theirs replaces them", async () => {
  planItemApi({
    [ANSWER("P.13.1")]: () =>
      conflictBody(
        answer("P.13.1", {
          lockVersion: 6,
          rows: [{ name: "Paolo only", ownership: 1, capital: null }],
        }),
        6,
      ),
  });
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(13, "?q=P.13.1"));
  await user.click(await screen.findByRole("button", { name: "+ Add row" }));
  const dialog = await screen.findByRole("dialog", { name: "Someone updated this first" });
  expect(within(dialog).getByText("1 row")).toBeInTheDocument();
  expect(within(dialog).getByText("3 rows")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Load theirs" }));
  await waitFor(() =>
    expect(
      screen.getAllByRole("textbox", { name: "Name" }).map((f) => (f as HTMLTextAreaElement).value),
    ).toEqual(["Paolo only"]),
  );
});
