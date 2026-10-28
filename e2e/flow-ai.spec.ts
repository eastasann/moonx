import type { IdeaDetail, Me, ValidationHome } from "@moonx/schemas";
import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import {
  type Account,
  test as base,
  expect,
  operatorInvited,
} from "./fixtures";

// The AI round trips of docs/screen_flow.mermaid that ai.spec.ts does not walk: AI ▼ of
// 10, 11 (self analysis and validation) and 21, and 20's ⋯, to 24 and to 25; 13's AI ▼
// to 25 (ai.spec.ts walks 13 → 24); 25's return to the screen it came from once applied
// or cancelled, and ③'s Fact opening M2 (design-spec 6.6・6.7). Everything is written in
// the personal workspace of the worker's own account.

const test = base.extend<object, { account: Account }>({
  account: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
    async ({}, use, workerInfo) => {
      await use(await operatorInvited(workerInfo.workerIndex, "flow-ai"));
    },
    { scope: "worker" },
  ],
});

const desktop = { viewport: { width: 1440, height: 900 } };

/** 24's or 25's URL (SDD 4章): the parameters in the order the screens write them. */
const aiUrl = (
  workspaceId: string,
  screen: "export" | "import",
  params: Record<string, string>,
) =>
  `${WEB_ORIGIN}/w/${workspaceId}/ai/${screen}?${new URLSearchParams(params)}`;

/** The worker's account signed in, and its personal workspace. */
async function personalWorkspace(
  signIn: (email: string, password?: string) => Promise<Me>,
  account: Account,
) {
  const me = await signIn(account.email, account.password);
  const personal = me.memberships.find(({ workspace }) => workspace.isPersonal);
  if (personal === undefined) throw new Error("No personal workspace");
  return personal.workspace;
}

/** A new idea of the page's user (I1) and its validation (V1). */
async function ownIdea(page: Page, workspaceId: string, name: string) {
  const created = await page.request.post(
    `/api/v1/workspaces/${workspaceId}/ideas`,
    {
      data: { name, oneLineConcept: `${name}, in one line.` },
      headers: { Origin: WEB_ORIGIN },
    },
  );
  expect(created.status(), await created.text()).toBe(201);
  const idea = (await created.json()) as IdeaDetail;
  const home = (await (
    await page.request.get(`/api/v1/ideas/${idea.id}/validation`)
  ).json()) as ValidationHome;
  return { idea, validationId: home.validationId };
}

