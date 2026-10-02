import type { AdminUserRow, AdminWorkspaceRow } from "../src/lib/admin";
import { makeMe } from "./support";

export const ADMIN_ME = makeMe({ isAdmin: true });

export const KENJI = "66666666-6666-4666-8666-666666666666";
export const PAOLO = "77777777-7777-4777-8777-777777777777";
export const GONE = "88888888-8888-4888-8888-888888888888";

const day = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export const makeUser = (overrides: Partial<AdminUserRow> = {}): AdminUserRow => ({
  id: KENJI,
  displayName: "Kenji Mori",
  email: "kenji@bcdx.example",
  createdAt: "2026-03-04T00:00:00.000Z",
  lastActiveAt: day(2),
  workspaceCount: 2,
  status: "active",
  isAdmin: false,
  ...overrides,
});

export const USERS = {
  items: [
    makeUser({
      id: ADMIN_ME.id,
      displayName: "Ana Villanueva",
      email: "ana@example.com",
      isAdmin: true,
    }),
    makeUser(),
    makeUser({
      id: PAOLO,
      displayName: "Paolo Gonzaga",
      email: "paolo@bcdx.example",
      status: "suspended",
      lastActiveAt: null,
      workspaceCount: 1,
    }),
    makeUser({
      id: GONE,
      displayName: "Deleted user",
      email: "deleted-88888888@invalid",
      status: "deleted",
      lastActiveAt: null,
      workspaceCount: 0,
    }),
  ],
  nextCursor: null,
};

export const BCDX = "11111111-1111-4111-8111-111111111111";

export const WORKSPACES = {
  items: [
    {
      id: BCDX,
      name: "BCDX",
      isPersonal: false,
      owners: [{ id: ADMIN_ME.id, displayName: "Ana Villanueva", avatarUrl: null, badge: null }],
      memberCount: 4,
      ideaCount: 6,
      lastActiveAt: day(1),
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Kenji Mori's workspace",
      isPersonal: true,
      owners: [{ id: KENJI, displayName: "Kenji Mori", avatarUrl: null, badge: null }],
      memberCount: 1,
      ideaCount: 0,
      lastActiveAt: null,
    },
  ] satisfies AdminWorkspaceRow[],
  nextCursor: null,
};

export const INVITE_PENDING = "aaaaaaaa-0000-4000-8000-000000000001";
export const INVITE_ACCEPTED = "aaaaaaaa-0000-4000-8000-000000000002";

export const makeInvitation = (overrides: Record<string, unknown> = {}) => ({
  id: INVITE_PENDING,
  email: "new.member@bcdx.example",
  role: "member",
  workspace: { id: BCDX, name: "BCDX" },
  status: "pending",
  invitedBy: { id: ADMIN_ME.id, displayName: "Ana Villanueva", avatarUrl: null, badge: null },
  createdAt: "2026-09-30T00:00:00.000Z",
  expiresAt: "2026-10-07T00:00:00.000Z",
  acceptedAt: null,
  ...overrides,
});

export const INVITATIONS = {
  items: [
    makeInvitation(),
    makeInvitation({
      id: INVITE_ACCEPTED,
      email: "done@bcdx.example",
      role: null,
      workspace: null,
      status: "accepted",
      invitedBy: null,
      acceptedAt: "2026-10-01T00:00:00.000Z",
    }),
  ],
  nextCursor: null,
};

export const adminBase = (me = ADMIN_ME) => ({
  "GET /api/v1/me": () => ({ body: me }),
  "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
});
