import type { Me } from "@moonx/schemas";
import { test as base, expect } from "@playwright/test";
import { WEB_ORIGIN } from "./env";

/** Every demo user's password (design-spec 8.1). */
export const DEMO_PASSWORD = "moonx-demo-2026";

/** The demo users of design-spec 8.1, by their part in BCDX. */
export const demo = {
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
  /** Signs the page in through the API as a demo user and returns them (U1). */
  signIn: (email: string) => Promise<Me>;
}>({
  context: async ({ context }, use, testInfo) => {
    await context.setExtraHTTPHeaders({
      "X-Forwarded-For": nextAddress(testInfo.workerIndex),
    });
    await use(context);
  },
  signIn: async ({ page }, use) => {
    await use(async (email) => {
      // The page's request context shares its cookies, so the page is signed in too.
      const signedIn = await page.request.post("/api/auth/sign-in/email", {
        data: { email, password: DEMO_PASSWORD },
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
