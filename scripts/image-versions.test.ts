import { expect, test } from "bun:test";
import { join } from "node:path";

// apps/api/Dockerfile names its Bun image apart from package.json's packageManager, the
// version CI and the tests install (03_dev-setup.md 1章, 04_deployment-procedure.md 2章).
// Changing one without the other would ship an image on a Bun nothing tested.

const root = join(import.meta.dir, "..");

test("the API image is on packageManager's Bun, pinned by digest", async () => {
  const manifest = (await Bun.file(join(root, "package.json")).json()) as {
    packageManager?: unknown;
  };
  const version = /^bun@(\d+\.\d+\.\d+)$/.exec(
    String(manifest.packageManager),
  )?.[1];
  expect(version).toBeDefined();

  const dockerfile = await Bun.file(
    join(root, "apps", "api", "Dockerfile"),
  ).text();
  const images = [...dockerfile.matchAll(/^FROM\s+(\S+)/gm)].map(
    ([, image]) => image,
  );

  expect(images.length).toBeGreaterThan(0);
  // Both stages: the dependencies the image installs come from the same Bun.
  expect(new Set(images).size).toBe(1);
  for (const image of images) {
    expect(image).toMatch(
      new RegExp(
        `^oven/bun:${(version ?? "").replaceAll(".", "\\.")}-slim@sha256:[0-9a-f]{64}$`,
      ),
    );
  }
});

// SDD 2章「環境変数」: the image runs its libraries' production branches, and so does the
// API the E2E tests of the built Web run against, which is how those branches get tested.
test("the image, its bundle and the E2E API serving the build run NODE_ENV=production", async () => {
  const read = (...path: string[]) => Bun.file(join(root, ...path)).text();
  expect(await read("apps", "api", "Dockerfile")).toMatch(
    /^ENV NODE_ENV=production\b/m,
  );
  // bun build would otherwise write "development" into the bundle the image runs.
  expect(await read("Makefile")).toContain(
    "--define='process.env.NODE_ENV=\"production\"'",
  );
  // The webServer env that hands the build to the API (WEB_DIST_DIR) is the PWA API's.
  const config = await read("e2e", "playwright.config.ts");
  const at = config.indexOf("WEB_DIST_DIR: PWA_WEB_DIR");
  const env = config.slice(
    config.lastIndexOf("env: {", at),
    config.indexOf("}", at),
  );
  expect(at).toBeGreaterThan(-1);
  expect(env).toContain('NODE_ENV: "production",');
});
