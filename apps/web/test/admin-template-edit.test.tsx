import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { type Handler, renderApp, stubApi } from "./support";
import { adminBase } from "./support-admin";
import {
  makeDetail,
  Q_NEXT,
  Q_OCEAN,
  Q_WHO,
  S_01,
  TEMPLATES,
  V_VAL_2,
  V_VAL_3,
} from "./support-templates";

afterEach(() => {
  vi.unstubAllGlobals();
});

const path = (id = V_VAL_3) => `/admin/templates/versions/${id}`;
const detailRoute = (detail = makeDetail()) => ({
  [`GET /api/v1/admin/template-versions/${detail.id}`]: () => ({ body: detail }),
  "GET /api/v1/admin/templates": () => ({ body: TEMPLATES }),
});
const stub = (extra: Record<string, Handler> = {}, detail = makeDetail()) =>
  stubApi({ ...adminBase(), ...detailRoute(detail), ...extra });

test("the tree lists sections, their questions and the settings of a validation", async () => {
  stub();
  await renderApp(path());
  expect(
    await screen.findByRole("heading", { name: "Business Idea & Validation v3" }),
  ).toBeInTheDocument();
  const tree = screen.getByRole("treegrid", { name: "Template outline" });
  expect(within(tree).getByRole("row", { name: /Customer & Problem/ })).toBeInTheDocument();
  expect(within(tree).getByRole("row", { name: /WHO/ })).toBeInTheDocument();
  expect(within(tree).getByRole("row", { name: /NEXT STEP/ })).toBeInTheDocument();
  for (const setting of ["AI prompt", "Cost rows", "Check thresholds"]) {
    expect(within(tree).getByRole("row", { name: setting })).toBeInTheDocument();
  }
  expect(within(tree).queryByRole("row", { name: "Execution rows" })).toBeNull();
});

test("a plan has execution rows and no cost rows", async () => {
  stub(
    {},
    makeDetail({
      kind: "business_plan",
      sections: [
        {
          id: S_01,
          key: "A1",
          part: "a",
          title: "Summary",
          guidance: null,
          sortOrder: 0,
          questions: [],
        },
      ],
    }),
  );
  await renderApp(path());
  const tree = await screen.findByRole("treegrid", { name: "Template outline" });
  expect(within(tree).getByRole("row", { name: "Execution rows" })).toBeInTheDocument();
  expect(within(tree).queryByRole("row", { name: "Cost rows" })).toBeNull();
});

test("a question's edit saves its title when the field loses focus", async () => {
  const api = stub({
    [`PATCH /api/v1/admin/template-questions/${Q_WHO}`]: () => ({
      body: { ...makeDetail().sections[0]?.questions[0], title: "WHO BUYS" },
    }),
  });
  await renderApp(`${path()}?node=${Q_WHO}`);
  const title = await screen.findByRole("textbox", { name: /^Title/ });
  await userEvent.clear(title);
  await userEvent.type(title, "WHO BUYS");
  await userEvent.tab();
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ title: "WHO BUYS" }),
  );
  expect(await screen.findByRole("row", { name: /WHO BUYS/ })).toBeInTheDocument();
});

test("a question ID of the wrong form is not sent and says why", async () => {
  const api = stub();
  await renderApp(`${path()}?node=${Q_WHO}`);
  const id = await screen.findByRole("textbox", { name: "Question ID" });
  await userEvent.clear(id);
  await userEvent.type(id, "WHO");
  await userEvent.tab();
  expect(await screen.findByText(/Must look like V\.SECTION\.KEY/)).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === "PATCH")).toBe(false);
});

test("changing the answer type resets the options", async () => {
  const api = stub({
    [`PATCH /api/v1/admin/template-questions/${Q_WHO}`]: () => ({
      body: { ...makeDetail().sections[0]?.questions[0], answerType: "short_text" },
    }),
  });
  await renderApp(`${path()}?node=${Q_WHO}`);
  await userEvent.click(await screen.findByRole("button", { name: /Answer type/ }));
  await userEvent.click(await screen.findByRole("option", { name: "Short text" }));
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({
      answerType: "short_text",
      options: null,
    }),
  );
});

test("a choice question's choices are edited one per line", async () => {
  const api = stub({
    [`PATCH /api/v1/admin/template-questions/${Q_OCEAN}`]: () => ({
      body: makeDetail().sections[0]?.questions[1],
    }),
  });
  await renderApp(`${path()}?node=${Q_OCEAN}`);
  const choices = await screen.findByRole("textbox", { name: /^Choices/ });
  expect(choices).toHaveValue("Red\nBlue\nMixed");
  await userEvent.type(choices, "\nGreen");
  await userEvent.tab();
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({
      options: { kind: "choice", choices: ["Red", "Blue", "Mixed", "Green"] },
    }),
  );
});

