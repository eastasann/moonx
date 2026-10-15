import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { hashInvitationToken, INVITATION_VALID_MS } from "../invitations";
import {
  accounts,
  invitations,
  memberships,
  users,
  workspaces,
} from "../schema";
import {
  BCDX_MEMBERS,
  BCDX_WORKSPACE_ID,
  personalWorkspaceId,
  type SeedContext,
  type UserKey,
  userId,
} from "./context";
import { seedId } from "./ids";

/** Every demo user signs in with this password (design-spec 8.1). */
export const SEED_PASSWORD = "moonx-demo-2026";

/** The invitation tokens of design-spec 8.1, for opening /invite/{token}. */
export const SEED_INVITATION_TOKENS = {
  pending: "demo-invite-pending",
  expired: "demo-invite-expired",
} as const;

interface UserSpec {
  displayName: string;
  email: string;
  isAdmin: boolean;
  role: "owner" | "member" | "viewer" | null;
  joinedDaysAgo: number;
  /** Hours before the run the user was last active. */
  activeHoursAgo: number;
}

/** design-spec 8.1. */
export const SEED_USERS: Record<UserKey, UserSpec> = {
  admin: {
    displayName: "Moonx Admin",
    email: "admin@moonx.example",
    isAdmin: true,
    role: null,
    joinedDaysAgo: 115,
    activeHoursAgo: 30,
  },
  ana: {
    displayName: "Ana Villanueva",
    email: "ana@bcdx.example",
    isAdmin: false,
    role: "owner",
    joinedDaysAgo: 100,
    activeHoursAgo: 2,
  },
  kenji: {
    displayName: "Kenji Mori",
    email: "kenji@bcdx.example",
    isAdmin: false,
    role: "member",
    joinedDaysAgo: 96,
    activeHoursAgo: 1,
  },
  paolo: {
    displayName: "Paolo Gonzaga",
    email: "paolo@bcdx.example",
    isAdmin: false,
    role: "member",
    joinedDaysAgo: 95,
    activeHoursAgo: 20,
  },
  grace: {
    displayName: "Grace Tan",
    email: "grace@advisor.example",
    isAdmin: false,
    role: "viewer",
    joinedDaysAgo: 60,
    activeHoursAgo: 72,
  },
};

const USER_KEYS = Object.keys(SEED_USERS) as UserKey[];

/** When Ana made the BCDX workspace, right after joining. */
const BCDX_CREATED_DAYS_AGO = 99;

/**
 * Users with their credential accounts, the BCDX workspace, a personal workspace each, the
 * memberships and the two invitations of design-spec 8.1. Everyone but Admin lands on
 * BCDX after signing in.
 */
export async function seedPeople({ tx, clock }: SeedContext): Promise<void> {
  await tx.insert(users).values(
    USER_KEYS.map((key) => {
      const user = SEED_USERS[key];
      return {
        id: userId(key),
        email: user.email,
        emailVerified: true,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
        lastActiveAt: clock.ago(0, user.activeHoursAgo),
        createdAt: clock.ago(user.joinedDaysAgo),
        updatedAt: clock.ago(user.joinedDaysAgo),
      };
    }),
  );
  // One hash per user: each gets its own salt, as a sign-up would give it.
  const passwordHashes = await Promise.all(
    USER_KEYS.map(() => hashPassword(SEED_PASSWORD)),
  );
  await tx.insert(accounts).values(
    USER_KEYS.map((key, index) => ({
      id: seedId("account", key),
      userId: userId(key),
      // Better Auth's credential accounts use the user's id as the provider's id.
      accountId: userId(key),
      providerId: "credential",
      password: passwordHashes[index],
      createdAt: clock.ago(SEED_USERS[key].joinedDaysAgo),
      updatedAt: clock.ago(SEED_USERS[key].joinedDaysAgo),
    })),
  );

  await tx.insert(workspaces).values([
    {
      id: BCDX_WORKSPACE_ID,
      name: "BCDX",
      currency: "PHP",
      isPersonal: false,
      createdById: userId("ana"),
      createdAt: clock.ago(BCDX_CREATED_DAYS_AGO),
      updatedAt: clock.ago(BCDX_CREATED_DAYS_AGO),
    },
    ...USER_KEYS.map((key) => ({
      id: personalWorkspaceId(key),
      name: `${SEED_USERS[key].displayName}'s workspace`,
      currency: "PHP",
      isPersonal: true,
      createdById: userId(key),
      createdAt: clock.ago(SEED_USERS[key].joinedDaysAgo),
      updatedAt: clock.ago(SEED_USERS[key].joinedDaysAgo),
    })),
  ]);
  await tx.insert(memberships).values([
    ...USER_KEYS.map((key) => ({
      id: seedId("membership", "personal", key),
      workspaceId: personalWorkspaceId(key),
      userId: userId(key),
      role: "owner" as const,
      createdAt: clock.ago(SEED_USERS[key].joinedDaysAgo),
      updatedAt: clock.ago(SEED_USERS[key].joinedDaysAgo),
    })),
    ...BCDX_MEMBERS.map((key) => {
      const user = SEED_USERS[key];
      if (user.role === null) throw new Error(`${key} has no BCDX role`);
      const joined = Math.min(user.joinedDaysAgo, BCDX_CREATED_DAYS_AGO);
      return {
        id: seedId("membership", "bcdx", key),
        workspaceId: BCDX_WORKSPACE_ID,
        userId: userId(key),
        role: user.role,
        createdAt: clock.ago(joined),
        updatedAt: clock.ago(joined),
      };
    }),
  ]);
  for (const key of USER_KEYS) {
    await tx
      .update(users)
      .set({
        lastWorkspaceId:
          SEED_USERS[key].role === null
            ? personalWorkspaceId(key)
            : BCDX_WORKSPACE_ID,
      })
      .where(eq(users.id, userId(key)));
  }

  const invitation = (
    key: keyof typeof SEED_INVITATION_TOKENS,
    email: string,
    sentDaysAgo: number,
  ) => ({
    id: seedId("invitation", key),
    workspaceId: BCDX_WORKSPACE_ID,
    email,
    role: "member" as const,
    tokenHash: hashInvitationToken(SEED_INVITATION_TOKENS[key]),
    invitedById: userId("ana"),
    status: "pending" as const,
    expiresAt: new Date(clock.ago(sentDaysAgo).getTime() + INVITATION_VALID_MS),
    createdAt: clock.ago(sentDaysAgo),
    updatedAt: clock.ago(sentDaysAgo),
  });
  // An expired invitation is a pending one past expires_at: expiry is not stored (SDD 6.2).
  await tx
    .insert(invitations)
    .values([
      invitation("pending", "new.member@bcdx.example", 2),
      invitation("expired", "late.joiner@bcdx.example", 10),
    ]);
}
