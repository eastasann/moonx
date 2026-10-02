/** Settings the app reads from the environment, passed in so tests can build isolated apps. */
export interface AppConfig {
  /** `local` / `staging` / `production`; the integration tests build their configuration with `test`. */
  env: string;
  version: string;
  /** Accepted `X-Moonx-Proxy-Secret` values (two while a rotation is under way). Empty = no check. */
  proxySecrets: string[];
  /** Origins a state-changing request may come from (SDD 7.2). */
  trustedOrigins: string[];
  logLevel: "debug" | "info" | "warn" | "error";
  /** Public base URL of the web app, used for invitation links. */
  publicUrl: string;
  mail: {
    transport: "console" | "resend";
    from: string;
    resendApiKey: string;
    /** Staging only: when non-empty, mail goes to these addresses and nowhere else. */
    allowlist: string[];
  };
  /**
   * Who may call `/internal/cron/*` (Cloud Scheduler's OIDC token, SDD 5.14 Z3). Empty values
   * make every call a 403: the endpoint is never open. staging and production refuse to start
   * without both, so a missing value cannot silently stop the due notices.
   */
  cron: { oidcAudience: string; invokerEmail: string };
  auth: {
    /** Signs sessions and tokens (SDD 2 環境変数). Every environment but the tests must set it. */
    secret: string;
    /**
     * Google sign-in is a user-specified requirement (ADR-010): staging and production refuse to
     * start without both values. Only local and the tests may leave them empty, which switches
     * Google sign-in off.
     */
    googleClientId: string;
    googleClientSecret: string;
  };
  /** Cloud Storage bucket for profile photos; empty keeps them on local disk (ADR-024). */
  avatarBucket: string;
  sentryDsn: string;
  /** Serve the OpenAPI document at /api/docs (staging only, ADR-006). */
  openapi: boolean;
}

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
const APP_ENVS = ["local", "staging", "production"] as const;

/**
 * Reads the settings from the environment (SDD 2 環境変数). A missing or malformed value never
 * falls back to the local behavior, because that behavior is unsafe when deployed (it accepts the
 * dev-user header and writes invitation links to the log): `APP_ENV` is required, and staging and
 * production refuse to start without the Worker's shared secret, the Resend transport and Google's
 * OAuth client.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const appEnv = env.APP_ENV;
  if (!appEnv || !(APP_ENVS as readonly string[]).includes(appEnv)) {
    throw new Error(`APP_ENV must be one of ${APP_ENVS.join(", ")}`);
  }
  const level = env.LOG_LEVEL as AppConfig["logLevel"];
  const transport = env.MAIL_TRANSPORT ?? "console";
  if (transport !== "console" && transport !== "resend") {
    throw new Error("MAIL_TRANSPORT must be console or resend");
  }
  if (transport === "resend" && !env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required when MAIL_TRANSPORT=resend");
  }
  const proxySecrets = list(env.PROXY_SHARED_SECRET).slice(0, 2);
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET must be at least 32 characters (generate one: openssl rand -base64 32)",
    );
  }
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together");
  }
  if (appEnv === "staging" || appEnv === "production") {
    if (proxySecrets.length === 0) throw new Error(`PROXY_SHARED_SECRET is required in ${appEnv}`);
    if (transport !== "resend") throw new Error(`MAIL_TRANSPORT must be resend in ${appEnv}`);
    for (const name of [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "BETTER_AUTH_URL",
      "MAIL_FROM",
      "TRUSTED_ORIGINS",
      "CRON_OIDC_AUDIENCE",
      "CRON_INVOKER_EMAIL",
      "AVATAR_BUCKET",
    ]) {
      if (!env[name]) throw new Error(`${name} is required in ${appEnv}`);
    }
  }
  return {
    env: appEnv,
    version: env.APP_VERSION || "dev",
    proxySecrets,
    trustedOrigins: list(env.TRUSTED_ORIGINS),
    logLevel: LOG_LEVELS.includes(level) ? level : appEnv === "local" ? "debug" : "info",
    publicUrl: (env.BETTER_AUTH_URL || "http://localhost:5173").replace(/\/+$/, ""),
    mail: {
      transport,
      from: env.MAIL_FROM || "moonx <no-reply@localhost>",
      resendApiKey: env.RESEND_API_KEY ?? "",
      allowlist: list(env.MAIL_ALLOWLIST).map((v) => v.toLowerCase()),
    },
    cron: {
      oidcAudience: env.CRON_OIDC_AUDIENCE ?? "",
      invokerEmail: (env.CRON_INVOKER_EMAIL ?? "").toLowerCase(),
    },
    auth: {
      secret: env.BETTER_AUTH_SECRET,
      googleClientId: env.GOOGLE_CLIENT_ID ?? "",
      googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
    },
    avatarBucket: env.AVATAR_BUCKET ?? "",
    sentryDsn: env.SENTRY_DSN ?? "",
    openapi: appEnv === "staging",
  };
}

/** Defaults for tests and the OpenAPI export: nothing is checked and mail goes to the console. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: "test",
    version: "test",
    proxySecrets: [],
    trustedOrigins: ["http://localhost:5173"],
    logLevel: "error",
    publicUrl: "http://localhost:5173",
    mail: {
      transport: "console",
      from: "moonx <no-reply@localhost>",
      resendApiKey: "",
      allowlist: [],
    },
    cron: { oidcAudience: "", invokerEmail: "" },
    auth: {
      secret: "test-secret-test-secret-test-secret-0123",
      googleClientId: "",
      googleClientSecret: "",
    },
    avatarBucket: "",
    sentryDsn: "",
    openapi: false,
    ...overrides,
  };
}

/**
 * Oldest app build per mobile platform that this API still serves (SDD 5.1). Raising a value
 * answers older builds with 426 APP_UPDATE_REQUIRED, so it changes only together with a store
 * release that makes the old build unusable.
 */
export const MIN_APP_VERSION = { ios: "1.0.0", android: "1.0.0" } as const;

/** Largest JSON body the API reads (SDD 8.1 PAYLOAD_TOO_LARGE). */
export const MAX_JSON_BYTES = 1024 * 1024;
/** Largest body the server accepts at all: the avatar upload (5 MB) plus multipart framing. */
export const MAX_BODY_BYTES = 6 * 1024 * 1024;
