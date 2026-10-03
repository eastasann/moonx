import * as Sentry from "@sentry/react";
import { afterEach, expect, test } from "vitest";
import { scrubEvent, sentryOptions } from "../src/lib/sentry";

const sent: string[] = [];

function start() {
  Sentry.init({
    ...sentryOptions("https://key@example.ingest.sentry.io/1", "test"),
    transport: () => ({
      send: async (envelope) => {
        sent.push(JSON.stringify(envelope));
        return {};
      },
      flush: async () => true,
    }),
  });
}

afterEach(async () => {
  await Sentry.close();
  sent.length = 0;
  window.history.replaceState(null, "", "/");
});

async function reportFrom(path: string) {
  window.history.replaceState(null, "", path);
  start();
  Sentry.addBreadcrumb({ category: "navigation", data: { to: path } });
  Sentry.captureException(new Error("boom"));
  await Sentry.flush(1000);
  return sent.join("\n");
}

test("a reset-password token in the query is not sent", async () => {
  const body = await reportFrom("/reset-password?token=SECRETRESET123");
  expect(body).toContain("boom");
  expect(body).not.toContain("SECRETRESET123");
});

test("an invitation token in the path is not sent", async () => {
  const body = await reportFrom("/invite/SECRETINVITE456?x=1");
  expect(body).toContain("boom");
  expect(body).not.toContain("SECRETINVITE456");
  expect(body).toContain("/invite/:token");
});

test("no breadcrumbs are sent", async () => {
  const body = await reportFrom("/w/1/ideas");
  expect(body).not.toContain('"breadcrumbs"');
});

test("stack frames, tags, extra and contexts lose the query and the invitation token", () => {
  const address = "https://app.example.com/invite/SECRETINVITE456/x?token=SECRETRESET123#f";
  const event = scrubEvent({
    type: undefined,
    exception: {
      values: [
        {
          stacktrace: {
            frames: [
              { filename: `${address}`, abs_path: `${address}`, function: "boom" },
              { filename: "app:///assets/index-abc.js?v=SECRETQUERY789" },
            ],
          },
        },
      ],
    },
    tags: { page: address, release: "1.0" },
    extra: { nested: { href: address }, note: "what? yes" },
    contexts: { page: { url: address } },
  });
  const body = JSON.stringify(event);
  expect(body).not.toContain("SECRETINVITE456");
  expect(body).not.toContain("SECRETRESET123");
  expect(body).not.toContain("SECRETQUERY789");
  expect(body).toContain("/invite/:token");
  expect(body).toContain("what? yes");
  expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.function).toBe("boom");
});