test("a published version is read only", async () => {
  const api = stub({}, makeDetail({ id: V_VAL_2, versionNumber: 2, status: "published" }));
  await renderApp(`${path(V_VAL_2)}?node=${Q_WHO}`);
  expect(await screen.findByText("v2 is published")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add section" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Publish as v2" })).toBeNull();
  expect(screen.getByRole("textbox", { name: /^Title/ })).toHaveAttribute("readonly");
  expect(api.calls.some((c) => c.method !== "GET")).toBe(false);
});

test("Add question creates it in the chosen section and opens it", async () => {
  const created = {
    id: "cccccccc-0000-4000-8000-0000000000aa",
    key: "V.01.REACH",
    sectionKey: "01",
    title: "REACH",
    prompt: "How will you reach this customer?",
    example: null,
    hint: null,
    answerType: "long_text",
    options: null,
    displayCondition: null,
    hasFau: false,
    sortOrder: 2,
    copyFrom: null,
    reference: null,
  };
  const api = stub({
    [`POST /api/v1/admin/template-sections/${S_01}/questions`]: () => ({
      status: 201,
      body: created,
    }),
  });
  await renderApp(`${path()}?node=${S_01}`);
  await userEvent.click(await screen.findByRole("button", { name: "Add question" }));
  const dialog = await screen.findByRole("dialog", { name: "Add a question" });
  const key = within(dialog).getByRole("textbox", { name: /Question ID/ });
  expect(key).toHaveValue("V.01.");
  await userEvent.type(key, "REACH");
  await userEvent.type(within(dialog).getByRole("textbox", { name: /^Title/ }), "REACH");
  await userEvent.type(
    within(dialog).getByRole("textbox", { name: /^Question(?! ID)/ }),
    "How will you reach this customer?",
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({
      key: "V.01.REACH",
      title: "REACH",
      prompt: "How will you reach this customer?",
      answerType: "long_text",
    }),
  );
  expect(await screen.findByRole("heading", { name: "Question V.01.REACH" })).toBeInTheDocument();
});

test("a question ID the API refuses shows its reason in the sheet", async () => {
  stub({
    [`POST /api/v1/admin/template-sections/${S_01}/questions`]: () => ({
      status: 422,
      body: { error: { code: "INVALID_QUESTION_KEY", message: "x", requestId: "abcdef12-0000" } },
    }),
  });
  await renderApp(`${path()}?node=${S_01}`);
  await userEvent.click(await screen.findByRole("button", { name: "Add question" }));
  const dialog = await screen.findByRole("dialog", { name: "Add a question" });
  await userEvent.type(within(dialog).getByRole("textbox", { name: /Question ID/ }), "X");
  await userEvent.type(within(dialog).getByRole("textbox", { name: /^Title/ }), "X");
  await userEvent.type(within(dialog).getByRole("textbox", { name: /^Question(?! ID)/ }), "X");
  await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
  expect(await within(dialog).findByText("This question ID is not valid.")).toBeInTheDocument();
});

test("Move down puts the question after its neighbour", async () => {
  const detail = makeDetail();
  const api = stub({
    [`PUT /api/v1/admin/template-versions/${V_VAL_3}/order`]: () => ({ body: detail }),
  });
  await renderApp(`${path()}?node=${Q_WHO}`);
  await userEvent.click(await screen.findByRole("button", { name: "Move down" }));
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === "PUT")?.body).toEqual({
      sections: [
        { id: S_01, questionIds: [Q_OCEAN, Q_WHO] },
        { id: detail.sections[1]?.id, questionIds: [Q_NEXT] },
      ],
    }),
  );
});

test("Delete asks first, then removes the question from the draft", async () => {
  const api = stub({
    [`DELETE /api/v1/admin/template-questions/${Q_WHO}`]: () => ({ status: 204 }),
  });
  await renderApp(`${path()}?node=${Q_WHO}`);
  await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Delete question V.01.WHO?" });
  expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
  await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(api.calls.some((c) => c.method === "DELETE")).toBe(true));
  await waitFor(() => expect(screen.queryByRole("row", { name: /WHO/ })).toBeNull());
});

