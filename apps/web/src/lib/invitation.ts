import type { InvitationPreview } from "@moonx/schemas";
import { queryOptions } from "@tanstack/react-query";
import { api, call } from "./api";

/** U4. Public: the invitation page reads it before anyone is signed in. */
export const invitationQuery = (token: string) =>
  queryOptions({
    queryKey: ["invitation", token],
    queryFn: (): Promise<InvitationPreview> =>
      call(api().api.v1.invitations["by-token"]({ token }).get()),
    // An invalid invitation stays invalid; retrying only delays the message.
    retry: false,
    staleTime: 0,
  });

/** Where the invitation continues once the person is signed in: step 1 of the welcome flow. */
export const welcomeInvitePath = (token: string) =>
  `/welcome?step=invite&token=${encodeURIComponent(token)}`;
