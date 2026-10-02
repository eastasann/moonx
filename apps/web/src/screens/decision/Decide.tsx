import { FocusPattern, Heading, InlineAlert, Link, Stack, Text } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ErrorState, NoAccessState } from "../../components/states";
import { canEditIdeas, useWorkspaceCurrency, useWorkspaceRole } from "../../lib/ideas";
import { useMe } from "../../lib/session";
import { validationHomeQuery } from "../../lib/validation-home";
import { DecisionEvidence } from "./DecisionEvidence";
import { DecisionForm } from "./DecisionForm";

function DecideContent({ workspaceId, ideaId }: { workspaceId: string; ideaId: string }) {
  const { t } = useTranslation(["decision", "validation"]);
  const home = useQuery(validationHomeQuery(ideaId));
  const idea = home.data?.idea;
  const me = useMe();
  const currency = useWorkspaceCurrency(workspaceId);
  if (home.isError) return <ErrorState error={home.error} onRetry={() => void home.refetch()} />;
  // Another workspace's URL must not show the idea (SDD 4).
  if (idea && idea.workspaceId !== workspaceId) return <NoAccessState />;

  const header = (
    <Stack gap="space-100">
      <Link href={`/w/${workspaceId}/ideas/${ideaId}`}>
        <ArrowLeft aria-hidden /> {t("decision:back")}
      </Link>
      <Heading level={1}>
        {idea ? t("decision:titleWithName", { name: idea.name }) : t("decision:title")}
      </Heading>
    </Stack>
  );
  const evidence = (
    <DecisionEvidence
      ideaId={ideaId}
      workspaceId={workspaceId}
      currency={currency}
      timeZone={me.timezone}
    />
  );
  if (idea?.archived) {
    return (
      <FocusPattern header={header} evidence={evidence}>
        <InlineAlert variant="neutral" heading={t("validation:home.archivedHeading")}>
          <Text>{t("validation:home.archivedBody")}</Text>
        </InlineAlert>
      </FocusPattern>
    );
  }
  return (
    <DecisionForm
      workspaceId={workspaceId}
      ideaId={ideaId}
      header={header}
      evidence={evidence}
      isIdeaLoaded={idea !== undefined}
    />
  );
}

/**
 * Screen 19, the decision (design-spec 6.5): the materials from the other sections above the
 * Proceed / Hold / Drop form. A Viewer has no way in, by button or by URL.
 */
export function Decide({ workspaceId, ideaId }: { workspaceId: string; ideaId: string }) {
  if (!canEditIdeas(useWorkspaceRole(workspaceId))) return <NoAccessState />;
  return <DecideContent workspaceId={workspaceId} ideaId={ideaId} />;
}
