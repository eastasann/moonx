import { Elysia } from "elysia";
import type { AppContext } from "../context";
import { ApiError } from "../errors";
import { authPlugin } from "../plugins";

/**
 * The operator check, to be `.use`d right after `authPlugin` (which gives the routes their `user`) (SDD 7.1: AD1-AD9 are for `is_admin` only, 403
 * FORBIDDEN otherwise). The check sits in a derive, not a `beforeHandle`, so a non-operator
 * gets 403 before the body is validated and learns nothing from validation errors.
 */
export function adminPlugin(ctx: AppContext) {
  return new Elysia({ name: "moonx-admin-guard" })
    .use(authPlugin(ctx))
    .derive({ as: "scoped" }, ({ user }) => {
      if (!user?.isAdmin) throw new ApiError("FORBIDDEN", "Operators only");
      return {};
    });
}
