import { formatInputNumber, formatInputPercent } from "@moonx/i18n";
import type { CostItem } from "@moonx/schemas";
import { Button, InlineAlert, Stack, Text } from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { type MutableRefObject, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ConflictDialog } from "../../components/ConflictDialog";
import { EvidenceSheet } from "../../components/EvidenceSheet";
import type { FauChange } from "../../components/FauControl";
import { autosave } from "../../lib/autosave";
import {
  amountProblem,
  type CostDraft,
  type CostsData,
  costsKey,
  draftOfItem,
  draftValue,
  nameProblem,
  percentProblem,
  withNumber,
} from "../../lib/costs";
import { errorText } from "../../lib/error-text";
import { readNumberText, readPercentText } from "../../lib/number-input";
import { useOverlay } from "../../lib/overlay";
import { formatItemTarget } from "../../lib/panel-target";
import { withChoice } from "../../lib/questions";
import { useSavedItem } from "../../lib/use-saved-item";

/** What the cells of one row can do. Every method changes what the row shows and queues the save. */
export interface RowApi {
  setName: (text: string) => void;
  setAmountText: (text: string) => void;
  setPercentText: (text: string) => void;
  setMode: (mode: CostItem["inputMode"]) => void;
  setLumpSum: (value: boolean) => void;
  setWhyNeeded: (text: string) => void;
  setCanReduce: (value: CostItem["canReduce"]) => void;
  setNotes: (text: string) => void;
  choose: (change: FauChange) => void;
  openEvidence: () => void;
  /** Sends what is waiting (the person left the field). */
  flush: () => Promise<void>;
}

export type RowRegistry = MutableRefObject<Map<string, RowApi>>;

/**
 * The cells of a row call the row's controller through the registry, because a table renders its
 * cells as separate nodes and the one saved item of the row has to live in one component.
 */
export function rowApiOf(registry: RowRegistry, id: string): RowApi {
  const row = () => registry.current.get(id);
  return {
    setName: (text) => row()?.setName(text),
    setAmountText: (text) => row()?.setAmountText(text),
    setPercentText: (text) => row()?.setPercentText(text),
    setMode: (mode) => row()?.setMode(mode),
    setLumpSum: (value) => row()?.setLumpSum(value),
    setWhyNeeded: (text) => row()?.setWhyNeeded(text),
    setCanReduce: (value) => row()?.setCanReduce(value),
    setNotes: (text) => row()?.setNotes(text),
    choose: (change) => row()?.choose(change),
    openEvidence: () => row()?.openEvidence(),
    flush: () => row()?.flush() ?? Promise.resolve(),
  };
}

export interface CostRowControllerProps {
  validationId: string;
  /** The server's copy of the row. */
  item: CostItem;
  draft: CostDraft;
  /** A Viewer, or an idea that is archived: nothing is saved. */
  isReadOnly: boolean;
  /** Changes the screen's copy of a row; `item` is the base for a row that has none yet. */
  setDraft: (item: CostItem, update: (prev: CostDraft) => CostDraft) => void;
  registry: RowRegistry;
}

const url = (id: string) => `/api/v1/cost-items/${id}`;

/** The row's editable fields as a V14 body, for a retry after the server refused the first try. */
function bodyOf(draft: CostDraft): Record<string, unknown> {
  const { fau, confidence } = draft.classification;
  return {
    name: draft.name,
    inputMode: draft.inputMode,
    amount: draft.inputMode === "amount" ? draft.amount : null,
    percent: draft.inputMode === "percent_of_price" ? draft.percent : null,
    isLumpSum: draft.isLumpSum,
    whyNeeded: draft.whyNeeded,
    canReduce: draft.canReduce,
    notes: draft.notes,
    ...(fau && fau !== "fact"
      ? { classification: fau === "assumption" ? { fau, confidence } : { fau } }
      : {}),
  };
}