test("Publish with errors lists them, names where to fix, and does not publish", async () => {
  const api = stub({
    [`POST /api/v1/admin/template-versions/${V_VAL_3}/validate`]: () => ({
      body: {
        errors: [
          {
            code: "unknown_condition_key",
            message: "Question V.01.OCEAN shows only for V.09.X, which does not exist",
            nodeId: Q_OCEAN,
          },
        ],
        warnings: [],
      },
    }),
  });
  await renderApp(path());
  await userEvent.click(await screen.findByRole("button", { name: "Publish as v3" }));
  const dialog = await screen.findByRole("dialog", { name: "Publish as v3" });
  expect(within(dialog).getByText(/which does not exist/)).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Publish v3" })).toBeNull();
  await userEvent.click(within(dialog).getByRole("button", { name: "Go to it" }));
  expect(await screen.findByRole("heading", { name: "Question V.01.OCEAN" })).toBeInTheDocument();
  expect(api.calls.some((c) => c.url.pathname.endsWith("/publish"))).toBe(false);
});

test("Publish warns about removed question IDs, then publishes and returns to the list", async () => {
  const api = stub({
    [`POST /api/v1/admin/template-versions/${V_VAL_3}/validate`]: () => ({
      body: { errors: [], warnings: [{ code: "removed_keys", keys: ["V.02.OLD"] }] },
    }),
    [`POST /api/v1/admin/template-versions/${V_VAL_3}/publish`]: () => ({
      body: { versionNumber: 3, publishedAt: "2026-10-02T00:00:00.000Z" },
    }),
  });
  const { router } = await renderApp(path());
  await userEvent.click(await screen.findByRole("button", { name: "Publish as v3" }));
  const dialog = await screen.findByRole("dialog", { name: "Publish as v3" });
  expect(within(dialog).getByText("1 question ID is not in this version")).toBeInTheDocument();
  expect(within(dialog).getByText("V.02.OLD")).toBeInTheDocument();
  expect(within(dialog).getByText(/Answers already given don't change/)).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("button", { name: "Publish v3" }));
  await waitFor(() =>
    expect(api.calls.some((c) => c.url.pathname.endsWith("/publish"))).toBe(true),
  );
  await waitFor(() => expect(router.state.location.pathname).toBe("/admin/templates"));
  expect(router.state.location.search).toMatchObject({ kind: "validation" });
});

test("cost rows save as a list once every row is valid", async () => {
  const detail = makeDetail();
  const api = stub({
    [`PUT /api/v1/admin/template-versions/${V_VAL_3}/cost-defaults`]: () => ({ body: detail }),
  });
  await renderApp(`${path()}?node=cost-defaults`);
  const names = await screen.findAllByRole("textbox", { name: /^Row name/ });
  await userEvent.clear(names[0] as HTMLElement);
  await userEvent.type(names[0] as HTMLElement, "Permits and licences");
  await userEvent.tab();
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === "PUT")?.body).toEqual({
      items: [
        { category: "initial", key: "initial.permits", name: "Permits and licences" },
        { category: "monthly_fixed", key: "monthly.rent", name: "Rent" },
      ],
    }),
  );
});

test("a cost row with a bad key is held back", async () => {
  const api = stub();
  await renderApp(`${path()}?node=cost-defaults`);
  const keys = await screen.findAllByRole("textbox", { name: /^Key/ });
  await userEvent.clear(keys[0] as HTMLElement);
  await userEvent.type(keys[0] as HTMLElement, "Permits");
  await userEvent.tab();
  expect(await screen.findByText(/Use lower-case letters/)).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === "PUT")).toBe(false);
});

test("check thresholds fall back to the standard ones and save together", async () => {
  const detail = makeDetail();
  const api = stub({
    [`PUT /api/v1/admin/template-versions/${V_VAL_3}/check-rules`]: () => ({ body: detail }),
  });
  await renderApp(`${path()}?node=check-rules`);
  const minimum = await screen.findByRole("textbox", { name: "Competitors: at least" });
  expect(minimum).toHaveValue("3");
  await userEvent.clear(minimum);
  await userEvent.type(minimum, "4");
  await userEvent.tab();
  await waitFor(() => {
    const body = api.calls.find((c) => c.method === "PUT")?.body as {
      items: { checkKey: string; params: Record<string, number> }[];
    };
    expect(body.items.map((item) => item.checkKey)).toEqual([
      "competitors",
      "local_price",
      "permits",
      "demand_signal",
    ]);
    expect(body.items[0]?.params).toEqual({ min: 4, max: 5 });
    expect(body.items[2]?.params).toEqual({ researchLogs: 1 });
  });
});

test("the AI prompt saves", async () => {
  const api = stub({
    [`PATCH /api/v1/admin/template-versions/${V_VAL_3}`]: () => ({
      body: makeDetail({ aiPrompt: "Be brief" }),
    }),
  });
  await renderApp(`${path()}?node=ai-prompt`);
  await userEvent.type(await screen.findByRole("textbox", { name: "Prompt" }), "Be brief");
  await userEvent.tab();
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ aiPrompt: "Be brief" }),
  );
});

