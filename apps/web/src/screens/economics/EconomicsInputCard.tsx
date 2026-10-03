import { DEFAULT_OPERATING_DAYS, DEFAULT_TARGET_MARGIN } from "@moonx/domain";
import {
  formatInputNumber,
  formatInputPercent,
  formatMoney,
  formatUnits,
  moneyInputFormat,
  PERCENT_INPUT_FORMAT,
} from "@moonx/i18n";
import type {
  Classification,
  ConflictCurrent,
  EconomicsField,
  EconomicsInput,
} from "@moonx/schemas";
import { Flex, NumberField, Stack, Text, Well } from "@moonx/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConflictDialog } from "../../components/ConflictDialog";
import { EvidenceSheet } from "../../components/EvidenceSheet";
import { type FauChange, FauControl, FauStatus } from "../../components/FauControl";
import { ItemPanelButtons } from "../../components/ItemPanelButtons";
import { SaveFailureNotice } from "../../components/SaveFailureNotice";
import { autosave } from "../../lib/autosave";
import { withNumber } from "../../lib/costs";
import {
  ECONOMICS_KEYS,
  type EconomicsData,
  economicsKey,
  FIELD_KIND,
  type FieldKind,
  inputProblem,
} from "../../lib/economics";
import { readNumberText, readPercentText } from "../../lib/number-input";
import { useOverlay } from "../../lib/overlay";
import { formatItemTarget } from "../../lib/panel-target";
import { withChoice } from "../../lib/questions";
import { useSavedItem } from "../../lib/use-saved-item";

export interface EconomicsInputCardProps {
  validationId: string;
  field: EconomicsField;
  input: EconomicsInput;
  /** A Viewer, or an idea that is archived: the value is shown, not edited. */
  isReadOnly: boolean;
  currency: string;
  /** Reports the value as it is typed (null when cleared), so the results follow every keystroke. */
  onValue: (field: EconomicsField, value: number | null) => void;
}

const url = (validationId: string, field: EconomicsField) =>
  `/api/v1/validations/${validationId}/economics/${field}`;

/** How each kind of input is shown and parsed by its field. */
function formatOptionsOf(kind: FieldKind, currency: string): Intl.NumberFormatOptions {
  switch (kind) {
    case "money":
      return moneyInputFormat(currency);
    case "percent":
      return PERCENT_INPUT_FORMAT;
    case "days":
      return { maximumFractionDigits: 0, useGrouping: false };
    case "units":
      return { maximumFractionDigits: 6 };
  }
}

function displayValue(kind: FieldKind, value: number, currency: string): string {
  switch (kind) {
    case "money":
      return formatMoney(value, currency);
    case "percent":
      return formatInputPercent(value);
    case "days":
      return formatUnits(value);
    case "units":
      return formatInputNumber(value);
  }
}

const describeCurrent = (current: ConflictCurrent | null, kind: FieldKind, currency: string) => {
  const value = (current?.value as { value?: number | null } | undefined)?.value;
  return typeof value === "number" ? displayValue(kind, value, currency) : null;
};

/**
 * One of the seven inputs of screen 18 with its F/A/U, evidence and comments (design-spec 6.4),
 * saved as its own item `econ:<validationId>:<field>`. A number that is out of range is not saved
 * and keeps the last good value in the results (design-spec 6.0.6).
 */
