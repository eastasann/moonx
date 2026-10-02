import { currencyOptions } from "@moonx/i18n";
import { Button, Dialog, InlineAlert, Picker, PickerItem, Stack, Text } from "@moonx/ui-web";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../../lib/error-text";
import { useSelfAnalysisActions } from "../../lib/self-analysis";

/** The currency of the amount questions (S1 PATCH). Amounts are not converted (design-spec 6.11). */
export function CurrencyDialog({ currency, onClose }: { currency: string; onClose: () => void }) {
  const { t } = useTranslation(["selfAnalysis", "app"]);
  const options = useMemo(currencyOptions, []);
  const [value, setValue] = useState(currency);
  const { currency: update } = useSelfAnalysisActions();
  return (
    <Dialog
      isOpen
      isDismissable
      isKeyboardDismissDisabled={update.isPending}
      size="small"
      title={t("selfAnalysis:currency.title")}
      closeLabel={t("app:close")}
      onOpenChange={(open) => !open && onClose()}
      actions={
        <>
          <Button variant="secondary" onPress={onClose}>
            {t("selfAnalysis:currency.cancel")}
          </Button>
          <Button
            variant="accent"
            isDisabled={value === currency}
            isPending={update.isPending}
            pendingLabel={t("app:saving")}
            onPress={() => update.mutate(value, { onSuccess: onClose })}
          >
            {t("selfAnalysis:currency.save")}
          </Button>
        </>
      }
    >
      <Stack gap="space-200">
        {update.error ? (
          <InlineAlert variant="negative" heading={t("selfAnalysis:currency.saveFailed")}>
            {errorText(t, update.error)}
          </InlineAlert>
        ) : null}
        <Picker
          label={t("selfAnalysis:currency.label")}
          value={value}
          onChange={(next) => next && setValue(next)}
        >
          {options.map((option) => (
            <PickerItem key={option.code} id={option.code}>
              {option.label}
            </PickerItem>
          ))}
        </Picker>
        <Text variant="caption" tone="secondary">
          {t("selfAnalysis:currency.help")}
        </Text>
      </Stack>
    </Dialog>
  );
}
