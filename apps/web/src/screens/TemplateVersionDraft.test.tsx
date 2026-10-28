import type {
  AdminTemplateList,
  TemplateCheckResult,
  TemplateVersionDetail,
} from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { operator } from "../test/admin";
import { apiError, type Call, renderApp, stubApi } from "../test/api";

// 27 Admin: Edit Template, a draft's editing (design-spec 6.17「下書きの編集」): each
// node's fields saved as typed, the kind's settings, adding, deleting and reordering in
// the tree, the check read again after edits, and the preview.

afterEach(() => {
  vi.unstubAllGlobals();
});

const draftId = "61d51f65-95e4-4c30-84d8-0627102fc142";
const firstId = "1a2b3c4d-0000-4000-8000-000000000001";
const secondId = "1a2b3c4d-0000-4000-8000-000000000004";
const whoId = "1a2b3c4d-0000-4000-8000-000000000002";
const oceanId = "1a2b3c4d-0000-4000-8000-000000000003";
const worthId = "1a2b3c4d-0000-4000-8000-000000000005";

type Question = TemplateVersionDetail["sections"][number]["questions"][number];

const question = (
  id: string,
  key: string,
  title: string,
  extra: Partial<Question> = {},
): Question => ({
  id,
  key,
  sectionKey: key.split(".")[1] ?? "",
  title,
  prompt: `${title}?`,
  example: null,
  hint: null,
  answerType: "long_text",
  options: null,
  displayCondition: null,
  hasFau: true,
  sortOrder: 0,
  copyFrom: null,
  reference: null,
  isKeyPublished: false,
  ...extra,
});

const validation = (): TemplateVersionDetail => ({
  id: draftId,
  kind: "validation",
  versionNumber: 3,
  status: "draft",
  aiPrompt: "",
  name: "Business Idea & Validation",
  sections: [
    {
      id: firstId,
      key: "01",
      part: null,
      title: "Customer & Problem",
      subtitle: null,
      guidance: "Who is it for?",
      sortOrder: 0,
      questions: [
        question(whoId, "V.01.WHO", "WHO", {
          isKeyPublished: true,
          example: "Office workers who buy pasalubong",
          hint: "Be specific about who pays.",
        }),
        question(oceanId, "V.01.OCEAN", "OCEAN", {
          answerType: "choice",
          options: { kind: "choice", choices: ["Red", "Blue", "Mixed"] },
        }),
      ],
    },
    {
      id: secondId,
      key: "08",
      part: null,
      title: "Return",
      subtitle: null,
      guidance: null,
      sortOrder: 1,
      questions: [question(worthId, "V.08.WORTH", "WORTH")],
    },
  ],
  costRows: [],
  costDefaults: [
    {
      id: "1a2b3c4d-0000-4000-8000-000000000010",
      category: "initial",
      key: "initial.equipment",
      name: "Equipment",
      sortOrder: 0,
    },
  ],
  checkRules: [
    { checkKey: "competitors", params: { min: 3 } },
    {
      checkKey: "local_price",
      params: { pricedCompetitors: 2, researchLogs: 1 },
    },
    { checkKey: "costs", params: {} },
    { checkKey: "permits", params: { researchLogs: 1 } },
    { checkKey: "demand_signal", params: { researchLogs: 1 } },
  ],
  executionPresets: [],
});

const list: AdminTemplateList = {
  items: [
    { kind: "self_analysis", name: null, versions: [] },
    { kind: "validation", name: "Business Idea & Validation", versions: [] },
    { kind: "business_plan", name: null, versions: [] },
  ],
};

let made = 0;
const newId = () => {
  made += 1;
  return `1a2b3c4d-0000-4000-8000-${String(900 + made).padStart(12, "0")}`;
};

/**
 * AD3–AD6 over one draft, kept here: each edit changes it and answers with it, as the
 * API does (SDD 5.13). `answer` goes first, to hold an answer back or refuse.
 */
