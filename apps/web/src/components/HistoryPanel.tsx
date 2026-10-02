import { formatDate, formatInputNumber, formatRelativeTime } from "@moonx/i18n";
import type { HistoryEntry } from "@moonx/schemas";
import {
  ActionButton,
  Avatar,
  Badge,
  Button,
  DiffText,
  Flex,
  IllustratedMessage,
  InlineAlert,
  Panel,
  Skeleton,
  Stack,
  Text,
} from "@moonx/ui-web";
import { useInfiniteQuery } from "@tanstack/react-query";
import { History, WifiOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isApiError } from "../lib/api-error";
import { errorText } from "../lib/error-text";
import { BATCH_UNDOABLE_SOURCES, historyQuery, useRevertMutations } from "../lib/history";
import { changedFields } from "../lib/history-fields";
import type { PanelTarget } from "../lib/panel-target";
import { useMe } from "../lib/session";
import { diffText } from "../lib/text-diff";
import { toasts } from "../lib/toast";

/** Fields whose value is one of a fixed set of snake_case names rather than free text. */
const ENUM_FIELDS = new Set([
  "fau",
  "confidence",
  "type",
  "category",
  "inputMode",
  "status",
  "probability",
  "impact",
  "launchTiming",
  "sourceType",
]);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function SourceLabel({ source }: { source: HistoryEntry["source"] }) {
  const { t } = useTranslation("panels");
  switch (source) {
    case "manual":
      return t("history.source.manual");
    case "ai_import":
      return t("history.source.ai_import");
    case "revert":
      return t("history.source.revert");
    case "template_migration":
      return t("history.source.template_migration");
    case "duplicate":
      return t("history.source.duplicate");
    case "plan_draft":
      return t("history.source.plan_draft");
  }
}

function ActionLabel({ action }: { action: HistoryEntry["action"] }) {
  const { t } = useTranslation("panels");
  switch (action) {
    case "create":
      return t("history.action.create");
    case "update":
      return t("history.action.update");
    case "delete":
      return t("history.action.delete");
    case "restore":
      return t("history.action.restore");
  }
}

/** One value of a snapshot as the text a person reads; null for a value that is not there. */
function useValueText() {
  const { t } = useTranslation("panels");
  const me = useMe();
  return (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return t("history.blank");
    if (field === "evidence" && Array.isArray(value)) {
      return t("history.evidenceCount", { count: value.length });
    }
    if (typeof value === "boolean") return value ? t("history.yes") : t("history.no");
    if (typeof value === "number") return formatInputNumber(value);
    if (Array.isArray(value))
      return value.length === 0 ? t("history.blank") : value.map(String).join(", ");
    if (typeof value === "string") {
      if (DATE_ONLY.test(value)) return formatDate(value, me.timezone);
      return ENUM_FIELDS.has(field) ? t(`history.values.${value}`, { defaultValue: value }) : value;
    }
    return JSON.stringify(value);
  };
}

function FieldChangeView({
  field,
  before,
  after,
  action,
}: {
  field: string;
  before: unknown;
  after: unknown;
  action: HistoryEntry["action"];
}) {
  const { t } = useTranslation("panels");
  const text = useValueText();
  const label = t(`history.fields.${field}`);
  const beforeText = text(field, before);
  const afterText = text(field, after);
  const showBefore = action !== "create";
  const showAfter = action !== "delete";
  const textual = typeof before === "string" || typeof after === "string";
  const isBlank = (value: unknown) => value === null || value === undefined || value === "";
  // A side with nothing on it has no characters to match, so the other side is marked whole.
  const wholesale = action === "create" || action === "delete" || isBlank(before) || isBlank(after);
  const segments = !textual
    ? null
    : wholesale
      ? [
          { kind: "removed" as const, text: beforeText },
          { kind: "added" as const, text: afterText },
        ]
      : diffText(beforeText, afterText);
  return (
    <Stack gap="space-25">
      <Text variant="label">{label}</Text>
      {showBefore ? (
        <Flex gap="space-100" align="baseline">
          <Text variant="caption" tone="secondary" as="span">
            {t("history.before")}
          </Text>
          {segments ? (
            <DiffText segments={segments} side="before" />
          ) : (
            <Text variant="body-sm" as="span">
              {beforeText}
            </Text>
          )}
        </Flex>
      ) : null}
      {showAfter ? (
        <Flex gap="space-100" align="baseline">
          <Text variant="caption" tone="secondary" as="span">
            {t("history.after")}
          </Text>
          {segments ? (
            <DiffText segments={segments} side="after" />
          ) : (
            <Text variant="body-sm" as="span">
              {afterText}
            </Text>
          )}
        </Flex>
      ) : null}
    </Stack>
  );
}

