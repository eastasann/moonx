import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import type { IdeaDetail, Me, ValidationHome } from "@moonx/schemas";
import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import {
  test as base,
  demo,
  expect,
  newAccount,
  workspaceOf,
} from "./fixtures";

// 24 Export for AI and 25 Import from AI (design-spec 6.6・6.7): a validation exported,
// its export turned into a reply and imported back, against an idea each test makes in
// its worker's personal workspace; a self-analysis's amount; a Viewer kept out.

interface Account {
  email: string;
  password: string;
}

/** One account per worker, as validation.spec.ts has (BCDX's invitations are limited). */
const test = base.extend<object, { account: Account }>({
  account: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
    async ({}, use, workerInfo) => {
      await use(await newAccount(workerInfo.workerIndex, "ai"));
    },
    { scope: "worker" },
  ],
});

const desktop = { viewport: { width: 1440, height: 900 } };
const phone = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
};

async function expectNoAxeViolations(page: Page) {
  await expect(
    page.locator("[data-live-announcer] [aria-labelledby]"),
  ).toHaveCount(0, { timeout: 10_000 });
  // Overlays fading and colours changing on a press or a hover read as low contrast
  // to axe: the page is checked once they have settled (as validation.spec.ts does).
  await expect(page.locator("[data-entering], [data-exiting]")).toHaveCount(0);
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          !(animation instanceof CSSTransition) ||
          animation.playState !== "running",
      ),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    })),
  ).toEqual([]);
}

/** The worker's account signed in, with a new idea whose WHO is answered. */
async function ideaWithAnswer(
  page: Page,
  signIn: (email: string, password?: string) => Promise<Me>,
  account: Account,
) {
  const me = await signIn(account.email, account.password);
  const personal = me.memberships.find(({ workspace }) => workspace.isPersonal);
  if (personal === undefined) throw new Error("No personal workspace");
  const created = await page.request.post(
    `/api/v1/workspaces/${personal.workspace.id}/ideas`,
    {
      data: { name: "Piaya Tour", oneLineConcept: "Piaya tours, in one line." },
      headers: { Origin: WEB_ORIGIN },
    },
  );
  expect(created.status(), await created.text()).toBe(201);
  const idea = (await created.json()) as IdeaDetail;
  const home = (await (
    await page.request.get(`/api/v1/ideas/${idea.id}/validation`)
  ).json()) as ValidationHome;
  const saved = await page.request.put(
    `/api/v1/validations/${home.validationId}/answers/V.01.WHO`,
    {
      data: { text: "Office workers in Bacolod.", lockVersion: 0 },
      headers: { Origin: WEB_ORIGIN },
    },
  );
  expect(saved.ok(), await saved.text()).toBe(true);
  return { workspace: personal.workspace, idea, home };
}

