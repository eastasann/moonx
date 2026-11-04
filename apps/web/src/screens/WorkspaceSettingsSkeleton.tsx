import {
  Avatar,
  Button,
  Heading,
  SettingsFieldRow,
  SettingsList,
  SettingsListItem,
  SettingsPattern,
  TextField,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** 9's skeleton: its three groups in the shape of their fields and rows. */
export function WorkspaceSettingsSkeleton() {
  const { t } = useTranslation(["settings"]);
  return (
    <SettingsPattern
      header={
        <Heading level={1} variant="heading-1-settings">
          {t("settings:workspace.title")}
        </Heading>
      }
      groups={[
        {
          id: "workspace",
          title: t("settings:workspace.workspace.title"),
          content: (
            <>
              <TextField label={t("settings:workspace.workspace.name")} />
              <TextField label={t("settings:workspace.workspace.currency")} />
            </>
          ),
        },
        {
          id: "members",
          title: t("settings:workspace.members.title"),
          content: <MembersSkeleton />,
        },
        {
          id: "invitations",
          title: t("settings:workspace.invitations.title"),
          content: (
            <SettingsFieldRow>
              <TextField
                aria-label={t("settings:workspace.invitations.email")}
              />
              <TextField
                aria-label={t("settings:workspace.invitations.role")}
              />
              <Button variant="primary">
                {t("settings:workspace.invitations.send")}
              </Button>
            </SettingsFieldRow>
          ),
        },
      ]}
    />
  );
}

/** 9's members while they load (design-spec 6.0.6): three rows in their shape. */
export function MembersSkeleton() {
  const { t } = useTranslation(["settings"]);
  return (
    <SettingsList aria-label={t("settings:workspace.members.list")}>
      {[0, 1, 2].map((row) => (
        <SettingsListItem
          key={row}
          avatar={<Avatar name="" size="M" />}
          title={t("settings:workspace.members.title")}
          description={t("settings:workspace.invitations.emailPlaceholder")}
        />
      ))}
    </SettingsList>
  );
}
