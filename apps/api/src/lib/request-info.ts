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
