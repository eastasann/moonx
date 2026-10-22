import { formatCount, formatList } from "@moonx/i18n";
import type { SelfAnalysisHome, TemplateQuestion } from "@moonx/schemas";
import {
  ActionMenu,
  AlertDialog,
  Breadcrumb,
  Breadcrumbs,
  Button,
  DescriptionList,
  DescriptionListItem,
  Heading,
  HubPattern,
  IllustratedMessage,
  MenuItem,
  MoonGlyph,
  RowList,
  RowListItem,
  Skeleton,
  Text,
} from "@moonx/ui-web";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { AiMenu } from "../components/AiMenu";
import type { ScreenComments } from "../components/CommentsPanel";
import { ModalBoundary } from "../components/ErrorBoundary";
import { HubBlock } from "../components/HubBlock";
import { toastFailure } from "../components/ideaActions";
import { CurrencyDialog, ShareDialog } from "../components/SelfAnalysisDialogs";
import { useMovesToPersonal } from "../components/selfAnalysis";
import {
  FailureState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import {
  dashboardHref,
  useModal,
  usePanel,
  useWorkspace,
} from "../components/workspace";
import { ApiError, api, unwrap } from "../lib/api";
import { questionLabel } from "../lib/item-labels";
import {
  selfAnalysisHref,
  selfAnalysisSectionHref,
  teamHref,
} from "../lib/links";
import { useIsOnline } from "../lib/online";
import {
  selfAnalysisHomeQuery,
  selfAnalysisKey,
  selfAnalysisSectionQuery,
} from "../lib/queries";
import { useSendThrough } from "../lib/send";
import { useDocumentTitle } from "../lib/title";

/** Where 11 opens to go on (design-spec 6.11「Continue」): the first question not answered. */
function continueHref(workspaceId: string, home: SelfAnalysisHome): string {
  const first = home.firstUnanswered;
  if (first !== null) {
    return selfAnalysisSectionHref(
      workspaceId,
      first.sectionKey,
      first.questionKey,
    );
  }
  // All answered: the first question of the first section (6.2「開いたとき」).
  const [section] = home.sections;
  return section === undefined
    ? selfAnalysisHref(workspaceId)
    : selfAnalysisSectionHref(workspaceId, section.key);
}

/**
 * The status (design-spec 6.11): how many are answered, the workspaces it is shared with
 * and the template's version; before the first answer, what the self-analysis is for.
 */
function StatusBlock({ home }: { home: SelfAnalysisHome }) {
  const { t } = useTranslation(["selfAnalysis"]);
  return (
    <HubBlock title={t("selfAnalysis:home.state.title")}>
      {home.status === "not_started" ? (
        <Text tone="secondary" elementType="p">
          {t("selfAnalysis:home.empty", { count: home.total })}
        </Text>
      ) : (
        <DescriptionList>
          <DescriptionListItem label={t("selfAnalysis:home.state.answered")}>
            {t("selfAnalysis:home.state.answeredCount", {
              answered: formatCount(home.answered),
              total: formatCount(home.total),
            })}
          </DescriptionListItem>
          <DescriptionListItem label={t("selfAnalysis:home.state.sharedWith")}>
            {home.shares.length === 0
              ? t("selfAnalysis:home.state.notShared")
              : formatList(home.shares.map(({ workspace }) => workspace.name))}
          </DescriptionListItem>
          <DescriptionListItem label={t("selfAnalysis:home.state.template")}>
            {t("selfAnalysis:home.state.version", {
              version: home.template.versionNumber,
            })}
          </DescriptionListItem>
        </DescriptionList>
      )}
    </HubBlock>
  );
}

/**
 * The eleven sections with how far each is (design-spec 6.11): a moon filled as far. A
 * row opens it on 11, at its first question not answered.
 */
function SectionsBlock({ home }: { home: SelfAnalysisHome }) {
  const { t } = useTranslation(["selfAnalysis"]);
  const { workspace } = useWorkspace();
  return (
    <HubBlock title={t("selfAnalysis:home.sections.title")}>
      <RowList aria-label={t("selfAnalysis:home.sections.title")}>
        {home.sections.map((section) => (
          <RowListItem
            key={section.key}
            href={selfAnalysisSectionHref(workspace.id, section.key)}
            start={
              <MoonGlyph
                value={
                  section.total === 0 ? 0 : section.answered / section.total
                }
              />
            }
            end={t("selfAnalysis:home.sections.count", {
              answered: formatCount(section.answered),
              total: formatCount(section.total),
            })}
            isEndNumeric
          >
            {section.title}
          </RowListItem>
        ))}
      </RowList>
    </HubBlock>
  );
}

/**
 * What changes the self-analysis's state (design-spec 6.11): Mark as done, asking first
 * while questions are empty, and Reopen. The answer is 10's data.
 */
function useCompletion() {
  const queryClient = useQueryClient();
  const sendThrough = useSendThrough();
  const [emptyCount, setEmptyCount] = useState<number | null>(null);
  const put = (updated: SelfAnalysisHome) =>
    queryClient.setQueryData(selfAnalysisHomeQuery().queryKey, updated);
  const complete = useMutation({
    mutationFn: (confirmEmpty: boolean) =>
      sendThrough(() =>
        unwrap(
          api().api.v1.me["self-analysis"].complete.post(
            confirmEmpty ? { confirmEmpty: true } : {},
          ),
        ),
      ),
    onSuccess: put,
    onError: (error, confirmEmpty) => {
      // Questions were emptied since 10 was read: ask with the count the API has.
      if (error instanceof ApiError && error.code === "HAS_EMPTY_QUESTIONS") {
        const count = error.detail.emptyCount;
        setEmptyCount(typeof count === "number" ? count : 0);
        void queryClient.invalidateQueries({ queryKey: selfAnalysisKey });
        return;
      }
      toastFailure(error, () => complete.mutate(confirmEmpty));
    },
  });
  const reopen = useMutation({
    mutationFn: () =>
      sendThrough(() => unwrap(api().api.v1.me["self-analysis"].reopen.post())),
    onSuccess: put,
    onError: (error) => toastFailure(error, () => reopen.mutate()),
  });
  return {
    /** Mark as done: at once when every question is answered, else after asking. */
    markDone: (home: SelfAnalysisHome) => {
      const empty = home.total - home.answered;
      if (empty > 0) setEmptyCount(empty);
      else complete.mutate(false);
    },
    reopen: () => reopen.mutate(),
    isPending: complete.isPending || reopen.isPending,
    confirmation:
      emptyCount === null ? null : (
        <MarkDoneConfirmation
          count={emptyCount}
          onConfirm={() => {
            setEmptyCount(null);
            complete.mutate(true);
          }}
          onCancel={() => setEmptyCount(null)}
        />
      ),
  };
}

function MarkDoneConfirmation({
  count,
  onConfirm,
  onCancel,
}: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["selfAnalysis"]);
  return (
    <AlertDialog
      isOpen
      size="S"
      title={t("selfAnalysis:home.markDoneConfirm.title", { count })}
      primaryActionLabel={t("selfAnalysis:home.markDoneConfirm.confirm")}
      cancelLabel={t("selfAnalysis:home.markDoneConfirm.cancel")}
      onPrimaryAction={onConfirm}
      onCancel={onCancel}
    >
      {t("selfAnalysis:home.markDoneConfirm.body")}
    </AlertDialog>
  );
}

