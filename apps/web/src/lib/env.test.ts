import { describe, expect, test } from "vitest";
import { readWebEnv } from "./env";

const page = (head: string) =>
  new DOMParser().parseFromString(
    `<html><head>${head}</head></html>`,
    "text/html",
  );

describe("readWebEnv (ADR-004)", () => {
  test("reads the environment and the DSN the API writes", () => {
    expect(
      readWebEnv(
        page(
          '<meta name="moonx-app-env" content="production"><meta name="moonx-sentry-dsn" content=" https://k@o0.ingest.sentry.io/2 ">',
        ),
      ),
    ).toEqual({
      appEnv: "production",
      sentryDsn: "https://k@o0.ingest.sentry.io/2",
    });
  });

  test("Vite's dev server writes none: local, without Sentry", () => {
    expect(readWebEnv(page(""))).toEqual({ appEnv: "local", sentryDsn: null });
  });

  test("an empty DSN and an unknown environment read as none and local", () => {
    expect(
      readWebEnv(
        page(
          '<meta name="moonx-app-env" content="test"><meta name="moonx-sentry-dsn" content="">',
        ),
      ),
    ).toEqual({ appEnv: "local", sentryDsn: null });
  });
});
