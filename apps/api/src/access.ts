import { Elysia } from "elysia";
import type { AppContext } from "./context";
import { ApiError } from "./errors";
import { setRequestUser } from "./lib/request-info";
import { authorize, type Need, type Scope, type ScopeRef } from "./lib/scope";
import { type AuthUser, currentUser } from "./lib/session";

/**
 * Every route declares who may call it, as a route option (SDD 7.1, ADR-005):
 *
 * - `open`: no session (sign-in pages, health, the invitation link, Cloud Scheduler)
 * - `signedIn`: any signed-in user; the route only touches the caller's own data
 * - `operator`: `is_admin` only
 * - `scoped`: the workspace of a resource and the caller's role in it; the handler receives `scope`
 * - `located`: like `scoped`, for a resource that may belong to no workspace (a self analysis)
 *
 * Give every route its own rule object: Elysia reuses what a macro built for an object it has
 * seen, so one object shared by routes of different apps (tests build several) would keep the
 * first app's database.
 *
 * A route with none of them is not served: `assertAllRoutesDeclared` stops the app from starting.
 */

const DECLARED = Symbol.for("moonx.access.declared");

/** Marks a hook as an access declaration so `assertAllRoutesDeclared` can find it. */
function declared<F extends (...args: never[]) => unknown>(hook: F): F {
  (hook as unknown as Record<symbol, boolean>)[DECLARED] = true;
  return hook;
}

/** What a declaration sees of the request: the path, query and body are already validated. */
export interface AccessInput {
  user: AuthUser;
  request: Request;
  // biome-ignore lint/suspicious/noExplicitAny: the route's own params schema is not known here
  params: Record<string, any>;
  // biome-ignore lint/suspicious/noExplicitAny: the route's own query schema is not known here
  query: Record<string, any>;
  // biome-ignore lint/suspicious/noExplicitAny: the route's own body schema is not known here
  body: any;
}

type ScopeRefKey = ScopeRef extends infer R ? (R extends R ? keyof R : never) : never;

/** `{ ideaId: "id" }`: the path parameter `id` is the id of an idea. */
export type ParamRef = { [K in ScopeRefKey]?: string };

type Locator<R> = ParamRef | ((input: AccessInput) => R | Promise<R>);
type Rule<R> = { to: Locator<R>; need: Need | ((input: AccessInput) => Need) };

async function locate<R extends ScopeRef | null>(
  to: Locator<R>,
  input: AccessInput,
): Promise<ScopeRef | R> {
  if (typeof to === "function") return to(input);
  const [[key, param]] = Object.entries(to) as [[string, string]];
  return { [key]: input.params[param as string] } as ScopeRef;
}

async function check<R extends ScopeRef | null>(
  ctx: AppContext,
  rule: Rule<R>,
  input: AccessInput,
): Promise<Scope | null> {
  if (!input.user) throw new ApiError("UNAUTHENTICATED", "Sign in required");
  const ref = await locate(rule.to, input);
  if (ref === null) return null;
  const need = typeof rule.need === "function" ? rule.need(input) : rule.need;
  return authorize(ctx.db, input.user, ref, need);
}

/** Signs the caller in (before the body is validated, so a stranger learns nothing from 422) and offers `signedIn`, `scoped` and `located`. */
export function accessPlugin(ctx: AppContext) {
  return new Elysia({ name: "moonx-access" })
    .derive({ as: "scoped" }, async ({ request }) => {
      const user = await currentUser(ctx.db, ctx.auth, request);
      setRequestUser(request, user.id);
      return { user };
    })
    .macro({
      signedIn: (_on: true) => ({ beforeHandle: declared(() => {}) }),
      scoped: (rule: Rule<ScopeRef>) => ({
        resolve: declared(async (context: object) => ({
          scope: (await check(ctx, rule, context as AccessInput)) as Scope,
        })),
      }),
      located: (rule: Rule<ScopeRef | null>) => ({
        resolve: declared(async (context: object) => ({
          scope: await check(ctx, rule, context as AccessInput),
        })),
      }),
    });
}

/** The operator check sits in a derive, not a hook, so a non-operator gets 403 before validation. */
export function operatorPlugin(ctx: AppContext) {
  return new Elysia({ name: "moonx-operator" })
    .derive({ as: "scoped" }, async ({ request }) => {
      const user = await currentUser(ctx.db, ctx.auth, request);
      setRequestUser(request, user.id);
      if (!user.isAdmin) throw new ApiError("FORBIDDEN", "Operators only");
      return { user };
    })
    .macro({ operator: (_on: true) => ({ beforeHandle: declared(() => {}) }) });
}

/** For routes that answer without a session. */
export function openPlugin() {
  return new Elysia({ name: "moonx-open" }).macro({
    open: (_on: true) => ({ beforeHandle: declared(() => {}) }),
  });
}

interface RouteHooks {
  beforeHandle?: unknown;
}

function carriesDeclaration(hooks: RouteHooks | undefined): boolean {
  const list = [hooks?.beforeHandle].flat().filter(Boolean) as (
    | ((...args: never[]) => unknown)
    | { fn?: (...args: never[]) => unknown }
  )[];
  return list.some((hook) => {
    const fn = typeof hook === "function" ? hook : hook.fn;
    return (fn as unknown as Record<symbol, boolean> | undefined)?.[DECLARED] === true;
  });
}

/** Throws when a route has no access declaration, so one cannot go live by being forgotten. */
export function assertAllRoutesDeclared(app: {
  routes: { method: string; path: string; hooks: RouteHooks }[];
}): void {
  const missing = app.routes
    .filter((route) => route.method !== "HEAD" && !carriesDeclaration(route.hooks))
    .map((route) => `${route.method} ${route.path}`);
  if (missing.length > 0) {
    throw new Error(`Routes without an access declaration: ${missing.join(", ")}`);
  }
}
