import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureEnvFile, envValue, randomSecret } from "./setup-env";

let dir: string;
const env = () => readFileSync(join(dir, ".env"), "utf8");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "moonx-setup-env-"));
  writeFileSync(
    join(dir, ".env.example"),
    "APP_ENV=local\nBETTER_AUTH_SECRET=\nLOG_LEVEL=debug\n",
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("ensureEnvFile", () => {
  test("copies the example and fills the empty secret", () => {
    expect(ensureEnvFile(dir, () => "generated")).toEqual({
      created: true,
      secretFilled: true,
    });
    expect(env()).toBe(
      "APP_ENV=local\nBETTER_AUTH_SECRET=generated\nLOG_LEVEL=debug\n",
    );
  });

  test("keeps an existing .env and its secret", () => {
    writeFileSync(
      join(dir, ".env"),
      "APP_ENV=local\nBETTER_AUTH_SECRET=mine\nPORT=3100\n",
    );

    expect(ensureEnvFile(dir, () => "generated")).toEqual({
      created: false,
      secretFilled: false,
    });
    expect(env()).toBe("APP_ENV=local\nBETTER_AUTH_SECRET=mine\nPORT=3100\n");
  });

  test("fills an empty secret in an existing .env without touching other lines", () => {
    writeFileSync(
      join(dir, ".env"),
      "PORT=3100\nBETTER_AUTH_SECRET=  \nAPP_ENV=local\n",
    );

    expect(ensureEnvFile(dir, () => "generated")).toEqual({
      created: false,
      secretFilled: true,
    });
    expect(env()).toBe(
      "PORT=3100\nBETTER_AUTH_SECRET=generated\nAPP_ENV=local\n",
    );
  });

  test.each([
    ["empty quotes", 'BETTER_AUTH_SECRET=""'],
    ["empty single quotes", "BETTER_AUTH_SECRET=''"],
    ["only a comment", "BETTER_AUTH_SECRET= # fill me"],
    ["blank quotes", 'BETTER_AUTH_SECRET="  "'],
  ])("treats a secret of %s as empty", (_, line) => {
    writeFileSync(join(dir, ".env"), `APP_ENV=local\n${line}\n`);

    expect(ensureEnvFile(dir, () => "generated").secretFilled).toBe(true);
    expect(env()).toBe("APP_ENV=local\nBETTER_AUTH_SECRET=generated\n");
  });

  test("fills the last of two secret lines, which is the one in effect", () => {
    writeFileSync(
      join(dir, ".env"),
      "BETTER_AUTH_SECRET=mine\nBETTER_AUTH_SECRET=\n",
    );

    expect(ensureEnvFile(dir, () => "generated").secretFilled).toBe(true);
    expect(env()).toBe(
      "BETTER_AUTH_SECRET=mine\nBETTER_AUTH_SECRET=generated\n",
    );
  });

  test("keeps a quoted secret", () => {
    writeFileSync(join(dir, ".env"), 'BETTER_AUTH_SECRET="mine"\n');

    expect(ensureEnvFile(dir, () => "generated").secretFilled).toBe(false);
  });

  test("adds the secret line when an existing .env lacks it", () => {
    writeFileSync(join(dir, ".env"), "APP_ENV=local");

    ensureEnvFile(dir, () => "generated");
    expect(env()).toBe("APP_ENV=local\nBETTER_AUTH_SECRET=generated\n");
  });
});

describe("randomSecret", () => {
  test("is 32 random bytes in base64", () => {
    const secret = randomSecret();

    expect(Buffer.from(secret, "base64")).toHaveLength(32);
    expect(new TextEncoder().encode(secret).length).toBeGreaterThanOrEqual(32);
    expect(randomSecret()).not.toBe(secret);
  });
});

describe("envValue", () => {
  test.each([
    ["abc", "abc"],
    ["  abc  ", "abc"],
    ["abc # comment", "abc"],
    ["abc#def", "abc"],
    ['"a b # c" # comment', "a b # c"],
    ["'q'", "q"],
    ['""', ""],
    ["", ""],
  ])("reads %p as %p", (raw, value) => {
    expect(envValue(raw)).toBe(value);
  });
});
