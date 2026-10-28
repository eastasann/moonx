import { Heading, Stack, Steps, StepsPattern, Text, Well } from "@moonx/ui-web";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** 25's steps (design-spec 6.7). ④ Apply is the button that ends ③. */
const STEPS = ["paste", "match", "review", "apply"] as const;

/** A step 25 marks as the current one: never ④, which is a button. */
export type Step = Exclude<(typeof STEPS)[number], "apply">;

/** The title and where the import goes, above the steps (s25-import.html .eyebrow). */
export function Header({ eyebrow }: { eyebrow: ReactNode }) {
  const { t } = useTranslation(["ai"]);
  return (
    <Stack gap="space-75">
      <Text variant="caption" tone="secondary">
        {eyebrow}
      </Text>
      <Heading level={1} variant="heading-1-steps">
        {t("ai:import.title")}
      </Heading>
    </Stack>
  );
}

/** 25's steps over the screen, `current` marked (design-spec 6.7). */
export function ImportSteps({ current }: { current: Step }) {
  const { t } = useTranslation(["ai"]);
  return (
    <Steps
      aria-label={t("ai:steps")}
      steps={STEPS.map((id) => ({ id, label: t(`ai:import.step.${id}`) }))}
      currentId={current}
      doneLabel={t("ai:stepDone")}
    />
  );
}

/** 25's shape while its target loads (design-spec 6.0.6). */
export function AiImportSkeleton() {
  const { t } = useTranslation(["ai"]);
  return (
    <StepsPattern
      header={<Header eyebrow={t("ai:import.reply")} />}
      steps={<ImportSteps current="paste" />}
    >
      <Well>
        <Stack gap="space-100">
          {[0, 1, 2, 3].map((line) => (
            <Text key={line}>{t("ai:import.replyPlaceholder")}</Text>
          ))}
        </Stack>
      </Well>
    </StepsPattern>
  );
}
