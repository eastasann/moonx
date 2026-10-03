import { percentOfPriceAmount } from "@moonx/domain";
import {
  formatInputPercent,
  formatMoney,
  moneyInputFormat,
  PERCENT_INPUT_FORMAT,
} from "@moonx/i18n";
import type { CostItem } from "@moonx/schemas";
import {
  Badge,
  Flex,
  Link,
  NumberField,
  Picker,
  PickerItem,
  SegmentedControl,
  SegmentedControlItem,
  Stack,
  Text,
  TextArea,
  TextField,
} from "@moonx/ui-web";
import { useTranslation } from "react-i18next";
import { FauControl, FauStatus } from "../../components/FauControl";
import { CAN_REDUCE_KEYS, type CostDraft, draftValue } from "../../lib/costs";
import type { RowApi } from "./CostRowController";

/** What one row's fields need from the screen. */
export interface RowView {
  item: CostItem;
  draft: CostDraft;
  api: RowApi;
  /** A Viewer, or an idea that is archived: the fields are text. */
  isReadOnly: boolean;
  currency: string;
  /** The selling price from 18, which a percent-of-price row needs. */
  price: number | null;
  /** Where "Needs price" leads. */
  economicsPath: string;
}

export interface FieldOptions {
  /** The label is for assistive technology only, because a column heading names the cell. */
  isLabelHidden?: boolean;
  /** Puts the cursor in the field when it appears (the name of a row that was just added). */
  autoFocus?: boolean;
}

/** The row's name as assistive technology reads it, even while it is empty. */
export function useRowName(draft: CostDraft): string {
  const { t } = useTranslation("costs");
  return draft.name.trim() || t("unnamed");
}

function Dash() {
  const { t } = useTranslation("costs");
  return (
    <Text as="span" tone="secondary">
      {t("none")}
    </Text>
  );
}

export function NameField({ view, isLabelHidden, autoFocus }: { view: RowView } & FieldOptions) {
  const { t } = useTranslation(["costs", "form"]);
  const { draft, api, item, isReadOnly } = view;
  const name = useRowName(draft);
  const marks = (
    <>
      {draft.isLumpSum ? (
        <Badge size="S" variant="neutral">
          {t("costs:badge.lumpSum")}
        </Badge>
      ) : null}
      {item.commentCount > 0 ? (
        <Badge size="S" variant="informative">
          {t("form:commentCount", { count: item.commentCount })}
        </Badge>
      ) : null}
    </>
  );
  if (isReadOnly) {
    return (
      <Flex gap="space-100" align="center" wrap>
        <Text as="span">{draft.name}</Text>
        {marks}
      </Flex>
    );
  }
  return (
    <Stack gap="space-50" align="start">
      <TextField
        label={t("costs:fields.name", { name })}
        isLabelHidden={isLabelHidden}
        autoFocus={autoFocus}
        value={draft.name}
        maxLength={200}
        isInvalid={draft.problems.name !== undefined}
        errorMessage={t("costs:errors.required")}
        onChange={api.setName}
        onBlur={() => void api.flush()}
      />
      <Flex gap="space-100" align="center" wrap>
        {marks}
      </Flex>
    </Stack>
  );
}

/** "35% · ₱77.00" for a percent-of-price row, and "Needs price" with a link while 18 has no price. */
function PercentNote({ view }: { view: RowView }) {
  const { t } = useTranslation("costs");
  const { draft, price, currency, economicsPath } = view;
  if (draft.percent === null) return null;
  const amount = percentOfPriceAmount(draft.percent, price);
  const percent = formatInputPercent(draft.percent);
  if (amount === null) {
    return (
      <Flex gap="space-50" align="center" wrap>
        <Text as="span" variant="caption" tone="secondary">
          {t("percentPrefix", { percent })}
        </Text>
        <Link href={economicsPath}>{t("needsPrice")}</Link>
      </Flex>
    );
  }
  return (
    <Text variant="caption" tone="secondary">
      {t("percentOfPrice", { percent, amount: formatMoney(amount, currency, { decimals: 2 }) })}
    </Text>
  );
}

function ReadOnlyAmount({ view }: { view: RowView }) {
  const { t } = useTranslation(["costs", "validation"]);
  const { draft, currency } = view;
  const value = draftValue(draft);
  if (value === null) {
    return (
      <Text as="span" tone="secondary">
        {draft.classification.state === "unknown"
          ? t("validation:fau.state.unknown")
          : t("costs:empty")}
      </Text>
    );
  }
  return draft.inputMode === "percent_of_price" ? (
    <PercentNote view={view} />
  ) : (
    <Text as="span">{formatMoney(value, currency)}</Text>
  );
}

