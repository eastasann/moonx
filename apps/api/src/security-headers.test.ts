import { describe, expect, test } from "bun:test";
import { securityHeaders, sentryConnectSource } from "./security-headers";

describe("the CSP's Sentry source (SDD 7.2)", () => {
  test("a DSN loadConfig would refuse stops a hand-built Config instead of dropping its source", () => {
    expect(() =>
      securityHeaders({
        appEnv: "test",
        webSentryDsn: "o1.ingest.us.sentry.io/2",
      }),
    ).toThrow("WEB_SENTRY_DSN has no origin a CSP can name");
    expect(sentryConnectSource("https://k@o1.ingest.us.sentry.io/2")).toBe(
      "https://o1.ingest.us.sentry.io",
    );
  });
});
