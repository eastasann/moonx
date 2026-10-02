import { formatDate, formatMoney, formatPercent } from "@moonx/i18n";
import type { DecisionValue, GoNoGoValue, MetricValue, UserRef } from "@moonx/schemas";
import {
  Badge,
  Disclosure,
  Flex,
  Grid,
  Heading,
  Link,
  MetricTile,
  Picker,
  PickerItem,
  Stack,
  Text,
} from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { linkTargetPath } from "../../lib/link-target";
import { logValueText, PLAN_ITEM_KEYS, referenceMetricTiles } from "../../lib/plan-item";
import type { PlanReference } from "../../lib/plans";
import { useMe } from "../../lib/session";

export interface ReferencesProps {
  workspaceId: string;
  references: readonly PlanReference[];
  currency: string;
}

/**
 * What an item shows next to its sub-items, always the latest validation, research, costs and
 * self analyses (design-spec 6.12), one collapsible block each, with a link to the screen that
 * holds the source. The totals of the ownership table sit under that table instead.
 */
export function References({ workspaceId, references, currency }: ReferencesProps) {
  const { t } = useTranslation("planItem");
  const shown = references.filter((reference) => reference.kind !== "totals");
  if (shown.length === 0) return null;
  return (
    <Stack gap="space-100">
      <Heading level={2}>{t("planItem:ref.heading")}</Heading>
      <Text variant="caption" tone="secondary">
        {t("planItem:ref.note")}
      </Text>
      {shown.map((reference) => {
        const href = reference.link ? linkTargetPath(reference.link, { workspaceId }) : null;
        return (
          <Disclosure key={reference.kind} title={reference.title} headingLevel={3}>
            <Stack gap="space-200">
              <ReferenceBody reference={reference} currency={currency} />
              {href ? <Link href={href}>{t("planItem:ref.open")}</Link> : null}
            </Stack>
          </Disclosure>
        );
      })}
    </Stack>
  );
}

interface LogEntry {
  id: string;
  kind: "validation_decision" | "go_no_go" | "version_saved";
  value: DecisionValue | GoNoGoValue | null;
  versionName: string | null;
  reasonExcerpt: string | null;
  recordedBy: UserRef;
  recordedAt: string;
}

interface SelfAnalysisShare {
  user: UserRef;
  sections: {
    key: string;
    title: string;
    answers: { questionKey: string; title: string; text: string | null; amount: number | null }[];
  }[];
}

const isLogKind = (kind: string): kind is keyof typeof PLAN_ITEM_KEYS.logKind =>
  kind in PLAN_ITEM_KEYS.logKind;

function Empty() {
  const { t } = useTranslation("planItem");
  return (
    <Text tone="secondary" variant="body-sm">
      {t("planItem:ref.none")}
    </Text>
  );
}

function Line({ label, value }: { label: string; value: string | null | undefined }) {
  const { t } = useTranslation("planItem");
  return (
    <Text variant="body-sm">
      {label}: {value && value.trim() !== "" ? value : t("planItem:noValue")}
    </Text>
  );
}

