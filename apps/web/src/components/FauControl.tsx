import type { Classification, Confidence, Fau } from "@moonx/schemas";
import {
  AlertDialog,
  Flex,
  Stack,
  StatusLight,
  Text,
  ToggleButtonGroup,
  ToggleButtonGroupItem,
} from "@moonx/ui-web";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const CONFIDENCES: Confidence[] = ["low", "medium", "high"];

/** What the person chose: Assumption always comes with its confidence (design-spec 6.0.3). */
export interface FauChange {
  fau: Fau | null;
  confidence?: Confidence;
}

/** The F/A/U label of an item, "Assumption · Medium", "Fact · No evidence" (design-spec 6.0.3). */
export function FauStatus({ classification }: { classification: Classification }) {
  const { t } = useTranslation("validation");
  const { state, confidence, evidence } = classification;
  const label =
    state === "assumption" && confidence
      ? t("fau.assumptionWithConfidence", { confidence: t(`fau.confidence.${confidence}`) })
      : t(`fau.state.${state}`);
  const variant = state === "fact_no_evidence" ? "fact" : state;
  return (
    <StatusLight variant={variant} size="S">
      {state === "fact" && evidence.length > 0
        ? t("form:fau.factWithEvidence", { label, count: evidence.length })
        : label}
    </StatusLight>
  );
}

export interface FauControlProps {
  /** Names the item for assistive technology, such as "01 WHO". */
  label: string;
  classification: Classification;
  /** Whether the item holds a value. Without one only Unknown can be chosen. */
  hasValue: boolean;
  /** A Viewer or an archived idea sees the label only. */
  isReadOnly?: boolean;
  /** Numbers ask before Unknown drops their value; text answers keep their explanation. */
  confirmUnknown?: boolean;
  onChange: (change: FauChange) => void;
  /** Fact opens the evidence sheet; it becomes Fact only when evidence is attached there. */
  onOpenEvidence: () => void;
}

/**
 * The three F/A/U buttons of an item (design-spec 6.0.3) and, for an Assumption, its confidence.
 * Pressing the chosen button again clears the classification. Fact does not change anything
 * itself: the evidence sheet does, so an answer is never Fact without evidence.
 */
export function FauControl({
  label,
  classification,
  hasValue,
  isReadOnly,
  confirmUnknown,
  onChange,
  onOpenEvidence,
}: FauControlProps) {
  const { t } = useTranslation(["form", "validation"]);
  // The classification the item had when Assumption was pressed; the pending choice ends as soon as it differs.
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const chosen = classification.fau;
  const snapshot = `${chosen}:${classification.confidence}`;
  const choosing = pendingFrom === snapshot;

  if (isReadOnly) return <FauStatus classification={classification} />;

  const selected = choosing ? "assumption" : chosen;
  const select = (value: string | null) => {
    if (value === null) {
      setPendingFrom(null);
      if (chosen !== null) onChange({ fau: null });
    } else if (value === "fact") {
      onOpenEvidence();
    } else if (value === "assumption") {
      setPendingFrom(snapshot);
    } else if (confirmUnknown && hasValue) {
      setAsking(true);
    } else {
      setPendingFrom(null);
      onChange({ fau: "unknown" });
    }
  };

  return (
    <Stack gap="space-100">
      <Flex gap="space-200" align="center" wrap>
        <ToggleButtonGroup
          aria-label={t("form:fau.group", { label })}
          size="S"
          value={selected}
          onChange={select}
        >
          <ToggleButtonGroupItem value="fact" isDisabled={!hasValue && chosen !== "fact"}>
            {t("form:fau.fact")}
          </ToggleButtonGroupItem>
          <ToggleButtonGroupItem
            value="assumption"
            isDisabled={!hasValue && chosen !== "assumption"}
          >
            {t("form:fau.assumption")}
          </ToggleButtonGroupItem>
          <ToggleButtonGroupItem value="unknown">{t("form:fau.unknown")}</ToggleButtonGroupItem>
        </ToggleButtonGroup>
        {selected === "assumption" ? (
          <Flex gap="space-100" align="center">
            <Text variant="caption" tone="secondary" as="span">
              {t("form:fau.confidence")}
            </Text>
            <ToggleButtonGroup
              aria-label={t("form:fau.confidenceGroup", { label })}
              size="S"
              value={classification.confidence}
              onChange={(value) => {
                if (value) onChange({ fau: "assumption", confidence: value as Confidence });
              }}
            >
              {CONFIDENCES.map((level) => (
                <ToggleButtonGroupItem key={level} value={level}>
                  {t(`validation:fau.confidence.${level}`)}
                </ToggleButtonGroupItem>
              ))}
            </ToggleButtonGroup>
          </Flex>
        ) : null}
      </Flex>
      <AlertDialog
        isOpen={asking}
        onOpenChange={setAsking}
        title={t("form:fau.unknownConfirm.title")}
        primaryActionLabel={t("form:fau.unknownConfirm.confirm")}
        cancelLabel={t("form:fau.unknownConfirm.cancel")}
        onPrimaryAction={() => onChange({ fau: "unknown" })}
      >
        {t("form:fau.unknownConfirm.body")}
      </AlertDialog>
    </Stack>
  );
}
