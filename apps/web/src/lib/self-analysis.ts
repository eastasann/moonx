import type { TemplateRef, TemplateSection, UserRef, Versioned } from "@moonx/schemas";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { SELF_ANALYSIS_KEY } from "./ai-exchange";
import { sendJson } from "./api";
import { autosave } from "./autosave";
import { DASHBOARD_KEY } from "./dashboard";
import { hasText } from "./questions";

// These screens read with `sendJson`, not Treaty: Treaty turns an answer that looks like a date
// into a `Date`, which would change what a person wrote.

export type SelfAnalysisStatus = "not_started" | "in_progress" | "done";

/** SDD 5.8 SelfAnalysisHome (S1). */
export interface SelfAnalysisHome {
  id: string;
  status: SelfAnalysisStatus;
  completedAt: string | null;
  currency: string;
  template: TemplateRef;
  answered: number;
  total: number;
  sections: { key: string; title: string; answered: number; total: number }[];
  firstUnanswered: { sectionKey: string; questionKey: string } | null;
  shares: { workspace: { id: string; name: string }; sharedAt: string }[];
  shareableWorkspaces: { id: string; name: string }[];
}

/** SDD 5.8 SelfAnalysisAnswer (S2, S3). */
export interface SelfAnalysisAnswer extends Versioned {
  questionKey: string;
  text: string | null;
  amount: number | null;
  commentCounts: { workspaceId: string; workspaceName: string; count: number }[];
}

/** S6 and D2 share this row: an Owner or Member and whether their analysis is shared here. */
export interface TeamMember {
  user: UserRef;
  shared: boolean;
  status: SelfAnalysisStatus | null;
}

/** SDD 5.8 S7: a shared analysis as the sections of the template with the answers. */
export interface SharedSelfAnalysis {
  id: string;
  user: UserRef;
  status: SelfAnalysisStatus;
  currency: string;
  sections: (TemplateSection & {
    answers: {
      questionKey: string;
      text: string | null;
      amount: number | null;
      commentCount: number;
    }[];
  })[];
}

const ME = "/api/v1/me/self-analysis";

export const homeKey = [...SELF_ANALYSIS_KEY, "home"] as const;
export const sectionKey = (section: string) => [...SELF_ANALYSIS_KEY, "section", section] as const;
const teamKey = (workspaceId: string) => [...SELF_ANALYSIS_KEY, "team", workspaceId] as const;

/** S1 GET. The first call creates the analysis. */
export const selfAnalysisHomeQuery = queryOptions({
  queryKey: homeKey,
  queryFn: () => sendJson<SelfAnalysisHome>("GET", ME),
});

/** S2: one section of the pinned template with an answer for every question. */
export const selfAnalysisSectionQuery = (section: string) =>
  queryOptions({
    queryKey: sectionKey(section),
    queryFn: () =>
      sendJson<{ section: TemplateSection; answers: SelfAnalysisAnswer[] }>(
        "GET",
        `${ME}/sections/${encodeURIComponent(section)}`,
      ),
  });

/** S6: the Owners and Members of the workspace and whether each shared their analysis. */
export const teamQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: teamKey(workspaceId),
    queryFn: () =>
      sendJson<{ items: TeamMember[] }>("GET", `/api/v1/workspaces/${workspaceId}/self-analyses`),
  });

/** S7. A 403 `NOT_SHARED` is the answer for a person who did not share. */
export const sharedSelfAnalysisQuery = (workspaceId: string, userId: string) =>
  queryOptions({
    queryKey: [...teamKey(workspaceId), userId],
    queryFn: () =>
      sendJson<SharedSelfAnalysis>(
        "GET",
        `/api/v1/workspaces/${workspaceId}/self-analyses/${userId}`,
      ),
  });

/** An answer counts with a text or with an amount (SDD 5.8 S1 `answered`). */
export const isAnswered = (answer: Pick<SelfAnalysisAnswer, "text" | "amount"> | undefined) =>
  answer !== undefined && (hasText(answer.text) || answer.amount !== null);

/** Where a section's questions open (SDD 4), with the question to focus on. */
export const sectionPath = (workspaceId: string, section: string, questionKey?: string) =>
  `/w/${workspaceId}/self-analysis/${encodeURIComponent(section)}${
    questionKey ? `?q=${encodeURIComponent(questionKey)}` : ""
  }`;

/**
 * S1 PATCH, S4 complete and reopen, S5: the changes of the home. Each answer is the new home, put
 * into the cache at once. What shows the status or the shares elsewhere (the dashboard's block,
 * the team list) is refreshed with it.
 */
export function useSelfAnalysisActions() {
  const queryClient = useQueryClient();
  const accept = async (home: SelfAnalysisHome) => {
    queryClient.setQueryData(homeKey, home);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY }),
      queryClient.invalidateQueries({ queryKey: [...SELF_ANALYSIS_KEY, "team"] }),
    ]);
  };
  return {
    complete: useMutation({
      mutationFn: (confirmEmpty: boolean) =>
        sendJson<SelfAnalysisHome>("POST", `${ME}/complete`, confirmEmpty ? { confirmEmpty } : {}),
      onSuccess: accept,
    }),
    reopen: useMutation({
      mutationFn: () => sendJson<SelfAnalysisHome>("POST", `${ME}/reopen`, {}),
      onSuccess: accept,
    }),
    share: useMutation({
      mutationFn: (workspaceIds: string[]) =>
        sendJson<SelfAnalysisHome>("PUT", `${ME}/shares`, { workspaceIds }),
      onSuccess: accept,
    }),
    currency: useMutation({
      mutationFn: (currency: string) => sendJson<SelfAnalysisHome>("PATCH", ME, { currency }),
      onSuccess: accept,
    }),
  };
}

/**
 * For the question form. Answering moves the counts of the home and the status the dashboard and
 * the team list show (the first answer starts the analysis), and their copies stay fresh for 30
 * seconds. Saves still on their way when the screen closes are awaited, then everything that reads
 * the self analysis is read again by whoever opens it next.
 */
export function useSelfAnalysisRefresh() {
  const queryClient = useQueryClient();
  useEffect(
    () => () => {
      void autosave
        .idle()
        .then(() =>
          Promise.all([
            queryClient.invalidateQueries({ queryKey: SELF_ANALYSIS_KEY }),
            queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY }),
          ]),
        );
    },
    [queryClient],
  );
}
