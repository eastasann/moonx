import type { Me } from "@moonx/schemas";
import { ana } from "./api";

/** The operator of the demo data (design-spec 8.1), in their personal workspace. */
export const operator: Me = {
  ...ana,
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  email: "admin@moonx.example",
  displayName: "Moonx Admin",
  isAdmin: true,
  lastWorkspaceId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  memberships: [
    {
      workspace: {
        id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        name: "Moonx Admin's workspace",
        isPersonal: true,
        currency: "PHP",
      },
      role: "owner",
    },
  ],
};