/** A row's fields as one line for the conflict dialog, from a whole row or from a partial save. */
function describeRow(fields: Record<string, unknown> | undefined): string | null {
  if (!fields) return null;
  const parts = [
    typeof fields.name === "string" ? fields.name : null,
    typeof fields.amount === "number" ? formatInputNumber(fields.amount) : null,
    typeof fields.percent === "number" ? formatInputPercent(fields.percent) : null,
    typeof fields.whyNeeded === "string" ? fields.whyNeeded : null,
    typeof fields.notes === "string" ? fields.notes : null,
  ].filter((part): part is string => part !== null && part !== "");
  return parts.length > 0 ? parts.join(" · ") : null;
}

const sameFields = (item: CostItem, draft: CostDraft) =>
  item.name === draft.name.trim() &&
  item.inputMode === draft.inputMode &&
  item.amount === draft.amount &&
  item.percent === draft.percent &&
  item.isLumpSum === draft.isLumpSum &&
  (item.whyNeeded ?? "") === draft.whyNeeded.trim() &&
  item.canReduce === draft.canReduce &&
  (item.notes ?? "") === draft.notes.trim();

/**
 * Owns the saved item of one cost row (`cost:<id>`, design-spec 6.0.2): the autosave, the 409
 * dialog, the evidence sheet and the failure notice. It renders no row, because the table draws
 * the cells; the cells reach it through the {@link RowRegistry}.
 */
