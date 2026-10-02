import { createHash } from "node:crypto";
import { uid } from "../lib/ids";
import { hashPassword } from "../lib/password";
import type { World } from "../lib/rows";
import type { Clock } from "../lib/time";
import {
  BCDX,
  DEMO_INVITE_TOKENS,
  DEMO_PASSWORD,
  type PersonKey,
  people,
  personalWorkspaceId,
  personKeys,
  userId,
} from "./ids";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Users, sign-in accounts, workspaces, memberships and invitations (design-spec 8.1). */
export async function addAccounts(world: World, clock: Clock) {
  const roles: Partial<Record<PersonKey, "owner" | "member" | "viewer">> = {
    ana: "owner",
    kenji: "member",
    paolo: "member",
    grace: "viewer",
  };

  for (const key of personKeys) {
    const person = people[key];
    const created = clock.ago(120);
    world.users.push({
      id: userId(key),
      email: person.email,
      emailVerified: true,
      displayName: person.name,
      isAdmin: person.isAdmin,
      status: "active",
      theme: "system",
      timezone: "Asia/Manila",
      lastActiveAt: clock.ago(key === "grace" ? 6 : 0, 9),
      createdAt: created,
      updatedAt: created,
    });
    world.accounts.push({
      id: uid("account", key),
      userId: userId(key),
      accountId: userId(key),
      providerId: "credential",
      password: await hashPassword(DEMO_PASSWORD),
      createdAt: created,
      updatedAt: created,
    });
    world.workspaces.push({
      id: personalWorkspaceId(key),
      name: `${person.name}'s workspace`,
      currency: "PHP",
      isPersonal: true,
      createdById: userId(key),
      lastActiveAt: created,
      createdAt: created,
      updatedAt: created,
    });
    world.memberships.push({
      id: uid("membership", "personal", key),
      workspaceId: personalWorkspaceId(key),
      userId: userId(key),
      role: "owner",
      createdAt: created,
      updatedAt: created,
    });
  }

  world.workspaces.push({
    id: BCDX,
    name: "BCDX",
    currency: "PHP",
    isPersonal: false,
    createdById: userId("ana"),
    lastActiveAt: clock.ago(0, 9),
    createdAt: clock.ago(110),
    updatedAt: clock.ago(110),
  });
  for (const [key, role] of Object.entries(roles) as [PersonKey, "owner" | "member" | "viewer"][]) {
    world.memberships.push({
      id: uid("membership", "bcdx", key),
      workspaceId: BCDX,
      userId: userId(key),
      role,
      createdAt: clock.ago(109),
      updatedAt: clock.ago(109),
    });
  }

  world.invitations.push(
    {
      id: uid("invitation", "pending"),
      workspaceId: BCDX,
      email: "new.member@bcdx.example",
      role: "member",
      tokenHash: sha256(DEMO_INVITE_TOKENS.pending),
      invitedById: userId("ana"),
      status: "pending",
      expiresAt: clock.ago(-5),
      createdAt: clock.ago(2),
      updatedAt: clock.ago(2),
    },
    {
      id: uid("invitation", "expired"),
      workspaceId: BCDX,
      email: "late.joiner@bcdx.example",
      role: "member",
      tokenHash: sha256(DEMO_INVITE_TOKENS.expired),
      invitedById: userId("ana"),
      status: "expired",
      expiresAt: clock.ago(10),
      createdAt: clock.ago(17),
      updatedAt: clock.ago(10),
    },
  );
}
