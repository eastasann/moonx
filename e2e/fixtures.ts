import { type BrowserContext, test as base, expect } from "@playwright/test";

/**
 * Better Auth counts log in attempts per client address, and every request here comes from the
 * same machine, so one minute of tests would hit its limit of ten. The Worker sets
 * `CF-Connecting-IP` in production; the tests set it themselves, a different one for each test.
 */
function addressOf(testId: string): string {
  let hash = 0;
  for (const char of testId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `10.20.${(hash >>> 8) % 250}.${hash % 250}`;
}

export const test = base.extend<{ guest: () => Promise<BrowserContext> }>({
  context: async ({ context }, use, testInfo) => {
    await context.setExtraHTTPHeaders({ "cf-connecting-ip": addressOf(testInfo.testId) });
    await use(context);
  },
  /** A second browser, signed in as nobody, for the other side of an invitation. */
  guest: async ({ browser }, use, testInfo) => {
    const created: BrowserContext[] = [];
    await use(async () => {
      const guest = await browser.newContext({
        extraHTTPHeaders: { "cf-connecting-ip": addressOf(`${testInfo.testId}-guest`) },
      });
      created.push(guest);
      return guest;
    });
    await Promise.all(created.map((guest) => guest.close()));
  },
});

export { expect };