function ReferenceBody({ reference, currency }: { reference: PlanReference; currency: string }) {
  const { t } = useTranslation("planItem");
  const me = useMe();
  const { kind } = reference;

  switch (kind) {
    case "validation_answers": {
      const rows = reference.data as { questionKey: string; title: string; text: string | null }[];
      return rows.length === 0 ? (
        <Empty />
      ) : (
        <Stack gap="space-200">
          {rows.map((row) => (
            <Stack key={row.questionKey} gap="space-50">
              <Text variant="caption" tone="secondary">
                {row.title}
              </Text>
              <Text variant="body-long" tone={row.text ? undefined : "secondary"}>
                {row.text ?? t("planItem:ref.notWritten")}
              </Text>
            </Stack>
          ))}
        </Stack>
      );
    }
    case "competitors": {
      const rows = reference.data as {
        id: string;
        name: string;
        type: string | null;
        typicalPrice: number | null;
        strength: string | null;
        weakness: string | null;
      }[];
      return rows.length === 0 ? (
        <Empty />
      ) : (
        <Stack gap="space-200">
          {rows.map((row) => (
            <Stack key={row.id} gap="space-50">
              <Flex gap="space-100" align="center" wrap>
                <Text variant="label" as="span">
                  {row.name}
                </Text>
                {row.type && row.type in PLAN_ITEM_KEYS.competitorType ? (
                  <Badge size="S">
                    {t(
                      PLAN_ITEM_KEYS.competitorType[
                        row.type as keyof typeof PLAN_ITEM_KEYS.competitorType
                      ],
                    )}
                  </Badge>
                ) : null}
              </Flex>
              <Line
                label={t("planItem:ref.price")}
                value={row.typicalPrice === null ? null : formatMoney(row.typicalPrice, currency)}
              />
              <Line label={t("planItem:ref.strength")} value={row.strength} />
              <Line label={t("planItem:ref.weakness")} value={row.weakness} />
            </Stack>
          ))}
        </Stack>
      );
    }
    case "cost_rows": {
      const rows = reference.data as {
        id: string;
        name: string;
        inputMode: string;
        amount: number | null;
        percent: number | null;
      }[];
      return rows.length === 0 ? (
        <Empty />
      ) : (
        <Stack gap="space-100">
          {rows.map((row) => (
            <Flex key={row.id} gap="space-200" justify="between" align="baseline">
              <Text variant="body-sm" as="span">
                {row.name}
              </Text>
              <Text variant="body-sm" as="span">
                {row.inputMode === "percent_of_price" && row.percent !== null
                  ? formatPercent(row.percent)
                  : row.amount !== null
                    ? formatMoney(row.amount, currency)
                    : t("planItem:noValue")}
              </Text>
            </Flex>
          ))}
        </Stack>
      );
    }
    case "research_log": {
      const rows = reference.data as { id: string; observedOn: string | null; topic: string }[];
      return rows.length === 0 ? (
        <Empty />
      ) : (
        <Stack gap="space-100">
          {rows.map((row) => (
            <Text key={row.id} variant="body-sm">
              {row.observedOn ? `${formatDate(row.observedOn, me.timezone)} ` : ""}
              {row.topic}
            </Text>
          ))}
        </Stack>
      );
    }
    case "decision_log":
    case "go_no_go_history": {
      const rows = reference.data as LogEntry[];
      return rows.length === 0 ? (
        <Empty />
      ) : (
        <Stack gap="space-200">
          {rows.map((row) => (
            <Stack key={row.id} gap="space-50">
              <Flex gap="space-100" align="center" wrap>
                <Text variant="label" as="span">
                  {isLogKind(row.kind) ? t(PLAN_ITEM_KEYS.logKind[row.kind]) : row.kind}
                </Text>
                {logValueText(t, row.value) ? (
                  <Badge size="S">{logValueText(t, row.value)}</Badge>
                ) : null}
                <Text variant="caption" tone="secondary" as="span">
                  {t("planItem:ref.recorded", {
                    name: row.recordedBy.displayName,
                    date: formatDate(row.recordedAt, me.timezone),
                  })}
                </Text>
              </Flex>
              {row.versionName ? <Text variant="body-sm">{row.versionName}</Text> : null}
              {row.reasonExcerpt ? <Text variant="body-sm">{row.reasonExcerpt}</Text> : null}
            </Stack>
          ))}
        </Stack>
      );
    }
    case "self_analysis":
      return (
        <SelfAnalysisBody shares={reference.data as SelfAnalysisShare[]} currency={currency} />
      );
    case "metrics": {
      const tiles = referenceMetricTiles(
        t,
        reference.data as Record<string, MetricValue>,
        currency,
      );
      return (
        <Grid columns={2} gap="space-200">
          {tiles.map((tile) => (
            <MetricTile key={tile.key} label={tile.label} value={tile.value} note={tile.note} />
          ))}
        </Grid>
      );
    }
    case "assumptions": {
      const rows = reference.data as {
        id: string;
        statement: string;
        whyBelieve: string | null;
        evidenceNote: string | null;
        confidence: keyof typeof PLAN_ITEM_KEYS.level | null;
        disproveCondition: string | null;
      }[];
      return rows.length === 0 ? (
        <Empty />
      ) : (
        <Stack gap="space-200">
          {rows.map((row) => (
            <Stack key={row.id} gap="space-50">
              <Flex gap="space-100" align="center" wrap>
                <Text variant="label" as="span">
                  {row.statement}
                </Text>
                {row.confidence ? (
                  <Badge size="S">
                    {t("planItem:ref.confidence", {
                      level: t(PLAN_ITEM_KEYS.level[row.confidence]),
                    })}
                  </Badge>
                ) : null}
              </Flex>
              <Line label={t("planItem:ref.whyBelieve")} value={row.whyBelieve} />
              <Line label={t("planItem:ref.evidence")} value={row.evidenceNote} />
              <Line label={t("planItem:ref.disprove")} value={row.disproveCondition} />
            </Stack>
          ))}
        </Stack>
      );
    }
    case "risks": {
      const rows = reference.data as {
        id: string;
        statement: string;
        probability: keyof typeof PLAN_ITEM_KEYS.level | null;
        impact: keyof typeof PLAN_ITEM_KEYS.level | null;
        mitigation: string | null;
      }[];
      const level = (value: keyof typeof PLAN_ITEM_KEYS.level | null) =>
        value ? t(PLAN_ITEM_KEYS.level[value]) : null;
      return rows.length === 0 ? (
        <Empty />
      ) : (
        <Stack gap="space-200">
          {rows.map((row) => (
            <Stack key={row.id} gap="space-50">
              <Text variant="label">{row.statement}</Text>
              <Line label={t("planItem:ref.probability")} value={level(row.probability)} />
              <Line label={t("planItem:ref.impact")} value={level(row.impact)} />
              <Line label={t("planItem:ref.mitigation")} value={row.mitigation} />
            </Stack>
          ))}
        </Stack>
      );
    }
    case "totals":
      return null;
  }
}

