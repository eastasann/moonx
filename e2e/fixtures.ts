import { readFile } from "node:fs/promises";
import type { Me, Workspace } from "@moonx/schemas";
import {
  request as apiRequest,
  test as base,
  expect,
  type Page,
} from "@playwright/test";
import { API_LOG, WEB_ORIGIN } from "./env";

/** Every demo user's password (design-spec 8.1). */
export const DEMO_PASSWORD = "moonx-demo-2026";

/** The demo users of design-spec 8.1, by their part in BCDX, and the operator. */
export const demo = {
  operator: "admin@moonx.example",
  owner: "ana@bcdx.example",
  member: "kenji@bcdx.example",
  otherMember: "paolo@bcdx.example",
  viewer: "grace@advisor.example",
} as const;

// Counted per worker; with the worker's index each test gets an address of its own.
let tests = 0;

/**
 * A test's own caller address (docs/03_dev-setup.md 7章): the API limits sign-ins per
 * address (SDD 7.2), and with nothing in front of it locally, the right-most
 * X-Forwarded-For a request sends is the address it counts.
 */
export function nextAddress(workerIndex: number) {
  tests += 1;
  return `10.${workerIndex % 256}.${Math.floor(tests / 256) % 256}.${tests % 256}`;
}

export const test = base.extend<{
  /**
   * Signs the page in through the API, as a demo user unless a password is given, and
   * returns them (U1).
   */
  signIn: (email: string, password?: string) => Promise<Me>;
}>({
  context: async ({ context }, use, testInfo) => {
    await context.setExtraHTTPHeaders({
      "X-Forwarded-For": nextAddress(testInfo.workerIndex),
    });
    await use(context);
  },
  signIn: async ({ page }, use) => {
    await use(async (email, password = DEMO_PASSWORD) => {
      // The page's request context shares its cookies, so the page is signed in too.
      const signedIn = await page.request.post("/api/auth/sign-in/email", {
        data: { email, password },
        headers: { Origin: WEB_ORIGIN },
      });
      expect(signedIn.ok(), await signedIn.text()).toBe(true);
      const me = await page.request.get("/api/v1/me");
      expect(me.ok()).toBe(true);
      return (await me.json()) as Me;
    });
  },
});

export { expect };

/**
 * The workspace of `me` named `name`, as the seed names them.
 *
 * @throws {Error} when the user belongs to none by that name.
 */
export function workspaceOf(me: Me, name: string) {
  const membership = me.memberships.find(
    ({ workspace }) => workspace.name === name,
  );
  if (membership === undefined) throw new Error(`No workspace ${name}`);
  return membership.workspace;
}

/** A mail the e2e API sent, as its console transport logs it (SDD 2章 MAIL_TRANSPORT). */
export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** The mails the e2e API has sent to `to`, oldest first (env.ts API_LOG). */
export async function mailsTo(to: string): Promise<Mail[]> {
  // Nothing written yet is no mail; any other failure to read is the setup's to report.
  const log = await readFile(API_LOG, "utf8").catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  });
  return log.split("\n").flatMap((line): Mail[] => {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return [];
    }
    const { message, to: recipient, subject, text } = entry;
    return message === "mail" &&
      typeof recipient === "string" &&
      recipient.toLowerCase() === to.toLowerCase() &&
      typeof subject === "string" &&
      typeof text === "string"
      ? [{ to: recipient, subject, text }]
      : [];
  });
}

/**
 * The link `pattern` finds in the latest mail to `to` that has one, once it is sent.
 *
 * @throws {Error} when no such mail comes within 10 seconds.
 */
export async function linkMailedTo(to: string, pattern: RegExp): Promise<URL> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        link = (await mailsTo(to))
          .map(({ text }) => text.match(pattern)?.[0])
          .findLast((found) => found !== undefined);
        return link;
      },
      { timeout: 10_000 },
    )
    .toBeDefined();
  return new URL(link ?? "");
}

