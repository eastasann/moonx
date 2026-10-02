import { Link, RowList, RowListItem, Stack, Text, useIsNarrow, Well } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { linkTargetPath } from "../../lib/link-target";
import { nextStepText, type ValidationHomeData } from "../../lib/validation-home";
import { BlockHeading } from "./BlockHeading";

/**
 * At most three steps, what is missing and never whether the idea is good (design-spec 6.1).
 * "Ready to record a decision" links to screen 19 only when `canDecide`; a Viewer or an archived
 * idea has no way in there, so it reads as text.
 */
export function NextSteps({
  data,
  workspaceId,
  canDecide,
}: {
  data: ValidationHomeData;
  workspaceId: string;
  canDecide: boolean;
}) {
  const { t } = useTranslation("validation");
  // The first step is the large one on the phone (design-spec 6.1 "スマホ").
  const narrow = useIsNarrow();
  return (
    <Stack gap="space-100">
      <BlockHeading>{t("home.blocks.nextSteps")}</BlockHeading>
      <RowList aria-label={t("home.blocks.nextSteps")} ordered>
        {data.nextSteps.map((step, index) => {
          const text = nextStepText(t, step, data.sections);
          const path =
            step.kind === "ready_to_decide" && !canDecide
              ? null
              : linkTargetPath(step.link, { workspaceId });
          const content = path ? <Link href={path}>{text}</Link> : <Text as="span">{text}</Text>;
          return (
            <RowListItem key={`${step.kind}-${step.checkKey ?? step.sectionKey ?? index}`}>
              {narrow && index === 0 ? <Well>{content}</Well> : content}
            </RowListItem>
          );
        })}
      </RowList>
    </Stack>
  );
}
