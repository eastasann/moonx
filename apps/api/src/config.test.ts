import { describe, expect, test } from "bun:test";
import { ConfigError, loadConfig } from "./config";

const SECRET = "0123456789abcdef0123456789abcdef";

const local = {
  APP_ENV: "local",
  DATABASE_URL: "postgres://moonx:moonx@localhost:5432/moonx",
  BETTER_AUTH_SECRET: SECRET,
};

const deployed = {
  APP_ENV: "staging",
  WEB_DIST_DIR: "/app/web",
  DATABASE_URL: "postgres://user:pass@db.example/moonx",
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: "https://stg.example.com",
  TRUSTED_ORIGINS: "https://stg.example.com",
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  MAIL_TRANSPORT: "resend",
  RESEND_API_KEY: "re_key",
  MAIL_FROM: "moonx <no-reply@example.com>",
  AVATAR_BUCKET: "project-moonx-staging-avatars",
};

function problemsOf(
  env: Record<string, string | undefined>,
): readonly string[] {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  throw new Error("expected loadConfig to throw");
}

describe("APP_ENV", () => {
  test("is required and has no default", () => {
    expect(problemsOf({ ...local, APP_ENV: undefined })).toEqual([
      "APP_ENV is required (one of local, staging, production)",
    ]);
  });

  test.each(["test", "dev", "Production"])(
    "rejects the unknown value %s",
    (value) => {
      expect(problemsOf({ ...local, APP_ENV: value })).toEqual([
        `APP_ENV must be one of local, staging, production, got "${value}"`,
      ]);
    },
  );

  test.each(["local", "staging", "production"])("accepts %s", (value) => {
    const env = value === "local" ? local : { ...deployed, APP_ENV: value };
    expect(loadConfig(env).appEnv).toBe(value);
  });
});

describe("local", () => {
  test("falls back to the documented local values", () => {
    const config = loadConfig(local);

    expect(config).toEqual({
      appEnv: "local",
      appVersion: "dev",
      port: 3000,
      webDistDir: undefined,
      databaseUrl: local.DATABASE_URL,
      betterAuthSecret: SECRET,
      betterAuthUrl: "http://localhost:5173",
      trustedOrigins: ["http://localhost:5173"],
      google: undefined,
      mail: {
        transport: "console",
        resendApiKey: undefined,
        from: "moonx <no-reply@localhost>",
        allowlist: undefined,
      },
      avatarBucket: undefined,
      sentryDsn: undefined,
      webSentryDsn: undefined,
      logLevel: "debug",
    });
  });

  test("treats empty values as unset", () => {
    const config = loadConfig({
      ...local,
      APP_VERSION: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: " ",
      MAIL_TRANSPORT: "",
      AVATAR_BUCKET: "",
    });

    expect(config.appVersion).toBe("dev");
    expect(config.google).toBeUndefined();
    expect(config.mail.transport).toBe("console");
    expect(config.avatarBucket).toBeUndefined();
  });

  test("reads every variable that is set", () => {
    const config = loadConfig({
      ...local,
      APP_VERSION: "abc1234",
      PORT: "3100",
      WEB_DIST_DIR: "/tmp/web",
      BETTER_AUTH_URL: "http://localhost:5273",
      TRUSTED_ORIGINS: " http://localhost:5273 , http://localhost:3200 ,",
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      MAIL_TRANSPORT: "resend",
      RESEND_API_KEY: "re_key",
      MAIL_FROM: "moonx <no-reply@example.com>",
      AVATAR_BUCKET: "bucket",
      SENTRY_DSN: "https://api@sentry.example/1",
      WEB_SENTRY_DSN: "https://web@sentry.example/2",
      LOG_LEVEL: "warn",
    });

    expect(config).toMatchObject({
      appVersion: "abc1234",
      port: 3100,
      webDistDir: "/tmp/web",
      betterAuthUrl: "http://localhost:5273",
      trustedOrigins: ["http://localhost:5273", "http://localhost:3200"],
      google: { clientId: "id", clientSecret: "secret" },
      mail: {
        transport: "resend",
        resendApiKey: "re_key",
        from: "moonx <no-reply@example.com>",
      },
      avatarBucket: "bucket",
      sentryDsn: "https://api@sentry.example/1",
      webSentryDsn: "https://web@sentry.example/2",
      logLevel: "warn",
    });
  });

  test("does not read MAIL_ALLOWLIST", () => {
    expect(
      loadConfig({ ...local, MAIL_ALLOWLIST: "a@example.com" }).mail.allowlist,
    ).toBeUndefined();
  });
});

