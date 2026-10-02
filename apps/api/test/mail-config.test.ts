import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { loadConfig, testConfig } from "../src/config";
import { createLogger } from "../src/lib/logger";
import { createMailer, invitationMail } from "../src/mail/mailer";

const mailConfig = (overrides: Partial<ReturnType<typeof testConfig>["mail"]> = {}) => ({
  ...testConfig().mail,
  ...overrides,
});

function capture() {
  const lines: string[] = [];
  return { lines, logger: createLogger("debug", (line) => lines.push(line)) };
}

describe("mailer", () => {
  test("the console transport writes the message to the log", async () => {
    const { lines, logger } = capture();
    await createMailer(mailConfig(), logger).send({ to: "a@example.com", subject: "S", text: "T" });
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      message: "mail",
      to: "a@example.com",
      subject: "S",
      text: "T",
    });
  });

  test("the Resend transport posts to Resend's API with the key and the message", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const mailer = createMailer(
      mailConfig({
        transport: "resend",
        resendApiKey: "re_key",
        from: "moonx <no-reply@moonx.app>",
      }),
      capture().logger,
      fetchImpl,
    );
    await mailer.send({ to: "b@example.com", subject: "Hello", text: "Body" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    const init = calls[0]?.init as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "moonx <no-reply@moonx.app>",
      to: ["b@example.com"],
      subject: "Hello",
      text: "Body",
    });
  });

  test("a rejection by Resend is an error, so the caller does not report a sent mail", async () => {
    const fetchImpl = (async () => new Response("no", { status: 422 })) as unknown as typeof fetch;
    const mailer = createMailer(
      mailConfig({ transport: "resend", resendApiKey: "k" }),
      capture().logger,
      fetchImpl,
    );
    await expect(
      mailer.send({ to: "c@example.com", subject: "s", text: "t" }),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", message: "Resend answered 422" });
  });

  test("an unreachable Resend is UPSTREAM_UNAVAILABLE too", async () => {
    const fetchImpl = (async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as unknown as typeof fetch;
    const mailer = createMailer(
      mailConfig({ transport: "resend", resendApiKey: "k" }),
      capture().logger,
      fetchImpl,
    );
    await expect(
      mailer.send({ to: "c@example.com", subject: "s", text: "t" }),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });

  test("an allowlist sends only to listed addresses, ignoring case, and logs no address when it drops", async () => {
    let sent = 0;
    const fetchImpl = (async () => {
      sent += 1;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const { lines, logger } = capture();
    const mailer = createMailer(
      mailConfig({ transport: "resend", resendApiKey: "k", allowlist: ["ok@example.com"] }),
      logger,
      fetchImpl,
    );
    await mailer.send({ to: "OK@Example.com", subject: "s", text: "t" });
    await mailer.send({ to: "stranger@example.com", subject: "s", text: "t" });
    expect(sent).toBe(1);
    expect(lines.join("\n")).not.toContain("stranger@example.com");
    expect(lines.join("\n")).toContain("not on the allowlist");
  });

  test("the invitation mail names the inviter, workspace and role and carries the link", () => {
    const withWorkspace = invitationMail({
      to: "new@example.com",
      inviter: "Ana",
      workspace: { name: "BCDX", role: "member" },
      link: "https://moonx.app/invite/abc",
      expiresInDays: 7,
    });
    expect(withWorkspace.to).toBe("new@example.com");
    expect(withWorkspace.subject).toBe("Ana invited you to BCDX on moonx");
    expect(withWorkspace.text).toContain("as a Member");
    expect(withWorkspace.text).toContain("https://moonx.app/invite/abc");
    expect(withWorkspace.text).toContain("7 days");
    const operator = invitationMail({
      to: "new@example.com",
      inviter: "Moonx Admin",
      workspace: null,
      link: "https://moonx.app/invite/xyz",
      expiresInDays: 7,
    });
    expect(operator.subject).toBe("Moonx Admin invited you to moonx");
  });
});

const AUTH = { BETTER_AUTH_SECRET: "test-secret-0123456789abcdef-0123" };

describe("configuration", () => {
  test("defaults for a local run", () => {
    const config = loadConfig({ ...AUTH, APP_ENV: "local" });
    expect(config).toMatchObject({
      env: "local",
      version: "dev",
      logLevel: "debug",
      publicUrl: "http://localhost:5173",
      openapi: false,
      proxySecrets: [],
    });
    expect(config.mail.transport).toBe("console");
  });

  test("APP_ENV is required and must be a known environment", () => {
    expect(() => loadConfig({})).toThrow("APP_ENV");
    expect(() => loadConfig({ ...AUTH, APP_ENV: "prod" })).toThrow("APP_ENV");
    // the integration tests build their configuration directly; a deployment must never be "test"
    expect(() => loadConfig({ ...AUTH, APP_ENV: "test" })).toThrow("APP_ENV");
    expect(() => loadConfig({ ...AUTH, APP_ENV: "local", MAIL_TRANSPORT: "Resend" })).toThrow(
      "MAIL_TRANSPORT",
    );
  });

  test("staging and production need the shared secret and the Resend transport", () => {
    const deployed = {
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      PROXY_SHARED_SECRET: "s",
      MAIL_TRANSPORT: "resend",
      RESEND_API_KEY: "k",
      BETTER_AUTH_URL: "https://staging.moonx.app",
      MAIL_FROM: "moonx <no-reply@moonx.app>",
      TRUSTED_ORIGINS: "https://staging.moonx.app,moonx-staging://",
      CRON_OIDC_AUDIENCE: "https://moonx-api-staging-123.asia-southeast1.run.app",
      CRON_INVOKER_EMAIL: "scheduler@moonx.iam.gserviceaccount.com",
      AVATAR_BUCKET: "moonx-staging-avatars",
    };
    for (const APP_ENV of ["staging", "production"]) {
      expect(() => loadConfig({ ...AUTH, APP_ENV, ...deployed, PROXY_SHARED_SECRET: "" })).toThrow(
        "PROXY_SHARED_SECRET",
      );
      expect(() =>
        loadConfig({ ...AUTH, APP_ENV, ...deployed, MAIL_TRANSPORT: "console" }),
      ).toThrow("MAIL_TRANSPORT");
    }
    for (const name of [
      "GOOGLE_CLIENT_SECRET",
      "BETTER_AUTH_URL",
      "MAIL_FROM",
      "TRUSTED_ORIGINS",
      "CRON_OIDC_AUDIENCE",
      "CRON_INVOKER_EMAIL",
      "AVATAR_BUCKET",
    ]) {
      expect(() => loadConfig({ ...AUTH, APP_ENV: "production", ...deployed, [name]: "" })).toThrow(
        name,
      );
    }
    expect(loadConfig({ ...AUTH, APP_ENV: "staging", ...deployed }).openapi).toBe(true);
    expect(loadConfig({ ...AUTH, APP_ENV: "production", ...deployed }).openapi).toBe(false);
    expect(loadConfig({ ...AUTH, APP_ENV: "production", ...deployed }).logLevel).toBe("info");
  });

  test("every environment needs a session secret, and Google's two values come together", () => {
    for (const APP_ENV of ["local", "staging", "production"]) {
      expect(() => loadConfig({ APP_ENV })).toThrow("BETTER_AUTH_SECRET");
    }
    expect(() => loadConfig({ APP_ENV: "local", BETTER_AUTH_SECRET: "too-short" })).toThrow(
      "at least 32 characters",
    );
    expect(() => loadConfig({ ...AUTH, APP_ENV: "local", GOOGLE_CLIENT_ID: "id" })).toThrow(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
    );
    expect(() => loadConfig({ ...AUTH, APP_ENV: "local", GOOGLE_CLIENT_SECRET: "s" })).toThrow(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
    );
    const local = loadConfig({ ...AUTH, APP_ENV: "local" });
    expect(local.auth).toEqual({
      secret: AUTH.BETTER_AUTH_SECRET,
      googleClientId: "",
      googleClientSecret: "",
    });
    expect(local.avatarBucket).toBe("");
    const google = loadConfig({
      ...AUTH,
      APP_ENV: "local",
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
    });
    expect(google.auth.googleClientId).toBe("id");
  });

  test("staging and production refuse to start without Google's client; local may omit it", () => {
    const deployed = {
      PROXY_SHARED_SECRET: "s",
      MAIL_TRANSPORT: "resend",
      RESEND_API_KEY: "k",
      BETTER_AUTH_URL: "https://moonx.app",
      MAIL_FROM: "moonx <no-reply@moonx.app>",
      TRUSTED_ORIGINS: "https://moonx.app",
      CRON_OIDC_AUDIENCE: "https://moonx-api-123.asia-southeast1.run.app",
      CRON_INVOKER_EMAIL: "scheduler@moonx.iam.gserviceaccount.com",
      AVATAR_BUCKET: "moonx-avatars",
    };
    for (const APP_ENV of ["staging", "production"]) {
      expect(() => loadConfig({ ...AUTH, APP_ENV, ...deployed })).toThrow("GOOGLE_CLIENT_ID");
      expect(() => loadConfig({ ...AUTH, APP_ENV, ...deployed, GOOGLE_CLIENT_ID: "id" })).toThrow(
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
      );
      const config = loadConfig({
        ...AUTH,
        APP_ENV,
        ...deployed,
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
      });
      expect(config.auth.googleClientId).toBe("id");
    }
    expect(loadConfig({ ...AUTH, APP_ENV: "local" }).auth.googleClientId).toBe("");
    expect(testConfig().auth.googleClientId).toBe("");
  });

  test("the Resend transport needs its key", () => {
    expect(() => loadConfig({ ...AUTH, APP_ENV: "local", MAIL_TRANSPORT: "resend" })).toThrow(
      "RESEND_API_KEY",
    );
    expect(
      loadConfig({ ...AUTH, APP_ENV: "local", MAIL_TRANSPORT: "resend", RESEND_API_KEY: "k" }).mail
        .transport,
    ).toBe("resend");
  });

  test("lists are split and trimmed; at most two shared secrets are accepted", () => {
    const config = loadConfig({
      ...AUTH,
      APP_ENV: "local",
      PROXY_SHARED_SECRET: "a, b ,c",
      TRUSTED_ORIGINS: "http://localhost:5173, moonx://",
      MAIL_ALLOWLIST: "A@x.com,b@x.com",
    });
    expect(config.proxySecrets).toEqual(["a", "b"]);
    expect(config.trustedOrigins).toEqual(["http://localhost:5173", "moonx://"]);
    expect(config.mail.allowlist).toEqual(["a@x.com", "b@x.com"]);
  });

  test("/api/docs exists when enabled and is a 404 otherwise", async () => {
    const on = createApp(testConfig({ openapi: true }), { db: null as never });
    const docs = await on.handle(new Request("http://localhost/api/docs/json"));
    expect(docs.status).toBe(200);
    const paths = Object.keys(((await docs.json()) as { paths: object }).paths);
    expect(paths).toContain("/api/v1/workspaces/{workspaceId}");
    const off = createApp(testConfig({ openapi: false }), { db: null as never });
    expect((await off.handle(new Request("http://localhost/api/docs/json"))).status).toBe(404);
  });
});
