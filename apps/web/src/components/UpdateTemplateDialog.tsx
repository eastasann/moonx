import {
  Badge,
  Button,
  Dialog,
  Flex,
  Heading,
  InlineAlert,
  RowList,
  RowListItem,
  Skeleton,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { isApiError } from "../lib/api-error";
import { errorText } from "../lib/error-text";
import { canEditIdeas, useWorkspaceRole } from "../lib/ideas";
import { useOverlay } from "../lib/overlay";
import { planHomeQuery } from "../lib/plans";
import { selfAnalysisHomeQuery } from "../lib/self-analysis";
import {
  type MigrationTarget,
  migrationPreviewQuery,
  parseMigrationTarget,
  useTemplateMigration,
} from "../lib/template-migration";
import { toasts } from "../lib/toast";
import { validationHomeQuery } from "../lib/validation-home";

/**
 * Whether the person may move this target to a newer template (design-spec 6.0.7, 1.3). The
 * target must be the one the screen under the sheet shows, so a typed `?about=` cannot open a
 * control for something else; the answer comes from the screen's own cached query.
 */
function useMayMigrate(target: MigrationTarget | null): boolean {
  const { workspaceId, ideaId, planId } = useParams({ strict: false }) as {
    workspaceId?: string;
    ideaId?: string;
    planId?: string;
  };
  const editor = canEditIdeas(useWorkspaceRole(workspaceId ?? ""));
  const kind = target?.kind;
  const selfAnalysis = useQuery({
    ...selfAnalysisHomeQuery,
    enabled: editor && kind === "self_analysis",
  }).data;
  const validation = useQuery({
    ...validationHomeQuery(ideaId ?? ""),
    enabled: editor && kind === "validation" && Boolean(ideaId),
  }).data;
  const plan = useQuery({
    ...planHomeQuery(planId ?? ""),
    enabled: editor && kind === "business_plan" && Boolean(planId),
  }).data;
  if (!target || !editor) return false;
  switch (target.kind) {
    case "self_analysis":
      return selfAnalysis?.id === target.id;
    case "validation":
      return validation?.validationId === target.id && !validation.idea.archived;
    case "business_plan":
      return plan?.id === target.id && !plan.archived && !plan.ideaArchived;
  }
}

function Preview({ target }: { target: MigrationTarget }) {
  const { t } = useTranslation(["templateMigration", "app", "errors", "auth"]);
  const { closeModal } = useOverlay();
  const preview = useQuery(migrationPreviewQuery(target));
  const migrate = useTemplateMigration();
  const data = preview.data;
  const latest =
    (isApiError(preview.error) && preview.error.code === "ALREADY_LATEST") ||
    (isApiError(migrate.error) && migrate.error.code === "ALREADY_LATEST");
  const failed = migrate.error && !latest;

  const confirm = () => {
    if (!data) return;
    // `mutateAsync` so the toast and the close still happen if the refresh unmounts this sheet.
    migrate
      .mutateAsync({
        targetType: target.kind,
        targetId: target.id,
        toVersionId: data.to.versionId,
      })
      .then(() => {
        toasts.add({
          title: t("templateMigration:done", { version: data.to.versionNumber }),
          variant: "positive",
        });
        closeModal();
      })
      .catch(() => {});
  };

  let body: React.ReactNode;
  if (latest) {
    body = <InlineAlert variant="informative" heading={t("templateMigration:alreadyLatest")} />;
  } else if (preview.isError) {
    body = (
      <InlineAlert variant="negative" heading={t("templateMigration:loadFailed")}>
        <Stack gap="space-100">
          <Text>{errorText(t, preview.error)}</Text>
          <Flex>
            <Button variant="secondary" onPress={() => void preview.refetch()}>
              {t("templateMigration:retry")}
            </Button>
          </Flex>
        </Stack>
      </InlineAlert>
    );
  } else if (!data) {
    body = (
      <Stack gap="space-100">
        <Skeleton />
        <Skeleton shape="block" height="space-500" />
      </Stack>
    );
  } else {
    body = (
      <Stack gap="space-200">
        {failed ? (
          <InlineAlert variant="negative" heading={t("templateMigration:failed")}>
            {errorText(t, migrate.error)}
          </InlineAlert>
        ) : null}
        <Text variant="label">
          {t("templateMigration:version", {
            from: data.from.versionNumber,
            to: data.to.versionNumber,
          })}
        </Text>
        <Text>{t("templateMigration:intro")}</Text>
        <Stack gap="space-50">
          <Text>{t("templateMigration:carried", { count: data.carried })}</Text>
          {data.addedQuestions > 0 ? (
            <Text>{t("templateMigration:added", { count: data.addedQuestions })}</Text>
          ) : null}
        </Stack>
        {data.addedCostRows.length > 0 ? (
          <Stack gap="space-50">
            <Heading level={3}>{t("templateMigration:addedCosts")}</Heading>
            <Text>{data.addedCostRows.join(", ")}</Text>
          </Stack>
        ) : null}
        {data.hiddenQuestions.length > 0 ? (
          <Stack gap="space-100">
            <Heading level={3}>{t("templateMigration:hidden.heading")}</Heading>
            <Text tone="secondary">{t("templateMigration:hidden.body")}</Text>
            <RowList aria-label={t("templateMigration:hidden.heading")}>
              {data.hiddenQuestions.map((question) => (
                <RowListItem key={question.questionKey}>
                  <Flex gap="space-200" align="center" justify="between">
                    <Text as="span">{question.title}</Text>
                    <Badge size="S" variant={question.hasAnswer ? "notice" : undefined}>
                      {question.hasAnswer
                        ? t("templateMigration:hidden.withAnswer")
                        : t("templateMigration:hidden.withoutAnswer")}
                    </Badge>
                  </Flex>
                </RowListItem>
              ))}
            </RowList>
          </Stack>
        ) : (
          <Text tone="secondary">{t("templateMigration:nothingHidden")}</Text>
        )}
      </Stack>
    );
  }

  return (
    <Dialog
      isOpen
      isDismissable
      isKeyboardDismissDisabled={migrate.isPending}
      size="medium"
      title={t("templateMigration:title")}
      closeLabel={t("app:close")}
      onOpenChange={(open) => !open && closeModal()}
      actions={
        <>
          <Button variant="secondary" onPress={closeModal}>
            {t("app:cancel")}
          </Button>
          {latest ? null : (
            <Button
              variant="accent"
              isDisabled={!data}
              isPending={migrate.isPending}
              pendingLabel={t("templateMigration:updating")}
              onPress={confirm}
            >
              {failed
                ? t("templateMigration:retry")
                : t("templateMigration:confirm", { version: data?.to.versionNumber ?? "" })}
            </Button>
          )}
        </>
      }
    >
      <div aria-busy={preview.isPending}>{body}</div>
    </Dialog>
  );
}

/**
 * M8: move a self analysis, validation or plan to the newest published template (design-spec
 * 6.0.7). What it is about comes from `?about=<targetType>:<targetId>`, so 10, 13 and 20 open it
 * the same way. The preview lists the answers that cannot be carried, which are hidden, not deleted.
 */
export function UpdateTemplateDialog() {
  const { about } = useOverlay();
  const target = parseMigrationTarget(about);
  const mayMigrate = useMayMigrate(target);
  if (!target || !mayMigrate) return null;
  return <Preview target={target} />;
}
