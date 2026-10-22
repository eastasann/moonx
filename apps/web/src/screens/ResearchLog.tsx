import { formatDate, formatIsoDate, formatList } from "@moonx/i18n";
import {
  type ResearchLogEntry,
  type SupportsCheck,
  sourceTypeSchema,
  supportsCheckSchema,
  type ValidationHome,
} from "@moonx/schemas";
import {
  ActionMenu,
  AlertDialog,
  Breadcrumb,
  Breadcrumbs,
  Button,
  ButtonGroup,
  CommentCount,
  DescriptionList,
  DescriptionListItem,
  Dialog,
  Flex,
  Heading,
  IllustratedMessage,
  Link,
  ListDetailPattern,
  ListView,
  ListViewItem,
  MenuItem,
  Picker,
  RowList,
  RowListItem,
  Skeleton,
  Stack,
  TagGroup,
  Text,
  useIsNarrow,
  useTwoColumns,
} from "@moonx/ui-web";
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { NotebookPen, SearchX } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ArchivedIdeaAlert } from "../components/ArchivedIdeaAlert";
import {
  ItemCommentsButton,
  type ScreenComments,
} from "../components/CommentsPanel";
import { ItemHistoryButton } from "../components/HistoryPanel";
import { toastFailure } from "../components/ideaActions";
import { useKeepShownItem } from "../components/keepShownItem";
import {
  inputOf,
  isValid,
  newValues,
  type ResearchLogField,
  ResearchLogFields,
  type ResearchLogValues,
  researchFieldError,
  valuesOf,
  wireValue,
} from "../components/ResearchLogFields";
import { SaveFailureNote } from "../components/SaveFeedback";
import { SectionTitle } from "../components/SectionTitle";
import { SendFailure } from "../components/SendFailure";
import {
  FailureState,
  NoAccessState,
  NotFoundState,
  SlowLoadingState,
  useIsSlow,
} from "../components/states";
import { UserName } from "../components/UserName";
import { WorkspaceFrame } from "../components/WorkspaceFrame";
import { dashboardHref, usePanel, useWorkspace } from "../components/workspace";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import type { SaveFields, SaveTarget } from "../lib/autosave";
import { useAutosave, useSaveItem } from "../lib/autosave-react";
import { useOneAtATime } from "../lib/form";
import { rowLabel } from "../lib/item-labels";
import {
  hrefOf,
  ideaHref,
  ideasHref,
  type ResearchSearch,
  researchHref,
} from "../lib/links";
import { useIsOnline } from "../lib/online";
import {
  ideaKey,
  type ResearchFilters,
  researchLogEntryQuery,
  researchLogKey,
  researchLogQuery,
  validationHomeQuery,
} from "../lib/queries";
import { useDocumentTitle } from "../lib/title";

export type { ResearchSearch };

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** 14's entry or new entry was opened over the list in one pane: leaving goes back. */
    openedDetail?: boolean;
  }
}

/** The Picker value of "no filter". */
const ALL = "all";

/** The page's save of an entry (design-spec 6.0.2's item "1つの行"). */
const entryKey = (entryId: string) => `research_log_entry:${entryId}`;

/** What an entry's fields were before a save of theirs (db history-values researchLogContent). */
const entryValueSchema = z.object({
  observedOn: z.string().nullable(),
  topic: z.string(),
  observation: z.string().nullable(),
  sourceType: sourceTypeSchema.nullable(),
  sourceUrl: z.string().nullable(),
  supportsChecks: z.array(supportsCheckSchema),
  supportsNote: z.string().nullable(),
});

/** Puts an entry, as saved, in the entry's data and in every list that holds it. */
function putEntry(
  queryClient: QueryClient,
  ideaId: string,
  entry: Partial<ResearchLogEntry> & { id: string },
) {
  queryClient.setQueryData(
    researchLogEntryQuery(ideaId, entry.id).queryKey,
    (current) => (current === undefined ? undefined : { ...current, ...entry }),
  );
  queryClient.setQueriesData<ResearchLogEntry[]>(
    { queryKey: [...researchLogKey(ideaId), "list"] },
    (list) =>
      list?.map((current) =>
        current.id === entry.id ? { ...current, ...entry } : current,
      ),
  );
}

