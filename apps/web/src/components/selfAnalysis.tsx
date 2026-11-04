import type { SelfAnalysisHome } from "@moonx/schemas";
import { IllustratedMessage, Skeleton } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../lib/api";
import { selfAnalysisHomeQuery } from "../lib/queries";
import { FailureState, SlowLoadingState, useSlowLoading } from "./states";
import { dashboardHref, ownPersonalId, useWorkspace } from "./workspace";

/**
 * The page's save of a self-analysis answer (design-spec 6.0.2's item "1つの回答"). Its
 * prefix per section (`self_analysis_answer:<id>:SA.WHY.`) is 11's save scope.
 */
export const selfAnswerKey = (selfAnalysisId: string, questionKey: string) =>
  `self_analysis_answer:${selfAnalysisId}:${questionKey}`;

/**
 * Takes a screen of the user's own self-analysis (10, 11, and 24 and 25 on it) opened in
 * a workspace where they are a Viewer to the same screen in their personal workspace: the
 * self-analysis is the same in every workspace, and a Viewer has no way into it (SDD 4章,
 * design-spec 6.11). True while it moves, when the screen shows nothing.
 */
export function useMovesToPersonal(applies = true): boolean {
  const { me, workspace, role } = useWorkspace();
  const navigate = useNavigate();
  const href = useRouterState({ select: (state) => state.location.href });
  const personal = ownPersonalId(me);
  const moves =
    applies &&
    role === "viewer" &&
    personal !== undefined &&
    personal !== workspace.id;
  useEffect(() => {
    if (!moves || personal === undefined) return;
    void navigate({
      href: href.replace(`/w/${workspace.id}`, `/w/${personal}`),
      replace: true,
    });
  }, [moves, personal, href, workspace.id, navigate]);
  return moves;
}

/**
 * 11 when no self-analysis can be made yet (design-spec 6.0.6「公開済みのテンプレートが
 * 無い」): the form has nothing to ask.
 */
function TemplatesNotReadyState() {
  const { t } = useTranslation(["errors"]);
  return (
    <IllustratedMessage
      headingLevel={1}
      icon={<Hourglass />}
      heading={t("errors:TEMPLATE_NOT_PUBLISHED")}
    />
  );
}

/**
 * Reads the self-analysis first (S1 GET makes it, SDD 5.8) and shows `children` with it,
 * or the state it is in (6.0.6): `notReady` while no template is published. 10 and 11
 * open through it.
 */
export function SelfAnalysisBody({
  skeleton,
  notReady = <TemplatesNotReadyState />,
  children,
}: {
  skeleton: ReactNode;
  notReady?: ReactNode;
  children: (home: SelfAnalysisHome) => ReactNode;
}) {
  const { me } = useWorkspace();
  const options = selfAnalysisHomeQuery();
  const query = useQuery(options);
  const { isSlow, retry: retrySlow } = useSlowLoading(query.isPending, [
    options,
  ]);
  if (query.data !== undefined) return children(query.data);
  if (
    query.error instanceof ApiError &&
    query.error.code === "TEMPLATE_NOT_PUBLISHED"
  ) {
    return notReady;
  }
  if (query.isError) {
    return (
      <FailureState
        error={query.error}
        onRetry={() => void query.refetch()}
        dashboardHref={dashboardHref(me)}
      />
    );
  }
  if (isSlow) return <SlowLoadingState onRetry={retrySlow} />;
  return <Skeleton isLoading>{skeleton}</Skeleton>;
}
