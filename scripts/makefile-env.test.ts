import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Runs the real Makefile's .env loader in a scratch directory. A second makefile adds a
// target that prints what the recipes would receive.
const makefile = join(import.meta.dir, "..", "Makefile");
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "moonx-makefile-env-"));
  writeFileSync(
    join(dir, "print.mk"),
    "print-env:\n\t@env | grep '^MOONX_T_' | sort\n",
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function make(envFile: string, env: Record<string, string> = {}) {
  writeFileSync(join(dir, ".env"), envFile);
  const result = Bun.spawnSync(
    [
      "make",
      "--no-print-directory",
      "-f",
      makefile,
      "-f",
      "print.mk",
      "print-env",
    ],
    {
      cwd: dir,
      env: { PATH: process.env.PATH ?? "", ...env },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("values", () => {
  test("are read as Bun reads them", () => {
    const result = make(
      [
        "# comment",
        "",
        "MOONX_T_PLAIN=abc",
        "MOONX_T_SPACES=  padded  ",
        'MOONX_T_DOUBLE="moonx <no-reply@localhost>"',
        "MOONX_T_SINGLE='single quoted'",
        'MOONX_T_INNER_SPACES="  kept  "',
        'MOONX_T_QUOTED_COMMENT="kept" # dropped',
        "MOONX_T_COMMENT=value # dropped",
        "MOONX_T_HASH=before#after",
        "MOONX_T_EMPTY=",
        "MOONX_T_TWICE=first",
        "MOONX_T_TWICE=last",
        "",
      ].join("\n"),
    );

    expect(result.stderr).toBe("");
    expect(result.stdout.split("\n").filter(Boolean)).toEqual([
      "MOONX_T_COMMENT=value",
      "MOONX_T_DOUBLE=moonx <no-reply@localhost>",
      "MOONX_T_EMPTY=",
      "MOONX_T_HASH=before",
      "MOONX_T_INNER_SPACES=  kept  ",
      "MOONX_T_PLAIN=abc",
      "MOONX_T_QUOTED_COMMENT=kept",
      "MOONX_T_SINGLE=single quoted",
      "MOONX_T_SPACES=padded",
      "MOONX_T_TWICE=last",
    ]);
  });

  test("give way to the environment", () => {
    const result = make("MOONX_T_PLAIN=from-file\n", {
      MOONX_T_PLAIN: "from-env",
    });

    expect(result.stdout).toBe("MOONX_T_PLAIN=from-env\n");
  });
});

describe("lines the Makefile cannot read like Bun", () => {
  test.each([
    ["a dollar sign", "MOONX_T_A=pa$word"],
    ["a dollar sign in quotes", "MOONX_T_A='pa$word'"],
    ["a hash inside double quotes", 'MOONX_T_A="a#b"'],
    ["a hash inside single quotes", "MOONX_T_A='a#b'"],
    ["a backslash inside double quotes", 'MOONX_T_A="a\\nb"'],
    ["an unclosed double quote", 'MOONX_T_A="multi\nline"'],
    ["an unclosed single quote", "MOONX_T_A='multi\nline'"],
    ["backtick quotes", "MOONX_T_A=`abc`"],
    ["an export prefix", "export MOONX_T_A=1"],
    ["spaces around =", "MOONX_T_A = 1"],
  ])("stop make on %s, naming only the line", (_, line) => {
    const result = make(`MOONX_T_OK=1\n${line}\n`);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/\.env line\(s\) 2[ :]/);
    expect(result.stderr).not.toContain("word");
  });
});