describe("every environment", () => {
  test("requires DATABASE_URL", () => {
    expect(problemsOf({ ...local, DATABASE_URL: undefined })).toEqual([
      "DATABASE_URL is required",
    ]);
  });

  test("requires a secret of at least 32 UTF-8 bytes", () => {
    const problem =
      "BETTER_AUTH_SECRET must be at least 32 bytes (use openssl rand -base64 32)";
    expect(problemsOf({ ...local, BETTER_AUTH_SECRET: undefined })).toEqual([
      problem,
    ]);
    expect(
      problemsOf({ ...local, BETTER_AUTH_SECRET: "x".repeat(31) }),
    ).toEqual([problem]);
    // 11 three-byte characters are 33 bytes even though the string has 11 code units.
    expect(
      loadConfig({ ...local, BETTER_AUTH_SECRET: "月".repeat(11) })
        .betterAuthSecret,
    ).toBe("月".repeat(11));
  });

  test("rejects only one of the Google credentials", () => {
    const problem =
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together";
    expect(problemsOf({ ...local, GOOGLE_CLIENT_ID: "id" })).toEqual([problem]);
    expect(
      problemsOf({ ...deployed, GOOGLE_CLIENT_SECRET: undefined }),
    ).toEqual([problem]);
  });

  test("rejects an unknown MAIL_TRANSPORT", () => {
    expect(problemsOf({ ...local, MAIL_TRANSPORT: "smtp" })).toEqual([
      'MAIL_TRANSPORT must be one of console, resend, got "smtp"',
    ]);
  });

  test("requires RESEND_API_KEY for resend", () => {
    expect(problemsOf({ ...local, MAIL_TRANSPORT: "resend" })).toEqual([
      "RESEND_API_KEY is required when MAIL_TRANSPORT is resend",
    ]);
  });

  test.each(["0", "65536", "3000.5", "abc", "0x1F90", "1e3", "0b11"])(
    "rejects PORT %s",
    (value) => {
      expect(problemsOf({ ...local, PORT: value })).toEqual([
        `PORT must be an integer between 1 and 65535, got "${value}"`,
      ]);
    },
  );

  test("rejects an unknown LOG_LEVEL", () => {
    expect(problemsOf({ ...local, LOG_LEVEL: "trace" })).toEqual([
      'LOG_LEVEL must be one of debug, info, warn, error, got "trace"',
    ]);
  });

  test("rejects an empty origin list", () => {
    expect(problemsOf({ ...local, TRUSTED_ORIGINS: " , " })).toEqual([
      "TRUSTED_ORIGINS must list at least one origin",
    ]);
  });

  test("reports every problem at once", () => {
    expect(
      problemsOf({
        APP_ENV: "local",
        PORT: "x",
        LOG_LEVEL: "loud",
        GOOGLE_CLIENT_ID: "id",
      }),
    ).toHaveLength(5);
  });

  test("still checks the other variables when APP_ENV is unusable", () => {
    expect(
      problemsOf({ APP_ENV: "prod", BETTER_AUTH_SECRET: "short" }),
    ).toEqual([
      'APP_ENV must be one of local, staging, production, got "prod"',
      "DATABASE_URL is required",
      "BETTER_AUTH_SECRET must be at least 32 bytes (use openssl rand -base64 32)",
    ]);
  });
});

describe.each(["staging", "production"])("%s", (appEnv) => {
  const env = { ...deployed, APP_ENV: appEnv };

  test("starts with every required variable", () => {
    const config = loadConfig(env);

    expect(config.appEnv).toBe(appEnv);
    expect(config.logLevel).toBe("info");
    expect(config.mail.transport).toBe("resend");
  });

  test.each([
    "WEB_DIST_DIR",
    "BETTER_AUTH_URL",
    "TRUSTED_ORIGINS",
    "MAIL_FROM",
    "AVATAR_BUCKET",
  ])("requires %s", (name) => {
    expect(problemsOf({ ...env, [name]: undefined })).toEqual([
      `${name} is required on ${appEnv}`,
    ]);
  });

  test("requires the Google credentials", () => {
    expect(
      problemsOf({
        ...env,
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
      }),
    ).toEqual([
      `GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required on ${appEnv}`,
    ]);
  });

  test("requires MAIL_TRANSPORT=resend when unset", () => {
    expect(problemsOf({ ...env, MAIL_TRANSPORT: undefined })).toEqual([
      `MAIL_TRANSPORT must be resend on ${appEnv}`,
    ]);
  });

  test.each(["console", "smtp"])(
    "requires MAIL_TRANSPORT=resend (got %s)",
    (value) => {
      expect(problemsOf({ ...env, MAIL_TRANSPORT: value })).toEqual([
        `MAIL_TRANSPORT must be resend on ${appEnv}, got "${value}"`,
      ]);
    },
  );

  test("requires RESEND_API_KEY", () => {
    expect(problemsOf({ ...env, RESEND_API_KEY: undefined })).toEqual([
      `RESEND_API_KEY is required on ${appEnv}`,
    ]);
  });
});

test("a deployed environment reports a missing Resend key together with the transport", () => {
  expect(
    problemsOf({
      ...deployed,
      MAIL_TRANSPORT: undefined,
      RESEND_API_KEY: undefined,
    }),
  ).toEqual([
    "MAIL_TRANSPORT must be resend on staging",
    "RESEND_API_KEY is required on staging",
  ]);
});

describe("MAIL_ALLOWLIST", () => {
  test("is read on staging, lower-cased", () => {
    const config = loadConfig({
      ...deployed,
      MAIL_ALLOWLIST: "A@Example.com, b@example.com ,",
    });
    expect(config.mail.allowlist).toEqual(["a@example.com", "b@example.com"]);
  });

  test("is empty on staging when unset, so mail goes to nobody", () => {
    expect(loadConfig(deployed).mail.allowlist).toEqual([]);
  });

  test("is not read on production", () => {
    const config = loadConfig({
      ...deployed,
      APP_ENV: "production",
      MAIL_ALLOWLIST: "a@example.com",
    });
    expect(config.mail.allowlist).toBeUndefined();
  });
});
