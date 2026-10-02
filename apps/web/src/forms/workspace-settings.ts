import { createInvitationBodySchema, currencySchema, workspaceNameSchema } from "@moonx/schemas";
import { z } from "zod";

/** Screen 9, name and currency. */
export const workspaceGeneralSchema = z.object({
  name: workspaceNameSchema,
  currency: currencySchema,
});

/** Screen 9, send an invitation: the API's own body check. */
export const inviteMemberSchema = createInvitationBodySchema;
