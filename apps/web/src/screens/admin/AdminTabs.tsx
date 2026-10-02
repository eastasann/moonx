import { Tab, TabList, TabPanel, Tabs } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { useGoTo } from "../../lib/navigate";

export type AdminScreen = "templates" | "users";

const PATH: Record<AdminScreen, string> = {
  templates: "/admin/templates",
  users: "/admin/users",
};

/**
 * The tabs that join the operator's screens, 26 and 28 (design-spec 6.17). The sidebar's Admin
 * entry opens 26; this is how an operator reaches 28 and comes back.
 */
export function AdminTabs({ current }: { current: AdminScreen }) {
  const { t } = useTranslation("admin");
  const goTo = useGoTo();
  return (
    <Tabs selectedKey={current} onSelectionChange={(key) => goTo(PATH[key as AdminScreen])}>
      <TabList aria-label={t("screens.label")}>
        <Tab id="templates">{t("screens.templates")}</Tab>
        <Tab id="users">{t("screens.users")}</Tab>
      </TabList>
      {/* The selected tab names its panel in aria-controls; the screen itself is the content. */}
      <TabPanel id={current} />
    </Tabs>
  );
}
