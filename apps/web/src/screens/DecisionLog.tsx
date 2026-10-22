import { formatDate, formatIsoDate, formatTime, i18n } from "@moonx/i18n";
import {
  type DecisionLogEntry,
  type DecisionLogKind,
  type DecisionLogSummary,
  decisionValueSchema,
  goNoGoValueSchema,
} from "@moonx/schemas";
import {
  Badge,
  Breadcrumb,
  Breadcrumbs,
  Button,
  ButtonGroup,
  DatePicker,
  DescriptionList,
  DescriptionListItem,
  Dialog,
  Flex,
  Heading,
  IllustratedMessage,
  Link,
  ListDetailPattern,
  Picker,
  Skeleton,
  Stack,
  type TableColumn,
  TableView,
  Text,
  useTwoColumns,
} from "@moonx/ui-web";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowRight, ScrollText, SearchX } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DecisionKeyNumbers,
  FauCounts,
  MissingCheckRows,
} from "../components/decisionParts";
import { DecisionBadge } from "../components/ideaParts";
import {
  FailureState,
  NoAccessState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { UserName } from "../components/UserName";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, useWorkspace } from "../components/workspace";
import {
  type DecisionsSearch,
  decisionsHref,
  ideaHref,
  planHref,
} from "../lib/links";
import {
  decisionLogEntryQuery,
  decisionLogQuery,
  ideasQuery,
  membersQuery,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

export type { DecisionsSearch };

/** The Picker value of "no filter". */
const ALL = "all";

/** The periods the Period filter offers, each up to today and including it. */
const PERIODS = ["last7", "last30", "last90", "last365"] as const;
type Period = (typeof PERIODS)[number];

const DAY_MS = 86_400_000;

/** The date `days` after `date` (before, when negative), both `YYYY-MM-DD`. */
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

/**
 * The first day of `period` ending on `today`: 7, 30 or 90 days with today among them,
 * or the 12 months since the day after this date last year (Feb 29 counts from Mar 1).
 */
function periodStart(period: Period, today: string): string {
  if (period === "last365") {
    const [year, month, day] = today.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    // A day the month lacks last year (Feb 29) is its last day (Feb 28).
    const lastDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
    const lastYear = new Date(
      Date.UTC(year - 1, month - 1, Math.min(day, lastDay)),
    );
    return addDays(lastYear.toISOString().slice(0, 10), 1);
  }
  const days = { last7: 7, last30: 30, last90: 90 }[period];
  return addDays(today, 1 - days);
}

const isFiltered = (search: DecisionsSearch) =>
  search.kind !== undefined ||
  search.idea !== undefined ||
  search.recordedBy !== undefined ||
  search.from !== undefined ||
  search.to !== undefined;

/** A decision's value as its badge: Proceed / Hold / Drop, Launch / Delay / Stop. */
function ValueBadge({ entry }: { entry: DecisionLogSummary }) {
  const { t } = useTranslation(["common"]);
  const decision = decisionValueSchema.safeParse(entry.value);
  if (entry.kind === "validation_decision" && decision.success) {
    return <DecisionBadge decision={decision.data} />;
  }
  const goNoGo = goNoGoValueSchema.safeParse(entry.value);
  if (goNoGo.success) return <Badge>{t(`common:goNoGo.${goNoGo.data}`)}</Badge>;
  return <Text>{entry.versionName ?? ""}</Text>;
}

/** Where a decision was made: the idea, or the plan and its idea. */
const placeOf = (entry: DecisionLogSummary) =>
  entry.plan === null
    ? entry.idea.name
    : i18n.t("decisions:row.plan", {
        plan: entry.plan.name,
        idea: entry.idea.name,
      });

/**
 * Choosing a period by its dates (design-spec 6.15「期間」): From and To, each optional,
 * both included. To before From says why and is not applied.
 */
function PeriodDialog({
  search,
  onApply,
  onClose,
}: {
  search: DecisionsSearch;
  onApply: (from: string | undefined, to: string | undefined) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["decisions"]);
  const [from, setFrom] = useState<string | null>(search.from ?? null);
  const [to, setTo] = useState<string | null>(search.to ?? null);
  const isOrdered = from === null || to === null || from <= to;
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable
      size="S"
      density="spacious"
      title={t("decisions:periodDialog.title")}
      buttons={
        <ButtonGroup>
          <Button variant="secondary" onPress={onClose}>
            {t("decisions:periodDialog.cancel")}
          </Button>
          <Button
            variant="primary"
            isDisabled={!isOrdered}
            onPress={() => onApply(from ?? undefined, to ?? undefined)}
          >
            {t("decisions:periodDialog.apply")}
          </Button>
        </ButtonGroup>
      }
    >
      <Stack gap="space-300">
        <DatePicker
          label={t("decisions:periodDialog.from")}
          value={from}
          onChange={setFrom}
          width="full"
        />
        <DatePicker
          label={t("decisions:periodDialog.to")}
          value={to}
          onChange={setTo}
          errorMessage={
            isOrdered ? undefined : t("decisions:periodDialog.order")
          }
          width="full"
        />
      </Stack>
    </Dialog>
  );
}