/** An address no test used before: each run and each test makes its own accounts. */
export function uniqueEmail(label: string) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e9)}@e2e.example`;
}

/** A context of its own for the API, as a browser of WEB_ORIGIN would call it. */
const apiAs = (workerIndex: number) =>
  apiRequest.newContext({
    baseURL: WEB_ORIGIN,
    extraHTTPHeaders: {
      Origin: WEB_ORIGIN,
      "X-Forwarded-For": nextAddress(workerIndex),
    },
  });

/**
 * Has BCDX's Owner invite `email` as a Member (W4) and returns the token of the link the
 * mail carries.
 */
export async function inviteToBcdx(email: string, workerIndex: number) {
  const owner = await apiAs(workerIndex);
  try {
    const signedIn = await owner.post("/api/auth/sign-in/email", {
      data: { email: demo.owner, password: DEMO_PASSWORD },
    });
    expect(signedIn.ok(), await signedIn.text()).toBe(true);
    const me = (await (await owner.get("/api/v1/me")).json()) as Me;
    const sent = await owner.post(
      `/api/v1/workspaces/${workspaceOf(me, "BCDX").id}/invitations`,
      { data: { email, role: "member" } },
    );
    expect(sent.status(), await sent.text()).toBe(201);
  } finally {
    await owner.dispose();
  }
  const link = await linkMailedTo(email, /https?:\/\/\S+\/invite\/[\w-]+/);
  return link.pathname.replace("/invite/", "");
}

/** Signs up from the invitation of `token` through U5, outside any page. */
export async function signUpThroughApi(
  token: string,
  account: { displayName: string; password: string },
  workerIndex: number,
) {
  const visitor = await apiAs(workerIndex);
  try {
    const signedUp = await visitor.post(
      `/api/v1/invitations/by-token/${token}/sign-up`,
      { data: { ...account, timezone: "Asia/Manila" } },
    );
    expect(signedUp.status(), await signedUp.text()).toBe(201);
  } finally {
    await visitor.dispose();
  }
}

/**
 * A user of their own, signed up from an invitation to BCDX not yet accepted: a Member of
 * BCDX with a personal workspace no other test writes in.
 */
export async function newAccount(workerIndex: number, label: string) {
  const email = uniqueEmail(label);
  const password = `${label}-password-2026`;
  const token = await inviteToBcdx(email, workerIndex);
  await signUpThroughApi(
    token,
    { displayName: "Test Person", password },
    workerIndex,
  );
  return { email, password, token };
}

/** An account of a test's own: its sign-in. */
export interface Account {
  email: string;
  password: string;
}

/**
 * A user of their own with only a personal workspace, signed up from the operator's
 * invitation without a workspace (AD9): BCDX's Owner sends the other specs' invitations,
 * 20 an hour for the whole run (SDD 7.2), and a spec using this takes none of them.
 */
export async function operatorInvited(
  workerIndex: number,
  label: string,
): Promise<Account> {
  const operator = await apiAs(workerIndex);
  const email = uniqueEmail(label);
  try {
    const signedIn = await operator.post("/api/auth/sign-in/email", {
      data: { email: demo.operator, password: DEMO_PASSWORD },
    });
    expect(signedIn.ok(), await signedIn.text()).toBe(true);
    const sent = await operator.post("/api/v1/admin/invitations", {
      data: { email },
    });
    expect(sent.status(), await sent.text()).toBe(201);
    const { link } = (await sent.json()) as { link: string };
    const token = new URL(link).pathname.replace("/invite/", "");
    const password = `${label}-password-2026`;
    await signUpThroughApi(
      token,
      { displayName: "Test Person", password },
      workerIndex,
    );
    return { email, password };
  } finally {
    await operator.dispose();
  }
}

/**
 * A team workspace of the page's user (W0) with a second person, signed up from its
 * invitation and in it as a Member (W4, U5, U6); `other` is signed in as them.
 */
export async function teamWithMember(
  page: Page,
  other: Page,
  workerIndex: number,
  { label, displayName }: { label: string; displayName: string },
): Promise<Workspace> {
  const made = await page.request.post("/api/v1/workspaces", {
    data: { name: `${label} ${Date.now() % 1_000_000}` },
    headers: { Origin: WEB_ORIGIN },
  });
  expect(made.status(), await made.text()).toBe(201);
  const workspace = (await made.json()) as Workspace;
  const email = uniqueEmail(`${label.toLowerCase()}-member`);
  const invited = await page.request.post(
    `/api/v1/workspaces/${workspace.id}/invitations`,
    { data: { email, role: "member" }, headers: { Origin: WEB_ORIGIN } },
  );
  expect(invited.status(), await invited.text()).toBe(201);
  const link = await linkMailedTo(email, /https?:\/\/\S+\/invite\/[\w-]+/);
  const token = link.pathname.replace("/invite/", "");
  const password = `${label.toLowerCase()}-member-2026`;
  await signUpThroughApi(token, { displayName, password }, workerIndex);
  const signedIn = await other.request.post("/api/auth/sign-in/email", {
    data: { email, password },
    headers: { Origin: WEB_ORIGIN },
  });
  expect(signedIn.ok(), await signedIn.text()).toBe(true);
  const accepted = await other.request.post(
    `/api/v1/invitations/by-token/${token}/accept`,
    { data: {}, headers: { Origin: WEB_ORIGIN } },
  );
  expect(accepted.ok(), await accepted.text()).toBe(true);
  return workspace;
}
