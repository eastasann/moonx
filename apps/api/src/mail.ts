import type { Config } from "./config";
import { ApiError } from "./errors";
import type { Logger } from "./log";

/** One plain-text mail to one recipient. */
export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** How {@link Mailer.send} may be stopped. */
export interface SendOptions {
  /**
   * Stops a send still under way, which then fails as one Resend did not take. The
   * console transport never waits, so it never stops.
   */
  signal?: AbortSignal;
}

/** Sends the API's mails (ADR-013). */
export interface Mailer {
  /**
   * Sends `mail` through `MAIL_TRANSPORT`. On staging, a recipient missing from
   * `MAIL_ALLOWLIST` is skipped as if the mail were sent (ADR-013).
   *
   * @param requestId The request the mail belongs to, for the log lines (SDD 8.3).
   * @throws {ApiError} UPSTREAM_UNAVAILABLE when Resend does not take the mail, or the
   * send is stopped
   */
  send(
    mail: Mail,
    requestId: string | null,
    options?: SendOptions,
  ): Promise<void>;
}

/** Resend's API (ADR-013). Tests point the mailer at their own server instead. */
const RESEND_API_URL = "https://api.resend.com";

// A request that hangs would hold the caller's response until Cloud Run's own timeout.
const RESEND_TIMEOUT_MS = 10_000;

const unavailable = (cause: Error) =>
  new ApiError(
    "UPSTREAM_UNAVAILABLE",
    "The mail service did not take the mail",
    {},
    { cause },
  );

async function sendWithResend(
  mail: Mail,
  from: string,
  apiKey: string,
  apiUrl: string,
  stop: AbortSignal | undefined,
): Promise<void> {
  const timeout = AbortSignal.timeout(RESEND_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
      signal: stop === undefined ? timeout : AbortSignal.any([timeout, stop]),
    });
  } catch (error) {
    throw unavailable(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  if (response.ok) return;
  // Resend's error body can quote the request, addresses included, so only its error
  // name goes into the log (SDD 7.2「個人情報」).
  const body = (await response.json().catch(() => null)) as {
    name?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name : "unknown";
  throw unavailable(new Error(`Resend answered ${response.status} (${name})`));
}

/**
 * The mailer of `MAIL_TRANSPORT` (SDD 2章「環境変数」): `console` writes the whole mail,
 * links included, to the log, which only local and the tests use; `resend` sends it
 * through Resend. `MAIL_ALLOWLIST` applies whenever the config has one, which
 * `loadConfig` gives staging only.
 */
export function createMailer(
  config: Pick<Config, "mail">,
  log: Logger,
  resendApiUrl: string = RESEND_API_URL,
): Mailer {
  const { transport, from, resendApiKey, allowlist } = config.mail;
  return {
    async send(mail, requestId, options = {}) {
      if (
        allowlist !== undefined &&
        !allowlist.includes(mail.to.toLowerCase())
      ) {
        // The recipient stays out of the log (SDD 7.2「個人情報」, ADR-013).
        log.write("info", "mail not sent: recipient not on MAIL_ALLOWLIST", {
          requestId,
        });
        return;
      }
      if (transport === "console") {
        log.write("info", "mail", { requestId, from, ...mail });
        return;
      }
      if (resendApiKey === undefined) {
        // loadConfig refuses resend without a key; this is a config built by hand.
        throw new Error("MAIL_TRANSPORT is resend but RESEND_API_KEY is unset");
      }
      await sendWithResend(
        mail,
        from,
        resendApiKey,
        resendApiUrl,
        options.signal,
      );
    },
  };
}
