/** Where Better Auth answers (SDD 5.4 A1–A8): mounted on the API, not typed through Eden. */
const AUTH_PATH = "/api/auth";

/**
 * A failed call to Better Auth (SDD 5.4). Its body has Better Auth's shape
 * `{ code, message }` (SDD 8.1), so `code` may be one of Better Auth's own
 * (`INVALID_EMAIL_OR_PASSWORD`, `INVALID_TOKEN`) as well as one of the API's. `status` is
 * null when no response came back (the network failed).
 */
export class AuthError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  /** The response's `X-Request-Id` (SDD 8.3), shown as `Ref` for an unexpected error. */
  readonly requestId: string | null;
  /** The wait of a 429, from `X-Retry-After` (SDD 8.1). */
  readonly retryAfterSeconds: number | null;

  constructor(options: {
    status: number | null;
    code: string | null;
    requestId?: string | null;
    retryAfterSeconds?: number | null;
    cause?: unknown;
  }) {
    super(
      options.status === null
        ? "Better Auth could not be reached"
        : `Better Auth answered ${options.status}${options.code === null ? "" : ` ${options.code}`}`,
      { cause: options.cause },
    );
    this.name = "AuthError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

/**
 * The AuthError of a response that was not a success. A bare 502, 503 or 504 from the
 * front of Cloud Run is UPSTREAM_UNAVAILABLE, as on the API's own paths (SDD 8.1).
 */
export function authErrorOf(response: Response, body: unknown): AuthError {
  const code =
    typeof body === "object" && body !== null && "code" in body
      ? body.code
      : undefined;
  const retryAfter = Number(response.headers.get("x-retry-after") ?? "");
  return new AuthError({
    status: response.status,
    code:
      typeof code === "string" && code !== ""
        ? code
        : response.status === 502 ||
            response.status === 503 ||
            response.status === 504
          ? "UPSTREAM_UNAVAILABLE"
          : null,
    requestId: response.headers.get("x-request-id"),
    retryAfterSeconds:
      response.headers.has("x-retry-after") && Number.isFinite(retryAfter)
        ? retryAfter
        : null,
  });
}

/**
 * POSTs `body` to Better Auth's `path` and returns the JSON it answers.
 *
 * @throws {AuthError}
 */
async function post(path: string, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${AUTH_PATH}${path}`, {
      method: "POST",
      // JSON for every state change, a body-less one too (SDD 7.2 CSRF).
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch (cause) {
    throw new AuthError({ status: null, code: null, cause });
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw authErrorOf(response, data);
  return data;
}

/** A1: signs in with email and password; the session comes back as a cookie. */
export async function signInWithEmail(email: string, password: string) {
  await post("/sign-in/email", { email, password });
}

/** Where a Google sign-in returns to (SDD 5.4「Google」). */
export interface GoogleSignIn {
  /** Where the browser goes once signed in. */
  callbackURL: string;
  /** Where it goes when Google or the API refuse; Better Auth adds `error=`. */
  errorCallbackURL: string;
  /** A sign-up from the invitation screen names its invitation. */
  invitationToken?: string;
}

/**
 * A2: starts a Google sign-in and leaves the page for Google. A sign-up names the
 * invitation it starts from: the API takes the token only to find that invitation
 * (SDD 5.4「新規登録の制限」).
 *
 * @throws {AuthError} when the API does not start one (no Google client locally).
 */
export async function continueWithGoogle({
  callbackURL,
  errorCallbackURL,
  invitationToken,
}: GoogleSignIn) {
  const answer = await post("/sign-in/social", {
    provider: "google",
    callbackURL,
    errorCallbackURL,
    ...(invitationToken === undefined
      ? {}
      : { requestSignUp: true, additionalData: { invitationToken } }),
  });
  const url =
    typeof answer === "object" && answer !== null && "url" in answer
      ? answer.url
      : undefined;
  if (typeof url !== "string") {
    throw new AuthError({ status: 200, code: null });
  }
  window.location.assign(url);
}

/**
 * A4: signs out. Without a session the API answers 401 (SDD 5.4「セッション」), which
 * leaves the user signed out all the same.
 *
 * @throws {AuthError} for any other failure: the session may still be there.
 */
export async function signOut() {
  try {
    await post("/sign-out", {});
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) return;
    throw error;
  }
}

/**
 * A6: asks for a password reset mail. The answer is the same whether or not an account
 * has the address (design-spec 6.16).
 */
export async function requestPasswordReset(email: string) {
  await post("/request-password-reset", { email });
}

/** A7: sets a new password with the token of the mail's link; it ends signed in. */
export async function resetPassword(token: string, newPassword: string) {
  await post("/reset-password", { token, newPassword });
}

/**
 * The path a sign-in goes back to (`?next=`, SDD 4章), when it is a path of this site:
 * anything else (another origin, `//host`, a scheme) would send the user away. Checked
 * once resolved, as `/.//host` resolves to `//host`, and without backslashes or encoded
 * slashes, which browsers and Better Auth's callback check read as slashes or refuse.
 */
export function safeNext(next: string | undefined): string | undefined {
  if (next === undefined || !next.startsWith("/") || /\\|%2f|%5c/i.test(next)) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(next, "http://moonx.invalid");
  } catch {
    return undefined;
  }
  if (url.origin !== "http://moonx.invalid" || url.pathname.startsWith("//")) {
    return undefined;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
