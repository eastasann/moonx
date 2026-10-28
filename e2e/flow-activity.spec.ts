import type {
  IdeaDetail,
  Me,
  TargetRef,
  ValidationHome,
  Workspace,
} from "@moonx/schemas";
import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import {
  type Account,
  test as base,
  expect,
  nextAddress,
  operatorInvited,
  teamWithMember,
} from "./fixtures";

// Where 8's notifications and 5's Recent activity lead (docs/screen_flow.mermaid 196–200
// and its note that a notification opens its item; design-spec 6.15「押した先」・6.9): every
// kind of notification and of activity entry, pressed, opens the screen of what it is
// about, a comment's with the thread in the Comments panel; a notification opens in its
// own workspace, and says so once its reader has left that workspace. collab.spec.ts
// presses one mention; this file the rest. What is pressed is written through the API in a workspace
// of the test's own (the move under test is 8 → item, 5 → item), never in the seeded
// BCDX, whose unread notifications other tests read.

const test = base.extend<object, { account: Account }>({
  account: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
    async ({}, use, workerInfo) => {
      await use(await operatorInvited(workerInfo.workerIndex, "flow-activity"));
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

/** Writes through the API as `request`'s user and returns the answer's body. */
async function send<T>(
  request: APIRequestContext,
  method: "post" | "put",
  path: string,
  data: unknown,
): Promise<T> {
  const response = await request[method](path, {
    data,
    headers: { Origin: WEB_ORIGIN },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (response.status() === 204 ? undefined : await response.json()) as T;
}

/** Reads the API as `request`'s user. */
async function read<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(path);
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

/** A comment on `target` in `workspaceId`, or a reply to `parentId` (C1), mentioning no one. */
const comment = (
  request: APIRequestContext,
  workspaceId: string,
  target: TargetRef,
  body: string,
  parentId?: string,
) =>
  send<{ id: string }>(request, "post", "/api/v1/comments", {
    workspaceId,
    target,
    body,
    mentionUserIds: [],
    ...(parentId === undefined ? {} : { parentId }),
  });

/** The caller's own self-analysis, marked done and shared with `workspaceId` only (S1, S4, S5). */
async function shareSelfAnalysis(
  request: APIRequestContext,
  workspaceId: string,
) {
  const analysis = await read<{ id: string; status: string }>(
    request,
    "/api/v1/me/self-analysis",
  );
  if (analysis.status !== "done") {
    await send(request, "post", "/api/v1/me/self-analysis/complete", {
      confirmEmpty: true,
    });
  }
  await send(request, "put", "/api/v1/me/self-analysis/shares", {
    workspaceIds: [workspaceId],
  });
  return analysis.id;
}

/** A new idea of `workspaceId` (I1) and its validation (V1). */
async function newIdea(
  request: APIRequestContext,
  workspaceId: string,
  name: string,
) {
  const idea = await send<IdeaDetail>(
    request,
    "post",
    `/api/v1/workspaces/${workspaceId}/ideas`,
    { name, oneLineConcept: `${name}, in one line.` },
  );
  const { validationId } = await read<ValidationHome>(
    request,
    `/api/v1/ideas/${idea.id}/validation`,
  );
  return { idea, validationId };
}

/** Proceed on the idea (V19), then its draft Plan A (P1), as M5 makes it after 19. */
async function proceedToPlan(request: APIRequestContext, ideaId: string) {
  const decided = await send<{ entry: { id: string } }>(
    request,
    "post",
    `/api/v1/ideas/${ideaId}/decisions`,
    { value: "proceed", reason: "Worth a plan.", basedOnDecisionId: null },
  );
  const plan = await send<{ id: string }>(
    request,
    "post",
    `/api/v1/ideas/${ideaId}/plans`,
    { name: "Plan A" },
  );
  return { decisionId: decided.entry.id, planId: plan.id };
}

/** The level-1 heading a screen is named by. */
const title = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name, exact: true });

/** The Comments panel beside the screen (PNL-1, a column on a desktop). */
const commentsPanel = (page: Page) =>
  page.getByRole("complementary", { name: "Comments" });

/**
 * Whether a URL is `path` with `search` among its parameters, the panel's included: the
 * order of the parameters is the router's.
 */
const at =
  (path: string, search: Record<string, string> = {}) =>
  (url: URL) =>
    url.pathname === path &&
    Object.entries(search).every(
      ([name, value]) => url.searchParams.get(name) === value,
    );

/** The parameters of a link that opens the comments on `target` (SDD 4章 `?panel=&target=`). */
const threadOf = ({ type, id, key }: TargetRef) => ({
  panel: "comments",
  target: key == null ? `${type}:${id}` : `${type}:${id}:${key}`,
});

/** The navigation's workspace button, named by the workspace the frame stands in. */
const workspaceButton = (page: Page, name: string) =>
  page.getByRole("button", { name: `${name}, switch workspace` });

/** The workspace the user last opened, as the API keeps it (U1). */
const lastWorkspaceOf = (page: Page) => async () =>
  (await read<Me>(page.request, "/api/v1/me")).lastWorkspaceId;

/** Opens 8 and presses the notification whose row reads `text`. */
async function pressNotification(page: Page, text: string) {
  await page.goto("/notifications");
  await page
    .getByRole("grid", { name: "Notifications" })
    .getByRole("row")
    .filter({ hasText: text })
    .click();
}

/** A browser of its own, as the second person of the team on a device of theirs. */
async function otherBrowser(
  browser: Browser,
  workerIndex: number,
  device: typeof desktop | typeof phone,
) {
  const context = await browser.newContext({
    ...device,
    extraHTTPHeaders: { "X-Forwarded-For": nextAddress(workerIndex) },
  });
  return { context, page: await context.newPage() };
}

/** What Bea writes on the items of the Owner's idea and plan, one comment each. */
const said = {
  answer: "Do the night-shift teams count as WHO?",
  research: "Which Sundays did you count?",
  competitor: "Their prices went up in May.",
  assumption: "Ask three kiosk owners first.",
  risk: "Typhoon season closes the plaza.",
  cost: "The permit fee doubled this year.",
  economics: "Is sixty pesos too much on a Sunday?",
  idea: "Shall we visit the plaza this Sunday?",
  planAnswer: "Name the plaza in this answer.",
  slide: "Show the Sunday crowd on this slide.",
  action: "I can call them on Monday.",
  ownSelfAnalysis: "A strong reason to start.",
  sharedRoot: "Why the plaza, of all places?",
  sharedReply: "It is where I grew up.",
};

/**
 * A team workspace of the page's user (the Owner, Test Person) with Bea Cruz as a Member,
 * and the Owner's idea "Sunday Kiosk" with Plan A and a row of each list. Bea comments on
 * each item and on the Owner's shared self-analysis, the Owner on Bea's, which Bea answers;
 * then Bea saves a version, records a Go / No-Go and a decision. Each reaches the Owner's
 * 8 (design-spec 6.15): the idea's proposer and the plan's maker hear of every comment
 * on them, the self-analysis's owner of those on it, and a thread's writers of replies.
 */
async function teamWithNews(page: Page, bea: Page, workerIndex: number) {
  const team: Workspace = await teamWithMember(page, bea, workerIndex, {
    label: "Activity",
    displayName: "Bea Cruz",
  });
  const owner = page.request;
  const member = bea.request;
  const { idea, validationId } = await newIdea(owner, team.id, "Sunday Kiosk");
  const { decisionId, planId } = await proceedToPlan(owner, idea.id);
  const rows = `/api/v1/validations/${validationId}`;
  const entry = await send<{ id: string }>(
    owner,
    "post",
    `${rows}/research-log`,
    { topic: "Sunday foot traffic" },
  );
  const competitor = await send<{ id: string }>(
    owner,
    "post",
    `${rows}/competitors`,
    { name: "Plaza Coffee Cart" },
  );
  const assumption = await send<{ id: string }>(
    owner,
    "post",
    `${rows}/assumptions`,
    { statement: "Families come to the plaza every Sunday." },
  );
  const risk = await send<{ id: string }>(owner, "post", `${rows}/risks`, {
    statement: "The plaza closes in typhoon season.",
  });
  const { items: costs } = await read<{ items: { id: string }[] }>(
    owner,
    `${rows}/costs`,
  );
  const cost = costs[0];
  if (cost === undefined) throw new Error("No cost rows");
  const action = await send<{ id: string }>(
    owner,
    "post",
    `/api/v1/plans/${planId}/execution-items`,
    { type: "next_action", title: "Call the supplier" },
  );
  const mine = await shareSelfAnalysis(owner, team.id);
  const hers = await shareSelfAnalysis(member, team.id);
  const beaId = (await read<Me>(member, "/api/v1/me")).id;

  const targets = {
    answer: { type: "validation_answer", id: validationId, key: "V.01.WHO" },
    research: { type: "research_log_entry", id: entry.id },
    competitor: { type: "competitor", id: competitor.id },
    assumption: { type: "assumption", id: assumption.id },
    risk: { type: "risk", id: risk.id },
    cost: { type: "cost_item", id: cost.id },
    economics: {
      type: "economics_input",
      id: validationId,
      key: "selling_price",
    },
    idea: { type: "idea", id: idea.id },
    planAnswer: { type: "plan_answer", id: planId, key: "P.01.2" },
    slide: { type: "pitch_slide", id: planId, key: "five.market" },
    action: { type: "execution_item", id: action.id },
    ownSelfAnalysis: {
      type: "self_analysis_answer",
      id: mine,
      key: "SA.WHY.1",
    },
    shared: { type: "self_analysis_answer", id: hers, key: "SA.WHY.1" },
  } satisfies Record<string, TargetRef>;
  for (const item of [
    "answer",
    "research",
    "competitor",
    "assumption",
    "risk",
    "cost",
    "economics",
    "idea",
    "planAnswer",
    "slide",
    "action",
    "ownSelfAnalysis",
  ] as const) {
    await comment(member, team.id, targets[item], said[item]);
  }
  const root = await comment(owner, team.id, targets.shared, said.sharedRoot);
  await comment(member, team.id, targets.shared, said.sharedReply, root.id);

  await send(member, "post", `/api/v1/plans/${planId}/versions`, {
    name: "v1 For advisors",
  });
  await send(member, "post", `/api/v1/plans/${planId}/go-no-go`, {
    value: "delay",
    reason: "Wait for the plaza's permit.",
  });
  await send(member, "post", `/api/v1/ideas/${idea.id}/decisions`, {
    value: "hold",
    reason: "The permit comes first.",
    basedOnDecisionId: decisionId,
  });
  return {
    team,
    idea,
    planId,
    beaId,
    targets,
    rows: { entry, competitor, assumption, risk, cost, action },
  };
}

test.describe("8's notifications", () => {
  test.use(desktop);

  test("each kind opens where it happened, in its workspace: a comment's item with its thread, a decision 13, a Go / No-Go and a version 20; on a phone from the tab; once removed, no access", async ({
    page,
    browser,
    signIn,
    account,
  }, testInfo) => {
    // Sixteen notifications, each opened from 8, after a team and its items are made.
    test.slow();
    const me = await signIn(account.email, account.password);
    const personal = me.memberships.find(
      ({ workspace }) => workspace.isPersonal,
    )?.workspace;
    if (personal === undefined) throw new Error("No personal workspace");
    const bea = await otherBrowser(browser, testInfo.workerIndex, phone);
    try {
      const { team, idea, planId, beaId, targets, rows } = await teamWithNews(
        page,
        bea.page,
        testInfo.workerIndex,
      );
      const ideaPath = `/w/${team.id}/ideas/${idea.id}`;
      const planPath = `${ideaPath}/plans/${planId}`;

      await test.step("5 → 8 → 11 (a comment on a validation answer, pressed while another workspace is open: it opens in its own)", async () => {
        await page.goto(`/w/${personal.id}`);
        await expect(title(page, personal.name)).toBeVisible();
        await expect.poll(lastWorkspaceOf(page)).toBe(personal.id);
        await page
          .getByRole("navigation", { name: "Main" })
          .getByRole("link", { name: /^Notifications/ })
          .click();
        await expect(title(page, "Notifications")).toBeVisible();
        await expect(workspaceButton(page, personal.name)).toBeVisible();
        // One list across the workspaces, each row naming its own (6.15).
        const row = page
          .getByRole("grid", { name: "Notifications" })
          .getByRole("row")
          .filter({ hasText: said.answer });
        await expect(row).toContainText(team.name);
        await row.click();
        await expect(page).toHaveURL(
          at(`${ideaPath}/questions/01`, {
            q: "V.01.WHO",
            ...threadOf(targets.answer),
          }),
        );
        await expect(title(page, "01 Customer & Problem")).toBeVisible();
        await expect(commentsPanel(page).getByText(said.answer)).toBeVisible();
        await expect(workspaceButton(page, team.name)).toBeVisible();
        await expect.poll(lastWorkspaceOf(page)).toBe(team.id);
      });
      await test.step("8 → 14 (a comment on a research log entry)", async () => {
        await pressNotification(page, said.research);
        await expect(page).toHaveURL(
          at(`${ideaPath}/research`, {
            entry: rows.entry.id,
            ...threadOf(targets.research),
          }),
        );
        await expect(title(page, "03 Research Log")).toBeVisible();
        await expect(
          commentsPanel(page).getByText(said.research),
        ).toBeVisible();
      });
      await test.step("8 → 15 (a comment on a competitor)", async () => {
        await pressNotification(page, said.competitor);
        await expect(page).toHaveURL(
          at(`${ideaPath}/competitors`, {
            row: rows.competitor.id,
            ...threadOf(targets.competitor),
          }),
        );
        await expect(title(page, "04 Competitors")).toBeVisible();
        await expect(
          commentsPanel(page).getByText(said.competitor),
        ).toBeVisible();
      });
      await test.step("8 → 16 (a comment on an assumption)", async () => {
        await pressNotification(page, said.assumption);
        await expect(page).toHaveURL(
          at(`${ideaPath}/assumptions`, {
            tab: "assumptions",
            row: rows.assumption.id,
            ...threadOf(targets.assumption),
          }),
        );
        await expect(title(page, "09 Assumptions & Risks")).toBeVisible();
        await expect(
          commentsPanel(page).getByText(said.assumption),
        ).toBeVisible();
      });
      await test.step("8 → 16 (a comment on a risk)", async () => {
        await pressNotification(page, said.risk);
        await expect(page).toHaveURL(
          at(`${ideaPath}/assumptions`, {
            tab: "risks",
            row: rows.risk.id,
            ...threadOf(targets.risk),
          }),
        );
        await expect(title(page, "09 Assumptions & Risks")).toBeVisible();
        await expect(commentsPanel(page).getByText(said.risk)).toBeVisible();
      });
      await test.step("8 → 17 (a comment on a cost row)", async () => {
        await pressNotification(page, said.cost);
        await expect(page).toHaveURL(
          at(`${ideaPath}/costs`, {
            row: rows.cost.id,
            ...threadOf(targets.cost),
          }),
        );
        await expect(title(page, "05 Costs")).toBeVisible();
        await expect(commentsPanel(page).getByText(said.cost)).toBeVisible();
      });
      await test.step("8 → 18 (a comment on a number of unit economics)", async () => {
        await pressNotification(page, said.economics);
        await expect(page).toHaveURL(
          at(`${ideaPath}/economics`, {
            field: "selling_price",
            ...threadOf(targets.economics),
          }),
        );
        await expect(
          title(page, "06–08 Unit Economics & Scenarios"),
        ).toBeVisible();
        await expect(
          commentsPanel(page).getByText(said.economics),
        ).toBeVisible();
      });
      await test.step("8 → 13 (a comment on the idea)", async () => {
        await pressNotification(page, said.idea);
        await expect(page).toHaveURL(at(ideaPath, threadOf(targets.idea)));
        await expect(title(page, "Sunday Kiosk")).toBeVisible();
        await expect(commentsPanel(page).getByText(said.idea)).toBeVisible();
      });
      await test.step("8 → 21 (a comment on a plan answer)", async () => {
        await pressNotification(page, said.planAnswer);
        await expect(page).toHaveURL(
          at(`${planPath}/items/1`, {
            q: "P.01.2",
            ...threadOf(targets.planAnswer),
          }),
        );
        await expect(title(page, "1 Executive Summary")).toBeVisible();
        await expect(
          commentsPanel(page).getByText(said.planAnswer),
        ).toBeVisible();
      });
      await test.step("8 → 23 (a comment on a slide)", async () => {
        await pressNotification(page, said.slide);
        await expect(page).toHaveURL(
          at(`${planPath}/pitch`, {
            variant: "five",
            ...threadOf(targets.slide),
          }),
        );
        await expect(title(page, "Pitch Deck")).toBeVisible();
        await expect(commentsPanel(page).getByText(said.slide)).toBeVisible();
      });
      await test.step("8 → 22 (a comment on an execution item)", async () => {
        await pressNotification(page, said.action);
        await expect(page).toHaveURL(
          at(`${planPath}/execution`, {
            item: rows.action.id,
            ...threadOf(targets.action),
          }),
        );
        await expect(title(page, "Execution")).toBeVisible();
        await expect(
          page.getByRole("heading", { level: 2, name: "Call the supplier" }),
        ).toBeVisible();
        await expect(commentsPanel(page).getByText(said.action)).toBeVisible();
      });
      await test.step("8 → 11 (a comment on the user's own self-analysis)", async () => {
        await pressNotification(page, said.ownSelfAnalysis);
        await expect(page).toHaveURL(
          at(`/w/${team.id}/self-analysis/WHY`, {
            q: "SA.WHY.1",
            ...threadOf(targets.ownSelfAnalysis),
          }),
        );
        await expect(title(page, "WHY")).toBeVisible();
        await expect(
          commentsPanel(page).getByText(said.ownSelfAnalysis),
        ).toBeVisible();
      });
      await test.step("8 → 12 (a reply on a member's shared self-analysis)", async () => {
        await pressNotification(page, said.sharedReply);
        await expect(page).toHaveURL(
          at(`/w/${team.id}/team/${beaId}`, threadOf(targets.shared)),
        );
        await expect(title(page, "Team Self Analyses")).toBeVisible();
        await expect(
          commentsPanel(page).getByText(said.sharedReply),
        ).toBeVisible();
      });
      await test.step("8 → 13 (a decision)", async () => {
        await pressNotification(page, "Bea Cruz recorded Hold on Sunday Kiosk");
        await expect(page).toHaveURL(`${WEB_ORIGIN}${ideaPath}`);
        await expect(title(page, "Sunday Kiosk")).toBeVisible();
      });
      await test.step("8 → 20 (a Go / No-Go)", async () => {
        await pressNotification(
          page,
          "Bea Cruz recorded Delay on Plan A · Sunday Kiosk",
        );
        await expect(page).toHaveURL(`${WEB_ORIGIN}${planPath}`);
        await expect(title(page, "Plan A")).toBeVisible();
      });
      await test.step("8 → 20 (a saved version)", async () => {
        await pressNotification(
          page,
          "Bea Cruz saved the version “v1 For advisors” of Plan A · Sunday Kiosk",
        );
        await expect(page).toHaveURL(`${WEB_ORIGIN}${planPath}`);
        await expect(title(page, "Plan A")).toBeVisible();
      });

      const phonePage = bea.page;
      await test.step("5 → 8 → 11 on a phone (a comment on the member's own self-analysis)", async () => {
        await phonePage.goto(`/w/${team.id}`);
        await phonePage
          .getByRole("navigation", { name: "Main" })
          .getByRole("link", { name: /^Notifications/ })
          .tap();
        await expect(title(phonePage, "Notifications")).toBeVisible();
        await phonePage
          .getByRole("grid", { name: "Notifications" })
          .getByRole("row")
          .filter({ hasText: said.sharedRoot })
          .tap();
        await expect(phonePage).toHaveURL(
          at(`/w/${team.id}/self-analysis/WHY`, {
            q: "SA.WHY.1",
            ...threadOf(targets.shared),
          }),
        );
        await expect(title(phonePage, "WHY")).toBeVisible();
        // On a phone the panel is a tray over the screen (design-spec 3.8).
        await expect(
          phonePage
            .getByRole("dialog", { name: "Comments" })
            .getByText(said.sharedRoot),
        ).toBeVisible();
      });
      await test.step("8 once removed from the workspace: You no longer have access", async () => {
        const removed = await page.request.delete(
          `/api/v1/workspaces/${team.id}/members/${beaId}`,
          // Bodyless, yet declared JSON as every state change must be (SDD 7.2 CSRF).
          {
            headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
          },
        );
        expect(removed.status(), await removed.text()).toBe(204);
        await phonePage.goto("/notifications");
        // The Owner's Proceed, which no longer names the idea it is on.
        const row = phonePage
          .getByRole("grid", { name: "Notifications" })
          .getByRole("row")
          .filter({ hasText: "Test Person recorded a decision" });
        await expect(row).not.toContainText("Sunday Kiosk");
        await row.tap();
        await expect(
          phonePage.getByText("You no longer have access"),
        ).toBeVisible();
        await expect(phonePage).toHaveURL(`${WEB_ORIGIN}/notifications`);
      });
    } finally {
      await bea.context.close();
    }
  });
});

/** The link of the row of 5's Recent activity that reads `text`. */
const activityEntry = (page: Page, text: string) =>
  page
    .getByRole("region", { name: "Recent activity", exact: true })
    .getByRole("listitem")
    .filter({ hasText: text })
    .getByRole("link");

test.describe("5's Recent activity", () => {
  test.use(desktop);

  test("each kind of entry opens its place: a change its item, a comment with its thread, a decision 13, a Go / No-Go and a version 20", async ({
    page,
    signIn,
    account,
  }) => {
    const me = await signIn(account.email, account.password);
    const personal = me.memberships.find(
      ({ workspace }) => workspace.isPersonal,
    )?.workspace;
    if (personal === undefined) throw new Error("No personal workspace");
    const request = page.request;
    const name = `Plaza Kiosk ${Date.now() % 1_000_000}`;
    const { idea, validationId } = await newIdea(request, personal.id, name);
    await send(
      request,
      "put",
      `/api/v1/validations/${validationId}/answers/V.01.WHO`,
      { text: "Families at the plaza on Sundays.", lockVersion: 0 },
    );
    const entry = await send<{ id: string }>(
      request,
      "post",
      `/api/v1/validations/${validationId}/research-log`,
      { topic: "Sunday foot traffic" },
    );
    const research: TargetRef = { type: "research_log_entry", id: entry.id };
    const note = "Count the second Sunday too.";
    await comment(request, personal.id, research, note);
    const { planId } = await proceedToPlan(request, idea.id);
    await send(request, "post", `/api/v1/plans/${planId}/versions`, {
      name: "v1 For advisors",
    });
    await send(request, "post", `/api/v1/plans/${planId}/go-no-go`, {
      value: "delay",
      reason: "Wait for the plaza's permit.",
    });
    const dashboard = `/w/${personal.id}`;
    const ideaPath = `${dashboard}/ideas/${idea.id}`;
    const planPath = `${ideaPath}/plans/${planId}`;

    await test.step("5 → 11 (Recent activity: a change)", async () => {
      await page.goto(dashboard);
      await activityEntry(page, "Test Person changed 01 WHO").click();
      await expect(page).toHaveURL(
        at(`${ideaPath}/questions/01`, { q: "V.01.WHO" }),
      );
      await expect(title(page, "01 Customer & Problem")).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Answer to WHO" }),
      ).toHaveValue("Families at the plaza on Sundays.");
    });
    await test.step("5 → 14 (Recent activity: a comment)", async () => {
      await page.goto(dashboard);
      await activityEntry(
        page,
        "Test Person commented on Research Log · Sunday foot traffic",
      ).click();
      await expect(page).toHaveURL(
        at(`${ideaPath}/research`, {
          entry: entry.id,
          ...threadOf(research),
        }),
      );
      await expect(title(page, "03 Research Log")).toBeVisible();
      await expect(commentsPanel(page).getByText(note)).toBeVisible();
    });
    await test.step("5 → 13 (Recent activity: a decision)", async () => {
      await page.goto(dashboard);
      await activityEntry(page, "Test Person recorded Proceed").click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${ideaPath}`);
      await expect(title(page, name)).toBeVisible();
    });
    await test.step("5 → 20 (Recent activity: a Go / No-Go)", async () => {
      await page.goto(dashboard);
      await activityEntry(
        page,
        "Test Person recorded Go / No-Go: Delay",
      ).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${planPath}`);
      await expect(title(page, "Plan A")).toBeVisible();
    });
    await test.step("5 → 20 (Recent activity: a saved version)", async () => {
      await page.goto(dashboard);
      await activityEntry(
        page,
        "Test Person saved the version “v1 For advisors”",
      ).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}${planPath}`);
      await expect(title(page, "Plan A")).toBeVisible();
    });
  });
});
