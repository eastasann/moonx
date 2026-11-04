import type {
  Me,
  PlanHome,
  Role,
  SelfAnalysisHome,
  TemplateMigrationPreview,
  TemplateRef,
  ValidationHome,
} from "@moonx/schemas";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as sentry from "../lib/sentry";
import {
  ana,
  apiError,
  type Call,
  cleanupThenRestoreFocus,
  readAgainOnFocus,
  renderApp,
  stubApi,
  toastAfter,
} from "../test/api";
import { validationHome, workspaceId } from "../test/ideas";
import { planHome, planId, planPath, plans, versionId } from "../test/plans";
import { selfAnalysisId, selfHome } from "../test/selfAnalysis";

// The band of 10, 13 and 20 and M8 Update template (design-spec 6.0.1・6.0.7・3.8, SDD 4章
// `?modal=update-template&about=`, 5.12 T1・T2).

afterEach(() => {
  cleanupThenRestoreFocus();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const newer: TemplateRef = {
  versionId: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
  versionNumber: 1,
  newerVersion: {
    versionId: "6ba7b810-9dad-41d1-80b4-00c04fd43003",
    versionNumber: 3,
  },
};
const latest: TemplateRef = { ...newer, newerVersion: null };
const moved: TemplateRef = {
  versionId: "6ba7b810-9dad-41d1-80b4-00c04fd43003",
  versionNumber: 3,
  newerVersion: null,
};

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

const idea = (template: TemplateRef, archived = false): ValidationHome => ({
  ...validationHome({ archived }),
  template,
});
const ideaId = validationHome().idea.id;
const validationId = validationHome().validationId;
const ideaPath = (search = "") => `/w/${workspaceId}/ideas/${ideaId}${search}`;
const about = `validation:${validationId}`;
const migrations = "/api/v1/template-migrations";
const previewPath = (kind: string, id: string) =>
  `${migrations}/preview?targetType=${kind}&targetId=${id}`;

const preview: TemplateMigrationPreview = {
  from: { versionNumber: 1 },
  to: { versionId: "6ba7b810-9dad-41d1-80b4-00c04fd43003", versionNumber: 3 },
  carried: 12,
  hiddenQuestions: [
    {
      questionKey: "V.01.NON_CUSTOMER",
      title: "NON-CUSTOMER",
      hasAnswer: true,
    },
    { questionKey: "V.01.PROOF", title: "PROOF", hasAnswer: false },
  ],
  addedQuestions: 2,
  addedCostRows: ["Delivery bags", "Insurance"],
};

const migrated = () =>
  Response.json({
    batchId: "0b0b0b0b-0000-4000-8000-000000000001",
    template: moved,
  });

/** What the screens read now: the move made (`moved`) or the idea archived since. */
interface World {
  moved: boolean;
  archived: boolean;
}

/**
 * The API of 13, 20 and 10 with T1 and T2: `t1` and `t2` answer them (a promise holds T2
 * back) and may change `world`, which the screens' reads follow; a T2 that goes through
 * moves the template, and Restore on 13 takes the idea out of the archive. `held` holds
 * 13's next read back while it is set.
 */
function migrationApi({
  me = ana,
  home = idea(newer),
  plan = planHome({ template: newer }),
  self = selfHome({ template: newer }),
  t1 = () => Response.json(preview),
  t2 = migrated,
  archived = false,
}: {
  me?: Me;
  home?: ValidationHome;
  plan?: PlanHome;
  self?: SelfAnalysisHome;
  t1?: (call: Call, world: World) => Response | Promise<Response>;
  t2?: (call: Call, world: World) => Response | Promise<Response>;
  /** Whether the idea is archived when the test starts (`world.archived`). */
  archived?: boolean;
} = {}) {
  const world: World & { held?: Promise<void> } = { moved: false, archived };
  const now = <T extends { template: TemplateRef }>(data: T): T =>
    world.moved ? { ...data, template: moved } : data;
  const calls = stubApi((call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (method === "GET" && path === `/api/v1/ideas/${ideaId}/validation`) {
      return (async () => {
        await world.held;
        const read = now(home);
        return Response.json(
          world.archived
            ? { ...read, idea: { ...read.idea, archived: true } }
            : read,
        );
      })();
    }
    if (method === "POST" && path === `/api/v1/ideas/${ideaId}/restore`) {
      world.archived = false;
      return Response.json({});
    }
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${ideaId}/plans?includeArchived=true`
    ) {
      return Response.json({ items: plans });
    }
    if (method === "GET" && path === `/api/v1/plans/${planId}`) {
      return Response.json(now(plan));
    }
    if (
      method === "GET" &&
      path === `/api/v1/plans/${planId}?versionId=${versionId}`
    ) {
      return Response.json({
        ...plan,
        viewingVersion: {
          id: versionId,
          name: "v1 For advisors",
          savedAt: "2026-09-20T02:00:00.000Z",
        },
      });
    }
    if (method === "GET" && path === "/api/v1/me/self-analysis") {
      return Response.json(now(self));
    }
    if (method === "GET" && path.startsWith(`${migrations}/preview?`)) {
      return t1(call, world);
    }
    if (method === "POST" && path === migrations) {
      return (async () => {
        const answered = await t2(call, world);
        if (answered.ok) world.moved = true;
        return answered;
      })();
    }
    return undefined;
  });
  return { calls, world };
}

const previews = (calls: Call[]) =>
  calls.filter((call) => call.path.startsWith(`${migrations}/preview`));
const sends = (calls: Call[]) =>
  calls.filter((call) => call.method === "POST" && call.path === migrations);

const band = () =>
  screen
    .queryAllByRole("alert")
    .find((alert) =>
      alert.textContent?.includes("A newer template is available."),
    );

const ideaHeading = () =>
  screen.findByRole("heading", { level: 1, name: "Bacolod Health Bowl" });

/** Opens M8 from 13's band and waits for T1's preview in it. */
async function openFromBand(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(band()).toBeDefined());
  await user.click(
    within(band() as HTMLElement).getByRole("link", {
      name: "Update template",
    }),
  );
  return screen.findByRole("dialog", { name: "Update template" });
}

describe("the band (design-spec 6.0.7)", () => {
  test("13: the version the answers stay on, and Update template opens M8 about the validation", async () => {
    const user = userEvent.setup();
    const { calls } = migrationApi();
    const router = renderApp(ideaPath());
    await ideaHeading();
    await waitFor(() => expect(band()).toBeDefined());
    expect(band()?.textContent).toContain(
      "A newer template is available. Your answers stay on v1 until you update.",
    );
    await openFromBand(user);
    expect(router.state.location.search).toMatchObject({
      modal: "update-template",
      about,
    });
    await waitFor(() =>
      expect(previews(calls).map((call) => call.path)).toEqual([
        previewPath("validation", validationId),
      ]),
    );
  });

  test("13: none while the validation is on the newest version, and no ⋯ Update template", async () => {
    const user = userEvent.setup();
    migrationApi({ home: idea(latest) });
    renderApp(ideaPath());
    await ideaHeading();
    expect(band()).toBeUndefined();
    await user.click(
      screen.getByRole("button", { name: "More for Bacolod Health Bowl" }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Duplicate" }),
    ).toBeTruthy();
    expect(
      within(menu).queryByRole("menuitem", { name: "Update template" }),
    ).toBeNull();
  });

  test("13: ⋯ Update template opens M8 too", async () => {
    const user = userEvent.setup();
    migrationApi();
    renderApp(ideaPath());
    await user.click(
      await screen.findByRole("button", {
        name: "More for Bacolod Health Bowl",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Update template" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Update template" }),
    ).toBeTruthy();
  });

  test("13: a Viewer has none, and the URL opens no M8 for them: it comes off in place once 13 is read", async () => {
    const { calls } = migrationApi({ me: as("viewer") });
    const router = renderApp(ideaPath(`?modal=update-template&about=${about}`));
    await ideaHeading();
    expect(band()).toBeUndefined();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(previews(calls)).toEqual([]);
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(router.history.length).toBe(1);
  });

  test("13: an archived idea has none, not in ⋯ either, and the URL opens no M8 and comes off; Restore then opens none", async () => {
    const user = userEvent.setup();
    const { calls } = migrationApi({ archived: true });
    const router = renderApp(ideaPath(`?modal=update-template&about=${about}`));
    await screen.findByText("This idea is archived");
    expect(band()).toBeUndefined();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(previews(calls)).toEqual([]);
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(router.history.length).toBe(1);
    await user.click(
      screen.getByRole("button", { name: "More for Bacolod Health Bowl" }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Duplicate" }),
    ).toBeTruthy();
    expect(
      within(menu).queryByRole("menuitem", { name: "Update template" }),
    ).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Restore" }));
    // Read again as it is now: the band is back, and no M8 with it.
    await waitFor(() => expect(band()).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(previews(calls)).toEqual([]);
  });

  test("20: the band and ⋯ Update template open M8 about the plan", async () => {
    const user = userEvent.setup();
    const { calls } = migrationApi();
    const router = renderApp(planPath());
    await screen.findByRole("heading", { level: 1, name: "Plan A" });
    await waitFor(() => expect(band()).toBeDefined());
    await user.click(
      within(band() as HTMLElement).getByRole("link", {
        name: "Update template",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Update template" }),
    ).toBeTruthy();
    expect(router.state.location.search).toMatchObject({
      modal: "update-template",
      about: `business_plan:${planId}`,
    });
    await waitFor(() =>
      expect(previews(calls).map((call) => call.path)).toEqual([
        previewPath("business_plan", planId),
      ]),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "More for Plan A" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Update template" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Update template" }),
    ).toBeTruthy();
  });

  test("20: no ⋯ Update template while the plan is on the newest version", async () => {
    const user = userEvent.setup();
    migrationApi({ plan: planHome({ template: latest }) });
    renderApp(planPath());
    await screen.findByRole("heading", { level: 1, name: "Plan A" });
    expect(band()).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "More for Plan A" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Rename plan" }),
    ).toBeTruthy();
    expect(
      within(menu).queryByRole("menuitem", { name: "Update template" }),
    ).toBeNull();
  });

  test.each([
    ["a Viewer", { me: as("viewer") }, ""],
    [
      "an archived plan",
      { plan: planHome({ template: newer, archived: true }) },
      "",
    ],
    [
      "a plan of an archived idea",
      { plan: planHome({ template: newer, ideaArchived: true }) },
      "",
    ],
    ["a saved version", {}, `version=${versionId}&`],
  ])(
    "20: none for %s, and the URL opens no M8: it comes off in place once 20 is read",
    async (_, options, version) => {
      const { calls } = migrationApi(options);
      const router = renderApp(
        planPath(
          `?${version}modal=update-template&about=business_plan:${planId}`,
        ),
      );
      await screen.findByRole("heading", { level: 1, name: "Plan A" });
      expect(band()).toBeUndefined();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "More for Plan A" }),
      ).toBeNull();
      expect(previews(calls)).toEqual([]);
      // The saved version's parameter stays.
      await waitFor(() =>
        expect(router.state.location.search).toEqual(
          version === "" ? {} : { version: versionId },
        ),
      );
      expect(router.history.length).toBe(1);
    },
  );

  test("13: M8's URL while a cached read of an archived 13 is read again: kept until that read answers, which then opens M8", async () => {
    const { world } = migrationApi({ archived: true });
    const router = renderApp(ideaPath());
    await screen.findByText("This idea is archived");
    let release = () => {};
    world.held = new Promise<void>((resolve) => {
      release = resolve;
    });
    world.archived = false;
    readAgainOnFocus();
    await act(() =>
      router.navigate({
        href: ideaPath(`?modal=update-template&about=${about}`),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(router.state.location.search).toEqual({
      modal: "update-template",
      about,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    world.held = undefined;
    release();
    expect(
      await screen.findByRole("dialog", { name: "Update template" }),
    ).toBeTruthy();
    expect(router.state.location.search).toEqual({
      modal: "update-template",
      about,
    });
  });

  test("10: the owner's band opens M8 about their self-analysis", async () => {
    const user = userEvent.setup();
    const { calls } = migrationApi();
    const router = renderApp(`/w/${workspaceId}/self-analysis`);
    await openFromBand(user);
    expect(router.state.location.search).toMatchObject({
      modal: "update-template",
      about: `self_analysis:${selfAnalysisId}`,
    });
    await waitFor(() =>
      expect(previews(calls).map((call) => call.path)).toEqual([
        previewPath("self_analysis", selfAnalysisId),
      ]),
    );
  });
});

describe("M8 Update template (design-spec 6.0.7)", () => {
  test("what it keeps, adds and hides; Update template moves it, the band goes and it closes", async () => {
    const user = userEvent.setup();
    const { calls } = migrationApi();
    const router = renderApp(ideaPath());
    const dialog = await openFromBand(user);
    expect(
      await within(dialog).findByText("Move from v1 to v3 of the template."),
    ).toBeTruthy();
    const facts = within(dialog)
      .getAllByRole("term")
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    expect(facts).toEqual([
      ["Answers carried over", "12"],
      ["New questions", "2"],
      ["Cost rows added", "Delivery bags, Insurance"],
    ]);
    expect(
      within(dialog).getByRole("heading", { name: "Questions not in v3" }),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        "Answers to these questions stay saved but no longer show.",
      ),
    ).toBeTruthy();
    const hidden = within(
      within(dialog).getByRole("list", { name: "Questions not in v3" }),
    ).getAllByRole("listitem");
    expect(hidden.map((row) => row.textContent)).toEqual([
      "01 NON-CUSTOMERAnswered",
      "01 PROOFNo answer",
    ]);

    await user.click(
      within(dialog).getByRole("button", { name: "Update template" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sends(calls).map((call) => call.body)).toEqual([
      {
        targetType: "validation",
        targetId: validationId,
        toVersionId: preview.to.versionId,
      },
    ]);
    expect(await screen.findByText("Template updated to v3")).toBeTruthy();
    await waitFor(() => expect(band()).toBeUndefined());
    expect(router.state.location.search).not.toHaveProperty("modal");
  });

  test("a validation that adds no cost rows says None; nothing hidden says every question carries over", async () => {
    migrationApi({
      t1: () =>
        Response.json({ ...preview, hiddenQuestions: [], addedCostRows: [] }),
    });
    renderApp(ideaPath(`?modal=update-template&about=${about}`));
    const dialog = await screen.findByRole("dialog", {
      name: "Update template",
    });
    expect(
      await within(dialog).findByText("Every question carries over to v3."),
    ).toBeTruthy();
    expect(within(dialog).queryByRole("list")).toBeNull();
    expect(
      within(dialog).getByText("Cost rows added").nextElementSibling
        ?.textContent,
    ).toBe("None");
  });

  test("its counts group their thousands and are never cut to a badge's 99+ (design-spec 1.2)", async () => {
    migrationApi({
      t1: () =>
        Response.json({ ...preview, carried: 1234, addedQuestions: 120 }),
    });
    renderApp(ideaPath(`?modal=update-template&about=${about}`));
    const dialog = await screen.findByRole("dialog", {
      name: "Update template",
    });
    await within(dialog).findByText("Move from v1 to v3 of the template.");
    expect(
      within(dialog).getByText("Answers carried over").nextElementSibling
        ?.textContent,
    ).toBe("1,234");
    expect(
      within(dialog).getByText("New questions").nextElementSibling?.textContent,
    ).toBe("120");
  });

  test.each([
    [
      "a self-analysis",
      `/w/${workspaceId}/self-analysis`,
      "self_analysis",
      selfAnalysisId,
    ],
    ["a plan", planPath(), "business_plan", planId],
  ])("%s lists no cost rows", async (_, path, kind, id) => {
    migrationApi();
    renderApp(`${path}?modal=update-template&about=${kind}:${id}`);
    const dialog = await screen.findByRole("dialog", {
      name: "Update template",
    });
    await within(dialog).findByText("Move from v1 to v3 of the template.");
    expect(dialog.textContent).not.toContain("Cost rows added");
    expect(dialog.textContent).not.toContain("Delivery bags");
  });

  test.each([
    ["missing", "?modal=update-template"],
    ["another kind", `?modal=update-template&about=business_plan:${planId}`],
    [
      "another validation",
      "?modal=update-template&about=validation:1b4e28ba-2fa1-41d2-883f-0016d3cca400",
    ],
    [
      "the kind in capitals",
      `?modal=update-template&about=VALIDATION:${validationId}`,
    ],
  ])("an about %s opens nothing", async (_, search) => {
    const { calls } = migrationApi();
    renderApp(ideaPath(search));
    await ideaHeading();
    await waitFor(() => expect(band()).toBeDefined());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(previews(calls)).toEqual([]);
  });

  test("the id in capitals opens it, as the API reads ids", async () => {
    migrationApi();
    renderApp(
      ideaPath(
        `?modal=update-template&about=validation:${validationId.toUpperCase()}`,
      ),
    );
    expect(
      await screen.findByRole("dialog", { name: "Update template" }),
    ).toBeTruthy();
  });

  test("moved by someone else before it opened: the latest template, Close alone, and the band goes", async () => {
    const user = userEvent.setup();
    const { calls } = migrationApi({
      t1: (_call, world) => {
        world.moved = true;
        return apiError(409, "ALREADY_LATEST");
      },
    });
    const router = renderApp(ideaPath());
    const dialog = await openFromBand(user);
    expect(
      await within(dialog).findByText("You're already on the latest template"),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", { name: "Update template" }),
    ).toBeNull();
    expect(previews(calls)).toHaveLength(1);
    await waitFor(() => expect(band()).toBeUndefined());
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.search).not.toHaveProperty("modal");
  });

  test("moved by someone else while it was open: the latest template, and the band goes", async () => {
    const user = userEvent.setup();
    migrationApi({
      t2: (_call, world) => {
        world.moved = true;
        return apiError(409, "ALREADY_LATEST");
      },
    });
    renderApp(ideaPath());
    const dialog = await openFromBand(user);
    await within(dialog).findByText("Move from v1 to v3 of the template.");
    await user.click(
      within(dialog).getByRole("button", { name: "Update template" }),
    );
    expect(
      await within(dialog).findByText("You're already on the latest template"),
    ).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeTruthy();
    await waitFor(() => expect(band()).toBeUndefined());
  });

  test("a newer version published and moved to meanwhile: says so, shows the move now, and sends that", async () => {
    const user = userEvent.setup();
    const v4 = "6ba7b810-9dad-41d1-80b4-00c04fd43004";
    let reads = 0;
    const { calls } = migrationApi({
      t1: () => {
        reads += 1;
        return Response.json(
          reads === 1
            ? preview
            : {
                ...preview,
                from: { versionNumber: 3 },
                to: { versionId: v4, versionNumber: 4 },
              },
        );
      },
      t2: (call) =>
        (call.body as { toVersionId: string }).toVersionId === v4
          ? migrated()
          : apiError(422, "VALIDATION_FAILED", {
              details: [{ path: "toVersionId", code: "custom" }],
            }),
    });
    renderApp(ideaPath(`?modal=update-template&about=${about}`));
    const dialog = await screen.findByRole("dialog", {
      name: "Update template",
    });
    await within(dialog).findByText("Move from v1 to v3 of the template.");
    await user.click(
      within(dialog).getByRole("button", { name: "Update template" }),
    );
    expect(
      await within(dialog).findByText("Move from v3 to v4 of the template."),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        "The template changed since this opened. Check what moves now, then update again.",
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByText("Couldn't save")).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Update template" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      sends(calls).map(
        (call) => (call.body as { toVersionId: string }).toVersionId,
      ),
    ).toEqual([preview.to.versionId, v4]);
  });

  test("archived meanwhile: M8 stays to say why, the screen turns read only, and closing takes M8 off the URL", async () => {
    const user = userEvent.setup();
    migrationApi({
      t2: (_call, world) => {
        world.archived = true;
        return apiError(409, "ARCHIVED");
      },
    });
    const router = renderApp(ideaPath());
    const dialog = await openFromBand(user);
    await within(dialog).findByText("Move from v1 to v3 of the template.");
    await user.click(
      within(dialog).getByRole("button", { name: "Update template" }),
    );
    expect(await within(dialog).findByText("Couldn't save")).toBeTruthy();
    expect(within(dialog).getByText("It's archived")).toBeTruthy();
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(band()).toBeUndefined();
    expect(screen.getByRole("dialog", { name: "Update template" })).toBe(
      dialog,
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.search).not.toHaveProperty("modal");
  });

  test("while it sends: one send however often pressed, and Cancel and Escape wait", async () => {
    const user = userEvent.setup();
    let release = () => {};
    const { calls } = migrationApi({
      t2: () =>
        new Promise((resolve) => {
          release = () => resolve(migrated());
        }),
    });
    renderApp(ideaPath(`?modal=update-template&about=${about}`));
    const dialog = await screen.findByRole("dialog", {
      name: "Update template",
    });
    await within(dialog).findByText("Move from v1 to v3 of the template.");
    const update = within(dialog).getByRole("button", {
      name: "Update template",
    });
    await user.click(update);
    await user.click(update);
    expect(
      within(dialog)
        .getByRole("button", { name: "Cancel" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Update template" })).toBe(
      dialog,
    );
    expect(sends(calls)).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sends(calls)).toHaveLength(1);
  });

  test("a send that fails keeps M8 open with Couldn't save and Retry; Retry sends again", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    migrationApi({
      t2: () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("Failed to fetch");
        return migrated();
      },
    });
    renderApp(ideaPath(`?modal=update-template&about=${about}`));
    const dialog = await screen.findByRole("dialog", {
      name: "Update template",
    });
    await within(dialog).findByText("Move from v1 to v3 of the template.");
    await user.click(
      within(dialog).getByRole("button", { name: "Update template" }),
    );
    expect(await within(dialog).findByText("Couldn't save")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(attempts).toBe(2);
  });

  test.each([
    [
      "a failure that may pass",
      (): Response => {
        throw new TypeError("Failed to fetch");
      },
      "Couldn't save",
      true,
    ],
    [
      "refused as archived",
      () => apiError(409, "ARCHIVED"),
      "Couldn't save. It's archived.",
      false,
    ],
    [
      "unexpected",
      () => apiError(500, "INTERNAL"),
      "Something went wrong. Ref: 8f14e45f",
      true,
    ],
  ] as const)(
    "Back while Update template is on its way, then %s: a toast says so, and its Retry (where it may pass) moves it again",
    async (_, fail, words, retries) => {
      vi.spyOn(sentry, "reportError").mockReturnValue(null);
      const user = userEvent.setup();
      let release = () => {};
      let attempts = 0;
      const { calls } = migrationApi({
        t2: () => {
          attempts += 1;
          if (attempts > 1) return migrated();
          return new Promise<Response>((resolve, reject) => {
            release = () => {
              try {
                resolve(fail());
              } catch (error) {
                reject(error);
              }
            };
          });
        },
      });
      const router = renderApp(ideaPath());
      const dialog = await openFromBand(user);
      await within(dialog).findByText("Move from v1 to v3 of the template.");
      await user.click(
        within(dialog).getByRole("button", { name: "Update template" }),
      );
      await waitFor(() => expect(sends(calls)).toHaveLength(1));
      act(() => router.history.back());
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      const reads = calls.filter((call) => call.method === "GET").length;
      const toast = await toastAfter(words, async () => {
        act(release);
      });
      const retry = within(toast).queryByRole("button", { name: "Retry" });
      if (!retries) {
        expect(retry).toBeNull();
        await waitFor(() =>
          expect(
            calls.filter((call) => call.method === "GET").length,
          ).toBeGreaterThan(reads),
        );
        return;
      }
      await user.click(retry as HTMLElement);
      await waitFor(() => expect(sends(calls)).toHaveLength(2));
      expect(sends(calls)[1]?.body).toEqual(sends(calls)[0]?.body);
      expect(
        (await screen.findAllByText("Template updated to v3")).length,
      ).toBeGreaterThan(0);
      await waitFor(() => expect(band()).toBeUndefined());
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  test.each([
    [
      "moved by someone else first",
      (world: World) => {
        world.moved = true;
        return apiError(409, "ALREADY_LATEST");
      },
      "You're already on the latest template",
      true,
    ],
    [
      "a newer version published and moved to meanwhile",
      () =>
        apiError(422, "VALIDATION_FAILED", {
          details: [{ path: "toVersionId", code: "custom" }],
        }),
      "The template changed since this opened. Check what moves now, then update again.",
      false,
    ],
  ] as const)(
    "Back while Update template is on its way, then %s: M8's words alone, without Retry, and 13 read again",
    async (_, fail, words, bandGoes) => {
      vi.spyOn(sentry, "reportError").mockReturnValue(null);
      const user = userEvent.setup();
      let release = () => {};
      const { calls, world } = migrationApi({
        t2: () =>
          new Promise<Response>((resolve) => {
            release = () => resolve(fail(world));
          }),
      });
      const router = renderApp(ideaPath());
      const dialog = await openFromBand(user);
      await within(dialog).findByText("Move from v1 to v3 of the template.");
      await user.click(
        within(dialog).getByRole("button", { name: "Update template" }),
      );
      await waitFor(() => expect(sends(calls)).toHaveLength(1));
      act(() => router.history.back());
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      const reads = calls.filter(
        (call) =>
          call.method === "GET" &&
          call.path === `/api/v1/ideas/${ideaId}/validation`,
      ).length;
      const toast = await toastAfter(words, async () => {
        act(release);
      });
      expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
      await waitFor(() =>
        expect(
          calls.filter(
            (call) =>
              call.method === "GET" &&
              call.path === `/api/v1/ideas/${ideaId}/validation`,
          ).length,
        ).toBeGreaterThan(reads),
      );
      if (bandGoes) {
        await waitFor(() => expect(band()).toBeUndefined());
      } else {
        expect(band()).toBeDefined();
      }
      expect(sends(calls)).toHaveLength(1);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  test("its skeleton while T1 answers, Update template off until then", async () => {
    migrationApi({ t1: () => new Promise<Response>(() => {}) });
    renderApp(ideaPath(`?modal=update-template&about=${about}`));
    const dialog = await screen.findByRole("dialog", {
      name: "Update template",
    });
    expect(within(dialog).getByText("Answers carried over")).toBeTruthy();
    expect(within(dialog).queryByText(/^Move from/)).toBeNull();
    expect(
      within(dialog)
        .getByRole("button", { name: "Update template" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  test("T1 that fails unexpectedly shows the failure with Retry, Update template off until it reads", async () => {
    let reads = 0;
    const user = userEvent.setup();
    migrationApi({
      t1: () => {
        reads += 1;
        return reads === 1 ? apiError(500, "INTERNAL") : Response.json(preview);
      },
    });
    renderApp(ideaPath(`?modal=update-template&about=${about}`));
    const dialog = await screen.findByRole("dialog", {
      name: "Update template",
    });
    expect(
      await within(dialog).findByText("Something went wrong"),
    ).toBeTruthy();
    expect(within(dialog).getByText("Ref: 8f14e45f")).toBeTruthy();
    const update = within(dialog).getByRole("button", {
      name: "Update template",
    });
    expect(update.hasAttribute("disabled")).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(
      await within(dialog).findByText("Move from v1 to v3 of the template."),
    ).toBeTruthy();
    expect(reads).toBe(2);
    await waitFor(() => expect(update.hasAttribute("disabled")).toBe(false));
  });

  test("T1 refused for good: the failure in M8 and no Update template to press", async () => {
    migrationApi({ t1: () => apiError(404, "NOT_FOUND") });
    renderApp(ideaPath(`?modal=update-template&about=${about}`));
    const dialog = await screen.findByRole("dialog", {
      name: "Update template",
    });
    expect(
      await within(dialog).findByText("Not found. Check the link."),
    ).toBeTruthy();
    expect(
      within(dialog)
        .getByRole("button", { name: "Update template" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
