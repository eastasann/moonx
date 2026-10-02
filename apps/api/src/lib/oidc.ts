import { ApiError } from "../errors";

/** Issuer Google puts in the ID tokens Cloud Scheduler sends (SDD 5.14 Z3). */
export const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/** A public key in JWK form (RFC 7517), as Google publishes it. */
export type Jwk = { kty: string; n?: string; e?: string; kid?: string; alg?: string };

/** Looks up the public key that signed a token by its `kid`; null when the issuer has no such key. */
export type OidcKeySource = (kid: string) => Promise<Jwk | null>;

const MIN_CACHE_MS = 60_000;
const DEFAULT_CACHE_MS = 60 * 60_000;
/** An unknown `kid` refetches the key set at most this often, so forged tokens cannot make us hammer Google. */
const REFETCH_INTERVAL_MS = 60_000;

/**
 * Google's signing keys, fetched once and kept for as long as the response allows (`max-age`).
 * Keys rotate, so a `kid` that is not cached triggers one refetch before the token is refused.
 */
export function googleKeySource(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): OidcKeySource {
  let keys = new Map<string, Jwk>();
  let expiresAt = 0;
  let fetchedAt = 0;

  async function refresh() {
    const response = await fetchImpl(GOOGLE_CERTS_URL);
    if (!response.ok) throw new ApiError("UPSTREAM_UNAVAILABLE", "Google's keys are unavailable");
    const body = (await response.json()) as { keys?: Jwk[] };
    keys = new Map((body.keys ?? []).flatMap((key) => (key.kid ? [[key.kid, key] as const] : [])));
    const maxAge = /max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1];
    fetchedAt = now();
    expiresAt =
      fetchedAt + (maxAge ? Math.max(Number(maxAge) * 1000, MIN_CACHE_MS) : DEFAULT_CACHE_MS);
  }

  return async (kid) => {
    if (now() >= expiresAt) await refresh();
    const cached = keys.get(kid);
    if (cached) return cached;
    if (now() - fetchedAt >= REFETCH_INTERVAL_MS) await refresh();
    return keys.get(kid) ?? null;
  };
}

function decodePart(part: string | undefined): Record<string, unknown> | null {
  if (!part) return null;
  try {
    const value = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const unauthenticated = (why: string) => new ApiError("UNAUTHENTICATED", why);

/** What a Z3 caller must prove: the audience and the service account the deployment configured. */
export interface OidcExpectation {
  audience: string;
  email: string;
}

/**
 * Verifies a Google ID token (RS256) the way Cloud Run's own invoker check would: signature
 * against the issuer's keys, `iss`, `aud`, expiry, and then the service account. A token that is
 * not a valid Google token for this service is 401; a valid one from another account is 403.
 */
export async function verifyOidcToken(
  token: string,
  expected: OidcExpectation,
  keys: OidcKeySource,
  now: Date,
): Promise<void> {
  const [rawHeader, rawPayload, rawSignature, ...extra] = token.split(".");
  const header = decodePart(rawHeader);
  const payload = decodePart(rawPayload);
  if (!header || !payload || !rawSignature || extra.length > 0) {
    throw unauthenticated("The token is not a JWT");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw unauthenticated("The token is not signed with RS256");
  }
  const jwk = await keys(header.kid);
  if (!jwk) throw unauthenticated("The token's signing key is unknown");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    Buffer.from(rawSignature, "base64url"),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
  );
  if (!valid) throw unauthenticated("The token's signature is invalid");

  if (payload.iss !== GOOGLE_ISSUER && payload.iss !== "accounts.google.com") {
    throw unauthenticated("The token's issuer is wrong");
  }
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audience.includes(expected.audience)) throw unauthenticated("The token's audience is wrong");
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
    throw unauthenticated("The token has expired");
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds) {
    throw unauthenticated("The token is not valid yet");
  }
  if (
    payload.email_verified !== true ||
    typeof payload.email !== "string" ||
    payload.email.toLowerCase() !== expected.email
  ) {
    throw new ApiError("FORBIDDEN", "The token is not from the cron service account");
  }
}
