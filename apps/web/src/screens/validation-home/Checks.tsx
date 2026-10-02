import type { CheckResult } from "@moonx/schemas";
import { Flex, Link, RowList, RowListItem, Stack, StatusLight, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { linkTargetPath } from "../../lib/link-target";
import {
  checkLabel,
  checkReasons,
  checkStateText,
  type ValidationHomeData,
} from "../../lib/validation-home";
import { BlockHeading } from "./BlockHeading";

const LIGHT = { not_started: "not-started", partial: "partial", done: "done" } as const;

function CheckRow({
  check,
  workspaceId,
  ideaId,
}: {
  check: CheckResult;
  workspaceId: string;
  ideaId: string;
}) {
  const { t } = useTranslation("validation");
  const path = linkTargetPath({ ...check.link, workspaceId, ideaId });
  const label = checkLabel(t, check);
  return (
    <RowListItem>
      <Stack gap="space-50">
        <Flex justify="between" align="center" gap="space-200" wrap>
          <StatusLight variant={LIGHT[check.state]}>
            {path ? <Link href={path}>{label}</Link> : label}
          </StatusLight>
          <Text variant="caption" tone="secondary" as="span">
            {checkStateText(t, check)}
          </Text>
        </Flex>
        {checkReasons(t, check).map((reason) => (
          <Text key={reason} variant="caption" tone="secondary">
            {reason}
          </Text>
        ))}
      </Stack>
    </RowListItem>
  );
}

/** The six checks with their state, what is missing and where to fill it (no totals or scores). */
export function Checks({ data, workspaceId }: { data: ValidationHomeData; workspaceId: string }) {
  const { t } = useTranslation("validation");
  return (
    <Stack gap="space-100">
      <BlockHeading>{t("home.blocks.checks")}</BlockHeading>
      <RowList aria-label={t("home.blocks.checks")}>
        {data.checks.map((check) => (
          <CheckRow key={check.key} check={check} workspaceId={workspaceId} ideaId={data.idea.id} />
        ))}
      </RowList>
    </Stack>
  );
}