function EntryView({
  entry,
  now,
  showUndoBatch,
  pendingId,
  onRestore,
  onUndoBatch,
}: {
  entry: HistoryEntry;
  now: Date;
  /** The first row of a run from one operation carries the button that undoes it. */
  showUndoBatch: boolean;
  pendingId: string | null;
  onRestore: (entry: HistoryEntry) => void;
  onUndoBatch: (batchId: string) => void;
}) {
  const { t, i18n } = useTranslation("panels");
  const me = useMe();
  // Only the fields the catalog names are shown; the rest of a snapshot is internal.
  const changes = changedFields(entry).filter((change) =>
    i18n.exists(`history.fields.${change.field}`, { ns: "panels" }),
  );
  const busy = pendingId !== null;
  // A template update moves only as a whole (H3): its row carries no restore of its own.
  const restorable = entry.target.type !== "template_version";
  return (
    <Stack gap="space-100">
      <Flex gap="space-100" align="center" wrap>
        <Avatar name={entry.changedBy.displayName} src={entry.changedBy.avatarUrl} size="S" />
        <Text variant="label" as="span">
          {entry.changedBy.displayName}
        </Text>
        <Text variant="caption" tone="secondary" as="span">
          {formatRelativeTime(entry.changedAt, now, me.timezone)}
        </Text>
      </Flex>
      <Flex gap="space-100" align="center" wrap>
        <Text variant="body-sm" as="span">
          {entry.label}
        </Text>
        <Badge size="S">
          <ActionLabel action={entry.action} />
        </Badge>
        <Badge size="S" variant="informative">
          <SourceLabel source={entry.source} />
        </Badge>
      </Flex>
      {changes.map((change) => (
        <FieldChangeView
          key={change.field}
          field={change.field}
          before={change.before}
          after={change.after}
          action={entry.action}
        />
      ))}
      {entry.revertible ? (
        <Flex gap="space-100" wrap>
          {restorable ? (
            <Button
              size="S"
              variant="secondary"
              isDisabled={busy}
              isPending={pendingId === entry.id}
              pendingLabel={t("history.restoring")}
              onPress={() => onRestore(entry)}
            >
              {entry.action === "delete" ? t("history.undoDelete") : t("history.restore")}
            </Button>
          ) : null}
          {showUndoBatch && entry.batchId ? (
            <ActionButton
              size="S"
              isDisabled={busy}
              onPress={() => onUndoBatch(entry.batchId as string)}
            >
              {t("history.undoBatch")}
            </ActionButton>
          ) : null}
        </Flex>
      ) : null}
    </Stack>
  );
}

/**
 * PNL-2 (design-spec 6.0.5): the changes of one item or of a whole screen, newest first, with
 * "Restore this version" and "Undo delete" per entry and "Undo the whole operation" for an AI
 * import, a template migration or a revert. `revertible` comes from the API, which withholds it
 * from Viewers and from archived ideas and plans, so no button is drawn for them.
 */
export function HistoryPanel({ target, onClose }: { target: PanelTarget; onClose: () => void }) {
  const { t } = useTranslation("panels");
  const query = useInfiniteQuery(historyQuery(target));
  const revert = useRevertMutations();
  const [error, setError] = useState<unknown>(null);
  const pendingId = revert.entry.isPending
    ? (revert.entry.variables ?? null)
    : revert.batch.isPending
      ? (revert.batch.variables ?? null)
      : null;

  const entries = query.data?.pages.flatMap((page) => page.items) ?? [];
  const now = new Date();

  const restore = (entry: HistoryEntry) => {
    setError(null);
    revert.entry.mutate(entry.id, {
      onSuccess: () => toasts.add({ title: t("history.restored"), variant: "positive" }),
      onError: setError,
    });
  };
  const undoBatch = (batchId: string) => {
    setError(null);
    revert.batch.mutate(batchId, {
      onSuccess: () => toasts.add({ title: t("history.undone"), variant: "positive" }),
      onError: setError,
    });
  };

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <Stack gap="space-100">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </Stack>
    );
  } else if (query.isError) {
    body = (
      <IllustratedMessage
        icon={WifiOff}
        heading={t("history.loadError")}
        actions={<Button onPress={() => void query.refetch()}>{t("history.retry")}</Button>}
      >
        {errorText(t, query.error)}
      </IllustratedMessage>
    );
  } else if (entries.length === 0) {
    body = <IllustratedMessage icon={History} heading={t("history.empty")} headingLevel={3} />;
  } else {
    body = (
      <Stack gap="space-300">
        {error ? (
          <InlineAlert variant="negative" heading={t("history.revertFailed")}>
            {isApiError(error) && error.code === "CONFLICT"
              ? t("history.alreadyUndone")
              : errorText(t, error)}
          </InlineAlert>
        ) : null}
        {entries.map((entry, index) => (
          <EntryView
            key={entry.id}
            entry={entry}
            now={now}
            showUndoBatch={
              entry.batchId !== null &&
              BATCH_UNDOABLE_SOURCES.includes(entry.source) &&
              entries[index - 1]?.batchId !== entry.batchId
            }
            pendingId={pendingId}
            onRestore={restore}
            onUndoBatch={undoBatch}
          />
        ))}
        {query.hasNextPage ? (
          <Button
            variant="secondary"
            isPending={query.isFetchingNextPage}
            pendingLabel={t("history.loadingMore")}
            onPress={() => void query.fetchNextPage()}
          >
            {t("history.loadMore")}
          </Button>
        ) : null}
      </Stack>
    );
  }

  return (
    <Panel
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("history.title")}
      closeLabel={t("app:close")}
    >
      <div aria-busy={query.isPending}>{body}</div>
    </Panel>
  );
}