test.describe("24 and 25 on a desktop", () => {
  test.use(desktop);

  test("13 → 24 → 25: the export pasted back as a reply is matched, reviewed and applied", async ({
    page,
    context,
    signIn,
    account,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: WEB_ORIGIN,
    });
    const { workspace, idea } = await ideaWithAnswer(page, signIn, account);
    const home = `/w/${workspace.id}/ideas/${idea.id}`;
    await page.goto(home);
    await page.getByRole("button", { name: "AI" }).click();
    await page.getByRole("menuitem", { name: "Export for AI" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Export for AI" }),
    ).toBeVisible();
    await expect(page).toHaveTitle(`Export for AI · ${workspace.name} · moonx`);
    await expect(page.getByRole("list", { name: "Breadcrumbs" })).toHaveText(
      "Ideas/Piaya Tour/Export for AI",
    );
    // ① every question section of the validation (6.1「操作」); 01 alone is kept.
    const sections = page.getByRole("group", { name: "Sections" });
    for (const name of [
      "02 Market",
      "04 Competitors & Substitutes",
      "08 Investment Return",
      "10 Final Assessment",
    ]) {
      await sections.getByRole("checkbox", { name }).uncheck({ force: true });
    }
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Next" }).click();
    // ② the preview.
    const preview = page.getByRole("region", { name: "Preview" });
    await expect(preview).toContainText("scope: 01 | idea: Piaya Tour");
    await expect(preview).toContainText("> Office workers in Bacolod.");
    await expect(preview).not.toContainText("[V.02.");
    await page.getByRole("radio", { name: "JSON" }).click();
    await expect(preview).toContainText('"format": "moonx-export"');
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Next" }).click();
    // ③ copied and downloaded.
    await page.getByRole("button", { name: "Copy Markdown" }).click();
    await expect(page.getByText("Copied")).toBeVisible();
    const exported = await page.evaluate(() => navigator.clipboard.readText());
    expect(exported).toContain("## [V.01.WHO] WHO");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .md" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(
      /^moonx-export-validation-Piaya Tour-\d{4}-\d{2}-\d{2}\.md$/,
    );
    expect(await readFile(await file.path(), "utf8")).toBe(exported);
    await expectNoAxeViolations(page);

    // The AI's reply in the export's own form: WHO rewritten, PROBLEM answered.
    const reply = exported
      .replace(
        "> Office workers in Bacolod.",
        "> HR teams of BPO companies in Bacolod.",
      )
      .replace(
        /(## \[V\.01\.PROBLEM\][\s\S]*?\*\*Current answer:\*\*\n\n)> \(empty\)/u,
        "$1> Gifts take half a day to source.",
      );
    await page.getByRole("button", { name: "Import from AI" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Import from AI" }),
    ).toBeVisible();
    await expect(
      page.getByText("Piaya Tour · validation questions"),
    ).toBeVisible();
    await page.getByRole("textbox", { name: /Reply from your AI/ }).fill(reply);
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Next" }).click();
    // ② the two answers matched; the empty ones left out (6.7 ①).
    await expect(page.getByText("[V.01.WHO] WHO")).toBeVisible();
    await expect(page.getByText("[V.01.PROBLEM] PROBLEM")).toBeVisible();
    await expect(page.getByText("Matched")).toHaveCount(2);
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Next" }).click();
    // ③
    await expect(page.getByText("2 changes", { exact: true })).toBeVisible();
    const who = page.getByRole("region", { name: /^01 · WHO/ });
    await expect(who).toContainText("Office workers in Bacolod.");
    await expect(
      who.getByRole("textbox", { name: "Imported answer to 01 · WHO" }),
    ).toHaveValue("HR teams of BPO companies in Bacolod.");
    // WHO was saved without F/A/U: Current reads Unclassified, and so does the import.
    await expect(who.getByText("Unclassified", { exact: true })).toHaveCount(2);
    const problem = page.getByRole("region", { name: /^01 · PROBLEM/ });
    await problem.getByRole("radio", { name: /Assumption/ }).click();
    await problem.getByRole("radio", { name: "High" }).click();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Apply 2 changes" }).click();
    // Back on 13, where it was opened, with the count (6.7 ④).
    await expect(page).toHaveURL(home);
    await expect(
      page.getByText("2 answers updated · 1 needs F/A/U"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Next steps", exact: true })
        .getByRole("listitem")
        .first(),
    ).toContainText("Classify answers (1)");
    // The F/A/U chosen on ③ was saved with the answer.
    await page.goto(`${home}/questions/01`);
    await expect(
      page.getByRole("region", { name: "PROBLEM", exact: true }),
    ).toContainText("Assumption · High");
  });

  test("a Viewer has no AI ▼ and cannot open 24 or 25", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer);
    const bcdx = workspaceOf(me, "BCDX");
    const listed = await page.request.get(
      `/api/v1/workspaces/${bcdx.id}/ideas?decision=all`,
    );
    const { items } = (await listed.json()) as {
      items: { id: string; name: string }[];
    };
    const idea = items.find(({ name }) => name === "Piaya Gift Box Delivery");
    if (idea === undefined) throw new Error("No Piaya Gift Box Delivery");
    await page.goto(`/w/${bcdx.id}/ideas/${idea.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Piaya Gift Box Delivery" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "AI" })).toHaveCount(0);
    const home = (await (
      await page.request.get(`/api/v1/ideas/${idea.id}/validation`)
    ).json()) as ValidationHome;
    for (const screen of ["export?source", "import?target"]) {
      await page.goto(
        `/w/${bcdx.id}/ai/${screen}=validation&id=${home.validationId}`,
      );
      await expect(
        page.getByRole("heading", { name: "You don't have access to this" }),
      ).toBeVisible();
    }
  });
});

test.describe("25 on a phone", () => {
  test.use(phone);

  test("a self-analysis's amount and reason imported; ③'s buttons fixed at the bottom", async ({
    page,
    signIn,
    account,
  }) => {
    const me = await signIn(account.email, account.password);
    const personal = me.memberships.find(
      ({ workspace }) => workspace.isPersonal,
    );
    if (personal === undefined) throw new Error("No personal workspace");
    // S1 GET makes the self-analysis (SDD 5.10: X2 is 404 before it).
    const analysis = await page.request.get("/api/v1/me/self-analysis");
    expect(analysis.ok(), await analysis.text()).toBe(true);
    await page.goto(
      `/w/${personal.workspace.id}/ai/import?target=self_analysis`,
    );
    await expect(
      page.getByText("Self analysis", { exact: true }),
    ).toBeVisible();
    // A reason long enough that ③ is taller than the screen.
    const reason = Array.from(
      { length: 30 },
      (_, line) => `Rent and food, line ${line + 1}.`,
    ).join("\n");
    await page
      .getByRole("textbox", { name: /Reply from your AI/ })
      .fill(
        `## [SA.INCOME.1]\n### Amount\n₱30,000\n\n### Why this amount?\n${reason}`,
      );
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("[SA.INCOME.1] Q15")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByRole("textbox", { name: "Amount", exact: true }),
    ).toHaveValue("30,000");
    await expect(page.getByText("Unclassified")).toHaveCount(0);
    const apply = page.getByRole("button", { name: "Apply 1 change" });
    await expect(apply).toBeInViewport();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeInViewport();
    // Fixed: where it was as the page scrolls under it (4.1 G).
    const top = await apply.boundingBox();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    expect((await apply.boundingBox())?.y).toBe(top?.y);
    await expect(apply).toBeInViewport();
    await expectNoAxeViolations(page);
    await apply.click();
    await expect(page.getByText("1 answer updated")).toBeVisible();
    const income = await page.request.get(
      "/api/v1/me/self-analysis/sections/INCOME",
    );
    const { answers } = (await income.json()) as {
      answers: {
        questionKey: string;
        amount: number | null;
        text: string | null;
      }[];
    };
    expect(
      answers.find(({ questionKey }) => questionKey === "SA.INCOME.1"),
    ).toMatchObject({
      amount: 30000,
      text: reason,
    });
  });
});
