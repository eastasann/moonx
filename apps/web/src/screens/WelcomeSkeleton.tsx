import { Heading, StepsPattern, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";

/** The skeleton of 3, shown while the user or the invitation loads. */
export function WelcomeSkeleton() {
  const { t } = useTranslation(["auth"]);
  return (
    <StepsPattern
      header={<Heading level={1}>{t("auth:welcome.title")}</Heading>}
      steps={<Text>{t("auth:welcome.step.invite")}</Text>}
    >
      <Text>{t("auth:welcome.join")}</Text>
    </StepsPattern>
  );
}
