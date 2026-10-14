import { afterAll, describe, expect, test } from "bun:test";
import type { Config } from "./config";
import { ApiError } from "./errors";
import { createLogger } from "./log";
import { createMailer, type Mail } from "./mail";
import { testConfig } from "./test-app";

interface Received {
  path: string;
  authorization: string | null;
  body: unknown;
}

// Stands in for Resend's API: records what reaches it and answers with `status`, after
// `delayMs`.
let status = 200;
let answer: unknown = { id: "email-1" };
let delayMs = 0;
const received: Received[] = [];
const resend = Bun.serve({
  port: 0,
  async fetch(request) {
    received.push({
      path: new URL(request.url).pathname,
      authorization: request.headers.get("authorization"),
      body: await request.json(),
    });
    if (delayMs > 0) await Bun.sleep(delayMs);
    return Response.json(answer, { status });
  },
});
afterAll(() => resend.stop(true));
const resendUrl = `http://localhost:${resend.port}`;

const mail: Mail = {
  to: "Someone@Example.com",
  subject: "Reset your moonx password",
  text: "Open https://stg.example.invalid/reset-password?token=abc",
};

function mailerFor(overrides: Partial<Config["mail"]>) {
  const lines: Record<string, unknown>[] = [];
  const mailer = createMailer(
    {
      mail: {
        ...testConfig.mail,
        transport: "resend",
        resendApiKey: "re_test_key",
        from: "moonx <no-reply@stg.example.invalid>",
        ...overrides,
      },
    },
    createLogger("debug", (line) => lines.push(JSON.parse(line))),
    resendUrl,
  );
  return { mailer, lines };
}

const sent = () => received.splice(0);

describe("console transport (local and tests)", () => {
  test("writes the whole mail to the log and sends nothing", async () => {
    const { mailer, lines } = mailerFor({
      transport: "console",
      resendApiKey: undefined,
      from: "moonx <no-reply@localhost>",
    });

    await mailer.send(mail, "request-1");

    expect(lines).toEqual([
      {
        severity: "INFO",
        message: "mail",
        requestId: "request-1",
        from: "moonx <no-reply@localhost>",
        ...mail,
      },
    ]);
    expect(sent()).toEqual([]);
  });
});

describe("Resend (ADR-013)", () => {
  test("posts the mail with the API key and logs nothing about it", async () => {
    const { mailer, lines } = mailerFor({});

    await mailer.send(mail, "request-2");

    expect(sent()).toEqual([
      {
        path: "/emails",
        authorization: "Bearer re_test_key",
        body: {
          from: "moonx <no-reply@stg.example.invalid>",
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
        },
      },
    ]);
    expect(lines).toEqual([]);
  });

  test("answers UPSTREAM_UNAVAILABLE when Resend refuses, naming only its error", async () => {
    const { mailer } = mailerFor({});
    status = 422;
    answer = {
      statusCode: 422,
      name: "validation_error",
      message: `Invalid \`to\` field: ${mail.to}`,
    };
    try {
      const error = await mailer.send(mail, null).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("UPSTREAM_UNAVAILABLE");
      const cause = (error as ApiError).cause as Error;
      expect(cause.message).toBe("Resend answered 422 (validation_error)");
      expect(cause.message).not.toContain(mail.to);
    } finally {
      status = 200;
      answer = { id: "email-1" };
      sent();
    }
  });

  test("stops a send under way when its signal aborts, as one Resend did not take", async () => {
    const { mailer } = mailerFor({});
    delayMs = 1000;
    try {
      const started = performance.now();
      const error = await mailer
        .send(mail, null, { signal: AbortSignal.timeout(100) })
        .catch((e: unknown) => e);

      expect(performance.now() - started).toBeLessThan(600);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("UPSTREAM_UNAVAILABLE");
    } finally {
      delayMs = 0;
      sent();
    }
  });

  test("answers UPSTREAM_UNAVAILABLE when Resend cannot be reached", async () => {
    const { mailer } = createMailerAt("http://127.0.0.1:1");

    const error = await mailer.send(mail, null).catch((e: unknown) => e);

    expect((error as ApiError).code).toBe("UPSTREAM_UNAVAILABLE");
  });
});

function createMailerAt(url: string) {
  return {
    mailer: createMailer(
      {
        mail: {
          transport: "resend",
          resendApiKey: "re_test_key",
          from: "moonx <no-reply@example.invalid>",
          allowlist: undefined,
        },
      },
      createLogger("error", () => {}),
      url,
    ),
  };
}

// loadConfig gives a list on staging only (SDD 2章「環境変数」).
describe("MAIL_ALLOWLIST (ADR-013)", () => {
  test("sends to a listed address, matched ignoring case", async () => {
    const { mailer } = mailerFor({
      allowlist: ["someone@example.com"],
    });

    await mailer.send(mail, null);

    expect(sent()).toHaveLength(1);
  });

  test("skips an unlisted address as if sent, logging no address", async () => {
    const { mailer, lines } = mailerFor({
      allowlist: ["tester@example.com"],
    });

    await mailer.send(mail, "request-3");

    expect(sent()).toEqual([]);
    expect(lines).toEqual([
      {
        severity: "INFO",
        message: "mail not sent: recipient not on MAIL_ALLOWLIST",
        requestId: "request-3",
      },
    ]);
  });

  test("sends to nobody when the list is empty", async () => {
    const { mailer } = mailerFor({ allowlist: [] });

    await mailer.send(mail, null);

    expect(sent()).toEqual([]);
  });
});
