/**
 * Where the API runs. `test` exists only for integration tests, which build a
 * {@link Config} directly; {@link loadConfig} never accepts it from the environment.
 */
export type AppEnv = "local" | "staging" | "production" | "test";

export type MailTransport = "console" | "resend";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** API settings, read once at startup (SDD 2章「環境変数」). */
export interface Config {
  appEnv: AppEnv;
  /** Commit SHA reported by `/api/health`. */
  appVersion: string;
  port: number;
  /** Web build output served at `/*`. Unset locally, where Vite serves the Web (ADR-004). */
  webDistDir: string | undefined;
  databaseUrl: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  trustedOrigins: string[];
  /** Unset only locally, where Google sign-in is then unavailable. */
  google: { clientId: string; clientSecret: string } | undefined;
  mail: {
    transport: MailTransport;
    resendApiKey: string | undefined;
    from: string;
    /** Lower-cased recipients mail may go to. Set only on staging; empty means nobody. */
    allowlist: string[] | undefined;
  };
  /** Unset locally, where avatars live on disk (ADR-024). */
  avatarBucket: string | undefined;
  sentryDsn: string | undefined;
  webSentryDsn: string | undefined;
  logLevel: LogLevel;
}

/** Thrown by {@link loadConfig} with every problem found, so one restart fixes them all. */
export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Invalid configuration:\n${problems.map((p) => `- ${p}`).join("\n")}`,
    );
    this.name = "ConfigError";
    this.problems = problems;
  }
}

const APP_ENVS = ["local", "staging", "production"] as const;
const MAIL_TRANSPORTS = ["console", "resend"] as const;
const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
const MIN_SECRET_BYTES = 32;

// Values the SDD lists in its "local の値" column. Local runs fall back to them;
// staging and production must set them explicitly, so a deployed API never runs
// with a localhost URL or console mail.
const LOCAL_DEFAULTS = {
  betterAuthUrl: "http://localhost:5173",
  trustedOrigins: "http://localhost:5173",
  mailTransport: "console",
  mailFrom: "moonx <no-reply@localhost>",
  logLevel: "debug",
} as const;

const DEFAULT_PORT = 3000;

function isOneOf<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return (values as readonly string[]).includes(value);
}

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/**
 * Reads and validates the API settings from environment variables.
 *
 * Values are trimmed, and empty ones count as unset, because `.env` lines like
 * `GOOGLE_CLIENT_ID=` reach the process as empty values.
 *
 * @throws {ConfigError} when any variable is missing or invalid for the environment.
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const read = (name: string): string | undefined => {
    const value = env[name]?.trim();
    return value === "" ? undefined : value;
  };
  const problems: string[] = [];

  const rawAppEnv = read("APP_ENV");
  let appEnv: (typeof APP_ENVS)[number] | undefined;
  if (rawAppEnv === undefined) {
    problems.push(`APP_ENV is required (one of ${APP_ENVS.join(", ")})`);
  } else if (isOneOf(APP_ENVS, rawAppEnv)) {
    appEnv = rawAppEnv;
  } else {
    problems.push(
      `APP_ENV must be one of ${APP_ENVS.join(", ")}, got "${rawAppEnv}"`,
    );
  }
  // Without a known environment only the deployed-only rules are skipped: the checks
  // that hold everywhere still run, so one restart fixes everything they report.
  const deployed = appEnv !== undefined && appEnv !== "local";

  const requireDeployed = (name: string, localDefault: string): string => {
    const value = read(name);
    if (value !== undefined) return value;
    if (deployed) problems.push(`${name} is required on ${appEnv}`);
    return localDefault;
  };

  let port = DEFAULT_PORT;
  const rawPort = read("PORT");
  if (rawPort !== undefined) {
    // Digits only: Number() would also accept forms like 0x1F90 or 1e3.
    const parsed = /^\d+$/.test(rawPort) ? Number(rawPort) : Number.NaN;
    if (parsed >= 1 && parsed <= 65535) {
      port = parsed;
    } else {
      problems.push(
        `PORT must be an integer between 1 and 65535, got "${rawPort}"`,
      );
    }
  }

  const webDistDir = read("WEB_DIST_DIR");
  if (deployed && webDistDir === undefined) {
    problems.push(`WEB_DIST_DIR is required on ${appEnv}`);
  }

  const databaseUrl = read("DATABASE_URL");
  if (databaseUrl === undefined) {
    problems.push("DATABASE_URL is required");
  }

  const betterAuthSecret = read("BETTER_AUTH_SECRET") ?? "";
  if (new TextEncoder().encode(betterAuthSecret).length < MIN_SECRET_BYTES) {
    problems.push(
      `BETTER_AUTH_SECRET must be at least ${MIN_SECRET_BYTES} bytes (use openssl rand -base64 32)`,
    );
  }

  const betterAuthUrl = requireDeployed(
    "BETTER_AUTH_URL",
    LOCAL_DEFAULTS.betterAuthUrl,
  );
  const trustedOrigins = splitList(
    requireDeployed("TRUSTED_ORIGINS", LOCAL_DEFAULTS.trustedOrigins),
  );
  if (trustedOrigins.length === 0) {
    problems.push("TRUSTED_ORIGINS must list at least one origin");
  }

  const googleClientId = read("GOOGLE_CLIENT_ID");
  const googleClientSecret = read("GOOGLE_CLIENT_SECRET");
  let google: Config["google"];
  if (googleClientId !== undefined && googleClientSecret !== undefined) {
    google = { clientId: googleClientId, clientSecret: googleClientSecret };
  } else if (googleClientId !== undefined || googleClientSecret !== undefined) {
    problems.push(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together",
    );
  } else if (deployed) {
    problems.push(
      `GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required on ${appEnv}`,
    );
  }

  let mailTransport: MailTransport = LOCAL_DEFAULTS.mailTransport;
  const rawMailTransport = read("MAIL_TRANSPORT");
  if (deployed && rawMailTransport !== "resend") {
    // console mail logs invitation links in full, which must never happen outside local.
    // Naming the one accepted value also covers unknown values, so a fix to console is
    // never suggested.
    problems.push(
      `MAIL_TRANSPORT must be resend on ${appEnv}${rawMailTransport === undefined ? "" : `, got "${rawMailTransport}"`}`,
    );
  } else if (
    rawMailTransport !== undefined &&
    !isOneOf(MAIL_TRANSPORTS, rawMailTransport)
  ) {
    problems.push(
      `MAIL_TRANSPORT must be one of ${MAIL_TRANSPORTS.join(", ")}, got "${rawMailTransport}"`,
    );
  } else if (rawMailTransport !== undefined) {
    mailTransport = rawMailTransport;
  }

  const resendApiKey = read("RESEND_API_KEY");
  // Deployed environments always need the key, even while MAIL_TRANSPORT is also wrong,
  // so a single restart fixes both.
  if (resendApiKey === undefined) {
    if (deployed) {
      problems.push(`RESEND_API_KEY is required on ${appEnv}`);
    } else if (mailTransport === "resend") {
      problems.push("RESEND_API_KEY is required when MAIL_TRANSPORT is resend");
    }
  }

  const mailFrom = requireDeployed("MAIL_FROM", LOCAL_DEFAULTS.mailFrom);
  const allowlist =
    appEnv === "staging"
      ? splitList(read("MAIL_ALLOWLIST")).map((email) => email.toLowerCase())
      : undefined;

  const avatarBucket = read("AVATAR_BUCKET");
  if (deployed && avatarBucket === undefined) {
    problems.push(`AVATAR_BUCKET is required on ${appEnv}`);
  }

  let logLevel: LogLevel = deployed ? "info" : LOCAL_DEFAULTS.logLevel;
  const rawLogLevel = read("LOG_LEVEL");
  if (rawLogLevel !== undefined) {
    if (isOneOf(LOG_LEVELS, rawLogLevel)) {
      logLevel = rawLogLevel;
    } else {
      problems.push(
        `LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}, got "${rawLogLevel}"`,
      );
    }
  }

  if (
    problems.length > 0 ||
    appEnv === undefined ||
    databaseUrl === undefined
  ) {
    throw new ConfigError(problems);
  }

  return {
    appEnv,
    appVersion: read("APP_VERSION") ?? "dev",
    port,
    webDistDir,
    databaseUrl,
    betterAuthSecret,
    betterAuthUrl,
    trustedOrigins,
    google,
    mail: { transport: mailTransport, resendApiKey, from: mailFrom, allowlist },
    avatarBucket,
    sentryDsn: read("SENTRY_DSN"),
    webSentryDsn: read("WEB_SENTRY_DSN"),
    logLevel,
  };
}