function SelfAnalysisHub({
  home,
  modal,
}: {
  home: SelfAnalysisHome;
  modal: string | undefined;
}) {
  const { t } = useTranslation(["selfAnalysis", "common"]);
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const modals = useModal();
  const isOnline = useIsOnline();
  const completion = useCompletion();
  const [isChangingCurrency, setChangingCurrency] = useState(false);
  const isDone = home.status === "done";
  const here = selfAnalysisHref(workspace.id);
  // Shared with nowhere yet, it is shared once done; a share is taken off at any time.
  const canShare = isDone || home.shares.length > 0;
  // Whether M6 may open is decided as it opens: reopened elsewhere meanwhile, it stays to
  // say why its Save was refused.
  const [wasSharing, setSharing] = useState(false);
  const isSharing = modal === "share" && (canShare || wasSharing);
  if (isSharing !== wasSharing) setSharing(isSharing);
  return (
    <>
      <HubPattern
        header={
          <>
            <Heading level={1} variant="heading-1-hub">
              {t("selfAnalysis:home.title")}
            </Heading>
            <Text tone="secondary">
              {t("selfAnalysis:home.status", {
                status: t(`common:selfAnalysisStatus.${home.status}`),
                answered: formatCount(home.answered),
                total: formatCount(home.total),
              })}
            </Text>
          </>
        }
        actions={
          <>
            <AiMenu kind="self_analysis" returnTo={here} />
            {isDone ? (
              <Button
                variant="secondary"
                onPress={completion.reopen}
                isPending={completion.isPending}
                isDisabled={!isOnline}
              >
                {t("selfAnalysis:home.reopen")}
              </Button>
            ) : (
              <Button
                variant="secondary"
                onPress={() => completion.markDone(home)}
                isPending={completion.isPending}
                isDisabled={!isOnline}
              >
                {t("selfAnalysis:home.markDone")}
              </Button>
            )}
            <Button
              variant="secondary"
              onPress={() => modals.open("share")}
              isDisabled={!canShare}
            >
              {t("selfAnalysis:home.share")}
            </Button>
            <Button
              variant="secondary"
              isQuiet
              onPress={() => void navigate({ href: teamHref(workspace.id) })}
            >
              {t("selfAnalysis:home.team")}
            </Button>
            <ActionMenu
              aria-label={t("selfAnalysis:home.more")}
              onAction={(key) => {
                if (key === "currency") setChangingCurrency(true);
              }}
            >
              <MenuItem id="currency">
                {t("selfAnalysis:home.changeCurrency")}
              </MenuItem>
            </ActionMenu>
          </>
        }
        primaryAction={
          <Button
            variant="primary"
            onPress={() =>
              void navigate({ href: continueHref(workspace.id, home) })
            }
          >
            {home.status === "not_started"
              ? t("selfAnalysis:home.start")
              : t("selfAnalysis:home.continue")}
          </Button>
        }
        blocks={[
          {
            id: "status",
            column: "main",
            content: <StatusBlock home={home} />,
          },
          {
            id: "sections",
            column: "aside",
            content: <SectionsBlock home={home} />,
          },
        ]}
      />
      {completion.confirmation}
      {isSharing && (
        <ModalBoundary key={modal} onClose={modals.close}>
          <ShareDialog home={home} onClose={modals.close} />
        </ModalBoundary>
      )}
      {isChangingCurrency && (
        <ModalBoundary onClose={() => setChangingCurrency(false)}>
          <CurrencyDialog
            home={home}
            onClose={() => setChangingCurrency(false)}
          />
        </ModalBoundary>
      )}
    </>
  );
}

