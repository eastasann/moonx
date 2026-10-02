import { uid } from "../lib/ids";

export const DEMO_PASSWORD = "moonx-demo-2026";

export const DEMO_INVITE_TOKENS = {
  pending: "demo-invite-pending",
  expired: "demo-invite-expired",
} as const;

export const people = {
  admin: { email: "admin@moonx.example", name: "Moonx Admin", isAdmin: true },
  ana: { email: "ana@bcdx.example", name: "Ana Villanueva", isAdmin: false },
  kenji: { email: "kenji@bcdx.example", name: "Kenji Mori", isAdmin: false },
  paolo: { email: "paolo@bcdx.example", name: "Paolo Gonzaga", isAdmin: false },
  grace: { email: "grace@advisor.example", name: "Grace Tan", isAdmin: false },
} as const;

export type PersonKey = keyof typeof people;
export const personKeys = Object.keys(people) as PersonKey[];

export const userId = (key: PersonKey) => uid("user", key);
export const personalWorkspaceId = (key: PersonKey) => uid("workspace", "personal", key);
export const BCDX = uid("workspace", "bcdx");
