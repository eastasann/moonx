import { describe, expect, test } from "bun:test";
import { createLogger } from "./log";

describe("createLogger", () => {
  test("writes one JSON object per line with Cloud Logging's severity names", () => {
    const lines: string[] = [];
    const log = createLogger("debug", (line) => lines.push(line));

    log.write("debug", "a");
    log.write("info", "b", { requestId: "r" });
    log.write("warn", "c");
    log.write("error", "d");

    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { severity: "DEBUG", message: "a" },
      { severity: "INFO", message: "b", requestId: "r" },
      { severity: "WARNING", message: "c" },
      { severity: "ERROR", message: "d" },
    ]);
    expect(lines.every((line) => !line.includes("\n"))).toBe(true);
  });

  test("drops lines below the minimum level", () => {
    const lines: string[] = [];
    const log = createLogger("warn", (line) => lines.push(line));

    log.write("debug", "a");
    log.write("info", "b");
    log.write("warn", "c");
    log.write("error", "d");

    expect(lines.map((line) => JSON.parse(line).message)).toEqual(["c", "d"]);
  });
});