/** Opens AI ▼ and chooses `item`. */
async function fromAiMenu(
  page: Page,
  item: "Export for AI" | "Import from AI",
) {
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

/** On 24 at `url`: its URL and its title. */
async function expectOn24(page: Page, url: string) {
  await expect(page).toHaveURL(url);
  await expect(
    page.getByRole("heading", { level: 1, name: "Export for AI" }),
  ).toBeVisible();
}

/** On 25 at `url`: its URL and its title. */
async function expectOn25(page: Page, url: string) {
  await expect(page).toHaveURL(url);
  await expect(
    page.getByRole("heading", { level: 1, name: "Import from AI" }),
  ).toBeVisible();
}

/**
 * Pastes `reply` on 25's ① and goes on to ③ through ②, where its one block is matched
 * to `matched` ("[ID] title"), and ③ has that one change.
 */
async function reviewOne(page: Page, reply: string, matched: string) {
  await page.getByRole("textbox", { name: /Reply from your AI/ }).fill(reply);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText(matched)).toBeVisible();
  await expect(page.getByText("Matched", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("1 change", { exact: true })).toBeVisible();
}

/** Applies ③'s one change: 25 goes back to where it was opened, saying so (6.7 ④). */
async function applyOne(page: Page) {
  await page.getByRole("button", { name: "Apply 1 change" }).click();
  await expect(page.getByText("1 answer updated")).toBeVisible();
}

test.describe("on a desktop", () => {
  test.use(desktop);

  test("10 and 11 of the self analysis: AI ▼ to 24 and to 25, which comes back once applied", async ({
    page,
    signIn,
    account,
  }) => {
    const workspace = await personalWorkspace(signIn, account);
    const home = `/w/${workspace.id}/self-analysis`;
    const form = `${home}/WHY`;

    await test.step("10 → 24 (AI ▼: Export for AI)", async () => {
      await page.goto(home);
      await fromAiMenu(page, "Export for AI");
      await expectOn24(
        page,
        aiUrl(workspace.id, "export", {
          source: "self_analysis",
          returnTo: home,
        }),
      );
    });

    await test.step("10 → 25 (AI ▼: Import from AI)", async () => {
      await page.goto(home);
      await fromAiMenu(page, "Import from AI");
      await expectOn25(
        page,
        aiUrl(workspace.id, "import", {
          target: "self_analysis",
          returnTo: home,
        }),
      );
      await expect(
        page.getByText("Self analysis", { exact: true }),
      ).toBeVisible();
    });

    await test.step("25 → 10 (Apply)", async () => {
      await reviewOne(
        page,
        "## [SA.WHY.1]\nTo keep my family close.",
        "[SA.WHY.1] Q1",
      );
      await applyOne(page);
      await expect(page).toHaveURL(`${WEB_ORIGIN}${home}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "My Self Analysis" }),
      ).toBeVisible();
    });

    await test.step("11 → 24 (AI ▼: Export for AI)", async () => {
      await page.goto(form);
      await fromAiMenu(page, "Export for AI");
      await expectOn24(
        page,
        aiUrl(workspace.id, "export", {
          source: "self_analysis",
          scope: "WHY",
          returnTo: form,
        }),
      );
    });

    await test.step("11 → 25 (AI ▼: Import from AI)", async () => {
      await page.goto(form);
      await fromAiMenu(page, "Import from AI");
      await expectOn25(
        page,
        aiUrl(workspace.id, "import", {
          target: "self_analysis",
          returnTo: form,
        }),
      );
    });

    await test.step("25 → 11 (Apply)", async () => {
      await reviewOne(
        page,
        "## [SA.WHY.2]\nA bakery the town can walk to.",
        "[SA.WHY.2] Q2",
      );
      await applyOne(page);
      await expect(page).toHaveURL(`${WEB_ORIGIN}${form}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "WHY" }),
      ).toBeVisible();
    });
  });

  test("11 and 13 of a validation: AI ▼ to 24 and 25; ③'s Fact opens M2; Apply returns to 11 and Cancel to 13", async ({
    page,
    signIn,
    account,
  }) => {
    const workspace = await personalWorkspace(signIn, account);
    const { idea, validationId } = await ownIdea(
      page,
      workspace.id,
      "Puto Pop-up",
    );
    const answered = await page.request.put(
      `/api/v1/validations/${validationId}/answers/V.01.WHO`,
      {
        data: { text: "Office workers in Bacolod.", lockVersion: 0 },
        headers: { Origin: WEB_ORIGIN },
      },
    );
    expect(answered.ok(), await answered.text()).toBe(true);
    const home = `/w/${workspace.id}/ideas/${idea.id}`;
    const form = `${home}/questions/01`;

    await test.step("11 → 24 (AI ▼: Export for AI)", async () => {
      await page.goto(form);
      await fromAiMenu(page, "Export for AI");
      await expectOn24(
        page,
        aiUrl(workspace.id, "export", {
          source: "validation",
          id: validationId,
          scope: "01",
          returnTo: form,
        }),
      );
    });

    await test.step("11 → 25 (AI ▼: Import from AI)", async () => {
      await page.goto(form);
      await fromAiMenu(page, "Import from AI");
      await expectOn25(
        page,
        aiUrl(workspace.id, "import", {
          target: "validation",
          id: validationId,
          returnTo: form,
        }),
      );
      await reviewOne(
        page,
        "## [V.01.WHO]\nHR teams of BPO companies in Bacolod.",
        "[V.01.WHO] WHO",
      );
    });

    await test.step("25 → M2 (③ Fact, the answer without evidence)", async () => {
      const who = page.getByRole("region", { name: /^01 · WHO/ });
      // The changed answer goes back to Unclassified (6.7 ③): no F/A/U chosen.
      const expectNoneChosen = async () => {
        for (const fau of [/Fact/, /Assumption/, /Unknown/]) {
          await expect(who.getByRole("radio", { name: fau })).not.toBeChecked();
        }
      };
      await expectNoneChosen();
      await who.getByRole("radio", { name: /Fact/ }).click();
      const evidence = page.getByRole("dialog", { name: "Evidence" });
      await expect(evidence).toBeVisible();
      await expect(page).toHaveURL(/[?&]modal=evidence(&|$)/);
      await evidence.getByRole("button", { name: "Done" }).click();
      await expect(evidence).toBeHidden();
      // Closed with nothing attached, the choice does not change (6.7 ③).
      await expectNoneChosen();
    });

    await test.step("25 → 11 (Apply)", async () => {
      await applyOne(page);
      await expect(page).toHaveURL(`${WEB_ORIGIN}${form}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "01 Customer & Problem" }),
      ).toBeVisible();
    });

    await test.step("13 → 25 (AI ▼: Import from AI)", async () => {
      await page.goto(home);
      await fromAiMenu(page, "Import from AI");
      await expectOn25(
        page,
        aiUrl(workspace.id, "import", {
          target: "validation",
          id: validationId,
          returnTo: home,
        }),
      );
    });

    await test.step("25 → 13 (③ Cancel)", async () => {
      await reviewOne(
        page,
        "## [V.01.PROBLEM]\nGifts take half a day to source.",
        "[V.01.PROBLEM] PROBLEM",
      );
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${home}`);
      await expect(
        page.getByRole("heading", { level: 1, name: idea.name }),
      ).toBeVisible();
    });
  });

  test("20 and 21 of a plan: to 24 and to 25, which comes back once applied", async ({
    page,
    signIn,
    account,
  }) => {
    const workspace = await personalWorkspace(signIn, account);
    const { idea } = await ownIdea(page, workspace.id, "Biko Bar");
    const decided = await page.request.post(
      `/api/v1/ideas/${idea.id}/decisions`,
      {
        data: {
          value: "proceed",
          reason: "Worth a full plan.",
          basedOnDecisionId: null,
        },
        headers: { Origin: WEB_ORIGIN },
      },
    );
    expect(decided.status(), await decided.text()).toBe(201);
    const drafted = await page.request.post(`/api/v1/ideas/${idea.id}/plans`, {
      data: { name: "Plan A" },
      headers: { Origin: WEB_ORIGIN },
    });
    expect(drafted.status(), await drafted.text()).toBe(201);
    const { id: planId } = (await drafted.json()) as { id: string };
    const home = `/w/${workspace.id}/ideas/${idea.id}/plans/${planId}`;
    const item = `${home}/items/1`;
    const fromMore = async (choice: "Export for AI" | "Import from AI") => {
      await page.getByRole("button", { name: "More for Plan A" }).click();
      await page.getByRole("menuitem", { name: choice }).click();
    };

    await test.step("20 → 24 (⋯: Export for AI)", async () => {
      await page.goto(home);
      await fromMore("Export for AI");
      await expectOn24(
        page,
        aiUrl(workspace.id, "export", {
          source: "business_plan",
          id: planId,
          returnTo: home,
        }),
      );
    });

    await test.step("20 → 25 (⋯: Import from AI)", async () => {
      await page.goto(home);
      await fromMore("Import from AI");
      await expectOn25(
        page,
        aiUrl(workspace.id, "import", {
          target: "business_plan",
          id: planId,
          returnTo: home,
        }),
      );
    });

    await test.step("25 → 20 (Apply)", async () => {
      await reviewOne(
        page,
        "## [P.01.1]\nBiko by the slice, from a stall by the plaza.",
        "[P.01.1] What is the business?",
      );
      await applyOne(page);
      await expect(page).toHaveURL(`${WEB_ORIGIN}${home}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Plan A" }),
      ).toBeVisible();
    });

    await test.step("21 → 24 (AI ▼: Export for AI)", async () => {
      await page.goto(item);
      await fromAiMenu(page, "Export for AI");
      await expectOn24(
        page,
        aiUrl(workspace.id, "export", {
          source: "business_plan",
          id: planId,
          scope: "01",
          returnTo: item,
        }),
      );
    });

    await test.step("21 → 25 (AI ▼: Import from AI)", async () => {
      await page.goto(item);
      await fromAiMenu(page, "Import from AI");
      await expectOn25(
        page,
        aiUrl(workspace.id, "import", {
          target: "business_plan",
          id: planId,
          returnTo: item,
        }),
      );
    });

    await test.step("25 → 21 (Apply)", async () => {
      await reviewOne(
        page,
        "## [P.01.2]\nShoppers at the Sunday market.",
        "[P.01.2] Who is the primary customer?",
      );
      await applyOne(page);
      await expect(page).toHaveURL(`${WEB_ORIGIN}${item}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "1 Executive Summary" }),
      ).toBeVisible();
    });
  });
});
