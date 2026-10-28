import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { ownPersonalId, useWorkspace } from "./workspace";

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
