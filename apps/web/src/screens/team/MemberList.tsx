import { Avatar, Flex, ListView, ListViewItem, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import type { TeamMember } from "../../lib/self-analysis";
import { proposerName } from "../ideas/ideaText";

/**
 * The Owners and Members of the workspace. One who shared is a row to open; one who did not
 * shows "Not shared" in grey and nothing of their progress (design-spec 6.11).
 */
export function MemberList({
  members,
  selectedId,
  onSelect,
}: {
  members: TeamMember[];
  selectedId: string | undefined;
  onSelect: (userId: string) => void;
}) {
  const { t } = useTranslation(["selfAnalysis", "ideas", "common"]);
  const unavailable = members.filter((member) => !member.shared).map((member) => member.user.id);
  return (
    <ListView
      aria-label={t("selfAnalysis:team.listLabel")}
      selectionMode="single"
      selectionBehavior="replace"
      disallowEmptySelection
      disabledKeys={unavailable}
      selectedKeys={selectedId ? [selectedId] : []}
      onSelectionChange={(keys) => {
        const [key] = keys === "all" ? [] : keys;
        if (key !== undefined) onSelect(String(key));
      }}
    >
      {members.map(({ user, shared, status }) => {
        const name = proposerName(t, user);
        return (
          <ListViewItem key={user.id} id={user.id} textValue={name}>
            <Flex gap="space-200" align="center" justify="between" grow>
              <Flex gap="space-100" align="center">
                <Avatar name={name} src={user.avatarUrl} size="S" />
                <Text tone={shared ? "primary" : "secondary"} as="span">
                  {name}
                </Text>
              </Flex>
              <Text variant="caption" tone="secondary" as="span">
                {shared && status
                  ? t("selfAnalysis:team.shared", {
                      status: t(`selfAnalysis:status.${status}`),
                    })
                  : t("selfAnalysis:team.notShared")}
              </Text>
            </Flex>
          </ListViewItem>
        );
      })}
    </ListView>
  );
}