test("a version that does not exist shows Not found", async () => {
  stubApi({
    ...adminBase(),
    [`GET /api/v1/admin/template-versions/${V_VAL_3}`]: () => ({
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "x", requestId: "abcdef12-0000" } },
    }),
  });
  await renderApp(path());
  expect(await screen.findByText(/couldn't find|not found/i)).toBeInTheDocument();
});

test("switching the type of a question that has options asks first and then clears them", async () => {
  const api = stub({
    [`PATCH /api/v1/admin/template-questions/${Q_OCEAN}`]: () => ({
      body: { ...makeDetail().sections[0]?.questions[1], answerType: "long_text", options: null },
    }),
  });
  await renderApp(`${path()}?node=${Q_OCEAN}`);
  await userEvent.click(await screen.findByRole("button", { name: /Answer type/ }));
  await userEvent.click(await screen.findByRole("option", { name: "Long text" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Change the answer type?" });
  expect(api.calls.some((c) => c.method === "PATCH")).toBe(false);
  await userEvent.click(within(dialog).getByRole("button", { name: "Change type" }));
  await waitFor(() =>
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({
      answerType: "long_text",
      options: null,
    }),
  );
});

test("Publish sends the edit that is still waiting before it checks the draft", async () => {
  const api = stub({
    [`PATCH /api/v1/admin/template-questions/${Q_WHO}`]: () => ({
      body: { ...makeDetail().sections[0]?.questions[0], title: "WHO PAYS" },
    }),
    [`POST /api/v1/admin/template-versions/${V_VAL_3}/validate`]: () => ({
      body: { errors: [], warnings: [] },
    }),
  });
  await renderApp(`${path()}?node=${Q_WHO}`);
  const title = await screen.findByRole("textbox", { name: /^Title/ });
  await userEvent.clear(title);
  await userEvent.type(title, "WHO PAYS");
  await userEvent.click(screen.getByRole("button", { name: "Publish as v3" }));
  await screen.findByRole("dialog", { name: "Publish as v3" });
  const sent = api.calls
    .filter((c) => c.method !== "GET")
    .map((c) => `${c.method} ${c.url.pathname}`);
  expect(sent).toEqual([
    `PATCH /api/v1/admin/template-questions/${Q_WHO}`,
    `POST /api/v1/admin/template-versions/${V_VAL_3}/validate`,
  ]);
});

test("cost rows with a problem say the list is not saved, and a removal is not sent meanwhile", async () => {
  const api = stub();
  await renderApp(`${path()}?node=cost-defaults`);
  await userEvent.click(
    (await screen.findAllByRole("button", { name: "Add row" }))[0] as HTMLElement,
  );
  expect(await screen.findByText(/not saved yet/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Remove Rent" }));
  expect(api.calls.some((c) => c.method === "PUT")).toBe(false);
  expect(screen.getByText(/not saved yet/)).toBeInTheDocument();
});

test("table columns show what is wrong with them and hold the list back", async () => {
  const detail = makeDetail();
  const table = {
    ...(detail.sections[0]?.questions[0] as object),
    id: Q_WHO,
    answerType: "table",
    options: {
      kind: "table",
      columns: [
        { key: "name", label: "Name", type: "text" },
        { key: "name", label: "Other", type: "number" },
      ],
    },
  };
  const api = stub(
    {},
    {
      ...detail,
      sections: [{ ...(detail.sections[0] as object), questions: [table] } as never],
    },
  );
  await renderApp(`${path()}?node=${Q_WHO}`);
  expect((await screen.findAllByText("This key is used twice")).length).toBe(2);
  expect(screen.getByText(/not saved yet/)).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === "PATCH")).toBe(false);
});

test("the preview shows a table question's columns", async () => {
  const detail = makeDetail();
  const table = {
    ...(detail.sections[0]?.questions[0] as object),
    id: Q_WHO,
    answerType: "table",
    options: {
      kind: "table",
      columns: [
        { key: "name", label: "Founder name", type: "text" },
        { key: "share", label: "Initial ownership", type: "percent" },
      ],
    },
  };
  stub(
    {},
    { ...detail, sections: [{ ...(detail.sections[0] as object), questions: [table] } as never] },
  );
  await renderApp(`${path()}?node=${Q_WHO}`);
  await userEvent.click(await screen.findByRole("button", { name: "Preview" }));
  const dialog = await screen.findByRole("dialog", { name: "Preview" });
  expect(within(dialog).getByText("Founder name")).toBeInTheDocument();
  expect(within(dialog).getByText("Initial ownership")).toBeInTheDocument();
});