export function CostRowController({
  validationId,
  item,
  draft,
  isReadOnly,
  setDraft,
  registry,
}: CostRowControllerProps) {
  const { t } = useTranslation(["costs", "form", "app"]);
  const queryClient = useQueryClient();
  const { modal, about, openModal, closeModal } = useOverlay();
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const known = useRef({ lockVersion: item.lockVersion });
  const serverClassification = useRef(item.classification);
  const dirty = useRef(false);
  const target = formatItemTarget("cost_item", item.id);
  const queryKey = costsKey(validationId);

  const writeBack = (patch: Partial<CostItem>) =>
    queryClient.setQueryData<CostsData>(queryKey, (old) =>
      old
        ? { ...old, items: old.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)) }
        : old,
    );

  const adopt = (source: CostItem) => {
    known.current = { lockVersion: source.lockVersion };
    serverClassification.current = source.classification;
    dirty.current = false;
    setDraft(item, (prev) => draftOfItem(source, prev.revision + 1));
  };

  const saved = useSavedItem({
    itemKey: `cost:${item.id}`,
    method: "PATCH",
    url: url(item.id),
    lockVersion: item.lockVersion,
    isReadOnly,
    onSentElsewhere: () => {
      dirty.current = false;
      void queryClient.invalidateQueries({ queryKey });
    },
    onSaved: (data) => {
      const result = data as CostItem;
      known.current = { lockVersion: result.lockVersion };
      serverClassification.current = result.classification;
      if (sameFields(result, draftRef.current)) {
        dirty.current = false;
        setDraft(item, (prev) => ({ ...prev, classification: result.classification }));
      }
      writeBack(result);
    },
    onAdopt: (current) => adopt(current.value as CostItem),
    onRestore: (patch) => {
      dirty.current = true;
      setDraft(item, (prev) => {
        const next: CostDraft = { ...prev, revision: prev.revision + 1 };
        if (typeof patch.name === "string") next.name = patch.name;
        if (patch.inputMode === "amount" || patch.inputMode === "percent_of_price") {
          next.inputMode = patch.inputMode;
        }
        if ("amount" in patch) next.amount = (patch.amount as number | null) ?? null;
        if ("percent" in patch) next.percent = (patch.percent as number | null) ?? null;
        if (typeof patch.isLumpSum === "boolean") next.isLumpSum = patch.isLumpSum;
        if (typeof patch.whyNeeded === "string") next.whyNeeded = patch.whyNeeded;
        if ("canReduce" in patch) next.canReduce = patch.canReduce as CostItem["canReduce"];
        if (typeof patch.notes === "string") next.notes = patch.notes;
        const choice = patch.classification as FauChange | undefined;
        next.classification = choice
          ? withChoice(
              next.classification,
              draftValue(next) != null,
              choice.fau,
              choice.confidence ?? null,
            )
          : withNumber(next.classification, draftValue(next) != null);
        return next;
      });
    },
  });

  // A newer copy from a refetch replaces the row unless the person has unsent input in it; with
  // unsent input the old version stays, so the save reports the conflict instead of hiding it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: adopt and acknowledge only touch refs and setters
  useEffect(() => {
    if (item.lockVersion <= known.current.lockVersion || dirty.current) return;
    adopt(item);
    saved.acknowledge(item.lockVersion);
  }, [item]);

  // A refused save is not queued any more: the row goes back to what the server holds, and a row
  // that lost its right to be saved is read again (SDD 8.2).
  const failure = saved.failure;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to a new failure only
  useEffect(() => {
    if (!failure || failure.willRetry) return;
    const { code } = failure.error;
    if (code === "ARCHIVED" || code === "FORBIDDEN" || code === "NO_ACCESS") {
      void queryClient.invalidateQueries({ queryKey: ["ideas"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  }, [failure]);

  const edit = (
    update: (prev: CostDraft) => CostDraft,
    body: Record<string, unknown>,
    delay?: number,
  ) => {
    dirty.current = true;
    setDraft(item, update);
    saved.save(body, delay === undefined ? undefined : { delay });
  };

  const withProblem = (
    problems: CostDraft["problems"],
    key: keyof CostDraft["problems"],
    problem: CostDraft["problems"][typeof key],
  ): CostDraft["problems"] => {
    const { [key]: _gone, ...rest } = problems;
    return problem ? { ...rest, [key]: problem } : rest;
  };

  const api: RowApi = {
    setName: (text) => {
      const problem = nameProblem(text);
      // A blank name queues no save, so it is not a change the server copy must wait for.
      if (!problem) dirty.current = true;
      setDraft(item, (prev) => ({
        ...prev,
        name: text,
        problems: withProblem(prev.problems, "name", problem ?? undefined),
      }));
      if (!problem) saved.save({ name: text });
    },
    setAmountText: (text) => {
      const reading = readNumberText(text);
      if (reading.kind === "partial") return;
      const value = reading.kind === "empty" ? null : reading.value;
      const problem = value === null ? null : amountProblem(value);
      if (problem) {
        setDraft(item, (prev) => ({
          ...prev,
          problems: withProblem(prev.problems, "amount", problem),
        }));
        return;
      }
      edit(
        (prev) => ({
          ...prev,
          amount: value,
          problems: withProblem(prev.problems, "amount", undefined),
          classification: withNumber(prev.classification, value !== null),
        }),
        { amount: value },
      );
    },
    setPercentText: (text) => {
      const reading = readPercentText(text);
      if (reading.kind === "partial") return;
      const value = reading.kind === "empty" ? null : reading.value;
      const problem = value === null ? null : percentProblem(value);
      if (problem) {
        setDraft(item, (prev) => ({
          ...prev,
          problems: withProblem(prev.problems, "percent", problem),
        }));
        return;
      }
      edit(
        (prev) => ({
          ...prev,
          percent: value,
          problems: withProblem(prev.problems, "percent", undefined),
          classification: withNumber(prev.classification, value !== null),
        }),
        { percent: value },
      );
    },
    setMode: (mode) => {
      if (draftRef.current.inputMode === mode) return;
      // The server drops the value of the mode that is left, so the fields start empty.
      edit(
        (prev) => ({
          ...prev,
          inputMode: mode,
          amount: null,
          percent: null,
          revision: prev.revision + 1,
          problems: {},
          classification: withNumber(prev.classification, false),
        }),
        { inputMode: mode, amount: null, percent: null },
        0,
      );
    },
    setLumpSum: (value) => edit((prev) => ({ ...prev, isLumpSum: value }), { isLumpSum: value }, 0),
    setWhyNeeded: (text) => edit((prev) => ({ ...prev, whyNeeded: text }), { whyNeeded: text }),
    setCanReduce: (value) =>
      edit((prev) => ({ ...prev, canReduce: value }), { canReduce: value }, 0),
    setNotes: (text) => edit((prev) => ({ ...prev, notes: text }), { notes: text }),
    choose: (change) => {
      if (change.fau === "unknown") {
        // An Unknown number holds no value (design-spec 6.0.3).
        edit(
          (prev) => ({
            ...prev,
            amount: null,
            percent: null,
            revision: prev.revision + 1,
            problems: {},
            classification: withChoice(prev.classification, false, "unknown", null),
          }),
          { amount: null, percent: null, classification: { fau: "unknown" } },
          0,
        );
        return;
      }
      const hasValue = draftValue(draftRef.current) != null;
      edit(
        (prev) => ({
          ...prev,
          classification: withChoice(
            prev.classification,
            hasValue,
            change.fau,
            change.confidence ?? null,
          ),
        }),
        {
          classification:
            change.fau === "assumption"
              ? { fau: "assumption", confidence: change.confidence }
              : { fau: change.fau },
        },
        0,
      );
    },
    openEvidence: () => {
      void (async () => {
        await saved.flush();
        await autosave.idle();
        openModal("evidence", target);
      })();
    },
    flush: () => saved.flush(),
  };

  const apiRef = useRef(api);
  apiRef.current = api;
  // The registry holds stable forwarders, so a cell never calls a method of an older render.
  useEffect(() => {
    const live: RowApi = {
      setName: (x) => apiRef.current.setName(x),
      setAmountText: (x) => apiRef.current.setAmountText(x),
      setPercentText: (x) => apiRef.current.setPercentText(x),
      setMode: (x) => apiRef.current.setMode(x),
      setLumpSum: (x) => apiRef.current.setLumpSum(x),
      setWhyNeeded: (x) => apiRef.current.setWhyNeeded(x),
      setCanReduce: (x) => apiRef.current.setCanReduce(x),
      setNotes: (x) => apiRef.current.setNotes(x),
      choose: (x) => apiRef.current.choose(x),
      openEvidence: () => apiRef.current.openEvidence(),
      flush: () => apiRef.current.flush(),
    };
    registry.current.set(item.id, live);
    return () => {
      registry.current.delete(item.id);
    };
  }, [registry, item.id]);

  const name = draft.name.trim() || t("costs:unnamed");
  const evidenceOpen = modal === "evidence" && about === target;

  return (
    <>
      {failure ? (
        <InlineAlert variant="negative" heading={t("costs:failure", { name })}>
          <Stack gap="space-100" align="start">
            <Text>{failure.willRetry ? t("form:saveFailed") : errorText(t, failure.error)}</Text>
            <Button
              variant="secondary"
              size="S"
              onPress={() => saved.retry(bodyOf(draftRef.current))}
            >
              {t("form:retry")}
            </Button>
          </Stack>
        </InlineAlert>
      ) : null}
      {evidenceOpen && !isReadOnly ? (
        <EvidenceSheet
          isOpen
          onClose={closeModal}
          validationId={validationId}
          target={{ type: "cost_item", id: item.id }}
          label={name}
          classification={draft.classification}
          getLockVersion={() => known.current.lockVersion}
          onConflict={() => void queryClient.invalidateQueries({ queryKey })}
          onChanged={(result) => {
            known.current = { lockVersion: result.lockVersion };
            serverClassification.current = result.classification;
            saved.acknowledge(result.lockVersion);
            setDraft(item, (prev) => ({ ...prev, classification: result.classification }));
            writeBack({ classification: result.classification, lockVersion: result.lockVersion });
          }}
        />
      ) : null}
      <ConflictDialog
        current={saved.conflict}
        itemName={t("costs:conflict")}
        theirText={describeRow(saved.conflict?.value as Record<string, unknown> | undefined)}
        mineText={describeRow(saved.mine ?? undefined)}
        onLoadTheirs={saved.loadTheirs}
        onKeepMine={saved.keepMine}
      />
    </>
  );
}
