import type { ErrorCode } from "@moonx/schemas";

/**
 * The `?error=` Better Auth puts on the login URL when Google sign-in fails, as the API code
 * whose text the screen shows. The sign-up and session hooks refuse with `INVITATION_REQUIRED` and
 * `ACCOUNT_SUSPENDED` (SDD 5.4); Better Auth reports them under its own names.
 */
export function oauthErrorCode(
  error: string,
): ErrorCode | "INVITATION_REQUIRED" | "ACCOUNT_SUSPENDED" {
  switch (error) {
    case "signup_disabled":
    case "unable_to_create_user":
    case "INVITATION_REQUIRED":
      return "INVITATION_REQUIRED";
    case "unable_to_create_session":
    case "ACCOUNT_SUSPENDED":
      return "ACCOUNT_SUSPENDED";
    default:
      return "INTERNAL";
  }
}
