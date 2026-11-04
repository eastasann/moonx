import {
  FocusPattern,
  Heading,
  Skeleton,
  Stack,
  Text,
  Well,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** The material's shape while it loads (design-spec 6.5: the fields come first). */
export function MaterialSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <Skeleton isLoading>
      <Well density="spacious">
        <Stack gap="space-300">
          {[
            t("validation:decision.summary"),
            t("validation:decision.keyNumbers"),
            t("validation:decision.checks"),
          ].map((label) => (
            <Stack key={label} gap="space-100">
              <Heading level={2} variant="label">
                {label}
              </Heading>
              <Text>{t("validation:decision.material")}</Text>
            </Stack>
          ))}
        </Stack>
      </Well>
    </Skeleton>
  );
}

/** 19's shape while its route loads (design-spec 6.0.6・6.5「ローディング」). */
export function DecisionSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <FocusPattern
      header={<Heading level={1}>{t("validation:decision.title")}</Heading>}
    >
      <MaterialSkeleton />
    </FocusPattern>
  );
}
