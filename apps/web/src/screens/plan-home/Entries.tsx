import { formatUnits } from "@moonx/i18n";
import { Badge, Flex, InlineAlert, Link, RowList, RowListItem, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { type PlanHome, planPaths } from "../../lib/plans";
import { BlockHeading } from "../validation-home/BlockHeading";

const PART_KEYS = { a: "planHome:home.parts.a", b: "planHome:home.parts.b" } as const;
const MARK_KEYS = { V: "planHome:home.parts.markV", S: "planHome:home.parts.markS" } as const;

/**
 * Part A and Part B with their items (design-spec 6.12). Each item opens screen 21 and carries
 * `?version=` when a saved version is open.
 */
export function PlanEntries({
  plan,
  workspaceId,
  ideaId,
}: {
  plan: PlanHome;
  workspaceId: string;
  ideaId: string;
}) {
  const { t } = useTranslation("planHome");
  const paths = planPaths(workspaceId, ideaId, plan.id);
  const search = plan.viewingVersion
    ? `?${new URLSearchParams({ version: plan.viewingVersion.id })}`
    : "";
  // A fresh draft holds only the sub-items copied from validation; no item is complete until
  // someone writes in it, and the home has no other signal for "nothing written yet".
  const showHint = plan.viewingVersion === null && plan.draftOnly;
  return (
    <Stack gap="space-400">
      <Stack gap="space-100">
        <Text variant="caption" tone="secondary">
          {t("home.parts.legend")}
        </Text>
        {showHint ? (
          <InlineAlert variant="informative" role="note" heading={t("home.emptyHint")} />
        ) : null}
      </Stack>
      {plan.parts.map((part) => (
        <Stack key={part.part} gap="space-100">
          <Flex justify="between" align="center" gap="space-200" wrap>
            <BlockHeading>{t(PART_KEYS[part.part])}</BlockHeading>
            <Text tone="secondary" as="span">
              {t("home.parts.progress", {
                done: formatUnits(part.completeItems),
                total: formatUnits(part.totalItems),
              })}
            </Text>
          </Flex>
          <RowList aria-label={t(PART_KEYS[part.part])}>
            {part.items.map((item) => (
              <RowListItem key={item.itemNo}>
                <Flex justify="between" align="center" gap="space-200" wrap>
                  <Flex gap="space-100" align="center" wrap>
                    <Link href={`${paths.item(item.itemNo)}${search}`}>
                      {t("home.parts.itemLabel", { itemNo: item.itemNo, title: item.title })}
                    </Link>
                    {item.marks.map((mark) => (
                      <Badge key={mark} size="S">
                        {t(MARK_KEYS[mark])}
                      </Badge>
                    ))}
                  </Flex>
                  <Flex gap="space-100" align="center" wrap>
                    {item.total > 0 ? (
                      <Text variant="caption" tone="secondary" as="span">
                        {t("home.parts.filled", {
                          filled: formatUnits(item.filled),
                          total: formatUnits(item.total),
                        })}
                      </Text>
                    ) : null}
                    {item.commentCount > 0 ? (
                      <Text variant="caption" tone="secondary" as="span">
                        {t("home.parts.comments", { count: item.commentCount })}
                      </Text>
                    ) : null}
                  </Flex>
                </Flex>
              </RowListItem>
            ))}
          </RowList>
        </Stack>
      ))}
    </Stack>
  );
}