function draftApi(
  start: TemplateVersionDetail = validation(),
  {
    check = { errors: [], warnings: [] },
    answer,
  }: {
    check?: TemplateCheckResult;
    answer?: (call: Call) => Response | Promise<Response> | undefined;
  } = {},
) {
  let version = structuredClone(start);
  const all = () => version.sections.flatMap((section) => section.questions);
  const calls = stubApi((call) => {
    const answered = answer?.(call);
    if (answered !== undefined) return answered;
    const { method, path } = call;
    const body = (call.body ?? {}) as Record<string, unknown>;
    if (method === "GET" && path === "/api/v1/me") {
      return Response.json(operator);
    }
    if (method === "GET" && path === "/api/v1/admin/templates") {
      return Response.json(list);
    }
    const base = `/api/v1/admin/template-versions/${draftId}`;
    if (method === "GET" && path === base) return Response.json(version);
    if (method === "POST" && path === `${base}/validate`) {
      return Response.json(check);
    }
    if (method === "PATCH" && path === base) {
      version = { ...version, ...body };
      return Response.json(version);
    }
    if (method === "POST" && path === `${base}/sections`) {
      version.sections.push({
        id: newId(),
        key: String(body.key),
        title: String(body.title),
        part: null,
        subtitle: null,
        guidance: null,
        sortOrder: version.sections.length,
        questions: [],
      });
      return Response.json(version, { status: 201 });
    }
    if (method === "PUT" && path === `${base}/order`) {
      const order = body.sections as { id: string; questionIds: string[] }[];
      const questions = new Map(all().map((q) => [q.id, q]));
      version.sections = order.map(({ id, questionIds }) => {
        const section = version.sections.find((s) => s.id === id);
        if (section === undefined) throw new Error(`No section ${id}`);
        return {
          ...section,
          questions: questionIds.map((qid) => questions.get(qid) as Question),
        };
      });
      return Response.json(version);
    }
    if (method === "PUT" && path === `${base}/check-rules`) {
      version.checkRules = body.items as TemplateVersionDetail["checkRules"];
      return Response.json(version);
    }
    if (method === "PUT" && path === `${base}/execution-presets`) {
      version.executionPresets = (
        body.items as {
          type: "milestone" | "launch" | "kpi";
          title: string;
          area?: string;
          launchTiming?: TemplateVersionDetail["executionPresets"][number]["launchTiming"];
        }[]
      ).map((row, sortOrder) => ({
        id: newId(),
        type: row.type,
        title: row.title,
        area: row.area ?? null,
        launchTiming: row.launchTiming ?? null,
        sortOrder,
      }));
      return Response.json(version);
    }
    if (method === "PUT" && path === `${base}/cost-defaults`) {
      version.costDefaults = (
        body.items as { category: "initial"; key: string; name: string }[]
      ).map((row, sortOrder) => ({ ...row, id: newId(), sortOrder }));
      return Response.json(version);
    }
    const section = /^\/api\/v1\/admin\/template-sections\/([\w-]+)(.*)$/.exec(
      path,
    );
    if (section !== null) {
      const [, id, rest] = section;
      const target = version.sections.find((s) => s.id === id);
      if (target === undefined) return apiError(404, "NOT_FOUND");
      if (method === "PATCH") {
        Object.assign(target, body);
        return Response.json(version);
      }
      if (method === "DELETE") {
        version.sections = version.sections.filter((s) => s !== target);
        return new Response(null, { status: 204 });
      }
      if (method === "POST" && rest === "/questions") {
        target.questions.push(
          question(newId(), String(body.key), String(body.title), {
            prompt: String(body.prompt),
            answerType: body.answerType as Question["answerType"],
            hasFau: false,
          }),
        );
        return Response.json(version, { status: 201 });
      }
    }
    const one = /^\/api\/v1\/admin\/template-questions\/([\w-]+)$/.exec(path);
    if (one !== null) {
      const target = all().find((q) => q.id === one[1]);
      if (target === undefined) return apiError(404, "NOT_FOUND");
      if (method === "PATCH") {
        Object.assign(target, body);
        return Response.json(version);
      }
      if (method === "DELETE") {
        for (const s of version.sections) {
          s.questions = s.questions.filter((q) => q !== target);
        }
        return new Response(null, { status: 204 });
      }
    }
    return undefined;
  });
  return { calls, current: () => version };
}

const open = (node?: string) =>
  renderApp(
    `/admin/templates/versions/${draftId}${node === undefined ? "" : `?node=${node}`}`,
  );

/** A field by the start of its name: a required one's name ends in "Required". */
const field = (role: "textbox" | "spinbutton", name: string) =>
  screen.getByRole(role, {
    name: new RegExp(`^${name.replace(/[()/]/g, "\\$&")}`),
  }) as HTMLInputElement;

const sent = (calls: Call[], method: string, ending: string) =>
  calls.filter((call) => call.method === method && call.path.endsWith(ending));

const checks = (calls: Call[]) => sent(calls, "POST", "/validate").length;

