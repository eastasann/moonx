import type { ClientKind } from "./client";

/** What the logs, the error envelope and Sentry need to know about the request in flight. */
export interface RequestInfo {
  requestId: string;
  startedAt: number;
  userId: string | null;
  client: ClientKind;
  appVersion: string | null;
}

const infos = new WeakMap<Request, RequestInfo>();

/** Records the request context when the request enters the pipeline. */
export function setRequestInfo(request: Request, info: RequestInfo): void {
  infos.set(request, info);
}

/** The context of the request in flight. Throws when the base plugin did not run. */
export function requestInfo(request: Request): RequestInfo {
  const info = infos.get(request);
  if (!info) throw new Error("request info is missing: the base plugin must run first");
  return info;
}

/** Adds the signed-in user to the context once authentication has run, for the access log. */
export function setRequestUser(request: Request, userId: string): void {
  const info = infos.get(request);
  if (info) info.userId = userId;
}

/**
 * The caller's address from `CF-Connecting-IP`. The header is trustworthy only because the base
 * plugin has already rejected requests without the Worker's shared secret when one is configured
 * (SDD 7.2); without a secret (local, tests) a missing header reads as one shared bucket.
 */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}
