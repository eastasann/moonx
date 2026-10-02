import { Button, Container, Heading, PageFrame, PublicPattern, Stack, Text } from "@moonx/ui-web";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

const STAGES = ["selfAnalysis", "validation", "plan"] as const;

/** Screen 1: what moonx does, that it is by invitation, and the way to log in (design-spec 6.16). */
export function Landing() {
  const { t } = useTranslation("app");
  const navigate = useNavigate();
  return (
    <PageFrame>
      <PublicPattern>
        <Container width="reading">
          <Stack gap="space-500">
            <Stack gap="space-200">
              <Heading level={1} variant="display">
                {t("landing.title")}
              </Heading>
              <Text variant="body-long">{t("landing.lead")}</Text>
            </Stack>
            <Stack gap="space-300" as="section">
              <Heading level={2}>{t("landing.stagesHeading")}</Heading>
              {STAGES.map((stage) => (
                <Stack gap="space-50" key={stage}>
                  <Heading level={3}>{t(`landing.stages.${stage}.title`)}</Heading>
                  <Text variant="body-long" tone="secondary">
                    {t(`landing.stages.${stage}.body`)}
                  </Text>
                </Stack>
              ))}
            </Stack>
            <Text variant="body-long">{t("landing.liveNumbers")}</Text>
            <Stack gap="space-200" align="start">
              <Text variant="body-long" tone="secondary">
                {t("landing.invitationOnly")}
              </Text>
              <Button variant="accent" onPress={() => navigate({ to: "/login" })}>
                {t("landing.login")}
              </Button>
            </Stack>
          </Stack>
        </Container>
      </PublicPattern>
    </PageFrame>
  );
}