describe("27: a draft's nodes, saved as they are typed (design-spec 6.17)", () => {
  test("a question's title: sent when left, the check read again, Saved in the header", async () => {
    const user = userEvent.setup();
    const { calls, current } = draftApi();
    open(oceanId);
    const title = await screen.findByRole("textbox", { name: /^Title/ });
    await waitFor(() => expect(checks(calls)).toBe(1));
    await user.clear(title);
    await user.type(title, "OCEAN TYPE");
    await user.tab();
    await waitFor(() =>
      expect(sent(calls, "PATCH", `/template-questions/${oceanId}`)).toEqual([
        expect.objectContaining({ body: { title: "OCEAN TYPE" } }),
      ]),
    );
    expect(current().sections[0]?.questions[1]?.title).toBe("OCEAN TYPE");
    await waitFor(() => expect(checks(calls)).toBeGreaterThan(1));
    expect(await screen.findByText("Saved")).toBeTruthy();
    // The tree follows the edit.
    expect(
      within(
        screen.getByRole("treegrid", {
          name: "Sections and questions of Validation",
        }),
      ).getByText("OCEAN TYPE"),
    ).toBeTruthy();
  });

  test("values against the rules are not sent and say why (6.0.8 for 27)", async () => {
    const user = userEvent.setup();
    const { calls } = draftApi();
    open(oceanId);
    const key = await screen.findByRole("textbox", { name: /^Question ID/ });
    await user.clear(key);
    await user.type(key, "V.01.who");
    expect(await screen.findByText("Check the format")).toBeTruthy();
    await user.clear(key);
    await user.type(key, "V.01.WHO");
    expect(
      await screen.findByText("Already used. Enter a different value."),
    ).toBeTruthy();
    const title = field("textbox", "Title");
    await user.clear(title);
    expect(await screen.findByText("Can't be empty")).toBeTruthy();
    await user.tab();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(sent(calls, "PATCH", `/template-questions/${oceanId}`)).toEqual([]);
  });

  test("a published question ID only shows, with why", async () => {
    draftApi();
    open(whoId);
    const key = (await screen.findByRole("textbox", {
      name: /^Question ID/,
    })) as HTMLInputElement;
    expect(key.readOnly).toBe(true);
    expect(
      screen.getByText(
        "This question ID is in a published version, so it can't change.",
      ),
    ).toBeTruthy();
  });

  test("a new answer type asks first when it drops the choices, then sends both", async () => {
    const user = userEvent.setup();
    const { calls } = draftApi();
    open(oceanId);
    await screen.findByRole("textbox", { name: "Choice 1" });
    await user.click(screen.getByRole("button", { name: /Answer type/ }));
    await user.click(await screen.findByRole("option", { name: "Long text" }));
    const ask = await screen.findByRole("alertdialog", {
      // The warning's mark reads "Alert" before the title.
      name: /Change the answer type to Long text\?$/,
    });
    expect(within(ask).getByText("Its choices are removed.")).toBeTruthy();
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(sent(calls, "PATCH", `/template-questions/${oceanId}`)).toEqual([]);
    await user.click(screen.getByRole("button", { name: /Answer type/ }));
    await user.click(await screen.findByRole("option", { name: "Long text" }));
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: /Change the answer type to Long text\?$/,
        }),
      ).getByRole("button", { name: "Change" }),
    );
    await waitFor(() =>
      expect(sent(calls, "PATCH", `/template-questions/${oceanId}`)).toEqual([
        expect.objectContaining({
          body: { answerType: "long_text", options: null },
        }),
      ]),
    );
    expect(screen.queryByRole("textbox", { name: "Choice 1" })).toBeNull();
  });

  test("a type with nothing to drop changes at once; its settings start empty", async () => {
    const user = userEvent.setup();
    const { calls } = draftApi();
    open(whoId);
    await screen.findByRole("textbox", { name: /^Question ID/ });
    await user.click(screen.getByRole("button", { name: /Answer type/ }));
    expect(
      screen
        .getAllByRole("option")
        .map((option) => option.textContent)
        .filter(Boolean),
    ).toEqual(["Long text", "Short text", "Choice"]);
    await user.click(screen.getByRole("option", { name: "Choice" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() =>
      expect(
        sent(calls, "PATCH", `/template-questions/${whoId}`).at(-1)?.body,
      ).toEqual({ answerType: "choice", options: null }),
    );
    expect(await screen.findByText("No choices yet")).toBeTruthy();
  });

  test("choices: a new one waits quietly until typed, then the list is sent; Remove sends", async () => {
    const user = userEvent.setup();
    const { calls } = draftApi();
    open(oceanId);
    await screen.findByRole("textbox", { name: "Choice 1" });
    await user.click(screen.getByRole("button", { name: "Add choice" }));
    const fourth = screen.getByRole("textbox", { name: "Choice 4" });
    await waitFor(() => expect(document.activeElement).toBe(fourth));
    expect(screen.queryByText("Can't be empty")).toBeNull();
    await user.type(fourth, "Purple");
    await user.tab();
    await waitFor(() =>
      expect(
        sent(calls, "PATCH", `/template-questions/${oceanId}`).at(-1)?.body,
      ).toEqual({
        options: {
          kind: "choice",
          choices: ["Red", "Blue", "Mixed", "Purple"],
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Remove Blue" }));
    await waitFor(() =>
      expect(
        sent(calls, "PATCH", `/template-questions/${oceanId}`).at(-1)?.body,
      ).toEqual({
        options: { kind: "choice", choices: ["Red", "Mixed", "Purple"] },
      }),
    );
    // Two choices alike are refused where the second is.
    await user.type(screen.getByRole("textbox", { name: "Choice 3" }), "X");
    await user.clear(screen.getByRole("textbox", { name: "Choice 3" }));
    await user.type(screen.getByRole("textbox", { name: "Choice 3" }), "Red");
    expect(
      await screen.findByText("Already used. Enter a different value."),
    ).toBeTruthy();
  });

  test("Shown when: a choice question's answers ticked", async () => {
    const user = userEvent.setup();
    const { calls } = draftApi();
    open(whoId);
    await screen.findByRole("textbox", { name: /^Question ID/ });
    await user.click(screen.getByRole("button", { name: "Add condition" }));
    await user.click(screen.getByRole("button", { name: /Question/ }));
    await user.click(
      await screen.findByRole("option", { name: "V.01.OCEAN OCEAN" }),
    );
    // With no answer ticked the question would never show: held, not sent.
    expect(await screen.findByText("Can't be empty")).toBeTruthy();
    expect(sent(calls, "PATCH", `/template-questions/${whoId}`)).toEqual([]);
    await user.click(screen.getByRole("checkbox", { name: "Red" }));
    await user.click(screen.getByRole("checkbox", { name: "Mixed" }));
    await waitFor(() =>
      expect(
        sent(calls, "PATCH", `/template-questions/${whoId}`).at(-1)?.body,
      ).toEqual({ displayCondition: { "V.01.OCEAN": ["Red", "Mixed"] } }),
    );
  });

  test("the template's name and the thresholds save as their own items", async () => {
    const user = userEvent.setup();
    const { calls } = draftApi();
    const router = open("name");
    const name = await screen.findByRole("textbox", { name: /^Template name/ });
    await user.type(name, " (BCDX)");
    await user.tab();
    await waitFor(() =>
      expect(sent(calls, "PATCH", draftId).at(-1)?.body).toEqual({
        name: "Business Idea & Validation (BCDX)",
      }),
    );
    await router.navigate({ to: ".", search: { node: "check-rules" } });
    const min = await screen.findByRole("textbox", {
      name: /^Competitors to list/,
    });
    await user.clear(min);
    await user.type(min, "0");
    expect(await screen.findByText("Enter 1 or more")).toBeTruthy();
    await user.clear(min);
    await user.type(min, "4");
    await user.tab();
    await waitFor(() =>
      expect(sent(calls, "PUT", "/check-rules").at(-1)?.body).toEqual({
        items: [
          { checkKey: "costs", params: {} },
          { checkKey: "competitors", params: { min: 4 } },
          {
            checkKey: "local_price",
            params: { pricedCompetitors: 2, researchLogs: 1 },
          },
          { checkKey: "permits", params: { researchLogs: 1 } },
          { checkKey: "demand_signal", params: { researchLogs: 1 } },
        ],
      }),
    );
  });

  test("a starting cost row added to its table is sent with the list once keyed", async () => {
    const user = userEvent.setup();
    const { calls } = draftApi();
    open("cost-defaults");
    const startup = await screen.findByRole("group", { name: "Startup costs" });
    await user.click(within(startup).getByRole("button", { name: "Add row" }));
    const keys = within(startup).getAllByRole("textbox", { name: /^Key/ });
    await user.type(keys.at(-1) as HTMLElement, "initial.permits");
    // Straight from the key to the name while the key's save is on its way: the new row
    // stays in the page, and the keyboard in it.
    const name = within(startup)
      .getAllByRole("textbox", { name: /^Name/ })
      .at(-1) as HTMLInputElement;
    await user.type(name, "Permits");
    expect(name.isConnected && document.activeElement === name).toBe(true);
    await user.tab();
    await waitFor(() =>
      expect(sent(calls, "PUT", "/cost-defaults").at(-1)?.body).toEqual({
        items: [
          { category: "initial", key: "initial.equipment", name: "Equipment" },
          { category: "initial", key: "initial.permits", name: "Permits" },
        ],
      }),
    );
  });

  test("Publish waits while a field holds a value against its rules", async () => {
    const user = userEvent.setup();
    draftApi();
    open(oceanId);
    const publish = await screen.findByRole("button", {
      name: "Publish as v3",
    });
    await waitFor(() =>
      expect((publish as HTMLButtonElement).disabled).toBe(false),
    );
    const title = field("textbox", "Title");
    await user.clear(title);
    await user.tab();
    expect(await screen.findByText("Can't be empty")).toBeTruthy();
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    await user.type(title, "OCEAN");
    await user.tab();
    await waitFor(() =>
      expect((publish as HTMLButtonElement).disabled).toBe(false),
    );
  });

  test("a list the API refused says so under it (SDD 8.2)", async () => {
    const user = userEvent.setup();
    draftApi(validation(), {
      answer: (call) =>
        call.method === "PUT" && call.path.endsWith("/cost-defaults")
          ? apiError(422, "VALIDATION_FAILED", {
              details: [{ path: "items.0.key", code: "custom" }],
            })
          : undefined,
    });
    open("cost-defaults");
    const startup = await screen.findByRole("group", { name: "Startup costs" });
    const key = within(startup).getAllByRole("textbox", { name: /^Key/ })[0];
    await user.type(key as HTMLElement, "s");
    await user.tab();
    // Beside "Couldn't save" over the lists, and under the lists themselves.
    await waitFor(() =>
      expect(screen.getAllByText("Check the format")).toHaveLength(2),
    );
  });

  test("Publish waits for the saves of the version", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    draftApi(validation(), {
      answer: (call) =>
        call.method === "PATCH" && call.path.includes("template-questions")
          ? new Promise<Response>((resolve) => {
              release = () =>
                resolve(Response.json({ ...validation(), name: "Held" }));
            })
          : undefined,
    });
    open(oceanId);
    const publish = await screen.findByRole("button", {
      name: "Publish as v3",
    });
    await waitFor(() =>
      expect((publish as HTMLButtonElement).disabled).toBe(false),
    );
    await user.type(field("textbox", "Title"), "!");
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    await user.tab();
    release();
    await waitFor(() =>
      expect((publish as HTMLButtonElement).disabled).toBe(false),
    );
  });
});

describe("27: each kind's own fields (design-spec 6.17)", () => {
  test("a section's key, unique in the version, and its guidance", async () => {
    const user = userEvent.setup();
    const { calls } = draftApi();
    open(secondId);
    const key = await screen.findByRole("textbox", { name: /^Key/ });
    await user.clear(key);
    await user.type(key, "01");
    expect(
      await screen.findByText("Already used. Enter a different value."),
    ).toBeTruthy();
    await user.clear(key);
    await user.type(key, "10");
    await user.type(
      screen.getByRole("textbox", { name: /^Guidance/ }),
      "Is it worth it?",
    );
    await user.tab();
    await waitFor(() =>
      // The key went when its field was left; the other key was never sent.
      expect(
        sent(calls, "PATCH", `/template-sections/${secondId}`).map(
          (call) => call.body,
        ),
      ).toEqual([{ key: "10" }, { guidance: "Is it worth it?" }]),
    );
    // Only a plan's items have a part, and only a self analysis's a subtitle.
    expect(screen.queryByRole("button", { name: /Part/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /^Subtitle/ })).toBeNull();
  });

  test("a plan: its item's part, what a prompt copies, and the starting execution rows", async () => {
    const user = userEvent.setup();
    const itemId = "1a2b3c4d-0000-4000-8000-000000000020";
    const promptId = "1a2b3c4d-0000-4000-8000-000000000021";
    const { calls } = draftApi({
      ...validation(),
      kind: "business_plan",
      checkRules: [],
      costRows: [],
      costDefaults: [],
      sections: [
        {
          id: itemId,
          key: "01",
          part: null,
          title: "Business Overview",
          subtitle: null,
          guidance: null,
          sortOrder: 0,
          questions: [
            question(promptId, "P.01.1", "What is the business?", {
              hasFau: false,
            }),
          ],
        },
      ],
    });
    const router = open(itemId);
    await screen.findByRole("heading", { level: 2, name: "Business Overview" });
    await user.click(screen.getByRole("button", { name: /Part/ }));
    await user.click(await screen.findByRole("option", { name: "Part A" }));
    await waitFor(() =>
      expect(
        sent(calls, "PATCH", `/template-sections/${itemId}`).at(-1)?.body,
      ).toEqual({ part: "a" }),
    );
    await router.navigate({ to: ".", search: { node: promptId } });
    await screen.findByRole("heading", {
      level: 2,
      name: "What is the business?",
    });
    expect(screen.queryByRole("checkbox", { name: /F\/A\/U/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Add source" }));
    await user.type(
      screen.getByRole("textbox", { name: "Source 1" }),
      "IDEA.ONE_LINE",
    );
    expect(await screen.findByText("Check the format")).toBeTruthy();
    await user.type(
      screen.getByRole("textbox", { name: "Source 1" }),
      "_CONCEPT",
    );
    await user.tab();
    await waitFor(() =>
      expect(
        sent(calls, "PATCH", `/template-questions/${promptId}`).at(-1)?.body,
      ).toEqual({ copyFrom: ["IDEA.ONE_LINE_CONCEPT"] }),
    );
    await router.navigate({ to: ".", search: { node: "execution-presets" } });
    const launch = await screen.findByRole("group", { name: "Launch plan" });
    await user.click(within(launch).getByRole("button", { name: "Add row" }));
    await user.type(
      within(launch).getByRole("textbox", { name: /^Timing/ }),
      "30 days before launch",
    );
    await user.tab();
    // A launch row needs its period first: nothing goes out without one.
    expect(await within(launch).findByText("Can't be empty")).toBeTruthy();
    expect(sent(calls, "PUT", "/execution-presets")).toEqual([]);
    await user.click(within(launch).getByRole("button", { name: /Period/ }));
    await user.click(await screen.findByRole("option", { name: "T−30" }));
    await waitFor(() =>
      expect(sent(calls, "PUT", "/execution-presets").at(-1)?.body).toEqual({
        items: [
          {
            type: "launch",
            title: "30 days before launch",
            launchTiming: "t_minus_30",
          },
        ],
      }),
    );
  });

  test("a plan's key numbers: chosen by name from 6.4's and the published cost rows, each once", async () => {
    const user = userEvent.setup();
    const itemId = "1a2b3c4d-0000-4000-8000-000000000030";
    const promptId = "1a2b3c4d-0000-4000-8000-000000000031";
    const { calls } = draftApi({
      ...validation(),
      kind: "business_plan",
      checkRules: [],
      costDefaults: [],
      costRows: [{ key: "monthly.salaries", name: "Salaries" }],
      sections: [
        {
          id: itemId,
          key: "18",
          part: "b",
          title: "Team",
          subtitle: null,
          guidance: null,
          sortOrder: 0,
          questions: [
            question(promptId, "P.18.3", "Expected monthly payroll", {
              hasFau: false,
              answerType: "linked_metric",
              options: {
                kind: "linked_metric",
                metricKeys: ["selling_price", "sellng_price"],
              },
            }),
          ],
        },
      ],
    });
    open(promptId);
    await screen.findByRole("heading", {
      level: 2,
      name: "Expected monthly payroll",
    });
    // A key that is none of them (an imported typo) shows as one, for Check to flag.
    expect(
      screen.getByRole("button", { name: /Key number 2$/ }).textContent,
    ).toContain("sellng_price (not a key number)");
    await user.click(screen.getByRole("button", { name: /Key number 2$/ }));
    const options = within(await screen.findByRole("listbox"))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toContain("Break-even units / day");
    expect(options).toContain("Expected scenario");
    expect(options).toContain("Cost row: Salaries");
    // Price is chosen in the first row, so not offered again.
    expect(options).not.toContain("Price");
    await user.click(
      screen.getByRole("option", { name: "Cost row: Salaries" }),
    );
    await waitFor(() =>
      expect(
        sent(calls, "PATCH", `/template-questions/${promptId}`).at(-1)?.body,
      ).toEqual({
        options: {
          kind: "linked_metric",
          metricKeys: ["selling_price", "cost_row:monthly.salaries"],
        },
      }),
    );
  });

  test("a self analysis: the AI prompt, and a subtitle", async () => {
    const user = userEvent.setup();
    const whyId = "1a2b3c4d-0000-4000-8000-000000000030";
    const { calls } = draftApi({
      ...validation(),
      kind: "self_analysis",
      aiPrompt: "Ask me one question at a time.",
      checkRules: [],
      costRows: [],
      costDefaults: [],
      sections: [
        {
          id: whyId,
          key: "WHY",
          part: null,
          title: "WHY",
          subtitle: null,
          guidance: null,
          sortOrder: 0,
          questions: [
            question("1a2b3c4d-0000-4000-8000-000000000031", "SA.WHY.1", "Q1", {
              hasFau: false,
            }),
          ],
        },
      ],
    });
    const router = open("ai-prompt");
    const prompt = await screen.findByRole("textbox", { name: "AI prompt" });
    await user.type(prompt, " Then summarize.");
    await user.tab();
    await waitFor(() =>
      expect(sent(calls, "PATCH", draftId).at(-1)?.body).toEqual({
        aiPrompt: "Ask me one question at a time. Then summarize.",
      }),
    );
    await router.navigate({ to: ".", search: { node: whyId } });
    await user.type(
      await screen.findByRole("textbox", { name: /^Subtitle/ }),
      "Why do I want this?",
    );
    await user.tab();
    await waitFor(() =>
      expect(
        sent(calls, "PATCH", `/template-sections/${whyId}`).at(-1)?.body,
      ).toEqual({ subtitle: "Why do I want this?" }),
    );
  });
});

describe("27: adding, deleting and reordering in the tree (design-spec 6.17)", () => {
  test("Add section: key and title, then the new section is chosen", async () => {
    const user = userEvent.setup();
    const { calls } = draftApi();
    const router = open();
    await user.click(
      await screen.findByRole("button", { name: "Add section" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Add section" });
    const key = within(dialog).getByRole("textbox", { name: /^Key/ });
    await user.type(key, "01");
    expect(
      await within(dialog).findByText("Already used. Enter a different value."),
    ).toBeTruthy();
    await user.clear(key);
    await user.type(key, "10");
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Title/ }),
      "Judgment",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Add section" }),
    );
    await waitFor(() =>
      expect(sent(calls, "POST", "/sections").at(-1)?.body).toEqual({
        key: "10",
        title: "Judgment",
      }),
    );
    await waitFor(() =>
      expect(router.state.location.search.node).toMatch(/^1a2b3c4d/),
    );
    expect(
      await screen.findByRole("heading", { level: 2, name: "Judgment" }),
    ).toBeTruthy();
  });

  test("Add question: the next ID offered, then the new question is chosen", async () => {
    const user = userEvent.setup();
    const { calls } = draftApi();
    const router = open(secondId);
    await screen.findByRole("heading", { level: 2, name: "Return" });
    await user.click(
      screen.getByRole("button", { name: "More actions for 08 Return" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Add question" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Add a question to Return",
    });
    const key = within(dialog).getByRole("textbox", {
      name: /^Question ID/,
    }) as HTMLInputElement;
    // WORTH is not a number: the ID starts as the section's part.
    expect(key.value).toBe("V.08.");
    await user.type(key, "PAYBACK");
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Title/ }),
      "PAYBACK",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Question(?! ID)/ }),
      "How soon does it pay back?",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Add question" }),
    );
    await waitFor(() =>
      expect(
        sent(calls, "POST", `/template-sections/${secondId}/questions`).at(-1)
          ?.body,
      ).toEqual({
        key: "V.08.PAYBACK",
        title: "PAYBACK",
        prompt: "How soon does it pay back?",
        answerType: "long_text",
      }),
    );
    expect(
      await screen.findByRole("heading", { level: 2, name: "PAYBACK" }),
    ).toBeTruthy();
    expect(router.state.location.search.node).toMatch(/^1a2b3c4d/);
  });

  test("Delete question asks, then deletes and closes its detail", async () => {
    const user = userEvent.setup();
    const { calls, current } = draftApi();
    const router = open(oceanId);
    await screen.findByRole("heading", { level: 2, name: "OCEAN" });
    await user.click(
      screen.getByRole("button", { name: "More actions for V.01.OCEAN OCEAN" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete question" }),
    );
    const ask = await screen.findByRole("alertdialog", {
      name: "Delete V.01.OCEAN OCEAN?",
    });
    expect(
      within(ask).getByText(
        "This can't be undone. Published versions keep it.",
      ),
    ).toBeTruthy();
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        sent(calls, "DELETE", `/template-questions/${oceanId}`),
      ).toHaveLength(1),
    );
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(current().sections[0]?.questions.map((q) => q.key)).toEqual([
      "V.01.WHO",
    ]);
    // The ⋯ went with the question: the keyboard is on the tree.
    await waitFor(() =>
      expect(
        screen
          .getByRole("treegrid", {
            name: "Sections and questions of Validation",
          })
          .contains(document.activeElement),
      ).toBe(true),
    );
  });

  test("Delete section says its questions go with it", async () => {
    const user = userEvent.setup();
    draftApi();
    open(firstId);
    await screen.findByRole("heading", {
      level: 2,
      name: "Customer & Problem",
    });
    await user.click(
      screen.getByRole("button", {
        name: "More actions for 01 Customer & Problem",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete section" }),
    );
    expect(
      await screen.findByText(
        "Its 2 questions are deleted with it. This can't be undone.",
      ),
    ).toBeTruthy();
  });

  test("Reorder questions: one moved up past its section's top goes to the section before", async () => {
    const user = userEvent.setup();
    const { calls } = draftApi();
    open(worthId);
    await screen.findByRole("heading", { level: 2, name: "WORTH" });
    await user.click(
      screen.getByRole("button", { name: "More actions for V.08.WORTH WORTH" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Reorder questions" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Reorder questions",
    });
    const save = within(dialog).getByRole("button", { name: "Save order" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await user.click(
      within(dialog).getByRole("button", { name: "Move V.08.WORTH WORTH up" }),
    );
    expect(within(dialog).getByText("No questions")).toBeTruthy();
    await user.click(save);
    await waitFor(() =>
      expect(sent(calls, "PUT", "/order").at(-1)?.body).toEqual({
        sections: [
          { id: firstId, questionIds: [whoId, oceanId, worthId] },
          { id: secondId, questionIds: [] },
        ],
      }),
    );
  });

  test("Reorder questions: one moved down past the last section's bottom goes into an empty section", async () => {
    const user = userEvent.setup();
    const start = validation();
    const emptyId = "1a2b3c4d-0000-4000-8000-000000000040";
    start.sections.push({
      id: emptyId,
      key: "10",
      part: null,
      title: "Final",
      subtitle: null,
      guidance: null,
      sortOrder: 2,
      questions: [],
    });
    const { calls } = draftApi(start);
    open(worthId);
    await screen.findByRole("heading", { level: 2, name: "WORTH" });
    await user.click(
      screen.getByRole("button", { name: "More actions for V.08.WORTH WORTH" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Reorder questions" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Reorder questions",
    });
    const down = within(dialog).getByRole("button", {
      name: "Move V.08.WORTH WORTH down",
    }) as HTMLButtonElement;
    expect(down.disabled).toBe(false);
    await user.click(down);
    // Now last of the last section (drawn under it anew): down goes nowhere.
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Move V.08.WORTH WORTH down",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(
      within(dialog).getByRole("button", { name: "Save order" }),
    );
    await waitFor(() =>
      expect(sent(calls, "PUT", "/order").at(-1)?.body).toEqual({
        sections: [
          { id: firstId, questionIds: [whoId, oceanId] },
          { id: secondId, questionIds: [] },
          { id: emptyId, questionIds: [worthId] },
        ],
      }),
    );
  });

  test("Reorder sections sends each section with its questions", async () => {
    const user = userEvent.setup();
    const { calls } = draftApi();
    open(secondId);
    await screen.findByRole("heading", { level: 2, name: "Return" });
    await user.click(
      screen.getByRole("button", { name: "More actions for 08 Return" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Reorder sections" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Reorder sections",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Move 08 Return up" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save order" }),
    );
    await waitFor(() =>
      expect(sent(calls, "PUT", "/order").at(-1)?.body).toEqual({
        sections: [
          { id: secondId, questionIds: [worthId] },
          { id: firstId, questionIds: [whoId, oceanId] },
        ],
      }),
    );
  });

  test("a list changed while ordering is read again, as 6.10 does", async () => {
    const user = userEvent.setup();
    let refused = false;
    draftApi(validation(), {
      answer: (call) => {
        if (call.method !== "PUT" || refused) return undefined;
        refused = true;
        return apiError(422, "VALIDATION_FAILED", {
          details: [{ path: "sections", code: "custom" }],
        });
      },
    });
    open(secondId);
    await screen.findByRole("heading", { level: 2, name: "Return" });
    await user.click(
      screen.getByRole("button", { name: "More actions for 08 Return" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Reorder sections" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Reorder sections",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Move 08 Return up" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save order" }),
    );
    expect(
      await within(dialog).findByText(
        "The list changed while you were ordering it. Check the order and save again.",
      ),
    ).toBeTruthy();
  });
});

describe("27: the preview (design-spec 6.17「プレビュー」)", () => {
  test("the section as 11 shows it, read only", async () => {
    const user = userEvent.setup();
    draftApi();
    open(whoId);
    await screen.findByRole("heading", { level: 2, name: "WHO" });
    await user.click(screen.getByRole("button", { name: "Preview" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Preview: Customer & Problem",
    });
    expect(within(dialog).getByText("Who is it for?")).toBeTruthy();
    const answer = within(dialog).getByRole("textbox", {
      name: "Answer to WHO",
    }) as HTMLTextAreaElement;
    expect(answer.readOnly).toBe(true);
    expect(answer.placeholder).toBe("Write your answer…");
    expect(
      within(dialog).getByText("Office workers who buy pasalubong"),
    ).toBeTruthy();
    const ocean = within(dialog).getByRole("radiogroup", {
      name: "Answer to OCEAN",
    });
    expect(
      within(ocean)
        .getAllByRole("radio")
        .map((radio) => (radio as HTMLInputElement).value),
    ).toEqual(["Red", "Blue", "Mixed"]);
  });

  test("a published version: Preview, and no ⋯ or fields", async () => {
    draftApi({ ...validation(), status: "published" });
    open(whoId);
    await screen.findByRole("heading", { level: 2, name: "WHO" });
    expect(screen.getByRole("button", { name: "Preview" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /More actions/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /^Title/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add section" })).toBeNull();
  });
});
