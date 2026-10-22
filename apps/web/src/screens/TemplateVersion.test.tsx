import type {
  AdminTemplateList,
  TemplateCheckResult,
  TemplateVersionDetail,
} from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { operator } from "../test/admin";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";

// 27 Admin: Edit Template (design-spec 6.17): the tree, the check and Publish.

afterEach(() => {
  vi.unstubAllGlobals();
});

const draftId = "61d51f65-95e4-4c30-84d8-0627102fc142";
const sectionId = "1a2b3c4d-0000-4000-8000-000000000001";
const whoId = "1a2b3c4d-0000-4000-8000-000000000002";
const oceanId = "1a2b3c4d-0000-4000-8000-000000000003";

const question = (
  id: string,
  key: string,
  title: string,
  extra: Partial<
    TemplateVersionDetail["sections"][number]["questions"][number]
  > = {},
) => ({
  id,
  key,
  sectionKey: "01",
  title,
  prompt: `${title}?`,
  example: null,
  hint: null,
  answerType: "long_text" as const,
  options: null,
  displayCondition: null,
  hasFau: true,
  sortOrder: 0,
  copyFrom: null,
  reference: null,
  isKeyPublished: false,
  ...extra,
});

const draft: TemplateVersionDetail = {
  id: draftId,
  kind: "validation",
  versionNumber: 3,
  status: "draft",
  aiPrompt: "",
  name: "Business Idea & Validation",
  sections: [
    {
      id: sectionId,
      key: "01",
      part: null,
      title: "Customer & Problem",
      subtitle: null,
      guidance: "Who is it for?",
      sortOrder: 0,
      questions: [
        question(whoId, "V.01.WHO", "WHO"),
        question(oceanId, "V.01.OCEAN", "OCEAN", {
          answerType: "choice",
          options: { kind: "choice", choices: ["Red", "Blue", "Mixed"] },
          displayCondition: { "V.01.WHO": ["Yes"] },
        }),
      ],
    },
  ],
  costDefaults: [
    {
      id: "1a2b3c4d-0000-4000-8000-000000000010",
      category: "initial",
      key: "equipment",
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
    { checkKey: "permits", params: { researchLogs: 1 } },
    { checkKey: "demand_signal", params: { researchLogs: 1 } },
  ],
  executionPresets: [],
};

const published: TemplateVersionDetail = {
  ...draft,
  id: "30ff1813-45b2-4411-bcf7-dac675012e19",
  versionNumber: 2,
  status: "published",
};

const list: AdminTemplateList = {
  items: [
    { kind: "self_analysis", name: null, versions: [] },
    {
      kind: "validation",
      name: "Business Idea & Validation",
      versions: [
        {
          id: draft.id,
          versionNumber: 3,
          status: "draft",
          publishedAt: null,
          publishedBy: null,
          usageCount: 0,
        },
        {
          id: published.id,
          versionNumber: 2,
          status: "published",
          publishedAt: "2026-10-01T02:00:00.000Z",
          publishedBy: {
            id: operator.id,
            displayName: "Moonx Admin",
            avatarUrl: null,
            badge: null,
          },
          usageCount: 8,
        },
      ],
    },
    { kind: "business_plan", name: null, versions: [] },
  ],
};

const clean: TemplateCheckResult = { errors: [], warnings: [] };

function versionApi({
  me = operator,
  versions = [draft, published],
  check = clean,
  answer,
}: {
  me?: typeof operator;
  versions?: TemplateVersionDetail[];
  check?: TemplateCheckResult;
  answer?: (call: Call) => Response | undefined;
} = {}) {
  return stubApi((call) => {
    const answered = answer?.(call);
    if (answered !== undefined) return answered;
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "GET" && path === "/api/v1/admin/templates") {
      return Response.json(list);
    }
    for (const version of versions) {
      const base = `/api/v1/admin/template-versions/${version.id}`;
      if (method === "GET" && path === base) return Response.json(version);
      if (method === "POST" && path === `${base}/validate`) {
        return Response.json(check);
      }
    }
    if (
      method === "GET" &&
      path.startsWith("/api/v1/admin/template-versions/")
    ) {
      return apiError(404, "NOT_FOUND");
    }
    return undefined;
  });
}