/** The save of an entry's fields (V7 PATCH). */
function entryTarget(
  queryClient: QueryClient,
  ideaId: string,
  entryId: string,
  noun: string,
): SaveTarget {
  return {
    key: entryKey(entryId),
    noun,
    send: async (fields: SaveFields, lockVersion, force) => {
      const entry = await unwrap(
        api()
          .api.v1["research-log"]({ entryId: inPath(entryId) })
          .patch({ ...fields, lockVersion, ...(force ? { force } : {}) }),
      );
      putEntry(queryClient, ideaId, entry);
      // 13's checks count the tags; 11 lists the entry's date and topic.
      void queryClient.invalidateQueries({
        queryKey: ideaKey(ideaId),
        refetchType: "none",
      });
      return entry.lockVersion;
    },
    loadTheirs: (current) => {
      const value = entryValueSchema.safeParse(current.value);
      if (value.success) {
        putEntry(queryClient, ideaId, {
          id: entryId,
          ...value.data,
          lockVersion: current.lockVersion,
          updatedAt: current.updatedAt,
          updatedBy: current.updatedBy,
        });
      }
      void queryClient.invalidateQueries({ queryKey: researchLogKey(ideaId) });
    },
  };
}

/** A field whose change is a choice, saved when made (6.0.2). */
const isChoice = (field: ResearchLogField) =>
  field === "observedOn" ||
  field === "sourceType" ||
  field === "supportsChecks";

/** A saved value back in its field's form: none is blank. */
function fieldValue(
  field: ResearchLogField,
  value: unknown,
): ResearchLogValues[ResearchLogField] {
  if (field === "observedOn" || field === "sourceType") {
    return (value ?? null) as string | null as never;
  }
  if (field === "supportsChecks") return (value ?? []) as SupportsCheck[];
  return (value ?? "") as string;
}

/**
 * An entry's fields, saved as they are typed (design-spec 6.0.2, an item per row): a
 * field that breaks its rule (6.0.8: Topic cannot be empty, a URL must be one) is not
 * sent and says why under it. Read only offline.
 */
