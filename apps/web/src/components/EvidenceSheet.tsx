import { formatIsoDate } from "@moonx/i18n";
import {
  type Classification,
  type ConflictCurrent,
  conflictCurrentSchema,
  type Evidence,
  type FauState,
  shortTextSchema,
  urlSchema,
} from "@moonx/schemas";
import {
  AlertDialog,
  Button,
  ButtonGroup,
  Checkbox,
  CheckboxGroup,
  Dialog,
  Flex,
  Heading,
  InlineAlert,
  SearchField,
  SegmentedControl,
  SegmentedControlItem,
  Skeleton,
  Stack,
  TagGroup,
  Text,
  TextField,
} from "@moonx/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, api, inPath, unwrap } from "../lib/api";
import {
  type Autosave,
  rejectionReason,
  type SaveStatus,
} from "../lib/autosave";
import { useAutosave, useSaveItem } from "../lib/autosave-react";
import {
  countingEvidence,
  evidenceLabel,
  researchLogLabel,
} from "../lib/evidence";
import { inputIssueMessage } from "../lib/input-issues";
import { useIsOnline } from "../lib/online";
import { researchLogKey, researchLogQuery } from "../lib/queries";
import { isTransient } from "../lib/query";
import {
  inputOf,
  isValid,
  newValues,
  type ResearchLogField,
  ResearchLogFields,
  type ResearchLogValues,
  researchFieldError,
} from "./ResearchLogFields";
import { ConflictAlert, SaveFailureNote } from "./SaveFeedback";
import { rateLimitWords } from "./SendFailure";
import { FailureState, reportOnce } from "./states";
import { useWorkspace } from "./workspace";

/** The items M2 attaches evidence to (SDD 5.7 V4). */
export type EvidenceTargetType =
  | "validation_answer"
  | "economics_input"
  | "cost_item"
  | "competitor"
  | "assumption";

/** M2's item as the screen that opens it holds it. */
export interface EvidenceItem {
  target: { type: EvidenceTargetType; id: string; key: string | null };
  /** What it is about, as M2 heads it: "01 WHO · Who is the primary paying customer?". */
  label: string;
  /** What the conflict question and the last evidence's question call it: "answer". */
  noun: string;
  /** Its evidence in the order attached, links to deleted research logs included. */
  evidence: readonly Evidence[];
  /** Its F/A/U state. */
  state: FauState;
  /** Whether it has a value: only an item with one can become a Fact (6.0.3). */
  hasValue: boolean;
}

/** V4 or V5's answer: the item's evidence, F/A/U and version as they now stand. */
export interface EvidenceResult {
  classification: Classification;
  lockVersion: number;
}

/** One change M2 sends. */
type Change =
  | { kind: "attach"; researchLogEntryId: string }
  | { kind: "new"; values: ResearchLogValues }
  | { kind: "url"; url: string; note: string }
  | { kind: "remove"; evidenceId: string };

/** Where M2 adds evidence from (design-spec 6.0.3). */
type Source = "log" | "new" | "url";

/**
 * The item's own save failed and holds its input (6.0.2: sent again by itself, refused,
 * someone else's first, or a lost session): evidence sent now would take the version that
 * save still has to use, and the save would then meet the user's own change as a conflict.
 */
const isHeld = (status: SaveStatus | undefined) =>
  status === "retrying" ||
  status === "rejected" ||
  status === "conflict" ||
  status === "signedOut";

/** The item's own save failed before a change of M2 went out: the change waits for it. */
class HeldSaveError extends Error {}

/**
 * How long one change of M2 may take, its wait for the item's own save included. Cloud
 * Run answers within 60 seconds (SDD ADR-007), so a change still open after this lost the
 * network: it then fails as the network does ("Couldn't save" and Retry), and M2, held
 * open while a change is on its way, lets the user go.
 */
const SEND_LIMIT_MS = 70_000;

/** Rejects as the network does once `signal` aborts. */
const onAbort = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    const fail = () =>
      reject(
        new ApiError({
          status: null,
          code: null,
          requestId: null,
          cause: signal.reason,
        }),
      );
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });

