import { formatRelativeTime } from "@moonx/i18n";
import { ActionMenu, Badge, CheckDots, Flex, MenuItem, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import type { IdeaSummary } from "../../lib/ideas";
import { checkLabel } from "../../lib/validation-home";
import { checkVariant, missingChecks, proposerName } from "./ideaText";

/**
 * What one row of the list shows (design-spec 6.8): name, decision, stage, proposer, when it
 * changed, the six checks as dots and the names of the ones not done. No totals or scores.
 * `onAction` is set only for people who may edit, so a Viewer gets no menu.
 */
export function IdeaRowContent({
  idea,
  now,
  timeZone,
  onAction,
}: {
  idea: IdeaSummary;
  now: Date;
  timeZone: string;
  onAction?: (action: "duplicate" | "archive" | "restore") => void;
}) {
  const { t } = useTranslation(["ideas", "validation", "common"]);
  const { stage } = idea;
  const decision = idea.latestDecision ?? "undecided";
  const missing = missingChecks(t, idea);
  return (
    <Flex gap="space-200" align="start" justify="between">
      <Flex direction="column" gap="space-50" grow>
        <Text variant="label" as="span">
          {idea.name}
        </Text>
        <Text variant="caption" tone="secondary" as="span">
          {[
            t(`validation:stage.${stage}`),
            proposerName(t, idea.proposer),
            t("ideas:row.updated", {
              when: formatRelativeTime(idea.lastActivityAt, now, timeZone),
            }),
          ].join(" · ")}
        </Text>
        <Flex gap="space-100" align="center" wrap>
          <CheckDots
            size="S"
            items={idea.checks.map(({ key, state, params }) => ({
              label: checkLabel(t, { key, params }),
              state: checkVariant(state),
              stateLabel: t(`validation:checks.state.${state}`),
            }))}
          />
          <Text variant="caption" tone="secondary" as="span">
            {missing.length > 0
              ? t("ideas:row.missing", { names: missing.join(", ") })
              : t("ideas:row.allChecksDone")}
          </Text>
        </Flex>
      </Flex>
      <Flex gap="space-100" align="center">
        {idea.archived ? <Badge size="S">{t("ideas:row.archived")}</Badge> : null}
        <Badge size="S" variant={decision}>
          {t(`ideas:decision.${decision}`)}
        </Badge>
        {onAction ? (
          <ActionMenu
            label={t("ideas:row.actions", { name: idea.name })}
            size="S"
            onAction={(key) => onAction(key as "duplicate" | "archive" | "restore")}
          >
            <MenuItem id="duplicate">{t("ideas:row.duplicate")}</MenuItem>
            {idea.archived ? (
              <MenuItem id="restore">{t("ideas:row.restore")}</MenuItem>
            ) : (
              <MenuItem id="archive">{t("ideas:row.archive")}</MenuItem>
            )}
          </ActionMenu>
        ) : null}
      </Flex>
    </Flex>
  );
}