function EntryEditor({
  ideaId,
  entry,
  autoFocus = false,
}: {
  ideaId: string;
  entry: ResearchLogEntry;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation(["validation", "errors"]);
  const queryClient = useQueryClient();
  const autosave = useAutosave();
  const isOnline = useIsOnline();
  const target = entryTarget(
    queryClient,
    ideaId,
    entry.id,
    t("validation:research.noun"),
  );
  const saving = useSaveItem(target.key);
  const [invalid, setInvalid] = useState<
    Partial<Record<ResearchLogField, ResearchLogValues[ResearchLogField]>>
  >({});
  // Leaving the entry any way sends what waits (6.0.2「画面を離れるとき」).
  useEffect(
    () => () => autosave.flush(entryKey(entry.id)),
    [autosave, entry.id],
  );

  const saved = valuesOf(entry);
  const values = Object.fromEntries(
    (Object.keys(saved) as ResearchLogField[]).map((field) => [
      field,
      Object.hasOwn(invalid, field)
        ? invalid[field]
        : saving !== undefined && Object.hasOwn(saving.unsaved, field)
          ? fieldValue(field, saving.unsaved[field])
          : saved[field],
    ]),
  ) as unknown as ResearchLogValues;

  // The API's last guard (SDD 8.2): a 422 naming a field puts its reason under it.
  const failure = saving?.status === "rejected" ? saving.failure : null;
  const refused = (field: ResearchLogField) => {
    const details = failure?.detail.details;
    return failure?.code === "VALIDATION_FAILED" &&
      Array.isArray(details) &&
      details.some((detail) => (detail as { path?: unknown }).path === field)
      ? t("errors:input.format")
      : undefined;
  };
  const errors = Object.fromEntries(
    (Object.keys(saved) as ResearchLogField[]).flatMap((field) => {
      const error = Object.hasOwn(invalid, field)
        ? researchFieldError(field, invalid[field] as never)
        : refused(field);
      return error === undefined ? [] : [[field, error]];
    }),
  );

  return (
    <Stack gap="space-300">
      <ResearchLogFields
        values={values}
        errors={errors}
        isReadOnly={!isOnline}
        autoFocus={autoFocus}
        onChange={(field, value) => {
          if (researchFieldError(field, value) === undefined) {
            setInvalid(({ [field]: _, ...rest }) => rest);
            autosave.change(target, entry.lockVersion, {
              [field]: wireValue(field, value),
            });
            if (isChoice(field)) autosave.flush(target.key);
          } else {
            setInvalid((fields) => ({ ...fields, [field]: value }));
            autosave.discard(target.key, [field]);
          }
        }}
        onBlur={() => autosave.flush(target.key)}
      />
      <SaveFailureNote itemKey={target.key} />
    </Stack>
  );
}

/** An entry's fields to read (a Viewer, an archived idea, a phone's detail). */
function EntryFacts({ entry }: { entry: ResearchLogEntry }) {
  const { t } = useTranslation(["validation", "common"]);
  const { me } = useWorkspace();
  const empty = (
    <Text tone="secondary">{t("validation:home.summary.empty")}</Text>
  );
  const text = (value: string | null) => value ?? empty;
  return (
    <DescriptionList>
      <DescriptionListItem label={t("validation:research.field.date")}>
        {entry.observedOn === null
          ? empty
          : formatDate(entry.observedOn, { timeZone: me.timezone })}
      </DescriptionListItem>
      <DescriptionListItem label={t("validation:research.field.observation")}>
        {text(entry.observation)}
      </DescriptionListItem>
      <DescriptionListItem label={t("validation:research.field.sourceType")}>
        {entry.sourceType === null
          ? empty
          : t(`common:sourceType.${entry.sourceType}`)}
      </DescriptionListItem>
      <DescriptionListItem label={t("validation:research.field.sourceUrl")}>
        {entry.sourceUrl === null ? (
          empty
        ) : (
          <Link
            href={entry.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {entry.sourceUrl}
          </Link>
        )}
      </DescriptionListItem>
      <DescriptionListItem label={t("validation:research.field.supports")}>
        {entry.supportsChecks.length === 0 ? (
          empty
        ) : (
          <TagGroup
            aria-label={t("validation:research.field.supports")}
            size="S"
            items={entry.supportsChecks.map((check) => ({
              id: check,
              label: t(`common:supportsCheck.${check}`),
            }))}
          />
        )}
      </DescriptionListItem>
      <DescriptionListItem label={t("validation:research.field.supportsNote")}>
        {text(entry.supportsNote)}
      </DescriptionListItem>
    </DescriptionList>
  );
}

/** Deleted, here or already elsewhere (V7 answers 404 for a deleted entry). */
const isGone = (error: Error | null) =>
  error === null || (error instanceof ApiError && error.code === "NOT_FOUND");

/**
 * The question before an entry is deleted (design-spec 6.0.3・6.10): what cites it, the
 * answers a template update hid by number, and that the history can bring it back.
 */
function DeleteEntryQuestion({
  usages,
  hiddenCount,
  onDelete,
  onClose,
}: {
  usages: { label: string; isOnlyEvidenceOfFact: boolean }[];
  hiddenCount: number;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["validation"]);
  return (
    <AlertDialog
      isOpen
      variant="destructive"
      size="S"
      title={t("validation:research.deleteTitle")}
      primaryActionLabel={t("validation:research.delete")}
      cancelLabel={t("validation:research.cancel")}
      autoFocusButton="cancel"
      onPrimaryAction={() => {
        onClose();
        onDelete();
      }}
      onCancel={onClose}
    >
      <Stack gap="space-200">
        {usages.length > 0 && (
          <Stack gap="space-100">
            <Text>{t("validation:research.deleteUsages")}</Text>
            <RowList aria-label={t("validation:research.used")}>
              {usages.map((usage) => (
                <RowListItem key={usage.label}>
                  {usage.isOnlyEvidenceOfFact
                    ? t("validation:research.onlyEvidence", {
                        label: usage.label,
                      })
                    : usage.label}
                </RowListItem>
              ))}
            </RowList>
          </Stack>
        )}
        {hiddenCount > 0 && (
          <Text>
            {t("validation:research.hiddenUsages", { count: hiddenCount })}
          </Text>
        )}
        <Text>{t("validation:research.deleteBody")}</Text>
      </Stack>
    </AlertDialog>
  );
}

/**
 * The selected entry (design-spec 6.10): its topic, who recorded it, its fields (to edit
 * here from the tablet breakpoint up, in a sheet on a phone) and the items that use it as
 * evidence. ⋯ deletes it.
 */
function EntryDetail({
  ideaId,
  validationId,
  entryId,
  listed,
  canEdit,
  onDeleted,
}: {
  ideaId: string;
  validationId: string;
  entryId: string;
  /** The entry as the list holds it, shown while its own data loads. */
  listed: ResearchLogEntry | undefined;
  canEdit: boolean;
  /** The entry was deleted while it was still shown. */
  onDeleted: () => void;
}) {
  const { t } = useTranslation(["validation", "app"]);
  const { me } = useWorkspace();
  const queryClient = useQueryClient();
  const panel = usePanel();
  const isPhone = useIsNarrow();
  const query = useQuery(researchLogEntryQuery(ideaId, entryId));
  const [isEditing, setEditing] = useState(false);
  const [isDeleting, setDeleting] = useState(false);
  const latestOnDeleted = useRef(onDeleted);
  latestOnDeleted.current = onDeleted;
  const remove = useMutation({
    mutationFn: () =>
      unwrap(
        api()
          .api.v1["research-log"]({ entryId: inPath(entryId) })
          .delete({}),
      ),
    onSettled: (_data, error) => {
      // The facts citing it changed (6.0.3), wherever the user is by now.
      if (isGone(error)) {
        // Out of the lists at once: the first entry, shown beside them when none is
        // chosen, must not be the deleted one while they load again.
        queryClient.setQueriesData<ResearchLogEntry[]>(
          { queryKey: [...researchLogKey(ideaId), "list"] },
          (list) => list?.filter(({ id }) => id !== entryId),
        );
        // Nor shown from the cache again (Forward to it): it is asked for, and is gone.
        queryClient.removeQueries({
          queryKey: researchLogEntryQuery(ideaId, entryId).queryKey,
          exact: true,
        });
        void queryClient.invalidateQueries({ queryKey: ideaKey(ideaId) });
      } else {
        toastFailure(error, deleteEntry);
      }
    },
  });
  function deleteEntry() {
    remove.mutate(undefined, {
      // Fires only while this entry is still shown: a user who moved on meanwhile is
      // not taken back to 14.
      onSettled: (_data, error) => {
        if (isGone(error)) latestOnDeleted.current();
      },
    });
  }
  const entry = query.data ?? listed;
  // V7 finds an entry by its id alone: another idea's is not this screen's to show. A
  // deleted one answers 404, over anything still cached of it.
  if (
    (query.data !== undefined && query.data.validationId !== validationId) ||
    (query.error instanceof ApiError && query.error.code === "NOT_FOUND")
  ) {
    return (
      <NotFoundState
        dashboardHref={dashboardHref(me)}
        headingLevel={2}
        size="S"
      />
    );
  }
  if (entry === undefined) {
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
    return (
      <Skeleton isLoading>
        <Stack gap="space-300">
          <Heading level={2}>{t("validation:research.title")}</Heading>
          <Text>{t("validation:research.empty")}</Text>
        </Stack>
      </Skeleton>
    );
  }
  const usages = query.data?.usages ?? [];
  const entryItem = {
    kind: "item",
    item: { type: "research_log_entry", id: entry.id, key: null },
  } as const;
  return (
    <Stack gap="space-400">
      <Stack gap="space-50">
        <Flex justifyContent="space-between" alignItems="start" gap="space-200">
          <Heading level={2}>{entry.topic}</Heading>
          <Flex gap="space-50" alignItems="center">
            <ItemCommentsButton
              label={rowLabel("research_log_entry", entry.topic)}
              count={entry.commentCount}
              onPress={() => panel.show("comments", entryItem)}
            />
            <ItemHistoryButton
              label={rowLabel("research_log_entry", entry.topic)}
              onPress={() => panel.show("history", entryItem)}
            />
            {canEdit && (
              <ActionMenu
                aria-label={t("validation:research.more", {
                  topic: entry.topic,
                })}
                onAction={(key) => {
                  if (key === "delete") setDeleting(true);
                }}
                isDisabled={query.data === undefined}
              >
                <MenuItem id="delete">
                  {t("validation:research.delete")}
                </MenuItem>
              </ActionMenu>
            )}
          </Flex>
        </Flex>
        <Text variant="caption" tone="secondary">
          {t("validation:research.recordedBy")}
          <UserName user={entry.createdBy} />
        </Text>
      </Stack>
      {canEdit && !isPhone ? (
        <EntryEditor ideaId={ideaId} entry={entry} />
      ) : (
        <Stack gap="space-200">
          <EntryFacts entry={entry} />
          {canEdit && (
            <Flex>
              <Button variant="secondary" onPress={() => setEditing(true)}>
                {t("validation:research.edit")}
              </Button>
            </Flex>
          )}
        </Stack>
      )}
      <Stack gap="space-100">
        <Heading level={3} variant="label">
          {t("validation:research.used")}
        </Heading>
        {query.data === undefined ? (
          <Skeleton isLoading>
            <Text>{t("validation:research.notUsed")}</Text>
          </Skeleton>
        ) : usages.length === 0 ? (
          <Text tone="secondary" elementType="p">
            {t("validation:research.notUsed")}
          </Text>
        ) : (
          <RowList aria-label={t("validation:research.used")}>
            {usages.map((usage) => (
              <RowListItem
                key={`${usage.target.type}:${usage.target.id}:${usage.target.key ?? ""}`}
                href={hrefOf(usage.link)}
              >
                {usage.label}
              </RowListItem>
            ))}
          </RowList>
        )}
      </Stack>
      {isEditing && canEdit && (
        <Dialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setEditing(false);
          }}
          isDismissable
          size="M"
          title={t("validation:research.editTitle")}
        >
          <EntryEditor ideaId={ideaId} entry={entry} autoFocus />
        </Dialog>
      )}
      {isDeleting && query.data !== undefined && (
        <DeleteEntryQuestion
          usages={query.data.usages}
          hiddenCount={query.data.hiddenUsageCount}
          onDelete={deleteEntry}
          onClose={() => setDeleting(false)}
        />
      )}
    </Stack>
  );
}

