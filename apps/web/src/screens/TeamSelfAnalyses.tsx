import { hasText, isQuestionShown } from "@moonx/domain";
import { formatMoney } from "@moonx/i18n";
import type { SharedSelfAnalysis } from "@moonx/schemas";
import {
  Avatar,
  Breadcrumb,
  Breadcrumbs,
  Divider,
  Flex,
  Heading,
  ListDetailPattern,
  ListView,
  ListViewItem,
  Skeleton,
  Stack,
  Text,
  useIsDesktop,
  useTwoColumns,
} from "@moonx/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ItemCommentsButton,
  type ScreenComments,
} from "../components/CommentsPanel";
import {
  FailureState,
  NoAccessState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { UserName } from "../components/UserName";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, usePanel, useWorkspace } from "../components/workspace";
import { questionLabel } from "../lib/item-labels";
import { selfAnalysisHref, teamHref } from "../lib/links";
import { formatPanelTarget } from "../lib/panel-target";
import {
  memberSelfAnalysesKey,
  memberSelfAnalysesQuery,
  memberSelfAnalysisQuery,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

type Section = SharedSelfAnalysis["sections"][number];
type Answer = Section["answers"][number];

/** The answer of a question as 12 reads it (design-spec 6.11): Q15–17 an amount and why. */
function AnswerText({
  question,
  answer,
  currency,
}: {
  question: Section["questions"][number];
  answer: Answer | undefined;
  currency: string;
}) {
  const { t } = useTranslation(["validation", "selfAnalysis"]);
  const text = answer?.text ?? null;
  const empty = (
    <Text tone="tertiary" elementType="p">
      {t("validation:questions.empty")}
    </Text>
  );
  if (question.answerType !== "amount_with_reason") {
    return hasText(text) ? (
      <Text variant="body-long" elementType="p">
        {text}
      </Text>
    ) : (
      empty
    );
  }
  const amount = answer?.amount ?? null;
  if (amount === null && !hasText(text)) return empty;
  return (
    <Stack gap="space-100">
      <Stack gap="space-25">
        <Text variant="caption" tone="secondary">
          {t("selfAnalysis:form.amount")}
        </Text>
        {amount === null ? (
          empty
        ) : (
          <Text variant="number" elementType="p">
            {formatMoney(amount, currency, {
              cents: !Number.isInteger(amount),
            })}
          </Text>
        )}
      </Stack>
      <Stack gap="space-25">
        <Text variant="caption" tone="secondary">
          {t("selfAnalysis:form.reason")}
        </Text>
        {hasText(text) ? (
          <Text variant="body-long" elementType="p">
            {text}
          </Text>
        ) : (
          empty
        )}
      </Stack>
    </Stack>
  );
}

/**
 * One member's self-analysis, read section by section (design-spec 6.11): each question
 * and its answer, with its 💬 and the number of comments in this workspace. No history.
 */
function SharedDetail({ userId }: { userId: string }) {
  const { t } = useTranslation(["selfAnalysis", "common"]);
  const { me, workspace } = useWorkspace();
  const panel = usePanel();
  const query = useQuery(memberSelfAnalysisQuery(workspace.id, userId));
  const isSlow = useIsSlow(query.isPending);
  if (query.isError) {
    return (
      <FailureState
        error={query.error}
        onRetry={() => void query.refetch()}
        dashboardHref={dashboardHref(me)}
        headingLevel={2}
        size="S"
      />
    );
  }
  if (query.data === undefined) {
    return isSlow ? (
      <SlowLoadingState
        headingLevel={2}
        size="S"
        onRetry={() => void query.refetch()}
      />
    ) : (
      <Skeleton isLoading>
        <Stack gap="space-300">
          <Heading level={2}>{t("selfAnalysis:team.title")}</Heading>
          <Text>{t("selfAnalysis:team.empty")}</Text>
        </Stack>
      </Skeleton>
    );
  }
  const shared = query.data;
  return (
    <Stack gap="space-400">
      <Flex gap="space-200" alignItems="center">
        <Avatar name={shared.user.displayName} src={shared.user.avatarUrl} />
        <Stack gap="space-25">
          <Heading level={2}>
            <UserName user={shared.user} />
          </Heading>
          <Text variant="caption" tone="secondary">
            {t(`common:selfAnalysisStatus.${shared.status}`)}
          </Text>
        </Stack>
      </Flex>
      {shared.sections.map((section) => {
        const answers = new Map(
          section.answers.map((answer) => [answer.questionKey, answer]),
        );
        // A question its display condition hides is not read, as on 11 (6.2).
        const questions = section.questions.filter((question) =>
          isQuestionShown(question, answers),
        );
        return (
          <section key={section.key} aria-label={section.title}>
            <Stack gap="space-200">
              <Divider size="S" />
              <Stack gap="space-50">
                <Heading level={3}>{section.title}</Heading>
                {section.subtitle !== null && (
                  <Text tone="secondary" elementType="p">
                    {section.subtitle}
                  </Text>
                )}
              </Stack>
              {questions.map((question) => {
                const answer = answers.get(question.key);
                const label = questionLabel(question.key, question.title);
                const count = answer?.commentCount ?? 0;
                return (
                  <Stack key={question.key} gap="space-100">
                    <Flex
                      gap="space-100"
                      alignItems="start"
                      justifyContent="space-between"
                    >
                      <Stack gap="space-25">
                        <Text variant="caption" tone="secondary">
                          {question.title}
                        </Text>
                        <Heading level={4}>{question.prompt}</Heading>
                      </Stack>
                      <ItemCommentsButton
                        label={label}
                        count={count}
                        onPress={() =>
                          panel.show("comments", {
                            kind: "item",
                            item: {
                              type: "self_analysis_answer",
                              id: shared.id,
                              key: question.key,
                            },
                          })
                        }
                      />
                    </Flex>
                    <AnswerText
                      question={question}
                      answer={answer}
                      currency={shared.currency}
                    />
                  </Stack>
                );
              })}
            </Stack>
          </section>
        );
      })}
    </Stack>
  );
}

/** 12's list while it loads: rows of names and their sharing. */
function ListSkeleton() {
  const { t } = useTranslation(["selfAnalysis"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {[0, 1, 2].map((row) => (
          <Stack key={row} gap="space-50">
            <Text>{t("selfAnalysis:team.members")}</Text>
            <Text variant="caption">{t("selfAnalysis:team.notShared")}</Text>
          </Stack>
        ))}
      </Stack>
    </Skeleton>
  );
}

function TeamBody({
  userId,
  fallbackId,
  onOpen,
  onShow,
  onBack,
}: {
  userId: string | undefined;
  /** Who goes beside the list while none is in the path: the one last shown, if any. */
  fallbackId: string | undefined;
  onOpen: (userId: string, isTwoColumns: boolean) => void;
  /** Writes who is beside the list into the path, in place of the entry. */
  onShow: (userId: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation(["selfAnalysis", "common"]);
  const { me, workspace } = useWorkspace();
  const isTwoColumns = useTwoColumns();
  const query = useQuery(memberSelfAnalysesQuery(workspace.id));
  const isSlow = useIsSlow(query.isPending);
  const items = query.data?.items ?? [];
  const sharedIds = items
    .filter(({ shared }) => shared)
    .map(({ user }) => user.id);
  // Beside the list someone is always in the path (the one last shown, else the first
  // who shared): a panel that narrows the body to one pane then keeps them on screen
  // (4.1「選んでいた項目…保つ」), and the screen's 💬 is theirs.
  const besideList =
    userId === undefined && isTwoColumns
      ? (fallbackId ?? sharedIds[0])
      : undefined;
  // Written once the router has settled: mid-navigation the next location's state can
  // meet the last one's path, and name someone else.
  const isSettled = useRouterState({
    select: (state) =>
      state.status === "idle" &&
      state.resolvedLocation?.href === state.location.href,
  });
  const latestShow = useRef(onShow);
  latestShow.current = onShow;
  useEffect(() => {
    if (isSettled && besideList !== undefined) latestShow.current(besideList);
  }, [isSettled, besideList]);
  const selected = userId ?? besideList;
  const header = (
    <Heading level={1} variant="heading-1-list">
      {t("selfAnalysis:team.title")}
    </Heading>
  );

  let list: ReactNode;
  if (query.isError) {
    list = (
      <FailureState
        error={query.error}
        onRetry={() => void query.refetch()}
        dashboardHref={dashboardHref(me)}
        headingLevel={2}
        size="S"
      />
    );
  } else if (query.data === undefined) {
    list = isSlow ? (
      <SlowLoadingState
        headingLevel={2}
        size="S"
        onRetry={() => void query.refetch()}
      />
    ) : (
      <ListSkeleton />
    );
  } else {
    list = (
      <ListView
        aria-label={t("selfAnalysis:team.members")}
        items={items.map((item) => ({ ...item, id: item.user.id }))}
        selectionMode="single"
        // "Not shared" rows stay in the arrow keys' way, to be read (6.11).
        disabledBehavior="selection"
        selectedKeys={selected === undefined ? [] : [selected]}
        // Pressing the chosen one again keeps it: the detail never goes blank.
        onSelectionChange={(keys) => {
          const [key] = [...keys];
          if (key !== undefined) onOpen(String(key), isTwoColumns);
        }}
      >
        {({ user, shared, status }) => (
          <ListViewItem
            id={user.id}
            textValue={user.displayName}
            isDisabled={!shared}
          >
            <Flex gap="space-200" alignItems="center">
              <Avatar name={user.displayName} src={user.avatarUrl} />
              <Stack gap="space-25">
                <Text variant="label" tone={shared ? "primary" : "tertiary"}>
                  <UserName user={user} />
                </Text>
                <Text
                  variant="caption"
                  tone={shared ? "secondary" : "tertiary"}
                >
                  {shared && status !== null
                    ? t("selfAnalysis:team.shared", {
                        status: t(`common:selfAnalysisStatus.${status}`),
                      })
                    : t("selfAnalysis:team.notShared")}
                </Text>
              </Stack>
            </Flex>
          </ListViewItem>
        )}
      </ListView>
    );
  }
  return (
    <ListDetailPattern
      header={header}
      list={list}
      listNote={
        query.data !== undefined && sharedIds.length === 0 ? (
          <Text tone="secondary" elementType="p">
            {t("selfAnalysis:team.empty")}
          </Text>
        ) : undefined
      }
      detail={
        selected === undefined ? null : (
          <SharedDetail key={selected} userId={selected} />
        )
      }
      listLabel={t("selfAnalysis:team.title")}
      onBack={onBack}
    />
  );
}

/** 12's shape while its route loads (design-spec 6.0.6). */
export function TeamSelfAnalysesSkeleton() {
  const { t } = useTranslation(["selfAnalysis"]);
  return (
    <ListDetailPattern
      header={
        <Heading level={1} variant="heading-1-list">
          {t("selfAnalysis:team.title")}
        </Heading>
      }
      list={<ListSkeleton />}
      detail={null}
      listLabel={t("selfAnalysis:team.title")}
      onBack={() => {}}
    />
  );
}

/**
 * 12 Team Self Analyses (design-spec 6.11): pattern D. The workspace's Owners and
 * Members, the ones who shared their self-analysis here pressable and the others "Not
 * shared"; the chosen one's answers beside them to read and comment on (PNL-1, this
 * workspace's threads only). Owners and Members only (design-spec 2.2).
 */
export function TeamSelfAnalysesScreen({ userId }: { userId?: string }) {
  const { t } = useTranslation(["selfAnalysis", "app"]);
  const { me, workspace, role } = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();
  const panel = usePanel();
  const queryClient = useQueryClient();
  // Outside the frame: the screen's own width, not the body beside a panel.
  const isDesktop = useIsDesktop();
  const isViewer = role === "viewer";
  // A Viewer's "no access" has no name (6.0.1).
  useDocumentTitle(
    ...(isViewer ? [] : [t("selfAnalysis:team.title"), workspace.name]),
  );
  const openedHere = useRouterState({
    select: (state) => state.location.state.openedDetail === true,
  });
  // On a desktop the screen stays about the member left by ← while the list stands alone
  // beside a panel: the panel keeps its subject, with the history entry.
  const leftMember = useRouterState({
    select: (state) => state.location.state.teamMember,
  });
  const shownId = userId ?? (isDesktop ? leftMember : undefined);
  const shared = useQuery({
    ...memberSelfAnalysisQuery(workspace.id, shownId ?? ""),
    enabled: !isViewer && shownId !== undefined,
  });
  const data = shared.data;
  // The latest move asked for, so an earlier one answered later goes nowhere; none once
  // the screen is left.
  const latestMove = useRef(0);
  useEffect(
    () => () => {
      latestMove.current = -1;
    },
    [],
  );
  /**
   * Moves to `id`'s answers, keeping the open panel (SDD 4章): the header's list, the
   * one shown's threads, becomes `id`'s, read first (from the cache when it has them) so
   * the panel stays open on it.
   */
  const moveTo = async (
    id: string,
    options: Pick<Parameters<typeof navigate>[0], "replace" | "state">,
  ) => {
    latestMove.current += 1;
    const move = latestMove.current;
    // Gone to another entry meanwhile (Back, Forward): the move belongs to the one left.
    // A replace keeps the entry's index.
    const from = router.state.location.state.__TSR_index;
    const href = await hrefFor(id);
    const now = router.state.location;
    if (move !== latestMove.current || now.state.__TSR_index !== from) return;
    // The panel closed meanwhile: the move does not open it again.
    const isPanelOpen = (now.search as { panel?: unknown }).panel !== undefined;
    void navigate({
      href: isPanelOpen ? href : teamHref(workspace.id, id),
      ...options,
    });
  };
  const hrefFor = async (id: string) => {
    const href = teamHref(workspace.id, id);
    const open = panel.open;
    if (
      open === null ||
      open.name !== "comments" ||
      open.target.kind !== "screen"
    ) {
      return panel.keep(href);
    }
    const next = await queryClient
      .ensureQueryData(memberSelfAnalysisQuery(workspace.id, id))
      .catch(() => undefined);
    if (next === undefined) return panel.keep(href);
    const search = new URLSearchParams({
      panel: "comments",
      target: formatPanelTarget({
        kind: "screen",
        screen: {
          containerType: "self_analysis",
          containerId: next.id,
          sectionKeys: [],
        },
      }),
    });
    return `${href}?${search}`;
  };
  const comments: ScreenComments | undefined =
    data === undefined
      ? undefined
      : {
          screen: {
            containerType: "self_analysis",
            containerId: data.id,
            sectionKeys: [],
          },
          dataKey: memberSelfAnalysesKey(workspace.id),
          // The user's own row: its threads come from every workspace it is shared with
          // (SDD 5.11 C1), each saying which (6.0.4); it is shared here, where a new one goes.
          fromWorkspaces:
            data.user.id === me.id
              ? { shares: [{ id: workspace.id, name: workspace.name }] }
              : undefined,
          shows: (item) =>
            item.type === "self_analysis_answer" && item.id === data.id,
          labelOf: (target) =>
            target.type === "self_analysis_answer" && target.key != null
              ? questionLabel(
                  target.key,
                  data.sections
                    .flatMap((section) => section.questions)
                    .find(({ key }) => key === target.key)?.title,
                )
              : undefined,
        };
  return (
    <WorkspaceFrame
      // A Viewer has no way into 10 (5章「Viewer」): no tab, crumb or ← leads there.
      current={isViewer ? undefined : "selfAnalysis"}
      comments={comments}
      {...(isViewer
        ? { title: { label: t("selfAnalysis:team.title") } }
        : {
            back: {
              label: t("app:nav.selfAnalysis"),
              href: selfAnalysisHref(workspace.id),
            },
          })}
      breadcrumbs={
        <Breadcrumbs>
          {!isViewer && (
            <Breadcrumb href={selfAnalysisHref(workspace.id)}>
              {t("app:nav.selfAnalysis")}
            </Breadcrumb>
          )}
          <Breadcrumb>{t("selfAnalysis:team.title")}</Breadcrumb>
        </Breadcrumbs>
      }
    >
      {isViewer ? (
        <NoAccessState dashboardHref={dashboardHref(me)} />
      ) : (
        <TeamBody
          userId={userId}
          fallbackId={isDesktop ? leftMember : undefined}
          // Beside the list a choice replaces the entry: Back leaves the screen.
          onOpen={(id, twoColumns) =>
            void moveTo(id, {
              replace: twoColumns,
              state: (previous) =>
                twoColumns ? previous : { ...previous, openedDetail: true },
            })
          }
          // The entry keeps how it was reached (the member left by ←, its panel).
          onShow={(id) =>
            void moveTo(id, { replace: true, state: (previous) => previous })
          }
          onBack={() => {
            if (openedHere) {
              router.history.back();
              return;
            }
            latestMove.current += 1;
            void navigate({
              href: panel.keep(teamHref(workspace.id)),
              replace: true,
              state: (previous) => ({ ...previous, teamMember: userId }),
            });
          }}
        />
      )}
    </WorkspaceFrame>
  );
}
