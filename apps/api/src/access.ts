import { type Database, users } from "@moonx/db";
import { eq } from "drizzle-orm";
import { type AnyElysia, type Context, Elysia } from "elysia";
import type { Auth } from "./auth";
import { requestContext } from "./entry";
import { ApiError } from "./errors";
import {
  admitScope,
  type Need,
  resolveScope,
  type Scope,
  type ScopeParam,
  type ScopeRef,
} from "./scope";

/** The signed-in user a route runs for. */
export interface Caller {
  id: string;
  email: string;
  isAdmin: boolean;
  /** The session of this request: U7 and U8 check when it was made (design-spec 6.16). */
  session: { id: string; createdAt: Date };
}

/** What a {@link ScopeLocator} reads to find the resource of a request. */
export interface LocatorContext {
  params: Record<string, string | undefined>;
  query: Record<string, unknown>;
  /** Already checked against the route's body schema. */
  body: unknown;
  caller: Caller;
  db: Database;
}

/**
 * Finds what a request acts on from its query or body (SDD 7.1「実装」). For a
 * `scoped` route null means the resource does not exist (404). For a `located` route it
 * means one without a workspace, such as the caller's own self-analysis; a missing
 * resource there throws NOT_FOUND itself.
 *
 * Declare a locator as a constant of this type: written inline with a parameter, it
 * keeps TypeScript from inferring the route's options, and the handler loses the types
 * of `caller` and `scope`.
 */
export type ScopeLocator = (
  context: LocatorContext,
) => ScopeRef | null | Promise<ScopeRef | null>;

/** A `scoped` route: what it acts on, and what it needs of the caller's role there. */
export interface ScopedDeclaration {
  /** A path parameter holding the id, or a locator. */
  to: ScopeParam | ScopeLocator;
  need: Need;
}

/** A `located` route, whose resource may have no workspace: then `scope` is null. */
export interface LocatedDeclaration {
  to: ScopeLocator;
  /** Applies only when the resource has a workspace. */
  need: Need;
}

/** The five ways a route says who may call it (ADR-005, SDD 7.1). */
export type AccessKind =
  | "open"
  | "signedIn"
  | "operator"
  | "scoped"
  | "located";

const DECLARATION = Symbol("access declaration");

/** Marks the hook a declaration adds, so {@link assertAccessDeclared} can find it. */
const declare = <F extends object>(kind: AccessKind, hook: F): F =>
  Object.assign(hook, { [DECLARATION]: kind });

const kindOf = (value: unknown): AccessKind | undefined => {
  const hook =
    typeof value === "object" && value !== null && "fn" in value
      ? value.fn
      : value;
  return typeof hook === "function"
    ? (hook as { [DECLARATION]?: AccessKind })[DECLARATION]
    : undefined;
};

/** The declarations on each route of `app`, keyed `"METHOD /path"`. */
export function accessDeclarations(app: AnyElysia): Map<string, AccessKind[]> {
  const declared = new Map<string, AccessKind[]>();
  for (const route of app.routes) {
    const kinds = Object.values(route.hooks as Record<string, unknown>)
      .flatMap((hooks) => (Array.isArray(hooks) ? hooks : [hooks]))
      .map(kindOf)
      .filter((kind) => kind !== undefined);
    declared.set(`${route.method} ${route.path}`, kinds);
  }
  return declared;
}

/** Thrown when a route declares no way of access, or more than one. */
export class AccessDeclarationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessDeclarationError";
  }
}

/**
 * Refuses an app with a route that declares none of the five ways of access, or more
 * than one: the API must not start then (ADR-005).
 *
 * @throws {AccessDeclarationError}
 */
export function assertAccessDeclared(app: AnyElysia): void {
  const wrong = [...accessDeclarations(app)].filter(
    ([, kinds]) => kinds.length !== 1,
  );
  if (wrong.length > 0) {
    throw new AccessDeclarationError(
      `Every route must declare exactly one of open, signedIn, operator, scoped or located: ${wrong
        .map(
          ([route, kinds]) =>
            `${route} (${kinds.toSorted().join(", ") || "none"})`,
        )
        .join("; ")}`,
    );
  }
}

/** What {@link accessPlugin} needs from the app. */
export interface AccessOptions {
  auth: Auth;
  db: Database;
}