export function EconomicsInputCard({
  validationId,
  field,
  input,
  isReadOnly,
  currency,
  onValue,
}: EconomicsInputCardProps) {
  const { t } = useTranslation(["economics", "form", "validation", "app"]);
  const queryClient = useQueryClient();
  const { modal, about, openModal, closeModal } = useOverlay();
  const kind = FIELD_KIND[field];
  const [value, setValue] = useState<number | null>(input.value);
  const [problem, setProblem] = useState(false);
  const [classification, setClassification] = useState<Classification>(input.classification);
  // Changes when the field must show a value it did not type: an adopted copy or Unknown.
  const [revision, setRevision] = useState(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const known = useRef({ lockVersion: input.lockVersion });
  const serverClassification = useRef<Classification>(input.classification);
  const dirty = useRef(false);
  const queryKey = economicsKey(validationId);
  const target = formatItemTarget("economics_input", validationId, field);
  const label = t(ECONOMICS_KEYS.field[field]);

  const writeBack = (patch: Partial<EconomicsInput>) =>
    queryClient.setQueryData<EconomicsData>(queryKey, (old) =>
      old
        ? {
            ...old,
            inputs: old.inputs.map((i) => (i.fieldKey === field ? { ...i, ...patch } : i)),
          }
        : old,
    );

  const adopt = (source: EconomicsInput) => {
    known.current = { lockVersion: source.lockVersion };
    serverClassification.current = source.classification;
    dirty.current = false;
    setValue(source.value);
    setProblem(false);
    setClassification(source.classification);
    setRevision((n) => n + 1);
    onValue(field, source.value);
  };

  const saved = useSavedItem({
    itemKey: `econ:${validationId}:${field}`,
    method: "PUT",
    url: url(validationId, field),
    lockVersion: input.lockVersion,
    isReadOnly,
    onSentElsewhere: () => {
      dirty.current = false;
      void queryClient.invalidateQueries({ queryKey });
    },
    onSaved: (data) => {
      const result = data as EconomicsInput;
      known.current = { lockVersion: result.lockVersion };
      serverClassification.current = result.classification;
      if (result.value === valueRef.current) {
        dirty.current = false;
        setClassification(result.classification);
      }
      writeBack(result);
    },
    onAdopt: (current) => adopt(current.value as EconomicsInput),
    onRestore: (patch) => {
      dirty.current = true;
      if ("value" in patch) {
        const restored = (patch.value as number | null) ?? null;
        setValue(restored);
        setRevision((n) => n + 1);
        setClassification((prev) => withNumber(prev, restored !== null));
        onValue(field, restored);
      }
      const choice = patch.classification as FauChange | undefined;
      if (choice) {
        setClassification((prev) =>
          withChoice(prev, valueRef.current !== null, choice.fau, choice.confidence ?? null),
        );
      }
    },
  });

  // A newer copy from a refetch replaces the field unless the person has unsent input in it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: adopt and acknowledge only touch refs and setters
  useEffect(() => {
    if (input.lockVersion <= known.current.lockVersion || dirty.current) return;
    adopt(input);
    saved.acknowledge(input.lockVersion);
  }, [input]);

  const failure = saved.failure;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to a new failure only
  useEffect(() => {
    if (!failure || failure.willRetry) return;
    setClassification(serverClassification.current);
    const { code } = failure.error;
    if (code === "ARCHIVED" || code === "FORBIDDEN" || code === "NO_ACCESS") {
      void queryClient.invalidateQueries({ queryKey: ["ideas"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  }, [failure]);

  const type = (text: string) => {
    const reading = kind === "percent" ? readPercentText(text) : readNumberText(text);
    if (reading.kind === "partial") return;
    const next = reading.kind === "empty" ? null : reading.value;
    if (next !== null && inputProblem(field, next)) {
      setProblem(true);
      return;
    }
    setProblem(false);
    dirty.current = true;
    setValue(next);
    setClassification((prev) => withNumber(prev, next !== null));
    onValue(field, next);
    saved.save({ value: next });
  };

  const choose = (choice: FauChange) => {
    dirty.current = true;
    if (choice.fau === "unknown") {
      // An Unknown number holds no value; the field empties and the results fall back to the default.
      setValue(null);
      setProblem(false);
      setRevision((n) => n + 1);
      setClassification((prev) => withChoice(prev, false, "unknown", null));
      onValue(field, null);
      saved.save({ value: null, classification: { fau: "unknown" } }, { delay: 0 });
      return;
    }
    setClassification((prev) =>
      withChoice(prev, valueRef.current !== null, choice.fau, choice.confidence ?? null),
    );
    saved.save(
      {
        value: valueRef.current,
        classification:
          choice.fau === "assumption"
            ? { fau: "assumption", confidence: choice.confidence }
            : { fau: choice.fau },
      },
      { delay: 0 },
    );
  };

  const openEvidence = async () => {
    await saved.flush();
    await autosave.idle();
    openModal("evidence", target);
  };

  const evidenceOpen = modal === "evidence" && about === target;
  const usesDefault = value === null;
  const defaultNote =
    field === "operating_days"
      ? t("validation:economics.defaultOperatingDays", { count: DEFAULT_OPERATING_DAYS })
      : field === "target_margin"
        ? t("validation:economics.defaultTargetMargin", {
            value: formatInputPercent(DEFAULT_TARGET_MARGIN),
          })
        : null;
  const placeholder =
    field === "operating_days"
      ? formatUnits(DEFAULT_OPERATING_DAYS)
      : field === "target_margin"
        ? formatInputPercent(DEFAULT_TARGET_MARGIN)
        : classification.state === "unknown"
          ? t("validation:fau.state.unknown")
          : t("economics:empty");

  if (isReadOnly) {
    return (
      <Well aria-label={label}>
        <Stack gap="space-100">
          <Text variant="label">{label}</Text>
          <Text>
            {value === null
              ? (defaultNote ?? t("economics:empty"))
              : displayValue(kind, value, currency)}
          </Text>
          <Flex gap="space-100" align="center" wrap>
            <FauStatus classification={classification} />
            <ItemPanelButtons target={target} commentCount={input.commentCount} />
          </Flex>
        </Stack>
      </Well>
    );
  }

  return (
    <Well aria-label={label}>
      <Stack gap="space-200">
        <NumberField
          key={revision}
          data-focus-key={field}
          label={label}
          defaultValue={value ?? Number.NaN}
          formatOptions={formatOptionsOf(kind, currency)}
          placeholder={placeholder}
          description={usesDefault ? defaultNote : null}
          isInvalid={problem}
          errorMessage={t(ECONOMICS_KEYS.problem[field])}
          onInputChange={type}
          onBlur={() => void saved.flush()}
        />
        {failure ? (
          <SaveFailureNotice
            failure={failure}
            onRetry={() =>
              saved.retry({
                value,
                ...(classification.fau && classification.fau !== "fact"
                  ? {
                      classification:
                        classification.fau === "assumption"
                          ? { fau: "assumption", confidence: classification.confidence }
                          : { fau: classification.fau },
                    }
                  : {}),
              })
            }
          />
        ) : null}
        <FauStatus classification={classification} />
        <FauControl
          label={label}
          classification={classification}
          hasValue={value !== null}
          confirmUnknown
          onChange={choose}
          onOpenEvidence={() => void openEvidence()}
        />
        <ItemPanelButtons target={target} commentCount={input.commentCount} />
      </Stack>
      {evidenceOpen ? (
        <EvidenceSheet
          isOpen
          onClose={closeModal}
          validationId={validationId}
          target={{ type: "economics_input", id: validationId, key: field }}
          label={label}
          classification={classification}
          getLockVersion={() => known.current.lockVersion}
          onConflict={() => void queryClient.invalidateQueries({ queryKey })}
          onChanged={(result) => {
            known.current = { lockVersion: result.lockVersion };
            serverClassification.current = result.classification;
            saved.acknowledge(result.lockVersion);
            setClassification(result.classification);
            writeBack({ classification: result.classification, lockVersion: result.lockVersion });
          }}
        />
      ) : null}
      <ConflictDialog
        current={saved.conflict}
        itemName={t("economics:conflict")}
        theirText={describeCurrent(saved.conflict, kind, currency)}
        mineText={
          typeof saved.mine?.value === "number"
            ? displayValue(kind, saved.mine.value, currency)
            : null
        }
        onLoadTheirs={saved.loadTheirs}
        onKeepMine={saved.keepMine}
      />
    </Well>
  );
}