/** Whether two new entries' fields hold the same. */
const sameEntry = (a: ResearchLogValues, b: ResearchLogValues) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Resolves once the item's own save is neither waiting nor on its way, sending what waits
 * first: an item's sends go one at a time, so evidence goes out on the version that save
 * leaves (ADR-019) instead of meeting it as someone else's. Rejects with HeldSaveError
 * when that save failed instead.
 */
function settled(autosave: Autosave, key: string): Promise<void> {
  autosave.flush(key);
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const check = () => {
      const status = autosave.getState().items.get(key)?.status;
      if (status === "waiting" || status === "saving") return;
      unsubscribe();
      if (isHeld(status)) reject(new HeldSaveError());
      else resolve();
    };
    unsubscribe = autosave.subscribe(check);
    check();
  });
}

/**
 * How a failed change shows (design-spec 6.0.6 の「モーダルの共通の決まり」, 6.0.2): the
 * network or an API that is down as "Couldn't save" with Retry; a refusal for good with
 * its reason (6.0.2's words); a rate limit with its wait; a lost session by M9 or the
 * sign-in screen, as any request (router.tsx); anything else as unexpected, with its Ref.
 */
function failureKind(
  error: unknown,
):
  | "none"
  | "transient"
  | "rejected"
  | "rateLimited"
  | "signedOut"
  | "unexpected" {
  // The item's own failed save shows instead (SaveFailureNote, the conflict question, M9).
  if (error === null || error instanceof HeldSaveError) return "none";
  if (!(error instanceof ApiError)) return "unexpected";
  if (isTransient(error)) return "transient";
  if (error.status === 401) return "signedOut";
  if (error.code === "RATE_LIMITED") return "rateLimited";
  return rejectionReason(error) === null ? "unexpected" : "rejected";
}

/** What a change drops if Load theirs is chosen: the text typed for it, or nothing. */
function typedOf(change: Change): string | null {
  if (change.kind === "new") {
    return [
      change.values.topic,
      change.values.observation,
      change.values.sourceUrl,
      change.values.supportsNote,
    ]
      .filter((text) => text.trim() !== "")
      .join("\n\n");
  }
  if (change.kind === "url") {
    return [change.url, change.note].filter((text) => text !== "").join("\n\n");
  }
  return null;
}

export interface EvidenceSheetProps {
  ideaId: string;
  validationId: string;
  item: EvidenceItem;
  /**
   * The item's version as the screen's data holds it now: read when a change goes out,
   * after the item's own save settled, which may have raised it since this rendered.
   */
  lockVersionNow: () => number;
  /** The page's save of the item (`SaveTarget.key`), settled before each change. */
  saveKey: string;
  /** M2 was opened by the Fact button: what it attaches makes the item a Fact (6.0.3). */
  forFact: boolean;
  /** A change went through: the screen puts the item's evidence and version in its data. */
  onChanged: (result: EvidenceResult) => void;
  /**
   * Done, opened by Fact, on an item that already had evidence: the screen saves it as a
   * Fact (V3 takes Fact once evidence counts). None for a row without F/A/U (15's, 16's),
   * which Fact never opens M2 for.
   */
  onMarkFact?: () => void;
  /** Someone saved the item first and the user loads theirs: the screen reads it again. */
  onReload: () => void;
  onClose: () => void;
}

/**
 * M2 Evidence (design-spec 3.8・6.0.3): a large dialog, a full sheet on a phone. What it
 * is about, the evidence attached (× removes one; the last of a Fact asks first), and
 * three ways to add: research log entries of this idea to tick, a new entry made and
 * attached at once (also kept in 14), or a URL with a note. Each change is sent as it is
 * made, as choices save when made (6.0.2). Opened by Fact, what it attaches makes the item
 * a Fact; closed with none, the item stays as it was.
 */