/**
 * A new entry (design-spec 6.10「+ Add entry」): the fields, the date today and the tags
 * the link asked for (SDD 4章 `presetSupports`), then Add entry, which records it and
 * shows it. In the detail's place from the tablet breakpoint up, in a sheet on a phone.
 */
function NewEntry({
  ideaId,
  validationId,
  presetSupports,
  isSheet,
  onCreated,
  onCancel,
}: {
  ideaId: string;
  validationId: string;
  presetSupports: readonly SupportsCheck[];
  isSheet: boolean;
  onCreated: (entry: ResearchLogEntry) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["validation", "errors"]);
  const { me } = useWorkspace();
  const queryClient = useQueryClient();
  const isOnline = useIsOnline();
  const [values, setValues] = useState(() =>
    newValues(
      formatIsoDate(new Date(), { timeZone: me.timezone }),
      presetSupports,
    ),
  );
  // A field's reason shows once it changed, not when it is left: a reason appearing as
  // focus leaves for Cancel would move Cancel from under the press.
  const [touched, setTouched] = useState<
    Partial<Record<ResearchLogField, boolean>>
  >({});
  const latestOnCreated = useRef(onCreated);
  latestOnCreated.current = onCreated;
  const oneAtATime = useOneAtATime();
  const create = useMutation({
    mutationFn: (input: ResearchLogValues) =>
      unwrap(
        api()
          .api.v1.validations({ validationId: inPath(validationId) })
          ["research-log"].post(inputOf(input)),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ideaKey(ideaId) }),
  });
  // A 422 naming a field (SDD 8.2's last guard) puts "Check the format" under it; one
  // naming none says it beside Couldn't save.
  const failure = create.error;
  const details =
    failure instanceof ApiError && failure.code === "VALIDATION_FAILED"
      ? failure.detail.details
      : undefined;
  const refusedFields = (Object.keys(values) as ResearchLogField[]).filter(
    (field) =>
      Array.isArray(details) &&
      (details as { path?: unknown }[]).some(({ path }) => path === field),
  );
  const errors = Object.fromEntries(
    (Object.keys(values) as ResearchLogField[]).flatMap((field) => {
      const error =
        touched[field] === true
          ? researchFieldError(field, values[field])
          : undefined;
      const refused = refusedFields.includes(field)
        ? t("errors:input.format")
        : undefined;
      const shown = error ?? refused;
      return shown === undefined ? [] : [[field, shown]];
    }),
  );
  const submit = () =>
    void oneAtATime(
      () =>
        new Promise<void>((resolve) => {
          create.mutate(values, {
            // Fires only while the form is still open: Cancel or leaving meanwhile keeps
            // the user where they went (the entry is made all the same).
            onSuccess: (entry) => latestOnCreated.current(entry),
            // A failure shows from the mutation's state below.
            onSettled: () => resolve(),
          });
        }),
    );
  // Not disabled while it is on its way: Add entry keeps its focus, and `oneAtATime`
  // sends once.
  const canSubmit = isOnline && isValid(values);
  const fields = (
    <Stack gap="space-300">
      <ResearchLogFields
        values={values}
        errors={errors}
        isReadOnly={!isOnline}
        autoFocus
        onChange={(field, value) => {
          if (refusedFields.includes(field)) create.reset();
          setValues((current) => ({ ...current, [field]: value }));
          setTouched((current) => ({ ...current, [field]: true }));
        }}
      />
      {failure !== null && refusedFields.length === 0 && (
        <SendFailure
          error={failure}
          transient="couldNotSave"
          withSaveReasons
          onRetry={submit}
          isRetryDisabled={!canSubmit}
        />
      )}
    </Stack>
  );
  const buttons = (
    <ButtonGroup align="end">
      <Button variant="secondary" onPress={onCancel}>
        {t("validation:research.cancel")}
      </Button>
      <Button
        variant="primary"
        onPress={submit}
        isDisabled={!canSubmit}
        isPending={create.isPending}
      >
        {t("validation:research.add")}
      </Button>
    </ButtonGroup>
  );
  if (isSheet) {
    return (
      <Dialog
        isOpen
        onOpenChange={(isOpen) => {
          if (!isOpen) onCancel();
        }}
        size="M"
        title={t("validation:research.newTitle")}
        buttons={buttons}
      >
        {fields}
      </Dialog>
    );
  }
  return (
    <Stack gap="space-400">
      <Heading level={2}>{t("validation:research.newTitle")}</Heading>
      {fields}
      {buttons}
    </Stack>
  );
}