/** The amount, or for a variable row the choice between an amount and a percent of the price. */
export function AmountField({ view, isLabelHidden }: { view: RowView } & FieldOptions) {
  const { t } = useTranslation(["costs", "validation"]);
  const { draft, api, item, currency, isReadOnly } = view;
  const name = useRowName(draft);
  if (isReadOnly) return <ReadOnlyAmount view={view} />;
  const percent = draft.inputMode === "percent_of_price";
  const placeholder =
    draft.classification.state === "unknown" ? t("validation:fau.state.unknown") : t("costs:empty");
  return (
    <Stack gap="space-50">
      {item.category === "variable" ? (
        <SegmentedControl
          size="S"
          aria-label={t("costs:fields.mode", { name })}
          value={draft.inputMode}
          onChange={(mode) => api.setMode(mode as CostItem["inputMode"])}
        >
          <SegmentedControlItem value="amount">{t("costs:mode.amount")}</SegmentedControlItem>
          <SegmentedControlItem value="percent_of_price">
            {t("costs:mode.percent")}
          </SegmentedControlItem>
        </SegmentedControl>
      ) : null}
      {percent ? (
        <NumberField
          key={`${item.id}:${draft.revision}:percent`}
          label={t("costs:fields.percent", { name })}
          isLabelHidden={isLabelHidden}
          defaultValue={draft.percent ?? Number.NaN}
          formatOptions={PERCENT_INPUT_FORMAT}
          placeholder={placeholder}
          isInvalid={draft.problems.percent !== undefined}
          errorMessage={t("costs:errors.percentRange")}
          onInputChange={api.setPercentText}
          onBlur={() => void api.flush()}
        />
      ) : (
        <NumberField
          key={`${item.id}:${draft.revision}:amount`}
          label={t("costs:fields.amount", { name })}
          isLabelHidden={isLabelHidden}
          defaultValue={draft.amount ?? Number.NaN}
          formatOptions={moneyInputFormat(currency)}
          placeholder={placeholder}
          isInvalid={draft.problems.amount !== undefined}
          errorMessage={t("costs:errors.amountRange")}
          onInputChange={api.setAmountText}
          onBlur={() => void api.flush()}
        />
      )}
      {percent ? <PercentNote view={view} /> : null}
    </Stack>
  );
}

/** The F/A/U label and, for an editor, its three buttons and the evidence sheet's entry. */
export function FauField({ view }: { view: RowView }) {
  const { draft, api, isReadOnly } = view;
  const name = useRowName(draft);
  return (
    <Stack gap="space-50">
      <FauStatus classification={draft.classification} />
      {isReadOnly ? null : (
        <FauControl
          label={name}
          classification={draft.classification}
          hasValue={draftValue(draft) !== null}
          confirmUnknown
          onChange={api.choose}
          onOpenEvidence={api.openEvidence}
        />
      )}
    </Stack>
  );
}

export function WhyNeededField({ view, isLabelHidden }: { view: RowView } & FieldOptions) {
  const { t } = useTranslation("costs");
  const { draft, api, isReadOnly } = view;
  const name = useRowName(draft);
  if (isReadOnly)
    return draft.whyNeeded ? <Text variant="body-sm">{draft.whyNeeded}</Text> : <Dash />;
  return (
    <TextArea
      label={t("fields.whyNeeded", { name })}
      isLabelHidden={isLabelHidden}
      value={draft.whyNeeded}
      maxLength={20_000}
      onChange={api.setWhyNeeded}
      onBlur={() => void api.flush()}
    />
  );
}

export function NotesField({ view, isLabelHidden }: { view: RowView } & FieldOptions) {
  const { t } = useTranslation("costs");
  const { draft, api, isReadOnly } = view;
  const name = useRowName(draft);
  if (isReadOnly) return draft.notes ? <Text variant="body-sm">{draft.notes}</Text> : <Dash />;
  return (
    <TextArea
      label={t("fields.notes", { name })}
      isLabelHidden={isLabelHidden}
      value={draft.notes}
      maxLength={20_000}
      onChange={api.setNotes}
      onBlur={() => void api.flush()}
    />
  );
}

export function CanReduceField({ view, isLabelHidden }: { view: RowView } & FieldOptions) {
  const { t } = useTranslation("costs");
  const { draft, api, isReadOnly } = view;
  const name = useRowName(draft);
  if (isReadOnly) {
    return draft.canReduce ? (
      <Text as="span">{t(CAN_REDUCE_KEYS[draft.canReduce])}</Text>
    ) : (
      <Dash />
    );
  }
  return (
    <Picker
      label={t("fields.canReduce", { name })}
      isLabelHidden={isLabelHidden}
      placeholder={t("canReduce.placeholder")}
      value={draft.canReduce}
      onChange={(value) => api.setCanReduce(value as CostItem["canReduce"])}
    >
      <PickerItem id="yes">{t("canReduce.yes")}</PickerItem>
      <PickerItem id="partly">{t("canReduce.partly")}</PickerItem>
      <PickerItem id="no">{t("canReduce.no")}</PickerItem>
    </Picker>
  );
}
