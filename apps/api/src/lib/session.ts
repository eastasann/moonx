import { schema } from "@moonx/db";
import { eq } from "drizzle-orm";
import type { AppConfig } from "../config";
import { ApiError } from "../errors";
import type { Db } from "./db";

/** The signed-in user as handlers see them. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  timezone: string;
}

/** Header the local and test environments accept instead of a session (replaced in Step 9). */
export const DEV_USER_HEADER = "x-moonx-dev-user-id";

/**
 * The one place that turns a request into the signed-in user. Until Better Auth is wired in
 * (Step 9) it reads {@link DEV_USER_HEADER}, and only when `APP_ENV` is local or test. A
 * suspended or deleted user is answered with 401 whatever the credential (SDD 7.1).
 */
export async function currentUser(db: Db, config: AppConfig, request: Request): Promise<AuthUser> {
  const devAllowed = config.env === "local" || config.env === "test";
  const id = devAllowed ? request.headers.get(DEV_USER_HEADER) : null;
  if (!id) throw new ApiError("UNAUTHENTICATED", "Sign in required");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError("UNAUTHENTICATED", "Sign in required");
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
    .where(eq(schema.users.id, id));
  if (user?.status !== "active") throw new ApiError("UNAUTHENTICATED", "Sign in required");
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    timezone: user.timezone,
  };
}
