import { schema } from "@moonx/db";
import { eq } from "drizzle-orm";
import type { Auth } from "../auth";
import { ApiError } from "../errors";
import type { Db } from "./db";

/** The signed-in user as handlers see them. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  timezone: string;
  /** The session this request came in with. */
  sessionId: string;
  /** When the session was created: U7 and U8 ask for a sign-in from the last 10 minutes. */
  sessionCreatedAt: Date;
}

/**
 * The one place that turns a request into the signed-in user: Better Auth resolves the session
 * from the cookie, then the user row is read again so a suspended or deleted user is answered
 * with 401 even while a session row is still around (SDD 7.1).
 */
export async function currentUser(db: Db, auth: Auth, request: Request): Promise<AuthUser> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new ApiError("UNAUTHENTICATED", "Sign in required");
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
      isAdmin: schema.users.isAdmin,
      timezone: schema.users.timezone,
      status: schema.users.status,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id));
  if (user?.status !== "active") throw new ApiError("UNAUTHENTICATED", "Sign in required");
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    timezone: user.timezone,
    sessionId: session.session.id,
    sessionCreatedAt: new Date(session.session.createdAt),
  };
}