/** The filters (design-spec 6.10): by the check an entry supports and its source type. */
function Filters({
  search,
  onChange,
}: {
  search: ResearchSearch;
  onChange: (next: ResearchSearch) => void;
}) {
  const { t } = useTranslation(["validation", "common"]);
  const all = { id: ALL, label: t("validation:research.filter.all") };
  return (
    <>
      <Picker
        label={t("validation:research.filter.supports")}
        labelPosition="inside"
        size="S"
        items={[
          all,
          ...supportsCheckSchema.options.map((id) => ({
            id,
            label: t(`common:supportsCheck.${id}`),
          })),
        ]}
        value={search.supports ?? ALL}
        onChange={(value) =>
          onChange({
            ...search,
            supports:
              value === null || value === ALL
                ? undefined
                : supportsCheckSchema.parse(value),
          })
        }
      />
      <Picker
        label={t("validation:research.filter.source")}
        labelPosition="inside"
        size="S"
        items={[
          all,
          ...sourceTypeSchema.options.map((id) => ({
            id,
            label: t(`common:sourceType.${id}`),
          })),
        ]}
        value={search.source ?? ALL}
        onChange={(value) =>
          onChange({
            ...search,
            source:
              value === null || value === ALL
                ? undefined
                : sourceTypeSchema.parse(value),
          })
        }
      />
    </>
  );
}

