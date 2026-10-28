import type { BrowserOptions, ErrorEvent } from "@sentry/browser";
import { describe, expect, test } from "vitest";
import { redactUrl, reportError, scrubEvent, startSentry } from "./sentry";

/** What a transport is handed to send. */
type Envelope = Parameters<
  ReturnType<NonNullable<BrowserOptions["transport"]>>["send"]
>[0];

describe("redactUrl (SDD 7.2「個人情報」)", () => {
  test("keeps the origin and path, drops the query and the fragment", () => {
    expect(
      redactUrl("https://moonx.example/w/1?modal=switch-workspace#ideas"),
    ).toBe("https://moonx.example/w/1");
    expect(redactUrl("https://moonx.example/reset-password?token=abc")).toBe(
      "https://moonx.example/reset-password",
    );
  });

  test("hides an invitation's token", () => {
    expect(redactUrl("https://moonx.example/invite/s3cr3t-token")).toBe(
      "https://moonx.example/invite/[redacted]",
    );
  });

  test("an unreadable URL becomes nothing", () => {
    expect(redactUrl("not a url")).toBe("");
  });
});

describe("scrubEvent", () => {
  const event = {
    event_id: "3f2a9c1d0b",
    request: {
      url: "https://moonx.example/w/1?q=secret",
      headers: { Cookie: "moonx.session_token=x", "User-Agent": "test" },
      cookies: { "moonx.session_token": "x" },
      query_string: "q=secret",
    },
    user: { id: "u1", email: "ana@bcdx.example", ip_address: "10.0.0.1" },
    breadcrumbs: [{ message: "navigated to /invite/s3cr3t" }],
    extra: { answer: "My income goal" },
    exception: {
      values: [
        {
          type: "Error",
          stacktrace: {
            frames: [
              { filename: "app.js", vars: { answer: "secret" } },
              {
                filename: "https://moonx.example/invite/t0k3n?next=x#y",
                abs_path: "https://moonx.example/reset-password?token=abc",
              },
            ],
          },
        },
      ],
    },
  } as unknown as ErrorEvent;

  test("keeps the page's redacted URL and the user's id alone", () => {
    const scrubbed = scrubEvent(
      event,
      "https://moonx.example/invite/t0k3n?x=1",
    );
    expect(scrubbed.request).toEqual({
      url: "https://moonx.example/invite/[redacted]",
    });
    expect(scrubbed.user).toEqual({ id: "u1" });
    expect(scrubbed.breadcrumbs).toBeUndefined();
    expect(scrubbed.extra).toBeUndefined();
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      { filename: "app.js" },
      {
        filename: "https://moonx.example/invite/[redacted]",
        abs_path: "https://moonx.example/reset-password",
      },
    ]);
    expect(scrubbed.event_id).toBe("3f2a9c1d0b");
  });
});

describe("startSentry and reportError", () => {
  test("off without a DSN: nothing to refer to", () => {
    startSentry({ appEnv: "local", sentryDsn: null });
    expect(reportError(new Error("boom"))).toBeNull();
  });

  test("with a DSN, an error leaves scrubbed and its event id comes back", async () => {
    const sent: Envelope[] = [];
    startSentry(
      {
        appEnv: "staging",
        sentryDsn: "https://public@o0.ingest.sentry.io/1",
      },
      {
        transport: () => ({
          send: async (envelope) => {
            sent.push(envelope);
            return {};
          },
          flush: async () => true,
        }),
      },
    );
    window.history.replaceState(null, "", "/invite/s3cr3t?next=/w/1");
    const eventId = reportError(new Error("boom"));
    expect(eventId).toMatch(/^[0-9a-f]{32}$/);
    await expect.poll(() => sent.length).toBe(1);
    const [, items] = sent[0] as Envelope;
    const [, payload] = items[0] as [unknown, ErrorEvent];
    expect(payload.event_id).toBe(eventId);
    expect(payload.environment).toBe("staging");
    expect(payload.request).toEqual({
      url: `${window.location.origin}/invite/[redacted]`,
    });
    expect(payload.breadcrumbs).toBeUndefined();
  });
});
