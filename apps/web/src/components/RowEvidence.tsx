import type { Evidence } from "@moonx/schemas";
import { Button, Flex, Stack, Tag, TagGroup, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { evidenceTagText } from "../lib/evidence-tag";
import { useOverlay } from "../lib/overlay";
import { formatItemTarget } from "../lib/panel-target";
import { useMe } from "../lib/session";
import { type EvidenceResult, EvidenceSheet } from "./EvidenceSheet";

export interface RowEvidenceProps {
  validationId: string;
  /** The row the evidence belongs to: a competitor or an assumption. */
  target: { type: "competitor" | "assumption"; id: string };
  /** The row's name, for the sheet's "For:" line. */
  label: string;
  evidence: Evidence[];
  isReadOnly: boolean;
  getLockVersion: () => number;
  /** Writes the new evidence and version back into the screen's copy of the row. */
  onChanged: (result: EvidenceResult) => void;
  onConflict: () => void;
  /** Sends what is still waiting before the sheet changes the row's version. */
  flush: () => Promise<void>;
}

/**
 * The evidence of a competitor or an assumption (design-spec 6.10, M2): one chip per piece and,
 * for an editor, the button that opens the evidence sheet. Unlike an answer it has no F/A/U, so
 * evidence never turns it into a Fact.
 */
export function RowEvidence({
  validationId,
  target,
  label,
  evidence,
  isReadOnly,
  getLockVersion,
  onChanged,
  onConflict,
  flush,
}: RowEvidenceProps) {
  const { t } = useTranslation(["research", "form"]);
  const me = useMe();
  const { modal, about, openModal, closeModal } = useOverlay();
  const aboutTarget = formatItemTarget(target.type, target.id);
  const open = modal === "evidence" && about === aboutTarget;
  const deletedLabel = t("form:evidence.deletedLog");
  return (
    <Stack gap="space-100">
      <Text variant={isReadOnly ? "caption" : "label"} tone={isReadOnly ? "secondary" : undefined}>
        {t("research:evidence.title")}
      </Text>
      {evidence.length > 0 ? (
        <TagGroup aria-label={t("research:evidence.attached")} size="S">
          {evidence.map((item) => {
            const text = evidenceTagText(item, deletedLabel, me.timezone);
            return (
              <Tag key={item.id} id={item.id} textValue={text}>
                {text}
              </Tag>
            );
          })}
        </TagGroup>
      ) : (
        <Text tone="secondary">{t("research:evidence.none")}</Text>
      )}
      {isReadOnly ? null : (
        <Flex>
          <Button
            variant="secondary"
            size="S"
            onPress={() => {
              void flush().then(() => openModal("evidence", aboutTarget));
            }}
          >
            {evidence.length > 0 ? t("research:evidence.edit") : t("research:evidence.add")}
          </Button>
        </Flex>
      )}
      {isReadOnly ? null : (
        <EvidenceSheet
          isOpen={open}
          onClose={closeModal}
          validationId={validationId}
          target={target}
          label={label}
          hasFau={false}
          classification={{ fau: null, confidence: null, state: "empty", evidence }}
          getLockVersion={getLockVersion}
          onChanged={onChanged}
          onConflict={onConflict}
        />
      )}
    </Stack>
  );
}
