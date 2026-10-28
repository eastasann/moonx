import { IllustratedMessage } from "@moonx/ui-web";
import { TicketX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StandaloneFrame } from "./StandaloneFrame";

/**
 * "This invitation is invalid or expired. Ask the person who invited you for a new one."
 * (design-spec 6.16 2): a link revoked, expired or unknown, and one used by an account
 * that is gone, all alike.
 */
export function InvalidInvitation() {
  const { t } = useTranslation(["errors"]);
  return (
    <StandaloneFrame>
      <IllustratedMessage
        headingLevel={1}
        icon={<TicketX />}
        heading={t("errors:INVITATION_INVALID")}
      />
    </StandaloneFrame>
  );
}
