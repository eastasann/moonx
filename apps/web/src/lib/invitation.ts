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

/**
 * Where the invitation continues once the person is signed in: step 1 of the welcome flow.
 * `isNewAccount` marks someone who just registered from the invitation, who goes on to the
 * profile and the done step (the `new` flag stays on those URLs so the indicator keeps step 1); a person who logged in with an account they already had sees step 1
 * only (design-spec 6.16).
 */
export const welcomeInvitePath = (token: string, isNewAccount = false) =>
  `/welcome?step=invite&token=${encodeURIComponent(token)}${isNewAccount ? "&new=1" : ""}`;
