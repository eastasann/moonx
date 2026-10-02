import { Button, Divider, Heading, SettingsPattern, Stack } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { useLogout } from "../lib/logout";
import { DeleteAccountSection } from "./account/DeleteAccountSection";
import { PasswordSection } from "./account/PasswordSection";
import { PreferencesSection } from "./account/PreferencesSection";
import { ProfileSection } from "./account/ProfileSection";
import { WorkspacesSection } from "./account/WorkspacesSection";

/** Screen 4, account settings (design-spec 6.16): groups of settings in one column. */
export function Account() {
  const { t } = useTranslation(["account", "app"]);
  const logout = useLogout();
  return (
    <SettingsPattern header={<Heading level={1}>{t("account:title")}</Heading>}>
      <ProfileSection />
      <Divider />
      <PasswordSection />
      <Divider />
      <PreferencesSection />
      <Divider />
      <WorkspacesSection />
      <Divider />
      <Stack gap="space-100" align="start">
        <Button variant="secondary" onPress={() => void logout()}>
          {t("account:logout")}
        </Button>
      </Stack>
      <Divider />
      <DeleteAccountSection />
    </SettingsPattern>
  );
}
