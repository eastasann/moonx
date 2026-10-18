import { formatDate, formatList, formatRelativeTime } from "@moonx/i18n";
import {
  type IdeaDecisionFilter,
  type IdeaSort,
  type IdeaSummary,
  plainText,
  type Stage,
  TEXT_LIMITS,
} from "@moonx/schemas";
import {
  ActionMenu,
  Breadcrumb,
  Breadcrumbs,
  Button,
  CheckDots,
  Flex,
  Heading,
  IllustratedMessage,
  Link,
  ListDetailPattern,
  ListView,
  ListViewItem,
  MenuItem,
  Picker,
  SearchField,
  Skeleton,
  Stack,
  Text,
  useTwoColumns,
} from "@moonx/ui-web";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Lightbulb, SearchX } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalBoundary } from "../components/ErrorBoundary";
import { NewIdeaDialog } from "../components/IdeaDialogs";
import { useIdeaActions } from "../components/ideaActions";
import {
  CheckRows,
  checkDots,
  DecisionBadge,
  KeyMetrics,
  missingChecks,
} from "../components/ideaParts";
import {
  FailureState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, useModal, useWorkspace } from "../components/workspace";
import { inputIssueMessage } from "../lib/input-issues";
import { ideaHref } from "../lib/links";
import {
  type IdeaFilters,
  ideasQuery,
  membersQuery,
  validationHomeQuery,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

/** `/w/$workspaceId/ideas`'s search parameters (SDD 4章). */
export interface IdeasSearch {
  stage?: Stage;
  decision?: IdeaDecisionFilter;
  /** The proposer's user id. */
  proposer?: string;
  /** Archived ideas are included. */
  archived?: boolean;
  sort?: IdeaSort;
  q?: string;
  /** The idea shown beside the list. */
  selected?: string;
}

/** The search as I1 takes it (SDD 5.6 `q`). */
export const searchSchema = plainText(TEXT_LIMITS.short);

/** How long typing in the search pauses before the list asks again. */
const SEARCH_PAUSE_MS = 300;

/** Every filter at its default (design-spec 6.8): what the empty state is told apart by. */
const isDefault = (search: IdeasSearch) =>
  search.stage === undefined &&
  (search.decision ?? "not_dropped") === "not_dropped" &&
  search.proposer === undefined &&
  search.archived !== true &&
  (search.q ?? "").trim() === "";

const filtersOf = (search: IdeasSearch): IdeaFilters => ({
  stage: search.stage,
  decision: search.decision ?? "not_dropped",
  proposerId: search.proposer,
  includeArchived: search.archived === true,
  sort: search.sort ?? "updated",
  q: (search.q ?? "").trim() === "" ? undefined : search.q,
});

/** The Picker value of "no filter". */
const ALL = "all";

/**
 * The filters and the search (design-spec 6.8, s06-ideas.html .filters): small Pickers
 * with their label inside, the search filling the rest of the line. A change replaces
 * the URL's entry, so Back leaves the list instead of stepping through its filters.
 */
function Filters({
  search,
  onChange,
}: {
  search: IdeasSearch;
  onChange: (next: IdeasSearch) => void;
}) {
  const { t } = useTranslation(["ideas", "common"]);
  const { workspace } = useWorkspace();
  const members = useQuery(membersQuery(workspace.id));
  const [text, setText] = useState(search.q ?? "");
  // The URL's search, set elsewhere (Clear filters), shows in the field.
  useEffect(() => setText(search.q ?? ""), [search.q]);
  // The search's rules are I1's (6.0.8 短文): text that breaks them says why, unsent.
  const [issue] = searchSchema.safeParse(text).error?.issues ?? [];
  const textError = issue === undefined ? undefined : inputIssueMessage(issue);
  useEffect(() => {
    if (text === (search.q ?? "") || textError !== undefined) return;
    const timer = setTimeout(
      () => onChange({ ...search, q: text === "" ? undefined : text }),
      SEARCH_PAUSE_MS,
    );
    return () => clearTimeout(timer);
  }, [text, textError, search, onChange]);
  const all = { id: ALL, label: t("ideas:filter.all") };
  const proposers = (members.data?.items ?? [])
    .filter(({ role }) => role !== "viewer")
    .map(({ user }) => ({ id: user.id, label: user.displayName }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const decisions: IdeaDecisionFilter[] = [
    "not_dropped",
    "all",
    "undecided",
    "proceed",
    "hold",
    "drop",
  ];
  const sorts: IdeaSort[] = ["updated", "created", "name"];
  const stages: Stage[] = ["validation", "planning", "launch_prep"];
  return (
    <>
      <Picker
        label={t("ideas:filter.stage")}
        labelPosition="inside"
        size="S"
        items={[
          all,
          ...stages.map((id) => ({ id, label: t(`common:stage.${id}`) })),
        ]}
        value={search.stage ?? ALL}
        onChange={(value) =>
          onChange({
            ...search,
            stage:
              value === ALL || value === null ? undefined : (value as Stage),
          })
        }
      />
      <Picker
        label={t("ideas:filter.decision")}
        labelPosition="inside"
        size="S"
        items={decisions.map((id) => ({
          id,
          label:
            id === "not_dropped"
              ? t("ideas:filter.notDropped")
              : id === "all"
                ? t("ideas:filter.all")
                : t(`common:decision.${id}`),
        }))}
        value={search.decision ?? "not_dropped"}
        onChange={(value) =>
          onChange({
            ...search,
            decision:
              value === null || value === "not_dropped"
                ? undefined
                : (value as IdeaDecisionFilter),
          })
        }
      />
      <Picker
        label={t("ideas:filter.proposer")}
        labelPosition="inside"
        size="S"
        items={[all, ...proposers]}
        value={search.proposer ?? ALL}
        onChange={(value) =>
          onChange({
            ...search,
            proposer: value === ALL || value === null ? undefined : value,
          })
        }
      />
      <Picker
        label={t("ideas:filter.sort")}
        labelPosition="inside"
        size="S"
        items={sorts.map((id) => ({
          id,
          label: t(`ideas:filter.sortBy.${id}`),
        }))}
        value={search.sort ?? "updated"}
        onChange={(value) =>
          onChange({
            ...search,
            sort:
              value === null || value === "updated"
                ? undefined
                : (value as IdeaSort),
          })
        }
      />
      <Picker
        label={t("ideas:filter.archived")}
        labelPosition="inside"
        size="S"
        items={[
          { id: "hidden", label: t("ideas:filter.archivedHidden") },
          { id: "included", label: t("ideas:filter.archivedIncluded") },
        ]}
        value={search.archived === true ? "included" : "hidden"}
        onChange={(value) =>
          onChange({
            ...search,
            archived: value === "included" ? true : undefined,
          })
        }
      />
      <SearchField
        aria-label={t("ideas:filter.search")}
        placeholder={t("ideas:filter.search")}
        size="S"
        width="fill"
        value={text}
        onChange={setText}
        errorMessage={textError}
      />
    </>
  );
}

/**
 * An idea's row (design-spec 6.8, s06-ideas.html .ideas): its name and latest decision,
 * its stage, proposer and last activity, its six checks and what they miss. The Owners'
 * and Members' ⋯ duplicates, archives or restores it.
 */
function IdeaRow({ idea }: { idea: IdeaSummary }) {
  const { t } = useTranslation(["ideas", "common", "app"]);
  const { me } = useWorkspace();
  const meta = [
    ...(idea.archived ? [t("ideas:row.archived")] : []),
    t("ideas:row.meta", {
      stage: t(`common:stage.${idea.stage}`),
      proposer: idea.proposer.displayName,
      when: formatRelativeTime(idea.lastActivityAt, { timeZone: me.timezone }),
    }),
  ].join(t("app:separator"));
  return (
    <Stack gap="space-50">
      <Flex justifyContent="space-between" gap="space-200">
        <Text variant="label">{idea.name}</Text>
        <DecisionBadge decision={idea.latestDecision} />
      </Flex>
      <Text variant="caption" tone="secondary">
        {meta}
      </Text>
      <Flex gap="space-100" alignItems="center">
        <CheckDots checks={checkDots(idea.checks)} size="S" />
        <Text variant="caption" tone="secondary">
          {missingChecks(idea.checks) ?? t("ideas:row.allDone")}
        </Text>
      </Flex>
    </Stack>
  );
}

function RowMenu({ idea }: { idea: IdeaSummary }) {
  const { t } = useTranslation(["ideas"]);
  const actions = useIdeaActions();
  return (
    <ActionMenu
      aria-label={t("ideas:row.menu", { name: idea.name })}
      onAction={(key) => {
        if (key === "duplicate") actions.duplicate(idea);
        else if (key === "archive") actions.archive(idea.id);
        else if (key === "restore") actions.restore(idea.id);
      }}
    >
      <MenuItem id="duplicate">{t("ideas:action.duplicate")}</MenuItem>
      {idea.archived ? (
        <MenuItem id="restore">{t("ideas:action.restore")}</MenuItem>
      ) : (
        <MenuItem id="archive">{t("ideas:action.archive")}</MenuItem>
      )}
    </ActionMenu>
  );
}

/**
 * The selected idea beside the list (design-spec 6.8, s06-ideas.html .detail): its
 * decision, stage and proposer, name and concept, the four key numbers, the six checks,
 * its plans and the latest decision's reason, and Open validation. It reads V1, which 13
 * then shows at once.
 */
function IdeaDetailPane({ ideaId }: { ideaId: string }) {
  const { t } = useTranslation(["ideas", "common", "app", "validation"]);
  const { me, workspace } = useWorkspace();
  const navigate = useNavigate();
  const query = useQuery(validationHomeQuery(ideaId));
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
          <Heading level={2}>{t("ideas:title")}</Heading>
          <Text>{t("ideas:empty")}</Text>
          <Text>{t("ideas:empty")}</Text>
        </Stack>
      </Skeleton>
    );
  }
  const { idea, checks, decisions } = query.data;
  const latest = decisions[0];
  const timeZone = me.timezone;
  const meta = t("ideas:detail.meta", {
    stage: t(`common:stage.${idea.stage}`),
    proposer: idea.proposer.displayName,
  });
  const plans =
    idea.plans.length === 0
      ? t("ideas:detail.plansNone")
      : t("ideas:detail.plans", {
          names: formatList(idea.plans.map(({ name }) => name)),
        });
  const decided =
    latest !== undefined && idea.latestDecision !== null
      ? t("ideas:detail.latest", {
          decision: t(`common:decision.${idea.latestDecision}`),
          date: formatDate(latest.recordedAt, { timeZone }),
          reason: latest.reasonExcerpt ?? "",
        })
      : null;
  return (
    <Stack gap="space-300">
      <Stack gap="space-100">
        <Flex gap="space-200" alignItems="center" wrap>
          <DecisionBadge decision={idea.latestDecision} />
          <Text variant="caption" tone="secondary">
            {latest === undefined || idea.latestDecision === null
              ? meta
              : [
                  t("ideas:detail.latestDecision", {
                    date: formatDate(latest.recordedAt, { timeZone }),
                  }),
                  meta,
                ].join(t("app:separator"))}
          </Text>
        </Flex>
        <Heading level={2}>{idea.name}</Heading>
        <Text tone="secondary">{idea.oneLineConcept}</Text>
      </Stack>
      <KeyMetrics
        metrics={query.data.keyMetrics}
        currency={workspace.currency}
        variant="pair"
        aria-label={t("ideas:detail.keyNumbers", { name: idea.name })}
      />
      <Stack gap="space-100">
        <Heading level={3} variant="label">
          {t("validation:home.checks.title")}
        </Heading>
        <CheckRows
          checks={checks}
          hasReasons={false}
          aria-label={t("ideas:detail.checksOf", { name: idea.name })}
        />
      </Stack>
      <Text variant="body-sm" tone="secondary">
        {decided === null ? plans : `${plans} ${decided}`}
      </Text>
      <Flex>
        <Button
          variant="primary"
          onPress={() =>
            void navigate({ href: ideaHref(workspace.id, idea.id) })
          }
        >
          {t("ideas:detail.open")}
          <ArrowRight />
        </Button>
      </Flex>
    </Stack>
  );
}

/** The list's empty states (design-spec 6.0.6・6.8): none yet, or none for these filters. */
function EmptyList({
  isFiltered,
  canCreate,
  onCreate,
  onClear,
}: {
  isFiltered: boolean;
  canCreate: boolean;
  onCreate: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation(["ideas"]);
  if (isFiltered) {
    return (
      <IllustratedMessage
        headingLevel={2}
        size="S"
        icon={<SearchX />}
        heading={t("ideas:emptyFiltered")}
        actions={
          <Button variant="secondary" onPress={onClear}>
            {t("ideas:filter.clear")}
          </Button>
        }
      />
    );
  }
  return (
    <IllustratedMessage
      headingLevel={2}
      size="S"
      icon={<Lightbulb />}
      heading={t("ideas:empty")}
      actions={
        canCreate ? (
          <Button variant="primary" onPress={onCreate}>
            {t("ideas:newIdea")}
          </Button>
        ) : undefined
      }
    />
  );
}

/**
 * The list and its detail, inside the frame: whether they stand side by side decides
 * what a row does (design-spec 6.8: beside the list it shows the idea's summary; alone,
 * on a phone and a tablet, it opens 13).
 */
function IdeasBody({
  search,
  onSearch,
}: {
  search: IdeasSearch;
  onSearch: (next: IdeasSearch) => void;
}) {
  const { t } = useTranslation(["ideas", "app"]);
  const { me, workspace, role } = useWorkspace();
  const modal = useModal();
  const navigate = useNavigate();
  const isTwoColumns = useTwoColumns();
  const canWrite = role !== "viewer";
  const query = useQuery({
    ...ideasQuery(workspace.id, filtersOf(search)),
    // A new filter keeps the rows until its answer comes, not the skeleton.
    placeholderData: keepPreviousData,
  });
  const isSlow = useIsSlow(query.isPending);
  const items = query.data?.items ?? [];
  const selected =
    items.find(({ id }) => id === search.selected)?.id ??
    // Beside the list there is always an idea to show: the first, until one is chosen.
    (isTwoColumns ? items[0]?.id : undefined);
  const hidden = query.data?.hiddenDroppedCount ?? 0;

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
      <IdeasListSkeleton />
    );
  } else if (items.length === 0 && (hidden === 0 || !isDefault(search))) {
    list = (
      <EmptyList
        isFiltered={!isDefault(search)}
        canCreate={canWrite}
        onCreate={() => modal.open("new-idea")}
        onClear={() => onSearch({})}
      />
    );
  } else {
    list = (
      <ListView
        aria-label={t("ideas:title")}
        items={items}
        selectionMode="single"
        selectedKeys={selected === undefined ? [] : [selected]}
        dependencies={[canWrite, me.timezone]}
        // Pressing the chosen idea again keeps it: the detail never goes blank.
        onSelectionChange={(keys) => {
          const [key] = [...keys];
          if (key === undefined) return;
          if (isTwoColumns) onSearch({ ...search, selected: String(key) });
          else void navigate({ href: ideaHref(workspace.id, String(key)) });
        }}
      >
        {(idea) => (
          <ListViewItem
            id={idea.id}
            textValue={idea.name}
            actions={canWrite ? <RowMenu idea={idea} /> : undefined}
          >
            <IdeaRow idea={idea} />
          </ListViewItem>
        )}
      </ListView>
    );
  }

  return (
    <ListDetailPattern
      header={
        <Heading level={1} variant="heading-1-list">
          {t("ideas:title")}
        </Heading>
      }
      newItem={
        canWrite
          ? { label: t("ideas:newIdea"), onPress: () => modal.open("new-idea") }
          : undefined
      }
      filters={<Filters search={search} onChange={onSearch} />}
      list={list}
      listNote={
        hidden > 0 ? (
          <Text variant="body-sm" tone="secondary">
            {t("ideas:hiddenDropped", { count: hidden })}
            {t("app:separator")}
            <Link onPress={() => onSearch({ ...search, decision: "all" })}>
              {t("ideas:show")}
            </Link>
          </Text>
        ) : undefined
      }
      detail={
        selected === undefined ? null : <IdeaDetailPane ideaId={selected} />
      }
      listLabel={t("ideas:title")}
      onBack={() => onSearch({ ...search, selected: undefined })}
    />
  );
}