export function EvidenceSheet({
  ideaId,
  validationId,
  item,
  lockVersionNow,
  saveKey,
  forFact,
  onChanged,
  onMarkFact,
  onReload,
  onClose,
}: EvidenceSheetProps) {
  const { t } = useTranslation(["validation", "app", "errors"]);
  const { me } = useWorkspace();
  const queryClient = useQueryClient();
  const autosave = useAutosave();
  const isOnline = useIsOnline();
  const [source, setSource] = useState<Source>("log");
  const [search, setSearch] = useState("");
  const today = formatIsoDate(new Date(), { timeZone: me.timezone });
  const [entry, setEntry] = useState(() => newValues(today));
  // A field's reason shows once it changed (as 14's new entry).
  const [entryTouched, setEntryTouched] = useState<
    Partial<Record<ResearchLogField, boolean>>
  >({});
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [conflict, setConflict] = useState<{
    change: Change;
    current: ConflictCurrent;
  } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const log = useQuery(researchLogQuery(ideaId, validationId, {}));
  const ownSave = useSaveItem(saveKey);
  const isOwnSaveHeld = isHeld(ownSave?.status);
  // Once what was typed went out and the fields emptied, they start again with focus on
  // the first (the button pressed is disabled then); switching the source drops it.
  const [round, setRound] = useState(0);
  const [isRefocusing, setRefocusing] = useState(false);
  const refocus = () => {
    setRound((count) => count + 1);
    setRefocusing(true);
  };
  // The fields as they are now, for a send's answer and Retry, which come later.
  const latest = useRef({ entry, url, note });
  latest.current = { entry, url, note };

  const isFact = item.state === "fact" || item.state === "fact_no_evidence";
  const counted = countingEvidence(item.evidence);
  // Opened by Fact (kept in the history entry, so Forward can bring it back after the
  // answer was cleared): only an item with a value becomes a Fact.
  const makesFact = forFact && !isFact && item.hasValue;

  const send = useMutation({
    mutationFn: async ({
      change,
      force,
      lockVersion,
    }: {
      change: Change;
      force: boolean;
      lockVersion?: number;
    }): Promise<EvidenceResult> => {
      const signal = AbortSignal.timeout(SEND_LIMIT_MS);
      await Promise.race([settled(autosave, saveKey), onAbort(signal)]);
      const version = lockVersion ?? lockVersionNow();
      if (change.kind === "remove") {
        return unwrap(
          api()
            .api.v1.evidence({ evidenceId: inPath(change.evidenceId) })
            .delete(
              {},
              {
                query: {
                  lockVersion: version,
                  ...(force ? { force: true } : {}),
                },
                fetch: { signal },
              },
            ),
        );
      }
      const body = {
        target: item.target,
        lockVersion: version,
        ...(force ? { force: true } : {}),
        ...(makesFact ? { setFact: true } : {}),
        ...(change.kind === "attach"
          ? { researchLogEntryId: change.researchLogEntryId }
          : change.kind === "new"
            ? { newResearchLog: inputOf(change.values) }
            : {
                url: change.url,
                ...(change.note.trim() === "" ? {} : { note: change.note }),
              }),
      };
      const result = await unwrap(
        api()
          .api.v1.validations({ validationId: inPath(validationId) })
          .evidence.post(body, { fetch: { signal } }),
      );
      return {
        classification: result.classification,
        lockVersion: result.lockVersion,
      };
    },
    onSuccess: (result, { change }) => {
      onChanged(result);
      setConflict(null);
      // What was typed meanwhile stays: the fields empty only if they still hold what
      // went out.
      if (
        change.kind === "new" &&
        sameEntry(latest.current.entry, change.values)
      ) {
        setEntry(newValues(today));
        setEntryTouched({});
        refocus();
      } else if (
        change.kind === "url" &&
        latest.current.url === change.url &&
        latest.current.note === change.note
      ) {
        setUrl("");
        setNote("");
        refocus();
      }
      // The entries' "Used as evidence" counts changed; a new entry joins the lists.
      void queryClient.invalidateQueries({ queryKey: researchLogKey(ideaId) });
    },
    onError: (error, { change }) => {
      if (!(error instanceof ApiError)) return;
      if (error.code === "CONFLICT") {
        const current = conflictCurrentSchema.safeParse(error.detail.current);
        if (current.success) {
          send.reset();
          setConflict({ change, current: current.data });
        }
      } else if (error.code === "NOT_FOUND" && change.kind === "remove") {
        // Removed already (in another tab, by someone else): read it as it is.
        send.reset();
        onReload();
      }
    },
  });

  // Not disabled while a change is on its way: the control pressed keeps its focus, and
  // `run` takes one change at a time.
  const canSend = isOnline && !isOwnSaveHeld;

  // While a change is on its way M2 stays open (Done, ×, Esc, a tap outside and Back
  // alike): its failure or conflict shows here, and the answer's own save cannot go out
  // on the version this change is about to raise.
  useBlocker({
    shouldBlockFn: () => true,
    disabled: !send.isPending,
    enableBeforeUnload: false,
  });

  /** Sends one change at a time; a press while one is on its way does nothing. */
  const run = (change: Change) => {
    if (!send.isPending && canSend) send.mutate({ change, force: false });
  };

  /** Whether removing `evidence` turns the Fact Unclassified: nothing that counts is left. */
  const leavesFactEmpty = (evidence: Evidence) =>
    isFact &&
    counted.filter((counting) => counting.id !== evidence.id).length === 0;

  const remove = (evidenceId: string) => {
    // One change at a time: the last evidence's question waits too.
    if (send.isPending) return;
    const evidence = item.evidence.find(({ id }) => id === evidenceId);
    if (evidence === undefined) return;
    if (leavesFactEmpty(evidence)) setAsking(evidenceId);
    else run({ kind: "remove", evidenceId });
  };

  const attachedLogs = item.evidence.flatMap((evidence) =>
    evidence.researchLog === null ? [] : [evidence.researchLog.id],
  );
  const pickLogs = (ids: string[]) => {
    const added = ids.find((id) => !attachedLogs.includes(id));
    if (added !== undefined) {
      run({ kind: "attach", researchLogEntryId: added });
      return;
    }
    const removed = attachedLogs.find((id) => !ids.includes(id));
    const evidence = item.evidence.find(
      (candidate) => candidate.researchLog?.id === removed,
    );
    if (evidence !== undefined) remove(evidence.id);
  };

  // A 422 naming a field (SDD 8.2's last guard) puts "Check the format" under it too
  // (6.0.2); a change to the fields asks the API again.
  const refusedPaths =
    send.error instanceof ApiError &&
    send.error.code === "VALIDATION_FAILED" &&
    Array.isArray(send.error.detail.details)
      ? (send.error.detail.details as { path?: unknown }[]).map(
          ({ path }) => path,
        )
      : [];
  const refused = (path: string) =>
    refusedPaths.includes(path) ? t("errors:input.format") : undefined;
  const clearRefusal = () => {
    if (refusedPaths.length > 0) send.reset();
  };
  const entryErrors = Object.fromEntries(
    (Object.keys(entry) as ResearchLogField[]).flatMap((field) => {
      const error =
        entryTouched[field] === true
          ? researchFieldError(field, entry[field])
          : undefined;
      const shown = error ?? refused(`newResearchLog.${field}`);
      return shown === undefined ? [] : [[field, shown]];
    }),
  );
  const [urlIssue] = urlSchema.safeParse(url).error?.issues ?? [];
  const [noteIssue] = shortTextSchema.safeParse(note).error?.issues ?? [];

  const failure = send.error;
  const kind = failureKind(failure);
  const rateLimited = rateLimitWords(failure);
  const reason =
    kind === "rejected" && failure instanceof ApiError
      ? t(`app:save.reason.${rejectionReason(failure) ?? "format"}`)
      : null;
  const isUnexpected = kind === "unexpected";
  // The API's request id, or the Sentry event of the Web's own failure (SDD 8.2).
  const reference = useMemo(
    () =>
      !isUnexpected
        ? null
        : failure instanceof ApiError
          ? failure.requestId
          : reportOnce(failure),
    [isUnexpected, failure],
  );
  // A retry sends the fields as they are now: they must keep their rules, as for Add.
  const lastKind = send.variables?.change.kind;
  const canRetry =
    canSend &&
    (lastKind === "new"
      ? isValid(entry)
      : lastKind === "url"
        ? urlIssue === undefined && noteIssue === undefined
        : true);
  // The same send again, an overwrite's `force` and version included, with what the
  // fields hold now (6.0.6: the input stays, and may have been corrected).
  const retry = () => {
    const last = send.variables;
    if (last === undefined) return;
    const { change } = last;
    send.mutate({
      ...last,
      change:
        change.kind === "new"
          ? { kind: "new", values: entry }
          : change.kind === "url"
            ? { kind: "url", url, note }
            : change,
    });
  };

  const done = () => {
    // Fact pressed on an item that had evidence already: nothing new to attach.
    if (makesFact && counted.length > 0) onMarkFact?.();
    onClose();
  };

  const query = search.trim().toLowerCase();
  const entries = (log.data ?? []).filter(
    (candidate) =>
      query === "" ||
      candidate.topic.toLowerCase().includes(query) ||
      (candidate.observation ?? "").toLowerCase().includes(query),
  );

  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen && !send.isPending) onClose();
      }}
      isDismissable
      size="L"
      density="spacious"
      title={t("validation:evidence.title")}
      buttons={
        <ButtonGroup align="end">
          <Button variant="primary" onPress={done} isPending={send.isPending}>
            {t("validation:evidence.done")}
          </Button>
        </ButtonGroup>
      }
    >
      <Stack gap="space-400">
        <Text tone="secondary">{item.label}</Text>
        {saveKey !== undefined && <SaveFailureNote itemKey={saveKey} />}
        <Stack gap="space-100">
          <Heading level={3} variant="label">
            {t("validation:evidence.attached")}
          </Heading>
          <TagGroup
            aria-label={t("validation:evidence.attached")}
            items={item.evidence.map((evidence) => ({
              id: evidence.id,
              label: evidenceLabel(evidence, me.timezone),
              ...(evidence.researchLog?.deleted === true
                ? { suffix: t("validation:evidence.deleted") }
                : {}),
            }))}
            onRemove={
              canSend
                ? (ids) => {
                    const [id] = [...ids];
                    if (id !== undefined) remove(id);
                  }
                : undefined
            }
            // Text inside the tag list would take its slots; the words stand alone.
            renderEmptyState={() => t("validation:evidence.none")}
          />
        </Stack>
        <Stack gap="space-300">
          <SegmentedControl
            aria-label={t("validation:evidence.sourceLabel")}
            selectedKey={source}
            onSelectionChange={(key) => {
              setRefocusing(false);
              setSource(key as Source);
            }}
          >
            <SegmentedControlItem id="log">
              {t("validation:evidence.source.log")}
            </SegmentedControlItem>
            <SegmentedControlItem id="new">
              {t("validation:evidence.source.new")}
            </SegmentedControlItem>
            <SegmentedControlItem id="url">
              {t("validation:evidence.source.url")}
            </SegmentedControlItem>
          </SegmentedControl>
          {source === "log" &&
            (log.isError ? (
              <FailureState
                error={log.error}
                onRetry={() => void log.refetch()}
                headingLevel={3}
                size="S"
              />
            ) : log.data === undefined ? (
              <Skeleton isLoading>
                <Stack gap="space-100">
                  <Text>{t("validation:evidence.source.log")}</Text>
                  <Text>{t("validation:evidence.source.log")}</Text>
                </Stack>
              </Skeleton>
            ) : log.data.length === 0 ? (
              <Text tone="secondary" elementType="p">
                {t("validation:evidence.noLog")}
              </Text>
            ) : (
              <Stack gap="space-200">
                <SearchField
                  aria-label={t("validation:evidence.search")}
                  placeholder={t("validation:evidence.search")}
                  value={search}
                  onChange={setSearch}
                  width="full"
                />
                {entries.length === 0 ? (
                  <Text tone="secondary" elementType="p">
                    {t("validation:evidence.noMatch")}
                  </Text>
                ) : (
                  <CheckboxGroup
                    aria-label={t("validation:evidence.logList")}
                    value={attachedLogs}
                    onChange={pickLogs}
                    isDisabled={!canSend}
                  >
                    {entries.map((candidate) => (
                      <Checkbox key={candidate.id} value={candidate.id}>
                        {researchLogLabel(candidate, me.timezone)}
                      </Checkbox>
                    ))}
                  </CheckboxGroup>
                )}
              </Stack>
            ))}
          {source === "new" && (
            <Stack gap="space-300">
              <ResearchLogFields
                key={round}
                values={entry}
                errors={entryErrors}
                onChange={(field, value) => {
                  clearRefusal();
                  setEntry((values) => ({ ...values, [field]: value }));
                  setEntryTouched((touched) => ({ ...touched, [field]: true }));
                }}
                isReadOnly={!isOnline}
                autoFocus={isRefocusing}
              />
              <Flex>
                <Button
                  variant="secondary"
                  onPress={() => run({ kind: "new", values: entry })}
                  isDisabled={!canSend || !isValid(entry)}
                  isPending={
                    send.isPending && send.variables?.change.kind === "new"
                  }
                >
                  {t("validation:evidence.addNew")}
                </Button>
              </Flex>
            </Stack>
          )}
          {source === "url" && (
            <Stack gap="space-300">
              <TextField
                key={round}
                label={t("validation:evidence.url")}
                type="url"
                inputMode="url"
                isRequired
                value={url}
                onChange={(value) => {
                  clearRefusal();
                  setUrl(value);
                }}
                errorMessage={
                  url !== "" && urlIssue !== undefined
                    ? inputIssueMessage(urlIssue)
                    : refused("url")
                }
                isReadOnly={!isOnline}
                autoFocus={isRefocusing}
                width="full"
              />
              <TextField
                label={t("validation:evidence.note")}
                value={note}
                onChange={(value) => {
                  clearRefusal();
                  setNote(value);
                }}
                errorMessage={
                  noteIssue === undefined
                    ? refused("note")
                    : inputIssueMessage(noteIssue)
                }
                isReadOnly={!isOnline}
                width="full"
              />
              <Flex>
                <Button
                  variant="secondary"
                  onPress={() => run({ kind: "url", url, note })}
                  isDisabled={
                    !canSend ||
                    urlIssue !== undefined ||
                    noteIssue !== undefined
                  }
                  isPending={
                    send.isPending && send.variables?.change.kind === "url"
                  }
                >
                  {t("validation:evidence.addUrl")}
                </Button>
              </Flex>
            </Stack>
          )}
        </Stack>
        {(kind === "transient" ||
          kind === "rejected" ||
          kind === "rateLimited") && (
          <InlineAlert variant="negative">
            <Flex gap="space-200" wrap alignItems="center">
              <Text>{rateLimited ?? t("app:state.couldNotSave")}</Text>
              {reason !== null && <Text tone="secondary">{reason}</Text>}
              {rateLimited === null && (
                <Button
                  variant="secondary"
                  size="S"
                  onPress={retry}
                  isDisabled={!canRetry}
                >
                  {t("app:state.retry")}
                </Button>
              )}
            </Flex>
          </InlineAlert>
        )}
      </Stack>
      {isUnexpected && (
        <AlertDialog
          isOpen
          variant="error"
          size="S"
          title={t("app:state.unexpected")}
          primaryActionLabel={t("app:state.retry")}
          cancelLabel={t("app:state.close")}
          onPrimaryAction={retry}
          isPrimaryActionDisabled={!canRetry}
          onCancel={onClose}
        >
          {reference === null
            ? ""
            : t("app:state.ref", { ref: reference.slice(0, 8) })}
        </AlertDialog>
      )}
      {asking !== null && (
        <AlertDialog
          isOpen
          variant="destructive"
          size="S"
          title={t("validation:evidence.lastTitle")}
          primaryActionLabel={t("validation:evidence.remove")}
          cancelLabel={t("validation:evidence.cancel")}
          autoFocusButton="cancel"
          onPrimaryAction={() => {
            const evidenceId = asking;
            setAsking(null);
            run({ kind: "remove", evidenceId });
          }}
          onCancel={() => setAsking(null)}
        >
          {t("validation:evidence.lastBody", { noun: item.noun })}
        </AlertDialog>
      )}
      {conflict !== null && (
        <ConflictAlert
          noun={item.noun}
          current={conflict.current}
          input={typedOf(conflict.change)}
          onOverwrite={() => {
            const { change, current } = conflict;
            setConflict(null);
            send.mutate({
              change,
              force: true,
              lockVersion: current.lockVersion,
            });
          }}
          onLoadTheirs={() => {
            const { change } = conflict;
            setConflict(null);
            if (change.kind === "new") {
              setEntry(newValues(today));
              setEntryTouched({});
            } else if (change.kind === "url") {
              setUrl("");
              setNote("");
            }
            onReload();
          }}
        />
      )}
    </Dialog>
  );
}
