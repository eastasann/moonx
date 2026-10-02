import type { MatchTarget, ReplyBlock } from "@moonx/domain";
import {
  Button,
  ComboBox,
  ComboBoxItem,
  Flex,
  IllustratedMessage,
  Radio,
  RadioGroup,
  RowList,
  RowListItem,
  Stack,
  StatusLight,
  Text,
} from "@moonx/ui-web";
import type { TFunction } from "i18next";
import { FileX } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type MatchChoices,
  type MatchOutcome,
  type MatchRow,
  pickableTargets,
} from "../../lib/ai-match";

const EXCERPT_CHARS = 120;

/** The first line of what a block says, so a person can tell the blocks apart. */
function excerpt(block: ReplyBlock, empty: string): string {
  const text = block.text ?? block.reason ?? (block.amount === null ? null : String(block.amount));
  if (!text) return empty;
  const line = text.replace(/\s+/g, " ");
  return line.length > EXCERPT_CHARS ? `${line.slice(0, EXCERPT_CHARS)}…` : line;
}

const STATE_KEYS = {
  matched: { light: "positive", label: "ai:import.match.matched" },
  unmatched: { light: "notice", label: "ai:import.match.unmatched" },
  not_importable: { light: "neutral", label: "ai:import.match.notImportable" },
  hidden: { light: "notice", label: "ai:import.match.hidden" },
  duplicate: { light: "notice", label: "ai:import.match.duplicate" },
  discarded: { light: "neutral", label: "ai:import.match.discarded" },
} as const;

export interface MatchStepProps {
  targets: readonly MatchTarget[];
  outcome: MatchOutcome;
  choices: MatchChoices;
  onChoices: (choices: MatchChoices) => void;
  onBackToPaste: () => void;
}

function blockName(t: TFunction, row: MatchRow, targets: readonly MatchTarget[]): string {
  const target = targets.find((q) => q.key === row.questionKey);
  if (target) return `[${target.key}] ${target.title}`;
  const written = row.block.id ?? row.block.heading;
  return written ? `[${written}]` : t("ai:import.match.unlabeled");
}

/**
 * The Match step (design-spec 6.7 ②): each pasted block with where it goes. Matched blocks can be
 * sent elsewhere, unmatched and hidden ones need a question or are discarded, duplicates ask which
 * block to use. Blocks that cannot be imported can only be discarded.
 */
export function MatchStep({ targets, outcome, choices, onChoices, onBackToPaste }: MatchStepProps) {
  const { t } = useTranslation("ai");
  const pickable = pickableTargets(targets);

  const discard = (...indexes: number[]) =>
    onChoices({ ...choices, discarded: new Set([...choices.discarded, ...indexes]) });
  const restore = (index: number) => {
    const discarded = new Set(choices.discarded);
    discarded.delete(index);
    onChoices({ ...choices, discarded });
  };
  const assign = (index: number, key: string | null) => {
    const assigned = { ...choices.assigned };
    if (key) assigned[index] = key;
    else delete assigned[index];
    onChoices({ ...choices, assigned });
  };

  const rows = (
    <Stack gap="space-200">
      <Text variant="label" as="span">
        {t("import.match.summary", { count: outcome.resolved.length })}
      </Text>
      <RowList aria-label={t("import.steps.match")}>
        {outcome.rows.map((row) => {
          const state = STATE_KEYS[row.state];
          const canPick = row.state !== "not_importable" && row.state !== "discarded";
          return (
            <RowListItem key={row.block.index}>
              <Stack gap="space-100">
                <Flex gap="space-200" align="center" justify="between" wrap>
                  <Flex gap="space-200" align="center" wrap>
                    <StatusLight variant={state.light} size="S">
                      {t(state.label)}
                    </StatusLight>
                    <Text variant="label" as="span">
                      {blockName(t, row, targets)}
                    </Text>
                  </Flex>
                  <Flex gap="space-100" align="center" wrap>
                    {canPick ? (
                      <ComboBox
                        label={t("import.match.choose")}
                        isLabelHidden
                        openLabel={t("import.match.chooseOpen")}
                        emptyMessage={t("import.match.chooseEmpty")}
                        placeholder={t("import.match.choose")}
                        size="S"
                        value={
                          pickable.some((q) => q.key === row.questionKey) ? row.questionKey : null
                        }
                        onChange={(key) => assign(row.block.index, key)}
                      >
                        {pickable.map((target) => (
                          <ComboBoxItem
                            key={target.key}
                            id={target.key}
                            textValue={`[${target.key}] ${target.title}`}
                          >
                            {`[${target.key}] ${target.title}`}
                          </ComboBoxItem>
                        ))}
                      </ComboBox>
                    ) : null}
                    {row.state === "discarded" ? (
                      <Button variant="secondary" size="S" onPress={() => restore(row.block.index)}>
                        {t("import.match.restore")}
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="S"
                        onPress={() =>
                          discard(...(row.group ?? [row.block]).map((block) => block.index))
                        }
                      >
                        {t("import.match.discard")}
                      </Button>
                    )}
                  </Flex>
                </Flex>
                {row.state === "duplicate" && row.group ? (
                  <RadioGroup
                    label={t("import.match.duplicate")}
                    value={String(row.usedIndex)}
                    onChange={(value) =>
                      onChoices({
                        ...choices,
                        chosen: { ...choices.chosen, [row.questionKey as string]: Number(value) },
                      })
                    }
                  >
                    {row.group.map((block) => (
                      <Radio key={block.index} value={String(block.index)}>
                        {`${t("import.match.use")}: ${excerpt(block, t("import.match.emptyBlock"))}`}
                      </Radio>
                    ))}
                  </RadioGroup>
                ) : (
                  <Text variant="body-sm" tone="secondary">
                    {excerpt(row.block, t("import.match.emptyBlock"))}
                  </Text>
                )}
                {row.state === "unmatched" || row.state === "hidden" ? (
                  <Text variant="caption" tone="secondary">
                    {t("import.match.unmatchedHint")}
                  </Text>
                ) : null}
              </Stack>
            </RowListItem>
          );
        })}
      </RowList>
    </Stack>
  );

  if (outcome.resolved.length > 0) return rows;
  return (
    <Stack gap="space-300">
      <IllustratedMessage
        icon={FileX}
        heading={t("import.match.nothing")}
        actions={<Button onPress={onBackToPaste}>{t("import.match.backToPaste")}</Button>}
      >
        {t("import.match.nothingBody")}
      </IllustratedMessage>
      {rows}
    </Stack>
  );
}