/** Rows of placeholder words in the shape of the list (design-spec 6.0.6). */
function IdeasListSkeleton() {
  const { t } = useTranslation(["ideas"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {[0, 1, 2].map((row) => (
          <Stack key={row} gap="space-50">
            <Text variant="label">{t("ideas:newIdea")}</Text>
            <Text variant="caption">{t("ideas:empty")}</Text>
          </Stack>
        ))}
      </Stack>
    </Skeleton>
  );
}

/** 6 Ideas' shape while its route loads (design-spec 6.0.6). */
export function IdeasSkeleton() {
  const { t } = useTranslation(["ideas"]);
  return (
    <ListDetailPattern
      header={
        <Heading level={1} variant="heading-1-list">
          {t("ideas:title")}
        </Heading>
      }
      list={<IdeasListSkeleton />}
      detail={null}
      listLabel={t("ideas:title")}
      onBack={() => {}}
    />
  );
}

/**
 * 6 Ideas (design-spec 6.8, s06-ideas.html): pattern D. The ideas under the filters and
 * the search, the selected one's summary beside them on a desktop; New idea (M1) for the
 * Owners and Members, and "n dropped ideas hidden · Show" under the list.
 */
export function IdeasScreen({
  search,
  modal,
}: {
  search: IdeasSearch;
  modal: string | undefined;
}) {
  const { t } = useTranslation(["ideas", "app"]);
  const { workspace, role } = useWorkspace();
  const modals = useModal();
  const navigate = useNavigate();
  useDocumentTitle(t("ideas:title"), workspace.name);
  const onSearch = (next: IdeasSearch) =>
    void navigate({
      to: ".",
      search: (previous: Record<string, unknown>) => ({
        ...(typeof previous.modal === "string"
          ? { modal: previous.modal }
          : {}),
        ...next,
      }),
      replace: true,
    });
  return (
    <WorkspaceFrame
      current="ideas"
      title={{ label: t("ideas:title") }}
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb>{t("ideas:title")}</Breadcrumb>
        </Breadcrumbs>
      }
    >
      <IdeasBody search={search} onSearch={onSearch} />
      {modal === "new-idea" && role !== "viewer" && (
        <ModalBoundary key={modal} onClose={modals.close}>
          <NewIdeaDialog onClose={modals.close} />
        </ModalBoundary>
      )}
    </WorkspaceFrame>
  );
}
