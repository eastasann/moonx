import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkScreens, checkSource } from "./check-screens";

const messages = (code: string) =>
  checkSource(code, "screen.tsx").map(({ line, column, message }) => ({
    line,
    column,
    kind: message.startsWith("style") ? "style" : "text",
  }));

describe("style attributes", () => {
  test.each([
    ["an object", "<div style={{ color: 'red' }} />"],
    ["a variable", "<Box style={styles} />"],
    ["a string", '<div style="color: red" />'],
  ])("reports %s", (_, jsx) => {
    expect(messages(`const a = ${jsx};`)).toEqual([
      { line: 1, column: 16, kind: "style" },
    ]);
  });

  test("allows other props", () => {
    expect(
      messages('const a = <Flex gap="space-300" className={x} />;'),
    ).toEqual([]);
  });
});

describe("raw strings", () => {
  test("reports JSX text with its position", () => {
    expect(messages("const a = (\n  <p>\n    Hello\n  </p>\n);")).toEqual([
      { line: 2, column: 6, kind: "text" },
    ]);
  });

  test.each([
    ["a string child", '<p>{"Hello"}</p>'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: JSX source under test
    ["a template child", "<p>{`Hello ${name}`}</p>"],
    ["a conditional branch", '<p>{done ? t("done") : "Pending"}</p>'],
    ["a logical fallback", '<p>{name ?? "Anonymous"}</p>'],
    ["a fragment child", "<>Hello</>"],
    ["a cast", '<p>{"Hello" as string}</p>'],
    ["a label prop", '<TextField label="Name" />'],
    ["an aria-label prop in braces", '<Button aria-label={"Close"} />'],
    ["a placeholder template", "<SearchField placeholder={`Search`} />"],
    ["a children prop", '<Text children="Hello" />'],
    ["an alt prop", '<img alt="Logo" />'],
  ])("reports %s", (_, jsx) => {
    expect(messages(`const a = ${jsx};`)).toHaveLength(1);
  });

  test.each([
    ["catalog lookups", '<p title={t("a")}>{t("validation:home.title")}</p>'],
    ["whitespace text and spacers", '<p>\n  {t("a")}{" "}{t("b")}\n</p>'],
    [
      "non-text props",
      '<Button variant="primary" size="M" type="submit" href="/w" />',
    ],
    ["formatted values", "<p>{formatMoney(amount, currency)}</p>"],
    ["an empty template in a text prop", "<TextField label={``} />"],
  ])("allows %s", (_, jsx) => {
    expect(messages(`const a = ${jsx};`)).toEqual([]);
  });

  test("allows strings outside JSX", () => {
    expect(messages('const key = "validation:home.title";')).toEqual([]);
  });

  test("reports both branches of a conditional", () => {
    expect(messages('const a = <p>{ok ? "Yes" : "No"}</p>;')).toHaveLength(2);
  });
});

describe("checkScreens", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "moonx-check-screens-"));
    mkdirSync(join(dir, "routes"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("checks nested TSX and JSX files and skips tests and plain TS", () => {
    writeFileSync(
      join(dir, "routes", "home.tsx"),
      "export const A = () => <p>Hello</p>;\n",
    );
    writeFileSync(
      join(dir, "legacy.jsx"),
      "export const B = () => <div style={{}} />;\n",
    );
    writeFileSync(
      join(dir, "routes", "home.test.tsx"),
      "render(<p>Fixture</p>);\n",
    );
    writeFileSync(join(dir, "copy.ts"), 'export const C = "Not JSX";\n');

    expect(checkScreens(dir, dir)).toEqual([
      {
        file: "legacy.jsx",
        line: 1,
        column: 29,
        message: expect.stringMatching(/^style/),
      },
      {
        file: "routes/home.tsx",
        line: 1,
        column: 27,
        message: expect.stringMatching(/^raw/),
      },
    ]);
  });

  test("the command fails on findings and passes on a clean tree", () => {
    const run = () =>
      Bun.spawnSync(["bun", join(import.meta.dir, "check-screens.ts"), dir], {
        stderr: "pipe",
      });
    writeFileSync(
      join(dir, "clean.tsx"),
      'export const A = () => <p>{t("a")}</p>;\n',
    );
    expect(run().exitCode).toBe(0);

    writeFileSync(
      join(dir, "dirty.tsx"),
      "export const B = () => <p>Hello</p>;\n",
    );
    const result = run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain(
      "dirty.tsx:1:27 raw string in JSX",
    );
  });
});
