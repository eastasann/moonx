import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IdeaSummary, Me, PitchDeck, PlanSummary } from "@moonx/schemas";
import type { Page } from "@playwright/test";
import { PWA_ORIGIN } from "./env";
import { DEMO_PASSWORD, demo, expect, test } from "./fixtures";

// The API that serves the build runs with NODE_ENV=production, as the image does
// (apps/api/Dockerfile, SDD 2章「環境変数」, e2e/playwright.config.ts). Elysia, Better Auth
// and React then take their production branches, and these tests hold what those change
// to the docs: a failed validation keeps 8.1's shape (Elysia's own production message
// leaves out the details), the failures Elysia raises reach 8.1's shape through the API's
// error handler (in development Bun would answer a thrown one with its own page), signing
// in gives 2章's cookie, and react-pdf renders P13's PDF with React's production build.
// pwa.spec.ts runs the Web against the same API.

/** Each page of the PDF at `path`: its text, and its footer's alone (read-pdf.ts). */
const pdfPages = (path: string) =>
  JSON.parse(
    execFileSync(
      "bun",
      [fileURLToPath(new URL("./read-pdf.ts", import.meta.url)), path],
      { timeout: 60_000 },
    ).toString(),
  ) as { text: string; footer: string }[];

/** A plan of the demo data the viewer can read (design-spec 8章), through I1 and P1. */
async function viewersPlan(page: Page, me: Me): Promise<PlanSummary> {
  for (const { workspace } of me.memberships) {
    const ideas = await page.request.get(
      `/api/v1/workspaces/${workspace.id}/ideas?decision=all&limit=50`,
    );
    expect(ideas.ok(), await ideas.text()).toBe(true);
    for (const idea of ((await ideas.json()) as { items: IdeaSummary[] })
      .items) {
      const plans = await page.request.get(`/api/v1/ideas/${idea.id}/plans`);
      expect(plans.ok(), await plans.text()).toBe(true);
      const [plan] = ((await plans.json()) as { items: PlanSummary[] }).items;
      if (plan !== undefined) return plan;
    }
  }
  throw new Error("The demo data has no plan the viewer can read");
}

test.describe("the API under NODE_ENV=production", () => {
  test("signing in sets the session cookie of SDD 2章", async ({
    page,
    signIn,
  }) => {
    const me = await signIn(demo.viewer, DEMO_PASSWORD);

    expect(me.email).toBe(demo.viewer);
    const session = (await page.context().cookies()).find(
      ({ name }) => name === "moonx.session_token",
    );
    // HTTP here, as locally: Secure and the __Secure- prefix are staging's and
    // production's, which Better Auth's production branch must not decide alone.
    expect(session).toMatchObject({
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    });
  });

  test("a request that fails validation gets 8.1's error with its details", async ({
    page,
    signIn,
  }) => {
    const plan = await viewersPlan(
      page,
      await signIn(demo.viewer, DEMO_PASSWORD),
    );

    const response = await page.request.get(
      `/api/v1/plans/${plan.id}/pitch-deck?variant=three`,
    );

    expect(response.status()).toBe(422);
    const { error } = (await response.json()) as {
      error: {
        code: string;
        message: string;
        requestId: string;
        details: { path: string; code: string; message: string }[];
      };
    };
    expect(error).toEqual({
      code: "VALIDATION_FAILED",
      message: expect.stringMatching(/^Invalid query: variant /),
      requestId: response.headers()["x-request-id"],
      details: [
        {
          path: "variant",
          code: expect.any(String),
          message: expect.any(String),
        },
      ],
    });
    // Elysia's production message names the value found, never the caller's details.
    expect(error.message).not.toContain('"found"');
  });

  test("a body that is not JSON and a path no route has get 8.1's errors", async ({
    page,
    signIn,
  }) => {
    await signIn(demo.viewer, DEMO_PASSWORD);

    const unreadable = await page.request.patch("/api/v1/me", {
      headers: { Origin: PWA_ORIGIN, "Content-Type": "application/json" },
      // A Buffer goes as it is: Playwright would send a string as a JSON string.
      data: Buffer.from('{"displayName":'),
    });
    const missing = await page.request.get("/api/v1/no-such-route");

    for (const [response, status, code] of [
      [unreadable, 400, "BAD_REQUEST"],
      [missing, 404, "NOT_FOUND"],
    ] as const) {
      expect(response.status()).toBe(status);
      expect(response.headers()["content-type"]).toContain("application/json");
      expect(await response.json()).toEqual({
        error: {
          code,
          message: expect.any(String),
          requestId: response.headers()["x-request-id"],
        },
      });
    }
  });

  test("P13 makes the PDF of P12's slides", async ({ page, signIn }) => {
    const plan = await viewersPlan(
      page,
      await signIn(demo.viewer, DEMO_PASSWORD),
    );
    const deck = await page.request.get(
      `/api/v1/plans/${plan.id}/pitch-deck?variant=five`,
    );
    expect(deck.ok(), await deck.text()).toBe(true);
    const { slides, footer } = (await deck.json()) as PitchDeck;

    const response = await page.request.get(
      `/api/v1/plans/${plan.id}/pitch-deck.pdf?variant=five`,
    );

    expect(response.status(), await response.text()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    const bytes = await response.body();
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const dir = await mkdtemp(join(tmpdir(), "moonx-production-"));
    try {
      const file = join(dir, "deck.pdf");
      await writeFile(file, bytes);
      const pages = pdfPages(file);
      expect(pages).toHaveLength(slides.length);
      const prefix = `${footer.businessName} · ${footer.versionLabel} · `;
      for (const { footer: printed } of pages) {
        expect(printed.slice(0, prefix.length)).toBe(prefix);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