/**
 * 10's shape while it loads (design-spec 6.0.6): the title, the status and the sections.
 * Drawn inside a `Skeleton`, its words are bars.
 */
export function SelfAnalysisHomeSkeleton() {
  const { t } = useTranslation(["selfAnalysis"]);
  const rows = (
    <RowList aria-label={t("selfAnalysis:home.sections.title")}>
      {[0, 1, 2, 3].map((row) => (
        <RowListItem key={row} end={t("selfAnalysis:home.sections.count")}>
          {t("selfAnalysis:home.sections.title")}
        </RowListItem>
      ))}
    </RowList>
  );
  return (
    <HubPattern
      header={
        <Heading level={1} variant="heading-1-hub">
          {t("selfAnalysis:home.title")}
        </Heading>
      }
      blocks={[
        {
          id: "status",
          column: "main",
          content: (
            <HubBlock title={t("selfAnalysis:home.state.title")}>
              {rows}
            </HubBlock>
          ),
        },
        {
          id: "sections",
          column: "aside",
          content: (
            <HubBlock title={t("selfAnalysis:home.sections.title")}>
              {rows}
            </HubBlock>
          ),
        },
      ]}
    />
  );
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
 * 10 when no self-analysis can be made yet (design-spec 6.0.6): its title, and the words
 * in the place of Start, where the Status block would be.
 */
function HomeNotReady() {
  const { t } = useTranslation(["selfAnalysis", "errors"]);
  return (
    <HubPattern
      header={
        <Heading level={1} variant="heading-1-hub">
          {t("selfAnalysis:home.title")}
        </Heading>
      }
      blocks={[
        {
          id: "status",
          column: "main",
          content: (
            <HubBlock title={t("selfAnalysis:home.state.title")}>
              <Text tone="secondary" elementType="p">
                {t("errors:TEMPLATE_NOT_PUBLISHED")}
              </Text>
            </HubBlock>
          ),
        },
      ]}
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
  const query = useQuery(selfAnalysisHomeQuery());
  const isSlow = useIsSlow(query.isPending);
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
  if (isSlow) return <SlowLoadingState onRetry={() => void query.refetch()} />;
  return <Skeleton isLoading>{skeleton}</Skeleton>;
}

/**
 * The self-analysis's questions, for its panels on 10: the names their 💬 lists the
 * threads under ("WHY Q1"), and which are amounts, as 🕘 names their fields. Its
 * sections' questions are read once a panel is open (S2, the reads 11 makes too); until
 * then a thread goes without its name.
 */
function useQuestions(home: SelfAnalysisHome | undefined, enabled: boolean) {
  const sections = useQueries({
    queries: (home?.sections ?? []).map((section) => ({
      ...selfAnalysisSectionQuery(section.key),
      enabled,
    })),
  });
  const questions = new Map<string, TemplateQuestion>();
  for (const { data } of sections) {
    for (const question of data?.section.questions ?? []) {
      questions.set(question.key, question);
    }
  }
  return questions;
}

/**
 * 10 Self Analysis (design-spec 6.11): pattern A. The user's own self-analysis, the same
 * in every workspace: how many are answered and the eleven sections, Continue to the
 * first empty question, AI ▼, Mark as done or Reopen, Share (M6), Team (12), and its
 * currency under ⋯. The header's 💬 lists its threads, its 🕘 its changes. A Viewer of
 * this workspace is taken to their personal workspace's 10 (SDD 4章).
 */
export function SelfAnalysisHomeScreen({ modal }: { modal?: string }) {
  const { t } = useTranslation(["app"]);
  const { workspace } = useWorkspace();
  const panel = usePanel();
  const moves = useMovesToPersonal();
  const { data: home } = useQuery({
    ...selfAnalysisHomeQuery(),
    enabled: !moves,
  });
  useDocumentTitle(t("app:nav.selfAnalysis"), workspace.name);
  const questions = useQuestions(home, panel.open !== null);
  const comments: ScreenComments | undefined =
    home === undefined
      ? undefined
      : {
          screen: {
            containerType: "self_analysis",
            containerId: home.id,
            sectionKeys: [],
          },
          dataKey: selfAnalysisKey,
          fromWorkspaces: {
            shares: home.shares.map((share) => share.workspace),
          },
          // Every answer is 10's, in its list (SDD 6.3「画面と節の対応」).
          shows: (item) =>
            item.type === "self_analysis_answer" && item.id === home.id,
          labelOf: (target) => {
            const title =
              target.type === "self_analysis_answer" && target.key != null
                ? questions.get(target.key)?.title
                : undefined;
            return target.key == null || title === undefined
              ? undefined
              : questionLabel(target.key, title);
          },
        };
  return (
    <WorkspaceFrame
      current="selfAnalysis"
      title={{ label: t("app:nav.selfAnalysis") }}
      comments={comments}
      history={
        comments && {
          ...comments,
          hasFau: () => false,
          currency: home?.currency,
          answerTypeOf: (key) => questions.get(key)?.answerType,
        }
      }
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb>{t("app:nav.selfAnalysis")}</Breadcrumb>
        </Breadcrumbs>
      }
    >
      {moves ? null : (
        <SelfAnalysisBody
          skeleton={<SelfAnalysisHomeSkeleton />}
          notReady={<HomeNotReady />}
        >
          {(loaded) => <SelfAnalysisHub home={loaded} modal={modal} />}
        </SelfAnalysisBody>
      )}
    </WorkspaceFrame>
  );
}