/** An entry's row: its topic, then its date, source and the checks it supports. */
function EntryRow({ entry }: { entry: ResearchLogEntry }) {
  const { t } = useTranslation(["validation", "common", "app"]);
  const { me } = useWorkspace();
  const meta = [
    entry.observedOn === null
      ? t("validation:research.noDate")
      : formatDate(entry.observedOn, { timeZone: me.timezone }),
    ...(entry.sourceType === null
      ? []
      : [t(`common:sourceType.${entry.sourceType}`)]),
    ...(entry.supportsChecks.length === 0
      ? []
      : [
          formatList(
            entry.supportsChecks.map((check) =>
              t(`common:supportsCheck.${check}`),
            ),
          ),
        ]),
  ].join(t("app:separator"));
  return (
    <Stack gap="space-50">
      <Text variant="label">{entry.topic}</Text>
      <Text variant="caption" tone="secondary">
        {meta}
      </Text>
      {(entry.usedAsEvidenceCount > 0 || entry.commentCount > 0) && (
        <Flex gap="space-200" alignItems="center">
          {entry.usedAsEvidenceCount > 0 && (
            <Text variant="caption" tone="secondary">
              {t("validation:research.usedCount", {
                count: entry.usedAsEvidenceCount,
              })}
            </Text>
          )}
          <Text variant="caption" tone="secondary">
            <CommentCount count={entry.commentCount} />
          </Text>
        </Flex>
      )}
    </Stack>
  );
}

function ListSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <Skeleton isLoading>
      <Stack gap="space-300">
        {[0, 1, 2].map((row) => (
          <Stack key={row} gap="space-50">
            <Text variant="label">{t("validation:research.title")}</Text>
            <Text variant="caption">{t("validation:research.empty")}</Text>
          </Stack>
        ))}
      </Stack>
    </Skeleton>
  );
}

