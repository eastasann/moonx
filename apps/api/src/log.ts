import type { LogLevel } from "./config";

// Cloud Logging reads `severity` from a JSON line and knows WARNING, not WARN.
const SEVERITY: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
};

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Writes one JSON object per line, the form Cloud Logging collects (SDD 8.3, ADR-023). */
export interface Logger {
  write(
    level: LogLevel,
    message: string,
    fields?: Record<string, unknown>,
  ): void;
}

/**
 * A logger that drops lines below `minLevel` (`LOG_LEVEL`). Tests pass `out` to read
 * the lines instead of standard output.
 */
export function createLogger(
  minLevel: LogLevel,
  out: (line: string) => void = (line) => console.log(line),
): Logger {
  return {
    write(level, message, fields = {}) {
      if (RANK[level] < RANK[minLevel]) return;
      out(JSON.stringify({ severity: SEVERITY[level], message, ...fields }));
    },
  };
}
