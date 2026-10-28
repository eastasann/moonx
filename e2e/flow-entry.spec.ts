import type { IdeaDetail, Me, Workspace } from "@moonx/schemas";
import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./env";
import {
  type Account,
  apiAs,
  test as base,
  DEMO_PASSWORD,
  demo,
  expect,
  linkMailedTo,
  operatorInvited,
  signUpThroughApi,
  uniqueEmail,
  workspaceOf,
} from "./fixtures";

// The transitions of docs/screen_flow.mermaid around signing in and the common navigation
// that no screen's own spec walks: the invitation's link when signed in, M9 and a session
// that ends (design-spec 5章「認証」), 4's own Log out and its way to 9, the sidebar and
// the TabBar between 5, 6, 8 and 10, 10's Team and 5's Getting started. The seeded BCDX is
// only read; what signs out, suspends or changes the workspace opened last is done by an
// account of the test's own.

const test = base.extend<object, { account: Account }>({
  account: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
    async ({}, use, workerInfo) => {
      await use(await operatorInvited(workerInfo.workerIndex, "flow-entry"));
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

const LANDING = "From idea to a plan you can show.";

/** Logs in on 2 with the form's email and password. */
async function logInWithForm(page: Page, { email, password }: Account) {
  const form = page.getByRole("form", { name: "Log in" });
  await form.getByRole("textbox", { name: /Email/ }).fill(email);
  await form.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

/** {@link apiAs}'s context, signed in as `account`. */
async function apiSignedIn(account: Account, workerIndex: number) {
  const context = await apiAs(workerIndex);
  const signedIn = await context.post("/api/auth/sign-in/email", {
    data: account,
  });
  expect(signedIn.ok(), await signedIn.text()).toBe(true);
  return context;
}

/**
 * Someone `inviter` invites as a Member to a team workspace it makes (W0, W4), signed up
 * from the mail's link (U5) but not yet joined (U6). The inviter's own invitations are
 * spent, not BCDX's Owner's or the operator's, which the whole run shares (SDD 7.2).
 */
async function invitee(inviter: Account, workerIndex: number, label: string) {
  const owner = await apiSignedIn(inviter, workerIndex);
  try {
    const made = await owner.post("/api/v1/workspaces", {
      data: { name: `${label} ${Date.now() % 1_000_000}` },
    });
    expect(made.status(), await made.text()).toBe(201);
    const workspace = (await made.json()) as Workspace;
    const email = uniqueEmail(label.toLowerCase());
    const invited = await owner.post(
      `/api/v1/workspaces/${workspace.id}/invitations`,
      { data: { email, role: "member" } },
    );
    expect(invited.status(), await invited.text()).toBe(201);
    const link = await linkMailedTo(email, /https?:\/\/\S+\/invite\/[\w-]+/);
    const token = link.pathname.replace("/invite/", "");
    const password = `${label.toLowerCase()}-password-2026`;
    await signUpThroughApi(
      token,
      { displayName: "Ivy Invited", password },
      workerIndex,
    );
    return { email, password, token, workspace };
  } finally {
    await owner.dispose();
  }
}

/** The personal workspace of `me`. */
function personalOf(me: Me) {
  const personal = me.memberships.find(({ workspace }) => workspace.isPersonal);
  if (personal === undefined) throw new Error("No personal workspace");
  return personal.workspace;
}

/** Makes an idea through I1 POST with the page's session. */
async function createIdea(page: Page, workspaceId: string, name: string) {
  const created = await page.request.post(
    `/api/v1/workspaces/${workspaceId}/ideas`,
    {
      data: { name, oneLineConcept: `${name}, in one line.` },
      headers: { Origin: WEB_ORIGIN },
    },
  );
  expect(created.status(), await created.text()).toBe(201);
  return (await created.json()) as IdeaDetail;
}

/** Ends the page's session on the server's side, as another tab's Log out would. */
async function signOutBehind(page: Page) {
  const signedOut = await page.request.post("/api/auth/sign-out", {
    headers: { Origin: WEB_ORIGIN, "content-type": "application/json" },
    data: {},
  });
  expect(signedOut.ok(), await signedOut.text()).toBe(true);
}

/**
 * 13 of a new idea with Edit summary open; once `endSession` has ended the session, a
 * word typed there cannot be saved and M9 opens over 13 (design-spec 6.0.2).
 */
async function m9Over13(
  page: Page,
  workspaceId: string,
  endSession: () => Promise<void>,
) {
  const idea = await createIdea(page, workspaceId, "Kakanin Corner");
  const path = `/w/${workspaceId}/ideas/${idea.id}`;
  await page.goto(path);
  await page.getByRole("button", { name: "Edit summary" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit summary" });
  await expect(sheet).toBeVisible();
  await endSession();
  await sheet
    .getByRole("textbox", { name: /^One-line concept/ })
    .fill("Typed after the session ended.");
  const m9 = page.getByRole("dialog", { name: "Sign in again" });
  await expect(m9).toBeVisible();
  return { idea, path, m9 };
}

/** M9's way to 2: "Sign in on the login page", then the same in "Leave this page?". */
async function leaveM9ForLogin(page: Page) {
  await page
    .getByRole("dialog", { name: "Sign in again" })
    .getByRole("button", { name: "Sign in on the login page" })
    .click();
  const leave = page.getByRole("alertdialog", { name: "Leave this page?" });
  await expect(leave).toContainText(
    "Unsaved changes on this page will be lost.",
  );
  await leave
    .getByRole("button", { name: "Sign in on the login page" })
    .click();
}

/** 2's URL with `search` (SDD 4章 `/login?next=&error=`). */
const loginUrl = (search: Record<string, string>) =>
  `${WEB_ORIGIN}/login?${new URLSearchParams(search)}`;

test.describe("on a desktop", () => {
  test.use(desktop);

  test("the invitation's link opened signed in: 3's ① alone, and Join to 5", async ({
    page,
    signIn,
    account,
  }, testInfo) => {
    const invited = await invitee(account, testInfo.workerIndex, "Joiners");
    await signIn(invited.email, invited.password);

    await test.step("INV → 3 (signed in: ① alone)", async () => {
      await page.goto(`/invite/${invited.token}`);
      await expect(page).toHaveURL(
        `${WEB_ORIGIN}/welcome?step=invite&token=${invited.token}`,
      );
      await expect(
        page.getByRole("heading", { level: 1, name: "Welcome" }),
      ).toBeVisible();
      await expect(
        page.getByRole("list", { name: "Steps" }).getByRole("listitem"),
      ).toHaveText([/Invitation/]);
      await expect(
        page.getByText(
          `Test Person invited you to join ${invited.workspace.name} on moonx as Member.`,
        ),
      ).toBeVisible();
    });

    await test.step("3 → 5 (Join)", async () => {
      await page.getByRole("button", { name: "Join" }).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}/w/${invited.workspace.id}`);
      await expect(
        page.getByRole("heading", { level: 1, name: invited.workspace.name }),
      ).toBeVisible();
    });
  });

  test("the session ends with nothing unsaved: the next move goes to 2, and logging in comes back to it", async ({
    page,
    signIn,
    account,
  }) => {
    const personal = personalOf(await signIn(account.email, account.password));
    await page.goto(`/w/${personal.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: personal.name }),
    ).toBeVisible();
    await signOutBehind(page);
    const ideas = `/w/${personal.id}/ideas`;

    await test.step("5 → 2 (the session gone, sidebar: Ideas)", async () => {
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Ideas", exact: true })
        .click();
      await expect(page).toHaveURL(loginUrl({ next: ideas }));
      await expect(
        page.getByRole("heading", { level: 1, name: "Log in" }),
      ).toBeVisible();
    });

    await test.step("2 → 6 (Log in, back where it was going)", async () => {
      await logInWithForm(page, account);
      await expect(page).toHaveURL(`${WEB_ORIGIN}${ideas}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Ideas" }),
      ).toBeVisible();
    });
  });

  test("M9 → 2 by Sign in on the login page: the unsaved input dropped, and logging in comes back to 13", async ({
    page,
    signIn,
    account,
  }) => {
    const personal = personalOf(await signIn(account.email, account.password));
    const { idea, path } = await m9Over13(page, personal.id, () =>
      signOutBehind(page),
    );

    await test.step("M9 → 2 (Sign in on the login page)", async () => {
      await leaveM9ForLogin(page);
      await expect(page).toHaveURL(loginUrl({ next: path }));
      await expect(
        page.getByRole("heading", { level: 1, name: "Log in" }),
      ).toBeVisible();
    });

    await test.step("2 → 13 (Log in, back where M9 was)", async () => {
      await logInWithForm(page, account);
      await expect(page).toHaveURL(`${WEB_ORIGIN}${path}`);
      await expect(
        page.getByRole("heading", { level: 1, name: idea.name }),
      ).toBeVisible();
      const saved = await page.request.get(`/api/v1/ideas/${idea.id}`);
      expect(((await saved.json()) as IdeaDetail).oneLineConcept).toBe(
        idea.oneLineConcept,
      );
    });
  });

  test("M9 → 2 for a Google user, whose only way is the login page", async ({
    page,
    signIn,
    account,
  }) => {
    // A Google sign-in cannot run here (docs/claude-code-prompts.md「どのステップにも共通の
    // 決まり」). U1's answer, rewritten by the route below to hasPassword: false, stands in
    // for an account without a password: M9 reads only that.
    await page.route("**/api/v1/me", async (route) => {
      const response = await route.fetch();
      if (route.request().method() !== "GET" || !response.ok()) {
        await route.fulfill({ response });
        return;
      }
      const me = (await response.json()) as Me;
      await route.fulfill({ response, json: { ...me, hasPassword: false } });
    });
    const personal = personalOf(await signIn(account.email, account.password));
    const { path, m9 } = await m9Over13(page, personal.id, () =>
      signOutBehind(page),
    );
    await expect(m9).toContainText(
      "Your session ended. You sign in with Google, so sign in on the login page.",
    );
    // No Email, Password or Sign in for them (design-spec 3.8 M9).
    await expect(m9.getByRole("textbox", { name: /^Email/ })).toHaveCount(0);
    await expect(m9.getByLabel(/^Password/)).toHaveCount(0);
    await expect(
      m9.getByRole("button", { name: "Sign in", exact: true }),
    ).toHaveCount(0);

    await test.step("M9 → 2 (Google: Sign in on the login page)", async () => {
      await leaveM9ForLogin(page);
      await expect(page).toHaveURL(loginUrl({ next: path }));
      await expect(
        page.getByRole("heading", { level: 1, name: "Log in" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Continue with Google" }),
      ).toBeVisible();
    });
  });

  test("M9 → 2 for an account suspended meanwhile, with its words", async ({
    page,
    signIn,
    account,
  }, testInfo) => {
    const invited = await invitee(account, testInfo.workerIndex, "Suspended");
    const me = await signIn(invited.email, invited.password);
    const { path, m9 } = await m9Over13(page, personalOf(me).id, async () => {
      // The operator's Suspend also ends the user's sessions (AD8, SDD ADR-010).
      const operator = await apiSignedIn(
        { email: demo.operator, password: DEMO_PASSWORD },
        testInfo.workerIndex,
      );
      try {
        const suspended = await operator.post(
          `/api/v1/admin/users/${me.id}/suspend`,
          { data: {} },
        );
        expect(suspended.ok(), await suspended.text()).toBe(true);
      } finally {
        await operator.dispose();
      }
    });

    await test.step("M9 → 2 (suspended: Sign in)", async () => {
      await m9.getByLabel(/^Password/).fill(invited.password);
      await m9.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(
        loginUrl({ next: path, error: "ACCOUNT_SUSPENDED" }),
      );
      await expect(
        page.getByRole("heading", { level: 1, name: "Log in" }),
      ).toBeVisible();
      await expect(page.getByRole("alert")).toHaveText(
        /This account is suspended/,
      );
    });
  });

  test("Ana in BCDX, read only: the sidebar between 5, 8, 6 and 10, 10's Team to 12, and 4's way to 9 while she is its last Owner", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const bcdx = workspaceOf(me, "BCDX");
    const dashboard = `${WEB_ORIGIN}/w/${bcdx.id}`;
    const nav = page.getByRole("navigation", { name: "Main" });
    const toDashboard = async () => {
      await nav.getByRole("link", { name: "Dashboard", exact: true }).click();
      await expect(page).toHaveURL(dashboard);
      await expect(
        page.getByRole("heading", { level: 1, name: "BCDX" }),
      ).toBeVisible();
    };
    const toSelfAnalysis = async () => {
      await nav
        .getByRole("link", { name: "Self Analysis", exact: true })
        .click();
      await expect(page).toHaveURL(`${dashboard}/self-analysis`);
      await expect(
        page.getByRole("heading", { level: 1, name: "My Self Analysis" }),
      ).toBeVisible();
    };
    await page.goto(dashboard);
    await expect(
      page.getByRole("heading", { level: 1, name: "BCDX" }),
    ).toBeVisible();

    await test.step("5 → 8 (sidebar: Notifications)", async () => {
      await nav.getByRole("link", { name: /^Notifications/ }).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}/notifications`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Notifications" }),
      ).toBeVisible();
    });
    await test.step("8 → 5 (sidebar: Dashboard)", toDashboard);

    await test.step("5 → 6 (sidebar: Ideas)", async () => {
      await nav.getByRole("link", { name: "Ideas", exact: true }).click();
      await expect(page).toHaveURL(`${dashboard}/ideas`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Ideas" }),
      ).toBeVisible();
    });
    await test.step("6 → 5 (sidebar: Dashboard)", toDashboard);

    await test.step("5 → 10 (sidebar: Self Analysis)", toSelfAnalysis);
    await test.step("10 → 5 (sidebar: Dashboard)", toDashboard);

    await test.step("5 → 10 (sidebar: Self Analysis)", toSelfAnalysis);
    await test.step("10 → 12 (Team)", async () => {
      await page.getByRole("button", { name: "Team", exact: true }).click();
      // Ana, the first who shared, beside the list (design-spec 6.11 12「並び」).
      await expect(page).toHaveURL(`${dashboard}/team/${me.id}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Team Self Analyses" }),
      ).toBeVisible();
    });

    await test.step("12 → 4 (account menu: Account)", async () => {
      await page
        .getByRole("button", { name: "Ana Villanueva", exact: true })
        .click();
      await page.getByRole("menuitem", { name: "Account" }).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}/account`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Account" }),
      ).toBeVisible();
    });

    await test.step("4 → 9 (deleting stopped: Open Workspace Settings of BCDX)", async () => {
      await expect(
        page.getByRole("button", { name: "Delete account" }),
      ).toBeDisabled();
      await expect(
        page.getByText("Make someone else Owner of BCDX first"),
      ).toBeVisible();
      await page
        .getByRole("link", { name: "Open Workspace Settings of BCDX" })
        .click();
      await expect(page).toHaveURL(`${dashboard}/settings`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Workspace Settings" }),
      ).toBeVisible();
    });
  });

  test("a workspace of the user's own with no ideas: Getting started to 10 and 9, then 4's own Log out to 1", async ({
    page,
    signIn,
    account,
  }) => {
    await signIn(account.email, account.password);
    const made = await page.request.post("/api/v1/workspaces", {
      data: { name: `Fresh start ${Date.now() % 1_000_000}` },
      headers: { Origin: WEB_ORIGIN },
    });
    expect(made.status(), await made.text()).toBe(201);
    const team = (await made.json()) as Workspace;
    const dashboard = `${WEB_ORIGIN}/w/${team.id}`;
    const gettingStarted = page.getByRole("list", { name: "Getting started" });
    await page.goto(dashboard);
    await expect(
      page.getByRole("heading", { level: 1, name: team.name }),
    ).toBeVisible();

    await test.step("5 → 10 (Getting started: Start your self analysis)", async () => {
      await gettingStarted
        .getByRole("link", { name: /Start your self analysis/ })
        .click();
      await expect(page).toHaveURL(`${dashboard}/self-analysis`);
      await expect(
        page.getByRole("heading", { level: 1, name: "My Self Analysis" }),
      ).toBeVisible();
    });

    await test.step("10 → 5 (sidebar: Dashboard)", async () => {
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Dashboard", exact: true })
        .click();
      await expect(page).toHaveURL(dashboard);
      await expect(
        page.getByRole("heading", { level: 1, name: team.name }),
      ).toBeVisible();
    });

    await test.step("5 → 9 (Getting started: Invite your team, Owner)", async () => {
      await gettingStarted
        .getByRole("link", { name: /Invite your team/ })
        .click();
      await expect(page).toHaveURL(`${dashboard}/settings`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Workspace Settings" }),
      ).toBeVisible();
    });

    await test.step("9 → 4 (account menu: Account)", async () => {
      await page
        .getByRole("button", { name: "Test Person", exact: true })
        .click();
      await page.getByRole("menuitem", { name: "Account" }).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}/account`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Account" }),
      ).toBeVisible();
    });

    await test.step("4 → 1 (4's own Log out)", async () => {
      await page.getByRole("button", { name: "Log out", exact: true }).click();
      await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
      await expect(
        page.getByRole("heading", { level: 1, name: LANDING }),
      ).toBeVisible();
      expect((await page.request.get("/api/v1/me")).status()).toBe(401);
    });
  });
});

test.describe("on a phone", () => {
  test.use(phone);

  test("Ana in BCDX, read only: the TabBar between 5, 6 and 10", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.owner);
    const dashboard = `${WEB_ORIGIN}/w/${workspaceOf(me, "BCDX").id}`;
    const tabs = page.getByRole("navigation", { name: "Main" });
    const toDashboard = async () => {
      await tabs.getByRole("link", { name: "Dashboard", exact: true }).tap();
      await expect(page).toHaveURL(dashboard);
      await expect(
        page.getByRole("heading", { level: 1, name: "BCDX" }),
      ).toBeVisible();
    };
    await page.goto(dashboard);
    await expect(
      page.getByRole("heading", { level: 1, name: "BCDX" }),
    ).toBeVisible();

    await test.step("5 → 6 (TabBar: Ideas)", async () => {
      await tabs.getByRole("link", { name: "Ideas", exact: true }).tap();
      await expect(page).toHaveURL(`${dashboard}/ideas`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Ideas" }),
      ).toBeVisible();
    });
    await test.step("6 → 5 (TabBar: Dashboard)", toDashboard);

    await test.step("5 → 10 (TabBar: Self Analysis)", async () => {
      await tabs
        .getByRole("link", { name: "Self Analysis", exact: true })
        .tap();
      await expect(page).toHaveURL(`${dashboard}/self-analysis`);
      await expect(
        page.getByRole("heading", { level: 1, name: "My Self Analysis" }),
      ).toBeVisible();
    });
    await test.step("10 → 5 (TabBar: Dashboard)", toDashboard);
  });
});
