import type { ImportContext, TemplateKind } from "@moonx/schemas";
import { Breadcrumb, Breadcrumbs, Skeleton } from "@moonx/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { safeReturnTo } from "../lib/ai";
import { hrefOf, ideaHref, ideasHref } from "../lib/links";
import { importContextQuery, validationHomeQuery } from "../lib/queries";
import { useDocumentTitle } from "../lib/title";
import {
  FailureState,
  NoAccessState,
  NotFoundState,
  SlowLoadingState,
  useIsSlow,
} from "./states";
import { WorkspaceFrame } from "./WorkspaceFrame";
import { dashboardHref, useWorkspace } from "./workspace";

/** Where 24 exports from or 25 imports into, loaded (SDD 5.10 X2). */
export interface AiTarget {
  kind: TemplateKind;
  /** The validation or plan; none for the user's own self-analysis. */
  id: string | undefined;
  context: ImportContext;
  /** "Bacolod Health Bowl · validation questions" (design-spec 6.7「取り込み先」). */
  eyebrow: string;
  /** Why nothing can be exported or imported: the idea, or only the plan, is archived. */
  archived: "idea" | "plan" | null;
  /** The screen it was opened from, where 25 returns once applied (SDD 4章 `returnTo`). */
  returnHref: string;
}

/** 24's and 25's search parameters as their routes read them (SDD 4章). */
export interface AiTargetSearch {
  kind?: TemplateKind;
  id?: string;
  returnTo?: string;
}

/** The parent screen ← goes to (design-spec 6.0.1) and the name it shows. */
interface Home {
  href: string;
  label: string;
}

/**
 * The frame of 24 and 25 (design-spec 6.6・6.7): breadcrumbs, ← to the target's home,
 * and the states before the target is there (6.0.6): a link without a target, a Viewer
 * (who cannot enter, 5章), another workspace's validation or plan (SDD 4章), loading and
 * failures. A Viewer of this workspace who opens their own self-analysis is taken to
 * their personal workspace's same screen, as 10 and 11 are (SDD 4章).
 */
