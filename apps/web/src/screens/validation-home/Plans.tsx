import { Badge, Button, Flex, Link, RowList, RowListItem, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { linkTargetPath } from "../../lib/link-target";
import { useOverlay } from "../../lib/overlay";
import type { ValidationHomeData } from "../../lib/validation-home";
import { BlockHeading } from "./BlockHeading";
import { decisionText } from "./decision-text";

type Value = Parameters<typeof decisionText>[1];

/**
 * The idea's plans (name, latest version, latest Go / No-Go). "Add plan" only shows when the API
 * says one can be created, which also needs a Proceed decision and an idea that is not archived.
 */
export function Plans({
  data,
  workspaceId,
  isEditor,
}: {
  data: ValidationHomeData;
  workspaceId: string;
  isEditor: boolean;
}) {
  const { t } = useTranslation("validation");
  const { openModal } = useOverlay();
  return (
    <Stack gap="space-100">
      <BlockHeading>{t("home.blocks.plans")}</BlockHeading>
      {data.plans.length === 0 ? (
        <Text tone="secondary">{t("home.plans.empty")}</Text>
      ) : (
        <RowList aria-label={t("home.blocks.plans")}>
          {data.plans.map((plan) => {
            const path = linkTargetPath({
              screen: 20,
              workspaceId,
              ideaId: data.idea.id,
              planId: plan.id,
            });
            return (
              <RowListItem key={plan.id}>
                <Stack gap="space-50">
                  {path ? <Link href={path}>{plan.name}</Link> : <Text>{plan.name}</Text>}
                  <Flex gap="space-100" align="center" wrap>
                    <Text variant="caption" tone="secondary" as="span">
                      {plan.latestVersion
                        ? t("home.plans.version", { name: plan.latestVersion.name })
                        : t("home.plans.noVersion")}
                    </Text>
                    {plan.hasChangesSinceVersion ? (
                      <Text variant="caption" tone="secondary" as="span">
                        {t("home.plans.changes")}
                      </Text>
                    ) : null}
                    {plan.latestGoNoGo ? (
                      <Badge size="S">
                        {t("home.plans.goNoGo", {
                          value: decisionText(t, plan.latestGoNoGo.value as Value),
                        })}
                      </Badge>
                    ) : null}
                  </Flex>
                </Stack>
              </RowListItem>
            );
          })}
        </RowList>
      )}
      {data.canAddPlan && isEditor ? (
        <Flex>
          <Button variant="secondary" onPress={() => openModal("create-plan")}>
            {t("home.addPlan")}
          </Button>
        </Flex>
      ) : null}
    </Stack>
  );
}
