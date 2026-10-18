import type { UserRef } from "@moonx/schemas";
import { Badge } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/**
 * A person's name as records keep it (design-spec 6.16・6.17): with "(former member)" or
 * "(suspended)" beside it. A deleted user's name is already "Deleted user".
 */
export function UserName({ user }: { user: UserRef }) {
  const { t } = useTranslation(["app"]);
  const badge =
    user.badge === "former_member" || user.badge === "suspended"
      ? t(`app:userBadge.${user.badge}`)
      : null;
  return (
    <>
      {user.displayName}
      {badge !== null && (
        <>
          {" "}
          <Badge>{badge}</Badge>
        </>
      )}
    </>
  );
}