export function AiTargetScreen({
  search,
  title,
  skeleton,
  children,
}: {
  search: AiTargetSearch;
  /** "Export for AI": the last crumb and the document's title. */
  title: string;
  /** The screen's shape while the target loads. */
  skeleton: ReactNode;
  children: (target: AiTarget) => ReactNode;
}) {
  const { t } = useTranslation(["ai", "ideas"]);
  const { me, workspace, role } = useWorkspace();
  const navigate = useNavigate();
  const href = useRouterState({ select: (state) => state.location.href });
  const { kind, returnTo } = search;
  // A self-analysis is the user's own and takes no id (X2 refuses one).
  const id = kind === "self_analysis" ? undefined : search.id;
  const isLink =
    kind !== undefined && (kind === "self_analysis" || id !== undefined);
  const personal = me.memberships.find(
    ({ workspace: candidate }) => candidate.isPersonal,
  )?.workspace;
  const movesToPersonal =
    kind === "self_analysis" &&
    role === "viewer" &&
    personal !== undefined &&
    personal.id !== workspace.id;
  const canEnter = isLink && role !== "viewer";

  useEffect(() => {
    if (!movesToPersonal || personal === undefined) return;
    void navigate({
      href: href.replace(`/w/${workspace.id}`, `/w/${personal.id}`),
      replace: true,
    });
  }, [movesToPersonal, personal, href, workspace.id, navigate]);

  // Read afresh on each opening, not from a visit before: 25 compares later reads with
  // this one to tell who changed an answer since it opened (design-spec 6.7 ③). A read
  // of a visit before stays in the cache when this one fails, so what counts is when
  // the data came, not whether a read was tried.
  const [openedAt] = useState(() => Date.now());
  const context = useQuery({
    ...importContextQuery(kind ?? "validation", id),
    enabled: canEnter,
    refetchOnMount: "always",
  });
  const ideaId = context.data?.target.ideaId ?? null;
  // A plan's idea name and whether the idea, not only the plan, is archived (6.6「状態」).
  const ideaHome = useQuery({
    ...validationHomeQuery(ideaId ?? ""),
    enabled: kind === "business_plan" && ideaId !== null,
  });
  const isOther =
    context.data !== undefined &&
    context.data.target.workspaceId !== null &&
    context.data.target.workspaceId !== workspace.id;
  const loaded =
    context.data === undefined ||
    context.dataUpdatedAt < openedAt ||
    isOther ||
    (kind === "business_plan" && ideaHome.data === undefined)
      ? undefined
      : context.data;
  const isPending =
    canEnter && loaded === undefined && !context.isError && !ideaHome.isError;
  const isSlow = useIsSlow(isPending);

  const ideaName =
    kind === "validation"
      ? (loaded?.target.name ?? null)
      : kind === "business_plan"
        ? (ideaHome.data?.idea.name ?? null)
        : null;
  const planName =
    kind === "business_plan" ? (loaded?.target.name ?? null) : null;
  useDocumentTitle(...(loaded === undefined ? [] : [title, workspace.name]));

  const homeOf = (target: ImportContext["target"]): Home => {
    if (target.type === "self_analysis") {
      const selfAnalysis = hrefOf({ screen: 10, workspaceId: workspace.id });
      return selfAnalysis === undefined
        ? { href: `/w/${workspace.id}`, label: t("ai:back.dashboard") }
        : { href: selfAnalysis, label: t("ai:back.selfAnalysis") };
    }
    const validation = ideaHref(workspace.id, target.ideaId ?? "");
    if (target.type === "validation") {
      return { href: validation, label: t("ai:back.validation") };
    }
    const plan = hrefOf({
      screen: 20,
      workspaceId: workspace.id,
      ideaId: target.ideaId ?? undefined,
      planId: target.id,
    });
    return plan === undefined
      ? { href: validation, label: t("ai:back.validation") }
      : { href: plan, label: t("ai:back.plan") };
  };
  const home = loaded === undefined ? undefined : homeOf(loaded.target);

  let body: ReactNode;
  if (movesToPersonal) {
    body = null;
  } else if (!isLink) {
    body = <NotFoundState dashboardHref={dashboardHref(me)} />;
  } else if (role === "viewer" || isOther) {
    body = <NoAccessState dashboardHref={dashboardHref(me)} />;
  } else if (loaded !== undefined && home !== undefined && kind !== undefined) {
    const { target } = loaded;
    const archived = !target.archived
      ? null
      : kind === "business_plan" && ideaHome.data?.idea.archived === false
        ? "plan"
        : "idea";
    body = children({
      kind,
      id,
      context: loaded,
      eyebrow:
        kind === "validation"
          ? t("ai:target.validation", { idea: target.name })
          : kind === "business_plan"
            ? t("ai:target.plan", { idea: ideaName, plan: target.name })
            : t("ai:target.selfAnalysis"),
      archived,
      returnHref: safeReturnTo(workspace.id, returnTo) ?? home.href,
    });
  } else if (context.isError || ideaHome.isError) {
    body = (
      <FailureState
        error={context.error ?? ideaHome.error}
        onRetry={() => {
          void context.refetch();
          if (ideaId !== null) void ideaHome.refetch();
        }}
        dashboardHref={dashboardHref(me)}
      />
    );
  } else if (isSlow) {
    body = (
      <SlowLoadingState
        onRetry={() => {
          void context.refetch();
          if (ideaId !== null) void ideaHome.refetch();
        }}
      />
    );
  } else {
    body = <Skeleton isLoading>{skeleton}</Skeleton>;
  }

  // The levels above (6.0.1); one whose screen is not built yet is left out, as no way
  // leads into a screen before it exists (docs/claude-code-prompts.md).
  const target = loaded?.target;
  const selfAnalysisHref = hrefOf({ screen: 10, workspaceId: workspace.id });
  const planHref =
    target === undefined
      ? undefined
      : hrefOf({
          screen: 20,
          workspaceId: workspace.id,
          ideaId: target.ideaId ?? undefined,
          planId: target.id,
        });
  return (
    <WorkspaceFrame
      current={kind === "self_analysis" ? undefined : "ideas"}
      back={home}
      breadcrumbs={
        <Breadcrumbs>
          {kind !== "self_analysis" && (
            <Breadcrumb href={ideasHref(workspace.id)}>
              {t("ideas:title")}
            </Breadcrumb>
          )}
          {kind === "self_analysis" && selfAnalysisHref !== undefined && (
            <Breadcrumb href={selfAnalysisHref}>
              {t("ai:crumb.selfAnalysis")}
            </Breadcrumb>
          )}
          {ideaName !== null && target?.ideaId != null && (
            <Breadcrumb href={ideaHref(workspace.id, target.ideaId)}>
              {ideaName}
            </Breadcrumb>
          )}
          {planName !== null && planHref !== undefined && (
            <Breadcrumb href={planHref}>{planName}</Breadcrumb>
          )}
          <Breadcrumb>{title}</Breadcrumb>
        </Breadcrumbs>
      }
    >
      {body}
    </WorkspaceFrame>
  );
}
