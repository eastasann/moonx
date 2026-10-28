import { formatMetric, hasText } from "@moonx/domain";
import { formatDate, formatMoney } from "@moonx/i18n";
import type { DecisionLogSummary, PlanReference } from "@moonx/schemas";
import {
  DescriptionList,
  DescriptionListItem,
  Disclosure,
  Flex,
  Link,
  Picker,
  Stack,
  Text,
} from "@moonx/ui-web";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { researchLogLabel } from "../lib/evidence";
import { decisionsHref, hrefOf } from "../lib/links";
import { UserName } from "./UserName";
import { useWorkspace } from "./workspace";

// What a plan item shows beside its sub-items, always the latest (design-spec 6.12「参照」,
// SDD 5.9 PlanReference): the validation's answers, competitors, costs, research, numbers,
// assumptions and risks, the decisions, and the shared self-analyses.

type ReferenceOf<K extends PlanReference["kind"]> = Extract<
  PlanReference,
  { kind: K }
>;

/** "Empty" for a value not written. */
function Words({ text }: { text: string | null }) {
  const { t } = useTranslation(["plans"]);
  return hasText(text) ? (
    <Text variant="body-long">{text}</Text>
  ) : (
    <Text tone="secondary">{t("plans:home.empty")}</Text>
  );
}

/** The decisions, newest first: what was decided, when and by whom, and why. */
function Decisions({ entries }: { entries: readonly DecisionLogSummary[] }) {
  const { t } = useTranslation(["plans", "common", "decisions", "app"]);
  const { me } = useWorkspace();
  // "Decision: Proceed", "Go / No-Go: Delay", "Version saved: v1 For advisors" (7's kinds).
  const decided = (entry: DecisionLogSummary) => {
    const kind = t(`decisions:kind.${entry.kind}`);
    const value =
      entry.kind === "version_saved"
        ? entry.versionName
        : entry.value === null
          ? null
          : entry.kind === "go_no_go"
            ? t(`common:goNoGo.${entry.value as "launch" | "delay" | "stop"}`)
            : t(
                `common:decision.${entry.value as "proceed" | "hold" | "drop"}`,
              );
    return value === null
      ? kind
      : t("plans:table.cell", { label: kind, value });
  };
  return (
    <DescriptionList>
      {entries.map((entry) => (
        <DescriptionListItem key={entry.id} label={decided(entry)}>
          <Stack gap="space-25">
            <Text variant="caption" tone="secondary">
              {formatDate(entry.recordedAt, { timeZone: me.timezone })}
              {t("app:separator")}
              <UserName user={entry.recordedBy} />
            </Text>
            {hasText(entry.reasonExcerpt) && (
              <Text variant="body-sm">{entry.reasonExcerpt}</Text>
            )}
          </Stack>
        </DescriptionListItem>
      ))}
    </DescriptionList>
  );
}

/**
 * The shared self-analyses (§2, §10): the member chosen, their sections and answers.
 * Owners and Members only: the API leaves them out for a Viewer (6.12).
 */
function SelfAnalyses({
  reference,
}: {
  reference: ReferenceOf<"self_analysis">;
}) {
  const { t } = useTranslation(["plans"]);
  const [chosen, setChosen] = useState<string | null>(null);
  const shared =
    reference.data.find((entry) => entry.selfAnalysisId === chosen) ??
    reference.data[0];
  if (shared === undefined) return null;
  return (
    <Stack gap="space-200">
      <Picker
        label={t("plans:item.memberPicker")}
        items={reference.data.map((entry) => ({
          id: entry.selfAnalysisId,
          label: entry.user.displayName,
        }))}
        value={shared.selfAnalysisId}
        onChange={(value) => setChosen(value)}
      />
      {shared.sections.map((section) => (
        <Stack key={section.key} gap="space-75">
          <Text variant="label">{section.title}</Text>
          <DescriptionList>
            {section.answers.map((answer) => (
              <DescriptionListItem
                key={answer.questionKey}
                label={answer.title}
              >
                <Stack gap="space-25">
                  {answer.amount !== null && (
                    <Text variant="number">
                      {formatMoney(answer.amount, shared.currency, {
                        cents: !Number.isInteger(answer.amount),
                      })}
                    </Text>
                  )}
                  {(answer.amount === null || hasText(answer.text)) && (
                    <Words text={answer.text} />
                  )}
                </Stack>
              </DescriptionListItem>
            ))}
          </DescriptionList>
        </Stack>
      ))}
    </Stack>
  );
}

