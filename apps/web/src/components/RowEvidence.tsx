import type { Evidence } from "@moonx/schemas";
import { Flex, Heading, Link, Stack, TagGroup, Text } from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { evidenceLabel } from "../lib/evidence";
import { EvidenceSheet, type EvidenceTargetType } from "./EvidenceSheet";
import { useWorkspace } from "./workspace";

/** The rows without F/A/U that take evidence (design-spec 6.0.3): 15's and 16's. */
export type RowEvidenceType = Extract<
  EvidenceTargetType,
  "competitor" | "assumption"
>;

/**
 * The evidence of a row without F/A/U (design-spec 6.0.3・6.10: a competitor, an
 * assumption): its chips, research logs by their date and topic, URLs by themselves, in
 * the order attached, or "No evidence yet"; and Add evidence, which opens M2, for those
 * who may change it.
 */
export function RowEvidence({
  evidence,
  onAdd,
  headingLevel = 3,
}: {
  evidence: readonly Evidence[];
  /** Opens M2; none where the row is read only. */
  onAdd?: () => void;
  headingLevel?: 2 | 3 | 4;
}) {
  const { t } = useTranslation(["validation"]);
  const { me } = useWorkspace();
  return (
    <Stack gap="space-100">
      <Heading level={headingLevel} variant="label">
        {t("validation:rows.evidence")}
      </Heading>
      {evidence.length === 0 ? (
        <Text tone="secondary" elementType="p">
          {t("validation:evidence.none")}
        </Text>
      ) : (
        <TagGroup
          aria-label={t("validation:rows.evidence")}
          items={evidence.map((item) => ({
            id: item.id,
            label: evidenceLabel(item, me.timezone),
          }))}
        />
      )}
      {onAdd !== undefined && (
        <Flex>
          <Link onPress={onAdd}>{t("validation:questions.addEvidence")}</Link>
        </Flex>
      )}
    </Stack>
  );
}

/**
 * M2 for a row without F/A/U (design-spec 6.0.3): attaching and removing leave the row as
 * it is, and the last evidence goes without asking. The row's evidence and version are put
 * in the screen's data as each change goes through; links to deleted research logs are
 * left out, as V8 and V10 leave them (SDD 5.7).
 */
export function RowEvidenceSheet({
  ideaId,
  validationId,
  type,
  rowId,
  label,
  noun,
  evidence,
  lockVersionNow,
  saveKey,
  onChanged,
  onReload,
  onClose,
}: {
  ideaId: string;
  validationId: string;
  type: RowEvidenceType;
  rowId: string;
  /** What M2 heads it with: "Competitors · Salad Station". */
  label: string;
  /** What the conflict question calls it: "competitor". */
  noun: string;
  evidence: readonly Evidence[];
  lockVersionNow: () => number;
  saveKey: string;
  onChanged: (change: { evidence: Evidence[]; lockVersion: number }) => void;
  onReload: () => void;
  onClose: () => void;
}) {
  return (
    <EvidenceSheet
      ideaId={ideaId}
      validationId={validationId}
      item={{
        target: { type, id: rowId, key: null },
        label,
        noun,
        evidence,
        state: "unclassified",
        hasValue: true,
      }}
      lockVersionNow={lockVersionNow}
      saveKey={saveKey}
      forFact={false}
      onChanged={(result) =>
        onChanged({
          evidence: result.classification.evidence.filter(
            (item) => item.researchLog?.deleted !== true,
          ),
          lockVersion: result.lockVersion,
        })
      }
      onReload={onReload}
      onClose={onClose}
    />
  );
}