/**
 * The authorization plugin of ADR-005: the route options `open`, `signedIn`,
 * `operator`, `scoped: { to, need }` and `located: { to, need }`, one of which every
 * route declares (SDD 7.1「実装」). Use it in each module that defines routes.
 *
 * The session is read in `transform`, before the body is validated, so a caller without
 * one gets 401 whatever they sent. It goes through `auth.api.getSession`, which runs
 * Better Auth's hooks (`users.last_active_at`, SDD 5.13) and may renew the session
 * cookie, which this response carries on. The scope is resolved after validation, since
 * a locator may read the body.
 */
export function accessPlugin({ auth, db }: AccessOptions) {
  const callers = new WeakMap<Request, Caller>();

  const authenticate = async ({
    request,
    set,
  }: {
    request: Request;
    set: Context["set"];
  }) => {
    const { headers, response: session } = await auth.api.getSession({
      headers: request.headers,
      returnHeaders: true,
    });
    const cookies = headers?.getSetCookie() ?? [];
    if (cookies.length > 0) set.headers["set-cookie"] = cookies;
    if (session === null) {
      throw new ApiError("UNAUTHENTICATED", "Not signed in");
    }
    const [user] = await db
      .select({
        email: users.email,
        isAdmin: users.isAdmin,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, session.user.id));
    // A suspension or deletion ends the sessions, but a request may still be under way
    // with one (SDD 7.1「停止・削除したユーザー」).
    if (user === undefined || user.status !== "active") {
      throw new ApiError("UNAUTHENTICATED", "The account is not active");
    }
    callers.set(request, {
      id: session.user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      session: { id: session.session.id, createdAt: session.session.createdAt },
    });
    requestContext(request).userId = session.user.id;
  };

  const callerOf = (request: Request): Caller => {
    const caller = callers.get(request);
    if (caller === undefined) {
      throw new Error("The session was not read for this request");
    }
    return caller;
  };

  interface RouteContext {
    request: Request;
    params: Record<string, string | undefined>;
    query: Record<string, unknown>;
    body: unknown;
  }

  const locate = async (
    to: ScopeParam | ScopeLocator,
    context: RouteContext,
    caller: Caller,
  ): Promise<ScopeRef | null> => {
    if (typeof to === "function") {
      return to({
        params: context.params,
        query: context.query,
        body: context.body,
        caller,
        db,
      });
    }
    const id = context.params[to];
    if (id === undefined) {
      throw new Error(`The route has no path parameter ${to}`);
    }
    return { [to]: id } as ScopeRef;
  };

  const admit = async (
    ref: ScopeRef,
    need: Need,
    caller: Caller,
  ): Promise<Scope> => {
    const resolved = await resolveScope(db, ref, caller.id);
    if (resolved === null) {
      throw new ApiError("NOT_FOUND", "No such resource");
    }
    return admitScope(resolved, need);
  };

  return new Elysia().macro({
    open: { beforeHandle: declare("open", () => {}) },
    signedIn: {
      transform: authenticate,
      resolve: declare("signedIn", ({ request }: RouteContext) => ({
        caller: callerOf(request),
      })),
    },
    operator: {
      transform: authenticate,
      resolve: declare("operator", ({ request }: RouteContext) => {
        const caller = callerOf(request);
        if (!caller.isAdmin) {
          throw new ApiError("FORBIDDEN", "Only operators may do this");
        }
        return { caller };
      }),
    },
    scoped: ({ to, need }: ScopedDeclaration) => ({
      transform: authenticate,
      resolve: declare("scoped", async (context: RouteContext) => {
        const caller = callerOf(context.request);
        const ref = await locate(to, context, caller);
        if (ref === null) throw new ApiError("NOT_FOUND", "No such resource");
        return { caller, scope: await admit(ref, need, caller) };
      }),
    }),
    located: ({ to, need }: LocatedDeclaration) => ({
      transform: authenticate,
      resolve: declare("located", async (context: RouteContext) => {
        const caller = callerOf(context.request);
        const ref = await locate(to, context, caller);
        const scope: Scope | null =
          ref === null ? null : await admit(ref, need, caller);
        return { caller, scope };
      }),
    }),
  });
}

/** The plugin {@link accessPlugin} returns, for route modules to `use`. */
export type AccessPlugin = ReturnType<typeof accessPlugin>;
