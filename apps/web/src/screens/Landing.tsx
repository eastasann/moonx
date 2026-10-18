import { formatCheckName, formatMoney, formatUnits } from "@moonx/i18n";
import {
  Button,
  CostPreview,
  Flex,
  Heading,
  IdeaPreview,
  PhaseRoute,
  PublicPattern,
  PublicSection,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StandaloneFrame } from "../components/StandaloneFrame";
import { dashboardHref } from "../components/workspace";
import { signedInQuery } from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

/** The example's currency: the app starts in the Philippines (design-spec 5章「登録時」). */
const CURRENCY = "PHP";

/** The example's lower-bound totals: an Unknown row and an Empty one leave them open. */
const STARTUP_COSTS = 145_000;
const BREAK_EVEN_PER_DAY = 14.4;

/**
 * Takes a signed-in visitor on to the dashboard of the workspace they opened last
 * (design-spec 5章「認証」). Only an answer asked on this visit counts: a cached one may
 * be of a session ended since. Without an answer (the API down) the page stays.
 */
function useLeaveWhenSignedIn() {
  const navigate = useNavigate();
  const { data: me, isFetchedAfterMount } = useQuery({
    ...signedInQuery(),
    refetchOnMount: "always",
  });
  const href =
    isFetchedAfterMount && me != null ? dashboardHref(me) : undefined;
  useEffect(() => {
    if (href !== undefined) void navigate({ href, replace: true });
  }, [href, navigate]);
}

/**
 * 1 Landing (design-spec 6.16, s01-landing.html): what moonx does, that it is by
 * invitation, and Log in. Built into HTML at build time (ADR-002・ADR-004); the sign-in
 * check runs in the browser only. No way to sign up: that starts from an invitation.
 */
export function LandingScreen() {
  const { t } = useTranslation(["landing", "common"]);
  const navigate = useNavigate();
  // The route's head names the built page; this names it again after a screen left for
  // it, which gives back the title it found when it goes.
  useDocumentTitle(t("landing:title"));
  useLeaveWhenSignedIn();
  const logIn = () => void navigate({ to: "/login" });
  const startup = formatMoney(STARTUP_COSTS, CURRENCY, { bound: "lower" });
  const breakEven = t("landing:example.perDay", {
    units: formatUnits(BREAK_EVEN_PER_DAY, { bound: "lower" }),
  });
  return (
    <StandaloneFrame>
      <PublicPattern
        action={
          <Button variant="secondary" onPress={logIn}>
            {t("landing:logIn")}
          </Button>
        }
      >
        <PublicSection
          layout="hero"
          aside={
            <IdeaPreview
              name={t("landing:example.name")}
              stage={t("common:stage.validation")}
              metrics={[
                { label: t("landing:example.startupCosts"), value: startup },
                { label: t("landing:example.breakEven"), value: breakEven },
              ]}
              checks={[
                {
                  state: "done",
                  label: formatCheckName("competitors", { min: 3, max: 5 }),
                  status: t("landing:example.doneCount", { count: 4 }),
                },
                {
                  state: "done",
                  label: formatCheckName("local_price", {}),
                  status: t("common:checkState.done"),
                },
                {
                  state: "partial",
                  label: formatCheckName("costs", {}),
                  status: t("common:checkState.partial"),
                },
                {
                  state: "not-started",
                  label: formatCheckName("permits", {}),
                  status: t("common:checkState.not_started"),
                },
              ]}
              caption={t("landing:example.caption")}
            />
          }
        >
          <Stack gap="space-400">
            <Heading level={1} variant="display">
              {t("landing:hero.title")}
            </Heading>
            <Text variant="lead">{t("landing:hero.lead")}</Text>
            <Flex>
              <Button variant="primary" size="XL" onPress={logIn}>
                {t("landing:logIn")}
              </Button>
            </Flex>
          </Stack>
        </PublicSection>
        <PublicSection isFullBleed>
          <Stack gap="space-600">
            <Stack gap="space-200">
              <Heading level={2} variant="display-2">
                {t("landing:phases.title")}
              </Heading>
              <Text tone="secondary">{t("landing:phases.lead")}</Text>
            </Stack>
            <PhaseRoute
              phases={[
                {
                  value: 0,
                  title: t("landing:phases.selfAnalysis.title"),
                  description: t("landing:phases.selfAnalysis.description"),
                },
                {
                  value: 0.5,
                  title: t("landing:phases.validation.title"),
                  description: t("landing:phases.validation.description"),
                },
                {
                  value: 1,
                  title: t("landing:phases.plan.title"),
                  description: t("landing:phases.plan.description"),
                },
              ]}
            />
          </Stack>
        </PublicSection>
        <PublicSection
          layout="pair"
          aside={
            <CostPreview
              aria-label={t("landing:numbers.costs.label")}
              rows={[
                {
                  state: "fact",
                  name: t("landing:numbers.costs.equipment"),
                  amount: formatMoney(60_000, CURRENCY),
                },
                {
                  state: "assumption",
                  name: t("landing:numbers.costs.leaseDeposit"),
                  amount: formatMoney(30_000, CURRENCY),
                },
                {
                  state: "unknown",
                  name: t("landing:numbers.costs.permits"),
                  amount: t("common:fau.unknown"),
                  isMuted: true,
                },
                {
                  state: "empty",
                  name: t("landing:numbers.costs.workingCapital"),
                  amount: t("common:fauState.empty"),
                  isMuted: true,
                },
              ]}
              totals={[
                { label: t("landing:numbers.costs.startup"), value: startup },
                { label: t("landing:example.breakEven"), value: breakEven },
              ]}
            />
          }
        >
          <Stack gap="space-200">
            <Heading level={2} variant="display-2">
              {t("landing:numbers.title")}
            </Heading>
            <Text tone="secondary">{t("landing:numbers.lead")}</Text>
            <Text tone="secondary">{t("landing:numbers.bounds")}</Text>
          </Stack>
        </PublicSection>
        <PublicSection
          layout="close"
          action={
            <Button variant="primary" size="XL" onPress={logIn}>
              {t("landing:logIn")}
            </Button>
          }
        >
          <Stack gap="space-200">
            <Heading level={2} variant="display-2">
              {t("landing:invitation.title")}
            </Heading>
            <Text tone="secondary">{t("landing:invitation.lead")}</Text>
          </Stack>
        </PublicSection>
      </PublicPattern>
    </StandaloneFrame>
  );
}
