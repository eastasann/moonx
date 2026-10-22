import type { ImportContext, Me, Role } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  exported,
  planContext,
  selfAnalysisContext,
  validationContext,
} from "../test/ai";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import { home, validationId } from "../test/validation";

// 24 Export for AI (design-spec 6.6).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ideaHref = `/w/${workspaceId}/ideas/${home.idea.id}`;
const exportPath = (search: string) => `/w/${workspaceId}/ai/export?${search}`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

/** The API of 24: X2 answers `context`, X1 `exportCall` or an export. */
function exportApi({
  me = ana,
  context = validationContext(),
  exportCall,
}: {
  me?: Me;
  context?: ImportContext;
  exportCall?: (call: Call) => Response | undefined;
} = {}) {
  return stubApi((call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (method === "GET" && path.startsWith("/api/v1/ai/import/context?")) {
      return Response.json(context);
    }
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${home.idea.id}/validation`
    ) {
      return Response.json(home);
    }
    if (method === "GET" && path.startsWith("/api/v1/ai/export?")) {
      return exportCall?.(call) ?? Response.json(exported());
    }
    return undefined;
  });
}

const exportCalls = (calls: Call[]) =>
  calls.filter(({ path }) => path.startsWith("/api/v1/ai/export?"));

const nextButton = () => screen.getByRole("button", { name: "Next" });

describe("24 Export for AI (design-spec 6.6)", () => {
  test("① opens on the scope the link names; ② previews the export as Markdown or JSON", async () => {
    const user = userEvent.setup();
    const calls = exportApi();
    renderApp(
      exportPath(
        `source=validation&id=${validationId}&scope=01&returnTo=${encodeURIComponent(ideaHref)}`,
      ),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Export for AI" }),
    ).toBeTruthy();
    expect(
      await screen.findByText(`${home.idea.name} · validation questions`),
    ).toBeTruthy();
    const sections = screen.getByRole("group", { name: "Sections" });
    expect(
      (
        within(sections).getByRole("checkbox", {
          name: "01 Customer & Problem",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (
        within(sections).getByRole("checkbox", {
          name: "02 Market",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    // Nothing is exported before ②: each export counts (SDD 7.2).
    expect(exportCalls(calls)).toHaveLength(0);
    await user.click(nextButton());
    const preview = await screen.findByRole("region", { name: "Preview" });
    await waitFor(() =>
      expect(preview.textContent).toContain("## [V.01.WHO] WHO"),
    );
    expect(exportCalls(calls)[0]?.path).toBe(
      `/api/v1/ai/export?source=validation&id=${validationId}&sections=01&includeEmpty=true&includeExamples=true&includeReference=true`,
    );
    await user.click(screen.getByRole("radio", { name: "JSON" }));
    expect(
      screen.getByRole("region", { name: "Preview" }).textContent,
    ).toContain('"format": "moonx-export"');
    expect(
      screen.getByRole("link", { name: home.idea.name }).getAttribute("href"),
    ).toBe(ideaHref);
  });

  test("every section ticked is the whole; none ticked holds Next with its reason; options go with it", async () => {
    const user = userEvent.setup();
    const calls = exportApi();
    renderApp(exportPath(`source=validation&id=${validationId}`));
    const sections = await screen.findByRole("group", { name: "Sections" });
    for (const box of within(sections).getAllByRole("checkbox")) {
      expect((box as HTMLInputElement).checked).toBe(true);
    }
    for (const box of within(sections).getAllByRole("checkbox")) {
      await user.click(box);
    }
    expect(screen.getByText("Choose at least one section")).toBeTruthy();
    expect(nextButton().hasAttribute("disabled")).toBe(true);
    await user.click(
      within(sections).getByRole("checkbox", { name: "10 Final Assessment" }),
    );
    await user.click(
      within(sections).getByRole("checkbox", { name: "01 Customer & Problem" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Include empty questions" }),
    );
    await user.click(nextButton());
    await waitFor(() => expect(exportCalls(calls)).toHaveLength(1));
    // In template order, whatever order they were ticked in.
    expect(exportCalls(calls)[0]?.path).toContain(
      "sections=01&sections=10&includeEmpty=false",
    );
  });

  test("③ copies and downloads both formats, and goes on to 25 with the same scope", async () => {
    const user = userEvent.setup();
    exportApi();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this.download);
    });
    const router = renderApp(
      exportPath(
        `source=validation&id=${validationId}&scope=01&returnTo=${encodeURIComponent(ideaHref)}`,
      ),
    );
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await screen.findByRole("region", { name: "Preview" });
    await waitFor(() =>
      expect(nextButton().hasAttribute("disabled")).toBe(false),
    );
    await user.click(nextButton());
    await user.click(
      await screen.findByRole("button", { name: "Copy Markdown" }),
    );
    expect(await screen.findByText("Copied")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(exported().markdown);
    await user.click(screen.getByRole("button", { name: "Copy JSON" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText.mock.calls[1]).toEqual([
      `${JSON.stringify(exported().json, null, 2)}\n`,
    ]);
    await user.click(screen.getByRole("button", { name: "Download .md" }));
    await user.click(screen.getByRole("button", { name: "Download .json" }));
    expect(clicks).toEqual([
      `${exported().fileBaseName}.md`,
      `${exported().fileBaseName}.json`,
    ]);
    await user.click(screen.getByRole("button", { name: "Import from AI" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ai/import`,
      ),
    );
    expect(router.state.location.search).toMatchObject({
      target: "validation",
      id: validationId,
      scope: "01",
      returnTo: ideaHref,
    });
  });

  test("a copy the browser refuses says to download instead", async () => {
    const user = userEvent.setup();
    exportApi();
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: () => Promise.reject(new Error("denied")) },
    });
    renderApp(exportPath(`source=validation&id=${validationId}`));
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await screen.findByRole("region", { name: "Preview" });
    await waitFor(() =>
      expect(nextButton().hasAttribute("disabled")).toBe(false),
    );
    await user.click(nextButton());
    await user.click(
      await screen.findByRole("button", { name: "Copy Markdown" }),
    );
    expect(
      await screen.findByText("Couldn't copy. Use Download instead."),
    ).toBeTruthy();
  });

  test("every answer empty: exported with the notice", async () => {
    const user = userEvent.setup();
    exportApi({
      exportCall: () =>
        Response.json(exported({ allEmpty: true, questionCount: 0 })),
    });
    renderApp(exportPath(`source=validation&id=${validationId}`));
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("All questions are empty")).toBeTruthy();
  });

  test("too many exports: the wait, and Retry", async () => {
    const user = userEvent.setup();
    let limited = true;
    const calls = exportApi({
      exportCall: () =>
        limited
          ? apiError(429, "RATE_LIMITED", { retryAfterSeconds: 120 })
          : undefined,
    });
    renderApp(exportPath(`source=validation&id=${validationId}`));
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("Couldn't export")).toBeTruthy();
    expect(screen.getByText(/Too many attempts\. Try again in/)).toBeTruthy();
    limited = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("region", { name: "Preview" });
    expect(exportCalls(calls)).toHaveLength(2);
  });

  test("a plan: the whole, a part or items; items need one with a question to answer", async () => {
    const user = userEvent.setup();
    const plan = planContext();
    const calls = exportApi({ context: plan });
    renderApp(exportPath(`source=business_plan&id=${plan.target.id}&scope=16`));
    expect(await screen.findByText(`${home.idea.name} · Plan A`)).toBeTruthy();
    expect(
      (screen.getByRole("radio", { name: "Choose items" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    const items = screen.getByRole("group", { name: "Items" });
    await user.click(
      within(items).getByRole("checkbox", { name: "16 Go-to-Market" }),
    );
    expect(screen.getByText("Choose at least one item")).toBeTruthy();
    // A table item is offered for its Reference, but alone it has nothing to answer.
    await user.click(
      within(items).getByRole("checkbox", { name: "11 Founders" }),
    );
    expect(
      screen.getByText("Choose at least one item with a question to answer"),
    ).toBeTruthy();
    expect(nextButton().hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("radio", { name: "Part A" }));
    expect(
      screen.getByRole("checkbox", {
        name: "Include reference (key numbers and tables)",
      }),
    ).toBeTruthy();
    await user.click(nextButton());
    await waitFor(() => expect(exportCalls(calls)).toHaveLength(1));
    expect(exportCalls(calls)[0]?.path).toContain(
      `source=business_plan&id=${plan.target.id}&part=a&`,
    );
  });

  test("a plan's crumbs and way back lead to its 20", async () => {
    const plan = planContext();
    exportApi({ context: plan });
    renderApp(exportPath(`source=business_plan&id=${plan.target.id}`));
    await screen.findByText(`${home.idea.name} · Plan A`);
    const planHref = `${ideaHref}/plans/${plan.target.id}`;
    expect(
      screen.getByRole("link", { name: "Plan A" }).getAttribute("href"),
    ).toBe(planHref);
    expect(
      screen.getByRole("link", { name: home.idea.name }).getAttribute("href"),
    ).toBe(ideaHref);
  });

  test("a self-analysis: no Reference, no id, no idea in the crumbs", async () => {
    const user = userEvent.setup();
    const calls = exportApi({ context: selfAnalysisContext() });
    renderApp(exportPath("source=self_analysis"));
    expect(await screen.findByText("Self analysis")).toBeTruthy();
    expect(
      screen.getByRole("checkbox", { name: "PERSONAL INCOME" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("checkbox", { name: /Include reference/ }),
    ).toBeNull();
    await user.click(nextButton());
    await waitFor(() => expect(exportCalls(calls)).toHaveLength(1));
    expect(exportCalls(calls)[0]?.path).toBe(
      "/api/v1/ai/export?source=self_analysis&includeEmpty=true&includeExamples=true&includeReference=false",
    );
    expect(
      calls.find(({ path }) => path.startsWith("/api/v1/ai/import/context"))
        ?.path,
    ).toBe("/api/v1/ai/import/context?target=self_analysis");
  });

  test("an archived idea or plan: the notice and no scope", async () => {
    exportApi({ context: validationContext({ archived: true }) });
    renderApp(exportPath(`source=validation&id=${validationId}`));
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Sections" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  test("only the plan archived says so", async () => {
    const plan = planContext(true);
    exportApi({ context: plan });
    renderApp(exportPath(`source=business_plan&id=${plan.target.id}`));
    expect(await screen.findByText("This plan is archived")).toBeTruthy();
  });

  test("a Viewer cannot enter; another workspace's validation is not shown", async () => {
    const calls = exportApi({ me: as("viewer") });
    renderApp(exportPath(`source=validation&id=${validationId}`));
    expect(
      await screen.findByRole("heading", {
        name: "You don't have access to this",
      }),
    ).toBeTruthy();
    expect(calls.some(({ path }) => path.startsWith("/api/v1/ai/"))).toBe(
      false,
    );
    vi.unstubAllGlobals();
    exportApi({
      context: validationContext({
        workspaceId: "0b6b1f4e-0000-4000-8000-000000000009",
      }),
    });
    renderApp(exportPath(`source=validation&id=${validationId}`));
    expect(
      (
        await screen.findAllByRole("heading", {
          name: "You don't have access to this",
        })
      ).length,
    ).toBeGreaterThan(0);
  });

  test("a link without its target is not found", async () => {
    exportApi();
    renderApp(exportPath("source=validation"));
    expect(
      await screen.findByRole("heading", {
        name: "Not found. Check the link.",
      }),
    ).toBeTruthy();
  });

  test("a Viewer's own self-analysis opens in their personal workspace", async () => {
    const personal = {
      id: "1d2c3b4a-0000-4000-8000-00000000000a",
      name: "Ana's workspace",
      isPersonal: true,
      currency: "PHP",
    };
    const me: Me = {
      ...ana,
      memberships: [
        ...as("viewer").memberships,
        { workspace: personal, role: "owner" },
      ],
    };
    exportApi({ me, context: selfAnalysisContext() });
    const router = renderApp(exportPath("source=self_analysis"));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${personal.id}/ai/export`,
      ),
    );
    expect(await screen.findByText("Self analysis")).toBeTruthy();
  });
});