/** A reference's content, in its kind's shape. */
function ReferenceBody({ reference }: { reference: PlanReference }) {
  const { t } = useTranslation(["plans", "common", "validation"]);
  const { me, workspace } = useWorkspace();
  const lines = (parts: [string, string | null][]) =>
    parts.flatMap(([label, value]) =>
      hasText(value)
        ? [
            <Text key={label} variant="body-sm">
              {t("plans:table.cell", { label, value })}
            </Text>,
          ]
        : [],
    );
  switch (reference.kind) {
    case "validation_answers":
      return (
        <DescriptionList>
          {reference.data.map((answer) => (
            <DescriptionListItem key={answer.questionKey} label={answer.title}>
              <Words text={answer.text} />
            </DescriptionListItem>
          ))}
        </DescriptionList>
      );
    case "competitors":
      return (
        <DescriptionList>
          {reference.data.map((competitor) => (
            <DescriptionListItem key={competitor.id} label={competitor.name}>
              <Stack gap="space-25">
                {lines([
                  [
                    t("validation:competitors.field.type"),
                    competitor.type === null
                      ? null
                      : t(`common:competitorType.${competitor.type}`),
                  ],
                  [
                    t("validation:competitors.field.typicalPrice"),
                    competitor.typicalPrice === null
                      ? null
                      : formatMoney(
                          competitor.typicalPrice,
                          workspace.currency,
                          {
                            cents: !Number.isInteger(competitor.typicalPrice),
                          },
                        ),
                  ],
                  [
                    t("validation:competitors.field.strength"),
                    competitor.strength,
                  ],
                  [
                    t("validation:competitors.field.weakness"),
                    competitor.weakness,
                  ],
                ])}
              </Stack>
            </DescriptionListItem>
          ))}
        </DescriptionList>
      );
    case "cost_rows":
      return (
        <DescriptionList>
          {reference.data.map((row) => (
            <DescriptionListItem
              key={row.id ?? `missing:${row.templateKey}`}
              label={
                hasText(row.name)
                  ? row.name
                  : // A key no validation template names: the key is all it has.
                    row.id === null
                    ? row.templateKey
                    : t("common:itemLabel.untitled")
              }
            >
              {row.id === null ? (
                <Text tone="secondary">{t("plans:item.notInValidation")}</Text>
              ) : (
                <Text variant="number">
                  {formatMetric(
                    `cost_row:${row.templateKey}`,
                    row.value,
                    workspace.currency,
                  )}
                </Text>
              )}
            </DescriptionListItem>
          ))}
        </DescriptionList>
      );
    case "research_log":
      return (
        <DescriptionList>
          {reference.data.map((entry) => (
            <DescriptionListItem
              key={entry.id}
              label={researchLogLabel(entry, me.timezone)}
            >
              <Words text={entry.observation} />
            </DescriptionListItem>
          ))}
        </DescriptionList>
      );
    case "decision_log":
    case "go_no_go_history":
      return <Decisions entries={reference.data} />;
    case "self_analysis":
      return <SelfAnalyses reference={reference} />;
    case "metrics":
      return (
        <DescriptionList>
          {reference.data.map((metric) => (
            <DescriptionListItem
              key={metric.key}
              label={t(`common:metric.${metric.key}` as never)}
            >
              <Text variant="number">
                {formatMetric(metric.key, metric.value, workspace.currency)}
              </Text>
            </DescriptionListItem>
          ))}
        </DescriptionList>
      );
    case "assumptions":
      return (
        <DescriptionList>
          {reference.data.map((assumption) => (
            <DescriptionListItem
              key={assumption.id}
              label={assumption.statement}
            >
              <Stack gap="space-25">
                {lines([
                  [
                    t("validation:assumptions.field.whyBelieve"),
                    assumption.whyBelieve,
                  ],
                  [t("validation:rows.evidence"), assumption.evidence],
                  [
                    t("validation:assumptions.field.confidence"),
                    assumption.confidence === null
                      ? null
                      : t(`common:confidence.${assumption.confidence}`),
                  ],
                  [
                    t("validation:assumptions.field.disproveCondition"),
                    assumption.disproveCondition,
                  ],
                ])}
              </Stack>
            </DescriptionListItem>
          ))}
        </DescriptionList>
      );
    case "risks":
      return (
        <DescriptionList>
          {reference.data.map((risk) => (
            <DescriptionListItem key={risk.id} label={risk.statement}>
              <Stack gap="space-25">
                {lines([
                  [
                    t("validation:assumptions.field.probability"),
                    risk.probability === null
                      ? null
                      : t(`common:confidence.${risk.probability}`),
                  ],
                  [
                    t("validation:assumptions.field.impact"),
                    risk.impact === null
                      ? null
                      : t(`common:confidence.${risk.impact}`),
                  ],
                  [
                    t("validation:assumptions.field.mitigation"),
                    risk.mitigation,
                  ],
                ])}
              </Stack>
            </DescriptionListItem>
          ))}
        </DescriptionList>
      );
    case "totals":
      // Left out by PlanReferences: §13's table sums its rows as they are typed instead.
      return null;
  }
}