function ResearchBody({
  home,
  search,
  onSearch,
  onOpen,
  onClose,
}: {
  home: ValidationHome;
  search: ResearchSearch;
  /** Replaces the URL's search: filters, and what is beside the list. */
  onSearch: (next: ResearchSearch) => void;
  /** Shows an entry or a new one in place of the list (one pane): Back returns to it. */
  onOpen: (next: ResearchSearch) => void;
  /** Leaves what `onOpen` showed for `next`, going back if it was opened here. */
  onClose: (next: ResearchSearch) => void;
}) {
  const { t } = useTranslation(["validation"]);
  const { me, role } = useWorkspace();
  const isTwoColumns = useTwoColumns();
  const { idea, validationId } = home;
  const canEdit = role !== "viewer" && !idea.archived;
  const filters: ResearchFilters = {
    supports: search.supports,
    sourceType: search.source,
  };
  const query = useQuery({
    ...researchLogQuery(idea.id, validationId, filters),
    // A new filter keeps the rows until its answer comes, not the skeleton.
    placeholderData: keepPreviousData,
  });
  const isSlow = useIsSlow(query.isPending);
  const items = query.data ?? [];
  const isFiltered =
    search.supports !== undefined || search.source !== undefined;
  const isNew = search.new === 1 && canEdit;
  const isPhone = useIsNarrow();
  const shownFirst =
    search.entry === undefined && isTwoColumns && !isNew
      ? items[0]?.id
      : undefined;
  const kept = useKeepShownItem(
    isTwoColumns,
    shownFirst,
    search.entry,
    (entry) => onSearch({ ...search, entry }),
  );
  const selected = search.entry ?? shownFirst ?? kept;
  const openNew = () => {
    const next = {
      ...search,
      entry: undefined,
      new: 1 as const,
      presetSupports: [],
    };
    // Beside the list it takes the detail's place, as a chosen entry does.
    if (isTwoColumns) onSearch(next);
    else onOpen(next);
  };
  const closeNew = () =>
    onClose({ ...search, new: undefined, presetSupports: undefined });

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
    list = isFiltered ? (
      <IllustratedMessage
        headingLevel={2}
        size="S"
        icon={<SearchX />}
        heading={t("validation:research.emptyFiltered")}
        actions={
          <Button
            variant="secondary"
            onPress={() =>
              onSearch({ ...search, supports: undefined, source: undefined })
            }
          >
            {t("validation:research.filter.clear")}
          </Button>
        }
      />
    ) : (
      <IllustratedMessage
        headingLevel={2}
        size="S"
        icon={<NotebookPen />}
        heading={t("validation:research.empty")}
        actions={
          canEdit ? (
            <Button variant="primary" onPress={openNew}>
              {t("validation:research.add")}
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    list = (
      <ListView
        aria-label={t("validation:research.title")}
        items={items}
        selectionMode="single"
        selectedKeys={selected === undefined || isNew ? [] : [selected]}
        dependencies={[me.timezone]}
        // Pressing the chosen entry again keeps it: the detail never goes blank.
        onSelectionChange={(keys) => {
          const [key] = [...keys];
          if (key === undefined) return;
          const next = {
            ...search,
            entry: String(key),
            new: undefined,
            presetSupports: undefined,
          };
          if (isTwoColumns) onSearch(next);
          else onOpen(next);
        }}
      >
        {(entry) => (
          <ListViewItem id={entry.id} textValue={entry.topic}>
            <EntryRow entry={entry} />
          </ListViewItem>
        )}
      </ListView>
    );
  }

  const newEntry = (isSheet: boolean) => (
    <NewEntry
      // Another link's tags start another form.
      key={(search.presetSupports ?? []).join(",")}
      ideaId={idea.id}
      validationId={validationId}
      presetSupports={search.presetSupports ?? []}
      isSheet={isSheet}
      onCreated={(entry) =>
        onSearch({
          ...search,
          entry: entry.id,
          new: undefined,
          presetSupports: undefined,
        })
      }
      onCancel={closeNew}
    />
  );
  const detail =
    isNew && !isPhone ? (
      newEntry(false)
    ) : selected === undefined ? null : (
      <EntryDetail
        key={selected}
        ideaId={idea.id}
        validationId={validationId}
        entryId={selected}
        listed={items.find(({ id }) => id === selected)}
        canEdit={canEdit}
        onDeleted={() => onClose({ ...search, entry: undefined })}
      />
    );

  return (
    <>
      <ListDetailPattern
        header={
          <Stack gap="space-200">
            {idea.archived && <ArchivedIdeaAlert ideaId={idea.id} />}
            <SectionTitle
              ideaId={idea.id}
              sections={home.sections}
              title={
                home.sections.find(({ key }) => key === "03")?.title ??
                t("validation:research.title")
              }
              variant="heading-1-list"
            />
          </Stack>
        }
        newItem={
          canEdit
            ? { label: t("validation:research.add"), onPress: openNew }
            : undefined
        }
        filters={<Filters search={search} onChange={onSearch} />}
        list={list}
        detail={detail}
        listLabel={t("validation:research.title")}
        onBack={() =>
          onClose({
            ...search,
            entry: undefined,
            new: undefined,
            presetSupports: undefined,
          })
        }
      />
      {isNew && isPhone && newEntry(true)}
    </>
  );
}

/** 14's shape while its route loads (design-spec 6.0.6). */
export function ResearchLogSkeleton() {
  const { t } = useTranslation(["validation"]);
  return (
    <ListDetailPattern
      header={
        <Heading level={1} variant="heading-1-list">
          {t("validation:research.title")}
        </Heading>
      }
      list={<ListSkeleton />}
      detail={null}
      listLabel={t("validation:research.title")}
      onBack={() => {}}
    />
  );
}

/**
 * 14 Research log (design-spec 6.10): pattern D. The idea's entries, newest observation
 * first, filtered by the check they support and their source; the selected one beside
 * them with the items it is evidence for; a new entry from + Add entry or a link with
 * `new=1` (6.1's checks, 11's Log research). Viewers and archived ideas read only.
 */
export function ResearchLogScreen({
  ideaId,
  search,
}: {
  ideaId: string;
  search: ResearchSearch;
}) {
  const { t } = useTranslation(["ideas", "validation"]);
  const { me, workspace } = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();
  const panel = usePanel();
  const home = useQuery(validationHomeQuery(ideaId));
  const isSlow = useIsSlow(home.isPending);
  const data =
    home.data?.idea.workspaceId === workspace.id ? home.data : undefined;
  const title = data?.sections.find(({ key }) => key === "03")?.title;
  // Every entry, whatever the filters show: the panel lists the threads of them all.
  const entries = useQuery({
    ...researchLogQuery(ideaId, data?.validationId ?? "", {}),
    enabled: data !== undefined,
  });
  const entryOf = (entryId: string) =>
    entries.data?.find(({ id }) => id === entryId);
  const comments: ScreenComments | undefined =
    data === undefined
      ? undefined
      : {
          screen: {
            containerType: "validation",
            containerId: data.validationId,
            sectionKeys: ["research_log"],
          },
          idea: {
            id: ideaId,
            name: data.idea.name,
            archived: data.idea.archived,
          },
          dataKey: ideaKey(ideaId),
          shows: (item) =>
            item.type === "research_log_entry" &&
            item.key == null &&
            (entries.data === undefined || entryOf(item.id) !== undefined),
          labelOf: (target) => {
            if (target.type === "idea") return data.idea.name;
            const entry = entryOf(target.id);
            return entry === undefined
              ? undefined
              : rowLabel("research_log_entry", entry.topic);
          },
        };
  useDocumentTitle(
    ...(data === undefined || title === undefined
      ? []
      : [title, workspace.name]),
  );
  const openedHere = useRouterState({
    select: (state) => state.location.state.openedDetail === true,
  });
  const to = (next: ResearchSearch, replace: boolean) =>
    void navigate({
      href: panel.keep(researchHref(workspace.id, ideaId, next)),
      replace,
      // Replacing keeps how the entry was reached: a new entry made in a pushed form
      // still goes back to the list.
      state: (previous) =>
        replace ? previous : { ...previous, openedDetail: true },
    });

  let body: ReactNode;
  if (home.data !== undefined && data === undefined) {
    // Another workspace's idea under this one's URL (SDD 4章).
    body = <NoAccessState dashboardHref={dashboardHref(me)} />;
  } else if (data !== undefined) {
    body = (
      <ResearchBody
        home={data}
        search={search}
        // Filters and what is beside the list replace the entry: Back leaves the screen.
        onSearch={(next) => to(next, true)}
        onOpen={(next) => to(next, false)}
        onClose={(next) => {
          if (openedHere) router.history.back();
          else to(next, true);
        }}
      />
    );
  } else if (home.isError) {
    body = (
      <FailureState
        error={home.error}
        onRetry={() => void home.refetch()}
        dashboardHref={dashboardHref(me)}
      />
    );
  } else if (isSlow) {
    body = <SlowLoadingState onRetry={() => void home.refetch()} />;
  } else {
    body = <ResearchLogSkeleton />;
  }
  return (
    <WorkspaceFrame
      current="ideas"
      saveScope="research_log_entry:"
      comments={comments}
      history={comments}
      back={{
        label: t("validation:questions.back"),
        href: ideaHref(workspace.id, ideaId),
      }}
      breadcrumbs={
        <Breadcrumbs>
          <Breadcrumb href={ideasHref(workspace.id)}>
            {t("ideas:title")}
          </Breadcrumb>
          {data !== undefined && (
            <Breadcrumb href={ideaHref(workspace.id, ideaId)}>
              {data.idea.name}
            </Breadcrumb>
          )}
          {title !== undefined && <Breadcrumb>{title}</Breadcrumb>}
        </Breadcrumbs>
      }
    >
      {body}
    </WorkspaceFrame>
  );
}
