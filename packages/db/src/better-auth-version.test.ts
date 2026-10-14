import { expect, test } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";

const ROOT = join(import.meta.dir, "../../..");

// The seed hashes passwords with better-auth/crypto, and the API verifies them with
// Better Auth: one exact version everywhere keeps the two hash formats the same.
test("every workspace pins better-auth to the same exact version", async () => {
  const versions = new Map<string, string>();
  const paths = [
    "package.json",
    ...(await Array.fromAsync(
      new Glob("{apps,packages}/*/package.json").scan(ROOT),
    )),
  ];
  for (const path of paths) {
    const manifest = await Bun.file(join(ROOT, path)).json();
    const version =
      manifest.dependencies?.["better-auth"] ??
      manifest.devDependencies?.["better-auth"];
    if (version !== undefined) versions.set(path, version);
  }
  expect(versions.get("packages/db/package.json")).toMatch(/^\d+\.\d+\.\d+$/);
  expect(new Set(versions.values()).size).toBe(1);
});