/** Whether a reference has nothing to show (its list is empty). */
const isEmpty = (reference: PlanReference) =>
  Array.isArray(reference.data) && reference.data.length === 0;

/**
 * The screen with the whole of a reference: 11, 14–18 of the validation, or 7 with the
 * idea's decisions (Go / No-Go only for the history of §24). None for the self-analyses.
 */
function useReferenceLink(
  reference: PlanReference,
): { href: string; label: string } | null {
  const { t } = useTranslation(["plans"]);
  const { workspace } = useWorkspace();
  const { link } = reference;
  if (link === null) return null;
  if (link.screen === 7) {
    return {
      href: decisionsHref(workspace.id, {
        idea: link.ideaId,
        kind: reference.kind === "go_no_go_history" ? "go_no_go" : undefined,
      }),
      label: t("plans:item.openDecisionLog"),
    };
  }
  const href = hrefOf(link);
  return href === undefined
    ? null
    : { href, label: t("plans:item.openValidation") };
}

function Reference({ reference }: { reference: PlanReference }) {
  const { t } = useTranslation(["plans"]);
  const link = useReferenceLink(reference);
  return (
    <Disclosure title={reference.title} isQuiet headingLevel={3}>
      <Stack gap="space-200">
        {isEmpty(reference) ? (
          <Text tone="secondary" elementType="p">
            {t("plans:item.nothing")}
          </Text>
        ) : (
          <ReferenceBody reference={reference} />
        )}
        {link !== null && (
          <Flex>
            <Link href={link.href}>{link.label}</Link>
          </Flex>
        )}
      </Stack>
    </Disclosure>
  );
}

/**
 * An item's references, under its title (design-spec 6.12「参照（常に最新）」): each a
 * closed Disclosure with its content and a link to where the whole of it is. §13's
 * totals show under its table instead. Nothing while the item has none.
 */
export function PlanReferences({
  references,
  note,
}: {
  references: readonly PlanReference[];
  /** Under the references: what the item's own note says (§24's Go / No-Go). */
  note?: ReactNode;
}) {
  const { t } = useTranslation(["plans"]);
  const shown = references.filter((reference) => reference.kind !== "totals");
  if (shown.length === 0 && note === undefined) return null;
  return (
    <Stack gap="space-75">
      {shown.length > 0 && (
        <Flex gap="space-100" alignItems="baseline" wrap>
          <Text variant="label">{t("plans:item.references")}</Text>
          <Text variant="caption" tone="secondary">
            {t("plans:item.referencesAside")}
          </Text>
        </Flex>
      )}
      {shown.map((reference, index) => (
        <Reference
          // biome-ignore lint/suspicious/noArrayIndexKey: an item may list a kind twice (§15's two cost row references), and the template's order is fixed
          key={`${reference.kind}-${index}`}
          reference={reference}
        />
      ))}
      {note}
    </Stack>
  );
}
