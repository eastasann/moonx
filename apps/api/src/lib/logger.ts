import type { AppConfig } from "../config";

type Level = AppConfig["logLevel"];
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const SEVERITY: Record<Level, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
};

/**
 * One JSON object per line on stdout; Cloud Logging reads `severity` and `message` (ADR-023).
 * Callers pass identifiers only, never bodies, answers or e-mail addresses (SDD 7.2).
 */
export interface Logger {
  log(level: Level, message: string, fields?: Record<string, unknown>): void;
}

/** A logger that writes lines at or above `level`; `write` is replaced in tests. */
export function createLogger(
  level: Level,
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger {
  return {
    log(at, message, fields = {}) {
      if (ORDER[at] < ORDER[level]) return;
      write(JSON.stringify({ severity: SEVERITY[at], message, ...fields }));
    },
  };
}
