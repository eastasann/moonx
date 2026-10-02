import { createI18n } from "@moonx/i18n";
import type { AppConfig } from "../config";
import { ApiError } from "../errors";
import type { Logger } from "../lib/logger";

const RESEND_TIMEOUT_MS = 10_000;

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Sends one message. Implementations throw when the message was not accepted. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * `console` prints the message to the API log (local, tests); `resend` posts it to Resend's HTTP
 * API (SDD 2 通信フロー 5). With an allowlist (staging) any other address is dropped and logged,
 * so test data can never reach a real inbox.
 */
export function createMailer(
  config: AppConfig["mail"],
  logger: Logger,
  fetchImpl: typeof fetch = fetch,
): Mailer {
  return {
    async send(message) {
      if (config.allowlist.length > 0 && !config.allowlist.includes(message.to.toLowerCase())) {
        logger.log("info", "mail dropped: recipient is not on the allowlist");
        return;
      }
      if (config.transport === "console") {
        logger.log("info", "mail", {
          to: message.to,
          subject: message.subject,
          text: message.text,
        });
        return;
      }
      // Sending runs inside the request's transaction, so a stalled provider must not hold it.
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.resendApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: config.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      }).catch((error: unknown) => {
        throw new ApiError(
          "UPSTREAM_UNAVAILABLE",
          `Resend is unreachable (${(error as Error).name})`,
        );
      });
      if (!response.ok) {
        throw new ApiError("UPSTREAM_UNAVAILABLE", `Resend answered ${response.status}`);
      }
    },
  };
}

/** What the invitation mail is built from. */
export interface InvitationMailInput {
  to: string;
  inviter: string;
  workspace: { name: string; role: "owner" | "member" | "viewer" } | null;
  link: string;
  expiresInDays: number;
}

/** The invitation mail (design-spec 6.16). Wording lives in `packages/i18n` (`mail` namespace). */
export function invitationMail(input: InvitationMailInput): MailMessage {
  const t = createI18n().t;
  const { inviter, workspace } = input;
  const subject = workspace
    ? t("mail:invitation.subject_workspace", { inviter, workspace: workspace.name })
    : t("mail:invitation.subject_account", { inviter });
  const intro = workspace
    ? t("mail:invitation.body_workspace", {
        inviter,
        workspace: workspace.name,
        role: t(`mail:role.${workspace.role}`),
      })
    : t("mail:invitation.body_account", { inviter });
  const text = [
    intro,
    "",
    t("mail:invitation.action", { days: input.expiresInDays }),
    input.link,
    "",
    t("mail:invitation.ignore"),
  ].join("\n");
  return { to: input.to, subject, text };
}

/** The password reset mail (design-spec 6.16 screen 2). */
export function passwordResetMail(input: {
  to: string;
  link: string;
  expiresInMinutes: number;
}): MailMessage {
  const t = createI18n().t;
  const text = [
    t("mail:passwordReset.body"),
    "",
    t("mail:passwordReset.action", { minutes: input.expiresInMinutes }),
    input.link,
    "",
    t("mail:passwordReset.ignore"),
  ].join("\n");
  return { to: input.to, subject: t("mail:passwordReset.subject"), text };
}
