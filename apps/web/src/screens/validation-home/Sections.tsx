import type { SectionKey } from "@moonx/domain";
import { sectionLink } from "@moonx/domain";
import { Flex, Link, Meter, RowList, RowListItem, Stack, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { linkTargetPath } from "../../lib/link-target";
import { fauSegments, sectionProgress, type ValidationHomeData } from "../../lib/validation-home";
import { BlockHeading } from "./BlockHeading";

/** Sections 01 to 10 with their progress and a small F/A/U band (design-spec 6.1). */
export function Sections({ data, workspaceId }: { data: ValidationHomeData; workspaceId: string }) {
  const { t } = useTranslation("validation");
  const competitors = data.checks.find((c) => c.key === "competitors");
  const range =
    competitors?.params.min !== undefined && competitors.params.max !== undefined
      ? { min: competitors.params.min, max: competitors.params.max }
      : null;
  return (
    <Stack gap="space-100">
      <BlockHeading>{t("home.blocks.sections")}</BlockHeading>
      <RowList aria-label={t("home.blocks.sections")}>
        {data.sections.map((section) => {
          const path = linkTargetPath(
            sectionLink(workspaceId, data.idea.id, section.key as SectionKey),
          );
          return (
            <RowListItem key={section.key}>
              <Stack gap="space-75">
                <Flex justify="between" align="center" gap="space-200" wrap>
                  {path ? <Link href={path}>{section.title}</Link> : section.title}
                  <Text variant="caption" tone="secondary" as="span">
                    {sectionProgress(t, section, range)}
                  </Text>
                </Flex>
                {section.fau ? (
                  <Meter
                    size="S"
                    showLegend={false}
                    label={t("home.sections.fauLabel", { section: section.title })}
                    segments={fauSegments(t, section.fau)}
                  />
                ) : null}
              </Stack>
            </RowListItem>
          );
        })}
      </RowList>
    </Stack>
  );
}
