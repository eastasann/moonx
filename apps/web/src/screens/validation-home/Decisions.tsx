import { formatDate } from "@moonx/i18n";
import { Badge, Flex, Link, RowList, RowListItem, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { linkTargetPath } from "../../lib/link-target";
import type { ValidationHomeData } from "../../lib/validation-home";
import { BlockHeading } from "./BlockHeading";
import { decisionBadge, decisionText } from "./decision-text";

type Entry = ValidationHomeData["decisions"][number];

function EntryLabel({ entry }: { entry: Entry }) {
  const { t } = useTranslation("validation");
  if (entry.kind === "version_saved") {
    return (
      <Badge size="S">
        {t("home.decisions.versionSaved", { version: entry.versionName ?? "" })}
      </Badge>
    );
  }
  const value = entry.value as Parameters<typeof decisionBadge>[0] | null;
  if (!value) return null;
  return entry.kind === "go_no_go" ? (
    <Badge size="S">{t("home.decisions.goNoGo", { value: decisionText(t, value) })}</Badge>
  ) : (
    <Badge size="S" variant={decisionBadge(value)}>
      {decisionText(t, value)}
    </Badge>
  );
}

/** The latest five decisions, newest first, with a link to the whole log (design-spec 6.1). */
export function Decisions({
  data,
  workspaceId,
  timeZone,
}: {
  data: ValidationHomeData;
  workspaceId: string;
  timeZone: string;
}) {
  const { t } = useTranslation("validation");
  const logPath = linkTargetPath({ screen: 7, workspaceId, ideaId: data.idea.id });
  return (
    <Stack gap="space-100">
      <BlockHeading>{t("home.blocks.decisions")}</BlockHeading>
      {data.decisions.length === 0 ? (
        <Text tone="secondary">{t("home.decisions.empty")}</Text>
      ) : (
        <RowList aria-label={t("home.blocks.decisions")}>
          {data.decisions.map((entry) => (
            <RowListItem key={entry.id}>
              <Stack gap="space-50">
                <Flex gap="space-100" align="center" wrap>
                  <EntryLabel entry={entry} />
                  <Text variant="caption" tone="secondary" as="span">
                    {t("home.decisions.line", {
                      date: formatDate(entry.recordedAt, timeZone),
                      who: entry.recordedBy.displayName,
                    })}
                  </Text>
                </Flex>
                {entry.reasonExcerpt ? (
                  <Text variant="body-sm">
                    {t("home.decisions.reason", { reason: entry.reasonExcerpt })}
                  </Text>
                ) : null}
              </Stack>
            </RowListItem>
          ))}
        </RowList>
      )}
      {logPath && data.decisions.length > 0 ? (
        <Link href={logPath}>{t("home.decisions.seeAll")}</Link>
      ) : null}
    </Stack>
  );
}
