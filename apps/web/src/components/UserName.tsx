import { i18n } from "@moonx/i18n";
import type { UserRef } from "@moonx/schemas";
import { Badge } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** The words of a person's badge (design-spec 6.16), or null for none. */
const badgeWords = (user: UserRef) =>
  user.badge === "former_member" || user.badge === "suspended"
    ? i18n.t(`app:userBadge.${user.badge}`)
    : null;

/** The name {@link UserName} shows, the catalog's "Deleted user" for a deleted account. */
const shownName = (user: UserRef) =>
  user.badge === "deleted" ? i18n.t("app:userBadge.deleted") : user.displayName;

/**
 * {@link UserName} as text, for a name inside a sentence or a label ("by Kenji Mori
 * (former member)"): the badge's words follow the name in plain text.
 */
export function userNameText(user: UserRef): string {
  const badge = badgeWords(user);
  return badge === null
    ? shownName(user)
    : i18n.t("app:userBadge.withName", { name: shownName(user), badge });
}

/**
 * A person's name as records keep it (design-spec 6.16・6.17): with "(former member)" or
 * "(suspended)" beside it. A deleted account's name is the catalog's "Deleted user" in
 * place of the one its row holds (SDD 5.2 UserRef).
 */
export function UserName({ user }: { user: UserRef }) {
  // Rendered again when the language changes (SDD 9章).
  useTranslation(["app"]);
  const badge = badgeWords(user);
  return (
    <>
      {shownName(user)}
      {badge !== null && (
        <>
          {" "}
          <Badge>{badge}</Badge>
        </>
      )}
    </>
  );
}
