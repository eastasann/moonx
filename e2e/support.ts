import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import postgres from "postgres";
import { DATABASE_URL, WEB_ORIGIN } from "./env";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);

export const DEMO_PASSWORD = "moonx-demo-2026";

/** Runs a query against the test database, for what the screens never show (ids, tokens). */
export async function query<Row extends Record<string, unknown>>(
  text: string,
  params: string[] = [],
): Promise<Row[]> {
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    return (await sql.unsafe(text, params)) as unknown as Row[];
  } finally {
    await sql.end();
  }
}

/** Submits the log in form and returns without waiting, for a log in that is expected to fail. */
export async function attemptLogIn(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** Logs in and waits until the app has moved on from the log in screen. */
export async function logIn(page: Page, email: string, password = DEMO_PASSWORD) {
  await attemptLogIn(page, email, password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** `make admin-create`: the link that registers an operator. */
export function operatorInvitationLink(email: string): string {
  const output = execFileSync("bun", ["run", "--cwd", "apps/api", "admin-create", email], {
    cwd: root,
    env: {
      ...process.env,
      APP_ENV: "local",
      DATABASE_URL: DATABASE_URL,
      BETTER_AUTH_URL: WEB_ORIGIN,
    },
    encoding: "utf8",
  });
  const link = output.split("\n").find((line) => line.startsWith("http"));
  if (!link) throw new Error(`no invitation link in: ${output}`);
  return link.trim();
}

/**
 * Fails on any accessibility violation axe finds on the page as it stands. React Aria's own
 * announcer (`role="log"`, filled when a message is spoken) holds images with no text, which axe
 * reports; it is a library internal and is left out.
 */
export async function expectNoAxeViolations(page: Page) {
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.addScriptTag({ path: require.resolve("axe-core") });
  const violations = await page.evaluate(async () => {
    const result = await (
      globalThis as unknown as {
        axe: {
          run: (context: {
            exclude: string[][];
          }) => Promise<{ violations: { id: string; nodes: { html: string }[] }[] }>;
        };
      }
    ).axe.run({ exclude: [['[role="log"]']] });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
  });
  expect(violations).toEqual([]);
}