const treeOf = async () =>
  screen.findByRole("treegrid", {
    name: "Sections and questions of Validation",
  });

describe("27 Admin: Edit Template (design-spec 6.17)", () => {
  test("a draft: its sections and settings in the tree, the chosen question beside it", async () => {
    const user = userEvent.setup();
    versionApi();
    const router = renderApp(`/admin/templates/versions/${draftId}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Validation v3" }),
    ).toBeTruthy();
    const tree = await treeOf();
    expect(within(tree).getByText("Customer & Problem")).toBeTruthy();
    expect(within(tree).getByText("Template name")).toBeTruthy();
    expect(within(tree).getByText("Starting cost rows")).toBeTruthy();
    expect(within(tree).getByText("Check thresholds")).toBeTruthy();
    // Only a self analysis holds an AI prompt; only a plan its execution rows.
    expect(within(tree).queryByText("AI prompt")).toBeNull();
    expect(within(tree).queryByText("Starting execution rows")).toBeNull();
    expect(
      screen.getByRole("heading", {
        name: "Choose a section, question or setting to see it",
      }),
    ).toBeTruthy();
    await user.click(
      within(tree).getByRole("button", {
        name: "Expand 01 Customer & Problem",
      }),
    );
    await user.click(within(tree).getByText("OCEAN"));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ node: oceanId }),
    );
    expect(
      await screen.findByRole("heading", { level: 2, name: "OCEAN" }),
    ).toBeTruthy();
    // A draft's node is edited beside the tree (design-spec 6.17「下書きの編集」).
    const value = (name: string) =>
      (
        screen.getByRole("textbox", {
          name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`),
        }) as HTMLInputElement
      ).value;
    expect(value("Question ID")).toBe("V.01.OCEAN");
    expect(value("Choice 1")).toBe("Red");
    expect(value("Choice 3")).toBe("Mixed");
    expect(value("When the answer is (one per line)")).toBe("Yes");
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Ask for F/A/U (Fact, Assumption or Unknown)",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(document.title).toBe("Edit Template · moonx");
  });

  test("a published version's setting from the URL: the thresholds as they stand", async () => {
    versionApi();
    renderApp(`/admin/templates/versions/${published.id}?node=check-rules`);
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Check thresholds",
      }),
    ).toBeTruthy();
    const local = screen.getByRole("list", { name: "Local price range" });
    expect(within(local).getByText("Competitors with a price")).toBeTruthy();
    expect(within(local).getByText("2")).toBeTruthy();
  });

  test("a node of another kind or version selects nothing", async () => {
    versionApi();
    renderApp(`/admin/templates/versions/${draftId}?node=ai-prompt`);
    expect(
      await screen.findByRole("heading", {
        name: "Choose a section, question or setting to see it",
      }),
    ).toBeTruthy();
  });

  test("problems block Publish; Check lists them, each moving to its node in the tree", async () => {
    const user = userEvent.setup();
    versionApi({
      check: {
        errors: [
          {
            code: "options_mismatch",
            message: "A choice question needs its choices",
            nodeId: oceanId,
          },
          {
            code: "no_questions",
            message: "The template has no questions",
            nodeId: null,
          },
        ],
        warnings: [{ code: "removed_keys", keys: ["V.01.WHY"] }],
      },
    });
    const router = renderApp(`/admin/templates/versions/${draftId}`);
    expect(
      await screen.findByText("Fix 2 problems on Check to publish"),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Publish as v3",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(screen.getByRole("tab", { name: "Check (2)" }));
    const problems = screen.getByRole("grid", {
      name: "Problems before publishing",
    });
    // In the catalog's words, not AD6's message for developers (SDD 9章).
    expect(within(problems).getAllByRole("row")).toHaveLength(1);
    expect(within(problems).getByText("In V.01.OCEAN OCEAN")).toBeTruthy();
    expect(
      screen.queryByText("A choice question needs its choices"),
    ).toBeNull();
    // What points to no node is told under the list, not as a row to press.
    expect(screen.getByText("The template has no questions")).toBeTruthy();
    expect(screen.getByText("In the whole template")).toBeTruthy();
    expect(
      screen.getByText("Removed since the last version: V.01.WHY"),
    ).toBeTruthy();
    await user.click(
      within(problems).getByText(
        "The choices, columns or key numbers don't fit the answer type",
      ),
    );
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ node: oceanId }),
    );
    // Back on the tree, the question's branch open and the question chosen.
    const tree = await treeOf();
    expect(
      within(tree)
        .getAllByRole("row")
        .find((row) => row.getAttribute("aria-selected") === "true")
        ?.textContent,
    ).toContain("OCEAN");
  });

  test("Publish as v3: asked first, then published, back on 26", async () => {
    const user = userEvent.setup();
    const calls = versionApi({
      answer: (call) =>
        call.method === "POST" && call.path.endsWith(`${draftId}/publish`)
          ? Response.json({
              versionNumber: 3,
              publishedAt: "2026-10-22T02:00:00.000Z",
            })
          : undefined,
    });
    const router = renderApp(`/admin/templates/versions/${draftId}`);
    const publish = await screen.findByRole("button", {
      name: "Publish as v3",
    });
    await waitFor(() =>
      expect((publish as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(publish);
    const dialog = await screen.findByRole("alertdialog", {
      name: "Publish as v3?",
    });
    expect(
      within(dialog).getByText(
        "Answers already written don't change. People on an earlier version can move to v3 when they choose.",
      ),
    ).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(router.state.location.href).toBe(
        "/admin/templates?kind=validation",
      ),
    );
    expect(
      calls.filter((call) => call.path.endsWith(`${draftId}/publish`)),
    ).toHaveLength(1);
    expect(await screen.findByText("Validation v3 is published")).toBeTruthy();
  });

  test("a refused publish says why and reads the check again", async () => {
    const user = userEvent.setup();
    const calls = versionApi({
      answer: (call) =>
        call.method === "POST" && call.path.endsWith(`${draftId}/publish`)
          ? apiError(422, "TEMPLATE_INVALID")
          : undefined,
    });
    renderApp(`/admin/templates/versions/${draftId}`);
    const publish = await screen.findByRole("button", {
      name: "Publish as v3",
    });
    await waitFor(() =>
      expect((publish as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(publish);
    await user.click(
      within(
        await screen.findByRole("alertdialog", { name: "Publish as v3?" }),
      ).getByRole("button", {
        name: "Publish",
      }),
    );
    expect(
      await screen.findByText(
        "This version has problems. Fix them on Check, then publish.",
      ),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path.endsWith(`${draftId}/validate`)),
      ).toHaveLength(2),
    );
  });

  test("a published version only shows: no Publish, no check", async () => {
    const calls = versionApi();
    renderApp(`/admin/templates/versions/${published.id}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Validation v2" }),
    ).toBeTruthy();
    expect(
      await screen.findByText("Published Oct 1 by Moonx Admin"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "A published version can't be changed. Start a new draft from it on Templates.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Publish/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Check" })).toBeNull();
    expect(calls.some((call) => call.path.endsWith("/validate"))).toBe(false);
  });

  test("a version that does not exist: Not found, with no screen name", async () => {
    versionApi();
    renderApp("/admin/templates/versions/00000000-0000-4000-8000-000000000000");
    expect(
      await screen.findByRole("heading", {
        name: "Not found. Check the link.",
      }),
    ).toBeTruthy();
    expect(document.title).toBe("moonx");
    expect(screen.queryByText("Edit Template")).toBeNull();
  });

  test("a published version whose 26 list cannot be read says so, with Retry", async () => {
    const user = userEvent.setup();
    let fails = true;
    versionApi({
      answer: (call) =>
        call.path === "/api/v1/admin/templates" && fails
          ? apiError(500, "INTERNAL")
          : undefined,
    });
    renderApp(`/admin/templates/versions/${published.id}`);
    expect(
      await screen.findByText("Couldn't load when it was published.", {
        exact: false,
      }),
    ).toBeTruthy();
    fails = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("Published Oct 1 by Moonx Admin"),
    ).toBeTruthy();
  });

  test("anyone but an operator: no access, nothing read", async () => {
    const calls = versionApi({ me: ana });
    renderApp(`/admin/templates/versions/${draftId}`);
    expect(
      await screen.findByRole("heading", {
        name: "You don't have access to this",
      }),
    ).toBeTruthy();
    expect(calls.some((call) => call.path.startsWith("/api/v1/admin"))).toBe(
      false,
    );
  });
});
