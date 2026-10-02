import type { Classification } from "@moonx/schemas";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { pendingQueue } from "../src/lib/pending-queue";
import { answer, VALIDATION_ID } from "./question-fixtures";
import { renderApp } from "./support";
import {
  ANSWER,
  api,
  ME,
  PATH,
  registerQuestionFormHooks,
  saved,
  viewerMe,
} from "./support-questions";

registerQuestionFormHooks();

test("the form opens on the first unanswered question with the others compact and the count in the header", async () => {
  api();
  await renderApp(PATH());
  expect(
    await screen.findByRole("heading", { level: 1, name: "01 Customer & Problem" }),
  ).toBeInTheDocument();
  expect(screen.getByText("2/3 answered")).toBeInTheDocument();
  expect(screen.getByText("Be specific about who pays.")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Prompt of BEHAVIOR" })).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Prompt of WHO" })).toBeNull();
  expect(screen.getByRole("button", { name: /WHO/ })).toHaveTextContent(
    "Office workers in Bacolod",
  );
  expect(screen.getByRole("button", { name: /WHO/ })).toHaveTextContent("Assumption · Medium");
  expect(screen.getByText("They buy boxed piaya at the airport.")).toBeInTheDocument();
});

test("?q= opens the question it names", async () => {
  api();
  await renderApp(PATH("01", "?q=V.01.WHY_THEM"));
  expect(await screen.findByRole("textbox", { name: "Prompt of WHY THEM" })).toBeInTheDocument();
});

test("leaving the field saves the answer with its version and the header says Saved", async () => {
  const { calls } = api({
    [ANSWER("V.01.BEHAVIOR")]: saved("V.01.BEHAVIOR", {}, 1),
  });
  await renderApp(PATH());
  const field = await screen.findByRole("textbox", { name: "Prompt of BEHAVIOR" });
  await userEvent.type(field, "They buy at the airport");
  expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  await userEvent.tab();
  await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1));
  expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
    text: "They buy at the airport",
    lockVersion: 0,
  });
  expect(await screen.findByText("Saved")).toBeInTheDocument();
  expect(await screen.findByText("3/3 answered")).toBeInTheDocument();
});

test("input that rests for a second is saved without leaving the field", async () => {
  const { calls } = api({ [ANSWER("V.01.BEHAVIOR")]: saved("V.01.BEHAVIOR", {}, 1) });
  await renderApp(PATH());
  const field = await screen.findByRole("textbox", { name: "Prompt of BEHAVIOR" });
  await userEvent.type(field, "Resting");
  await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1), {
    timeout: 3000,
  });
});

test("choosing Assumption and a confidence saves the classification at once", async () => {
  const { calls } = api({
    [ANSWER("V.01.WHY_THEM")]: () => ({
      body: answer("V.01.WHY_THEM", {
        text: "They travel often",
        lockVersion: 2,
        classification: {
          fau: "assumption",
          confidence: "high",
          state: "assumption",
          evidence: [],
        } as Classification,
      }),
    }),
  });
  await renderApp(PATH("01", "?q=V.01.WHY_THEM"));
  await screen.findByRole("textbox", { name: "Prompt of WHY THEM" });
  await userEvent.click(screen.getByRole("radio", { name: "Assumption" }));
  expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  await userEvent.click(screen.getByRole("radio", { name: "High" }));
  await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1));
  expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
    classification: { fau: "assumption", confidence: "high" },
    lockVersion: 1,
  });
  expect(await screen.findByText("Assumption · High")).toBeInTheDocument();
});

test("a save that cannot reach the server keeps the input, says so, and Retry sends it", async () => {
  let online = false;
  const { calls } = api({
    [ANSWER("V.01.BEHAVIOR")]: () => {
      if (!online) throw new TypeError("offline");
      return { body: answer("V.01.BEHAVIOR", { text: "Typed offline", lockVersion: 1 }) };
    },
  });
  await renderApp(PATH());
  const field = await screen.findByRole("textbox", { name: "Prompt of BEHAVIOR" });
  await userEvent.type(field, "Typed offline");
  await userEvent.tab();
  expect(await screen.findByText("Couldn't save — Retry")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Prompt of BEHAVIOR" })).toHaveValue("Typed offline");
  expect((await pendingQueue.list(ME.id))[0]?.request.body).toEqual({
    text: "Typed offline",
    lockVersion: 0,
  });
  online = true;
  const retry = screen.getAllByRole("button", { name: "Retry" })[0] as HTMLElement;
  await userEvent.click(retry);
  await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(2));
  await waitFor(async () => expect(await pendingQueue.list(ME.id)).toEqual([]));
  expect(await screen.findByText("Saved")).toBeInTheDocument();
});

