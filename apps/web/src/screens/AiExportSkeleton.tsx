import {
  Heading,
  Skeleton,
  Stack,
  Steps,
  StepsPattern,
  Text,
  Well,
} from "@moonx/ui-web";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** 24's steps (design-spec 6.6). */
const STEPS = ["scope", "review", "export"] as const;

/** One of 24's steps. */
export type Step = (typeof STEPS)[number];

/** The title and what it exports from, above the steps (as 25's, s25-import.html). */
export function Header({ eyebrow }: { eyebrow: ReactNode }) {
  const { t } = useTranslation(["ai"]);
  return (
    <Stack gap="space-75">
      <Text variant="caption" tone="secondary">
        {eyebrow}
      </Text>
      <Heading level={1} variant="heading-1-steps">
        {t("ai:export.title")}
      </Heading>
    </Stack>
  );
}

/** 24's steps over the screen, `current` marked (design-spec 6.6). */
export function ExportSteps({ current }: { current: Step }) {
  const { t } = useTranslation(["ai"]);
  return (
    <Steps
      aria-label={t("ai:steps")}
      steps={STEPS.map((id) => ({ id, label: t(`ai:export.step.${id}`) }))}
      currentId={current}
      doneLabel={t("ai:stepDone")}
    />
  );
}

/** The preview's shape while X1 answers (design-spec 6.6「ローディング」). */
export function PreviewSkeleton() {
  const { t } = useTranslation(["ai"]);
  return (
    <Skeleton isLoading>
      <Well>
        <Stack gap="space-100">
          {[0, 1, 2, 3, 4].map((line) => (
            <Text key={line}>{t("ai:export.preview")}</Text>
          ))}
        </Stack>
      </Well>
    </Skeleton>
  );
}

/** 24's shape while its target loads (design-spec 6.0.6). */
export function AiExportSkeleton() {
  const { t } = useTranslation(["ai"]);
  return (
    <StepsPattern
      header={<Header eyebrow={t("ai:export.preview")} />}
      steps={<ExportSteps current="scope" />}
    >
      <PreviewSkeleton />
    </StepsPattern>
  );
}
