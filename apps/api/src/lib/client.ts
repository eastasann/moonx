import { MIN_APP_VERSION } from "../config";

/** The client that sent a request, from `X-Moonx-Client`. */
export type ClientKind = "web" | "ios" | "android" | "unknown";

/** `X-Moonx-Client` as stored in `change_history.client`. */
export function parseClient(header: string | null): ClientKind {
  return header === "web" || header === "ios" || header === "android" ? header : "unknown";
}

function parseVersion(version: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/**
 * A mobile build older than the minimum, or one that does not say which build it is, must update
 * (SDD 5.1). The web client has no minimum: it is always the version the server serves.
 */
export function isAppTooOld(client: ClientKind, appVersion: string | null): boolean {
  if (client !== "ios" && client !== "android") return false;
  const have = appVersion ? parseVersion(appVersion) : null;
  const min = parseVersion(MIN_APP_VERSION[client]);
  if (!have || !min) return true;
  for (let i = 0; i < 3; i++) {
    const a = have[i] ?? 0;
    const b = min[i] ?? 0;
    if (a !== b) return a < b;
  }
  return false;
}