test("input an earlier visit left in the queue is sent when the app starts", async () => {
  await pendingQueue.put({
    userId: ME.id,
    itemKey: `answer:${VALIDATION_ID}:V.01.BEHAVIOR`,
    request: {
      method: "PUT",
      url: `/api/v1/validations/${VALIDATION_ID}/answers/V.01.BEHAVIOR`,
      body: { text: "Left unsent", lockVersion: 0 },
    },
    conflict: null,
    queuedAt: 1,
  });
  const { calls } = api({ [ANSWER("V.01.BEHAVIOR")]: saved("V.01.BEHAVIOR", {}, 1) });
  await renderApp(PATH());
  await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1));
  expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
    text: "Left unsent",
    lockVersion: 0,
  });
  await waitFor(async () => expect(await pendingQueue.list(ME.id)).toEqual([]));
});

test("a Viewer reads every answer open, with the F/A/U label only and no way to edit", async () => {
  api({}, { me: viewerMe() });
  await renderApp(PATH());
  expect(
    await screen.findByRole("heading", { level: 1, name: "01 Customer & Problem" }),
  ).toBeInTheDocument();
  for (const prompt of ["WHO", "WHY THEM", "BEHAVIOR"]) {
    expect(screen.getByRole("textbox", { name: `Prompt of ${prompt}` })).toHaveAttribute(
      "readonly",
    );
  }
  expect(screen.queryByRole("radio", { name: "Fact" })).toBeNull();
  expect(screen.queryByRole("switch", { name: "Focus" })).toBeNull();
  expect(screen.queryByRole("button", { name: "AI" })).toBeNull();
  expect(screen.getAllByText("Assumption · Medium").length).toBeGreaterThan(0);
});

test("an archived idea is read-only for an editor too", async () => {
  api({}, { archived: true });
  await renderApp(PATH());
  expect(await screen.findByText("This idea is archived")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Prompt of WHO" })).toHaveAttribute("readonly");
  expect(screen.queryByRole("radio", { name: "Fact" })).toBeNull();
});

test("the Focus switch opens every question and is remembered", async () => {
  api();
  await renderApp(PATH());
  await screen.findByRole("textbox", { name: "Prompt of BEHAVIOR" });
  expect(screen.queryByRole("textbox", { name: "Prompt of WHO" })).toBeNull();
  await userEvent.click(screen.getByRole("switch", { name: "Focus" }));
  expect(await screen.findByRole("textbox", { name: "Prompt of WHO" })).toBeInTheDocument();
  expect(window.localStorage.getItem("moonx.questions.focus")).toBe("off");
});

test("answering OCEAN shows the questions it opens and saves the choice at once", async () => {
  const { calls } = api({
    [ANSWER("V.02.OCEAN")]: saved("V.02.OCEAN", {}, 2),
  });
  await renderApp(PATH("02"));
  expect(await screen.findByText("Answer OCEAN to see the next questions")).toBeInTheDocument();
  expect(screen.getByText("0/2 answered")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /OCEAN/ }));
  await userEvent.click(await screen.findByRole("radio", { name: "Red" }));
  await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1));
  expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ text: "Red", lockVersion: 0 });
  expect(await screen.findByRole("button", { name: /RED_1/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /BLUE_1/ })).toBeNull();
  expect(screen.queryByText("Answer OCEAN to see the next questions")).toBeNull();
});

test("the section buttons go to the neighbouring section's screen", async () => {
  api();
  const { router } = await renderApp(PATH());
  await screen.findByRole("heading", { level: 1, name: "01 Customer & Problem" });
  expect(screen.getByRole("button", { name: "← Previous section" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Next section →" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(PATH("02")));
  expect(await screen.findByRole("heading", { level: 1, name: "02 Market" })).toBeInTheDocument();
});

test("an unknown section is Not found", async () => {
  api({
    [`GET /api/v1/validations/${VALIDATION_ID}/questions/99`]: () => ({
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "x", requestId: "abcdef12" } },
    }),
  });
  await renderApp(PATH("99"));
  expect(await screen.findByText("Not found. Check the link.")).toBeInTheDocument();
});

test("Ctrl+ArrowDown moves to the next question and Ctrl+ArrowUp back", async () => {
  api();
  await renderApp(PATH("01", "?q=V.01.WHO"));
  const who = await screen.findByRole("textbox", { name: "Prompt of WHO" });
  fireEvent.keyDown(who, { key: "ArrowDown", ctrlKey: true });
  expect(await screen.findByRole("textbox", { name: "Prompt of WHY THEM" })).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Prompt of WHO" })).toBeNull();
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Prompt of WHY THEM" }), {
    key: "ArrowUp",
    ctrlKey: true,
  });
  expect(await screen.findByRole("textbox", { name: "Prompt of WHO" })).toBeInTheDocument();
});