/**
 * The filters (design-spec 6.15「絞り込み」, s06-ideas.html .filters): Kind, Idea, Recorded
 * by and Period, small Pickers with their label inside. A period of the Picker's counts
 * back from today in the user's time zone; Choose dates… sets any From and To.
 */
function Filters({
  search,
  onChange,
}: {
  search: DecisionsSearch;
  onChange: (next: DecisionsSearch) => void;
}) {
  const { t } = useTranslation(["decisions"]);
  const { me, workspace } = useWorkspace();
  const ideas = useQuery(
    ideasQuery(workspace.id, {
      decision: "all",
      includeArchived: true,
      sort: "name",
    }),
  );
  const members = useQuery(membersQuery(workspace.id));
  // Who recorded what the log holds, a former member or a Viewer now among them.
  const everyEntry = useQuery(decisionLogQuery(workspace.id, {}));
  const [isChoosing, setChoosing] = useState(false);
  const all = { id: ALL, label: t("decisions:filter.all") };
  const kinds: DecisionLogKind[] = [
    "validation_decision",
    "go_no_go",
    "version_saved",
  ];
  const recorders = [
    ...new Map(
      [
        ...(members.data?.items ?? [])
          .filter(({ role }) => role !== "viewer")
          .map(({ user }) => user),
        ...(everyEntry.data ?? []).map(({ recordedBy }) => recordedBy),
      ].map(({ id, displayName }) => [id, { id, label: displayName }]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));
  const today = formatIsoDate(new Date(), { timeZone: me.timezone });
  const preset = PERIODS.find(
    (period) =>
      search.to === undefined && search.from === periodStart(period, today),
  );
  const dateText = (date: string) =>
    formatDate(date, { timeZone: me.timezone });
  // A period the Picker does not offer (chosen by dates, or a link's) shows as its dates.
  const chosenPeriod =
    search.from === undefined && search.to === undefined
      ? ALL
      : (preset ?? "chosen");
  const periodItems = [
    { id: ALL, label: t("decisions:filter.anyTime") },
    ...PERIODS.map((id) => ({ id, label: t(`decisions:filter.${id}`) })),
    ...(chosenPeriod === "chosen"
      ? [
          {
            id: "chosen",
            label:
              search.from !== undefined && search.to !== undefined
                ? t("decisions:filter.range", {
                    from: dateText(search.from),
                    to: dateText(search.to),
                  })
                : search.from !== undefined
                  ? t("decisions:filter.since", { from: dateText(search.from) })
                  : t("decisions:filter.until", {
                      to: dateText(search.to ?? today),
                    }),
          },
        ]
      : []),
    { id: "custom", label: t("decisions:filter.custom") },
  ];
  return (
    <>
      <Picker
        label={t("decisions:filter.kind")}
        labelPosition="inside"
        size="S"
        items={[
          all,
          ...kinds.map((id) => ({ id, label: t(`decisions:kind.${id}`) })),
        ]}
        value={search.kind ?? ALL}
        onChange={(value) =>
          onChange({
            ...search,
            kind:
              value === ALL || value === null
                ? undefined
                : (value as DecisionLogKind),
          })
        }
      />
      <Picker
        label={t("decisions:filter.idea")}
        labelPosition="inside"
        size="S"
        items={[
          all,
          ...(ideas.data?.items ?? []).map(({ id, name }) => ({
            id,
            label: name,
          })),
        ]}
        value={search.idea ?? ALL}
        onChange={(value) =>
          onChange({
            ...search,
            idea: value === ALL || value === null ? undefined : value,
          })
        }
      />
      <Picker
        label={t("decisions:filter.recordedBy")}
        labelPosition="inside"
        size="S"
        items={[all, ...recorders]}
        value={search.recordedBy ?? ALL}
        onChange={(value) =>
          onChange({
            ...search,
            recordedBy: value === ALL || value === null ? undefined : value,
          })
        }
      />
      <Picker
        label={t("decisions:filter.period")}
        labelPosition="inside"
        size="S"
        items={periodItems}
        value={chosenPeriod}
        onChange={(value) => {
          if (value === "custom") {
            setChoosing(true);
            return;
          }
          if (value === "chosen" || value === null) return;
          const period = PERIODS.find((id) => id === value);
          onChange({
            ...search,
            from: period === undefined ? undefined : periodStart(period, today),
            to: undefined,
          });
        }}
      />
      {isChoosing && (
        <PeriodDialog
          search={search}
          onApply={(from, to) => {
            setChoosing(false);
            onChange({ ...search, from, to });
          }}
          onClose={() => setChoosing(false)}
        />
      )}
    </>
  );
}

/**
 * What an entry kept when it was recorded (design-spec 6.15「詳細」): a decision's whole
 * reason, the checks missing then, the key numbers and F/A/U, and the way to 13; a Go /
 * No-Go's reason, version, the three conditions, key numbers and the way to its plan's
 * 20; a saved version's name, who saved it and when, and the way to that version on 20.
 */
function EntryDetail({ entryId }: { entryId: string }) {
  const { t } = useTranslation(["decisions", "app"]);
  const { me, workspace } = useWorkspace();
  const query = useQuery(decisionLogEntryQuery(entryId));
  // L2 finds an entry by its id alone: one of another workspace is not this screen's to
  // show (SDD 4章), which its idea, not among this workspace's, tells.
  const ideas = useQuery(
    ideasQuery(workspace.id, {
      decision: "all",
      includeArchived: true,
      sort: "name",
    }),
  );
  const isSlow = useIsSlow(query.isPending || ideas.isPending);
  if (
    query.data !== undefined &&
    ideas.data !== undefined &&
    !ideas.data.items.some(({ id }) => id === query.data.idea.id)
  ) {
    return (
      <NoAccessState
        dashboardHref={dashboardHref(me)}
        headingLevel={2}
        size="S"
      />
    );
  }
  const failed = query.isError ? query : ideas.isError ? ideas : null;
  if (failed !== null) {
    return (
      <FailureState
        error={failed.error}
        onRetry={() => void failed.refetch()}
        dashboardHref={dashboardHref(me)}
        headingLevel={2}
        size="S"
      />
    );
  }
  // Shown once it is known to be this workspace's.
  if (query.data === undefined || ideas.data === undefined) {
    return isSlow ? (
      <SlowLoadingState
        headingLevel={2}
        size="S"
        onRetry={() => {
          void query.refetch();
          void ideas.refetch();
        }}
      />
    ) : (
      <Skeleton isLoading>
        <Stack gap="space-300">
          <Heading level={2}>{t("decisions:title")}</Heading>
          <Text>{t("decisions:empty")}</Text>
        </Stack>
      </Skeleton>
    );
  }
  const entry: DecisionLogEntry = query.data;
  const { snapshot } = entry;
  const when = {
    date: formatDate(entry.recordedAt, { timeZone: me.timezone }),
    time: formatTime(entry.recordedAt, { timeZone: me.timezone }),
  };
  const section = (title: string, content: ReactNode) => (
    <Stack gap="space-100">
      <Heading level={3} variant="label">
        {title}
      </Heading>
      {content}
    </Stack>
  );
  const keyNumbers = section(
    t("decisions:detail.keyNumbers"),
    <DecisionKeyNumbers
      keyMetrics={snapshot.keyMetrics}
      currency={workspace.currency}
      aria-label={t("decisions:detail.keyNumbers")}
    />,
  );
  return (
    <Stack gap="space-400">
      <Stack gap="space-100">
        <Flex gap="space-200" alignItems="center" wrap>
          {entry.kind !== "version_saved" && <ValueBadge entry={entry} />}
          <Text variant="caption" tone="secondary">
            {t(`decisions:kind.${entry.kind}`)}
          </Text>
        </Flex>
        <Heading level={2}>
          {entry.kind === "version_saved"
            ? (entry.versionName ?? "")
            : placeOf(entry)}
        </Heading>
        {entry.kind === "version_saved" && (
          <Text tone="secondary">{placeOf(entry)}</Text>
        )}
        <Text variant="caption" tone="secondary">
          {t(
            entry.kind === "version_saved"
              ? "decisions:detail.savedBy"
              : "decisions:detail.recordedBy",
          )}{" "}
          <UserName user={entry.recordedBy} />
          {t("app:separator")}
          {t("decisions:detail.when", when)}
        </Text>
      </Stack>
      {entry.reason !== null &&
        section(
          t("decisions:detail.reason"),
          <Text variant="body-long">{entry.reason}</Text>,
        )}
      {entry.kind === "validation_decision" && (
        <>
          {section(
            t("decisions:detail.missingChecks"),
            snapshot.missingChecks.length === 0 ? (
              <Text tone="secondary">{t("decisions:detail.allDone")}</Text>
            ) : (
              <MissingCheckRows
                checks={snapshot.missingChecks}
                aria-label={t("decisions:detail.missingChecks")}
              />
            ),
          )}
          {keyNumbers}
          {section(t("decisions:detail.fau"), <FauCounts fau={snapshot.fau} />)}
          <OpenLink
            href={ideaHref(workspace.id, entry.idea.id)}
            label={t("decisions:detail.openValidation")}
          />
        </>
      )}
      {entry.kind === "go_no_go" && (
        <>
          {section(
            t("decisions:detail.version"),
            <Text>
              {snapshot.planVersion?.name ?? t("decisions:detail.noVersion")}
            </Text>,
          )}
          {section(
            t("decisions:detail.conditions"),
            <DescriptionList>
              {(["launchIf", "delayIf", "stopIf"] as const).map((key) => (
                <DescriptionListItem
                  key={key}
                  label={t(`decisions:detail.${key}`)}
                >
                  {snapshot.conditions?.[key] ?? (
                    <Text tone="tertiary">
                      {t("decisions:detail.emptyCondition")}
                    </Text>
                  )}
                </DescriptionListItem>
              ))}
            </DescriptionList>,
          )}
          {keyNumbers}
          {entry.plan !== null && (
            <OpenLink
              href={planHref(workspace.id, entry.idea.id, entry.plan.id)}
              label={t("decisions:detail.openPlan")}
            />
          )}
        </>
      )}
      {entry.kind === "version_saved" &&
        entry.plan !== null &&
        snapshot.planVersion != null && (
          <OpenLink
            href={planHref(workspace.id, entry.idea.id, entry.plan.id, {
              version: snapshot.planVersion.id,
            })}
            label={t("decisions:detail.openVersion")}
          />
        )}
    </Stack>
  );
}

/** "Open … →" at the end of an entry's detail: the screen it was recorded on (6.15). */
function OpenLink({ href, label }: { href: string; label: string }) {
  return (
    <Flex>
      <Link href={href}>
        <Flex gap="space-50" alignItems="center">
          {label}
          <ArrowRight aria-hidden size={14} />
        </Flex>
      </Link>
    </Flex>
  );
}

/** Rows of placeholder words in the shape of the list (design-spec 6.0.6). */
function ListSkeleton() {
  const { t } = useTranslation(["decisions"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {[0, 1, 2].map((row) => (
          <Stack key={row} gap="space-50">
            <Text variant="label">{t("decisions:title")}</Text>
            <Text variant="caption">{t("decisions:empty")}</Text>
          </Stack>
        ))}
      </Stack>
    </Skeleton>
  );
}

/**
 * The list and the entry beside it (design-spec 6.15, 4.1 D): the decisions under the
 * filters, newest first, in a TableView of three columns (where and how it was recorded,
 * its value, its date), the chosen one's record beside them.
 */
function DecisionLogBody({
  search,
  onSearch,
  onOpen,
  onBack,
}: {
  search: DecisionsSearch;
  onSearch: (next: DecisionsSearch) => void;
  onOpen: (next: DecisionsSearch) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation(["decisions"]);
  const { me, workspace } = useWorkspace();
  const isTwoColumns = useTwoColumns();
  const query = useQuery({
    ...decisionLogQuery(workspace.id, {
      kind: search.kind,
      ideaId: search.idea,
      recordedBy: search.recordedBy,
      from: search.from,
      to: search.to,
    }),
    // A new filter keeps the rows until its answer comes, not the skeleton.
    placeholderData: keepPreviousData,
  });
  const isSlow = useIsSlow(query.isPending);
  const items = query.data ?? [];
  const selected =
    items.find(({ id }) => id === search.selected)?.id ??
    // A link to an entry the filters leave out still opens it (19's Last decision).
    search.selected ??
    (isTwoColumns ? items[0]?.id : undefined);
  const columns: TableColumn[] = [
    {
      id: "decision",
      name: t("decisions:column.decision"),
      isRowHeader: true,
    },
    { id: "value", name: t("decisions:column.value"), width: 112 },
    { id: "date", name: t("decisions:column.date"), width: 128 },
  ];

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
  } else if (items.length === 0) {
    list = isFiltered(search) ? (
      <IllustratedMessage
        headingLevel={2}
        size="S"
        icon={<SearchX />}
        heading={t("decisions:emptyFiltered")}
        actions={
          <Button variant="secondary" onPress={() => onSearch({})}>
            {t("decisions:clear")}
          </Button>
        }
      />
    ) : (
      <IllustratedMessage
        headingLevel={2}
        size="S"
        icon={<ScrollText />}
        heading={t("decisions:empty")}
      />
    );
  } else {
    list = (
      <TableView
        aria-label={t("decisions:list")}
        columns={columns}
        items={items}
        selectionMode="single"
        selectedKeys={selected === undefined ? [] : [selected]}
        onSelectionChange={(keys) => {
          const [key] = [...keys];
          if (key === undefined) return;
          const next = { ...search, selected: String(key) };
          if (isTwoColumns) onSearch(next);
          else onOpen(next);
        }}
        textValue={(entry) => placeOf(entry)}
        renderCell={(entry, column) => {
          if (column === "decision") {
            return (
              <Stack gap="space-25">
                <Text variant="label">{placeOf(entry)}</Text>
                <Text variant="caption" tone="secondary">
                  {t("decisions:row.meta", {
                    kind: t(`decisions:kind.${entry.kind}`),
                    name: entry.recordedBy.displayName,
                  })}
                </Text>
                {entry.reasonExcerpt !== null && (
                  <Text variant="caption" tone="secondary" maxLines={2}>
                    {t("decisions:row.reason", {
                      reason: entry.reasonExcerpt,
                    })}
                  </Text>
                )}
              </Stack>
            );
          }
          if (column === "value") return <ValueBadge entry={entry} />;
          return (
            <Stack gap="space-25">
              <Text>
                {formatDate(entry.recordedAt, { timeZone: me.timezone })}
              </Text>
              <Text variant="caption" tone="secondary">
                {formatTime(entry.recordedAt, { timeZone: me.timezone })}
              </Text>
            </Stack>
          );
        }}
      />
    );
  }

  return (
    <ListDetailPattern
      header={
        <Heading level={1} variant="heading-1-list">
          {t("decisions:title")}
        </Heading>
      }
      filters={
        <Filters
          search={search}
          // Other filters choose again among what they list: the first one beside it.
          onChange={(next) => onSearch({ ...next, selected: undefined })}
        />
      }
      list={list}
      detail={
        selected === undefined ? null : <EntryDetail entryId={selected} />
      }
      listLabel={t("decisions:title")}
      onBack={onBack}
    />
  );
}

/** 7's shape while its route loads (design-spec 6.0.6). */
export function DecisionLogSkeleton() {
  const { t } = useTranslation(["decisions"]);
  return (
    <ListDetailPattern
      header={
        <Heading level={1} variant="heading-1-list">
          {t("decisions:title")}
        </Heading>
      }
      list={<ListSkeleton />}
      detail={null}
      listLabel={t("decisions:title")}
      onBack={() => {}}
    />
  );
}

/**
 * 7 Decision Log (design-spec 6.15): pattern D. The workspace's decisions, Go / No-Go and
 * saved versions, newest first, filtered by kind, idea, who recorded and period, the
 * chosen one's record beside them. Entries are only added: nothing here changes them. A
 * More screen: its phone header reads "← More".
 */
export function DecisionLogScreen({ search }: { search: DecisionsSearch }) {
  const { t } = useTranslation(["decisions"]);
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();
  useDocumentTitle(t("decisions:title"), workspace.name);
  const openedHere = useRouterState({
    select: (state) => state.location.state.openedDetail === true,
  });
  const to = (next: DecisionsSearch, replace: boolean) =>
    void navigate({
      href: decisionsHref(workspace.id, next),
      replace,
      state: (previous) =>
        replace ? previous : { ...previous, openedDetail: true },
    });
  return (
    <WorkspaceFrame
      current="decisions"
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb>{t("decisions:title")}</Breadcrumb>
        </Breadcrumbs>
      }
    >
      <DecisionLogBody
        search={search}
        // Filters and what is beside the list replace the entry: Back leaves the screen.
        onSearch={(next) => to(next, true)}
        onOpen={(next) => to(next, false)}
        onBack={() => {
          if (openedHere) router.history.back();
          else to({ ...search, selected: undefined }, true);
        }}
      />
    </WorkspaceFrame>
  );
}
