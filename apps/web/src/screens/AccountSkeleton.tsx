import { Heading, SettingsPattern, TextField } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** 4's skeleton: the groups' names and the shapes of their fields. */
export function AccountSkeleton() {
  const { t } = useTranslation(["settings"]);
  const field = (label: string) => <TextField label={label} />;
  return (
    <SettingsPattern
      header={
        <Heading level={1} variant="heading-1-settings">
          {t("settings:account.title")}
        </Heading>
      }
      groups={[
        {
          id: "profile",
          title: t("settings:account.profile.title"),
          content: (
            <>
              {field(t("settings:account.profile.displayName"))}
              {field(t("settings:account.profile.email"))}
            </>
          ),
        },
        {
          id: "password",
          title: t("settings:account.password.title"),
          content: field(t("settings:account.password.new")),
        },
        {
          id: "preferences",
          title: t("settings:account.preferences.title"),
          content: field(t("settings:account.preferences.timeZone")),
        },
      ]}
    />
  );
}
