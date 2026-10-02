import {
  ActionMenu,
  Badge,
  Button,
  Flex,
  Heading,
  InlineAlert,
  Link,
  Menu,
  MenuItem,
  Stack,
  Text,
  useIsNarrow,
} from "@moonx/ui-web";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { errorText } from "../../lib/error-text";
import { useIdeaActions } from "../../lib/idea-actions";
import { linkTargetPath } from "../../lib/link-target";
import { useGoTo } from "../../lib/navigate";
import { useOverlay } from "../../lib/overlay";
import { formatMigrationTarget } from "../../lib/template-migration";
import { HOME_KEYS, type ValidationHomeData } from "../../lib/validation-home";
import type { HomeAccess } from "./access";
import { decisionBadge, decisionText } from "./decision-text";

/**
 * The header of the home (design-spec 6.1): name, latest decision, stage, concept and proposer,
 * where the idea came from, the archived and newer-template notices, and the actions. Below
 * tablet the Record decision button moves to the bar pinned at the bottom (see `RecordDecision`).
 */
export function HomeHeader({
  data,
  workspaceId,
  access,
  onEdit,
}: {
  data: ValidationHomeData;
  workspaceId: string;
  access: HomeAccess;
  onEdit: () => void;
}) {
  const { t } = useTranslation(["validation", "app"]);
  const narrow = useIsNarrow();
  const goTo = useGoTo();
  const { openModal } = useOverlay();
  const actions = useIdeaActions();
  const { idea } = data;
  const decision = idea.latestDecision ?? "undecided";
  const aiPath = {
    export: `/w/${workspaceId}/ai/export?source=validation&id=${data.validationId}`,
    import: `/w/${workspaceId}/ai/import?target=validation&id=${data.validationId}`,
  };
  const sourcePath = idea.duplicatedFrom
    ? linkTargetPath({ screen: 13, workspaceId, ideaId: idea.duplicatedFrom.id })
    : null;
  const actionError = [actions.duplicate, actions.archive, actions.restore].find(
    (m) => m.error,
  )?.error;
  const hasNewerTemplate = access.canChange && data.template.newerVersion !== null;

  const duplicate = () =>
    actions.duplicate.mutate(idea.id, {
      onSuccess: (copy) => goTo(`/w/${workspaceId}/ideas/${copy.id}`),
    });

  const openUpdateTemplate = () =>
    openModal("update-template", formatMigrationTarget("validation", data.validationId));

  const onMenuAction = (key: string | number) => {
    if (key === "duplicate") duplicate();
    else if (key === "archive") actions.archive.mutate(idea.id);
    else if (key === "update-template") openUpdateTemplate();
  };

  return (
    <Stack gap="space-200">
      <Flex gap="space-200" align="center" wrap>
        <Heading level={1}>{idea.name}</Heading>
        <Badge variant={decisionBadge(decision)}>
          {t("home.decisionBadge", { decision: decisionText(t, decision) })}
        </Badge>
        <Badge>{t("home.stageLabel", { stage: t(HOME_KEYS.stage[idea.stage]) })}</Badge>
      </Flex>
      <Text>
        {t("home.conceptLine", {
          concept: idea.oneLineConcept,
          proposer: t("home.proposedBy", {
            name:
              idea.proposer.badge === "former_member"
                ? t("home.formerMember", { name: idea.proposer.displayName })
                : idea.proposer.displayName,
          }),
        })}
      </Text>
      {idea.duplicatedFrom ? (
        <Text variant="caption" tone="secondary">
          {t("home.duplicatedFrom")}{" "}
          {sourcePath ? (
            <Link href={sourcePath}>{idea.duplicatedFrom.name}</Link>
          ) : (
            idea.duplicatedFrom.name
          )}
        </Text>
      ) : null}
      {idea.archived ? (
        <InlineAlert variant="neutral" heading={t("home.archivedHeading")}>
          <Stack gap="space-100">
            <Text>{t("home.archivedBody")}</Text>
            {access.isEditor ? (
              <Flex>
                <Button
                  variant="secondary"
                  isPending={actions.restore.isPending}
                  pendingLabel={t("app:saving")}
                  onPress={() => actions.restore.mutate(idea.id)}
                >
                  {t("home.restore")}
                </Button>
              </Flex>
            ) : null}
          </Stack>
        </InlineAlert>
      ) : null}
      {hasNewerTemplate ? (
        <InlineAlert variant="informative" heading={t("home.templateNotice")}>
          <Button variant="secondary" onPress={openUpdateTemplate}>
            {t("home.updateTemplate")}
          </Button>
        </InlineAlert>
      ) : null}
      {actionError ? <InlineAlert variant="negative" heading={errorText(t, actionError)} /> : null}
      {access.isEditor ? (
        <Flex gap="space-100" align="center" wrap>
          {access.canChange ? (
            <>
              <Button variant="secondary" onPress={onEdit}>
                {t("home.editSummary")}
              </Button>
              <Menu
                trigger={
                  <Button variant="secondary">
                    {t("home.ai")}
                    <ChevronDown aria-hidden />
                  </Button>
                }
              >
                <MenuItem id="export" href={aiPath.export}>
                  {t("home.aiExport")}
                </MenuItem>
                <MenuItem id="import" href={aiPath.import}>
                  {t("home.aiImport")}
                </MenuItem>
              </Menu>
              {narrow ? null : <RecordDecision data={data} workspaceId={workspaceId} />}
            </>
          ) : null}
          <ActionMenu label={t("home.moreActions")} onAction={onMenuAction}>
            <MenuItem id="duplicate">{t("home.duplicate")}</MenuItem>
            {access.canChange ? <MenuItem id="archive">{t("home.archive")}</MenuItem> : null}
            {hasNewerTemplate ? (
              <MenuItem id="update-template">{t("home.updateTemplate")}</MenuItem>
            ) : null}
          </ActionMenu>
        </Flex>
      ) : null}
    </Stack>
  );
}

/** Record decision (design-spec 6.1): the accent button, in the header or pinned on the phone. */
export function RecordDecision({
  data,
  workspaceId,
}: {
  data: ValidationHomeData;
  workspaceId: string;
}) {
  const { t } = useTranslation("validation");
  const goTo = useGoTo();
  const path = linkTargetPath({ screen: 19, workspaceId, ideaId: data.idea.id });
  return (
    <Button variant="accent" onPress={() => path && goTo(path)}>
      {t("home.recordDecision")}
    </Button>
  );
}