/** The self analyses shared with the workspace; the person picks whose to read (design-spec 6.12). */
function SelfAnalysisBody({ shares, currency }: { shares: SelfAnalysisShare[]; currency: string }) {
  const { t } = useTranslation(["planItem", "selfAnalysis", "common"]);
  const [chosen, setChosen] = useState<string | null>(null);
  if (shares.length === 0) return <Text tone="secondary">{t("selfAnalysis:team.empty")}</Text>;
  const share = shares.find((candidate) => candidate.user.id === chosen) ?? shares[0];
  if (!share) return null;
  return (
    <Stack gap="space-200">
      <Picker
        label={t("planItem:ref.member")}
        value={share.user.id}
        onChange={(next) => next && setChosen(next)}
      >
        {shares.map((candidate) => (
          <PickerItem key={candidate.user.id} id={candidate.user.id}>
            {userLabel(t, candidate.user)}
          </PickerItem>
        ))}
      </Picker>
      {share.sections.map((section) => (
        <Stack key={section.key} gap="space-100">
          <Heading level={4}>{section.title}</Heading>
          {section.answers.map((answer) => (
            <Stack key={answer.questionKey} gap="space-50">
              <Text variant="caption" tone="secondary">
                {answer.title}
              </Text>
              {answer.amount !== null ? (
                <Text variant="body-long">{formatMoney(answer.amount, currency)}</Text>
              ) : null}
              {answer.text !== null || answer.amount === null ? (
                <Text variant="body-long" tone={answer.text ? undefined : "secondary"}>
                  {answer.text ?? t("selfAnalysis:team.noAnswer")}
                </Text>
              ) : null}
            </Stack>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

const userLabel = (t: TFunction, user: UserRef) =>
  user.badge === "deleted" ? t("common:deletedUser") : user.displayName;
